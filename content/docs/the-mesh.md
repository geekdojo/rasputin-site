---
title: "What the mesh gives you"
description: "Your cluster runs its own private tailnet: nodes join themselves, your devices join with a one-time key, and things answer to a different name over the mesh than they do on your LAN."
weight: 90
applies-to: "2026.08.5"
---

**Mesh** is your cluster's own private network. Every Rasputin node joins it, you can add
your own laptops and phones to it, and a device that is on it reaches your nodes by name
**without anything being exposed to the internet**. That last part is the point: the mesh is
the reason you should rarely need [a port forward](/docs/forward-a-port/).

Underneath it is [Headscale](https://headscale.net/) — an open-source implementation of the
Tailscale coordination server — running on your control plane, with the standard Tailscale
client on the nodes and on your devices. **Nothing is registered with a third party and no
account is created anywhere.** The coordinator is yours, on your hardware.

`<cluster-id>` throughout is your cluster's own identifier, fixed when you provisioned it.

## Do this

1. **Look at `Mesh → DEVICES`.** Your nodes are already there. You do not add them —
   firewall, compute, and storage nodes enroll automatically when they register with the
   control plane, and the control plane itself joins during first-run setup.
2. **Add your own laptop or phone** with a one-time key from `Mesh → KEYS`. This is the only
   task in this section most people ever do. See
   [Add a device to the mesh](/docs/add-a-device-to-the-mesh/).
3. **Reach things by name.** From a device on the mesh, a node or app answers to
   `<name>.<cluster-id>.internal`. On your LAN it answers to
   `<name>.lan.<cluster-id>.internal`. The two are not interchangeable — see below.
4. **Only if you need to reach a machine that is not a Rasputin node** — a printer, a NAS, a
   camera, a separate VLAN — add a subnet route. See
   [Reach your LAN over the mesh](/docs/reach-your-lan-over-the-mesh/).

<!-- SCREENSHOT: mesh-overview.png — the Mesh header with login server / user / backend, the
state pill, and the four Overview cards. -->

## Names, and which one to use where

Each node and each app has two names, and **which one answers depends on which network you
are asking from**.

| Name | Answers with | Who resolves it |
|---|---|---|
| `<name>.<cluster-id>.internal` | the **tailnet** address | the mesh coordinator, for devices on the tailnet |
| `<name>.lan.<cluster-id>.internal` | the **LAN** address | your control plane, for devices on your LAN |

`<name>` is the node or app. So for an app called `jellyfin`,
`jellyfin.<cluster-id>.internal` is how a device on the tailnet reaches it, and
`jellyfin.lan.<cluster-id>.internal` is how a device on your LAN reaches it. The short form
is the mesh name; `.lan.` is the explicit LAN form.

Nodes always have both. **Apps are tailnet-only by default** and get a LAN name only when you
opt them in — which is enforced by what the app listens on, not just by withholding the name.

**`<cluster-id>.local` is a LAN-only name.** It is how you reach the Rasputin UI on your own
network, and it does not resolve over the mesh — it is an mDNS/LAN name, not a tailnet name.
From the tailnet, use the `.internal` names.

## What the mesh does not give you

**What it protects.** Traffic between mesh devices is carried over the tailnet rather than
over anything you had to expose. A device on the mesh gets a stable address in the
`100.64.0.0/10` range that does not move when DHCP changes its mind, so what you reach by
name today you reach by name tomorrow.

**What it does not protect.** Three limits, stated plainly:

- **It does not give you away-from-home access in this release.** A tailnet is the mechanism
  that *could* carry it, and we demonstrate it on our own bench. This release does not claim
  working remote access from outside your home network, and parts of it are known not to
  work yet. Treat the mesh as what makes your cluster reachable by name **across your own
  networks** today.
- **You cannot sign in to the Rasputin UI from off your LAN.** Passkey sign-in is bound to a
  fixed `.local` origin on your LAN, and a mesh address cannot satisfy that binding — a
  passkey registered against a LAN origin will not be offered on any other one. Reaching the
  UI needs LAN presence, or a session you already established. This is a known limitation
  with an open design question behind it, and nothing on the Mesh tabs changes it.
- **The tailnet is open internally.** This release ships no access-control policy, so a
  device you add can reach every node on the mesh, every advertised subnet, and every other
  device on it. That makes *who you give a key to* the trust boundary — see
  [Add a device to the mesh](/docs/add-a-device-to-the-mesh/).

**What you cannot take back.** **There is no way to remove a device from the mesh in this
release.** Not on any tab — the DEVICES table has no action controls at all, and deleting the
key a device joined with does not evict it. Removing a device is an API operation with no
interface in front of it. Plan for that before you hand out a key; if you need a device off
the mesh today, that is a request to make of us.

## `IN SYNC` alongside `never applied` is normal

It looks like a contradiction. It is not — the two describe different things.

- **`never applied`** says only that the `APPLY` button has never been pressed. `APPLY`
  pushes *your intents*: pre-auth keys and subnet routes.
- **`IN SYNC`** says your intents and the coordinator agree. With no keys and no routes
  configured, they agree trivially — there is nothing to disagree about.

Meanwhile DEVICES can show every node in your cluster, because **nodes do not join via
`APPLY`**. Node enrollment is its own process, running continuously and independent of the
intent list. So a healthy cluster with a fully-formed tailnet and no keys or routes of its own
reads exactly this way: `IN SYNC`, `never applied`. Nothing is wrong.

The rest of the header row is three facts about the mesh itself: **`login server`**, the URL
your devices are told to log in to and the value you need when you enroll a laptop or phone;
**`user`**, the single owner account this release uses for everything on the tailnet; and
**`backend`**, normally `headscale`. Two other backend values each come with a warning
banner — **`mock`** means enrollments and addresses on screen are *simulated* and not a real
tailnet, and **`unavailable`** means no coordinator is configured, so device listing and
enrollment will fail.

## The tabs, briefly

**OVERVIEW** — four cards, each linking to the tab that owns it: **RASPUTIN NODES** and
**USER DEVICES** count what is on the tailnet, **PRE-AUTH KEYS** counts keys you have
generated and not deleted (an expired key keeps counting until you delete it), and **SUBNET
ROUTES** counts route intents.

**DEVICES** — everything on the tailnet in one table: **HOST**, **KIND** (`RASPUTIN` for a
cluster node, `USER` for one of yours), **TAILNET IP**, **TAGS** (`tag:rasputin-node` for
nodes, `tag:user-device` by default for devices you add with a key), **ROUTES**, and **LAST
SEEN**. Six columns and **no action column** — no remove, no rename, no per-row menu.

<!-- SCREENSHOT: mesh-devices.png — the DEVICES table with cluster nodes and one USER device,
and the ENROLL RASPUTIN NODE section below it. -->

A node's name may carry a badge. **`TRUST STALE · re-delivering`** means that node holds an
out-of-date copy of your cluster's certificate authority; Rasputin noticed and is already
re-sending it, so it clears itself. **`TRUST UNREPORTED`** means the node has not said which
authority it trusts — usually an older agent — and Rasputin leaves it alone rather than
guessing.

**ADVANCED** — everything Rasputin does not model about Headscale (access-control policy, DNS
overrides, exit nodes, relay maps) lives in Headplane, the upstream Headscale admin interface.
**It is not deployed on a stock cluster**, this tab tells you so, and there is no button to
open. Surfacing it is a control-plane setting rather than an operator one — the tab names the
mechanism on screen — so if you need Headplane, that is a request to make of us rather than
something to turn on from the UI.

What Rasputin *does* model is pre-auth keys, subnet routes, and node enrollment. On those
three, Rasputin wins: change a key or a route anywhere else and the next reconcile flags
`DRIFT`, and the fix is to make the Rasputin intent say what you want and `APPLY`. On
anything else, Headscale wins — Rasputin does not observe it and will not warn you about it.

## Troubleshooting

**The header says `IN SYNC` and `never applied` at the same time.**
That is correct and healthy on a cluster with no keys and no routes. Nodes join by enrollment,
not by `APPLY`.

**A node is missing from DEVICES.**
If it is online, `ENROLL RASPUTIN NODE` on the DEVICES tab will offer it — that is the manual
escape hatch for a case that should not happen. If it is offline it does not appear at all;
bring it back up and it converges on its own. The normal, healthy reading of that section is
the line `all online Rasputin nodes are already in the tailnet`.

**The header shows `backend: mock`.**
Nothing on screen is a real tailnet — enrollments and addresses are simulated. A banner says
so.

**The header shows `backend: unavailable`.**
No coordinator is configured, so listing devices and enrolling them will fail.

**You need a device off the mesh.**
There is no control for it, here or anywhere in the UI, and deleting its key does not evict
it. That is a request to make of us.

**A name that works on your LAN does not work over the mesh, or the reverse.**
They are different names. `<name>.<cluster-id>.internal` is the tailnet name;
`<name>.lan.<cluster-id>.internal` is the LAN name; `<cluster-id>.local` is LAN-only and
never resolves over the mesh.

**An app answers over the mesh but not on your LAN.**
Apps are tailnet-only by default. A LAN name is something you opt an app in to, and it is
enforced by what the app listens on.

**You are away from home and cannot sign in to the UI.**
That does not work in this release. Passkey sign-in is bound to a `.local` origin on your LAN,
and a mesh address cannot satisfy it.
