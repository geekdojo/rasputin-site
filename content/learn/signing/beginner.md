---
lesson: signing.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS with its built-in `openssl` (LibreSSL 3.3.6)
  and with OpenSSL 3.6.3, and on Debian 13 with OpenSSL 3.5.6. It was not tested on other Linux
  distributions or on Windows.
- **`openssl`**, a tool that makes keys, checksums and signatures. Type `openssl version` and
  press Return. If you see a version number, you have it. Every Mac has it, usually as
  `LibreSSL`, a separate project that accepts these commands. Most Linux systems have it; if
  not, install the package `openssl`, which needs administrator rights.
- **`printf`**, a command already part of macOS and Linux. Nothing to install.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

When you download a file, you want to know two things. Did it arrive unchanged? And did it come
from who you think it did?

A **checksum** answers the first. It is a short value computed from every byte of a file; change
one byte and the checksum changes completely. The common kind is **SHA-256**. A checksum only
helps if you got it from somewhere the file could not be changed. Checksums are usually published
right beside the file, and whoever can replace the file can replace the checksum too.

A **digital signature** answers both questions. It uses a **key pair**: two linked keys. The
**private key** stays secret with its owner and makes signatures. The **public key** can be
handed to anyone and checks them. A signature that checks against a public key means the holder
of the matching private key signed exactly these bytes.

Two things a valid signature does not tell you. It does not say the file is safe or any good,
only who signed it and that it is unchanged. And it does not say whose public key you are holding.
You still need that key from a source you trust, once. A **certificate**, a file in which a
trusted authority states that a public key belongs to a name, is one common way to get it.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. It signs its software releases, and before it installs an update
it checks the signature. Its manual says of that check (an "artifact" is a released file):
*"The signature establishes two things: who published this artifact, and that the bytes are the
ones they published."*

That check needs a public key to check against. The manual calls the certificate holding it the
**trust root**, and on Rasputin hardware it ships inside the operating system itself. A device
does not fetch the key alongside an update; it already has it. Without it, updates are refused.

## Try it

You will sign a note, change it, and then see what a signature can and cannot catch.

**1. Make a sandbox.**

```
mkdir sign-lab
cd sign-lab
```

`mkdir` makes a new, empty folder; `cd` moves you into it.

**2. Write a note and take its checksum.**

```
printf 'Meet at noon.\n' > note.txt
openssl dgst -sha256 note.txt
```

`printf` prints the text, `\n` ends the line, and `>` saves it in `note.txt`. `openssl dgst
-sha256` computes the SHA-256 checksum. OpenSSL 3 prints:

```
SHA2-256(note.txt)= 7e8113385cec2a4eed88374a6a916f888bb8fcccb1761ba9cf843da2caa3838a
```

LibreSSL writes `SHA256` instead of `SHA2-256`. The value is the same on every computer, because
the bytes are the same. On Linux, `sha256sum note.txt` gives the same value.

**3. Make a key pair.**

```
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
```

`genpkey` makes a private key of a common modern type, EC (elliptic curve), and saves it in
`private.pem`. `pkey
-pubout` writes the matching public key to `public.pem`. Neither prints anything.

**4. Sign the note, then verify it.**

```
openssl dgst -sha256 -sign private.pem -out note.sig note.txt
openssl dgst -sha256 -verify public.pem -signature note.sig note.txt
```

`-sign private.pem` signs the note's checksum with your private key and `-out note.sig` saves the
signature in its own file. `-verify public.pem -signature note.sig` checks it with the public key.

```
Verified OK
```

**5. Change the note.**

```
printf 'Meet at nine.\n' > note.txt
openssl dgst -sha256 note.txt
openssl dgst -sha256 -verify public.pem -signature note.sig note.txt
```

The checksum is now `2ff403aa6c715fff0dae3817abd671992b7d17bc3e7ba64c777a8448d75c2f3f`, and the
check fails:

```
Verification failure
```

OpenSSL 3 also prints a line of internal detail beginning with a long code. LibreSSL prints
`Verification Failure`. So far a checksum would have caught this too, if you still had the old
one.

**6. Replace the signature as well.** Predict: someone else makes their own key pair and signs the
changed note. Does it verify?

```
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out other-private.pem
openssl pkey -in other-private.pem -pubout -out other-public.pem
openssl dgst -sha256 -sign other-private.pem -out note.sig note.txt
openssl dgst -sha256 -verify other-public.pem -signature note.sig note.txt
```

```
Verified OK
```

It does, and the result is true: that note was signed by that key. Swapping in a new file, a new
signature and a new public key is exactly like swapping in a new file and a new checksum.

**7. Check with the public key you already had.**

```
openssl dgst -sha256 -verify public.pem -signature note.sig note.txt
```

```
Verification failure
```

Here is the difference. Anyone can publish a new checksum. Nobody without your private key can
make a signature that checks against *your* public key. A signature moves the trust question from
every download to one public key, which you get once, from a source you trust, and keep.

**8. Clean up.**

```
cd ..
rm -rf sign-lab
```

`rm -rf` deletes the folder and everything in it, private keys included. It cannot be undone, so
check you typed `sign-lab`.

## Check yourself

1. A download page lists a file and its SHA-256 checksum. The file matches. What has that proved?
2. In step 6, the changed note verified. Why is that result not wrong?
3. A program's signature verifies against its maker's real public key. Is the program safe to run?

### Answers

1. That the file matches the checksum on that page. If the page and the file can be changed
   together, it proves nothing about who made the file.
2. The signature really was made by that key over those bytes. It was checked against the wrong
   public key, which is why the key has to come from a source you trust.
3. Not necessarily. The signature says who signed it and that it is unchanged, not whether it is
   any good.

## Where to go next

- **Signatures in an update:** [Signing and the trust root](https://rasputin.geekdojo.com/docs/roll-out-an-update/#signing-and-the-trust-root),
  in Rasputin's manual, shows what a signature protects during an update and what it does not.
- **Check a real release:** [Verifying signatures](https://rasputin.geekdojo.com/docs/agents/#verifying-signatures)
  gives the `openssl` commands for checking Rasputin's releases yourself.
