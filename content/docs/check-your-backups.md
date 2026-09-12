---
title: "Check your backups"
description: "Answering \"is my data actually backed up?\" from the Storage page — the one line that means yes, what the health probe does and does not prove, and the three numbers on the screen that all say \"kept\"."
weight: 61
applies-to: "2026.08.5"
---

Backups are a thing you check, not a thing you finish. This is the recurring visit: open
**Storage**, and in under a minute know whether your cluster is backed up, and if not, since
when.

Everything below assumes a claimed backup target — see [Set up backups](/docs/set-up-backups/).

`<generation-id>` stands for the identifier of one backup, and `<size>` for a size the page
prints. Your cluster shows its own values.

## Do this

<!-- SCREENSHOT: storage.png -->

1. **Look at the `HEALTH` badge** on the target's row. `OK` and `UNCHECKED` are the only two
   states that are not a problem. **Every other state fails every backup run until it
   changes**, and a badge that has been red for days means nothing has been backed up since it
   turned red. Hover it for the probe's own finding and when it last ran.
2. **Read the line at the top of `BACKUP RUNS`.** It reports the *last success*, never the
   last attempt: `Last successful backup 1d ago <generation-id>`, or
   `No backup has ever completed on this installation.`
3. **Check for a warning banner above that line.** If one is there, the generations it
   describes do **not** reach everything, and you should treat them as not containing your app
   data until it goes away on its own.
4. **Read the newest row in the runs table** — its `STATUS`, its `SCOPE`, and how long ago.
   `SCOPE` is `full` in green when the archive reached everything, and amber otherwise; hover
   it for the per-volume tally.
5. **If you need one now, press `BACK UP NOW`.** It runs immediately *in addition to* the
   schedule — it does not reset or reschedule anything, and its row is tagged `· manual`.
6. **To answer "how often do backups run?", read the schedule dropdown.** Nothing else on the
   screen answers that question.

`REFRESH` re-reads the run list and the schedule and changes nothing.

## What the health probe proves, and what it does not

Every five minutes Rasputin writes a small file to the target, flushes it to the disk with
`fsync`, reads it back, deletes it, and flushes the directory too. The whole probe runs under a
short budget, so a disk that has stopped answering produces a failure rather than a hung
check.

**What it protects you from.** The gap between backups. A disk that has left the bus, been
unmounted, or stopped taking writes is caught within five minutes instead of at the next
scheduled run — which on a weekly cadence could be six days of silence.

**What it does not prove.** The page states its own limit under the table, and it is worth
reading twice: *"That catches a disk that has left the bus or stopped taking writes between
backups; it cannot promise the next full run will succeed."* Concretely, `OK` proves the disk
is present, its filesystem is mounted, and it accepted a write a few minutes ago. `OK` does
**not** prove there is room for the next generation, that the disk will survive a
multi-gigabyte write, that the media is not degrading, or that the last backup succeeded. A
few kilobytes at 03:55 says nothing about a gigabyte at 04:00.

**So the run's own row is the record.** `HEALTH` is a liveness check on the disk; the runs
table is the only statement about whether your data got backed up. A failed run never appears
in the "last successful backup" line at all — if you want to know what a run did, read its
row.

One more property worth knowing: the badge list is not a closed set on screen. A state this
build does not recognise is rendered as its own upper-cased name **in red** rather than hidden
or treated as fine. A new failure mode reported by a newer control plane must never read as
green.

## `STATUS` is your decision; `HEALTH` is the disk

| Column | What it tracks |
| --- | --- |
| `STATUS` — `CLAIMED`, `PENDING`, `REPLACED`, `FAILED` | What you decided about this disk. `CLAIMED` does **not** change when the disk is unplugged |
| `HEALTH` — `OK`, `UNCHECKED`, `MISSING · since …`, `UNMOUNTED · since …`, `UNWRITABLE · since …`, `UNREACHABLE · since …` | What the disk is actually doing right now |

The table carries a row for every target this cluster has ever had, and rows are never
deleted. A `REPLACED` disk is still listed because it may hold the only copy of an archive.

## Three things on this screen say "kept"

This is the part of the page people misread, so read it once carefully.

1. **`Keep 4 (default)` in the dropdown** is the *setting*: how many generations you want on
   the disk from now on.
2. **"4 generations kept on the target, newest first"** under the controls is that same
   setting, restated as a sentence.
3. **`2 kept` in a run's `RETENTION` column is neither of those.** It is a *historical fact
   about that one run*: how many generations were on the disk at the moment that run finished.
   Only a succeeded run has a number there; every other status renders `—`.

A young cluster shows exactly this, and it is correct:

| `STATUS` | `GENERATION` | `SCOPE` | `SIZE` | `RETENTION` | `WHEN` |
| --- | --- | --- | --- | --- | --- |
| `SUCCEEDED · manual` | `<generation-id>` (newer) | `full` | `<size>` | `2 kept` | 1d ago |
| `SUCCEEDED · manual` | `<generation-id>` (older) | `full` | `<size>` | `1 kept` | 2d ago |

…while the dropdown says `Keep 4 (default)`. Nothing is wrong. The first run ever to complete
left one generation on the disk; the second left two. The setting is a ceiling, not a starting
position, and the cluster reaches it on the fourth run. If a run pruned anything its cell says
so too — `4 kept · 1 pruned`.

The practical rules:

- **"How often do backups run?"** — the schedule dropdown. Nothing else.
- **"How much history will I have?"** — the generations-kept dropdown.
- **"How much history did I have when that run finished?"** — that run's `RETENTION` cell.
- Do not read a low `RETENTION` number as a setting that changed behind your back, and do not
  read a high one as proof the setting is still what it was.

Lowering the generations-kept dropdown is **not** destructive at the moment you change it.
Pruning is a step of a backup run, so the disk converges on the new depth the next time a run
completes. And changing either dropdown changes only that dropdown — each carries the other's
current value along with it, so you can never reset one by adjusting the other.

There is a fourth number, elsewhere, that is easy to fold into these three. On the **Apps**
page an app that has never been backed up carries the control plane's own wording for its
backup state — *"not backed up yet: installed Nd ago; the first scheduled backup is due within
Nd Nh"*. That is an orientation estimate for one app's backup state. It is not part of the
restore flow, it does not appear beside a generation, and it is not a promise of a backup at a
particular clock time.

## What this screen never tells you

Worth knowing before you go looking for it:

- **There is no next-backup time, anywhere.** The schedule gives a cadence, not a clock time,
  and Rasputin makes no statement about when the next run will start.
- **A run's `SIZE` is the identity archive alone**, not the whole generation. Its tooltip is a
  *pre-run estimate*, broken down into identity, app volumes and margin — including any volume
  never captured before and therefore counted at a default.
- **Free space and retention headroom are never shown.** Nothing on this page tells you
  whether the next generation will fit.

## Troubleshooting

**`HEALTH` reads `MISSING · since …`.**
The disk left the bus, and every run fails until it comes back. Re-seat the disk, then
`RESCAN`. The badge clears on the next probe, within five minutes.

**`HEALTH` reads `UNWRITABLE`.**
The disk is mounted but rejected a write — often a read-only remount after an I/O error. Check
the disk's own health outside Rasputin, and claim a different disk if it is failing.

**`HEALTH` reads `UNCHECKED` and stays that way.**
No probe has completed. The first check runs within five minutes of the control plane
starting. If it persists, the target's node is not answering.

**`No backup has ever completed on this installation` with a disk claimed.**
Runs are being attempted and failing, or none has been attempted. Read the run rows for the
error; if the table is empty, check the schedule dropdown is not `Scheduled backups off`.

**A run row is `FAILED` with an error under the generation id.**
That run produced no generation. The error is the control plane's own. Fix the cause, then
re-run with `BACK UP NOW`.

**A run `SUCCEEDED` but its scope is amber.**
The archive does not reach everything. Hover the scope cell for the volume tally. A volume the
run tried to take and could not is shown as **FAILED** in capitals, ahead of everything else —
never as merely "skipped" — and those are the ones to act on.

**An undismissable warning banner sits above the success line.**
The control plane reported a scope that is not a positive, explicit "full" — an older scope
value, a response that never arrived, or a value this build does not recognise. The banner is
shown for all of those deliberately: a *missing* banner is a claim that your archives reach
everything, and only the control plane saying so in those words earns it.

**`RETENTION` is lower than the dropdown says.**
Normal on a young cluster, or after lowering the setting. Nothing to do — the disk converges
on the setting as runs complete.

**A banner says this cluster was restored from a generation.**
It names the generation, when it was applied, the archive key, and — critically — which app
volumes were **not** put back. Those are still sealed on the backup disk. See
[Restore a cluster](/docs/restore-a-cluster/).
