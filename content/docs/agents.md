---
title: "Install with an AI agent"
description: "The machine-readable install contract: non-interactive bootstrap.sh env vars, release manifests, the seed file, and how an agent verifies the cluster actually came up."
weight: 15
---

Rasputin's install path is scriptable end to end, and this page is the contract for it —
written for AI coding agents (Claude Code, Codex, and friends) and for the humans driving
them. Everything here is also how you'd automate an install with plain shell, no AI
involved.

If you're a human who wants an agent to do the work, paste this into it:

```
Read https://rasputin.geekdojo.com/llms.txt and
https://rasputin.geekdojo.com/docs/agents/index.md, then help me install
Rasputin. Plan the flash with RASPUTIN_DRY_RUN=1 first and show me the plan;
only write to a disk after I confirm. My first node's hardware is:
<Raspberry Pi 4/5/CM5, or an Intel N100 / amd64 box>.
```

## Machine-readable endpoints

| URL | What it is |
| --- | --- |
| [/llms.txt](/llms.txt) | Index of everything on this page's level — docs, manifests, install one-liner. |
| [/releases.json](/releases.json) | Latest **stable** versions + image download URLs. Regenerated daily and on every release. |
| [OS manifest](https://github.com/geekdojo/rasputin-os/releases/latest/download/manifest.json) | **Authoritative** per-artifact SHA-256 checksums, sizes, and signer for the newest stable OS release. Stable URL — no API, no auth, no HTML scraping. |
| [Firewall manifest](https://github.com/geekdojo/rasputin-openwrt-firewall/releases/latest/download/manifest.json) | Same, for the firewall image. |
| [/bootstrap.sh](/bootstrap.sh) | The flasher itself — plain bash, commented, and the source of truth for the env contract below. |
| Docs as markdown | Every docs page has a raw-markdown mirror at `index.md` — e.g. [/docs/provisioning/index.md](/docs/provisioning/index.md). Skip the HTML entirely. |

Pin a specific release by swapping `latest/download` for `download/<tag>` in the manifest
and image URLs.

## Non-interactive install

`bootstrap.sh` prompts a human for three things; every prompt has an env-var override, so
an agent can drive it deterministically:

| Variable | Meaning |
| --- | --- |
| `RASPUTIN_ARCH` | Target hardware: `arm64` (Raspberry Pi 4/5/CM5) or `amd64` (Intel N100 / any amd64 box). |
| `RASPUTIN_NODE_ID` | Control-plane node id (default `cp-1`). Short lowercase name: letters, digits, hyphens. |
| `RASPUTIN_SSH_AUTHORIZED_KEY` | Your SSH **public** key line. Or set `RASPUTIN_SSH_KEY_FILE` to a `.pub` path instead. |
| `RASPUTIN_RELEASE` | Pin a release tag. Default: latest stable. |
| `RASPUTIN_DISK` | Target device (e.g. `/dev/disk4`, `/dev/sdb`). Skips the disk-picker prompt. |
| `RASPUTIN_ASSUME_YES` | `=1` skips the typed flash confirmation. |
| `RASPUTIN_DRY_RUN` | `=1` prints the resolved plan (disk, image URL) and stops **before any write**. |
| `RASPUTIN_ALLOW_INTERNAL` | `=1` also offers internal disks. Dangerous; leave unset. |

The script verifies the image's SHA-256 against the release manifest, refuses internal
disks by default, writes the seed, and block-level reads it back. The recommended agent
flow, in order:

```sh
# 1. Preflight — no writes, prove the plan to the user first.
curl -fsSL https://rasputin.geekdojo.com/bootstrap.sh | sudo \
  RASPUTIN_ARCH=arm64 RASPUTIN_NODE_ID=cp-1 \
  RASPUTIN_SSH_KEY_FILE=$HOME/.ssh/id_ed25519.pub \
  RASPUTIN_DRY_RUN=1 bash

# 2. Flash — same command, dry-run swapped for the confirmed target disk.
curl -fsSL https://rasputin.geekdojo.com/bootstrap.sh | sudo \
  RASPUTIN_ARCH=arm64 RASPUTIN_NODE_ID=cp-1 \
  RASPUTIN_SSH_KEY_FILE=$HOME/.ssh/id_ed25519.pub \
  RASPUTIN_DISK=/dev/disk4 RASPUTIN_ASSUME_YES=1 bash
```

**Agents: always dry-run first and show the human the plan before flashing.** Writing a
disk image is destructive, and picking the wrong disk is the one mistake this page can't
undo for you.

Flashing by hand instead (Windows, or no script): the [Download page](/download/) has the
manual steps, and a copy-exact seed template lives at
[/rasputin-seed.env.example](/rasputin-seed.env.example). The full seed reference is
[Provisioning](/docs/provisioning/) ([markdown](/docs/provisioning/index.md)).

## Verifying the install

After the node boots (first boot takes a few minutes — the browser refusing to connect
during it is normal, not a failure):

```sh
curl -fsS http://rasputin.local/healthz
# → {"status":"ok"}
```

`/healthz` answers unauthenticated on plain HTTP as soon as the control plane is up. If
`rasputin.local` doesn't resolve (routine on Windows without mDNS, and behind some
routers), find the host named `rasputin` in the router's DHCP lease table and probe the IP
directly.

Beyond the probe, the trust chain is fetchable too: the cluster's CA certificate is at
`http://rasputin.local/mesh-ca.pem` (unauthenticated by design — first-run trust is TOFU
on your own LAN), and `http://rasputin.local` lands on a trust page with per-OS
CA-install instructions before HTTPS sign-in.

## Where the agent must hand off

Two steps are deliberately human-only:

- **Passkey registration.** Sign-in is passkey-only — Touch ID, Windows Hello, or a
  security key at `https://rasputin.local/setup`. No passwords exist, so there is nothing
  for an agent to type. Walk the human to the browser and wait.
- **Adding more nodes.** The dashboard's Add-node wizard mints each new node's one-liner
  with an id-bound join token baked in. Don't hand-construct compute seeds
  (`RASPUTIN_NATS_URL`, `RASPUTIN_CP_JOIN_TOKEN`) — run the wizard's one-liner as given.

## Known failure modes

| Symptom | Cause and fix |
| --- | --- |
| Browser says the certificate is **expired** on a fresh node | The node's clock is wrong — common on boards with no battery-backed clock (Pi 5) when NTP is broken. See [Time sync](/docs/provisioning/#time-sync). |
| `rasputin.local` never resolves | No mDNS on the client (Windows) or the router blocks it. Use the DHCP-lease IP for host `rasputin`. |
| Seed didn't take; first boot waits forever | The seed must be named `rasputin-seed.env`, at the **root** of the FAT volume labeled `RASPUTIN-OS` — go by label, not size; the Pi image has several FAT partitions. The SSH key line must be double-quoted. |
| First hour took more than an hour | That's a bug by definition. [File it](https://github.com/geekdojo/rasputin-control-plane/issues) — blunt reports are the valuable kind. |

It's pre-alpha: image layouts and update formats still change without notice, and this
contract can change with them — re-read this page rather than caching it. Something wrong
or missing here blocks *every* agent-driven install, so
[docs bugs count double](https://github.com/geekdojo/rasputin-site/issues/new?title=Docs%20Issue).
