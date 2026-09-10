---
title: "How backups work in Rasputin"
date: 2026-09-10
description: "Initial support for backups in Rasputin: what a backup contains, how each volume is classified and quiesced, why the control plane holds no key that can open an archive, and how restore works."
summary: "Initial support for backups in Rasputin: what a backup contains, how each volume is classified and quiesced, why the control plane holds no key that can open an archive, and how restore works."
---

Today, we're releasing initial support for backups within Rasputin. This is the first
implementation of a broader suite of backup tools with enough functionality to
protect data on the control plane and compute nodes. A future enhancement will
add offsite support to cloud blob storage.

A Rasputin backup is one full archive per run:
- for the control plane, its identity: the database, mesh CA and tailnet state,
- for compute nodes, the volumes of every deployed app, according to each volume's classification.

Backups are sealed and written to a control plane disk (USB, second NVMe, etc.) you picked in the UI.
The control plane can write those archives and cannot read them back. There is no
key on the box that opens one.

## Volume classification

The original design made app data an opt-in checkbox per app, justified by archive
size. That's backwards for the class of app where backup matters most: a password
vault whose backup is off by default is worse than no vault, because you believe
you have one. Backup is now a declared property of every volume in the app catalog,
enforced by the tile schema.

| Class | What it means | Backed up |
|---|---|---|
| `critical` | Secrets, credentials, keys — state whose staleness is itself harmful | Always; you can't switch it off |
| `state` | Irreplaceable app state | Always by default; you can exclude it |
| `cache` | Regenerable index, queue or model cache | Never |
| `bulk` | Media libraries | Opt-in per app |

There's no default value: **an unclassified volume fails schema validation** and fails
CI, because a default is silently correct for the volumes where it doesn't matter
and silently wrong for the one where it does. Sixteen tiles declare thirty-five
volumes today, exactly one of them `critical`.

Classification is per volume rather than per app, which two tiles justify on their
own. `open-webui-data` holds chat history and password hashes, and a tile-level
rule would have swept it into "Ollama is a model cache". `romm-assets` reads like
box art and holds save files.

## Backup consistency

Each volume declares how to quiesce it: `none`, `stop`, `sqlite`, `postgres` or
`mysql`. `stop` is the default, because stopping the container yields
clean-shutdown consistency for free — a stronger guarantee than a dump, and it
requires the agent to know nothing whatsoever about the engine inside. What
shipped is one dump driver: `sqlite` exists; `postgres` and `mysql` refuse and
name the volume they refused. Immich and RomM both take `stop`, because dumping
Immich's Postgres while uploads keep landing produces an archive whose rows and
files disagree.

The agent builds the whole sealed archive on the node's own disk before it uploads
anything, because every node's upload converges on the control plane's single NIC
and a streamed volume under `quiesce: stop` would keep the app down for the entire
transfer. Staged, the stop lasts as long as a local disk write — and the restart
at the end of it is unconditional and entirely local. A watchdog armed at stop
time fires regardless of the upload's outcome or the api's reachability, because
restoring service must never depend on a party that might be partitioned away.

## The key the control plane doesn't have

The archive holds `rasputin.db` — users, passkey credentials, bus tokens, every
app declaration — plus the mesh CA private key and the tailnet's Headscale state.
Unencrypted, that's a portable copy of every secret in the cluster, which is
exactly what it was until I looked at it properly.

One constraint decides the design: the key cannot live on the control plane. A
backup exists to survive the control plane's death, and any key the api stores
under `/var/lib/rasputin` is inside the archive it encrypts. TPM sealing doesn't
rescue it either, because a replacement control plane has a different TPM.

So your browser mints an X25519 keypair when you configure the backup target. The
control plane keeps only the public half, in the clear, and every run encrypts to
it with a fresh ephemeral key. The private half is wrapped twice — once under a
passphrase you choose, once under a recovery code shown to you exactly once — and
both wrapped copies live on the backup disk, not on the cluster. A stolen
`persistent` partition yields a public key; a stolen backup disk yields nothing
without one of the two custody secrets; and the weekly job needs no human at
3 a.m., because writing only ever needs the public half. The cost is that the
control plane can write archives and can't read them back without you, which is
survivable because restore is interactive by construction.

One honesty note. An earlier version of this design said the archive "is designed
to leave the premises". It isn't. A USB disk left permanently plugged into an
always-on appliance carries the same fire, theft and chassis-loss exposure as the
internal drive the target can also be. Removability is the only thing separating
the two, and only if you exercise it.

## Picking the disk

You pick the backup disk in the UI and Rasputin formats it, once, at configuration
time, behind a destructive confirmation showing model, size and current contents.
The boot medium is excluded, and the exclusion is re-checked immediately
before the format runs. Rasputin identifies it as the device holding the currently
mounted boot and `persistent` partitions — never by device name, because `nvme0n1` and `nvme1n1`
don't reliably enumerate the same way twice.

## Restore, in two phases

**Identity comes back before the api starts.** On a fresh cluster the setup wizard
offers any attached disk carrying a backup set, takes your passphrase or recovery
code, stages the database, mesh CA and Headscale state into place, exits, and is
restarted by its unit under the restored identity. Same CA, same passkeys, same
bus tokens: no re-trust, no re-enrolment, no re-registration.

**App data never comes back on its own.** A restored control plane is very often
standing in front of nodes that were never wiped, whose volumes are newer than any
archive, so an automatic restore there is an automatic data loss. Per-app restore
is an explicit action from the app's drawer:

- Your custody secret unwraps the private key in the browser; the key reaches the
  api once and lives in memory for that one job. The node never holds it.
- The archive is unpacked and digest-verified beside the live volume while the app
  keeps running, so the transfer contributes no downtime at all. Only then: arm
  the watchdog, stop, swap, start. The swap is a `renameat2` exchange, so both
  directories exist at every instant.
- The previous contents stay on disk under a timestamped name. Reclaiming that
  space is a deliberate act, not a side effect of the restore.
- Every refusal — app not installed, node offline, wrong volume class, a symlink
  in the archive, a digest mismatch — leaves the live volume untouched.

## Failing loudly

Backups run weekly by default on a configurable interval, and a "Back up now" button runs the same saga
on the same job bus as an OS update. Every run is a full, and retention is four
generations, oldest pruned first.

The schedule is an elapsed-time rule rather than a calendar. A calendar rule fires
at a moment, and an appliance that was powered off, mid-update, or booted five
minutes after the window simply misses that week — silently, because nothing
failed. An elapsed rule catches up. The price is that "weekly at 3 a.m." is
approximated rather than met.

Failure shows up in three places: `OVERDUE` on the app's tile with the time since
its last success, an alert, and an entry in the job feed. An app whose host node is
offline at backup time is failed, not quietly skipped. You can still install a
`critical` app with no backup target, with a recorded acknowledgement and a nag
that doesn't go away — a first-run user hasn't plugged a disk in yet, and refusing
the install would teach them the product is broken rather than that their vault is
unprotected.

## Feedback welcome

What would you want an offsite target to look like, given that whoever holds the bytes must not be able to read
them and the box that writes them can't read them either? Issues and arguments
welcome on the repo.

For now, backups are local, sealed so only your passphrase or recovery code can
open them, and restorable end to end on any non-boot disk.

{{< devlog-footer >}}
