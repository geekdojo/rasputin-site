---
title: "Know whether an update worked"
description: "Reading the run report and HISTORY after an update: the four checks behind COMMITTED, why a green result can still be DEGRADED, and what rollback does to a node about two seconds later."
weight: 71
applies-to: "2026.08.5"
---

You have run an update — a fleet rollout, or one node — and now you want to know what actually
happened. This page is the record and how to read it. If you have not started a run yet, go to
[Roll out an update](/docs/roll-out-an-update/) first.

`<arch>` below is `amd64` or `arm64`.

## Where to look

1. **The run report.** A `SYSTEM UPDATES` section appears with one panel per run. Its header
   gives the run's status, its id, and a live tally: *N succeeded · N failed · N updating · N
   never started · N stranded · N planned*. Below it is the report grid — one row per planned
   node, **in planned order**, never in completion order, so two runs of the same update produce
   reports you can compare. The grid is stored with the run rather than rebuilt from a live event
   stream, so it survives a page reload. A fleet update can run for half an hour, and the report
   is the thing you come back to.
2. **`LIVE EVENTS`**, at the bottom of the page, shows the most recent per-node changes as they
   happen.
3. **`HISTORY`**, one row per node update, newest first. This is the durable record, per node
   rather than per run.

| `HISTORY` column | What it means |
| --- | --- |
| `NODE` | The node that was updated |
| `VERSION` | `from → to`, or just the target version when the previous one was not known |
| `SLOT` | `a → b` or `b → a` — which system slot it left and which it landed on, or `—` when the slot it started from was not known |
| `STATUS` | `COMMITTED`, `ROLLED BACK`, `FAILED`, or `IN PROGRESS` |
| `STARTED` / `FINISHED` | Times for the update itself |
| `NOTES` | The error, when there was one |

One status answers the question in this page's title: **`COMMITTED`**. What it takes to earn
that word is the verify contract, and what happens when a node cannot earn it is rollback. Both
are below.

## The verify contract

This is your basis for trusting a green report, so it is worth knowing exactly what it claims. A
node is recorded as updated only when **all four** of these hold — and three of the four are
checks a naive updater skips.

| | Check | Why it is there |
| --- | --- | --- |
| **a. Fresh boot** | The agent answering is on a **different boot** than the one that was told to reboot | The old agent answers perfectly well for the few seconds it takes to shut down. Without this, a healthy node that *had* rebooted onto the new system could be checked on the old one and recorded as a rollback |
| **b. Correct slot** | The node came up on the slot the update wrote | The direct question: did the bootloader actually switch? |
| **c. Correct version** | The version the node reports running is the version the bundle installed | A node on the right slot running the wrong version is neither a rollback nor a success — something other than this update wrote that slot |
| **d. Health** | The post-reboot health battery passes | Booting is not working. The checks are role-aware: on the firewall the packet-filter ruleset and DNS service are treated as critical while a WAN route still re-acquiring its address is not, so a firewall is not rolled back for a DHCP lease it is in the middle of getting |

**What it protects.** Only when (a)–(c) pass does Rasputin run (d); only when (d) passes does it
**commit** the new slot. So `COMMITTED` means the node booted a *different boot*, onto the slot
the update wrote, running the version the bundle installed, and passed its health checks. Three
of those four are the difference between "the machine answered" and "the machine updated".

**What it does not protect.** Each of (a)–(c) is three-valued, never a simple yes/no: "unknown"
is a real answer. An older agent that cannot report its boot identity, or a node that cannot say
what version it is running, **degrades** the verdict rather than failing it. A degraded pass is
still a pass — and it is labeled.

**Any** row can carry an amber `DEGRADED` badge beside its status, a `ROLLED BACK` or `FAILED`
row as readily as a committed one, because the badge is about the *evidence* rather than the
outcome: it says at least one conjunct could not be evaluated. On a `COMMITTED` row it means the
success rests on less evidence than a fully verified one — which is still a success. Hover it for
which check:

> Verified on fewer checks than usual: boot identity not reported (agent predates it); running
> version not reported. The update succeeded on the checks that could run.

The two causes behave differently. An unverified **boot identity** usually means an agent older
than the feature, and the next rollout fixes it by itself. An unverified **version** means the
node could not say what it is running, which does not heal on its own and is worth a look.

**The consequence: mixed-version fleets are the normal case, not an error state.** A fleet
update is mixed-version by definition — you are updating from something to something else, and
not every node gets there at once. Rasputin's commitment is that it **degrades loudly rather
than silently**:

- The first fleet update on a cluster with older agents will typically run `DEGRADED`
  throughout, and will say so. After one full rollout, subsequent rollouts are fully verified.
- A node whose reported version is not trusted turns its component **amber**
  (`NEEDS ATTENTION`), not green — otherwise a node that rolled back while reporting the version
  it was *meant* to reach would vanish from "what needs updating" while sitting on the old image.
- A node with no artifact for its architecture is `STRANDED`, in red, and fails the whole run
  even if every node that *was* attempted committed cleanly. A fleet where half the nodes updated
  and half were left behind is not a success and is never reported as one.
- A run that stopped on purpose looks different from one that ran out of nodes. Nodes the canary
  gate or the failure budget protected read `NOT STARTED`, and the row says which of the two
  stopped it.

One difference is not drift at all: **the firewall pins its agent separately** from the OS nodes,
so the firewall legitimately reporting a different agent version from the rest of the fleet is
expected rather than a node left behind.

The one thing Rasputin will not do is average any of this away into a single green tick.

**What you cannot take back.** A failed health check costs you a second, unprompted reboot of
that node — see below. Expect it as part of a failed update rather than discovering it.

## Rollback and the two system slots

**What it protects.** Every Rasputin node carries **two system slots**, `a` and `b`, plus a
separate persistent partition that is never touched by an update. At any moment one slot is
running and the other is idle. An update writes the new system into the **idle** slot, leaving
the running one completely intact, then reboots into the new one. That is why the failure mode
here is a node that did not update, rather than a node you have to re-flash.

That first boot is a **trial**. The node is running the new system, but the bootloader has not
yet been told to keep it. Rasputin runs the verify contract, and only if all four checks pass
does it send the node a *mark good* — at which point the new slot becomes the permanent choice
and the `HISTORY` row reads `COMMITTED`. It is the only status that means the update stuck.

The persistent partition survives all of this, which is why an update does not cost you your
database, your passkeys, your mesh identity, or your app data. And in every failure path the node
still has a working system. That is the whole point of the two slots.

**What it does not protect.** Two paths produce `ROLLED BACK`, and `NOTES` tells you which:

- **The bootloader reverted it.** The node came up on the slot it started from rather than the
  one the update wrote. The note reads *bootloader watchdog or post-install init failure* — the
  new system did not come up far enough, so the boot counter ran out and the bootloader fell
  back. The node is running its old system and is fine.
- **The health check failed.** The node booted the new slot, but the post-reboot checks did not
  pass. Rasputin marks the slot bad and **the node reboots itself back to its previous system
  about two seconds later, on both slot backends.** It does not wait for its next boot: there is
  no window and nothing for you to schedule, and a node that fails its health check goes down
  again on its own almost immediately. This is the one place an update reboots a node a second
  time, unasked. The note names the failing check. Because the node is passing through a version
  it is about to leave, Rasputin records its reported version as *unconfirmed* rather than
  asserting either one — which is what makes that component read `NEEDS ATTENTION` on the next
  check instead of green.

`FAILED` is different again: the update never got as far as a verdict on a slot — it failed
validating, downloading, installing, or rebooting. Every path now records a terminal status, so a
row does not sit in `IN PROGRESS` forever.

The limit worth naming: **rollback is per node and automatic, and it is not a fleet undo.** There
is nothing on this page that walks a fleet back to its previous release. The only thing that
triggers a rollback is the node's own verify contract failing — and on a node that committed
cleanly, it has already passed.

**What you cannot take back.** A commit is a decision the cluster made and kept: the bootloader
has been told to prefer the new slot, and the system you came from is now the idle one. `HISTORY`
records which slot it left and which it landed on, so the record of what happened survives even
when the machine no longer shows it.

## Troubleshooting

**The run ended with nodes `NOT STARTED`.**
They were protected, not broken: either the canary gate aborted before fan-out, or their tier's
failure budget was spent. Each row says which. Those nodes are untouched and still on their
previous system. `NOT STARTED` and `FAILED` are completely different problems — a failed node
needs investigation, a not-started node needs nothing. Investigate the failures before re-running.

**The whole run is marked failed, but every node in the grid committed.**
A `STRANDED` node — no artifact for its architecture — fails the run on its own. Stage the
missing architecture and run again for those nodes.

**A node reads `ROLLED BACK`.**
Its safety net fired and it is running its old system. Read `NOTES`: a bootloader revert means
the new image did not come up far enough; a health-check failure names the check.

**A node went down a second time on its own, seconds after the update.**
That is a health-check rollback. Rasputin marked the new slot bad and the node rebooted itself
back to its previous system about two seconds later. Expected behavior, not a second fault.

**A node reads `FAILED`.**
The update never reached a verdict on a slot. `NOTES` says whether it failed validating,
downloading, installing or rebooting. Fix that cause, then move the one machine with
[Update one node](/docs/update-one-node/).

**`COMMITTED` with an amber `DEGRADED` badge.**
A success, on fewer checks. Hover for which one could not be evaluated. A missing boot identity
fixes itself on the next rollout; a missing version report does not, and is worth a look.

**A component still reads `NEEDS ATTENTION` after the run.**
Some node's reported version is unconfirmed because its last update did not verify, so the value
is not trusted. Find that node in `HISTORY` — it is probably `ROLLED BACK` and still on its old
image.

**A component still reads `UPDATE AVAILABLE` after a run you thought succeeded.**
At least one node is behind. An OS update surfaces while a single node lags, even when the
control plane is already current. Check the grid for `NOT STARTED`, `FAILED` and `SKIPPED` rows.

**The `SLOT` column reads `—`.**
The slot the node started from was not known, so Rasputin reports it as unknown rather than
guessing one. The outcome in `STATUS` is unaffected.

**A whole architecture's nodes are missing from the report.**
A run started from a single bundle carries one artifact, so it only ever plans the nodes of that
architecture — the others are not failures, they were never targets. See
[Roll out an update](/docs/roll-out-an-update/#what-update-all-commits-you-to).
