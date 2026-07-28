---
title: "BMC — power and console"
description: "Out-of-band control of nodes that aren't answering: which management hardware Rasputin drives, and what each one can actually do."
weight: 11
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
| **Turing Pi 2 / 2.5** | Yes | **No** — see below | Over the board's REST API. Needs BMC firmware 2.0.0+. |
| **BitScope CB04B blades** | Yes | Yes, full character mode | Over the rack's serial control bus. |

Other hardware is not supported yet. Rasputin is pre-alpha and the list is short on
purpose — each entry is a driver we run on our own bench, not a spec we read.

## Why the Turing Pi has no console

The Turing Pi's BMC does expose the nodes' serial ports, so this looks like something we
skipped. It isn't — we built the driver, ran it on the board, and decided against
shipping a console on it. Two reasons, and the second is the one that settles it:

**It cannot do character mode.** The board's serial interface takes one whole line per
request. There is no keystroke channel, so no `Ctrl-C`, no arrow keys, no ANSI, no
password masking. The most it could ever be is a text box that submits a line at a time.

**It drops output.** Reads come from a small ring buffer that keeps overwriting itself —
a little over a second of output at 115200 baud. Whatever lands between two reads is
gone, with nothing to indicate anything was missed.

That second point is fatal for the job a console exists to do. You open a serial console
to watch a node boot when nothing else about it works. A console that silently loses
arbitrary chunks of exactly that output is at its least trustworthy at the moment you
depend on it most — and when it eats the line you needed, it looks like a Rasputin bug
rather than a limit of the board.

So we don't offer it. Power and restart work fully on a Turing Pi; console is absent, on
purpose, and the dashboard shows you that rather than a button that disappoints.

**If you need a serial console on a Turing Pi**, the board has its own — `tpi uart`, or
the console in the Turing Pi BMC web interface. It talks to the same hardware without
pretending to be something it isn't, and we would rather point you at the right tool than
reimplement it badly.

## Why this varies at all

Rasputin models BMC ability per node, not per cluster: each management host tells the
control plane which nodes it reaches *and what it can do for each one*. Power, restart and
console are advertised separately, and a console additionally declares its fidelity, so a
line-oriented or lossy console can be labelled instead of quietly disappointing you.

That is what lets very different hardware sit behind one dashboard honestly — a serial
control bus and a REST API over the network already look nothing alike, and the boards we
haven't met yet will differ again. The interface stays the same; the claims stay true to
whatever is actually underneath.
