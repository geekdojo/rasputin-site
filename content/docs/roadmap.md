---
title: "Roadmap"
description: "What we're building now, next, and later — honestly sequenced, kept current as reality changes, with no dates on anything unshipped."
weight: 13
reviewed: 2026-08-09
---

This is the order of execution — what we're building **now**, what comes **next**, and
what waits for **later**. It's distilled from an internal backlog of roughly 290 tracked
items, each tied to a design doc and kept honest by a linter that fails the commit when
the counts drift. This page is the public view of that machine.

Two ground rules:

- **No dates on unshipped work.** Dates on a young project's roadmap age into broken
  promises. Order is the commitment; the [devlog](/devlog/) and the
  [release feed](https://github.com/geekdojo/rasputin-os/releases) show the actual pace.
  Shipped entries do carry their release and date — that part is history, not a promise.
- **This page changes when reality changes.** The "last reviewed" stamp at the bottom is
  checked automatically — if it goes stale, our own CI files an issue against us.

## Recently shipped

**Security currency, proven on hardware** — `2026.08.1`, 7 Aug 2026. The continuous
machine — scheduled canary builds and CVE watch on every image — turned into a shipped
stable: each image moved to its latest upstream base (Buildroot 2025.02.16, OpenWrt
25.12.5) and the whole cluster was brought up end to end on real hardware before the
release went out. The update path also gained crash capture on the persistent partition,
so a rare failure during an A/B update leaves a backtrace to act on instead of a shrug.

**Cluster identity and discovery on real networks** — `2026.07.9`, 5 Aug 2026. Every
cluster now takes its own derived name (`<cluster>.local`), so two Rasputins coexist on
one LAN without a fight — with startup collision detection that surfaces a conflict
instead of silently misrouting. Discovery gained fallbacks beyond mDNS (the control
plane's IP and a QR on the trust page; a unicast record served by the firewall), MagicDNS
names on the mesh, an IP banner on the firewall console, and a single one-command flasher
that takes a blank drive to a seeded, enrolled node — firewall included.

**A second BMC transport: Turing Pi** — `2026.07.8`, 29 Jul 2026. Power and restart for all
four slots of a [Turing Pi 2](https://turingpi.com/) over its REST BMC, configured from
Settings with the board's certificate pinned the first time you see it. Console is
deliberately not offered on that board ([why](/docs/bmc/#why-the-turing-pi-has-no-console)),
and every node now advertises what its own hardware can actually do —
[guide](/docs/turing-pi/).

**BMC support: real power control and serial console** — `2026.07.5`, 27 Jul 2026. Power any node on or
off and open its serial console from the web UI, on real hardware rather than a mock — live
on the 24-node BitScope rack ([devlog #2](/devlog/002-bitscope-rack-24-nodes/)). Controls
appear only where a management path actually exists.

## Now

**A real URL for every app.** Install an app and get a proper name with a valid
certificate — a name like `jellyfin.lan.<cluster>.internal`, not an IP address and a port
number you have to remember. The cluster runs its own authoritative nameserver for its own
domain, mints every app a certificate from the cluster's own authority, and stands a
reverse proxy in front of it on the node where the app actually runs. Apps are reachable
over the cluster's mesh by default; putting one on the wider LAN is a per-app choice you
make when you install it. This is working end to end on the bench today — it moves to
*shipped* here when it lands on a stable release, not before.

## Next

**Progressive fleet updates.** Fleet updates move to the pattern you already trust from
your day job: canary one node, verify, fan out in bounded batches, report per-node results.
Release-channel selection moves into the UI; A/B boot with automatic rollback stays the
per-node safety net underneath.

**Security validation program.** A STRIDE threat model over the whole system, static
analysis and fuzzing on attacker-reachable parsers in CI, a bill of materials for every
shipped artifact, and tamper/downgrade rejection tests on the signed update chain. It ends
in an external penetration test and a published hardening guide — before we ask anyone for
money.

**The app catalog earns its launch set.** Every candidate app is deployed on the reference
Pi + N100 cluster and measured — real memory, real time-to-first-delight — before it ships
as a tile. [Design partners](/#partners) vote on the final set.

**The first hour, hardened.** The setup wizard's three deployment modes validated end to end
on every major browser and platform — including Linux desktops, where your passkey comes from
a password manager, a security key, or your phone rather than from the desktop itself — plus
an honest hardware buying guide and a living validated-devices page per node role, so nobody
guesses what to order.

**Your passkey on every device you own.** Add a passkey to the account you already have,
give it a name, and revoke it when a device goes away — so a new laptop, phone or desktop
enrolls in seconds instead of leaning on a credential that lives somewhere else.

**Day-2 trust operations.** Rotation and revocation as first-class operations: scheduled
node-credential rotation, certificate authority rollover with an operator-paced re-trust
flow, immediate revocation, and fleet-wide SSH key management that rolls out canary-first.

**Observability, finished.** Metrics and logs already flow from every node; what remains is
the out-of-box experience — pre-built dashboards per node role and sensible default alerts
(node down, disk filling, update available) with zero Grafana homework.

## Later

**Firewall depth.** Deterministic rule ordering and priorities, live WAN status in the
UI, and intrusion-detection rules that update independently of image releases.

**Storage and backup.** Scheduled cluster backup to an external disk with a
restore-before-first-boot path, then real data-disk management for storage-heavy nodes.

**Roles and audit.** Operator/viewer roles enforced on every dangerous action, and an
audit history of who did what, when.

**Rasputin hardware.** A purpose-built appliance is the long game — but the software
proves itself on commodity hardware first. Everything above runs on gear you can buy
today, and that stays true.

## Continuously

Some things aren't roadmap items; they're the drumbeat. Signed releases with A/B
rollback. Scheduled canary builds that catch upstream drift before it catches us.
CVE watch on every image's package set. Automated quality and security sweeps on the
repos, with a human merging every change. The [devlog](/devlog/) is where the drumbeat
is audible.

---

*Last reviewed: 2026-08-09. If this page and reality disagree, that's a bug —
[tell us](https://github.com/geekdojo/rasputin-site/issues/new?title=Roadmap%20drift).*
