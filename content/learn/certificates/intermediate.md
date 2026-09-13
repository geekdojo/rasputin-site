---
lesson: certificates.intermediate
---

## What you need

- **The beginner lesson,** [Why a browser warns about a private certificate authority](https://rasputin.geekdojo.com/learn/certificates/beginner/).
  It covers certificates, certificate authorities, trust stores and `openssl verify -CAfile`.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15 with its built-in `openssl` (LibreSSL 3.3.6) and
  with OpenSSL 3.6.3, and on Debian 13 with OpenSSL 3.5.7. Other Linux distributions and Windows
  were not tested.
- **`openssl`**, plus `sh`, `cd`, `mkdir`, `cp`, `cat`, `printf` and `rm`. Type `openssl version`
  and press Return. Every Mac has it, as LibreSSL. Most Linux systems have it; if not, install
  the package `openssl`, which needs administrator rights. Nothing else needs them.

Nothing in the lab changes what your computer trusts. You do not need Rasputin hardware,
Rasputin code, or an account anywhere.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-os) runs a small group of computers at home, a
cluster. Two jobs in it need a certificate authority (CA).

The first is HTTPS. Each cluster has its own name on your home network and no public domain, so no
public CA will vouch for it. Something has to sign a certificate for that name, and every device
you use has to trust whatever signed it.

The second is updates. A computer running Rasputin's operating system installs a new version only
if the release is signed by Geekdojo, the company that makes Rasputin. It checks that the signing
certificate chains to a root it already carries.

One CA could do both jobs. Rasputin uses two.

## The decision, and what lost

Each cluster makes its own CA the first time it powers on, and issues certificates from it for
the cluster's own names. Operators install that CA on their own devices. Geekdojo holds a
separate code-signing root, with signing certificates beneath it, and that root ships inside the
operating system image. Nobody installs it on a laptop or a phone.

The reason is recorded in a public code comment in
[`tls.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/tls.go):
mixing the two *"would either leak the cross-fleet intermediate onto every customer's box, or make
operators trust Rasputin-Inc keys to verify their own Rasputin — both wrong."* An intermediate is
a CA that the root signed, so certificates it signs chain to the root too. "Rasputin-Inc" is the
record's name for the vendor.

The certificates design, an internal record, rejects three options and notes a fourth in passing:

| Alternative | Why it lost |
|---|---|
| One CA for HTTPS and for signing | Either every cluster holds a signing key, which the record calls a *"compromise-amplifier"*, or every operator trusts the vendor's keys to vouch for their own cluster, a *"wrong trust model"*. |
| A vendor-run CA for HTTPS only | It *"would have to ship its private key onto every controlplane, making one customer compromise a fleet-wide trust break."* |
| A public CA | Not weighed. It needs a public domain, and the record keeps *"no public-domain requirement"*. |
| Three CAs per cluster, one per service | It *"would multiply operator action without adding meaningful security — they're all on the same controlplane anyway."* |

## What it cost

**Every device, once per cluster.** A CA each cluster makes for itself is one no device already
trusts. The manual says installing it is *"strictly per device"*: your laptop does nothing for your
phone, and a browser that keeps its own certificate store needs its own step. A vendor-run CA
could have been installed once for every cluster, and that is exactly the reach the decision
refuses to give it.

**Two trust locations that start out unconnected.** The signing root is baked into a read-only
system image. The cluster's CA key is created on first boot, so it must live somewhere writable.
The record notes that until a fix, the two were never joined, and the setup check that looks
for the signing root showed amber on every factory image. The record describes that fix; it does
not list the incident as a cost of having two CAs. That link is this lesson's.

**Two things called a certificate authority.** The manual's update page stops to say the signing
root *"is not the cluster's own certificate authority, the one you install on a browser or a mesh
device."* The record does not name the confusion as a cost; the manual's sentence suggests it.

## What Rasputin does not do here

You never install the code-signing root; if it is missing, the manual's remedy is to re-flash the
image. The cluster's own CA is not used to check an update's signature.

## Try it

You will build both designs in a sandbox: first one CA doing both jobs, then two. A "home" is a
folder standing in for one cluster. "Trusting" a CA means passing its file to `openssl verify
-CAfile`, for one command only.

**1. Make a sandbox.**

```
mkdir two-cas
cd two-cas
```

**2. Write three small scripts.** Paste each block whole.

```
cat > ca.sh <<'EOF'
mkdir -p "$1"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout "$1/ca.key" -out "$1/ca.pem" -days 30 -subj "/CN=$2" 2>/dev/null
echo "$1 holds a CA named $2"
EOF
```

```
cat > issue.sh <<'EOF'
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout "$3.key" -out "$3.csr" -subj "/CN=$2" 2>/dev/null
printf 'subjectAltName=DNS:%s\n' "$2" > "$3.ext"
openssl x509 -req -sha256 -in "$3.csr" -CA "$1/ca.pem" -CAkey "$1/ca.key" -CAcreateserial -days 7 -extfile "$3.ext" -out "$3.pem" 2>/dev/null
echo "$1 signed $3.pem for $2"
EOF
```

```
cat > trusts.sh <<'EOF'
if openssl verify -CAfile "$1" "$2" > /dev/null 2>&1; then
  echo "trusting $1: $2 accepted"
else
  echo "trusting $1: $2 refused"
fi
EOF
```

`ca.sh <folder> <name>` makes a CA in a folder, with the same `openssl` command as the beginner
lesson. `issue.sh <folder> <name> <file>` has that folder's CA sign a certificate for a name.
`trusts.sh <ca file> <certificate>` checks a certificate against one CA. `2>/dev/null` hides the
progress lines `openssl` prints, which differ between LibreSSL and OpenSSL 3; it also hides
errors, so if a step prints nothing unexpected, check your typing.

**3. One CA for everything.** The vendor makes a CA and signs its release signer. The name
`updates.vendor.test` is only a label here.

```
sh ca.sh vendor "Vendor CA"
sh issue.sh vendor updates.vendor.test release
```

A home needs an HTTPS certificate for its own name, so it gets a copy of the vendor's CA:

```
mkdir home-a
cp vendor/ca.key vendor/ca.pem home-a/
sh issue.sh home-a a.home.test a-site
sh trusts.sh vendor/ca.pem a-site.pem
```

```
vendor holds a CA named Vendor CA
vendor signed release.pem for updates.vendor.test
home-a signed a-site.pem for a.home.test
trusting vendor/ca.pem: a-site.pem accepted
```

To accept its own home's site, a laptop has to trust the vendor's CA.

**4. Sign a release from the home.** Predict: a machine that installs whatever chains to the
vendor's CA. Will it take a signer made in home A?

```
sh issue.sh home-a updates.vendor.test copied-release
sh trusts.sh vendor/ca.pem copied-release.pem
openssl x509 -in release.pem -noout -issuer
openssl x509 -in copied-release.pem -noout -issuer
```

```
home-a signed copied-release.pem for updates.vendor.test
trusting vendor/ca.pem: copied-release.pem accepted
issuer=CN=Vendor CA
issuer=CN=Vendor CA
```

LibreSSL writes `issuer= /CN=Vendor CA`. The certificate made in one home is accepted, and its
issuer line matches the real one. Every home holding the copy holds that power, so one home's
key is enough to sign for every machine. That is the amplifier.

**5. Two CAs.** Remove home A's copy, and give each home a CA of its own:

```
rm -r home-a
sh ca.sh home-a "Home A CA"
sh ca.sh home-b "Home B CA"
sh issue.sh home-a updates.vendor.test copied-release
sh trusts.sh vendor/ca.pem copied-release.pem
sh trusts.sh vendor/ca.pem release.pem
```

`rm -r` deletes a folder and what is in it.

```
home-a holds a CA named Home A CA
home-b holds a CA named Home B CA
home-a signed copied-release.pem for updates.vendor.test
trusting vendor/ca.pem: copied-release.pem refused
trusting vendor/ca.pem: release.pem accepted
```

Without the vendor's key, the same name is refused. The only release signer that chains to the
vendor's CA is the one the vendor made.

**6. Each home's sites.**

```
sh issue.sh home-a a.home.test a-site
sh issue.sh home-b b.home.test b-site
sh trusts.sh home-a/ca.pem a-site.pem
sh trusts.sh vendor/ca.pem a-site.pem
```

```
home-a signed a-site.pem for a.home.test
home-b signed b-site.pem for b.home.test
trusting home-a/ca.pem: a-site.pem accepted
trusting vendor/ca.pem: a-site.pem refused
```

The laptop trusts home A's own CA, and the vendor's CA does not vouch for home A's site.

**7. The cost.** A laptop that trusts only home A's CA visits home B. Predict, then run:

```
sh trusts.sh home-a/ca.pem b-site.pem
sh trusts.sh home-b/ca.pem b-site.pem
```

```
trusting home-a/ca.pem: b-site.pem refused
trusting home-b/ca.pem: b-site.pem accepted
```

Home B's site is genuine and still refused until the laptop is given home B's CA. With a CA per
cluster, that step is repeated for each cluster on each device.

**8. Clean up.**

```
cd ..
rm -rf two-cas
```

`-f` skips the questions. It cannot be undone, so check you typed `two-cas`.

## Check yourself

1. In step 4, what did home A need to sign a release signer the machine accepted?
2. What breaks if a vendor-run HTTPS CA's private key is copied onto every cluster, and one cluster
   is compromised?
3. Why does a CA per cluster mean more work for the operator than one vendor CA would?
4. You make a network appliance that signs its own updates and serves a web page. A customer asks
   you to reuse your update key for HTTPS "to keep it simple". What do you tell them?

### Answers

1. Only a copy of the CA key. The name and the issuer line were the same as the real signer's.
2. Whoever holds that key can sign certificates that devices at every cluster accept, not just at
   the one compromised.
3. Each cluster's CA is new to every device, so each device is given it once per cluster. A vendor
   CA could be installed once, which is the reach the decision refuses to give it.
4. That the update key would then sit on every appliance, where one compromised unit could sign
   updates for all of them, and that customers would have to trust your key to reach their own
   device.

## Where to go next

- **Installing a cluster's CA:** [Get in the first time](https://rasputin.geekdojo.com/docs/get-in-the-first-time/#what-installing-the-certificate-actually-establishes),
  in Rasputin's manual.
- **The signing root:** [Signing and the trust root](https://rasputin.geekdojo.com/docs/roll-out-an-update/#signing-and-the-trust-root).
- **Signatures by hand:** [What a signature proves that a checksum does not](https://rasputin.geekdojo.com/learn/signing/beginner/).
- **The code:** the cluster's CA in
  [`tls.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/tls.go).
