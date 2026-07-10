---
title: "Your keys, not mine"
date: 2026-07-09
description: "I found my own SSH key baked into every public Rasputin image. Here's the disclosure, the fix, and the first stable release that shipped with it."
summary: "I found my own SSH key baked into every public Rasputin image. Here's the disclosure, the fix, and the first stable release that shipped with it."
---

Yesterday I found my own SSH key baked into every public Rasputin image.

I was rewriting READMEs — the repos went public on July 2nd, and repo pages are
product pages now — and I typed the sentence "release images bake no SSH key."
Then I went to verify it, because the whole point of the rewrite was that these
docs face strangers now. The claim was false. A CI variable named
`RASPUTIN_SSH_AUTHORIZED_KEY` was quietly injecting my public key into root's
`authorized_keys` on every image the pipeline shipped — the node OS and the
OpenWrt firewall both.

There's a boring, honest history: until last week these images only ever landed
on my own bench clusters. A baked support key on your own hardware is just
provisioning. But nobody flips a repo to public and re-audits every assumption
the private era baked in — and that's exactly how a provisioning convenience
becomes the thing a security-minded homelabber would rightly call a backdoor.
"The vendor has root on your firewall" is not a sentence that survives contact
with r/selfhosted, and it shouldn't.

Step one was disclosure, same night: the READMEs stopped claiming the opposite
and said plainly what was in the images and how to delete the key. Disclosure
made it defensible. It didn't make it right.

Step two shipped the next morning. SSH keys are now **seed-supplied**: the FAT
seed partition every Rasputin node reads on first boot takes an optional line —

```sh
RASPUTIN_SSH_AUTHORIZED_KEY="ssh-ed25519 AAAA... you@laptop"
```

— and first boot writes it where dropbear actually looks. There was one
interesting wrinkle: the node OS rootfs is a read-only squashfs, so
`/root/.ssh/authorized_keys` can't exist in the usual place. The key lands on
the persistent data partition (`/var/lib/rasputin/dropbear/`), alongside the SSH
host keys that already lived there so host identity survives A/B updates. On
the firewall the overlay is writable and OpenWrt's dropbear reads
`/etc/dropbear/authorized_keys` natively, so that side was two lines.

Step three is the part I care about: the build-time injection path is
**deleted**, not disabled. The pipeline can no longer bake any key into a
public image — mine included. Leave the seed line blank and there is no network
shell at all: password auth over SSH is off unconditionally, so the node is web
UI and local console only. My bench clusters provision through the exact same
seed field now. If you won't dogfood your own security posture, you don't have
one.

The same push became Rasputin's first stable release: **2026.07.1**, one CalVer
tag across the control plane, the node OS, and the firewall image. The stable
and dev channels both ship the no-baked-key images.

One more confession for flavor: the first firewall build of the fix failed —
snort.org republishes their community ruleset roughly weekly, our build pins
the tarball by SHA, and this was the seventh re-pin since June. The canary
that catches it works; the mirror that would end it is still on the backlog.
Pre-alpha means the skeletons are in the changelog, not the closet.

The lesson I'm keeping: going public isn't a visibility change, it's a threat
model change. Every default you set when the only user was you deserves a
second interview.

*Rasputin is an open-source (AGPL) homelab cluster system — a control plane,
node OS, and firewall image that make a few Raspberry Pis or N100 boxes behave
like one appliance. It's pre-alpha, on
[GitHub](https://github.com/geekdojo/rasputin-releases), and I'm looking for a
handful of [design partners](/#partners) to run it and tell me what's broken.*
