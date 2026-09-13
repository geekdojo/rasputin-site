---
title: "How the Firewall section works"
description: "The firewall is an intent model: you edit a list, nothing reaches the box until APPLY, and RECONCILE tells you when something changed the firewall behind Rasputin's back."
weight: 80
applies-to: "2026.08.5"
---

Read this before you touch anything else under **Firewall**. Every other firewall
instruction assumes you are holding one idea: **the tabs do not configure your firewall.
They edit a list of *intents* on the control plane.** `APPLY` compiles that list and pushes
it to the firewall node. Until you press it, nothing you typed exists anywhere but Rasputin.

Rasputin manages **one firewall, running OpenWrt** — one firewall-role node per cluster.
There is no per-vendor path and no HA pair. With no firewall-role node registered, the
Overview tab says so instead of showing you controls.

The intrusion detection running on that same box is **tap-only: it watches traffic and
raises alerts, and it never blocks**. Nothing on these tabs turns it into a blocker, and no
rule you write here is enforced by it.

`<cluster-id>` throughout is your cluster's own identifier, fixed when you provisioned it.

## Do this

Every change to your firewall, whatever the tab, is the same four-step loop.

1. **Edit the intent.** Add, edit, toggle, or delete a port forward, rule, or WAN profile.
   Editing is free and reversible, and nothing has happened to your network yet.
2. **Check the pill in the header row.** It is the only place that tells you whether your
   edits are live. `PENDING` means the firewall has not seen them.
3. **Press `APPLY`.** This is the one button that changes your network. It compiles every
   enabled intent, pushes it, and records a fingerprint of what it sent.
4. **Confirm the pill reads `IN SYNC`** and that `applied <time>` has moved.

`RECONCILE` is the other button: it asks the firewall what it is actually running and
compares that against the fingerprint. Reconcile also runs on its own **every five minutes
by default**, so drift usually finds you rather than the other way round.

<!-- SCREENSHOT: firewall-overview.png — the Firewall header row with the state pill,
`applied <time>`, APPLY and RECONCILE, above the four Overview cards. -->

## What the header is telling you

| Element | What it means |
|---|---|
| **`IN SYNC`** (green) | What you configured, what was pushed, and what is running all match. |
| **`PENDING`** (orange) | You have edits the firewall has not seen. Press `APPLY`. |
| **`DRIFT`** (yellow) | The parts of the firewall Rasputin manages — port forwards, rules, the WAN settings it applied, and its DNS forward — no longer match what it pushed. Something changed them outside Rasputin, or the firewall was reset. |
| **`applied <time>`** | When the last successful `APPLY` finished. Reads **`never applied`** on a firewall Rasputin has not yet taken over. |

Only one state shows at a time, and **`DRIFT` wins over `PENDING`** — a firewall that was
changed behind your back is the more urgent thing, so that is what the pill says even when
you also have unpushed edits.

## The three consequences that catch people out

**Delete does not un-push.** Deleting a port forward or a rule removes it from your intent
list only. It stays live on the firewall until the next `APPLY`. The confirmation dialog
says so. If you deleted something to close it, you have not closed it yet.

**Reconcile does not repair.** In a mode where Rasputin manages the firewall it is a read.
Fixing drift is always your decision, and the fix is always the same gesture: make the
intent say what you want, then `APPLY`.

**The first `APPLY` takes ownership.** Rasputin owns the port-forward and rule sections of
the firewall's configuration outright — an `APPLY` replaces them wholesale. A firewall
Rasputin has never applied to reads as `PENDING` rather than `DRIFT`, because it is
*unmanaged* rather than diverged.

Ownership stops there. **Your zones, the firewall's default policies, the forwarding rules
between zones, and any include files stay exactly as they are** — Rasputin never writes
them. That is why your zone layout survives an `APPLY`, and it is also why some things you
set up in Rasputin depend on configuration Rasputin cannot see.

One hard limit on what compiles: **this release is IPv4 only and enforces it.** An IPv6
literal or IPv6 CIDR in an address field is rejected when the intent list is compiled, so
the `APPLY` fails and nothing reaches the firewall.

## In "Join my existing network" mode, both buttons lie to you

**What this protects.** Nothing — that is the point of the section. In that deployment mode
(internally, *LAN peer*) your own router keeps doing the firewalling and Rasputin does not
manage a firewall at all. The whole Firewall section is normally dropped from the nav rail.

**What it does not protect.** If you do reach these tabs — you switched modes after setup,
or you navigated here directly — both buttons behave differently from everything described
above, and neither tells you so:

- **`APPLY` succeeds and pushes nothing.** The workflow stops at its first step, on purpose,
  and reports success. A green result here is **not** evidence that anything reached a box.
- **`RECONCILE` is not a read in this mode.** Its leading step actively *idles* the firewall
  node — it turns that box's DHCP server and its threat detection off — and then stops
  without checking for drift. The same thing happens on every automatic reconcile tick, so a
  firewall node that registers while you are in this mode is held idle without you asking
  for that.

**The consequence.** Rules and forwards you write in this mode are stored and enforced by
nobody. If you intended Rasputin to firewall for you, the fix is not on these tabs: change
the deployment mode in [Settings](/docs/settings/), which reconfigures the firewall node, and
then apply.

**What you cannot take back.** Nothing here is one-way, but a firewall node that has been
idled is not doing the job you think it is doing for as long as the mode stays put.

## The firewall's own admin interface

**ADVANCED** is the escape hatch. Rasputin models the parts of a firewall it can explain in
a sentence; everything else stays available in the firewall's own admin interface.

**What it is legitimately for.** Things Rasputin does not model, and there is no shame in
using it for them: packet captures, custom DHCP options, exotic routing, traffic shaping,
ban lists, multi-WAN failover.

**What it costs you.** **Changes you make there to port forwards, rules, the WAN settings
Rasputin applied, or the DNS forward it manages show up as `DRIFT` on the next reconcile** —
within five minutes, or immediately if you press `RECONCILE`. Rasputin will not silently keep
them, and it will not silently revert them either. It flags them and waits. Changes to
anything else there never show as `DRIFT`: Rasputin does not compare them, so it will not tell
you when they change. There is no "adopt this change" button, so resolving drift is one of
two deliberate actions:

- **Keep the change** — recreate it as an intent on the matching Rasputin tab so the two
  agree, then `APPLY`.
- **Discard the change** — press `APPLY` with your existing intents. The next apply replaces
  the port-forward and rule sections wholesale, so the hand-made change disappears.

`APPLY` discards drift only in the sections Rasputin currently owns, and only by re-asserting
your intents over them. It is not an undo: nothing stores what the firewall held before, so no
apply can restore a value Rasputin never pushed. WAN is where that distinction bites — with at
least one WAN profile recorded, an apply overwrites a hand-made WAN edit; with no WAN profiles
at all, an apply carries no network section and the hand-made edit is left in place.

**So the practical rule is: use the native UI for what Rasputin does not model, and do not use
it for port forwards, zone rules, or a WAN you still want Rasputin to manage.** Those have a
tab here, and editing them in two places means one of them is about to be overwritten. The
exception is recovering a WAN you cannot fix from here: set it natively, then delete the
Rasputin WAN profiles, so no later apply re-asserts the old intent over your fix — see
[Manage the WAN](/docs/manage-the-wan/).

**What you cannot take back.** An `APPLY` is what overwrites a hand-made change, and there
is no copy of it to restore. If you want to keep something you did in the native UI, write
it into the matching intent *before* your next apply.

Two details about the tab itself: **`firewall host` starts empty.** What you see in it is a
grayed-out placeholder built from the firewall's node name, not a value — you type the
address yourself, and **`OPEN NATIVE UI`** stays disabled until you do. And the link is
built as plain `http://`, with no TLS; whether that interface redirects you to HTTPS is up
to the firewall, not to Rasputin.

## What is in your list on day one

Taking over the rule section would delete the stock rules the firewall came with, so
Rasputin re-creates the load-bearing ones as rules of its own: **`Allow-DHCP-Renew`**,
**`Allow-Ping`**, and **`Allow-IGMP`**. They are real rules — you can see, toggle, edit, and
delete them — and they matter enough to read about before you write your first rule. See
[Write a firewall rule](/docs/write-a-firewall-rule/).

Two things about them follow from the intent model:

- **They arrive as *pending* intents, not as applied configuration.** Seeding is not
  pushing. Until your first `APPLY`, what is running on the firewall is still the firewall's
  own stock ruleset; these three become live at that first apply.
- **They are seeded at most once per cluster, ever.** The marker that records the seeding is
  never cleared, so if you delete `Allow-DHCP-Renew`, nothing brings it back — you would
  have to recreate it by hand. A replaced or renamed firewall node does not get a fresh set
  either.

## The Overview cards, briefly

Four cards, each a link to the tab that owns it: **PORT FORWARDS**, **RULES**, and **WAN
CONFIGS** count intents — enabled or not — and **WIREGUARD PEERS** shows `—`. The counts are
of *intents*, not of what is running. If the header says `PENDING`, the cards are ahead of
reality.

**WIREGUARD has no controls.** The tab is prose: peer management for VPN clients that are
not on the mesh is not part of this release. The encrypted path this release does support is
the mesh, for devices you enroll and across your own networks — not away-from-home access,
which Rasputin does not claim. See [Add a device to the mesh](/docs/add-a-device-to-the-mesh/).

## Troubleshooting

**Overview says no firewall-role agent is registered.**
The cluster has no firewall node online. Nothing on these tabs can be applied until one
registers.

**`APPLY` fails with `no firewall-role node is registered`.**
Same cause: nothing has claimed the firewall role in this cluster.

**`APPLY` fails with `expected exactly one firewall node, found N`.**
More than one firewall-role node is registered, which this release does not support. Retire
the extra one.

**`APPLY` succeeded but the firewall did not change.**
Check your deployment mode. In *Join my existing network* the apply stops at its first step
and reports success without pushing anything.

**`APPLY` fails with a timeout.**
The firewall node did not answer. Your intents are untouched — check the node is online and
apply again.

**`APPLY` fails complaining about IPv6.**
An address field holds an IPv6 literal or CIDR. This release rejects those when the intent
list is compiled, so nothing was pushed. Fix the field named in the error.

**The pill flipped to `DRIFT` and you did not touch the firewall.**
Something else did — a hand edit in the native admin interface, or a factory reset.
`RECONCILE` to confirm, then keep or discard the change as above.

**You deleted something and it is still enforced.**
Expected. Deleting removes an intent, never a live rule. `APPLY` to make the firewall match
your list.

**There is no Firewall icon on the nav rail.**
The cluster is in *Join my existing network* mode, where your own router does the
firewalling. The section is removed rather than shown as controls with nothing behind them.
