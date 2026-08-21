---
title: "Some fun - fixing the bench HDMI mess!"
date: 2026-08-20
description: Ok, a little bit of fun for this devlog. As I've said before, working with Rasputin takes a lot of hardware of different makes, models, and architectures. Some of the hardware can, at times, be a little cantankerous to bring up. Working with all the various nodes was requiring me to constantly switch back and forth between HDMI inputs and the bench monitor. I really needed an easy way to swap HDMI inputs to the monitor and to manage the cables."
summary: "Ok, a little bit of fun for this devlog. As I've said before, working with Rasputin takes a lot of hardware of different makes, models, and architectures. Some of the hardware can, at times, be a little cantankerous to bring up. Working with all the various nodes was requiring me to constantly switch back and forth between HDMI inputs and the bench monitor. I really needed an easy way to swap HDMI inputs to the monitor and to manage the cables."
---

Ok, a little bit of fun for this devlog. As I've said before, working with 
Rasputin takes a lot of hardware of different makes, models, and architectures. 
Some of the hardware can, at times, be a little cantankerous to bring up. Working 
with all the various nodes was requiring me to constantly switch back and forth 
between HDMI inputs and the bench monitor. I really needed an easy way to swap 
HDMI inputs to the monitor and to manage the cables.

![Bench Mess](/img/012-bench-setup.jpg)

I already had an 8x8 HDMI matrix switcher, but I needed a way to get the "switching" 
buttons over to the bench and then, of course, get all the feeds and the monitor 
over to the matrix switch sitting in the rack. Time for some overengineering!

## Bill of Materials

- [MT-VIKI MT-HD0808 8x8 Matrix Switcher](https://www.amazon.com/dp/B08K8Z5WFT)
- [Elgato Stream Deck Module](https://www.elgato.com/us/en/p/stream-deck-module-6-keys)
- [USB to RS232 **FTDI** Adapter](https://www.amazon.com/dp/B0759HSLP1?ref_=ppx_hzsearch_conn_dt_b_fed_asin_title_2&th=1)
- [Neutrik HDMI 2.0 Feed Through Adapter D-Shape Housing IP65 (Black Chromium)](https://www.filmtools.com/neutrik-hdmi-2-0-feed-through-adapter-d-shape-housing-ip65-black-chromium.html)
- 4x30' HDMI Cables
- About 600g of PLA (took four prints to get the spacing right)
- Some space on the Pi 5 that was already driving the rack monitor for Rasputin
- [Bitfocus Companion](https://bitfocus.io/companion)

## Overview

At a high level:

Elgato key press → dock (USB-C) → TCP/5343 → Companion on the Pi → HTTP on localhost:8800 → matrixd → RS232 @ 9600 → matrix

![Close up of the buttons](/img/012-bench-monitor-switch.jpg)

Step by step:

1. Key press on the Stream Deck 6 Module → USB-C to the Network Dock.
2. Dock → Companion over TCP 5343. Note the direction: Companion dialed out to the dock at 192.168.197.227 and holds that session open; the press travels back up it. Same VLAN, so this never touches the WatchGuard.
3. Companion (Pi 5, 192.168.197.225) runs the button's action — a Generic HTTP GET.
4. HTTP to 127.0.0.1:8800 — GET /switch?in=7&out=8. Loopback, same Pi, never on the wire.
5. matrixd validates the input/output range, then queues the command on its single worker thread so two presses can't interleave.
6. RS232 out the FTDI adapter at 9600 8N1: the literal bytes 7X8.
7. Matrix switches output 8 and replies SWS 1 2 5 4 3 4 4 7 — the whole crosspoint table.
8. matrixd parses that, confirms output 8 really is on input 7, updates its cache, and returns 200 with JSON to Companion.

As usual, Claude did all the coding here using Python and we registered the HTTP server as a service. The basic coding was quick. Debugging the serial port was not... ...that took most of the afternoon. The protocol documented in the manual was not at all 
what the device was doing. Honestly, not surprising given the price point here.

## What the port actually does

The manual for this matrix family specifies 115200 8N1 and documents **no
response at all** — send the command, hope. The unit on my bench runs at 9600,
and every routing command comes back with the entire crosspoint table:

```
6X8.   →   SWS 1 2 5 4 3 4 4 6
```

Position N is the input feeding output N. So `6X8.` comes back reporting that
output 8 is now on input 6, along with the state of the other seven. The manual
is correct on command syntax — `[in]X[out].`, `0X[out].` to blank an output,
`Save[1-9].` and `Recall[1-9].` all work exactly as printed — it is silent on
what comes back.

That echo is what lets the daemon verify a command instead of assuming it. A
command that goes out cleanly but doesn't take is otherwise invisible until you
look at the monitor. What does not exist is a read-only query: `Status.`,
`SWS.`, `Read.` and `?.` all return silence, so there is no way to ask the
matrix what it is doing without telling it to do something.

## The fix

`matrixd` is a dependency-free stdlib-Python daemon at `/usr/local/bin/matrixd`,
and it is the only process that opens the serial port. These matrices take one
client at a time, so a single owner is what lets a second consumer — a script, a
curl at 2am — share it safely. It serializes every command through
one worker thread, parses the `SWS` echo, and checks the commanded output
actually changed before reporting success. Buttons call
`GET /switch?in=6&out=8`; `GET /state` returns the whole table as JSON.

Two things needed working around on the way, both specific to running Bitfocus
Companion on a Pi that already has a job:

- **Companion 5.0.3 requires a `--machine-id` argument that companion-pi's
  `config-tool` has no schema entry for**, so it cannot supply it and Companion
  exits immediately with `Error: Missing machineId`. Adding the flag to
  `ExecStart` does not work either — upstream's `launch.sh` runs
  `source <(config-tool generate)`, and the sourced `set --` replaces the
  positional parameters. A systemd drop-in pointing at a wrapper that appends the
  flag after that line fixes it, and lives outside the git clone so
  `companion-update` won't remove it.
- **`/dev/ttyUSB0` on this Pi is group `plugdev`, not `dialout`.** With
  `DynamicUser=yes` the service inherits neither that nor the console ACL, and
  `PrivateDevices=yes` hides the device entirely. `DevicePolicy=closed` plus
  `DeviceAllow=char-ttyUSB rw` keeps the containment without breaking the port.

One more, less technical: I scanned the dock for open ports from my workstation
and got nothing back, which I reported to myself as a finding. The scan crossed
the site firewall, whose flood protection eats wide scans — a trap already
written down in my own wiki. The same scan run from the Pi on the same VLAN found
three open ports immediately.

There is no read-only query on this firmware, so `matrixd` only knows the state
it last set. Touch the front panel or the IR remote and the keys are wrong until
the next press. I'm leaving that alone for now — with one surface and one person
at the bench it costs nothing. If I add a second surface, or start switching
these outputs from anything other than the Stream Deck, I'll look at whether
re-asserting a known route on a timer is worth the side effect it carries.

A fun side project and a little bit of a break from Rasputin code. ;)

*Rasputin is an open-source (AGPL) security appliance and control plane for
homelab and small-office networks. Code:
<https://github.com/geekdojo/rasputin-control-plane>. I'm looking for
[design partners](/#partners) — if you run a homelab or a small office network
and want to try it on your own hardware, get in touch.*
