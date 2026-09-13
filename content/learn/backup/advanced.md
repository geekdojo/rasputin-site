---
lesson: backup.advanced
---

## What you need

- **The intermediate lesson,** [Why restore is never automatic](https://rasputin.geekdojo.com/learn/backup/intermediate/).
  This lesson assumes you already know why Rasputin's archive key is held by a person, in two
  ways, and why restoring app data is never automatic. It does not argue either again.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15 with its built-in `openssl` (LibreSSL 3.3.6), and
  on Debian 13 with OpenSSL 3.5.6, with the same output on both. It was not tested on Windows or
  on other Linux distributions.
- **`openssl`**, a tool that makes keys and encrypts files. Type `openssl version`. Every Mac has
  it, as LibreSSL. Most Linux systems have it; if not, install the package `openssl`, which
  needs administrator rights.
- **`dd`, `cmp`, `diff`, `head`, `tail`, `mkdir`, `printf`, `ls` and `rm`**, already part of
  macOS and Linux.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## How it is built

**The key pair is minted in the browser.** When you claim a backup disk,
[`archive-key.ts`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/ui/lib/archive-key.ts)
makes an X25519 key pair: a public key that can encrypt to it, and a private key that can decrypt.
It wraps the private key twice, under your passphrase (stretched with Argon2id, a deliberately
slow key-derivation function) and under the recovery code (through HKDF-SHA-256). Only the public
key and the two wrapped copies leave the browser. The API that receives them has a field for the
public key and none for a private one. The wrapped copies are written into a marker file on the
backup disk.

Why a key pair rather than one secret key: a scheduled backup runs with nobody at a keyboard. The
file's comment records that, with a single symmetric key, *"the controlplane caches that key in
the clear"* to write each archive. With a key pair, writing needs only the public key.

**Every run seals to the public key.**
[`seal.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/backupxfer/seal.go)
mints a fresh X25519 key pair for each archive, combines its private half with the disk's public
key to derive a content key, then drops that private half. The archive's clear-text header
carries the new public half, the id of the disk key it was sealed to, and the archive's scope.
The body is encrypted with ChaCha20-Poly1305, an authenticated cipher, in 64 KiB chunks. Each
chunk carries a tag that fails if a byte changes; the header is bound into every tag; and the last
chunk is flagged, so an archive cut short at a chunk boundary is caught. A SHA-256 digest of the
whole sealed file is recorded when it is written. Compute nodes seal their own app volumes with the
same code before any byte leaves the node.

The package states its invariant: *"THIS PACKAGE NEVER HOLDS A PRIVATE KEY THAT CAN
OPEN AN ARCHIVE."* And its cost: *"THIS CONTROLPLANE CAN WRITE ARCHIVES AND CANNOT READ THEM
BACK."* It checks integrity from the digest, never by decrypting.

**Reading needs a person.** For a cluster restore, your secret unwraps the private key in the
browser, and the browser checks that the key produces the public key on the disk's marker.
The key goes to the control plane once. The control plane repeats that check against the marker
on the disk it mounted. Then
[`unseal.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/storage/unseal.go),
which its comment calls the one place in either program that consumes the private key, opens the
archive, authenticating each chunk before writing its plaintext. Restored files are staged and verified,
and applied at the next start.

A per-app restore
([`restore_app.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/storage/restore_app.go))
asks for the secret again. The control plane decrypts; the key never goes to the node. The node
unpacks and verifies the data beside the live volume while the app keeps running, then stops
the app, swaps the two folders in one atomic step, and starts it. The previous contents are kept
beside the volume.

## Where it breaks

Each of these is in the published manual or fixed in the public code.

**A re-claimed disk loses its archives.** Claiming a disk as blank formats it, and *"the format
takes the marker, and with it the only copies of the wrapped key. The archives may still be
physically present; nothing will ever open them again."* The same goes for a generation sealed to
a key the marker no longer names: the key id in the header says which key it needs, and cannot
supply it. The lab reproduces this.

**Adopting a disk once asked for nothing.** A comment in
[`adopt_key_test.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/storage/adopt_key_test.go)
records it: adopting an existing backup disk *"left a replacement controlplane holding a target
whose private key was sealed and whose custody nobody had been asked for."* The archive key was
then a single secret key, so an adopted disk could not take new backups until someone opened it.
The fix made adopting ask for a secret. Once the key became a key pair, writing needed only the
public key, and the rule stayed: the gate is now *"about not accumulating four generations sealed
to a key nobody has proved they can open."* A disk whose marker carries the sealed key is not
adopted without a secret, because *"skip it, and the first time anyone finds out is the day they
try to restore."* The manual names one exception: a marker that only names a key adopts anyway,
with a warning.

**Trust drifted during a restore.** Between wiping a test control plane and restoring it, the box
ran as a new cluster with a new certificate authority and enrolled a node with it. The restore
put the original authority back, and that node's connections to the control plane failed. The fix,
[control-plane #241](https://github.com/geekdojo/rasputin-control-plane/pull/241), re-delivers
the restored authority; the manual shows such a node as `TRUST STALE · re-delivering` until it
clears.

**Encryption alone does not detect a change.** This one is a guard rather than an incident, and
the lab shows why it exists. An unauthenticated cipher decrypts altered bytes into altered
plaintext without an error. Rasputin's per-chunk tags, header binding and last-chunk flag each
have a test in the public code. The scope is repeated inside the authenticated header because a
manifest beside the archive *"can be deleted or replaced by anyone holding the disk."*

## What Rasputin does not do here

It keeps no key that opens a backup archive; during a restore, the key is held in memory for that
one job. There is no escrow, reset or support path. It does
not test-restore your archives: a run's own row is the record that a backup was written, and
adopting a disk proves your secret opens it, not that its generations are complete. Archives
carry no separate signature; the manual says a signing key that survived a re-flash would be *"the
same custody problem over again."*

## Try it

You will build a backup that a job writes and cannot read, open it with one of two secrets, then
break it twice. `openssl` stands in for Rasputin's code, with one substitution: macOS's built-in
version has no X25519, so the lab uses an RSA key pair instead. It has the same shape here, the
public key writes and the private key reads, though the lab encrypts each content key to it where
Rasputin derives one.

**1. Make a sandbox.** Run these one at a time:

```
mkdir sealed-backup
cd sealed-backup
mkdir cluster disk app person
printf 'bank    4417\nemail   2210\nwifi    tangerine\nnotes   none\nlocker  0913\n' > app/vault.txt
printf 'plum-orbit-canvas-71\n' > person/passphrase
```

`cluster` holds what the control plane keeps, `disk` is the backup disk, `app` is the data, and
`person` is what you keep. The lab keeps your secrets in files so every step runs as typed; a
real passphrase does not belong in a file beside the data it protects.

**2. Claim the disk.** This is the browser's job. Copy from `cat` down to `END`:

```
cat > claim.sh <<'END'
openssl rand -hex 16 > person/recovery-code
openssl genrsa -out key.pem 2048 2>/dev/null
openssl rsa -in key.pem -pubout -out cluster/archive.pub 2>/dev/null
openssl pkey -in key.pem -aes256 -passout file:person/passphrase -out disk/key.by-passphrase
openssl pkey -in key.pem -aes256 -passout file:person/recovery-code -out disk/key.by-recovery-code
rm key.pem
echo "claimed: new key pair, new recovery code"
END
sh claim.sh
ls -1 cluster disk
```

`rand -hex 16` prints 32 random hex characters: the recovery code. `genrsa` makes a private
key; `2>/dev/null` hides progress lines that differ between versions. `rsa -pubout` writes its
public half. `pkey -aes256 -passout file:…` writes a copy of the private key encrypted under the
first line of that file. Then the unwrapped key is deleted.

```
claimed: new key pair, new recovery code
cluster:
archive.pub

disk:
key.by-passphrase
key.by-recovery-code
```

**3. Write the backup job.** It reads only `cluster/`:

```
cat > seal.sh <<'END'
gen=disk/$1
mkdir "$gen"
openssl rand -hex 32 > content-key
openssl pkeyutl -encrypt -pubin -inkey cluster/archive.pub -pkeyopt rsa_padding_mode:oaep -in content-key -out "$gen/content-key.sealed"
openssl enc -aes-256-cbc -pbkdf2 -pass file:content-key -in app/vault.txt -out "$gen/vault.sealed"
rm content-key
openssl dgst -sha256 "$gen/vault.sealed" > "cluster/$1.digest"
echo "sealed $1"
END
sh seal.sh gen1
```

Each run makes a new random content key, as Rasputin makes a new key pair per archive.
`pkeyutl -encrypt -pubin` encrypts it to the public key, with OAEP padding. `enc -aes-256-cbc`
encrypts the data with it, `-pbkdf2` turning its text into a cipher key. The content key is
deleted, and a digest of the sealed file is kept in `cluster/`.

```
sealed gen1
```

**4. Try to read it back, as the cluster.**

```
openssl pkeyutl -decrypt -pubin -inkey cluster/archive.pub -pkeyopt rsa_padding_mode:oaep -in disk/gen1/content-key.sealed 2>/dev/null || echo "the cluster cannot open it"
openssl dgst -sha256 disk/gen1/vault.sealed | cmp -s - cluster/gen1.digest && echo "gen1: digest matches" || echo "gen1: digest does not match, refusing"
```

```
the cluster cannot open it
gen1: digest matches
```

A public key cannot decrypt. But the cluster can still check the archive: `cmp -s` silently
compares the digest just computed, `-` being the piped text, with the one recorded in step 3.

**5. Write the restore, and use the recovery code.**

```
cat > open.sh <<'END'
gen=disk/$1
secret=$2
if ! openssl pkey -in "disk/key.by-$secret" -passin "file:person/$secret" -out key.pem 2>/dev/null; then
  echo "$secret does not open the key"; rm -f key.pem; exit 1
fi
if ! openssl pkeyutl -decrypt -inkey key.pem -pkeyopt rsa_padding_mode:oaep -in "$gen/content-key.sealed" -out content-key 2>/dev/null; then
  echo "that key does not open $1"; rm -f key.pem content-key; exit 1
fi
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:content-key -in "$gen/vault.sealed" -out restored.txt && echo "opened $1"
rm key.pem content-key
END
sh open.sh gen1 recovery-code
diff restored.txt app/vault.txt && echo identical
```

The script unwraps the private key with one secret, decrypts the content key, then the data.
`-d` means decrypt. `if !` runs the error branch when a command fails.

```
opened gen1
identical
```

**6. Break it: overwrite 16 bytes of the archive.** Predict whether it still opens.

```
dd if=/dev/zero of=disk/gen1/vault.sealed bs=1 seek=32 count=16 conv=notrunc 2>/dev/null
sh open.sh gen1 passphrase
head -n 1 restored.txt
tail -n 1 restored.txt
cmp -s restored.txt app/vault.txt || echo "restored.txt is not the original"
```

`dd` copies bytes: `if=/dev/zero` supplies zeros, `bs=1 seek=32 count=16` writes 16 of them
starting at byte 32, and `conv=notrunc` keeps the rest of the file.

```
opened gen1
bank    4417
locker  0913
restored.txt is not the original
```

It opened with no error. The first and last lines are intact; the middle lines are scrambled,
and nothing said so. CBC mode has no tag, so it cannot tell altered bytes from real ones.

**7. Check before you open.**

```
openssl dgst -sha256 disk/gen1/vault.sealed | cmp -s - cluster/gen1.digest && echo "gen1: digest matches" || echo "gen1: digest does not match, refusing"
```

```
gen1: digest does not match, refusing
```

The check needs no key. `openssl enc` has no authenticated mode, so the lab adds the digest by
hand; Rasputin has both.

**8. Break it again: claim the disk a second time.** Seal a good generation first. Predict
whether your passphrase, which does not change, still opens `gen2`.

```
sh seal.sh gen2
sh claim.sh
sh seal.sh gen3
sh open.sh gen3 passphrase
sh open.sh gen2 passphrase
```

```
sealed gen2
claimed: new key pair, new recovery code
sealed gen3
opened gen3
that key does not open gen2
```

The passphrase never encrypted a backup. It wrapped a key, and claiming again replaced that key
on the disk. `gen2` is intact and sealed to a key that no longer exists anywhere, which is
Rasputin's re-claimed disk.

**9. Clean up.**

```
cd ..
rm -rf sealed-backup
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `sealed-backup`.

## Check yourself

1. In step 4, the cluster confirmed `gen1` was unchanged without opening it. What made that
   possible, and what could it not tell you?
2. What breaks if `seal.sh` forgot to delete `content-key`?
3. In step 8, why did `gen2` not open, when the passphrase was the same?
4. What breaks if a restore trusted a manifest file stored next to the archive to say what the
   archive contains?
5. Adopting a disk needs only its public key to keep writing backups. Why does Rasputin still ask
   for a secret?

### Answers

1. A digest recorded when the archive was written, kept away from the disk. It proves the bytes
   are unchanged; it cannot prove your secret opens them, or that the data was right when sealed.
2. The newest generation's content key stays in the folder where the job ran. Anyone who can
   read that folder can decrypt that generation, and the job could read back what it wrote.
3. Claiming minted a new key pair and replaced the wrapped copies. The passphrase opens the new
   private key, and `gen2` needs the old one.
4. Anyone holding the disk can edit that file, for example to call a partial archive complete.
   Rasputin repeats the scope inside the authenticated header.
5. So the secret is proved while you are there, not on restore day, after more generations have
   been sealed to a key nobody can open.

## Where to go next

- **The claim, the marker, and adopt versus format:** [Set up backups](https://rasputin.geekdojo.com/docs/set-up-backups/),
  in Rasputin's manual.
- **Where your secret goes during a restore:** [Restore a cluster](https://rasputin.geekdojo.com/docs/restore-a-cluster/).
- **The code:** the sealed format in
  [`seal.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/backupxfer/seal.go),
  the reader in [`unseal.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/storage/unseal.go),
  and the tamper and truncation tests in [`seal_test.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/backupxfer/seal_test.go).
