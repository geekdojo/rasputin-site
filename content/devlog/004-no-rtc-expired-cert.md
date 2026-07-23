---
title: "A node with no clock mints an expired certificate"
date: 2026-07-23
description: "Rasputin's control plane mints its own HTTPS certificate on first boot, and on a Pi 5 with no RTC that certificate came out already expired. A dead DHCP-supplied DNS server kept timesyncd from ever reaching a time server — the numeric-NTP fallback and the clock-gated mint that fixed it."
summary: "Rasputin's control plane mints its own HTTPS certificate on first boot, and on a Pi 5 with no RTC that certificate came out already expired. A dead DHCP-supplied DNS server kept timesyncd from ever reaching a time server — the numeric-NTP fallback and the clock-gated mint that fixed it."
---

Rasputin's control plane mints its own HTTPS certificate on first boot. On a
Raspberry Pi 5 — no battery-backed real-time clock — that certificate came out
already expired and the browser refused the connection. The image was correct;
the clock it signed against was thirteen months slow.

**Symptom (2026-07-12):**

- Opening a recently-flashed Pi 5 control plane in a browser: the certificate
  reads as expired.
- The served leaf was an ordinary one-year cert — `notBefore Jun 25 2025`,
  `notAfter Jun 25 2026` — but real "now" was mid-July 2026, past its window.
- On the node itself: `timedatectl` read `2025-06-25`, `System clock
  synchronized: no`, RTC at `1970`. The clock, not the cert, was the problem.

**Root cause:**

- The Pi 5 has no RTC. Before NTP, systemd advances the wall clock to a fixed
  build-time epoch baked into the image (`2025-06-25` here) and no further.
- `systemd-timesyncd` was pointed at hostname NTP servers (`time*.google.com`).
  The bench DHCP handed out a dead DNS server, so those names never resolved —
  timesyncd never reached a time server, and the clock stayed at the floor.
- The control plane minted its leaf against that frozen clock: a validity
  window anchored in mid-2025, already closed by mid-2026. A client with a
  correct clock rejects it.
- The trap underneath: `systemd-resolved` won't fall back to its public DNS
  while a per-link server is configured, even a broken one. `timesyncd`'s
  fallback NTP has the same rule. One dead DHCP-supplied server blocks the
  fallback that would otherwise cover it.

**The fix, part one — correct time without DNS (node OS):**

- A numeric `FallbackNTP` drop-in at
  `/usr/lib/systemd/timesyncd.conf.d/10-rasputin-fallback.conf` — anycast IPs
  (Cloudflare `162.159.200.123`, `162.159.200.1`; Google `216.239.35.0`).
  Numeric addresses sync over UDP/123 with no DNS at all.
- `FallbackNTP`, not `NTP=`, so a DHCP-advertised (option 42) or operator-set
  server still wins — it's the floor, not an override. Added an optional
  `RASPUTIN_NTP_SERVER` seed field for a homelab-local time source.

**The fix, part two — don't mint against a bad clock (control plane):**

- `waitForTrustworthyClock` in `api/cmd/rasputin-api/main.go` holds the leaf
  mint until `systemd-timesyncd` reports a synchronized clock — the
  `/run/systemd/timesync/synchronized` marker — bounded to 90 seconds so an
  offline node still comes up.
- The mint moved into the HTTPS goroutine so the wait can't delay `sd_notify`
  readiness (the unit is `Type=notify` with a 90-second start timeout), and the
  plain-HTTP bootstrap page stays reachable while the clock settles.

**Validation:**

- Reproduced the original condition on the bench Pi — deleted the persisted
  leaf, rebooted. The clock came up at the baked floor, `timesyncd` synced
  against `162.159.200.1:123` about five seconds into boot, and the control
  plane minted a fresh, valid leaf against the corrected time. No hands on the
  keyboard. The served cert is good for ~364 days.
- Shipped in `2026.07.2` across control plane, node OS, and firewall.

**Takeaway:** if your appliance mints its own TLS identity, treat the clock as
untrusted until NTP confirms it — a board with no RTC will sign a certificate
dated to whenever it thinks it booted.

*Rasputin is an open-source (AGPL) homelab cluster system — a control plane,
node OS, and firewall image that make a few Raspberry Pis or N100 boxes behave
like one appliance. It's pre-alpha, on
[GitHub](https://github.com/geekdojo/rasputin-control-plane), and I'm looking for a
handful of [design partners](/#partners) to run it and tell me what's broken.*
