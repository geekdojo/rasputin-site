---
title: "BMC — power and console"
description: "Out-of-band control of nodes that aren't answering: which management hardware Rasputin drives, what each one can actually do, and how to set it up."
weight: 12
---

BMC control is for the case where a node stops answering. The agent is gone, SSH is gone,
and the only thing left is whatever management hardware sits beside the machine rather
than on it. Rasputin drives that hardware directly, so a wedged node is a button in the
dashboard instead of a walk to the rack.

Because it is a *different* piece of hardware on every cluster board, what it can do
varies. Rasputin does not paper over that.

## What controls you get

Each node's panel shows only the controls its management hardware can honour:

| Control | What it does |
|---|---|
| **BMC ON / OFF** | Cuts or restores power at the board. A hard cut — the OS is not asked. |
| **FORCE RESTART** | Restarts the node without the OS's cooperation. Use `REBOOT (OS)` instead while the node still responds. |
| **CONSOLE** | A serial console in the browser, reaching the node's login prompt with no network or agent involved. |

A control that your hardware cannot honour **is not rendered**. That is deliberate: a
button that fails on click is worse than an absent one, because it costs you a diagnosis
during an outage. If you don't see CONSOLE on a board, the table below says why.

## Supported management hardware

| Board | Power / restart | Console | Notes |
|---|---|---|---|
| **Turing Pi 2 / 2.5** | Yes | Use the board's own — [why](#why-the-turing-pi-has-no-console) | Over the board's REST API. Needs BMC firmware 2.0.0+. [Setting one up](#setting-up-a-turing-pi-2). |
| **BitScope CB04B blades** | Yes | Yes, full character mode | Over the rack's serial control bus. [Setting one up](#setting-up-a-bitscope-rack). |

Other hardware is not supported yet. Rasputin is pre-alpha and the list is short on
purpose — each entry is a driver we run on our own bench, not a spec we read.

## Turning it on

BMC is off until you select a backend in **Settings → BMC**. Nothing registers, nothing is
advertised, and the control plane refuses every BMC operation until then — a cluster that has
not been told about management hardware does not guess.

Two things get picked there whichever hardware you have:

- **The backend** — which driver runs.
- **The BMC host** — which node talks to the management hardware. Every BMC command is routed
  to that node's agent, so it has to be a node that can actually reach the hardware: on a
  Turing Pi, any node on the board's network; on a BitScope rack, the one node wired to the
  control bus.

The rest of the form differs by backend, because the hardware does. The two sections below
cover each one. Press **APPLY** when the form is filled in.

## Setting up a Turing Pi 2

The board's BMC is on your network and answers a REST API, so Rasputin can go and find it. The
form works top to bottom:

1. **BMC USERNAME** — `root`, unless you changed it on the board.
2. **BMC PASSWORD** — the board's BMC password. It ships as `turing`, and the page warns you if
   you leave the factory one in place: that account also serves SSH, on a board sitting on your
   LAN.
3. **BMC ADDRESS** — leave it blank to have Rasputin find the board, or type its address
   (`turingpi.local`, or an IP). The search runs from the BMC host node, which is on the
   board's network — not from your browser, which may not be.
4. **DETECT BOARD** — finds the board and shows you the certificate it presents.
5. **ACCEPT CERTIFICATE** — the moment you decide to trust this board, which is why it is its
   own button. Rasputin then reads the board again with your credentials and fills in which
   node is in which slot.
6. Check the four slot rows, set any Rasputin could not work out for itself, and **APPLY**.

Slot detection reads each node's console looking for its login prompt, so a slot that is
powered off, or running something that is not Rasputin, comes back blank — pick the node
yourself in that case. There is a fuller walkthrough in the [Turing Pi guide](/docs/turing-pi/).

### About that certificate

The board's certificate is self-signed and dated 1970 — it has no clock at boot — so it always
reads as expired and no certificate authority can vouch for it. Rasputin pins the exact
certificate instead, which is stricter than CA trust: it accepts one certificate rather than
anything chaining to an authority.

Accepting it is deliberately a separate button, because that is the moment you decide to trust
this board. **It works the way `ssh` does when it asks about an unknown host key.** Once
accepted, a changed certificate is refused rather than silently trusted, and Rasputin tells you
the two things that cause it — the BMC firmware was reinstalled, or something else is answering
in the board's place.

The honest limitation, same as `ssh`: nothing independently verifies the certificate the
*first* time you are shown it. If you want that assurance, the board displays the same
fingerprint in its own web interface — compare the two before accepting. Most homelabs won't
bother, and that is a reasonable choice on a network you control; the option is there if your
situation is different.

One thing worth being clear about: Rasputin recognises a Turing Pi by how its BMC answers an
unauthenticated request. That identifies the board so the page can say "found a Turing Pi"
before you have typed a password. It is not a security check — anything can imitate that
response — which is exactly why the certificate is the thing you accept, and why your password
is only ever sent to a board presenting the one you accepted.

### Why the Turing Pi has no console

The Turing Pi's BMC does expose the nodes' serial ports, so this looks like something we
skipped. It isn't. We built the driver, ran it on the board, and found its serial
interface is shaped for a different job than the one Rasputin's console does.

The board's UART access is **request-based**: you ask for the output that has accumulated
since last time, and you send input a line at a time. That's a good fit for scripting and
for checking in on a node — it's what `tpi uart` is built on, and it does that job well.
What it isn't is a continuous stream. There's no per-keystroke channel, so no `Ctrl-C`,
arrow keys or ANSI; and because output collects in a fixed buffer between requests, a
burst longer than the buffer can roll over before the next read picks it up.

Rasputin's console is pointed at one case in particular: watching a node boot when nothing
else about it is working. That wants an uninterrupted stream, since the line you need is
usually the one you didn't know to wait for. Built on periodic reads, it would be fine most
of the time and patchy during exactly the fast console output you were trying to catch —
and those gaps would look like our bug rather than the shape of the interface underneath.

So we don't offer one here. Power and restart work fully on a Turing Pi; console is absent
on purpose, and the dashboard shows you that rather than a button that disappoints.

**If you want a serial console on a Turing Pi**, the board already has one — `tpi uart`,
or the console in the Turing Pi BMC web interface. It's built for that interface and does
it properly, so we'd rather send you there than ship a second-best version of it.

## Setting up a BitScope rack

A BitScope rack is a different shape of problem. Every node has its own BMC, all of those BMCs
share one control bus, and that bus is reached over the serial port of a single node sitting in
the rack — the **rack manager**. There is nothing on the network to look for, so there is
nothing to detect: you tell Rasputin where the bus is and what is plugged in where.

### Before you start: the rack manager

The node you use as manager has to have been provisioned with `RASPUTIN_BMC_HOST=1` in its seed
(see [Provisioning](/docs/provisioning/)). That flag takes the login prompt and the kernel's own
messages off the node's serial port, because on that port they are not log output — they are
bytes on a live command bus.

It is read at first boot, so this is a provisioning-time decision. If the node you want as
manager was not provisioned with the flag, provision it again with it set. Then choose that
same node as the **BMC HOST** in Settings — the two have to agree, and nothing checks that for
you yet.

### The form

- **SERIAL DEVICE** — `/dev/ttyS0`, the Pi's 40-pin-header UART. Type it in: on Rasputin
  **2026.07.7** the field defaults to `/dev/serial0`, the Raspberry Pi OS name for the same
  port, which the Rasputin image does not create — so leaving it blank fails to open the bus.
  A later release defaults it correctly and you can leave it blank; typing it works on both.
- **UNLOCK SEQUENCE** — leave it blank. The blades' BMCs ship locked and blank means the
  factory unlock sequence. Fill this in only if you have written a different one into the
  blades' EEPROMs yourself.
- **ADDRESS MAP** — below.

### The address map

Rasputin addresses a node by where it physically sits, because that is how the bus works: a
blade derives each node's address from its position, with no commissioning step. So the map is
a list of rack positions and which Rasputin node is in each one.

A position is `ROW-SLOT`:

- **Rows are `A` to `F`, top to bottom** — `A` is the topmost blade in the rack.
- **Slots are `0` to `3`, right to left** as you face the front — `0` is the rightmost node on
  a blade.

So `A-0` is the **top-right** node and `F-3` the **bottom-left**. Both axes count from the
top-right corner, which is worth fixing in your head before you start typing: it is the
opposite of the bottom-up numbering most racks use.

One JSON row per node:

```json
[
  {"pos": "A-0", "node_id": "c01"},
  {"pos": "A-1", "node_id": "c02"},
  {"pos": "A-2", "node_id": "c03"}
]
```

`node_id` is the Rasputin node id — the name the node appears under in the dashboard, which is
the one you gave it when you provisioned it.

Only the nodes you list get BMC controls. A slot that is empty, or that holds something which
is not part of this cluster, is simply left out; Rasputin then advertises nothing for it rather
than offering a button that would act on someone else's machine.

**Get the positions right before the rack is carrying anything.** Nothing verifies this map for
you. If a row is off by one, the OFF button on `c05` cuts power to `c06`, and that will look
like a Rasputin bug rather than a typo. Two ways to be sure:

- **Write it down as you build.** If you are provisioning the rack yourself, you know which
  node id you seeded onto which card as you slide it into a slot. Recording it then is the only
  method that costs nothing.
- **Verify one node at a time.** On a rack that is not doing anything yet, apply your best
  guess, then power one node off from the dashboard and check that the node that goes offline
  is the one you meant. Walk the rack once and you never have to do it again.

### What FORCE RESTART does on a BitScope

A hard power cycle — off, a pause, back on. The blades have no reset line, so there is nothing
gentler available in the hardware, and Rasputin records the result as a hard power-cycle rather
than letting "restart" imply something softer than it is.

## The environment override

A node can also be pinned to a backend through `RASPUTIN_BMC_BACKEND` and its matching
`RASPUTIN_BMC_*` settings in `/var/lib/rasputin/node.env`. This exists for development and
bench work, and there are two things to know before reaching for it:

- **It is not a seed option.** First boot does not read these; they only take effect if you
  edit `node.env` on a running node and restart the agent.
- **It disables Settings for that node.** A pinned node reports itself as pinned and refuses
  configuration pushes — Settings shows it read-only and tells you to remove the variable.
  That is deliberate: two sources of truth for the same hardware is worse than one
  inconvenient one.

Use Settings unless you are specifically working on Rasputin itself.

## Why this varies at all

Rasputin models BMC ability per node, not per cluster: each management host tells the
control plane which nodes it reaches *and what it can do for each one*. Power, restart and
console are advertised separately, and a console additionally declares its fidelity, so a
line-oriented or lossy console can be labelled instead of quietly disappointing you.

That is what lets very different hardware sit behind one dashboard honestly — a serial
control bus and a REST API over the network already look nothing alike, and the boards we
haven't met yet will differ again. The interface stays the same; the claims stay true to
whatever is actually underneath.
