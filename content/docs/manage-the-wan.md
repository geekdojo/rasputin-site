---
title: "Manage the WAN"
description: "Adding a WAN profile hands Rasputin ownership of how your firewall connects upstream — what that takes over, what a wrong profile costs, and why deleting the profiles does not give it back."
weight: 83
applies-to: "2026.08.5"
---

The **WAN** tab configures how the firewall connects upstream. It contains the sharpest edge
in the whole product, so it gets stated before anything else:

> **With zero rows, Rasputin does not manage your WAN at all.** The firewall's own stock
> configuration is in effect and Rasputin never touches it. **This is the state most people
> should stay in.** The moment you add one row, the next `APPLY` writes the firewall's WAN
> section from your profile — Rasputin has taken over that section. If the profile is wrong,
> the firewall loses its internet connection, and there is nothing in Rasputin that will get
> it back for you.

With zero rows the tab says the same thing in its own words: `no WAN configs — the
firewall's stock config is in effect. Add one below for Rasputin to take over.`

**There is no reason to add a profile unless your connection genuinely needs one** — a PPPoE
login, a static address from your ISP, or a DHCP client-ID your ISP requires. A working
connection needs nothing here. Read
[How the Firewall section works](/docs/the-firewall-intent-model/) first if you have not.

## Do this

Only if you have established that your connection needs a profile.

1. **Get a second way to reach the firewall first,** one that does not depend on the uplink:
   its own admin interface across your LAN, or its local console. You may need it in step 5,
   and there is no way to arrange it afterwards.
2. **Have your ISP's settings in front of you** — for Static, the address with its prefix
   length and the gateway; for PPPoE, the username and secret, and the service name if your
   ISP uses one.
3. **Open `Firewall → WAN`** and fill the form:

   | Field | Applies to | Notes |
   |---|---|---|
   | **name** | all | e.g. `isp-primary` |
   | **protocol** | all | `DHCP`, `Static`, or `PPPoE` |
   | **active** | all | Checked means this is the profile that takes effect — and turns the others off |
   | **hostname** | DHCP | Optional. The client-ID sent upstream; a few ISPs key your service to it |
   | **IP / CIDR**, **gateway** | Static | Both required, e.g. `203.0.113.5/24` and `203.0.113.1` |
   | **DNS servers** | Static | Optional, comma-separated |
   | **PPPoE username**, **PPPoE secret** | PPPoE | Both required. The secret is masked as you type |
   | **service name** | PPPoE | Optional; some ISPs require a service tag |

4. **Check exactly one profile is marked active.** Turning one on turns the others off
   automatically.
5. **Press `APPLY`** and confirm the connection still works. This is the step that can cut
   your uplink.

<!-- SCREENSHOT: firewall-wan.png — the WAN tab with one profile listed showing NAME, PROTO
and the DETAILS summary, plus the profile form below. -->

Existing profiles show `NAME`, `PROTO`, and a `DETAILS` summary, with the same toggle /
`EDIT` / `DELETE` actions as elsewhere — and the same rule that nothing happens until
`APPLY`.

IPv4 only in this release. IPv6 WAN and cellular modems are not here yet.

## Adding a row is taking ownership

**What it protects.** Having the WAN in Rasputin means your upstream settings are described
in one place, survive a firewall reconfiguration by Rasputin, and can be switched
deliberately — useful if your ISP needs a PPPoE login or a static address that you would
otherwise be re-entering by hand on the box.

**What it does not protect.** Nothing validates that the profile is *correct*. Rasputin
checks the shape of what you typed, not whether your ISP will accept it. A profile that is
syntactically fine and factually wrong compiles, pushes, and takes your connection down.

**The consequence of each choice.**

- **Zero rows** — Rasputin does not write the WAN section. The firewall keeps whatever it
  came with, or whatever you set in its own admin interface.
- **One profile, active** — that profile is what the firewall's WAN section says after the
  next `APPLY`.
- **Several profiles, one active** — this is switching between connections, not combining
  them. **There is no multi-WAN failover and no load balancing here.** Exactly one can be
  active at a time.
- **Profiles, none enabled** — the tab warns you, and it means what it says: the next
  `APPLY` brings the WAN interface **down administratively** and outbound traffic stops. That
  is a deliberate "disconnect me" gesture. It is not the way to undo WAN management.

**What you cannot take back.** If a bad profile cuts the uplink, **there is no recovery path
inside Rasputin.** Fixing it means getting to the firewall another way — the second path from
step 1. That is the honest position, and we have no procedure to offer beyond it, which is
exactly why step 1 comes before step 3.

## Deleting every profile does not hand the WAN back

This is the point where "delete does not un-push" stops being an inconvenience and becomes a
trap, so read it twice.

**Deleting every WAN profile stops Rasputin *managing* the WAN. It does not restore what the
firewall had before.** With no profiles, an `APPLY` carries no WAN section at all — and an
absent network section means *leave the firewall's network configuration entirely alone*. So
whatever Rasputin last pushed is simply left in place and stays live. There is no revert, and
no warning that you have left a configuration behind.

**What actually puts the WAN back the way you want it** — and both of these have to happen
**before** you delete the rows:

- **Correct it in Rasputin.** Edit the profile to the settings you want, mark it active,
  `APPLY`, confirm the connection works, and *only then* delete the profiles if you no longer
  want Rasputin involved. The settings you applied stay live.
- **Correct it in the firewall's own admin interface.** Set the WAN there, then delete the
  Rasputin profiles so nothing overwrites it on a later apply. Note that changes you make
  there will show as `DRIFT` on the next reconcile — see
  [How the Firewall section works](/docs/the-firewall-intent-model/).

Deleting the rows first leaves you with a firewall running settings that no longer appear
anywhere in Rasputin, and no record of what they were.

## Troubleshooting

**The internet stopped right after an apply.**
Check this tab. Either the active profile is wrong for your connection, or you have profiles
with none enabled — which brings the WAN interface down on purpose. Correct the profile and
`APPLY`. If the firewall cannot be reached to push the correction, the only way in is the
firewall's own admin interface or its local console; there is no path to it from here.

**You deleted your WAN profiles and the old settings did not come back.**
Expected. Deleting profiles stops Rasputin managing the WAN; it does not revert what was
pushed, so the last-pushed configuration is still live on the firewall. Set the WAN where it
is actually running — in Rasputin with a corrected profile, or in the firewall's own admin
interface.

**The tab shows a warning that no profile is enabled.**
The next `APPLY` will bring the WAN down. Mark the profile you want active, or delete the
profiles if you meant to stop managing the WAN — but read the section above before you do.

**You want a backup connection to take over automatically.**
Not in this release. Profiles are a manual switch — exactly one active — with no failover and
no load balancing.

**You enabled a second profile and the first turned itself off.**
That is by design. Only one profile can be active, so enabling one disables the others.
