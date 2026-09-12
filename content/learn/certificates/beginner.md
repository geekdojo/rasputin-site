---
lesson: certificates.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS with its built-in `openssl` (LibreSSL 3.3.6)
  and with OpenSSL 3.6.3, and on Debian 13 with OpenSSL 3.5.6. It was not tested on other Linux
  distributions or on Windows.
- **`openssl`**, a tool that makes and checks keys and certificates. Type `openssl version` and
  press Return. If you see a version number, you have it. Every Mac has it, as
  `LibreSSL`, a separate project that accepts these commands. Most Linux systems have it; if
  not, install the package `openssl`, which needs administrator rights.

The lab needs no administrator rights, and nothing in it changes what your computer trusts. You
do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

**HTTPS**, the `https` in a web address, **encrypts** a connection so only the two ends can read
it. That does not tell you *who* is on the other end. For that, the site presents a
**certificate**: a small file that says "this public key belongs to this name".

A **key pair** is two linked keys. The **private key** stays secret with its owner. The **public
key** can be shared. **Signing** uses the private key to make a **signature** over some data;
anyone with the public key can check that this key signed exactly that data.

Anyone can write a certificate, so what matters is who signed it. A **certificate authority**
(CA) is an issuer, in practice a certificate and its private key, whose job is signing other
certificates. At the top sits a **root** certificate, which signs itself. A root is believed
only because it is on a list.

That list is a **trust store**: the CAs your operating system or browser accepts. It holds more
than a hundred public CAs, which check that a site controls its name before signing. If a site's
certificate traces back to one of them, the browser shows the page; if not, it warns.

A **private CA**, such as one a device makes for itself, is not on the list. Its certificates can
be well formed and still get a warning. Adding the CA to a device's trust store
stops the warning, usually needs administrator rights, and makes that device accept anything the
CA signs.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. It has no public domain name, so no public CA can vouch for it.
[Its manual](https://rasputin.geekdojo.com/docs/get-in-the-first-time/#what-installing-the-certificate-actually-establishes)
explains that *"the cluster mints its own certificate authority the first time it powers on"*,
and issues itself a certificate for its own name. Each device's browser warns until that CA is
installed on that device.

## Try it

You will make your own CA, sign a certificate for a made-up site, and check who signed it.

**1. Make a sandbox.**

```
mkdir cert-lab
cd cert-lab
```

`mkdir` makes a new, empty folder; `cd` moves you into it.

**2. Make a CA.** This is one long line:

```
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ca.key -out ca.pem -days 30 -subj "/CN=My Lab CA"
```

`req -x509` makes a certificate that signs itself. `-newkey ec -pkeyopt ec_paramgen_curve:P-256`
makes a key pair of a common modern type. `-nodes` leaves the private key without a
passphrase: fine in a sandbox only. `-keyout` and `-out` name the key and certificate files.
`-days 30` is how long it stays valid. `-subj` sets its name (CN, "common name"). OpenSSL 3
prints `-----`. LibreSSL prints:

```
Generating a 2048 bit EC private key
writing new private key to 'ca.key'
-----
```

Ignore "2048 bit": the key is the type you asked for.

**3. Look at it.**

```
openssl x509 -in ca.pem -noout -subject -issuer
```

```
subject=CN=My Lab CA
issuer=CN=My Lab CA
```

The **subject** is who the certificate is about; the **issuer** is who signed it. They match: a
root signs itself. LibreSSL adds a space and a slash to both: `subject= /CN=My Lab CA`.

**4. Make a certificate for a site.** Three commands:

```
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout site.key -out site.csr -subj "/CN=shop.test"
printf 'subjectAltName=DNS:shop.test\n' > name.txt
openssl x509 -req -sha256 -in site.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 7 -extfile name.txt -out site.pem
```

The first makes the site's key pair and a **signing request** (its public key and name, waiting
for a CA), and prints what step 2 printed. `.test` is reserved for testing. The second writes the
name where browsers read it; `DNS:` means "a site name". The third has your CA sign: `-sha256`
picks a modern signature (the Mac's LibreSSL otherwise uses one browsers reject), `-CA` and
`-CAkey` choose the CA, `-CAcreateserial` numbers the certificate, and `-extfile` adds the name.
It prints, on OpenSSL 3 (which first checks the request's own signature) and then LibreSSL:

```
Certificate request self-signature ok
subject=CN=shop.test
```

```
Signature ok
subject=/CN=shop.test
Getting CA Private Key
```

**5. Check the chain.** Predict: pass or fail?

```
openssl verify site.pem
```

```
CN=shop.test
error 20 at 0 depth lookup: unable to get local issuer certificate
error site.pem: verification failed
```

LibreSSL ends with `site.pem: verification failed: 20 (unable to get local issuer certificate)`.
Depth 0 means the certificate itself. With no other instruction, `openssl` checks against
its own trust store, and "My Lab CA" is not in it. A browser makes this check too, and also
checks that the name matches the site; this command does not.

**6. Name the CA you trust.**

```
openssl verify -CAfile ca.pem site.pem
```

```
site.pem: OK
```

`-CAfile ca.pem` means "trust this CA, for this one command". Nothing is installed.

**7. Make a second CA with the same name.** Predict: the name matches. Will it pass?

```
mkdir other
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout other/ca.key -out other/ca.pem -days 30 -subj "/CN=My Lab CA"
openssl verify -CAfile other/ca.pem site.pem
```

OpenSSL 3 prints the same `error 20` lines as step 5. LibreSSL prints a line of internal detail,
then `error 7 at 0 depth lookup:certificate signature failure`. Both refuse. A name is not
enough; the CA's key has to match. Compare their **fingerprints**, short values computed from
each certificate:

```
openssl x509 -in ca.pem -noout -fingerprint -sha256
openssl x509 -in other/ca.pem -noout -fingerprint -sha256
```

The two lines differ.

**8. Clean up.**

```
cd ..
rm -rf cert-lab
```

`rm -rf` deletes the folder and everything in it. It cannot be undone, so
check you typed `cert-lab`.

## Check yourself

1. In step 5, the certificate was well formed and in date. Why did the check fail?
2. In step 7, the second CA had exactly the right name. Why did it fail?
3. A device on your network uses its own CA, and your laptop's browser warns. What would
   installing that CA change, and where?

### Answers

1. Its issuer was not in the trust store, so nothing trusted vouched for it.
2. A certificate is checked against the key that signed it, and the second CA has a different
   key. Names are not unique; keys are.
3. Your laptop would accept every certificate that CA signs, until you remove it. No other
   device changes.

## Where to go next

- **Trusting a cluster's CA:** [Get in the first time](https://rasputin.geekdojo.com/docs/get-in-the-first-time/),
  in Rasputin's manual, covers installing a cluster's CA on each device, and what it does and does
  not establish.
