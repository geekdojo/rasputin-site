---
title: "Finish first-run setup"
description: "The five setup cards on a freshly flashed control plane — the three that are required, the two that are not but matter anyway, and which deployment mode to pick when nothing is running yet."
weight: 11
applies-to: "2026.08.5"
---

**FIRST-RUN SETUP** turns a freshly flashed control plane into a cluster you can use. It is
not a wizard: all five cards are on screen at once in the order the control plane serves
them, each one independently actionable. Do them in any order, and come back afterwards to
change any of them.

This picks up where [Get in the first time](/docs/get-in-the-first-time/) leaves off — that
document installs the cluster's certificate and registers the passkey that *is* your
account, and its last step hands you here.

<!-- SCREENSHOT: setup.png -->

## Do this

1. **Sign in.** On a box whose setup is not complete you land on **FIRST-RUN SETUP**
   automatically. To get back to it later, use the **FINISH SETUP →** link in the banner
   under the top bar, or the setup row on **Alerts**, or type `/setup`.
2. **Name your Rasputin.** Type a short label — the placeholder is `rasputin-home` — and
   press **`SAVE`**. The card ticks, and the name appears as `CLUSTER` in the top bar.
3. **Choose a deployment mode.** Click the card that matches how you physically plugged the
   box in. Read [Which mode to pick now](#which-mode-to-pick-now) first: this is the
   consequential one, and clicking applies it immediately.
4. **Open [Tasks](/docs/watch-what-the-cluster-is-doing/) and confirm the firewall job
   succeeded.** Picking a mode submits one, and this page will not tell you if it failed.
5. **Press `ENROLL <NODE-ID> IN MESH`** on the remote-access card, where `<NODE-ID>` is this
   control plane's own node id in upper case. Nothing else will ever tick this card.
6. **Check the trust card is green** and reads *Update signing is verified*. If it is amber,
   stop and read [Update trust is not optional](#update-trust-is-not-optional).
7. **Press `FINISH SETUP & CONTINUE`.** It is greyed out until the three required cards —
   passkey, name, mode — are done; hovering it then says `Finish the required steps first`.
   You land back on Nodes.

**The passkey card is already ticked when you arrive**, because `/setup` is behind sign-in.
Treat it as a record of a condition the page depends on rather than a task.

**There is no nav-rail entry for this page.** The banner, the Alerts row and the post-sign-in
redirect are the only routes back, so bookmark `/setup` while the banner is still there.

**On the remote-access card and away-from-home access.** The mesh is the mechanism that could
carry it and we demonstrate it on our own bench. This release does not claim working access
from outside your home network. Read the card as "put the control plane on the private mesh",
which is true and useful, rather than as a remote-access switch. See
[the Mesh page](/docs/the-mesh/).

## How the page decides a card is done

**Every tick is measured, not remembered.** Each card is derived live from a probe on every
visit — the sign-in subsystem for the passkey, the saved name, the mesh for membership, the
update subsystem for the trust root. So the page cannot go stale and is always safe to
re-open: if the mesh later forgets this node, that card goes back to un-done by itself and
nothing needs resetting. The deployment mode is the one exception, deliberately — no probe
can tell you which topology you *meant*, so it is the single piece of intent this page
stores.

**Setup counts as complete only when both things are true:** every required card is done
*and* you pressed the button, which writes the timestamp a finished page shows as
`SETUP COMPLETE · <local date and time>`, in your browser's time zone. That second condition
is not bureaucracy — signing in registers a passkey, so a box can reach "all required done"
purely by detection, and the control plane will not declare your first hour finished on that
basis.

**The page keeps working afterwards.** Every control still functions and the timestamp
replaces the Finish button. Use it later to rename the installation, to check trust and mesh
are still as you expect, and to enrol the control plane in the mesh if you skipped it. Do
**not** use it to change the deployment mode of a running cluster — use
[Settings](/docs/settings/), which confirms first.

## Which mode to pick now

This single choice decides which half of Rasputin runs at all, and on this page it applies
the moment you click — there is no confirm step and no `APPLY`. That is correct during
first-run, when nothing is live yet. It is a sharp edge afterwards: once the cluster is
carrying traffic, change the mode from [Settings](/docs/settings/), which uses the same three
cards but asks you to confirm and states the specific consequence first.

With nothing running yet, pick this way:

- **No firewall node?** *Join my existing network* is your only option. The other two cards
  are dimmed and unclickable, hovering one says `Needs a firewall node — see below`, and the
  control plane enforces the same rule on its own side, so there is no other route to them.
  This is the only mode a Pi-only cluster can ever be in. What unlocks those cards is a
  firewall-role node **registered** in the cluster, so a box that is still booting unlocks
  nothing until it has registered — and the page reads that state only when it loads, so
  reload it after the node registers before concluding your hardware is unsupported. The hint
  underneath recommends a
  `CWWK x86-P5 (Intel N100, dual 2.5GbE)` or equivalent, meaning a small dedicated box with
  two network ports.
- **Have a firewall node and want to learn?** Take *Give Rasputin its own protected network
  to learn on* — the card Rasputin itself badges `RECOMMENDED FOR LEARNING`. You get the
  whole firewall, DHCP and threat-detection experience on a real network, and a mistake
  takes down your lab rather than the house.
- ***Rasputin runs my internet connection* is the one to pick last, not first.** It is the
  least forgiving of the three: every device in the house ends up depending on the firewall
  node being up.

Above the cards, **`+ Which mode is right for me?`** swaps each card's one-line summary for a
fuller explanation. Open it before you click anything.

**What the two firewalling modes protect.** In *Rasputin runs my internet connection* and
*Give Rasputin its own protected network to learn on*, the firewall node becomes the thing
standing between its network and the internet: it hands out addresses, filters what crosses,
and watches traffic for threats.

**What they do not protect.**

- **Threat detection detects and reports — it does not block.** It is a witness, not a
  guard. Choosing a firewalling mode does not stop an attack; it tells you one happened.
- ***Join my existing network* means Rasputin does no firewalling at all.** Your router
  keeps doing it. The **Firewall** section is hidden from the nav rail entirely in that
  mode, rather than offering you controls with nothing behind them — so a missing Firewall
  icon is the mode, not a fault.
- **No mode changes how nodes are found.** Rasputin finds nodes by their `.local` names over
  mDNS, which does not cross routers, so a node you are enrolling has to sit on the same
  network segment as the control plane to be found at all. Worth knowing before you pick the
  mode that puts a router in the middle.

**The consequence of each choice.**

- ***Rasputin runs my internet connection*** — your firewall node takes over the WAN
  connection, DHCP for the whole LAN, NAT, and threat detection. Your existing router is out
  of the path: you are replacing it, not sitting beside it.
- ***Give Rasputin its own protected network to learn on*** — the firewall node firewalls a
  *downstream* segment hanging off your existing router. You get the full firewall,
  DHCP-on-that-segment and threat-detection experience, and the double-NAT that implies is
  accepted by design and noted in the card's own copy.
- ***Join my existing network*** — almost nothing about your network changes, which is the
  point. Rasputin runs apps, storage, backups and the mesh. If a firewall node is already
  registered, it is put into an idle state rather than left running, specifically so its
  DHCP cannot start competing with your router's.

**The part you are not shown.** Picking a mode also submits a job that pushes the firewall
box into the matching state — active for the two firewalling modes, idle for *join my
existing network*. **That job's outcome is not reported on this page.** The card ticks and
the page tells you nothing else. If the firewall node was unreachable at that moment —
powering up, re-cabled, mid-reboot — the mode is stored, the box is left as it was, and the
only places that say so are [Tasks](/docs/watch-what-the-cluster-is-doing/) and the **Firewall**
page's own state. If the job could not be *submitted* at all there is no Tasks row either:
that case is recorded nowhere but the control plane's own log, which leaves the Firewall
page's state as your only evidence. So after choosing a mode, open Tasks and confirm.

**What you cannot take back.** Nothing here is one-way — you can click a different card, and
while nothing is live that costs you nothing, which is exactly why first-run is the cheap
moment to decide. What you cannot undo is a failed firewall job silently leaving the stored
mode and the box's real state out of step. Nothing is corrupted by that, but it stays that
way until you re-select the mode with the firewall node online, or press `APPLY` on the
**Firewall** page. And once devices depend on this cluster, switching away from a firewalling
mode stops being a free choice and becomes a disruption you have to plan — which is why that
version of the change belongs on [Settings](/docs/settings/) and not here.

## Update trust is not optional

The trust card has nothing to click; it reports what a probe found. The word "optional" on it
is doing a lot of work. It is optional in exactly one sense — it does not block
`FINISH SETUP & CONTINUE` — and in no other.

**What it protects.** It confirms this system can verify that an OS update is authentic
before installing it, so the image you are about to run is the one Rasputin signed.

**What it does not protect.** Only that. It says nothing about the apps you install, nothing
about your network, and nothing about who can sign in. It is one check on one supply chain.

**The consequence of leaving it amber.** With no trust root **nothing updates at all** —
nothing stages, nothing installs, the whole update path is refused. The card's own copy says
so:

> The update trust root is missing, so OS updates can't be verified — and are therefore
> refused: nothing stages or installs until it is in place.

So a "finished" setup with an amber trust card is a cluster you cannot patch. The
required-versus-optional framing on the page undersells that badly: read the card, not the
badge. See [Roll out an update](/docs/roll-out-an-update/) for what that blocks.

**What to do about it.** On Rasputin hardware the trust root is preinstalled, so on a real
system an amber card means re-flash the OS image. The same copy also offers a
`./scripts/pki-init.sh` route and a `RASPUTIN_UPDATE_TRUST=dev-permissive` start-up variable
— **those are for a laptop checkout, not for hardware.** Do not use them to make the card go
green on a box you intend to run.

**What you cannot take back.** Nothing about the card itself: it is a reading, and it turns
green on your next visit once a real trust root is in place. The cost is in the timing. On
hardware the fix is re-flashing the OS image, so this is much cheaper to notice now, on an
empty box, than after you have built a cluster on it.

## Troubleshooting

**`FINISH SETUP & CONTINUE` stays greyed out.**
A required card is still un-done — look for the amber `REQUIRED` badge; only the passkey,
name and mode cards carry one. The button is also briefly disabled while another card's write
is in flight, and reads `FINISHING…` while your press is being handled.

**The banner says setup isn't complete, but every card is ticked.**
Nobody has pressed Finish. Open `/setup` and press `FINISH SETUP & CONTINUE`.

**A finished page still shows badges.**
`CURRENT` on your current mode card and `RECOMMENDED FOR LEARNING` on the learning card
render unconditionally, including after setup is complete. They are labels, not outstanding
work — only the amber `REQUIRED` badges disappear as cards are satisfied.

**Two of the three mode cards are dimmed and won't click.**
No firewall-capable node is registered. Power the firewall node on, wait for it to register,
and reload the page — or choose *Join my existing network*, which needs no firewall node.

**The mode ticked, but the firewall didn't change state.**
The firewall job was submitted and failed, or could not be submitted at all. Open **Tasks**
for the reason, then re-select the mode with the firewall node online, or press `APPLY` on
the **Firewall** page.

**The remote-access card never ticks.**
It never will on its own. The background mesh reconciler enrols firewall, compute and storage
nodes automatically and deliberately never enrols the control plane, so waiting for the mesh
to converge waits forever. Press `ENROLL <NODE-ID> IN MESH` here, or use the enrol control on
[the Mesh page](/docs/the-mesh/).

**`Enrollment failed: <reason>`, or `Enrollment is still running`.**
The card watches the enrollment job to a finish rather than ticking optimistically, so a
failure is reported on the card instead of leaving a quietly wrong circle. "Still running"
means the page waited about a minute and stopped watching; the job is unaffected. Real
enrollment on modest hardware restarts the mesh daemon, waits for it, and brings the
interface up, so a slow success is normal. Check **Tasks**, then reload this page.

**An amber `RASPUTIN_SELF_NODE_ID` warning on the remote-access card.**
The control-plane process was not told which node in inventory it is, so it cannot address
its own agent. That is a configuration problem on the machine, not something this page can
fix: set it as the card describes and restart the control plane.

**The trust card is amber on real hardware.**
The OS image's trust root is absent. Re-flash the OS image, and do not reach for the
dev-permissive option — see [Update trust is not optional](#update-trust-is-not-optional).

**`SAVE` on the name card stays greyed out.**
The field is empty or holds only spaces. Leading and trailing spaces are trimmed, and you
cannot submit an empty name from this card at all.

**Renaming the installation didn't change the address you reach it by.**
It never does. The name is a label — currently its only effect is the `CLUSTER` tile in the
top bar, which reads `RASPUTIN` before you save one. It is not your cluster id; that was
fixed when you flashed the machine, is what your address bar resolves, and cannot be changed
from this page or any other. Renaming is free and has no effect on passkeys, nodes, or
certificates. The card's copy mentions a later use as a mesh hostname prefix; that does not
happen in this release.

**The `Register a passkey` card is un-done.**
You should not be able to see this page in that state, since `/setup` is behind sign-in. If
you can, register on the sign-in page — see
[Get in the first time](/docs/get-in-the-first-time/).
