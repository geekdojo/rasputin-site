---
title: "Settings"
description: "Two settings you can change on a whim, and four that change how your cluster is reached, defended, and accessed — with the consequence of each choice spelled out."
weight: 100
applies-to: "2026.08.5"
---

**Settings** is the last icon on the nav rail. Two of its sections are preferences you can
flip freely. The other four decide how your cluster sits on your network and who can get
into it, and each one gets its own section below.

`<cluster-id>` throughout is your cluster's own identifier, fixed when you provisioned it.

## The two you can change freely

1. **Pick a theme.** Under **APPEARANCE / THEME**, click either card — **MISSION CONTROL**
   (the default) or **CYBERDECK**. It applies instantly; there is no save button and no
   reload. The choice is stored in *that browser on that device*, so it does not follow your
   account, does not affect other operators, and does not carry to your phone.
2. **Turn on recording, if you want history.** **METRICS & LOGS** is the switch for the
   observability stack. Without it you still get node status, tasks and basic alerts; with it
   you also get each node's CPU, memory and disk over time, container activity, searchable
   logs, and threshold alerts. Switching it on confirms first, then downloads roughly 500 MB
   the first time — expect a few minutes before charts fill in, and use the
   **Follow it in Tasks →** link rather than watching the page. Recorded data keeps growing
   and is not size-capped yet, so this is happiest on a control plane with an SSD or NVMe
   drive rather than a memory card. Turning it off stops recording but **keeps everything
   already recorded**, and turning it back on later picks up where it left off.

Everything else on the page is in one of the four sections that follow. Read the section
before you touch the control.

## Deployment Mode

This single choice decides which half of Rasputin runs at all. Three cards; the current one
carries a **CURRENT** badge and is not clickable, since changing means picking a different
card. **+ Which mode is right for me?** swaps every card's one-line summary for a fuller
explanation.

| Mode | What it means |
| --- | --- |
| **Rasputin runs my internet connection** | The cable from your modem goes straight into Rasputin. It becomes your router — handing out addresses, running the firewall, and watching traffic for threats. The most control, and the biggest change to your network. |
| **Join my existing network** | Your current router stays in charge and keeps doing the firewalling. Rasputin plugs into a spare port like any other device and runs your apps and storage. The lowest-risk way to start — nothing about your home network changes. |
| **Give Rasputin its own protected network to learn on** | Badged **RECOMMENDED FOR LEARNING**. Your router stays, but Rasputin gets its own walled-off network branching off it, where you can set up the firewall, threat detection and network rules on a real network without risking the family's Wi-Fi. Your traffic passes through two routers, which is fine for almost everything. |

**What the two firewalling modes protect.** In *Rasputin runs my internet connection* and
*Give Rasputin its own protected network to learn on*, Rasputin hands out addresses, runs
the firewall, and watches traffic for threats on its network.

**What they do not protect.** Threat detection **detects and reports — it does not block**;
treat it as a witness, not a guard. In *Join my existing network* mode Rasputin does no
firewalling at all, and the **Firewall** section disappears from the nav rail rather than
offering you controls with nothing behind them. And in every mode Rasputin finds nodes by
their `.local` names over mDNS, which does not cross routers — a node you are enrolling has
to sit on the same network segment as the control plane to be found at all.

**Two of the three need a firewall node**: a small dedicated box with two network ports,
enrolled in the cluster. Without one, those two cards are grayed out and hovering them says
*"Needs a firewall node — see below"*, with a note recommending a **CWWK x86-P5 (Intel N100,
dual 2.5GbE)** or equivalent.

**The consequences, per choice.** Changing the mode **reconfigures the firewall node** and
takes effect within a minute or two. Picking a card opens a **Change deployment mode?**
confirmation that states the specific consequence first:

- **To *Rasputin runs my internet connection*** — Rasputin becomes your router: it starts
  handing out addresses, running the firewall, and watching for threats on its network port.
- **To *Give Rasputin its own protected network to learn on*** — the same, confined to its
  own protected network.
- **To *Join my existing network*, on a cluster with a live firewall node** — this is the
  dangerous one, and the dialog is styled as such. It **turns your firewall node off**: it
  stops handing out addresses and stops watching for threats. If Rasputin is currently
  running your network, connected devices — including, as the dialog puts it, "the one you're
  using right now" — may drop offline when their address lease renews. Only switch if another
  router on the network hands out addresses.
- **To *Join my existing network*, on a cluster with no firewall node** — a calmer variant
  saying only that Rasputin will run as a device on your existing network. There is no
  firewall to turn off, so nothing about your network changes.

**What you cannot take back.** Nothing here is one-way in the UI — you can switch back. What
you cannot undo is the disruption in the middle: devices that lost their lease while there
was no DHCP server have to get an address from somewhere, and if the machine you are working
from is one of them you will be fixing it from the other side of the change.

## Network DNS

Off by default. Turning it on makes the control plane answer DNS **for your whole network**:
it resolves your cluster's LAN app and node names — `jellyfin.lan.<cluster-id>.internal` and
the like — authoritatively, and forwards everything else to the internet. The LAN names are
the ones it serves; the bare `<app>.<cluster-id>.internal` form is the tailnet name, answered
by the mesh, and this nameserver returns nothing for it.

**What it gives you.** Without it you reach apps by address and port. With it, app names
work on every device on the network, including the phones, TVs and consoles you cannot
configure individually. It earns its keep most in *Join my existing network* mode, where
there is no Rasputin firewall to hand the job to.

**What it does not do.** It resolves and forwards. It is not a content filter, it does not
block anything, and it has no bearing on the traffic that follows the lookup. It also does
not point your devices at itself — you do that, in your router.

**The consequence of turning it on** is that your whole household's name resolution now
depends on one machine. There is no second control plane to take over: while it is down or
rebooting, devices pointed at it cannot resolve names — not your apps, and not the internet.
Weigh that before you point the router at it.

When the toggle reads **ANSWERING DNS**, the section shows the control plane's current LAN
address, to point your router's DNS server at, and its MAC address with a **COPY** button.
**Reserve that address in your router by MAC.** If the control plane's address moves the next
time it reboots, every device on the network is pointed at a resolver that is no longer
there. Both values are your cluster's own — read them off your screen.

**Forward other lookups to** takes an address plus **SAVE**. Leave it blank for `auto`, which
inherits the resolver the control plane itself was given; the page states underneath what it
is actually forwarding to right now and appends *(auto)* when the value was chosen for you.
If it could not work out a safe upstream from your network, it says so in amber and falls
back to a public resolver until you enter one.

**What you cannot take back.** Turning the toggle off stops the cluster answering — but
anything you pointed at it, your router's DNS setting above all, has to be pointed back by
hand. Rasputin cannot undo a change you made in your router.

## Operator SSH key

The SSH **public** key or keys this cluster remembers for you, so the Add-node wizard can
prefill one instead of asking you to paste a key at every enrollment.

**Put your key here before you enroll anything, and take the prefill every time.** A node
can only be given an SSH key as it is enrolled. A node enrolled without one has no network
shell for the rest of its service — the only way into it is the local console, protected by
a default password shared by every Rasputin OS node. Storing your key here once means every
later enrollment offers it already filled in, so you cannot forget it on the node you add in
a hurry. This is the single cheapest thing you can do now to avoid a node you can only fix
by carrying a keyboard to it.

**What it protects.** Rasputin's OS image runs a key-only SSH server — no password
authentication at all — and the image bakes in no key. A key seeded at enrollment is
therefore the only thing that makes SSH to that node possible.

Paste a public key line, the kind in `~/.ssh/id_ed25519.pub`, and press **ADD KEY**; the
field refuses a malformed line or a duplicate before saving. **✕** removes a key from the
list. On a fresh cluster you do not have to seed it by hand: the first Add-node enrollment
that uses a key stores it here automatically.

**What it does not protect.** This list is a convenience for the Add-node wizard, not an
access-control surface. In the section's own words: *"Changes apply to future enrollments
only; nodes already running keep the key they were seeded with."* Concretely:

- Adding a key **does not** grant you SSH access to nodes that are already enrolled. Only
  nodes enrolled after the change get it.
- Removing a key here **revokes nothing**. A node seeded with that key still accepts it.

**The consequence** is that rotating your key is forward-only as far as this page goes. To
change the key on a node that is already running, either edit
`/var/lib/rasputin/dropbear/authorized_keys` on that node — the file is the node's own and
its SSH server re-reads it on every attempt, so nothing needs restarting — or re-enroll the
node. Editing it needs a way in already: the key the node already has, or its local console.
[Replace or revoke an SSH key on a node](/docs/replace-or-revoke-an-ssh-key/) walks through the
edit.

**What you cannot take back.** Removing a key from this list is not a revocation and cannot
be treated as one; if you need a key to stop working on a node, you have to do it on the
node.

## BMC / power & console

Out-of-band power control and a serial console for nodes reached by a management
controller — the way to power-cycle a node that is not answering. The section states the
current state after *Currently:*, which reads **OFF** until you select a backend.

**It is off until you choose a backend here.** Nothing is assumed and nothing is
auto-detected: with no backend selected, no power or console controls appear anywhere in the
UI and the control plane refuses BMC operations outright.

**What it gives you.** A way to act on a node when its own operating system will not — power
it off, power it on, watch it boot on a serial console.

**What it does not give you.** It covers only the nodes the host node advertises, and
nothing else in the cluster. It does not discover your hardware: you pick the backend, and
you name which node physically reaches the management bus. And it is not a substitute for
the node being healthy — it acts on the chassis, not on what the node is running.

The controls in brief: **BACKEND** is a list served by the cluster itself — *None (BMC off)*
plus the hardware Rasputin can currently drive, which is the **BitScope CB04B blade rack**,
**Turing Pi 2 / 2.5 (network BMC)**, and a **Mock** backend for development.
**BMC HOST NODE (owns the bus)** is required once a backend is chosen. Per-backend fields
appear below it, and the Turing Pi flow has its own steps — **DETECT BOARD**, then an
explicit **ACCEPT THIS BOARD** — walked through in the [Turing Pi
guide](/docs/turing-pi/).

**What you cannot take back mid-flight.** **APPLY** confirms first, then pushes the selection
to the host node, which takes over the management bus and re-registers. Close any open serial
console before you press it. The confirmation dialog says `Any open serial console closes.`,
but what you will meet is a refusal: the control plane will not reconfigure BMC while a
session is open, and the job fails with `N SoL session(s) open — close the console before
reconfiguring BMC`. The count is cluster-wide, so a console open on any node blocks the
change. Power and console controls then appear only for the nodes that host advertises.
Applying *None* is a hard off — the host clears its configuration, stops advertising, every
control disappears, and the API refuses BMC operations again.

## Troubleshooting

**Two of the three deployment-mode cards are grayed out.**
Those two need a firewall-role node registered in the cluster — a dedicated box with two
network ports. Registration is the gate, not liveness: a node that has registered once counts
even while it is powered off. If yours is still booting, reload the page once it has
registered; the page reads that state only when it loads.

**Devices dropped offline after switching to *Join my existing network*.**
That switch turned the firewall node off, so it stopped handing out addresses; devices lose
connectivity as their leases renew. Something else on the network has to hand out addresses.

**The Firewall section vanished from the nav rail.**
The cluster is in *Join my existing network* mode and has no firewall to configure.

**Your theme didn't follow you to another browser, or to your phone.**
It is a per-browser preference held in that browser's local storage, not a cluster setting.
In a private window, or a browser with site storage disabled, it applies for the session and
is forgotten when you close it.

**Metrics is on but the charts are empty.**
The first start downloads roughly 500 MB; give it a few minutes and follow the job from
**Follow it in Tasks →**. While it is starting, any pull or health failure is shown in the
**METRICS & LOGS** section itself rather than leaving you to hunt for it.

**Network DNS is on but names still don't resolve on your devices.**
Turning it on makes the cluster *able* to answer; your router still has to point at the
control plane's LAN address, and that address should be reserved by MAC so it cannot move.

**The forwarding line under *Forward other lookups to* is amber.**
The control plane could not work out a safe upstream resolver from your network and has
fallen back to a public one. Enter an address and **SAVE**.

**The BMC section shows an amber note about an environment variable on a node.**
That node's agent was started with the backend fixed. It cannot be managed from this page
until that is removed and the agent restarted.

**You added an SSH key but still cannot SSH into a node.**
The key applies to future enrollments only. A node already running keeps the key it was
seeded with — change it on the node, or re-enroll.
