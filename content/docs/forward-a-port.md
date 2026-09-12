---
title: "Forward a port"
description: "Send a port on your public address to one machine inside your network — what that actually exposes, why the mesh is usually the better answer, and how to close it again."
weight: 82
applies-to: "2026.08.5"
---

A port forward takes a port on your public address and sends it to one machine inside your
network. It is the most consequential thing on the Firewall tabs, because it is the only one
whose effect is visible from the internet.

**Read [What a port forward actually costs you](#what-a-port-forward-actually-costs-you)
before you add one.** If the service only ever needs to be reached from devices you control on
your own networks, [the mesh](/docs/add-a-device-to-the-mesh/) does that with nothing exposed. A
forward is what you add when something on the internet has to reach in, and the mesh is not a
substitute for that — this release does not claim away-from-home access.

Nothing here reaches the firewall until you press `APPLY`, and deleting a forward does not
close it — see [How the Firewall section works](/docs/the-firewall-intent-model/).

`<lan-host-ip>` below is the IPv4 address of the machine inside your network that you are
sending the port to.

## Do this

1. **Open `Firewall → PORT FORWARDS`.** With none configured the tab reads
   `no port forwards yet`.
2. **Press `ADD PORT FORWARD`** and fill the five fields in the row:
   - **name** — your label, e.g. `minecraft`. It becomes the forward's name in the
     firewall's configuration.
   - **WAN port** — the port the outside world connects to.
   - **LAN host** — the machine to send it to: an IPv4 address (`<lan-host-ip>`), or a LAN
     hostname.
   - **LAN port** — the port on that machine. It does not have to match the WAN port.
   - **protocol** — `tcp`, `udp`, or `tcp+udp`. Pick the one the service needs, not
     `tcp+udp` by reflex.
3. **Press `APPLY`** and wait for `IN SYNC`. The port is now open to the internet.
4. **Check the service from outside your network** — a phone on mobile data is enough. If it
   answers, so will everyone else.

<!-- SCREENSHOT: firewall-port-forwards.png — the PORT FORWARDS tab with one forward
configured, showing the five-field row and the per-row toggle / EDIT / DELETE. -->

Each existing row has an on/off toggle, `EDIT`, and `DELETE`. **The toggle is the reversible
way to close a forward** — it leaves the row on the tab so you can put it back without
retyping it. Either way you still need `APPLY`.

## What a port forward actually costs you

Be honest with yourself about this one.

**What it protects.** Nothing. A port forward is not a security control — it is a hole you
are deliberately making in your firewall, and it is open to **the entire internet**, not to
you and not to people who know the address. Automated scanners find a newly-opened port in
minutes, not months.

**What it does not protect.**

- **Whatever is behind that port is now internet-facing software.** Its authentication, its
  patch level, and its bugs are now your perimeter. That holds regardless of how unimportant
  the app feels — a media server usually holds your files and often ships with weak default
  authentication, so "it is only my media server" is not a reason to expect less of it.
- **A forward is not ordered against your rules.** Forwarding is a separate, earlier stage
  than the accept/reject/drop rules on the RULES tab, so you cannot rely on rule ordering to
  constrain a forward. A rule can still match the traffic after it has been redirected, but
  working that out is fiddly — **do not assume a rule you wrote elsewhere is protecting a
  port you have opened.**
- **The intrusion detection on the firewall will not stop anything that comes through.** It
  is tap-only: it watches and raises alerts, and it never blocks.

**The consequence of each choice.**

- **Forward nothing, use the mesh.** Put the device on the tailnet and reach the service by
  name over the mesh, with nothing exposed to the internet. That covers devices you have
  enrolled, across your own networks. It is **not** a route in from outside your home network
  — this release does not claim that — so if the caller is someone else's device, or anything
  on the internet, the mesh cannot stand in for a forward. See
  [Add a device to the mesh](/docs/add-a-device-to-the-mesh/) and
  [What the mesh does not give you](/docs/the-mesh/#what-the-mesh-does-not-give-you).
- **Forward the narrowest thing that works.** One port, one protocol, one host, on software
  you are willing to keep updated for as long as the forward is open.
- **Forward broadly** — a whole management port, a `tcp+udp` pair you did not need, a host
  running more than the one service — and every extra thing you included is exposed too.

**What you cannot take back.** Traffic that already arrived. From the moment the `APPLY`
completes to the moment a later `APPLY` closes the forward, the port was reachable by
anyone; closing it does not undo a login attempt, a scan, or access that was already
obtained. Assume the
service behind it was found, and treat its logs and its credentials accordingly.

And the deletion trap applies here with real consequences: **`DELETE` removes the forward
from your intent list and leaves it live on the firewall.** The port stays open until the
next `APPLY`. If you are closing a forward because something is wrong, delete or toggle it
**and then apply**, and confirm the pill reads `IN SYNC` before you consider it shut.

## The `LAN host` field fails quietly

**Only IPv6 is rejected.** An IPv6 address or CIDR in `LAN host` is refused when the intent
list is compiled and makes the `APPLY` fail, because this release is IPv4 only.

**Everything else is passed through unresolved.** A wrong IPv4 address, or a hostname your
firewall cannot resolve, becomes a forward that silently goes nowhere — the tab shows it, the
pill says `IN SYNC`, and the forward is live and pointed at nothing. Nothing validates that
the host exists or that the service is listening.

The practical consequence is worth stating: a forward that appears not to work is still an
open port on your firewall. It is not harmless because it does not reach your service. Toggle
it off and `APPLY` while you work out the address.

## Troubleshooting

**A port forward reaches nothing.**
Check the `LAN host` value. Only IPv6 is rejected; an IPv4 address or hostname is passed
through unresolved, so a wrong address or an unresolvable name fails silently. The port is
still open in the meantime.

**You deleted a forward and the port is still open.**
Deleting removes the intent, not the live forward. Press `APPLY` and wait for `IN SYNC`.

**`APPLY` fails complaining about IPv6.**
`LAN host` holds an IPv6 address or CIDR. This release rejects those at compile time, so
nothing was pushed. Fix the field named in the error.

**You are not sure whether the forward is actually open.**
Test from a connection that is genuinely off your network — a phone on mobile data. A test
from inside your own network does not tell you what the internet sees, in either direction.

**A rule you wrote does not seem to constrain the forward.**
It probably does not. Forwarding happens at an earlier stage than the rules on the RULES
tab; do not rely on a rule to narrow a forward. Narrow the forward itself.

**The firewall's log or your alerts show connection attempts on a port you just opened.**
That is the expected reading, not a sign of a targeted attack — scanners find open ports
quickly. Decide whether the service behind it is one you want taking that traffic.
