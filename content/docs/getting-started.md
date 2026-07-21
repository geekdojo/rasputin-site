---
title: "Getting started"
description: "Zero to a working cluster: what you need, flash the first node, sign in with a passkey, add nodes, deploy an app."
weight: 5
---

This walks you from empty hardware to a working cluster with an app running. The whole
first-node path is designed to take **under ten minutes** — if it's slower, that's a bug
and we want it filed.

## What you need

- **A first node** — Raspberry Pi 4, Pi 5, or CM5 (arm64), or an Intel N100 / any amd64
  mini-PC. This one becomes the **control plane**: the web UI and API your browser talks
  to. More nodes can follow later; one is enough to start.
- **Storage for it** — a microSD card, NVMe, or USB drive to flash.
- **A wired network with DHCP** — the boring kind you already have. (IPv4 only, by design.)
- **A computer to flash from** — macOS or Linux for the one-command path; Windows works
  via the manual steps.
- **Your SSH public key** — optional but recommended. Images ship with **no key baked in**;
  the one you provide is the only way in over SSH.
- **A passkey** — sign-in is passkey-only (Touch ID, Windows Hello, or a security key).
  There are no passwords anywhere.

## 1. Flash the first node

On macOS or Linux, plug the first node's card or drive into your computer and run:

```sh
curl -fsSL https://rasputin.geekdojo.com/bootstrap.sh | sudo bash
```

It asks three questions — which hardware, a name for the node, which SSH key — then
downloads the latest stable image, verifies its SHA-256 against the release manifest,
flashes the drive (external drives only, behind a typed confirmation), writes your
control-plane seed, and reads it back from the medium to prove it landed.

On Windows, or if you'd rather do each step by hand: grab an image from the
[Download page](/download/), verify it, flash it, and drop a three-line
`rasputin-seed.env` on the volume labeled `RASPUTIN-OS` — the
[manual steps](/download/) and the full
[seed-file reference](/docs/provisioning/) cover it.

Scripting the flash — or letting an AI agent drive it? Every prompt above has an env-var
override, including a no-write dry run. The whole contract is on
[Install with an AI agent](/docs/agents/).

## 2. Boot and sign in

Slot the card, connect ethernet, power on, and open <http://rasputin.local> from any
machine on the same network. You land on a **trust page** first: your cluster generates
its own certificate authority, and this page hands it to you per-OS — a profile link for
iPhones and iPads, a one-line `curl` for laptops, Windows steps — with a
proceed-past-the-browser-warning escape hatch if you'd rather skip it. Then **Continue
securely** takes you to `https://rasputin.local/setup` to register a passkey, and lands
you on the dashboard: a hex grid with one node in it — yours, online.

Two things worth knowing while it boots. First boot takes a few minutes, and until the
control plane is up the browser just says it can't connect — that's the boot, not a
failure. (Impatient, or scripting the wait? `curl -fsS http://rasputin.local/healthz`
answers `{"status":"ok"}` the moment the control plane is up.) And if `rasputin.local`
never resolves at all — routine on Windows without
mDNS, and behind some routers — find the node in your router's DHCP lease list (the
control plane shows up named `rasputin`) and browse to its IP address directly.

One thing left: a banner on the dashboard points at the **setup wizard**. Finish it to
fully configure the cluster — give the installation a name, optionally turn on remote
access (a private mesh), and click **Finish**. It's re-runnable any time, so nothing
there is a one-way door.

No config management, no YAML, no shell required. If the browser warns that the node's
certificate is **expired** on a freshly flashed node, the clock is the first thing to
check — see [time sync](/docs/provisioning/#time-sync).

## 3. Add more nodes

Every node after the first enrolls through the dashboard, not through hand-edited
config:

1. Click the **+** (add node) in the hex grid. The wizard hands you a one-liner with
   that node's enrollment seed baked in — a join token bound to that node's id, so a
   stolen card can't impersonate a neighbor.
2. Flash the new node's card with it, slot it, power on.
3. Watch the bay go **PENDING → ONLINE** on its own. Zero keystrokes between wall
   switch and online.

Repeat per node. A cluster currently caps at **24 nodes** — a deliberate limit the UI
is designed around, and enough for a very serious homelab. (For the curious: a full
24-node rack bring-up takes about
[two minutes of software time](/devlog/002-bitscope-rack-24-nodes/).)

## 4. Deploy your first app

Open **Apps** in the left rail. Deploy from the curated catalog, or paste your own
Docker Compose — your compose files stay yours, and the escape hatch is always open.
Pick a target node, deploy, and watch the job run in **Tasks**: every state-changing
action in Rasputin is a job with visible steps and a replayable event stream, so you
can always answer "what exactly did it just do?"

When it lands, the app shows **RUNNING** with an open-in-browser button next to it.

## The firewall node (optional)

The dedicated firewall is a **separate x86-only image** on its own release cadence —
stateful filtering, WireGuard, and tap-mode intrusion detection, managed from the same
UI as the rest of the cluster. Grab it from the [Download page](/download/); it has its
own seed file, documented in the
[rasputin-openwrt-firewall](https://github.com/geekdojo/rasputin-openwrt-firewall)
repo.

## When something breaks

Two known first-boot symptoms, honestly labeled:

- **Browser says the certificate is expired.** The node's clock is wrong — common on
  boards with no battery-backed clock (Pi 5) on networks with broken NTP. See
  [time sync](/docs/provisioning/#time-sync).
- **The first hour took more than an hour.** That's a bug by definition.
  [Open an issue](https://github.com/geekdojo/rasputin-control-plane/issues) with what
  you hit — blunt reports are the valuable kind. If you're running Rasputin for two
  weeks or more, consider [becoming a design partner](/#partners).

## Next

- **Settings** — the gear in the lower-left corner of the dashboard: themes, deployment
  mode, the observability toggle, and operator SSH keys live there.
- [Provisioning & the seed file](/docs/provisioning/) — the full `rasputin-seed.env`
  reference: roles, join tokens, NTP, release channels.
- [Install with an AI agent](/docs/agents/) — the scriptable install contract:
  non-interactive flashing, machine-readable release manifests, the health probe.
- [Download](/download/) — images, checksums, release notes, dev builds.
- [ARCHITECTURE.md](https://github.com/geekdojo/rasputin-control-plane/blob/main/ARCHITECTURE.md)
  — the system-level picture: node roles, the bus, the job model, updates.
- [The devlog](/devlog/) — what shipped, one honest problem, one number, weekly-ish.
