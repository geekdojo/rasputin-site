---
title: "Provisioning & the seed file"
description: "How a node picks its role and joins the fleet — the rasputin-seed.env reference, starter to full options."
weight: 10
---

## Starter — your first node

Your first node runs the **control plane** (the web UI + API). Flash the [OS image](/download/), then:

1. Plug the flashed card or drive into your computer and mount the volume labeled **`RASPUTIN-OS`** — the small FAT seed partition. Go by the label, not size: the Pi image has several FAT partitions.
2. Create a file named `rasputin-seed.env` at its root with three lines:

   ```env
   RASPUTIN_NODE_ROLE=controlplane
   RASPUTIN_NODE_ID=cp-1
   RASPUTIN_SSH_AUTHORIZED_KEY="ssh-ed25519 AAAA… you@laptop"
   ```

   `RASPUTIN_NODE_ID` names the control plane on the fleet — any short lowercase name works (`cp-1`, `home-cp`). Use your own SSH **public** key, and keep the double quotes — the file is read by `sh` and the key contains spaces.
3. Boot the node and open <http://rasputin.local>. The first-run wizard registers a passkey and lands you on the dashboard.

That's the whole happy path. The first control plane self-initializes against its own embedded NATS — it needs no join token or NATS URL, just its role, an id, and your key.

## The seed file

`rasputin-seed.env` lives on the `RASPUTIN-OS` volume and is read **once**, on first boot, to pick the node's role and join the fleet. Leave it blank for an un-provisioned image — first boot waits until the role is set. Every entry is `KEY=value`, one per line.

| Variable | Applies to | What it does |
| --- | --- | --- |
| `RASPUTIN_NODE_ROLE` | **all** | `controlplane` or `compute`. Required — first boot waits for it. (The firewall node runs the separate OpenWrt image, not this one.) |
| `RASPUTIN_SSH_AUTHORIZED_KEY` | all | Your SSH **public** key for `root`, **double-quoted**. The image bakes no key, so this is the only way in over the network — leave it blank and SSH is unusable (the local console still works). One key line. |
| `RASPUTIN_NODE_ID` | **all** | Names the node on the fleet. **Required on the control plane** — a control-plane seed without it stops first boot with an error, since the control plane's identity must be stable. On a compute node it's optional and defaults to the hardware serial; the Add-Node flow and `rasputin-provision` assign it and bind the join token to it. |
| `RASPUTIN_NTP_SERVER` | all | Optional NTP server to pin (host or IP; **double-quote** a space-separated list). Only needed to force a homelab-local time server — see [Time sync](#time-sync). |
| `RASPUTIN_NATS_URL` | compute | The control plane's NATS URL. The **first** control plane self-inits against its own embedded NATS and doesn't need this. |
| `RASPUTIN_CP_JOIN_TOKEN` | compute | A join token minted by the control plane. Not needed by the first control plane. |
| `RASPUTIN_RELEASE_CHANNEL` | control plane only | `stable` or `dev` — which channel Check-for-Updates tracks. Optional; blank → `stable`. |

The SSH key **must** be double-quoted: the value contains spaces and the file is sourced by `sh`. First boot appends it to the persistent partition (the rootfs is read-only) and runs once; to rotate or revoke a key later, edit `/var/lib/rasputin/dropbear/authorized_keys` on the node directly.

## Time sync

Every node needs a correct clock. The control plane mints its HTTPS certificate against the current time, so a node whose clock is wrong serves a certificate your browser rejects as **expired** (or not-yet-valid). Nodes with no battery-backed real-time clock — the Raspberry Pi 5 — rely entirely on NTP for this, so if you ever see an expired-certificate warning on a freshly flashed node, the clock is the first thing to check.

You normally don't configure anything — a node gets its time automatically, in this order of precedence:

1. **Your DHCP server's NTP server** (option 42), if it advertises one — used automatically.
2. **`RASPUTIN_NTP_SERVER`** from the seed, if you set it.
3. **Built-in public fallback** — anycast Cloudflare/Google IPs, used only when neither of the above is known. These are numeric, so they work even on a network with no working DNS.

Set `RASPUTIN_NTP_SERVER` only to pin a specific time server — for example an isolated LAN whose DHCP doesn't advertise NTP:

```env
RASPUTIN_NTP_SERVER="ntp.homelab.lan"
```

Double-quote the value if you list more than one server (space-separated), the same way you quote the SSH key.

## Adding more nodes

Additional nodes need a **node id** and a **join token** minted by the running control plane — set `RASPUTIN_NODE_ID`, `RASPUTIN_CP_JOIN_TOKEN`, and `RASPUTIN_NATS_URL` in that node's seed. **You don't hand-write these:** the control plane's Add-Node flow and the `rasputin-provision` matched-set tooling generate a seed bound to each node id. The firewall is a separate x86 image with its own seed — see [`rasputin-openwrt-firewall`](https://github.com/geekdojo/rasputin-openwrt-firewall).
