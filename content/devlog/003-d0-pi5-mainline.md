---
title: "Mainline Linux can't boot a Pi 5 you buy today"
date: 2026-07-21
description: "Rasputin's arm64 image shipped mainline 6.12, and a Pi 5 bought this year will never boot it — mainline carries no device tree for the D0 stepping. The diagnosis, the switch to the raspberrypi/linux fork, and the empty modules.dep that broke Docker after."
summary: "Rasputin's arm64 image shipped mainline 6.12, and a Pi 5 bought this year will never boot it — mainline carries no device tree for the D0 stepping. The diagnosis, the switch to the raspberrypi/linux fork, and the empty modules.dep that broke Docker after."
---

Rasputin's arm64 image originally shipped mainline Linux 6.12. A Pi 4 boots
it fine. The Pi 5 on my bench — bought new this year — will never boot it,
and the failure mode is a solid green LED and nothing else. The root cause
applies to every current-stepping Pi 5.

**Symptom (day 1):**

- Pi 5 (8 GB): solid green LED, no boot. Stripped to just power + microSD —
  same. No HDMI output, no activity.
- The same card in a Pi 4: boots, gets DHCP, SSH works. So the flash, the
  boot FAT, and the image layout were fine. Pi-5-specific.
- Serial debugging was a dead end that night for an unrelated reason: the
  PL2303 USB-UART failed its own RX↔TX loopback with no Pi attached. Bad
  adapter. (Also, the Pi 5's firmware console is the dedicated 3-pin debug
  UART, not GPIO 14/15 — worth knowing before you wire one.)

**Root cause:**

- The board is a **Pi 5 rev 1.1 (`d04171`) — the "D0" stepping** of the
  BCM2712. Newer Pi 5s are D0; that's what's on shelves.
- A D0 board needs its own device tree (`bcm2712d0-rpi-5-b.dtb`).
  **Mainline Linux doesn't carry that DTS** — checked against the v6.12
  broadcom Makefile directly. No DTB for your silicon means the firmware
  has nothing to hand the kernel: solid green LED, zero output.
- Confirmation was clean isolation: stock Raspberry Pi OS booted the same
  Pi 5 fine (it ships the Raspberry Pi kernel fork), our mainline image
  didn't, and our image booted a Pi 4. Kernel, not board, not image.

**Fix — switch the arm64 kernel to the `raspberrypi/linux` fork (6.6.x):**

- The fork has the D0 DTB, RP1 support, and the `tryboot` bits our A/B
  updates use anyway. Buildroot's own `raspberrypi5_defconfig` makes the
  same choice.
- The fork's kernels are per-SoC, so one unified image now carries **two
  kernels on one boot FAT** — `kernel8.img` (BCM2711, Pi 4) and
  `kernel_2712.img` (BCM2712, Pi 5/CM5) — and the firmware picks per board
  via `config.txt` `[pi4]`/`[pi5]` sections. Same model Raspberry Pi OS uses.
- Three build iterations to green, two of them instructive:
  1. A custom-tarball kernel in Buildroot needs
     `BR2_PACKAGE_HOST_LINUX_HEADERS_CUSTOM_6_6=y` — otherwise kernel headers
     silently default to 2.6-era and the toolchain drops glibc for uClibc.
     Nothing fails loudly; your libc just changes.
  2. `bcm2712-rpi-500` had no build rule at the pinned commit — drop it.
  3. Green.

**Then Docker didn't work:**

- Symptom: `dockerd` couldn't create `docker0`; no module would load at all.
- Cause: the fork XZ-compresses kernel modules, and the build's `depmod`
  couldn't index `.ko.xz` — so `modules.dep` was **empty**. Zero lines. kmod
  had nothing to resolve, so `bridge` (and everything else) never loaded.
- Fix: `CONFIG_MODULE_COMPRESS_NONE=y` → depmod indexes 1,788 modules → all
  load. Also built `ip_tables` in (the fork's defconfig dropped what mainline
  had) and added `CONFIG_IKCONFIG_PROC=y`, which would have let me diagnose
  the whole thing in one look at `/proc/config.gz`.

**End state:** one image, one card, boots a Pi 4 and a D0 Pi 5, both running
arm64 Docker; also validated off NVMe via an SSD HAT (`dtparam=pciex1` —
Pi 5 PCIe is off by default). Two days end to end, most of it diagnosis.

**Takeaway:** if you're building OS images for the Pi 5, the fork is a
requirement — current-stepping boards don't exist in mainline's device trees.
Test on the hardware your users will buy, not the revision you already own.

*Rasputin is an open-source (AGPL) homelab cluster system — a control plane,
node OS, and firewall image that make a few Raspberry Pis or N100 boxes behave
like one appliance. It's pre-alpha, on
[GitHub](https://github.com/geekdojo/rasputin-control-plane), and I'm looking for a
handful of [design partners](/#partners) to run it and tell me what's broken.*
