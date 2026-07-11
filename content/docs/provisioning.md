---
title: "Provisioning & the seed file"
description: "How a node picks its role and joins the fleet — the rasputin-seed.env reference, starter to full options."
weight: 10
---

## Starter — your first node

Your first node runs the **control plane** (the web UI + API). Flash the [OS image](/download/), then:

1. Plug the flashed card or drive into your computer and mount the volume labeled **`RASPUTIN-FW`** — the small FAT seed partition. Go by the label, not size: the Pi image has several FAT partitions.
2. Create a file named `rasputin-seed.env` at its root with two lines:

   ```env
   RASPUTIN_NODE_ROLE=controlplane
   RASPUTIN_SSH_AUTHORIZED_KEY="ssh-ed25519 AAAA… you@laptop"
   ```

   Use your own SSH **public** key, and keep the double quotes — the file is read by `sh` and the key contains spaces.
3. Boot the node and open <http://rasputin.local>. The first-run wizard registers a passkey and lands you on the dashboard.

That's the whole happy path. The first control plane self-initializes against its own embedded NATS, so it needs nothing else in the seed.

## The seed file

`rasputin-seed.env` lives on the `RASPUTIN-FW` volume and is read **once**, on first boot, to pick the node's role and join the fleet. Leave it blank for an un-provisioned image — first boot waits until the role is set. Every entry is `KEY=value`, one per line.

| Variable | Applies to | What it does |
| --- | --- | --- |
| `RASPUTIN_NODE_ROLE` | **all** | `controlplane` or `compute`. Required — first boot waits for it. (The firewall node runs the separate OpenWrt image, not this one.) |
| `RASPUTIN_SSH_AUTHORIZED_KEY` | all | Your SSH **public** key for `root`, **double-quoted**. The image bakes no key, so this is the only way in over the network — leave it blank and SSH is unusable (the local console still works). One key line. |
| `RASPUTIN_NODE_ID` | all | Optional — defaults to the hardware serial. The provisioning pipeline assigns it explicitly and binds the join token to it. |
| `RASPUTIN_NATS_URL` | compute | The control plane's NATS URL. The **first** control plane self-inits against its own embedded NATS and doesn't need this. |
| `RASPUTIN_CP_JOIN_TOKEN` | compute | A join token minted by the control plane. Not needed by the first control plane. |
| `RASPUTIN_RELEASE_CHANNEL` | control plane only | `stable` or `dev` — which channel Check-for-Updates tracks. Optional; blank → `stable`. |

The SSH key **must** be double-quoted: the value contains spaces and the file is sourced by `sh`. First boot appends it to the persistent partition (the rootfs is read-only) and runs once; to rotate or revoke a key later, edit `/var/lib/rasputin/dropbear/authorized_keys` on the node directly.

## Adding more nodes

Additional nodes need a **node id** and a **join token** minted by the running control plane — set `RASPUTIN_NODE_ID`, `RASPUTIN_CP_JOIN_TOKEN`, and `RASPUTIN_NATS_URL` in that node's seed. You don't hand-write these: the control plane's Add-Node flow and the `rasputin-provision` matched-set tooling generate a seed bound to each node id. The firewall is a separate x86 image with its own seed — see [`rasputin-openwrt-firewall`](https://github.com/geekdojo/rasputin-openwrt-firewall).
