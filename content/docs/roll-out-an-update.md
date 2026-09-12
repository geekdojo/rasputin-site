---
title: "Roll out an update across the fleet"
description: "Check the channel, stage the release, read the plan and deploy — with signing, channels, the canary gate and the failure budget spelled out before you press the button."
weight: 70
applies-to: "2026.08.5"
---

**Updates** is where you find new OS and firewall releases, bring them onto your cluster, and
roll them out across every node at once.

Throughout, `<arch>` is `amd64` or `arm64`, `<sku>` is a hardware SKU string like the ones in
the bundle catalog's `COMPAT` column, and `<version>` is the release version on your own
screen.

<!-- SCREENSHOT: updates.png — the Updates page: AVAILABLE UPDATES with its CHECK FOR UPDATES
button, STAGED RELEASES, and the BUNDLES table. Default MISSION CONTROL theme. -->

## Do this

1. **Open Updates** on the nav rail. If a warning banner sits across the top of the page,
   stop and read [Signing and the trust root](#signing-and-the-trust-root) — with no trust
   root, nothing will stage.
2. **Press `CHECK FOR UPDATES`.** The section heading grows the channel it asked —
   `AVAILABLE UPDATES · STABLE CHANNEL` — and each checkable component gets a row. Nothing is
   downloaded by this.
3. **Press `DOWNLOAD & STAGE`** on a row badged `UPDATE AVAILABLE`, and wait for a green
   `STAGED`. An amber `PARTIAL — <arch> MISSING` means press it again. Staging touches no
   node: nothing is installed, nothing reboots.
4. **Scroll to `STAGED RELEASES` and press `UPDATE ALL`** on the release row. Grayed out means
   an architecture your fleet needs is not staged yet, and the tooltip names it.
5. **Read the plan** in the `REVIEW ROLLOUT · <version>` drawer: the node order, the `CANARY`
   markers, and `NOT TARGETED`. Anything rendered in red there — close the drawer and stage
   the missing architecture first. Leave `MAX IN FLIGHT` and `MAX FAILURES` at their defaults.
6. **Press `DEPLOY`.** Read
   [What UPDATE ALL commits you to](#what-update-all-commits-you-to) before you do this the
   first time; there is no cancel afterwards.
7. **Watch the report** in the `SYSTEM UPDATES` panel. The page will go blank for a while when
   the control-plane node takes its turn — it goes last, and it comes back on its own.
8. **Read the result** when the run ends, in
   [Know whether an update worked](/docs/know-whether-an-update-worked/).

Updating both the OS and the firewall is **two runs**, in whichever order you choose. No
single run spans them.

**Nothing above happens on its own.** There is no scheduler, no nightly job, no maintenance
window, and no auto-update toggle anywhere in Rasputin. Nothing checks for releases in the
background, nothing downloads in the background, and nothing installs without you pressing a
button. Your cluster keeps running exactly what it is running until you say otherwise.

## Signing and the trust root

**What it protects.** Nothing stages and nothing installs unless the artifact can be verified
as authentic. A check reads only each release's small signed manifest — version,
per-architecture artifact names, hardware-compatibility strings, and content hashes — never
the image, which is hundreds of megabytes. Staging then downloads the artifacts and verifies
them against that manifest's content hash as they stream in: computed on the way to a
temporary file, checked against the manifest, and only then moved into the catalog. Only the
control plane ever reaches the release server; when a rollout later runs, each node is handed
a URL on the control plane itself and fetches the bundle from there.

The signature establishes two things: **who published this artifact**, and **that the bytes
are the ones they published**. That is the whole basis for letting a machine you own write a
new operating system onto itself.

None of it works without a **signing root CA**. If the control plane booted without one, a
warning sits at the top of the page and **OS updates are refused** — not one step of the path
but all of it. On Rasputin hardware that root ships in the OS image, so it is normally already
present: the trust step in first-run setup **confirms** it rather than installing it, which is
why that card is marked optional. Skipping the check does not remove the root and does not cost
you updates. A root that is genuinely absent means the image did not carry one, and the remedy
is to re-flash the OS image — there is nothing to install by hand here. This is not the
cluster's own certificate authority, the one you install on a browser or a mesh device; see
[Add a device to the mesh](/docs/add-a-device-to-the-mesh/).

A second banner appears when the control plane was started in a **permissive development
mode**: bundle signatures are not checked at all, and everything staged is recorded as
`<unverified>` and carries an amber `UNVERIFIED` badge under `SIGNED BY` in the catalog. That
mode is for development machines and should never be seen on an appliance.

Neither banner can be dismissed, and a missing trust root is a refusal rather than a quiet
downgrade to unverified.

**What it does not protect.** A signature says who signed and that nothing was altered. It
says nothing about whether the release is any good, whether it fits your hardware — that is
the `COMPAT` SKU match — or whether it will boot, which is what the canary gate and the
[verify contract](/docs/know-whether-an-update-worked/#the-verify-contract) are for. It does not
authenticate the channel, only the artifact. And it vouches for nothing you built yourself
beyond whatever signature you put on it.

**The consequence.** With a trust root in place, a bad or tampered artifact fails at ingest
and never reaches the catalog, and a failure to reach the release server is an amber line that
leaves the rest of the page working. Without one, the entire update path is closed until it is
back — there is no override on this page.

**What you cannot take back.** Anything staged while permissive development mode was on
carries `UNVERIFIED` in the catalog: that badge is the record of how the bundle entered, not a
state you can argue with. Do not deploy a bundle carrying it, and do not run that
configuration on an appliance.

## Channels: a stable cluster never sees dev releases

**What it protects.** Rasputin reads releases directly from each component's public source
repository, and a release's **prerelease flag is the channel**: a prerelease is a `dev`
release, a normal release is a `stable` release.

The filter is **exact match, not a superset**. A cluster on the stable channel considers only
non-prerelease releases, and a cluster on the dev channel considers only prereleases. So a
stable cluster will never be offered a dev build — and, equally, a dev cluster is not offered
stable ones through this page. Choosing a channel is choosing a stream, not raising or
lowering a ceiling.

**What it does not protect.** The channel decides what this page *offers*. It is not a quality
gate: a stable release is one that was not flagged prerelease, which is a publishing decision
rather than a test result. And it does not bound the catalog — `UPDATE ALL` and the bundle row
actions act on what is staged, so an artifact that reached the catalog by hand-upload was
never channel-filtered at all. See
[Bring in a bundle by hand](/docs/bring-in-a-bundle-by-hand/).

**The consequence of the channel your cluster is seeded with.** Your cluster's channel is set
once, on the control plane, and there is no control for it on this page. The seed therefore
decides what this page will ever show you. On a cluster seeded to dev, `CHECK FOR UPDATES`
shows nothing new when a stable release ships, because that release is not in its stream. On a
cluster seeded to stable, you cannot walk a node forward onto a dev build from here at all. If
the channel is wrong for what you want the cluster to be, that is a change on the control
plane, not a control you can flip while you are standing here.

**What you cannot take back.** The channel is a filter on what you are offered, never a way
back. Once a release is committed on a node, changing the channel does not return that node to
the other stream; moving a node to a different version is always another rollout.

## What UPDATE ALL commits you to

`UPDATE ALL` opens a pre-flight drawer, `REVIEW ROLLOUT · <version>`. Nothing is dispatched
until you press `DEPLOY` at the bottom of it. The plan you see is produced by the same code
that runs the rollout, so the preview cannot drift from what executes — which makes the drawer
the only place this run is described accurately. It is worth reading in full the first time.

**What it protects.**

*Staging is checked before the run starts*, not discovered halfway through as a download
failure on node nineteen. `UPDATE ALL` stays disabled while any SKU your fleet needs is
missing, with the reason on hover:

> Stage `<sku>` first — the plan refuses to run a fleet update that would leave nodes behind

*Nodes update tier by tier*, never two tiers at once, ranked: compute, then storage, then the
control plane, then the firewall. The ordering is about what you lose if something goes wrong.
Compute workloads can depend on storage nodes; losing the control plane costs you your view of
the fleet; losing the firewall costs you your connection to all of it.

*A canary gates every tier.* Before a tier fans out, **one node in it updates alone** and has
to fully succeed before anything else in that tier is touched. The canary is picked per
**(tier, architecture)** pair, not per tier: a mixed-architecture compute tier runs one canary
per architecture and neither authorizes the other, because an arm64 canary proves nothing
about the amd64 artifact — that is a different binary built by a different job. A canary
failure of *any* architecture aborts the whole run, since a bad build is far more often a bad
release than a bad single artifact. **This is the one place in the rollout where a single
failure stops everything, and it is the main thing keeping a bad image off your cluster.**

*Fan-out is bounded.* After a tier's canary passes, at most `MAX IN FLIGHT` nodes of that tier
update at the same time — **4** by default — and the value is always clamped so that at least
one node in every tier is held back.

*There is a failure budget.* `MAX FAILURES`, **15%** by default and relative to the tier.

*And under all of it, every node has its own rollback* — it keeps its old system image intact
while the new one is written beside it. See
[Rollback and the two system slots](/docs/know-whether-an-update-worked/#rollback-and-the-two-system-slots).

**What it does not protect.**

*It is best-effort with a report, not all-or-nothing.* Every planned target is attempted. A
node that fails is a red cell in the report, not a wall the run stops at. That is the
deliberate trade: each node's rollback is independent, and the canary has already cleared the
image, so one node failing says nothing about the next.

*Only a canary failure aborts.* The failure budget does not halt work in flight — it stops the
cascade **starting** further nodes in that tier. Nodes already running are allowed to finish,
so the number of failures can overshoot the budget, by up to one less than the number actually
in flight for that tier. That number is the value Rasputin resolved and clamped, which can be
lower than what you typed.

*The budget is small, and tier-relative.* Failures do not carry across from an earlier tier.
At the default, a twenty-two-node compute tier gets a budget of three; an eight-node tier gets
one; a three-node tier gets one. A percentage that would round down to zero floors to one,
because a percentage is a request for a proportionate brake and never a request to remove it.
And the breaker can only act while nodes are still waiting, so on a small cluster it barely
bites: on small fleets your safety comes from the canary gate and from per-node rollback, not
from this number.

*An abort is not a rollback.* Nothing behind the failing canary is touched and no later tier is
reached — but nodes in tiers that had **already completed** keep the new image. They are not
walked back. Only a first-tier canary failure leaves the whole fleet untouched.

*The control plane is included, and it goes last.* `UPDATE ALL` means all: the node hosting the
control plane is a real target, ordered strictly last within its tier. In an OS rollout it
genuinely is the last node of the run. The drawer warns you:

> this run updates **`<node>`**, the node running the control plane. It goes **last**, after
> every other node has reported. This page will drop while it reboots and come back on its
> own — the run finishes and reports itself either way.

*No single run spans the OS nodes and the firewall.* A release is either an OS release or a
firewall release, and the plan drops every node the release does not fit: an OS rollout skips
the firewall, a firewall rollout skips every OS node. The firewall tier therefore only ever
appears in a firewall release's plan, which has just that one tier in it.

*A stranded node fails the whole run.* Under `NOT TARGETED` the drawer separates two visually
distinct kinds: `SKIPPED`, for nodes deliberately left out — offline when the plan was made,
excluded, or running a different image entirely — and `STRANDED`, in red, for a node with no
artifact for its architecture:

> N nodes would be stranded — no artifact for their architecture. The run will fail even if
> every other node succeeds. Stage the missing arch first.

Nobody asked for a stranded node, which is why it is rendered apart from the designed skips —
and why the drawer tells you before you dispatch rather than after.

**Do not take the confirmation dialog as the specification.** The bundle catalog's
`UPDATE MATCHING` action cascades a single artifact using this same rollout model, and raises
a browser confirmation whose closing sentences read:

> The controlplane is not included. The cascade halts on the first failure.

**Both halves are false.** They describe a rollout model that was deliberately retired. The
control-plane node **is** a target, ordered last, and fan-out is best-effort against a
tier-relative failure budget rather than stopping at the first failure. The dialog understates
what the run does in exactly the two ways that matter most to someone deciding whether to
press it. Read the plan in the drawer; do not read that dialog as a description of the run.

`UPDATE MATCHING` also differs from `UPDATE ALL` in scope: it carries **one artifact**, so it
reaches only the nodes of that one architecture. Nodes on any other architecture are not
failures, they are simply not in the plan — on a mixed-architecture fleet that leaves half your
cluster behind, which is exactly why the fleet action lives on the release row instead. Use
`UPDATE ALL` whenever you mean "the whole fleet"; use `UPDATE MATCHING` when you mean "this
artifact, and only what it fits".

**The consequence of each choice.**

| Knob | Default | What it does |
| --- | --- | --- |
| `MAX IN FLIGHT` | `4` | How many nodes of **one tier** update at the same time, after that tier's canary has passed. Accepts a count (`4`) or a percentage (`20%`). Setting it to `1` reproduces a fully serial cascade; on a two-node tier the clamp forces that anyway |
| `MAX FAILURES` | `15%` | How many nodes of **one tier** may fail before the cascade stops *starting* new ones there. Accepts a count or a percentage — and an absolute `0` means **unlimited**, so it removes the brake rather than setting zero tolerance |

The canary pick can be overridden, in the drawer's own words: *"one node per tier and
architecture proves the image before fan-out. Override the pick if you have a node you can
afford to lose first."* The control plane and the firewall never nominate a canary; there is
nothing behind either of them to protect.

Under `advanced` there is a `CANARY SOAK (SECONDS)` field, defaulting to `0`, which holds a
tier's fan-out for that long after its canaries pass. Zero is the expected setting: the health
check that gates a commit is synchronous, so a soak adds waiting without adding a signal
Rasputin does not already take.

Your last-used knob values are remembered in this browser and pre-filled next time. The canary
pick is deliberately *not* remembered — a node id does not survive a changing fleet.

**What you cannot take back.**

*There is no way to cancel a rollout in progress.* From `DEPLOY` onward the only brakes are the
canary gate and the failure budget. There is no cancel button, and the run status Rasputin
reserves for an operator cancellation has nothing behind it — the abort path is reserved and
unimplemented. Closing the browser changes nothing: the run belongs to the cluster, not to the
page.

*Nodes that committed are committed.* An abort, a spent budget, or your own change of mind
leaves them on the new image.

*You cannot watch the end of an OS rollout.* The control-plane node's reboot is part of the
run, so the page drops while the last node of the run is the one serving it. It comes back on
its own.

*Do not delete a staged bundle while a run is using it.* A node mid-update fetches its bundle
from the catalog by content hash, and deleting it fails that node.

## Troubleshooting

**`AVAILABLE UPDATES` is empty.**
No check has been run in this browser session. Press `CHECK FOR UPDATES`. There is no
background polling, so an empty list with only the hint under the button is the default state
rather than a failure.

**"Couldn't reach the release server."**
An amber line; the control plane could not reach the channel. Check its route to the internet.
Nothing on your cluster is affected and the rest of the page still works.

**A component reads `UNKNOWN`.**
The comparison could not be made — no node reported a version, the version could not be
parsed, or the fetch failed. The diagnostic is shown on the row itself.

**A component reads `NEEDS ATTENTION` when everything looks current.**
A previous update left some node's reported version unconfirmed, so the comparison reads amber
rather than green. Diagnose it in
[Know whether an update worked](/docs/know-whether-an-update-worked/#troubleshooting) before you
stage anything new.

**`PARTIAL — <arch> MISSING`.**
Only some of the release's architectures staged. Press `DOWNLOAD & STAGE` again; the row
reports both halves — which staged, and which failed with why — rather than resolving silently
as success. Rasputin counts only the architectures your fleet actually runs, so an all-amd64
cluster is fully staged without the arm64 artifact ever being downloaded.

**`UPDATE ALL` is grayed out.**
A hardware SKU your fleet needs is not staged, or no node is covered. The tooltip names the
missing SKU. Stage it first.

**The pre-flight drawer shows nodes in red under `NOT TARGETED`.**
Those are `STRANDED` — no artifact for their architecture. Close the drawer, stage the missing
architecture, and re-open it. Running anyway fails the whole run even if every other node
succeeds.

**The page went blank in the middle of a rollout.**
The control-plane node is updating and rebooting. It goes last, by design. Wait; it comes back
on its own, and the run finishes and reports itself either way.

**Nodes read `NOT STARTED` while the run is still going.**
The cascade has not reached them yet. They move to `UPDATING` in turn. Nothing to do.

**A bundle shows `UNVERIFIED` under `SIGNED BY`.**
The control plane is running in permissive development mode and did not check the signature. Do
not deploy that bundle, and do not run that configuration on an appliance.

**You want to stop a run you have already started.**
You cannot. There is no cancel, and the abort path is reserved and unimplemented. The canary
gate and the failure budget are the only brakes, and closing the page does not reach the run.

**The run has finished and you want to know what actually happened.**
That is the next document: [Know whether an update worked](/docs/know-whether-an-update-worked/)
covers the report grid, `HISTORY`, the four checks behind `COMMITTED`, and every outcome a node
can end up in — `ROLLED BACK`, `FAILED`, `NOT STARTED`, and a green result carrying `DEGRADED`.
