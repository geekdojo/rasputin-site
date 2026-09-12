---
title: "Update one node"
description: "Send one staged bundle to one machine — the way to re-try a node that failed a fleet run, and the one gap in the picker's safety filter."
weight: 72
applies-to: "2026.08.5"
---

`DEPLOY` on a bundle row takes **one bundle to one node**. Use it to re-try a single node that
failed a fleet run, or to move one machine forward deliberately. For the whole fleet, use
[Roll out an update](/docs/roll-out-an-update/) instead.

`<arch>` below is `amd64` or `arm64`.

## Do this

1. **Open Updates** on the nav rail and scroll to `BUNDLES`.
2. **Find the artifact you want.** `VERSION`, `ARCH` and `COMPAT` — the hardware SKU string
   the artifact is built for — identify it. If it is not there yet, stage it first (steps 2–3
   of [Roll out an update](/docs/roll-out-an-update/#do-this)).
3. **Press `DEPLOY` on that row.** A node picker opens.
4. **Pick the node and confirm.** The node fetches the bundle from the control plane, writes it
   to its idle system slot, reboots into it, and verifies.
5. **Watch `HISTORY`.** That node's row moves from `IN PROGRESS` to `COMMITTED`,
   `ROLLED BACK`, or `FAILED`. `COMMITTED` is the only one that means the update stuck.

There is **no canary, no tier ordering, and no failure budget** here — it is one node, with A/B
rollback as its safety net.

Do not confuse `DEPLOY` with `UPDATE MATCHING` on the same row: `UPDATE MATCHING` cascades that
artifact to *every* online node that takes it, which is a fleet-scale run and is covered in
[What UPDATE ALL commits you to](/docs/roll-out-an-update/#what-update-all-commits-you-to) —
including a warning about its confirmation dialog's wording.

## What the node picker checks, and what it does not

**What it protects.** The picker lists **online nodes only**, and only ones the bundle can
legally install on. An amd64 bundle is not offered to an arm64 node, an OS bundle is never
offered to the firewall, and the firewall's own image is offered only to the firewall.

**What it does not protect.** One gap is worth knowing, because it is exactly the case the
filter looks like it covers: **a node that has never reported an architecture stays eligible
for any OS bundle.** The control plane re-checks before installing and the node itself refuses
an image it is not built for, so this is caught rather than destructive — but the picker is not
the thing catching it. If a node's architecture is blank in the picker, pick deliberately.

**The consequence.** A single-node deploy has less standing between you and a bad image than a
fleet run does, and the difference is not the node — it is the evidence. In a fleet run a canary
of one node per tier and architecture has already proved this artifact before anything else is
touched. Here, the node you pick *is* the canary, and nothing is waiting behind it to benefit.
What still applies in full is the node's own protection: the four-part
[verify contract](/docs/know-whether-an-update-worked/#the-verify-contract) and
[the two system slots](/docs/know-whether-an-update-worked/#rollback-and-the-two-system-slots). The node keeps
its old system intact, and reverts to it on its own if the new one does not verify.

**What you cannot take back.** The node reboots — and twice, unasked, if its health check
fails: Rasputin marks the slot bad and the node reboots itself back to its previous system
about two seconds later. There is no cancel once you confirm, and nothing on this page walks a
committed node back to its previous release.

## Troubleshooting

**The node you want is not in the picker.**
It is offline, or the bundle cannot legally install on it — the wrong architecture, an OS bundle
against the firewall, or the firewall image against an OS node. Check the node is on the bus
first; the picker only lists online nodes.

**The picker offers a node whose architecture you cannot see.**
That is the gap above: a node that has never reported an architecture stays eligible for any OS
bundle. The install is re-checked by the control plane and refused by the node itself, so it
will not destroy anything — but do not rely on the picker to have filtered it. Pick
deliberately.

**The node reads `FAILED` in `HISTORY`.**
The update never got as far as a verdict on a slot. `NOTES` says whether it failed validating,
downloading, installing, or rebooting. Fix that cause and deploy to the same node again.

**The node reads `ROLLED BACK`.**
Its safety net fired and it is back on its old system. A bootloader revert means the new image
did not come up far enough; a health-check failure names the check in `NOTES`, and that node
rebooted itself a second time to get back.

**The row reads `COMMITTED` with an amber `DEGRADED` badge.**
The update succeeded on fewer checks than usual — at least one of the boot, slot and version
checks could not be evaluated. Hover for which. A missing boot identity usually means an agent
older than the feature and fixes itself next time; a missing version report does not heal on its
own.

**You deployed to the node and the component still reads `UPDATE AVAILABLE`.**
Another node is behind. An OS update surfaces while a single node lags, even when the control
plane is already current.

**You deployed to the node and its component reads `NEEDS ATTENTION`.**
Some node's reported version is unconfirmed after a failed update — most likely the one you just
touched, if it rolled back. Amber rather than green is deliberate: a node reporting the version
it was *meant* to reach must not make the component read up to date.
