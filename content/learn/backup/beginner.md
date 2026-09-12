---
lesson: backup.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 and on Debian 12 Linux. It was not tested
  on Windows.
- **`tar`**, a tool that packs many files into one. Type `tar --version` and press Return. Every
  Mac has it, and so does almost every Linux system. If you see `command not found`, install the
  package `tar`, which needs administrator rights. Tested with bsdtar 3.5.3 on macOS and GNU tar
  1.34 on Linux; the two are different programs, and every step below printed the same on both.
- **`diff`**, a tool that compares files. Type `diff --version`. Every Mac has it. On Linux it
  comes in the package `diffutils`, which is almost always installed; installing it needs
  administrator rights.
- **`mkdir`, `printf`, `ls`, `cp`, `cat` and `rm`**, commands that are already part of macOS and
  Linux.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

A **backup** is a copy of your data made at one moment and kept apart from the original, so you
can get back what you had then. Getting it back is called **restoring**.

**Redundancy** is something else: keeping more than one live copy at the same time, such as two
drives holding the same files and updated together. If one drive fails, the other keeps working.
Redundancy protects you from a part breaking. It does not protect you from a change you did not
want: delete a file by mistake, and it is deleted from every live copy, because keeping the
copies the same is redundancy's whole job. A backup taken before the mistake still has the file.

A backup file can exist, have a
sensible size, and list the names you expect. None of that shows it holds what you will need.
The one test that answers "can I get my data back?" is to restore the backup somewhere empty and
compare the result with the original.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. It backs up to a disk attached to its **control plane**, the
computer that manages the others. Every backup is **encrypted**: scrambled, so that only a key
can read it.

That key has two ways in, and either one is enough: a passphrase you choose, and a recovery code
shown to you once. As its [manual](https://rasputin.geekdojo.com/docs/set-up-backups/) says, if
you have neither, nothing opens the backup, and there is no reset.

Rasputin's storage design, which is not public, states this lab's rule: *"A backup nobody has
restored is not a backup."* It is a rule Rasputin's builders test against before they ship, not
a check on your cluster's backups. On a running cluster, the manual has you read each backup
run's record to learn whether that run worked; restoring is still the test of what comes back.

## Try it

You will make some data, back it up, check the backup the usual way, and then check it by
restoring it.

**1. Make a sandbox with some data.** Run these one at a time:

```
mkdir backup-lab
cd backup-lab
mkdir data
printf 'buy milk\n' > data/notes.txt
printf 'Rome\nOslo\n' > data/trips.txt
printf 'font-size=14\n' > data/.settings
ls -1 data
```

```
notes.txt
trips.txt
```

`mkdir` makes new, empty folders, and `cd` moves you into one. `printf` prints text, turning each
`\n` into a new line, and `>` saves it as a file. `ls -1` lists a folder, one name per line
(`-1` is the digit one). You made three files and it listed two, because a name that starts with
a dot is a **hidden file**: ordinary listings skip it. Programs often keep settings in them.

**2. Back up everything in `data`.**

```
tar -czf backup.tar.gz data/*
```

`tar` packs files into one **archive** file. `-c` creates an archive, `-z` compresses it, and
`-f backup.tar.gz` names it. `data/*` means "everything in `data`": the shell expands the `*`
into a list of names before `tar` runs.

**3. Check it the usual way.**

```
tar -tzf backup.tar.gz
```

```
data/notes.txt
data/trips.txt
```

`-t` lists what an archive holds. Every file `ls` showed is there. This is where most checks
stop.

**4. Check it by restoring it.** Predict: will the restored folder match the original?

```
mkdir restore
tar -xzf backup.tar.gz -C restore
diff -r data restore/data
```

```
Only in data: .settings
```

`-x` extracts, and `-C restore` puts the files inside the empty `restore` folder, so nothing
overwrites your originals. `diff -r` compares two folders and everything in them, and prints
only the differences.

The settings file is not in the backup. The shell's `*` skips hidden files, so `tar` was never
told about it. The listing in step 3 did not show the gap, because `ls` skips hidden files too:
the check had the same blind spot as the backup. Only restoring and comparing with the real
files found it. (If `diff` printed nothing, your shell is set to include hidden files in `*`.
The next step works either way.)

**5. Fix it, and prove it again.**

```
rm -rf restore
tar -czf backup.tar.gz data
mkdir restore
tar -xzf backup.tar.gz -C restore
diff -r data restore/data && echo "identical"
```

```
identical
```

Naming the folder, `data`, instead of its contents makes `tar` take everything inside it, hidden
files included. `diff` prints nothing when the folders
match, and `&&` runs `echo` only when the command before it found no difference.

**6. Compare a backup with redundancy.**

```
cp -R data mirror
printf 'oops\n' > data/notes.txt
cp -R data/. mirror/
cat mirror/notes.txt
cat restore/data/notes.txt
```

```
oops
buy milk
```

`cp -R` copies a folder and everything in it, so the first line makes a second live copy,
`mirror`. Then you overwrite a note by mistake, and `cp -R data/. mirror/` updates the mirror the
way a redundant drive would, by itself: `data/.` means the contents of `data`, so they land
inside `mirror`. The mirror now holds the mistake. The copy you restored from the backup still
says `buy milk`.

**7. Clean up.**

```
cd ..
rm -rf backup-lab
```

`rm` deletes; `-r` includes everything inside the folder, and `-f` skips the questions. It cannot
be undone, so check you typed `backup-lab`.

## Check yourself

1. In step 3, the archive's listing matched `ls -1 data`. Why was that not proof the backup was
   complete?
2. Your computer has two drives that mirror each other, and you delete a folder by mistake. Can
   you get it back from the second drive, or from last night's backup?
3. You lose the passphrase for a Rasputin backup, and the recovery code is safe in a drawer. Can
   you restore it? What if the recovery code were lost too?

### Answers

1. `ls` and the shell's `*` both skip hidden files, so the check could not see what the backup
   missed. Comparing a restored copy with the real files could.
2. From last night's backup. The mirror deleted the folder as soon as you did.
3. Yes: either secret opens the backup's key. With both lost, nothing opens it.

## Where to go next

- **The key and its two secrets:** [Set up backups](https://rasputin.geekdojo.com/docs/set-up-backups/),
  in Rasputin's manual, explains how a backup is sealed and where to keep each secret.
- **Knowing a backup worked:** [Check your backups](https://rasputin.geekdojo.com/docs/check-your-backups/)
  explains how to read a backup run's record, and what the backup disk's health check does not
  prove.
- **Getting a cluster back:** [Restore a cluster](https://rasputin.geekdojo.com/docs/restore-a-cluster/)
  walks through restoring onto a replacement control plane.
