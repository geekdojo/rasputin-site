---
title: "Roadmap"
description: "What we're building now, next, and later — no dates, honestly sequenced, kept current as reality changes."
weight: 12
reviewed: 2026-07-20
---

This is the order of execution — what we're building **now**, what comes **next**, and
what waits for **later**. It's distilled from an internal backlog of roughly 290 tracked
items, each tied to a design doc and kept honest by a linter that fails the commit when
the counts drift. This page is the public view of that machine.

Two ground rules:

- **No dates.** Dates on a young project's roadmap age into broken promises. Order is
  the commitment; the [devlog](/devlog/) and the
  [release feed](https://github.com/geekdojo/rasputin-os/releases) show the actual pace.
- **This page changes when reality changes.** The "last reviewed" stamp at the bottom is
  checked automatically — if it goes stale, our own CI files an issue against us.

## Now

**Real power control and serial console.** Power a node on or off and open its serial
console from the web UI — on real hardware, not a mock. First target is the 24-node
BitScope rack on our bench (the one from
[devlog #4](/devlog/004-bitscope-rack-24-nodes/)), driven over its blade management bus;
a Turing Pi backend follows as the second transport. Same interface the eventual Rasputin
chassis will use, proven on hardware you can buy today.

**Cluster identity and discovery on real networks.** Homelab networks have VLANs,
multiple experiments running at once, and sometimes two clusters on one LAN. Every
cluster gets its own derived name, discovery gets fallback paths beyond mDNS, and a
re-flashed node finds its control plane again without hand-holding. This is dogfood-driven:
we run two clusters side by side daily, so we hit these edges before you do.

**Progressive fleet updates.** Updating 24 nodes taught us what every operator already
knows: serial roll-outs that halt on the first failure don't scale. Fleet updates move to
the pattern you already trust from your day job — canary one node, verify, fan out in
bounded batches, report per-node results. Release-channel selection moves into the UI.
A/B boot with automatic rollback stays the per-node safety net underneath.

**Security validation program.** The posture we claim has to become the posture we can
prove. In flight: a STRIDE threat model over the whole system, static analysis and
fuzzing on attacker-reachable parsers in CI, a software bill of materials for every
shipped artifact, and tamper/downgrade rejection tests on the signed update chain. The
program ends in an external penetration test and a published hardening guide — before we
ask anyone for money on a crowdfunding page.

## Next

**A real URL for every app.** Install an app, get a proper name with a valid certificate
— DNS, reverse proxy, and TLS handled by the cluster, with opt-in paths designed for
reaching apps beyond the LAN. No port numbers to memorize, no certificate warnings to
click through.

**The app catalog earns its launch set.** Every candidate app gets deployed on the
reference Pi + N100 cluster and measured — real memory, real time-to-first-delight —
before it ships as a tile. Design partners vote on the final set. If you want a say in
which apps make the cut, [that's the design partner program](/#partners).

**The first hour, hardened.** The setup wizard's three deployment modes — router,
LAN peer, and the isolated learning network — validated end to end on every major
browser and platform, plus an honest hardware buying guide and a living "validated
devices" page per node role, so nobody guesses what to order.

**Day-2 trust operations.** Rotation and revocation as first-class operations: scheduled
node-credential rotation, certificate authority rollover with an operator-paced re-trust
flow, revocation that takes effect immediately, and fleet-wide SSH key management that
rolls out canary-first like everything else.

**Observability, finished.** Metrics and logs already flow from every node; what remains
is the out-of-box experience — pre-built dashboards per node role and sensible default
alerts (node down, disk filling, update available) with zero Grafana homework.

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

*Last reviewed: 2026-07-20. If this page and reality disagree, that's a bug —
[tell us](https://github.com/geekdojo/rasputin-site/issues/new?title=Roadmap%20drift).*
