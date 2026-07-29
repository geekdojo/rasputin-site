---
title: "BMC — power and console"
description: "Out-of-band control of nodes that aren't answering: which management hardware Rasputin drives, and what each one can actually do."
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
| **Turing Pi 2 / 2.5** | Yes | Use the board's own — [why](#why-the-turing-pi-has-no-console) | Over the board's REST API. Needs BMC firmware 2.0.0+. |
| **BitScope CB04B blades** | Yes | Yes, full character mode | Over the rack's serial control bus. |

Other hardware is not supported yet. Rasputin is pre-alpha and the list is short on
purpose — each entry is a driver we run on our own bench, not a spec we read.

## Why the Turing Pi has no console

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

## Turning it on

BMC is off until you select a backend in **Settings → BMC**. Nothing registers, nothing is
advertised, and the control plane refuses every BMC operation until then — a cluster that has
not been told about management hardware does not guess.

Pick the backend, pick which node talks to it, fill in what it asks for, and apply. For a
Turing Pi that is: press **DETECT BOARD** to find it and read its certificate, confirm the
certificate, enter the BMC password, press it again to fill in which node is in which slot.
See the [Turing Pi guide](/docs/turing-pi/).

### The environment override

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
