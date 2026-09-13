---
lesson: backup.intermediate
---

## What you need

- **The beginner lesson,** [How you know a backup works](https://rasputin.geekdojo.com/learn/backup/beginner/).
  It covers backups, restoring, `tar` and `diff`.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15 with bsdtar 3.5.3, Debian 12 with GNU tar 1.34, and
  Debian 13 with GNU tar 1.35. It was not tested on Windows.
- **`tar`**, `diff`, `touch`, `mkdir`, `printf`, `cp`, `cat` and `rm`, already part of macOS and
  of almost every Linux system. Check with `tar --version`. The lab uses the option
  `--keep-newer-files`, which all of those `tar` programs have; the minimal `tar` in BusyBox
  does not, and prints its usage instead. Nothing to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-control-plane) backs up two kinds of thing to
a disk attached to its **control plane**, the machine that manages the others. One is the
control plane's **identity**: its database of operators and their passkeys, its certificate
authority, and the state of its private network. The other is **app data**, from whichever
machine runs each app.

A backup is for the day the control plane's machine dies. Two facts shape that day. The archive
holds every secret in the cluster; Rasputin's published backups devlog calls an unencrypted one
*"a portable copy of every secret in the cluster."* And usually only the control plane died:
the other machines kept running, and writing their apps' data.

## The decision, and what lost

**1. A person holds the key, two ways.** Rasputin's storage design, an internal record, starts
from one constraint: *"the key cannot live on the controlplane."* A key stored on the machine
*"is inside the archive it encrypts, and re-flash wipes the original."* So the archive key is
wrapped twice, and either wrapping opens it: once by a passphrase you choose, and once by a
recovery code shown to you once.

| Alternative | Why it lost |
|---|---|
| A key stored on the control plane | It is inside the archive it protects, and dies with the machine. |
| A key sealed in a TPM, a security chip that releases a key only on that one machine | *"a replacement controlplane has a different TPM"* |
| One secret only | The record does not weigh it. It records why each path exists: the passphrase is *"the path people actually use"*, and the recovery code *"survives a forgotten passphrase"*. |

**2. Restoring a cluster brings back identity only; app data comes back per app, when a person
asks.** The storage design gives the reason: *"a restored controlplane is very often standing in
front of nodes that were never wiped and whose volumes are newer than any archive, so an
automatic restore is an automatic data loss."* What lost is restoring everything in one step.
A comment in Rasputin's
[restore code](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/storage/restore_app.go)
records the test cluster behind it: the control plane was wiped and restored
while another machine *"kept running Vaultwarden with NEWER data than the backup; an automatic
push would have clobbered it."* Vaultwarden is a password manager.

The manual calls this *"a design decision, not an unfinished feature."*

## What it cost

**Lose both secrets, and the backup is gone.** The
[manual](https://rasputin.geekdojo.com/docs/set-up-backups/): *"If you have neither secret,
nothing opens what is on the disk — not Rasputin, not Geekdojo."*

**Where you keep a secret can undo it.** A recovery code kept only in a password manager that
runs on the same cluster is inside the archive it unlocks, lost on the day it is needed. The
manual warns against it.

**Every restore needs a person with a secret.** The cluster restore asks for one, and an app's
data restore asks again, even when you are signed in.

**The judgment moves to you.** The per-app restore, in the manual's words, *"does not compare
ages. Rasputin does not check whether what is on the node is newer than what is in the
generation."* The record does not say why no age check was built. The lab shows one plausible
reason: whichever age rule you pick is wrong in one of two common cases.

## What Rasputin does not do here

It never restores app data on its own, and never decides which copy is better. There is no
way to reset or recover the archive key. Backups go to one disk attached to the control plane;
Rasputin makes no second copy.

## Try it

You will back up a control plane and one app, lose the control plane, and try three restore
rules on what is left.

**1. Make a sandbox.** Run these one at a time:

```
mkdir restore-choice
cd restore-choice
mkdir -p site/controlplane site/node/vault disk
printf 'operator=sam\n' > site/controlplane/identity
printf 'bank\n' > site/node/vault/entries
touch -t 202609070300 site/controlplane/identity site/node/vault/entries
```

`site` is your cluster: `controlplane/identity` stands in for its identity, and
`node/vault/entries` for a password app's data on another machine. `disk` is the backup disk.
`mkdir -p` makes a folder and any folders above it. `touch -t 202609070300` sets a file's
modified time to 03:00 on Monday, 7 September 2026, so every step has a known date.

**2. Take Monday's backup.**

```
tar -czf disk/monday.tar.gz -C site controlplane node
```

`-C site` makes `tar` work from inside `site`, so the archive holds `controlplane` and `node`.

**3. Tuesday: the app saves an entry, then the control plane dies.**

```
printf 'email\n' >> site/node/vault/entries
touch -t 202609081200 site/node/vault/entries
rm -rf site/controlplane
```

`>>` adds a line to the end of a file. The vault now holds `bank` and `email`, dated Tuesday
noon. Only `node` is left in `site`.

**4. Rule one: restore everything.** Each rule runs on a copy of the cluster, so every
rule starts from the same Tuesday. `cp -Rp` copies a folder and everything in it, and `-p`
keeps each file's date. Predict what the vault holds afterwards.

```
cp -Rp site try-all
tar -xzf disk/monday.tar.gz -C try-all
cat try-all/controlplane/identity try-all/node/vault/entries
```

```
operator=sam
bank
```

The control plane is back. `email` is gone. `tar` replaced a newer file with an older one and
printed nothing: overwriting is its default. This is the loss the storage design names.

**5. Rule two: identity only.**

```
cp -Rp site try-identity
tar -xzf disk/monday.tar.gz -C try-identity controlplane
cat try-identity/controlplane/identity try-identity/node/vault/entries
```

```
operator=sam
bank
email
```

Naming `controlplane` after the archive extracts only that. The vault keeps Tuesday's entry.

**6. Rule three: automate the judgment.** Restore both files, but never replace one that is
newer than its copy in the archive:

```
cp -Rp site try-newer
tar -xzf disk/monday.tar.gz -C try-newer --keep-newer-files controlplane node/vault/entries
cat try-newer/controlplane/identity try-newer/node/vault/entries
```

```
operator=sam
bank
email
```

GNU tar also prints `tar: Current 'node/vault/entries' is newer or same age`. Naming the two
files, not the whole archive, matters on GNU tar 1.35 (Debian 13): given a folder that already
exists, it prints `Unexpected inconsistency when making directory` and exits with a failure
status, though the files come out the same. Rule three got Tuesday right. It looks like the one to build.

**7. Wednesday: the app empties its vault by mistake.** Try rule three again. Predict first.

```
printf '' > site/node/vault/entries
touch -t 202609091200 site/node/vault/entries
cp -Rp site try-newer-wed
tar -xzf disk/monday.tar.gz -C try-newer-wed --keep-newer-files controlplane node/vault/entries
cat try-newer-wed/node/vault/entries
echo "(end of file)"
```

```
(end of file)
```

`printf ''` writes nothing, so `>` leaves the file empty. GNU tar prints its `newer or same
age` line again. The empty vault is newer than Monday's copy, so rule three kept the mistake. On Wednesday, rule one would have been right and rule three
wrong; on Tuesday it was the other way around. The dates cannot tell you which day it is;
only whether the newer data is good decides it.

**8. Look before you choose.** Compare the archive's copy with the live one, without extracting
anything:

```
tar -xzf disk/monday.tar.gz -O node/vault/entries | diff - site/node/vault/entries
```

```
1d0
< bank
```

`-O` sends the file to the screen instead of the disk, and `|` hands it to `diff`, where `-`
means "what came through the pipe". `1d0` and `<` mean the archive has a line, `bank`, that the
live file lacks. Run the same comparison against `try-identity`, Tuesday's copy, and you get
`1a2` and `> email`: the live file has a line the archive lacks. Wednesday: restore this app.
Tuesday: restore nothing. A person reading the difference can tell; Rasputin leaves that to you.

**9. Restore the one app, and clean up.**

```
tar -xzf disk/monday.tar.gz -C site node
cat site/node/vault/entries
cd ..
rm -rf restore-choice
```

```
bank
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `restore-choice`.

## Check yourself

1. In step 4, what did `tar` print when it replaced Tuesday's vault with Monday's?
2. What breaks if Rasputin kept the archive key on the control plane, and the control plane is
   the machine that died?
3. Your only copy of the recovery code is in a password manager that runs on your cluster, and
   you forget the passphrase. The control plane dies. What can you restore?
4. A restore tool offers "keep newer files" as its safe default. When does that default lose the
   data you backed up to protect?

### Answers

1. Nothing. A restore that succeeds looks the same whether it lost data or not.
2. The key is gone with the machine, and its only other copy is inside the encrypted archive.
   Nothing opens the backup.
3. Nothing. The code is inside the archive it unlocks, and the passphrase is lost.
4. When the newer data is the mistake: a wiped or corrupted file is newer than its backup, so the
   tool keeps the damage.

## Where to go next

- **Why restore is identity only:** [Restore a cluster](https://rasputin.geekdojo.com/docs/restore-a-cluster/),
  in Rasputin's manual.
- **Restoring one app's data, and what it does not check:** [Your apps](https://rasputin.geekdojo.com/docs/your-apps/).
- **Where to keep the two secrets:** [Set up backups](https://rasputin.geekdojo.com/docs/set-up-backups/).
