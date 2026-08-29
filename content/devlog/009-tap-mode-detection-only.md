---
title: "The IDS only watches, and one config line keeps it that way"
date: 2026-08-11
description: "Rasputin's firewall runs snort3 in tap mode on the WAN interface: it raises alerts and it never drops a packet, and action=alert in /etc/config/snort is what enforces that rather than a feature still in the queue. Plus the four config defaults that bit on the first hardware bring-up — a ruleset URL that names a snort version and not a rule syntax, a package template that disables the log the agent reads, a timestamp with the year on the front, and a home_net pointing at a network we don't tap."
summary: "Rasputin's firewall runs snort3 in tap mode on the WAN interface: it raises alerts and it never drops a packet, and action=alert in /etc/config/snort is what enforces that rather than a feature still in the queue. Plus the four config defaults that bit on the first hardware bring-up — a ruleset URL that names a snort version and not a rule syntax, a package template that disables the log the agent reads, a timestamp with the year on the front, and a home_net pointing at a network we don't tap."
---

Rasputin's firewall runs snort3 in tap mode on the WAN interface. It raises
alerts and it never drops a packet, and that is a decision the config enforces
rather than a feature still in the queue: `action=alert` in `/etc/config/snort`
is a global override that forces detection-only behaviour even when a rule body
says `drop` or `block`.

Tap mode means `method=pcap` — snort reads packets through libpcap in
promiscuous mode. There is no NFQUEUE, so the kernel's forwarding path and the
nftables `flow_offloading` fast path are completely undisturbed. Snort sees a
copy of the traffic, and the packets it inspects have already been forwarded.

That is the structural trade. An inline IPS sits in the forwarding path, so
every packet waits on inspection and the inspector's capacity becomes a limit on
everything passing through. A tap gives that up in exchange for leaving the
forwarding path alone: it cannot stop an attack, and it cannot get in the way of
traffic either. The honest way to say what the firewall does is that it tells
you something bad is happening and does not stop it.

I am not publishing numbers for any of this yet. Nothing here has been
benchmarked with a method I would stand behind, and benchmarking the firewall
honestly is still an open item on the roadmap, so I would rather describe what
the configuration does than characterise silicon I have not put a meter on. When
there are numbers they will arrive with the method attached.

## Timeline

- **2026-06-07** — base bumped from OpenWrt 24.10 to 25.12. This is what
  unblocked the whole thing: `snort3-3.10.0.0-r1` is in the 25.12 packages feed,
  and tap mode is a first-class UCI option there.
- **2026-06-08** — first build with rules attached. Snort exited `FATAL` before
  it inspected a single packet.
- **2026-06-08, dev.2** — rules swapped, four config defaults corrected,
  validated end to end on the CWWK x86-p5-n100.

## The four things that bit

**The ruleset URL names a snort version, not a rule syntax.** The first build
pulled Emerging Threats Open from `rules.emergingthreats.net/open/snort-3.0.0/`,
and the path reads like a promise the rules are snort3-native. They use
snort2-era keyword placement, and snort 3.10.0.0 rejected them with **212,249
unknown-rule-keyword errors** and exited. Snort3 Community Rules from Cisco
Talos parse clean — **4,017 rules, zero errors** — so that is what the image
bakes in. Read the syntax generation, not the directory name.

**The package template disables the output the agent reads.** OpenWrt's
`snort.uc` comments out `alert_fast` and leaves only `alert_json` active. The
Rasputin agent tails `/var/log/snort/alert_fast.txt`, which stayed at 0 bytes
while snort ran perfectly happily. The fix is `files/etc/snort/rasputin-extra.lua`,
applied last through the `snort.snort.include` UCI option — the last assignment
wins for global tables, so reassigning `alert_fast` there overrides the template
cleanly.

**`output.show_year = true` puts the year at the front.** It emits
`YY/MM/DD-HH:MM:SS.uuuuuu`. The agent's parser accepts year-less `MM/DD-` or
year-included `MM/DD/YYYY-`, and matches neither. Toggled off in the same file.

**`home_net` defaults to `192.168.1.0/24`.** We tap `eth1`, the WAN, where
everything is post-NAT and the source address is the firewall's own WAN IP —
so the default home network matches nothing that arrives. Set to `any` in the
`99-rasputin` uci-defaults.

## What shipped

Alerts leave the firewall over the same authenticated bus everything else uses:
snort appends to `alert_fast.txt`, the agent's IDS tailer parses each line and
publishes it on `rasputin.node.<id>.evt.ids.alert`, the control plane appends it
to `obs/ids-alerts/alerts.jsonl`, Alloy follows that file into Loki, and the IDS
Alerts tab queries it back. On the CWWK bring-up real community-rule fires — the
first was sid 1384, an OS-WINDOWS UPnP malformed advertisement — made that whole
trip with every structured field intact: gid:sid:rev, priority, protocol, source
and destination, classification, and the raw line.

The detection test asserts detection and never asserts blocking. That is
deliberate; a test that checks for a dropped packet would be testing a claim we
do not make.

One recurring cost worth stating: Talos republishes the Community Rules roughly
weekly, so the SHA pinned in `scripts/fetch-snort-rules.sh` drifts and the build
fails on purpose until someone bumps it. The most recent bump moved the pin to
`6489077b` with the rule count unchanged at 4,017. A rebuild that pulls a rolling
upstream feed is never a no-op, and the pin is what makes that visible.

I recognize that detection-only is certainly a decision, however, at this early,
pre-alpha stage, I can't reliably back up prevention at useful speeds. As Rasputin
gets benchmarked on different boards expect this decision to evolve.

{{< devlog-footer >}}
