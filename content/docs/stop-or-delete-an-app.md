---
title: "Stop or delete an app"
description: "Stopping an app is always safe; deleting one turns on a single checkbox that decides whether its data survives — this is where operators lose data."
weight: 42
applies-to: "2026.08.5"
---

Two controls on an app's row, and only one of them can cost you anything. `STOP` is fully
reversible. `DELETE` asks you one question whose answer is permanent.

## Do this

**To quiet an app or free memory on a node:**

1. **Press `STOP` on its row.** Its containers go; **its data does not.** The row stays in
   the table as `STOPPED`.
2. **Press `START` when you want it back.** The same stack comes up against the same
   volumes.

**To remove an app for good:**

1. **Press `DELETE` on its row.** Nothing is destroyed by the click — it opens a `DELETE APP`
   dialog, which names the node the data lives on and lists every volume the app's tile
   declares.
2. **Read the `LAST BACKUP` column.** A red `never` means no retained backup holds that
   volume.
3. **Decide the `Delete volumes?` checkbox.** It **starts unticked**, and your answer is the
   whole difference between the two outcomes. The confirm button relabels itself to say which
   one you are about to get.
4. **Press the confirm button** — `DELETE APP, KEEP VOLUMES`, or `DELETE APP + VOLUMES`.
5. **If you kept the volumes, deal with them later** under `ORPHANED VOLUMES` at the bottom
   of the **Apps** page, where you can see them, size them, and reclaim the space.

## What `STOP` does to your data

**What it protects.** Everything. `STOP` runs `docker compose down` against the app's stack
on its target node: the containers are removed, and so is the network Compose created for
them. **The app's named volumes are not touched** — all of its data stays on the node's disk
exactly as it was. The Compose file stays on the node too, and the row stays in the table as
`STOPPED`. Pressing `START` brings the same stack back up against the same volumes, and
nothing is lost.

**What it does not do.** It does not remove the app, free its disk space, or withdraw its
names. It is the right control for freeing memory on a node, quieting an app you are not
using, or getting a misbehaving stack to a known state — not for getting rid of one.

**The consequence, and what you cannot take back.** Neither, in either direction: this is a
safe, fully reversible operation. **There is no variant of `STOP` that deletes data, and no
path anywhere in the UI that stops an app and removes its data in one action.** Losing data
requires `DELETE` and a tick.

## What `DELETE` does to your data

The dialog lists every volume the app's **tile declares**, with its `CLASS` — what losing it
would cost — and its `LAST BACKUP`. The list is built from the tile's declaration, not from
the node, so a volume the Compose stack creates that its tile failed to declare is not shown;
it is left behind and turns up later under `ORPHANED VOLUMES`.

Every tile must classify every volume it declares — a tile that leaves one unclassified is
refused — so each row carries one of four classes. `CRITICAL` (red) is secrets, credentials
and keys: unrecoverable, and staleness is itself harmful. `STATE` (amber) is irreplaceable
application state. Both are backed up whenever the cluster has a target, and they are
therefore the only classes `LAST BACKUP` can read anything but `never` for. `CACHE` is a
regenerable index or model cache and is never copied into a backup. `BULK` is a user media
library, potentially terabytes, not captured in this release — a backup run records it as
skipped and says so rather than passing over it silently. There is no per-volume control over
any of this: the class the tile declares is what the backup job acts on.

**The consequence of each choice.**

`DELETE APP, KEEP VOLUMES` — the checkbox left unticked:

- The stack is stopped with `docker compose down`: containers gone, volumes untouched.
- The app's per-app TLS material and proxy route are torn down, and its DNS names stop
  resolving.
- The app's row is removed from the table.
- **Its data stays on the node's disk.** Nothing owns it and **nothing backs it up any
  more.** It reappears under `ORPHANED VOLUMES`, where you can see it, size it, and remove it
  later.

`DELETE APP + VOLUMES` — the checkbox ticked:

- The stack is stopped with `docker compose down -v`, which removes the containers **and**
  the named and anonymous volumes belonging to that Compose project.
- Everything else is as above, and there is nothing of the project's own volumes left to
  orphan.
- **Scope is the Compose project's own volumes**, and that is the limit of it. A volume the
  stack declared `external`, or a bind-mounted path on the node, is outside that scope and
  stays where it is. This control cannot be pointed at a volume by name and cannot reach a
  volume another app created.

**What you cannot take back.** Ticking the box is **permanent, and there is no undo.** If you
tick it over a `CRITICAL` or `STATE` volume that has **never** been captured into a retained
backup, the dialog says so in red before you can confirm — naming the volume and telling you
plainly that deleting it destroys the only copy of that data. Read that sentence; it is the
last thing standing between you and a gone password vault.

**When the node cannot be reached**, the two choices diverge:

- **Keeping the volumes still proceeds.** The row is removed and a warning is logged: if that
  node comes back, its containers may reappear until the cluster reconciles.
- **Deleting the volumes is refused outright**, naming the node — not queued for later. The
  app stays in the table. Deleting data the control plane cannot actually reach would leave it
  behind while you believed it was gone. Either delete without the volumes, or retry when the
  node is back.

## Volumes you kept — `ORPHANED VOLUMES`

Below the table, when there is anything to show, is `ORPHANED VOLUMES`: data left on a node by
apps that are no longer installed. Nothing owns it, nothing backs it up, and it counts against
that node's disk until you reclaim it. Volumes are grouped by former app and node, each with
its size on disk, backup class and last capture. **This is the one place a size appears** —
the delete dialog has none, because the app's own volume listing carries no size.

A class here can also read `UNCLASSIFIED` (orange), which the delete dialog can never show.
The app's row is gone, so the only surviving record of what a volume held is a backup
manifest; where no retained manifest names it, its class is simply unknown and it is treated
as though it mattered.

`RECLAIM` opens the same informed confirmation the delete uses — same volume table, same red
warning over never-backed-up data — except that here the volumes *are* the act, so **the
confirm button stays disabled until you tick the box**. The dialog is titled `RECLAIM VOLUMES`
and its confirm button reads `DELETE VOLUMES`. As with delete, reclaim on an offline node is
refused outright rather than queued, and if a node could not be checked at all the page says
so and names it.

## Troubleshooting

**`DELETE` refused and named a node.**
You ticked `Delete volumes?` and that node is offline. The control plane will not report data
as deleted when it cannot reach it. Delete without the volumes, or bring the node back and
retry.

**You deleted with volumes and it says the volumes were not deleted.**
The app's Compose file is missing from the node, and Compose cannot resolve a project it has
no file for. Anything that still exists shows up under `ORPHANED VOLUMES`.

**The app is gone from the table but its containers are still running.**
The node was unreachable when you deleted it. Its containers may reappear until the cluster
reconciles.

**A volume you expected in the delete dialog was not listed.**
The list comes from the tile's declaration, not from the node. An undeclared volume is left
behind and appears under `ORPHANED VOLUMES`.

**`STOP` did not free any disk space.**
It is not meant to. `STOP` never touches a volume; only `DELETE` with the box ticked, or
`RECLAIM`, removes data.

**You deleted an app and its data is still on the node.**
You left `Delete volumes?` unticked, which is the safe default. The data is under
`ORPHANED VOLUMES` at the bottom of the **Apps** page — `RECLAIM` removes it.
