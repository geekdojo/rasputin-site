---
title: "Supported hardware"
description: "What Rasputin runs on, what has actually been booted, and what is only expected to work."
weight: 6
layout: hardware
---

Rasputin runs on **a Raspberry Pi, or any UEFI amd64 box**. That is the whole
claim, and it is a claim about how the images are built — not a promise that
every machine has been tried.

So this page keeps two things apart:

- **Runs on** — what the image supports by construction. The arm64 image boots
  via the Raspberry Pi bootloader; the amd64 image is an upstream kernel booted
  by GRUB over UEFI, so it wants a 64-bit UEFI machine with a wired Intel or
  Realtek NIC. No legacy BIOS, and no wireless.
- **Tested on** — machines that have actually run it. This is a record, not a
  promise. Hardware missing from it is not hardware that failed; it is hardware
  nobody has tried.

**The firewall is the exception.** It is a separate x86-only image on its own
release cadence, and it stays narrower than the node claim — an Intel N100 box
is the reference and the only target. See
[Getting started](../getting-started/) for where it fits.
