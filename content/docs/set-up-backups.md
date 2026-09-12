---
title: "Set up backups"
description: "Claim or adopt a backup disk, mint the archive key and its two secrets, and set the cadence — with the consequence of each choice and the one mistake you cannot take back."
weight: 60
applies-to: "2026.08.5"
---

Setting up backups is a one-time job: give Rasputin a disk, mint the key your archives are
sealed to, and choose how often a backup runs. The whole of it happens on **Storage**, which
has one tab, **BACKUPS**.

Read [The archive key and its two secrets](#the-archive-key-and-its-two-secrets) before you
start. It is the only part of this page that can cost you your backups, and the decision it
asks you to make is one you make away from the keyboard.

`<cluster-id>` is your cluster's own identifier, fixed when you provisioned it. `<key id>` is the
identifier Rasputin prints for an archive key, and `<generation-id>` the identifier of one
backup.

## Do this

<!-- SCREENSHOT: storage.png -->

1. **Attach the disk to the control-plane node** — a USB disk, or a second internal drive.
   It has to be a disk the control plane can reach directly; no other node in the cluster can
   hold a backup target.
2. **Open Storage.** The node selector is already on the control-plane node. Press `RESCAN`
   after plugging a disk in.
3. **Read the disk's partition list before you touch anything.** The badge decides your path:
   a blank disk offers **`CLAIM THIS DISK`**, a disk already carrying Rasputin backups offers
   **`REVIEW…`**, and the disk the machine boots from is badged `BOOT MEDIUM` and can never
   be claimed.
4. **Press the button and read the callout at the top of the drawer** — amber on a blank disk
   (it will be formatted), green on a disk with a set (nothing is destroyed). **If you plugged
   this disk in to restore from it, take the green path.**
5. **Give it a `LABEL` if you like**, up to 64 characters.
6. **On a blank disk, choose a passphrase and type it twice.** Minimum 12 characters.
7. **Save the recovery code**, shown once. You must tick *I have saved this recovery code
   somewhere outside this cluster* to go on.
8. **Finish the claim** — **`FORMAT AND CLAIM`** on a blank disk; on a disk with a set,
   **`CONTINUE — UNLOCK THIS DISK`**, then **`PASSPHRASE`** or **`RECOVERY CODE`** and your
   secret. Either way this starts a job; the last screen names it, and you watch it in
   **Tasks**.
9. **Set the cadence.** The first dropdown under `BACKUP RUNS`: `Daily`, `Every 3 days`,
   `Weekly (default)`, `Fortnightly`, `Monthly`, or `Scheduled backups off`.
10. **Set how much history to keep** — the second dropdown, `Keep 4 (default)`.
11. **Press `BACK UP NOW`** and read the row it produces. A run's own row is the only proof a
    backup worked.

## The archive key and its two secrets

**Decide where the two secrets live before you mint them.** Losing one of them is
survivable. Losing both is not, and there is nobody to ask.

Rasputin seals your archives to an X25519 key pair minted in your browser. The public half is
enough to *write* a backup and useless for *reading* one, so the cluster keeps it in the
clear — which is what lets the control plane back itself up at 3 a.m. without holding any
secret. The private half is never kept in the clear anywhere. **Two sealed copies of it are
written onto the backup disk itself:**

- one wrapped by **the passphrase you choose**, stretched with Argon2id at a cost recorded on
  the disk;
- one wrapped by **a recovery code** Rasputin shows you exactly once, through HKDF-SHA-256.

Either secret opens the private key. Neither is stored on the cluster, in any form. The
drawer states the reason in its own words: a key kept under the control plane's own data
directory would be inside the archive it encrypts, so *"nothing secret is stored on this
cluster at all."*

**What that protects.** The disk can leave your control, and the archives on it stay sealed. The
control plane can be destroyed, and the archives stay readable — by you, with either secret,
on any Rasputin that can mount the disk.

**What it does not protect.** It is not a backup *of* the secrets. It is not escrow: there is
no reset, no override, and no support path. And it protects the archive, not the disk — a
disk that dies physically takes the sealed copies with it, so the key is not a substitute for
a second copy of the data.

**The consequence of each choice.**

- **The passphrase.** 12 characters is the floor, not the advice. Length beats cleverness
  here: Argon2id prices each guess, but it cannot make a short passphrase expensive to
  exhaust.
- **The recovery code.** Shown once, before the claim is submitted — deliberately. A code
  saved for a claim that then fails costs you a scrap of paper; a claim that succeeded before
  the code was shown could cost you the archive. It is 32 characters in an alphabet with no
  `I`, `L`, `O` or `U` in it, so there is no `1`/`I` or `0`/`O` to mistranscribe. Dashes and
  letter case are ignored when you type it back.
- **Where you keep them.** The screen's own warning is worth repeating: **do not store the
  recovery code only in a password manager that runs on this cluster.** Its data is inside the
  archive the code unlocks, so on the day you need it — the day the cluster is gone — the code
  is gone with it. Print it, write it on paper, or put it in a password manager that lives
  somewhere else. Keep the two secrets in two different places; that is the whole point of
  there being two.

**What you cannot take back.** If you have neither secret, nothing opens what is on the disk —
not Rasputin, not Geekdojo. Where the disk's marker carries a sealed copy of the key, Rasputin
refuses to adopt it without one of the two secrets, rather than recording a target whose
archives nobody can ever read and then going on adding to them. Your options at that point are
to leave the disk untouched in case a copy of a secret turns up, or to destroy the set and
start again with a fresh key. A marker that only *names* a key and carries no sealed copy is
the one case that adopts anyway, with a warning — see the troubleshooting entry below.

One narrower thing you cannot take back: if the claim job fails *after* the format has run,
the key is already stamped on the disk. **Keep the recovery code anyway** — adopting that disk
later will ask for exactly that code or passphrase.

## Adopt, format, or destroy

The same drawer opens from both buttons, and its title tells you which of three things you are
about to do. They are not variations on each other.

| Path | What happens to the disk | What happens to the key |
| --- | --- | --- |
| **Adopt** (`ADOPT BACKUP TARGET`) | Taken over exactly as it stands. No format. No data lost | The existing key's two sealed copies are carried across unchanged. No new key, no new recovery code |
| **Format** (`CLAIM BACKUP TARGET`) | Repartitioned and formatted whole. Everything on it is destroyed. Once, now — never on a later backup run | A fresh key pair is minted and the custody ceremony runs |
| **Destroy** (`DESTROY BACKUP SET`) | The existing backup set and every generation in it are destroyed, then the disk is claimed fresh | A fresh key pair, and with it a fresh recovery code. The old generations and their secrets are gone |

**What the distinction protects.** Only an adopted set carries the sealed key copies forward,
and those copies are what a cluster restore unwraps. **A disk you formatted or destroyed and
re-claimed cannot be restored from** — the format takes the marker, and with it the only
copies of the wrapped key. The archives may still be physically present; nothing will ever
open them again.

**What it does not protect.** Adoption proves your secret still opens the disk; it proves
nothing about whether the generations on it are complete or readable end to end. Rasputin
could in fact resume writing to an adopted disk without asking you for anything, because
writing needs only the public key. It asks anyway, and says why: *"This is the one moment you
are here with the disk to prove your passphrase or recovery code still opens it; skip it, and
the first time anyone finds out is the day they try to restore."*

**What you cannot take back.** Destroying is the one control in Storage capable of losing the
data Storage exists to keep, and it is deliberately harder to reach than adopting — a closed
disclosure, the disk's own **serial number** typed out exactly, and a tick box naming how many
generations will be destroyed. It only exists at all when the control plane authorized it for
that specific disk while scanning; on a disk it did not, there is no destroy path in the
drawer to find, not even a grayed-out one. There is no undo and no other copy unless you made
one.

## Superseding the current target

A cluster has at most one current backup target. If one is already claimed, the drawer shows
an amber block titled **THIS CLUSTER ALREADY HAS A TARGET**, and the continue button stays
disabled until you tick **Supersede the current backup target**. That gate exists because this
is easy to do by accident.

**Read it literally.** Superseding changes where *future* generations go. It does not erase,
format, reclaim, or copy anything: the old disk keeps every generation it already holds, keeps
its own archive key, and its row stays in the table badged `REPLACED`. Rows are never deleted,
because a superseded disk may hold the only copy of an archive and the row is the durable
answer to "what happened to the disk that used to be in there".

**What it does not protect.** Nothing is added to the old disk from that moment on, and its
health is no longer what protects you. Two disks in rotation is not what this gives you — it
gives you one live target and one frozen archive.

## Rasputin will not format the boot medium

The card for the disk the machine runs from carries the guarantee in the product's own words:
*"Rasputin will not format it, and re-checks that immediately before any format runs."*

**What that guarantee is.** Two separate guards, and it is worth knowing they are two. The
claim job re-checks the boot-device exclusion itself, after you have confirmed. Then the agent
that does the work re-checks the disk's fingerprint immediately before it writes — so if the
disk you confirmed is no longer the disk in front of it, the job refuses rather than
proceeding. The boot medium is resolved by which device holds the currently mounted boot, root
and persistent partitions, never by device name.

**What it is not.** It protects one disk: the one this machine is booting from. It says
nothing about any other disk you point at. It is not a data-detector — a disk full of your
photographs is, to this check, a claimable blank disk, and formatting it is exactly what
`CLAIM THIS DISK` does.

**So identify the disk yourself, and not by device path.** On a two-drive control plane both
disks can be the same model and the same size, and device names such as `nvme0n1` and
`nvme1n1` are **not stable across reboots**. Read the badge and the partition list instead.
The boot medium has a distinctive shape: several partitions including two small `RASPUTIN-A` /
`RASPUTIN-B` slots, two squashfs roots, and a large `persistent` partition mounted at
`/var/lib/rasputin`. The exact count depends on the image, so read the shape rather than
counting. A backup disk looks nothing like it — one partition, ext4, usually labeled
`RASPUTIN-BACKUP` once claimed.

A disk badged `WEAK IDENTITY` reported neither a WWN nor a serial, so it is identified by
model, size and partition table alone. Two identical blank sticks from one batch can look the
same to that test. Check the bus and the contents before you continue.

## Troubleshooting

**Every node except the control plane says *can't hold a backup target yet*.**
Expected, and not a licensing gate. The control plane writes every byte of every archive
itself, so until it can write into a mount on another machine the backup disk has to be one it
reaches directly. Attach the disk to the control-plane node.

**You selected another node and got a refusal instead of a disk list.**
An ineligible node is selectable but **is not scanned**. The control plane answers for it
without asking it at all, so you get the refusal and an empty list rather than an inventory.
Rescanning will not change that. Do not come to Storage to find out what is plugged into a
compute node — there is nothing there to ask.

**The disk you want shows `NOT ELIGIBLE` instead of a button.**
The control plane refused it, with its reason on hover. In practice that means the boot medium,
which can never be claimed.

**The card says `MARKER UNREADABLE`.**
The disk announces a backup set but its marker file could not be parsed. Such a disk can be
neither adopted — there is no partition UUID to adopt it by — nor claimed as blank, because the
backup-set refusal stands in the way. Destroying the set and claiming it fresh is the only way
forward for that disk.

**The drawer says the disk's key predates the keypair design.**
Some disks carry archives sealed under a single shared key from before Rasputin moved to a key
pair, and there is no way to convert one into the other. That disk cannot be adopted. Leave it
as it is and claim a different disk, or destroy what is on it and claim it fresh. Your
passphrase and recovery code still open the generations already on it, on a build that
understands them.

**The marker names a key but the disk carries no sealed copy of it.**
You get an amber warning rather than an unlock prompt. Adopting records the target, but
nothing on the cluster can produce that key — reading those archives will need a copy of the
passphrase or recovery code kept somewhere else entirely.

**Unlock fails and says the secret does not open the sealed copy.**
The wrapping is authenticated, so a wrong passphrase fails in front of you, in your browser,
before anything is submitted. Try the other custody path.

**Unlock fails with a key mismatch.**
The sealed copy opened — so the secret you used is the right one for this disk — but the key
inside it does not derive the public key the disk's marker carries. You are **not** holding the
wrong secret; the disk's own records disagree with each other, which is what an edited,
corrupted, or half-copied marker looks like. Do not adopt it and do not destroy it; take a copy
of it before doing anything else. This is a different fault from the control plane refusing a
key on restore, which means the key it was handed belongs to another set — see
[Restore a cluster](/docs/restore-a-cluster/).

**The claim job failed.**
Read the job in **Tasks**. If the format had already run, keep your recovery code — the disk
now carries that key, and adopting it later will ask for it.

**`BACK UP NOW` is grayed out.**
Its tooltip says *Claim a backup target first*. Until a disk is claimed there is nowhere to
write, and the page says so in as many words.

**The schedule dropdown reads `Scheduled backups off`.**
Then nothing runs on its own. That state is shown as an explicit option rather than a blank
control precisely so it cannot read as ordinary green.
