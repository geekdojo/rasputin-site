---
title: "Your keys, not mine"
date: 2026-07-09
description: "My own SSH key was baked into every public Rasputin image. The timeline, the fix, and the first stable release that shipped with it."
summary: "My own SSH key was baked into every public Rasputin image. The timeline, the fix, and the first stable release that shipped with it."
---

While rewriting the READMEs after taking the Rasputin repos public, I wrote
"release images bake no SSH key," went to verify it, and found the opposite:
CI was injecting **my public key into root's `authorized_keys` on every
published image** — node OS and firewall both — via a repo variable
(`RASPUTIN_SSH_AUTHORIZED_KEY`) read at build time.

Why it existed: until July 2nd these repos were private and the images only
ever ran on my own bench clusters, where a baked support key is just
provisioning. Public repos change the threat model, not just the audience.
"The vendor has root on your firewall" is a correct description of what I was
shipping, and it's disqualifying regardless of intent.

**Timeline:**

- **Jul 8, evening** — found while fact-checking README claims. Same night:
  updated all READMEs to disclose the baked key and how to remove it.
- **Jul 8, later** — landed the replacement: seed-supplied keys (below).
  Deleted the build-time injection path entirely.
- **Jul 9** — published the first images without it (os `dev.92`,
  firewall `dev.57`), plus the first stable release.

**The fix — seed-supplied keys:**

- The FAT seed partition every node reads on first boot takes an optional
  line: `RASPUTIN_SSH_AUTHORIZED_KEY="ssh-ed25519 AAAA... you@laptop"`.
- Node OS: the rootfs is read-only squashfs, so `/root/.ssh/` can't hold it.
  First boot writes the key to the persistent data partition
  (`/var/lib/rasputin/dropbear/`), where the SSH host keys already live so
  host identity survives A/B updates. dropbear points there.
- Firewall: the overlay is writable and dropbear reads
  `/etc/dropbear/authorized_keys` natively. Two lines.
- Blank seed line = no network SSH at all. Password auth over SSH is disabled
  unconditionally, so the node is web UI + local console only.
- The build-time path is **deleted, not disabled** — the pipeline cannot bake
  a key into a public image anymore, mine included. My bench clusters
  provision through the same seed field.

**Also shipped: first stable release.** `2026.07.1`, one CalVer tag across
control plane, node OS, and firewall image. Stable and dev channels both
carry the no-baked-key images.

**Build failure of the week:** the firewall fix's first build died on a SHA
mismatch — snort.org republishes its community ruleset roughly weekly and we
pin the tarball by hash. Seventh re-pin since June. The scheduled canary
catches it; the mirror that would end it is still on the backlog.

**Takeaway:** every default set when the only user was me needed re-auditing
the day the repos went public. This was the worst one. If you find another,
file it.

*Rasputin is an open-source (AGPL) homelab cluster system — a control plane,
node OS, and firewall image that make a few Raspberry Pis or N100 boxes behave
like one appliance. It's pre-alpha, on
[GitHub](https://github.com/geekdojo/rasputin-control-plane), and I'm looking for a
handful of [design partners](/#partners) to run it and tell me what's broken.*
