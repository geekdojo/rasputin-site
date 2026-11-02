---
title: "Restore a cluster"
description: "Putting a cluster's identity back onto a re-flashed control plane from an adopted backup disk — the first-run-only window, why it needs no sign-in, and why your app data is deliberately left alone."
weight: 62
applies-to: "2026.10.5"
---

Use this page when the machine running your control plane has died. You flash a replacement,
plug in your backup disk, and `/restore` puts your cluster back: your operators, passkeys, node
tokens, keys and your apps' secret store. App data is restored separately, one app at a time.

Before you start, you need all three:

- A backup disk you **adopted**, not one you claimed as blank.
- The **original cluster name**, and the **Rasputin release** the backup was taken on. If you
  don't know the release, flash the latest; step 7 refuses and names the one you need.
- Your **passphrase** or your **recovery code**. Either one is enough.

## Do this

<!-- SCREENSHOT: restore.png -->

1. **Flash the replacement control plane with the original cluster name and the release the
   backup was taken on.** [Get in the first time](/docs/get-in-the-first-time/#before-you-start)
   shows how to flash and where the name is set; older releases are on
   [the rasputin-os releases page](https://github.com/geekdojo/rasputin-os/releases). Stop that
   page once the machine is powered on: do not press `REGISTER PASSKEY`, it closes restore for
   good.
2. **Plug the adopted backup disk into the replacement machine.**
3. **Open the sign-in page and press `RESTORE FROM BACKUP →`.** Do not press
   `REGISTER PASSKEY`: it closes restore for good.
4. **Pick the disk under `1 · BACKUP DISK`.** Press `SCAN AGAIN` if you plugged it in late.
5. **Pick a generation under `2 · GENERATION`.** The newest usable one is already selected.
6. **Under `3 · UNLOCK THE ARCHIVE KEY`, choose `PASSPHRASE` or `RECOVERY CODE`** and type
   your secret.
7. **Press `RESTORE THIS GENERATION`** and wait; the control plane restarts, which can take up
   to four minutes.
8. **Press `SIGN IN WITH YOUR PASSKEY`** and use the passkey you had before the machine died.
9. **Open [Alerts](/docs/respond-to-an-alert/) and check that no secret-store alert is open.**
   `The secret store is paused for a backup.` is normal while a backup runs.
10. **Restore app data from Apps, one app at a time, only if you need to** — see
    [Restoring one app's data](/docs/your-apps/#restoring-one-apps-data).

## Details

### Identity only, and why your app data is left alone

Read this before you start; it is the single most misread thing about restore.

**Restored — the identity set:**

- The control plane's database: your operators, your **passkeys**, your nodes' enrollment
  tokens, and your app declarations.
- The **mesh certificate authority**.
- The **mesh state**.
- The **bus key**: the key every node checks the control plane's bus against, by its pin. Without
  it the replacement makes a new key, and no node holding the old pin connects to it. See
  [The bus key and pin](/docs/provisioning/#the-bus-key-and-pin).
- The **secret store**: its data (your apps' secrets), the seal key that opens it, and the
  store's own certificate authority. See
  [The secret store](/docs/set-up-backups/#the-secret-store-what-it-protects-and-what-it-does-not).

**Not restored — your app data.** Every app volume the generation holds stays **sealed on the
backup disk**, untouched. The page names them by volume twice: once under the generation you
picked, and again in the result.

> **IDENTITY ONLY.** This restores the database (users, passkeys, node tokens, app
> declarations), the mesh certificate authority and the mesh state.

That on-screen notice does not mention the secret store, but the store is restored all the same.

**Not restored — the secret store's audit log.** The replacement starts a new, empty one.

**Why the separation exists.** This is a design decision, not an unfinished feature. A
restored control plane is usually standing in front of **nodes that were never wiped**. The
machine that died was the control plane; your compute nodes kept running, and the app data on
their disks is very likely **newer than anything in any archive**. A restore that automatically
pushed archived volumes over them would not be a recovery — it would be automatic data loss,
performed without asking you first.

**So the second half is a deliberate, per-app, post-login action:** sign in, open **Apps**,
select the app, and choose **`RESTORE DATA FROM A BACKUP…`** from its drawer. One app at a
time, one generation you pick, with the archive secret asked for again. Nothing restores app
data automatically, ever. That flow is documented in
[Restoring one app's data](/docs/your-apps/#restoring-one-apps-data).

**What you cannot take back — and what you can.** Nothing is written over your live
installation when you submit. Everything is extracted into a staging area and verified file by
file against the manifest; it moves into place once, at the next start, before any database is
opened. The fresh install's own identity files are moved aside rather than deleted, and a
restore that fails leaves the machine exactly as it found it. Nothing on the backup disk is
modified at any point, so there is no risk in trying again.

### Only an adopted disk can be restored from

This is the precondition, and it is not decided on this page. It was decided on **Storage**,
possibly months ago.

A backup disk carries the two sealed copies of its archive key in its own marker file, and
`/restore` needs those copies — they are what your passphrase or recovery code unwraps.

- **A disk you adopted** — taken over as it stood — still carries them, and can be restored
  from.
- **A disk you claimed as blank, wiped, or reformatted does not.** Claiming destroys the
  marker, and with it the only copies of the wrapped key. The archives may still be sitting
  there; nothing will ever open them again.

**What you cannot take back.** That one. If you plug a disk in to restore from it and the
drawer on Storage offers you both paths, adopt. The green callout says so in as many words:
*"If you plugged this disk in to restore from it, this is the choice you want."*

### The cluster-id refusal

`<original-name>` here is the name the dead cluster answered to. If the archive was written by a cluster with a **different name** than the one this box was
flashed with, the page refuses to submit and explains why in full — that the archive's
passkeys bind to `<original-name>.local`, that your nodes dial that name, and that you should
re-flash with the original cluster name before restoring.

**This is not pedantry about labels.** Your cluster's name is load-bearing in two places the
archive cannot reach:

- **Your passkeys are bound to `<original-name>.local`.** A browser will not offer a passkey
  to a site with a different name, so restored passkeys on a differently-named box are
  unusable credentials.
- **Every node's connection address is derived from it.** Restored node tokens would have your
  nodes dialling a name that no longer answers.

The archive restores credentials and tokens. It cannot restore the hostname — that was written
when you flashed the machine. **So the fix is to re-flash the replacement with the original
cluster name and come back.** Nothing is wrong with your disk, and refusing is the right
outcome: the alternative is a box that half-works, with credentials nothing will offer and
nodes calling an address that does not exist.

### If it does not come back — the four-minute deadline

The page polls every couple of seconds, waiting for the control plane to come back **reporting
operators** — which is the only real proof that the restored database is the one now serving.
That is why the wait is not a spinner with a guess on it.

It waits four minutes, which is generous on purpose: a restart is seconds, but an appliance
with no battery-backed clock can hold its HTTPS listener considerably longer while it settles
its time. After four minutes the page says the restore is staged but the control plane has not
come back, and that **nothing on the backup disk was changed**.

What to do, in order:

1. **Press `RELOAD`.** If the control plane came back while the page was not looking, this
   finds it.
2. **If the address does not answer at all, power-cycle or restart the machine.** The staged
   restore is not lost — it applies on the next start, whenever that is. **The backup disk does
   not need to be attached for that restart**: everything the restore needs was copied off it
   before the page ever said `RESTORING`.

### Checking your nodes and the secret store afterwards

Nodes reconnect with the tokens they already hold, to a bus holding the key their pin names, and
need no re-enrolling. A node enrolled *after* the re-flash holds the wrong certificate authority;
the control plane re-delivers it automatically, shown under **Mesh → DEVICES** as
`TRUST STALE · re-delivering`, which clears itself.

On **Alerts**, a secret-store alert is one whose title begins `The secret store`, or
`The control plane cannot use the secret store.`, or `A seal-key rotation did not finish.`. The
one exception is `The secret store is paused for a backup.`, which is normal while a backup runs.
If another is open, read its detail on **Alerts**; the empty-store alert has its own entry under
[Troubleshooting](#troubleshooting).

### Why this page needs no sign-in, and when it closes forever

The page and the two endpoints behind it are **unauthenticated**, and they have to be. A
re-flashed control plane has no users, so there is no session to require and no passkey to
present. Requiring one would make restore impossible in exactly the situation restore exists
for.

What gates it instead is the fact that decides whether a box is at first run at all: **does
any operator exist?** The moment the first passkey is registered, both endpoints answer with a
refusal and **stay closed for the life of the installation**. There is no setting, no
override, and no re-opening. Visit `/restore` on a cluster that is already set up and the
whole page is a refusal plus a `SIGN IN` button.

**What makes that safe is custody, not authentication.** The control plane will only unpack an
archive whose key *you* supplied, and only a key that proves it belongs to the disk in front
of it:

- The archive's contents are sealed under a key that exists only in two wrapped copies on the
  disk itself, openable by your passphrase or your recovery code and nothing else.
- Before anything is touched, the supplied key must derive the **public key written on that
  disk's own marker**. A key that opens some other disk is refused.
- There is deliberately no separate signature to check: a signing key that survived a re-flash
  would be the same custody problem over again.

So restoring onto a fresh box needs all three of: reach to a freshly flashed machine on your
network, your backup disk physically plugged into it, and your custody secret. That is a
description of you, doing the thing this page is for. It is the same open window that
first-passkey registration already accepts on a fresh box on a private network, and it closes
at the same moment.

**What that does not protect.** Restore stays open until the first passkey is registered, and
the archive secret is the only thing authorizing it. So the practical care is ordinary: keep the
backup disk and its secret apart rather than together in the same bag, and register the first
passkey on a replacement box once you are done rather than leaving it unfinished.

**What you cannot take back.** Registering the first passkey. Do the restore *before* you
create an account on the replacement — getting back to this page afterwards means re-flashing
the control plane onto a fresh partition.

### Where your secret goes

The page states it under the form: *"The secret never leaves this browser. It unwraps the
disk's archive key here; that key is checked against the disk, sent once to the controlplane
over its secure connection, and discarded on both sides when the restore ends."*

That is literally what happens. Your passphrase or recovery code is used **in the browser** to
unwrap the disk's archive key. The browser then checks that the unwrapped key really belongs
to this disk before sending anything. The control plane repeats that check on its own side,
against the marker it reads off the mounted disk rather than the listing your browser worked
from — so the two catch different things: a wrong secret never leaves the browser, and a
right-looking key aimed at the wrong disk is stopped by the control plane. Only the unwrapped
key is transmitted, once, for this one
restore, and both sides overwrite their copy when the restore ends — bar one copy of the
encoded key inside the request itself, which the control plane cannot overwrite and instead
drops with the request.

**What that protects.** Your passphrase and your recovery code are never sent anywhere and are
never stored on the cluster. A wrong secret fails in your browser, before anything is
submitted.

**What it does not protect.** It is the same property that means nobody — Rasputin included —
can recover a backup set for you if you lose both secrets. There is no escrow behind this.

### If the secret store's key is lost

**What you see.** The control plane's web page never loads. On the control plane's own console —
a monitor on its HDMI port, or its serial line — this line appears while it boots, sometimes
after a timestamp:

```
rasputin-seal-key: outcome=refused key_id=- reason="The secrets store has data but no seal key, so this control plane will not start. A new key cannot open the existing data. Recover by restoring a backup onto a fresh install."
```

The console in [Open a serial console](/docs/open-a-serial-console/) is opened from the control
plane's own web page, so it cannot reach a control plane in this state; that page's
[hardware section](/docs/open-a-serial-console/#whether-your-hardware-has-a-console-at-all) says
which boards have a serial line at all.

**Why.** The secret store's data is on the disk, but the key that opens it is gone. A new key
cannot open the old data, so the control plane's service is held back from starting rather than
coming up on a store nothing can read.

**What brings it back.** Only a restore from a backup. Re-flash the control plane with the
original cluster name and the release your backup was taken on, then follow [Do this](#do-this).

**With no backup.** The cluster does not start, and nothing in Rasputin re-creates an empty store
or rebuilds the cluster for you. Rebuilding is your job: re-flash the control plane as a new
cluster, then provision every node again. Each node still holds the old cluster's bus pin, so
none of them joins the new cluster until it is provisioned again — see
[Provisioning](/docs/provisioning/). Every secret the store held is gone.

Rasputin stops here on purpose. A store that came back empty under a cluster that still expects
its secrets would break your apps in ways no one could predict.

## Troubleshooting

**`Restore is offered only before the first operator is registered`.**
A passkey has been registered on this box and the window is closed permanently. Re-flash the
control plane, then restore before registering anything.

**You cannot find restore in first-run setup.**
It is not there and never was. Identity restore lives at `/restore`, reached from the sign-in
page — a first-run branch on a replacement machine, not a step of setup. The sign-in page offers
it only while a backup set is attached; typing the address `/restore` works with no disk
attached too.

**`No attached disk carries a Rasputin backup set`.**
The disk is not attached, not mounted, or is not a Rasputin backup set. Attach it to *this*
machine and press `SCAN AGAIN`; restore reads the disk locally. If this cluster's ledger knows
about a claimed target that is not attached, the page names it with its last health check
rather than showing an empty list — a brand-new replacement has no ledger, so it will not show
that.

**A disk row says `cannot restore`.**
An amber sentence under it says why, and most reasons are terminal for that disk: you pointed
at the boot medium; the marker could not be read or names no partition UUID; the disk could
not be mounted; the disk's archive key predates the keypair design and this build cannot open
its generations; or the disk is a valid backup set whose every generation is unusable. The
rows are not clickable, deliberately.

**The disk is fine but every generation is unusable.**
The reason is in amber on each row. The common one is a re-keyed disk — a generation sealed to
a key the disk's marker no longer names, which your current secret cannot open. Others: no
identity archive in the generation, a damaged manifest, a manifest in a newer format than this
image reads (if the manifest records the release that took the backup, the reason names it:
flash that release, as in step 1), or a manifest naming no database, which restores nothing
this page puts back.

**A generation is badged `incomplete` — can you still use it?**
Usually yes. `incomplete` means the run that wrote it did not reach everything it meant to,
which mostly concerns app volumes. It is still restorable if it holds the identity set. Note
the badge and the headline do not spell it the same way — the badge is lower case and the
headline shouts it.

**A disk badged `2 generation(s)` shows five rows.**
The count is only of generations this build can read. It does not check which release took
each one, so a counted generation can still be refused at step 7 if the backup was taken on a
different release (see the version refusal below). Section 2 lists the unusable ones as well,
with their reasons.

**`That does not open this disk's archive key.`**
Wrong passphrase or recovery code — and **nothing was sent**, this failed in your browser. Try
the other custody path. A recovery code ignores dashes and case, and submit stays disabled
until what you typed reduces to exactly 32 characters, a useful check you dropped none. Its
alphabet has no `I`, `L`, `O` or `U`; the field strips punctuation and upper-cases what you type but does not reject
those letters, so an `O` typed where a `0` belongs still counts toward the 32 and fails here.

**`The controlplane refused the key: it does not belong to this disk.`**
This is the control plane's check, not the browser's. It re-derives the public key from the key
it was handed and compares it with the marker on the disk it actually mounted, so you see this
when the key that arrived belongs to a different backup set, or the disk under it is not the
one the request named. Restore from the disk the key belongs to. A key mismatch reported during
*unlock* is a different fault — there the secret is right and the disk's own records disagree
with each other; that one fails in your browser and never reaches the control plane.

**`a restore is already prepared and waiting for the api to restart`.**
One restore is staged already. Restart the control plane to apply it. One at a time, by design.

**`the archive did not pass verification`.**
A file in the archive failed its digest or structure check. Nothing was written. Try an older
generation.

**`This backup was taken on control plane version` … `Flash release` … `onto this board and restore again.`**
The backup was taken on a different Rasputin release from the one this replacement runs, and a
restore works only on the release that took the backup. The message names that release. Flash
the rasputin-os release with that number onto the replacement, with the same cluster name, and
restore again. You can update to a newer release afterwards.

**`This backup records no control plane version`.**
The backup was taken on Rasputin 2026.10.2 or earlier, before backups recorded their release.
2026.10.5 cannot restore it, and neither can any later release. As the message says, it can be
restored only on the release it was taken on, and the backup does not say which release that
was: use the one your old control plane last ran. A backup that old holds no secret store.

**`The secret store is empty, but this cluster was set up.`**
The control plane started with an empty secret store on a cluster that had already been set up,
so the secrets your apps were given are not there. Apps that use secrets cannot be deployed, and
backups are refused so the empty store never replaces a good backup. Only a restore brings the
store's data back, and restore is offered only before the first operator is registered. So
re-flash the control plane with the original cluster name and the release your latest backup was
taken on, then restore from that backup.

**`restore is not configured on this api`.**
This build of the control plane has no restore surface wired. Nothing on this page will help;
flash an appliance image.

**The page sits in `STILL WAITING`.**
The control plane has not come back with operators within four minutes. `RELOAD`, then restart
the machine by hand — the restore applies on its next start, with or without the disk attached.

**Restored, but an app has no data.**
Expected. App volumes are never restored by this page. Restore them per app from the app's
drawer in **Apps** — see [Restoring one app's data](/docs/your-apps/#restoring-one-apps-data) —
after checking whether the node's own copy is newer, because in many recoveries it is, and the
right answer is to restore nothing.

**Your old passkey is not offered on the sign-in page.**
The cluster name does not match the one the archive was written by. See
[The cluster-id refusal](#the-cluster-id-refusal).
