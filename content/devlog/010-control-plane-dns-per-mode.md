---
title: "The control plane answers one DNS zone, and the bench that made it forward the rest"
date: 2026-08-13
description: "Rasputin's control plane is an authoritative nameserver for exactly one zone, the cluster's own .internal names, and nothing else. Behind a Rasputin firewall that is correct — dnsmasq sends .internal to the control plane and the rest to the internet. With no firewall, pointing the router's DNS at the control plane black-holed every public name, so it now ships an optional forwarding stub: answers .internal itself, forwards the rest to its own DHCP-learned upstream, LAN-only and off by default."
summary: "Rasputin's control plane is an authoritative nameserver for exactly one zone, the cluster's own .internal names, and nothing else. Behind a Rasputin firewall that is correct — dnsmasq sends .internal to the control plane and the rest to the internet. With no firewall, pointing the router's DNS at the control plane black-holed every public name, so it now ships an optional forwarding stub: answers .internal itself, forwards the rest to its own DHCP-learned upstream, LAN-only and off by default."
---

Rasputin's control plane runs an authoritative nameserver — the server that
holds the real answers — for exactly one family of names, `<cluster-id>.internal`
(for a cluster named `home`, that's `home.internal`). It's built into the api on
`miekg/dns`, the same embed-what-we-own pattern the control plane already uses
for its message bus. Every host has two names: the bare `<name>.<cluster-id>.internal`
resolves to the host's **tailnet** IP — its address on the private mesh network
Rasputin sets up with Headscale — and `<name>.lan.<cluster-id>.internal` resolves
to its **LAN** IP, its address on your local network. The subdomain carries the
network, so no name ever resolves to two addresses depending on who is asking.

Answering one family of names and nothing else was the whole design — until a
bench run showed where that is not enough.

## Where the control plane sits in the DNS path, per mode

The control plane is the authority for `.internal` in every deployment mode. What
differs is who resolves *everything else* — the internet — for a client.

- **With a Rasputin firewall (Mode A / Mode C):** the firewall's built-in DNS
  server (dnsmasq) is the resolver every device is handed over DHCP. It sends
  `.internal` names to the control plane and everything else out to the internet.
  The control plane only ever answers `.internal`, and that is correct here — a
  control-plane reboot pauses those names, never the rest of the LAN's internet.
  The operator does nothing.
- **With no firewall (Mode B):** nothing Rasputin ships sits in the DNS path.
  The natural operator move is to point the router's DHCP-handed DNS at the
  control plane — and that black-holed lookups for public websites, because the
  control plane only answers its own `.internal` names and nothing else. That is
  what broke on the bench on 2026-08-09.

![How a device resolves DNS in each mode — Mode A/C the firewall forwards .internal to the control plane and the rest to the internet; Mode B the router handles the internet while .internal needs a router forward or nodeIP:port; Mode B + forwarding stub the control plane answers .internal and forwards the rest.](/img/010-dns-by-mode.svg)

## Timeline

- **2026-08-08** — the DNS decisions land in ADR-0004: authoritative control-plane
  nameserver (embedded `miekg/dns`), and one host = two names (bare = tailnet via
  MagicDNS, `.lan.` = LAN via the control plane). Each name has exactly one answer
  everywhere, so there is no one-name-two-addresses case to manage.
- **2026-08-09** — Tier-1 validated on the bench (CP `2026.08.2-dev.150`):
  the nameserver binds `<LAN-IP>:53` UDP+TCP alongside systemd-resolved's
  `127.0.0.53` stub with no port conflict, and answers the zone.
- **2026-08-09** — same bench, the Mode B black-hole surfaces, and the fix
  ships: an optional, guarded forwarding stub on the control plane.

## The things worth knowing

**The bind is a named LAN interface, not `0.0.0.0`.** The nameserver cannot take
`0.0.0.0:53` and must not displace systemd-resolved's `127.0.0.53:53` stub — that
stub also publishes the cluster's `<cluster-id>.local` mDNS discovery name
(ADR-0003), so "free port 53 by disabling resolved" silently breaks cluster
discovery. It binds the LAN interface by name because the LAN IP moves per DHCP
lease.

**Adding the control plane as a "backup" DNS server does not work.** A device only
asks its backup DNS server when the first one
*fails to answer*. Ask a normal resolver for a name like `jellyfin.home.internal`
and it does not fail — it answers "there is no such name," because that name only
exists inside Rasputin. That is a real answer, so the device is satisfied and
never asks the backup. So in Mode B the ways to reach an app are: tell your router
to send `.internal` names to the control plane, reach the app directly at its
node's address and port (`nodeIP:port`), or turn on the forwarding stub below.

**The forwarding stub is the piece that makes "point the router at the control
plane" work.** It answers `.internal` names itself and passes every other lookup
along to a real internet DNS server — the control plane's own upstream, the one
it learned from DHCP (`1.1.1.1:53` only as a loop-safe fallback, used when it
can't learn an upstream or the learned one would point back at itself). And it is
fenced. The guards, in `api/internal/nameserver/forwarder.go`: it listens only on
the LAN interface, only answers devices on a private (RFC1918) network
(`isPrivateV4` — and `100.64/10` tailnet space is deliberately *not* in it),
refuses to forward to itself (`upstreamIsSelf`), is rate-limited, is IPv4-only
(Rasputin is IPv4-only), and never faces the WAN. It is off by default and the
firewall modes never turn it on. Its hardening rides a later security review.

**Rasputin nodes make no DHCP reservations, so the control plane's IP moves.** Nodes
are identified by name, not address — a deliberate onboarding-cost choice — so a
node's IP changes on most reboots. The nameserver reads the live node list, so
`.lan.` records fix themselves on the next query. The one address that self-heal
can't cover is the control plane's *own* IP: a client pinned at it as a resolver
goes stale when it moves. So the settings page now shows the control plane's MAC
address and recommends reserving its IP on the router, next to the forwarder
toggle.

## What shipped

The forwarding stub (`forwarder.go`), the enable toggle and upstream resolution
(`dns.forwarding` in the settings store, `ResolveUpstream` picking the
DHCP-learned upstream with the loop-safe fallback), and a **NETWORK DNS** section
in settings that carries the toggle, the upstream field, and the "point your
router at `<CP IP>`, reserve it by MAC `<CP MAC>`" guidance. All of it is off
unless an operator turns it on, and the firewall modes never need it.

This is in CP `v2026.08.2` + OS `2026.08.2`, cut stable 2026-08-10; it
went out on the dev channel first, which is what the bench runs above ran on.

I want to be clear that this forwarder is deliberately the small version — one
zone answered, one upstream forwarded to, fenced to the LAN because a resolver
reachable from the WAN is not something I want to ship at pre-alpha. The full
opt-in whole-LAN resolver, with ad-blocking and per-household upstream choice, is
a separate later feature. The Mode A firewall auto-forward that makes the firewall
modes truly zero-touch is still owed before the first stable release, and the
forwarder's hardening is part of a later security-review pass. Expect this to
tighten as that review runs.

*Rasputin is an open-source (AGPL) homelab cluster system — a control plane,
node OS, and firewall image that make a few Raspberry Pis or N100 boxes behave
like one appliance. It's pre-alpha, on
[GitHub](https://github.com/geekdojo/rasputin-control-plane), and I'm looking for a
handful of [design partners](/#partners) to run it and tell me what's broken.*
