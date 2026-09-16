---
title: "Docs"
description: "Guides and reference for running Rasputin. Alpha — expect things to change."
outputs:
  - html
cascade:
  outputs:
    - html
    - markdown
---

Find the job you are doing, then the line that matches your question. If your cluster is new,
the first group is in order — read it that way.

## Getting started

Read these three in order on a new cluster.

- **[Get in the first time](/docs/get-in-the-first-time/)** — your browser says the connection is
  not private, and there is no password field. Start here.
- **[Finish first-run setup](/docs/finish-first-run-setup/)** — you are signed in but the box is
  not a cluster yet: which setup cards you have to do, and which deployment mode to pick before
  anything is running.
- **[Finding your way around](/docs/finding-your-way-around/)** — what the counters in the top bar
  are counting, and what sits behind each slot on the nav rail.

## Nodes

- **[Add a node](/docs/add-a-node/)** — you have a spare machine and want it in the cluster.
- **[Check on a node](/docs/check-a-node/)** — a node is showing something other than `ONLINE` and
  you need to know what that sends you to go and look at.
- **[Remove a node](/docs/remove-a-node/)** — you are retiring a machine: what leaves the cluster
  with it, and what stays behind.
- **[Replace or revoke an SSH key on a node](/docs/replace-or-revoke-an-ssh-key/)** — a node that
  is already enrolled still accepts an old key, and changing the key in Settings did not reach it.

## Apps

- **[Install an app](/docs/install-an-app/)** — you want something new running, and the catalog is
  asking you to consent to something before it will.
- **[Your apps](/docs/your-apps/)** — where an app's two addresses, its backup state and its
  restore-data action live, and what `LAN ACCESS` actually turns on.
- **[Stop or delete an app](/docs/stop-or-delete-an-app/)** — you want an app gone, and one
  checkbox decides whether its data goes with it.

## Observability

- **[See how a node is behaving](/docs/see-how-a-node-is-behaving/)** — is this machine short of
  CPU, memory or disk, and why do two pages report different numbers for it?
- **[Respond to an alert](/docs/respond-to-an-alert/)** — the `ALERTS` badge went red: what raised
  it, and which alerts you can only fix rather than dismiss.
- **[Watch what the cluster is doing](/docs/watch-what-the-cluster-is-doing/)** — something you
  asked for did not happen, and you want the step and the command output behind it.

## Backups

- **[Set up backups](/docs/set-up-backups/)** — you have a spare disk and no backups yet; the
  secrets you mint here are the ones nobody can reissue for you.
- **[Check your backups](/docs/check-your-backups/)** — is my data actually backed up? The one line
  that answers it, and the numbers that do not.
- **[Restore a cluster](/docs/restore-a-cluster/)** — the control plane died and you are putting its
  identity onto a replacement, before you register a passkey on it.

## Updates

- **[Roll out an update across the fleet](/docs/roll-out-an-update/)** — a new release is out and
  you want the fleet on it: the gates that run before you press the button and while it runs.
- **[Know whether an update worked](/docs/know-whether-an-update-worked/)** — the run finished, and
  you want to know whether it really succeeded and what a green-but-`DEGRADED` node means.
- **[Update one node](/docs/update-one-node/)** — one machine missed or failed the fleet run and you
  want just that one brought up.
- **[Bring in a bundle by hand](/docs/bring-in-a-bundle-by-hand/)** — the cluster has no route to
  the internet, or you built the image yourself.

## Firewall

- **[How the Firewall section works](/docs/the-firewall-intent-model/)** — why nothing you type on
  these tabs reaches the box until `APPLY`. Read this before the other three.
- **[Write a firewall rule](/docs/write-a-firewall-rule/)** — you want to allow or block traffic
  between zones, and you need to know why a rule might never fire.
- **[Forward a port](/docs/forward-a-port/)** — something outside your house has to reach a machine
  inside it, and you want to know the cost before you open it.
- **[Manage the WAN](/docs/manage-the-wan/)** — your ISP needs a PPPoE login, a static address or a
  client ID, and you want to know what Rasputin takes over when you give it one.

## Mesh

- **[What the mesh gives you](/docs/the-mesh/)** — what the cluster's own private network is for,
  and why a thing answers to a different name over it than on your LAN.
- **[Add a device to the mesh](/docs/add-a-device-to-the-mesh/)** — you want your laptop or phone on
  the mesh, and you need to know what a joined device can reach.
- **[Reach your LAN over the mesh](/docs/reach-your-lan-over-the-mesh/)** — a machine you want to
  reach is not a Rasputin node, and the mesh cannot see it yet.

## Occasional reference

- **[Settings](/docs/settings/)** — you are changing how the cluster is reached, named, defended or
  accessed, and you want the consequence of each choice first.
- **[Open a serial console](/docs/open-a-serial-console/)** — a node has stopped answering
  altogether and you need to watch it boot.

## Beyond the manual

Reference and background that sit outside the task documents above.

- **[Supported hardware](/docs/hardware/)** — what has actually been booted, and what is only
  expected to work.
- **[Provisioning & the seed file](/docs/provisioning/)** — the full `rasputin-seed.env`
  reference: roles, join tokens, NTP, release channels.
- **[Rasputin on a Turing Pi 2](/docs/turing-pi/)** — provisioning a Turing Pi 2 cluster board,
  including a flashing path that needs no USB cable.
- **[Rasputin on a BitScope blade rack](/docs/bitscope-rack/)** — the rack manager that owns the
  serial control bus, and the address map that decides which node a power button cuts.
- **[Install with an AI agent](/docs/agents/)** — the scriptable install contract:
  non-interactive flashing, machine-readable release manifests, the health probe.
- **[Roadmap](/docs/roadmap/)** — what we're building now, next, and later.
- **[Download](/download/)** — images, checksums, release notes, dev builds. The
  firewall is a separate x86-only image on its own release cadence, with its own seed
  file documented in the
  [rasputin-openwrt-firewall](https://github.com/geekdojo/rasputin-openwrt-firewall) repo.
- **[ARCHITECTURE.md](https://github.com/geekdojo/rasputin-control-plane/blob/main/ARCHITECTURE.md)**
  — the system-level picture: node roles, the bus, the job model, updates.
- **[The devlog](/devlog/)** — what shipped, one honest problem, one number, weekly-ish.

The first-node path is designed to take **under ten minutes**, and getting a cluster useful to
take under an hour. If it is slower than that, that is a bug by definition —
[open an issue](https://github.com/geekdojo/rasputin-control-plane/issues) with what you hit;
blunt reports are the valuable kind. If you're running Rasputin for two weeks or more,
consider [becoming a design partner](/#partners).
