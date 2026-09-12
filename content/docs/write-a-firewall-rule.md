---
title: "Write a firewall rule"
description: "Add an accept, reject, or drop rule between zones — and the four things about Rasputin's rule list that decide whether your rule actually fires."
weight: 81
applies-to: "2026.08.5"
---

Zone rules are the accept/reject/drop layer: which traffic is allowed to cross your firewall,
and which traffic is allowed to reach the firewall itself.

Before your first rule, read [How the Firewall section works](/docs/the-firewall-intent-model/).
Nothing on this tab touches your network until you press `APPLY`, and deleting a rule does
not remove it from the firewall.

## Do this

1. **Open `Firewall → RULES`.** The tab states the model in one line at the top: `SRC` is
   the originating zone, and leaving `DEST` blank targets the firewall itself.
2. **Fill in the form below the table.** It reads as a sentence in four groups:
   - **FROM** — `src zone`, required and pre-filled `lan`. Optional `src IP/CIDR` and
     `src port` narrow it.
   - **TO** — `dest zone`. **Leave it blank to mean the firewall itself.** Optional
     `dest IP/CIDR` and `dest port`.
   - **WHEN** — protocol: `any proto`, `tcp`, `udp`, `tcp+udp`, `icmp`, `igmp`.
   - **THEN** — `accept`, `reject`, or `drop`, plus the **`log matches`** checkbox.
3. **Or pick a template instead.** The four cards below the form pre-fill it for common
   cases and highlight, in orange, the field they still need from you. Every field stays
   editable.
4. **Press `ADD RULE`.** The rule joins the table with an on/off toggle, `EDIT`, and
   `DELETE`. The header pill goes `PENDING`.
5. **Press `APPLY`** and wait for `IN SYNC`. This is the step that changes your network.
6. **Test the rule from the device it is about** — not from the firewall, and not from a
   connection that was already open. See the two caveats below if it does not bite.

<!-- SCREENSHOT: firewall-rules.png — the RULES table with a mix of ACCEPT / REJECT / DROP
targets, the four-group ADD RULE form, and the four template cards. -->

**`log matches`** records every packet the rule matches in the firewall's own log. Useful
while you are proving a rule fires, noisy if you leave it on a rule that matches constantly.

The two address fields are **IPv4 only, and that is enforced**: an IPv6 literal or CIDR in
`src IP/CIDR` or `dest IP/CIDR` is rejected when the intent list is compiled and makes the
`APPLY` fail rather than reaching the firewall.

## Zones are the unit, not devices

**What a zone is.** A named group of interfaces on the firewall — `wan` is the internet
side, `lan` is your network, and a segmented setup may add others such as `iot` or `guest`.
You type the zone name; the field is free text so it matches whatever your firewall actually
has.

**What that protects.** A rule applies to everything in the zone, so you defend a boundary
once rather than per device, and a new machine on that network inherits the rule without
your doing anything.

**What it does not protect.** A zone rule cannot tell two devices in the same zone apart
unless you narrow it with `src IP/CIDR`, and that narrowing is by address — so it follows
the address, not the machine. If addresses on your network move, a rule written against one
follows the address to whatever holds it next. Reserve the address in your router if a rule
depends on it.

**Leaving `DEST` blank is a different kind of rule.** It is about traffic *to the firewall
itself* — SSH to the router, pinging the router, reaching its own admin interface — rather
than traffic passing through it. A rule from `lan` to `wan` is about traffic crossing the
firewall on its way out. These two are easy to swap by accident, and a rule written against
the wrong one looks correct in the table and never matches the traffic you meant.

**The consequence.** The zone name is free text and nothing checks it against your firewall.
A rule naming a zone your firewall does not have is not an error you will see on this tab.

## `reject` or `drop`

Both stop the traffic. Both are passed straight through to the firewall, so the difference
is standard netfilter/OpenWrt behavior rather than anything Rasputin adds — but it is the
difference that matters when you pick one.

- **`reject` answers.** The connection is refused rather than left hanging. Conventionally
  you use this **inside your network**: a blocked device that gets a refusal stops retrying,
  instead of producing the long connect timeouts that get reported to you as "the internet
  is broken".
- **`drop` says nothing at all.** The packet disappears and the sender is left waiting.
  Conventionally you use this **facing the internet**, where silence gives a scanner less to
  work with than a refusal does.

**What neither protects against.** The choice changes what the sender learns, not whether
the traffic is stopped. Neither one tells the sender *why*, and neither logs anything unless
you tick `log matches`. `accept` is the third option, and is how you punch a hole through a
broader block.

## First match wins, and you cannot reorder

**Rules are evaluated top to bottom, and the first one that matches a packet decides its
fate.** Rasputin orders them by **when you created them**, and there is no way to move one —
no drag handle, no up/down control, no priority field.

**The consequence, stated plainly:** a broad `accept` you created last month still beats a
narrow block you created today for the same traffic. **The new rule looks active on the tab
and never fires.** If a new block appears to do nothing, this is the first thing to check.

**The only workaround today** is to delete the older, broader rule and recreate it *after*
the new one, so creation order puts the narrow rule first. Note what that means in practice:
between the delete and the recreate your intent list is missing a rule you were relying on,
and the change only reaches the firewall on `APPLY` — so make both edits, then apply once.

**What you cannot take back.** Deleting a rule to reorder it loses the rule, not a copy of
it. Write down what it said before you delete it; there is no history to recover it from.

## A new rule does not stop a connection already running

Applying a new block rebuilds the ruleset. It does not tear down connections that were
established before it. Two mechanisms are behind that: reloading the firewall does not flush
its connection-tracking table, and an established flow that has been handed to the kernel's
fast path bypasses the ruleset altogether.

**So the stream you just blocked will usually keep playing** until it ends on its own, the
device reconnects, or the box reboots. `IN SYNC` is an honest statement about the ruleset,
not a promise about traffic already in flight. If you need something stopped *now*, stop it
at the device.

## The three rules that were already there

Your rule list arrives with three rules in it. Taking over the firewall's rule section would
delete the stock rules that came with it, so Rasputin re-creates the load-bearing ones as
rules of its own:

| Rule | Why it is there |
|---|---|
| **`Allow-DHCP-Renew`** | Without it your WAN's DHCP lease can fail to renew, which looks like the internet dropping at random hours later. Leave it alone. |
| **`Allow-Ping`** | Answers ICMP from the WAN zone. |
| **`Allow-IGMP`** | Multicast group management — IPTV and some streaming setups need it. |

**`Allow-Ping` is broader than the stock rule it replaces.** Rasputin's rule schema has no
ICMP-type field, so the rule accepts **all** ICMP from the WAN zone, not only echo-request.
It is safe to disable if you would rather not answer the internet at all; the toggle leaves
it on the tab so you can put it back.

**What you cannot take back.** These three are seeded **at most once per cluster, ever** —
the marker is never cleared. Delete one and nothing brings it back; you would have to
recreate it by hand from the description above. A replaced or renamed firewall node does not
get a fresh set either. Prefer the toggle to `DELETE`.

They are also IPv4 only, because this release is.

## The templates, and the one that is not self-contained

| Template | What it sets up | Still needs |
|---|---|---|
| **Block device from internet** | `lan` → `wan`, any protocol, `reject` — stops one machine reaching the internet while leaving it on your network | `NEEDS: SRCIP` — the address of the device to block |
| **Open port from tailnet only** | from the `ts` (tailnet) zone to the firewall itself, `tcp`, `accept` — a service your mesh devices can reach and LAN devices cannot | `NEEDS: DESTPORT` — the port to open |
| **Isolate IoT from LAN** | `iot` → `lan`, any protocol, `reject` | nothing |
| **Allow ping to firewall** | `lan` → the firewall itself, `icmp`, `accept` | nothing |

Two of them assume your firewall has a zone by that name (`iot`, `ts`). If it does not,
change the field — nothing on this tab will tell you the zone is missing.

**Take the IoT card's own qualifier literally:** *IoT zone can't reach LAN. Internet still
works (separate default rule).* That internet path keeps working because of a *separate*
forwarding rule that came with the firewall — one of the sections Rasputin never writes. So
the template is not self-contained. It blocks IoT-to-LAN on its own, but whether the IoT zone
still reaches the internet depends on configuration outside Rasputin. If you have reworked
your forwarding rules in the firewall's own admin interface, check that path rather than
assuming this card covers it.

## Troubleshooting

**A new block rule does nothing.**
An older `accept` above it is matching first — rules run in creation order and cannot be
moved. Delete the older rule, recreate it after the new one, then `APPLY`.

**You blocked something and it kept streaming.**
The connection was already established, so the new ruleset never sees it. It stops when the
flow ends, the device reconnects, or the box reboots.

**The rule is in the table but nothing changed.**
Either the header pill still says `PENDING` — press `APPLY` — or the row's toggle is off,
which greys the rule and leaves it out of the compile.

**You deleted a rule and it is still being enforced.**
Deleting removes the intent, not the live rule. `APPLY` to make the firewall match your list.

**`APPLY` fails complaining about IPv6.**
`src IP/CIDR` or `dest IP/CIDR` holds an IPv6 literal or CIDR. This release rejects those at
compile time, so nothing was pushed. Fix the field named in the error.

**A rule targeting the firewall itself has no effect.**
Check `DEST`. Blank means the firewall itself; a zone name means traffic passing through.

**The IoT zone lost its internet after applying the isolation template.**
That template only blocks IoT-to-LAN. The internet path comes from a forwarding rule
Rasputin does not manage — check it in the firewall's own admin interface.

**You deleted `Allow-DHCP-Renew` and want it back.**
It cannot be re-seeded — the seeding marker is never cleared, and a replaced firewall node
does not get a fresh set. You have to recreate the rule yourself. This is why the toggle,
not `DELETE`, is the right control for a seeded rule you only want off for now.
