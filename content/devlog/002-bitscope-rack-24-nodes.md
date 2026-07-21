---
title: "24 nodes, one control plane: loading the BitScope rack"
date: 2026-07-14
description: "A full BitScope rack onto one Pi 5 control plane: 23 nodes enrolled in 44 minutes, power-on to 24/24 online in 121 seconds. With a time-lapse of the hex grid filling up."
summary: "A full BitScope rack onto one Pi 5 control plane: 23 nodes enrolled in 44 minutes, power-on to 24/24 online in 121 seconds. With a time-lapse of the hex grid filling up."
# Renumbered from 004 to publish order (2026-07-20); alias preserves the
# syndicated URL.
aliases:
  - /devlog/004-bitscope-rack-24-nodes/
---

<video controls muted playsinline preload="metadata" poster="/video/bitscope-rack-load-poster.png" style="width:100%">
  <source src="/video/bitscope-rack-load.mp4" type="video/mp4">
</video>

The whole rack is on the control plane. Saturday afternoon the bench cluster
hit 24 nodes online — a Raspberry Pi 5 control plane plus 23 Pi 4 compute
nodes in a BitScope ER24A Edge Rack 24 — all running the `2026.07.2-dev.101`
OS image. Enrolling the fleet took 44 minutes; powering it on took two.

**The hardware:**

- BitScope ER24A Edge Rack 24: six CB04B Cluster Blades in rows A–F, four Pi
  slots per blade, one 19–24 V DC feed for the lot.
- Every Pi in the rack has its own BMC wired to its serial port, bussed over
  RS-485 so one manager reaches all 24 — that part is a later devlog; today
  was getting the fleet enrolled and online.
- Control plane: a single Pi 5 (`node-9bbaa24a`), provisioned 2026-07-07.
- Rasputin currently caps a cluster at 24 nodes — a deliberate limit the UI
  is designed around. With the control plane off-rack on its own Pi 5, 23 of
  the rack's 24 Pis enroll and one sits idle.

**Timeline (2026-07-12, UTC, from the control-plane UI):**

- **16:04** — control plane alone: `NODES ONLINE 1/1`, a hex grid of empty
  bays.
- **16:07–16:48** — 23 compute nodes enrolled, one every ~2 minutes. Each
  appears in the grid as `PENDING — waiting…` the moment its enrollment lands.
- **17:07:20** — rack power-on. Still `1/1`; 23 hexes waiting.
- **17:07:48** — `21/21` online, 20 tasks in flight. Twenty nodes joined
  inside 28 seconds.
- **17:08:15** — `23/23`.
- **17:09:21** — `24/24`, task queue drained to 1. Done.

**How enrollment works:**

- Rasputin provisions a cluster as a *matched set*: each node gets a join
  token bound to its node-id, and the control plane holds only hashes of the
  set. A stolen SD card doesn't impersonate a neighbor; an unenrolled board
  doesn't join at all.
- Each node's 64 GB SD card is flashed individually from the control-plane
  interface — the image plus that node's seed in one write — then slotted
  into its bay. No console cable, no per-node config. The ~2-minute cadence
  in the timeline is the human loop, not the software.
- On power-on the node finds the control plane, presents its token, and goes
  `PENDING → ONLINE` on its own. Zero keystrokes between wall switch and
  24/24.

**The numbers worth keeping:**

- Power-on to all 24 online: **121 seconds**, most of it absorbed in the
  first half-minute.
- Control plane load after the join storm: **1% CPU, 3% memory** — on a Pi 5,
  running agent `v2026.07.2-dev.47`.
- Tasks spiked to 20 during the storm and drained without intervention.

**Takeaway:** enrollment is human-paced — 44 minutes of flashing and
slotting SD cards. The software side of a 24-node bring-up took 121 seconds
and left the control plane at 1% CPU.

There's a 21-second time-lapse of the grid filling up from 1 node to 24 at
the top of this post — the UTC clock in the header ticking through the real
hour is the only editing trick.

*Rasputin is an open-source (AGPL) homelab cluster system — a control plane,
node OS, and firewall image that make a few Raspberry Pis or N100 boxes behave
like one appliance. It's pre-alpha, on
[GitHub](https://github.com/geekdojo/rasputin-control-plane), and I'm looking for a
handful of [design partners](/#partners) to run it and tell me what's broken.*
