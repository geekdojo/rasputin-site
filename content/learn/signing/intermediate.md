---
lesson: signing.intermediate
---

## What you need

- **The beginner lesson,** [What a signature proves that a checksum does not](https://rasputin.geekdojo.com/learn/signing/beginner/).
  It covers key pairs, signing a file and verifying it with `openssl`.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15 with its built-in `openssl` (LibreSSL 3.3.6) and
  with OpenSSL 3.6.3, and on Debian 13 with OpenSSL 3.5.7, with the same output on all three.
  Other Linux distributions and Windows were not tested.
- **`openssl`**, plus `sh`, `cd`, `mkdir`, `cat`, `printf`, `grep` and `rm`. Type `openssl version`
  and press Return. Every Mac has it, as LibreSSL. Most Linux systems have it; if not, install
  the package `openssl`, which needs administrator rights. Nothing else needs them.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

A **signing hierarchy** is a chain of certificates used to sign software. At the top is a
**root**, which every machine carries. Below it, an **intermediate**: a CA the root signed. Below
that, **leaves**: the certificates whose keys actually sign releases. A machine accepts a release
when the leaf that signed it chains up to the root.

[Rasputin](https://github.com/geekdojo/rasputin-os) runs a small group of computers at home. Its
machines carry one root, and its release signatures embed the leaf and the intermediate, so the
root alone completes the check. The records describe that shape; none of them argues for it or
weighs another.

Then a second thing needed signing. The app catalog, the list of apps a cluster can install,
moved out of the software into its own repository, built by its own pipeline. Whatever key signs
the catalog lives in that pipeline.

## The decision, and what lost

The catalog got its own leaf under the same intermediate, and that leaf carries a **purpose**. A
certificate can list what its key may be used for, in a field called **extended key usage**. Each
purpose is an **object identifier** (OID), a dotted string of numbers naming something in a
certificate. Rasputin defines two: a release purpose and a catalog purpose.

The decision record, ADR-0006, gives the goal: *"a compromise of catalog-signing CI must not imply
the ability to sign"* a system update. CI (continuous integration) is the pipeline that builds and
signs. The manual states what a cluster checks before it loads a catalog: *"that the signing
certificate chains to the cluster's trust root, and that it carries Rasputin's catalog-signing
purpose."* A code comment in
[`eku.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/artifactsig/eku.go)
states the other half: a leaf carrying only the catalog purpose *"must never satisfy"* the update
path.

| Alternative | Why it lost |
|---|---|
| Sign the catalog with the release leaf | The catalog's pipeline would hold a key that signs system updates. |
| A separate leaf, verifiers unchanged | This was the decision as first accepted. An amendment to the record found that the check looked only at the chain, so the new leaf was *"cryptographically equivalent to the release leaf"*. |
| A separate root for the catalog | The amendment calls it one that *"would also work and is arguably stronger"*, and rejects the *"permanent human overhead for a property an enforced check already delivers"*: a second root to create, ship and look after. |

## What it cost

**The separation lives in every verifier.** The decision as first accepted, in the amendment's
words, *"asserted a property the system does not have."* An automated security review of a code
change found that before any catalog leaf existed. The amendment also fixed the order of the
work: the check changes first, because *"minting first leaves a window in which the catalog key
is a universal signing key."*

**A number nobody else uses.** A purpose needs an OID. The code comment records two dead ends. The
UUID branch, `2.25`, needs no registration, but Go's usual OID type cannot hold a number that large.
Inventing a plausible number *"is squatting on whoever holds it."* Geekdojo waited for a registered
number from IANA, the body that assigns them.

**One root still holds both.** A leaf's purpose is inside a certificate the intermediate signed,
so *"a holder of the catalog leaf's private key cannot grant themselves the release purpose
without the intermediate key."* Both purposes therefore rest on that one intermediate key. The
record does not say why a separate root is stronger; plausibly, it would not share that key.

## What Rasputin does not do here

A catalog you sign yourself is refused. The manual says running your own means *"running your own
signing chain and installing your own trust root on the node"*, and calls that *"a PKI project"*.

## Try it

You will build a root and an intermediate, then try three designs: one leaf, two unmarked leaves,
and two marked leaves.

**1. Make a sandbox, a root and an intermediate.**

```
mkdir purpose-lab
cd purpose-lab
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout root.key -out root.pem -days 30 -subj "/CN=Lab Root" 2>/dev/null
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout mid.key -out mid.csr -subj "/CN=Lab Intermediate" 2>/dev/null
printf 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n' > mid.ext
openssl x509 -req -sha256 -in mid.csr -CA root.pem -CAkey root.key -CAcreateserial -days 30 -extfile mid.ext -out mid.pem 2>/dev/null
```

The first `openssl` line makes a root that signs itself; the second, a key and signing request
for the intermediate. `mid.ext` makes it a CA (`CA:TRUE`) allowed to sign certificates
(`keyCertSign`), and the last line has the root sign it. `2>/dev/null` hides progress lines, which
differ between LibreSSL and OpenSSL 3, and errors too: if a later step fails, check your typing.

**2. Write a script that makes leaves.**

```
cat > leaf.sh <<'EOF'
case $2 in
  any)     mark=codeSigning ;;
  release) mark=2.25.7751002667111313490255348551610639636 ;;
  catalog) mark=2.25.103120496973671545358755251608534931499 ;;
esac
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout "$1.key" -out "$1.csr" -subj "/CN=$1" 2>/dev/null
printf 'basicConstraints=critical,CA:FALSE\nextendedKeyUsage=%s\n' "$mark" > "$1.ext"
openssl x509 -req -sha256 -in "$1.csr" -CA mid.pem -CAkey mid.key -CAcreateserial -days 7 -extfile "$1.ext" -out "$1.pem" 2>/dev/null
echo "made $1, marked $2"
EOF
```

`sh leaf.sh <name> <mark>` has the intermediate sign a leaf. `any` is the standard, generic
code-signing mark. `release` and `catalog` are purposes under `2.25`, made from random UUIDs; fine
in a sandbox, where nothing escapes. `CA:FALSE` means a leaf cannot sign certificates.

**3. Write the verifier.**

```
cat > install.sh <<'EOF'
file=$1
signer=$2
need=$3
if ! openssl verify -CAfile root.pem -untrusted mid.pem "$signer.pem" > /dev/null 2>&1; then
  echo "$file: refused, $signer does not chain to the root"
  exit
fi
openssl x509 -in "$signer.pem" -pubkey -noout > signer.pub
if ! openssl dgst -sha256 -verify signer.pub -signature "$file.sig" "$file" > /dev/null 2>&1; then
  echo "$file: refused, bad signature"
  exit
fi
case $need in
  release) mark=2.25.7751002667111313490255348551610639636 ;;
  catalog) mark=2.25.103120496973671545358755251608534931499 ;;
  *) echo "$file: installed, signed by $signer"; exit ;;
esac
if openssl x509 -in "$signer.pem" -noout -text | grep -q "$mark"; then
  echo "$file: installed, $signer is marked $need"
else
  echo "$file: refused, $signer is not marked $need"
fi
EOF
```

`sh install.sh <file> <signer> [purpose]` checks in order. `verify -untrusted mid.pem` builds the
chain through the intermediate to `root.pem`. `x509 -pubkey` extracts the leaf's public key for
`dgst -verify`. Given a purpose, `grep -q` looks for it in the certificate's text.

**4. One leaf for everything.**

```
printf 'system image v2\n' > system.img
printf 'app list v7\n' > apps.json
sh leaf.sh one any
openssl dgst -sha256 -sign one.key -out system.img.sig system.img
openssl dgst -sha256 -sign one.key -out apps.json.sig apps.json
sh install.sh system.img one
sh install.sh apps.json one
```

```
made one, marked any
system.img: installed, signed by one
apps.json: installed, signed by one
```

It works. The catalog's pipeline now holds the key that signs system images.

**5. Two leaves, same verifier.** Predict: the catalog's own leaf signs a system image. Installed
or refused?

```
sh leaf.sh release-leaf any
sh leaf.sh catalog-leaf any
openssl dgst -sha256 -sign catalog-leaf.key -out system.img.sig system.img
sh install.sh system.img catalog-leaf
```

```
made release-leaf, marked any
made catalog-leaf, marked any
system.img: installed, signed by catalog-leaf
```

Installed. Two keys, one power. This is the design the amendment corrected.

**6. Mark the purposes, and check them.** Running the script again replaces both leaves, with
new keys.

```
sh leaf.sh release-leaf release
sh leaf.sh catalog-leaf catalog
openssl dgst -sha256 -sign catalog-leaf.key -out system.img.sig system.img
sh install.sh system.img catalog-leaf release
openssl dgst -sha256 -sign release-leaf.key -out system.img.sig system.img
sh install.sh system.img release-leaf release
```

```
made release-leaf, marked release
made catalog-leaf, marked catalog
system.img: refused, catalog-leaf is not marked release
system.img: installed, release-leaf is marked release
```

The catalog leaf chains to the root and its signature is good. It is refused only because it is
not marked for this job.

**7. Forget to ask.** Sign with the catalog leaf again, and leave the purpose off:

```
openssl dgst -sha256 -sign catalog-leaf.key -out system.img.sig system.img
sh install.sh system.img catalog-leaf
```

```
system.img: installed, signed by catalog-leaf
```

The mark is still in the certificate, and nothing read it. That is the first cost above: the
separation exists only in a verifier that checks.

**8. Clean up.**

```
cd ..
rm -rf purpose-lab
```

`rm -rf` deletes the folder and everything in it, keys included. It cannot be undone, so check
you typed `purpose-lab`.

## Check yourself

1. In step 5, the catalog leaf was a different key from the release leaf. Why was the system image
   still installed?
2. What breaks if the catalog leaf is created, and handed to its pipeline, before the verifiers
   check purposes?
3. Why can the holder of the catalog leaf's key not simply add the release purpose to it?
4. You sign both firmware and plug-ins for a product. You rule out one shared leaf. What does each
   remaining option, marked purposes or a separate root, cost you?

### Answers

1. The verifier asked only whether the signer chained to the root, and both leaves did.
2. For that window, the catalog key signs anything any machine accepts, which the record calls a
   universal signing key.
3. The purpose is inside the certificate, which the intermediate signed. Changing it breaks that
   signature, and only the intermediate's key can sign a new one.
4. Marked purposes cost a purpose check in every verifier, in place before the second leaf exists,
   and both purposes still rest on one intermediate key. A separate root costs a second root on
   every machine, and someone to look after it for as long as the product ships.

## Where to go next

- **The catalog's signature check:** [Running your own catalog](https://rasputin.geekdojo.com/docs/install-an-app/#running-your-own-catalog),
  in Rasputin's manual.
- **What a release signature protects:** [Signing and the trust root](https://rasputin.geekdojo.com/docs/roll-out-an-update/#signing-and-the-trust-root).
- **Two kinds of certificate authority:** [Why a browser warns about a private certificate authority](https://rasputin.geekdojo.com/learn/certificates/beginner/).
- **The code:** the purposes and their history in
  [`eku.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/artifactsig/eku.go).
