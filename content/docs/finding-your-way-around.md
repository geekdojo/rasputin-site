---
title: "Finding your way around"
description: "The frame every signed-in screen sits in: what each top-bar counter counts, where it links, and the nav rail in order."
weight: 12
applies-to: "2026.08.5"
---

Every signed-in screen is wrapped in the same frame: a top bar across the width, a narrow
icon rail down the left, and the page itself in the space that is left.

<!-- SCREENSHOT: the signed-in chrome on Nodes, with callouts labelling (1) the cluster name,
(2) NODES ON LAN, (3) ON MESH, (4) ALERTS, (5) TASKS RUNNING, (6) the UTC clock,
(7) SIGN OUT, and (8) the nav rail. Capture in the default MISSION CONTROL theme. -->

## The top bar

Left to right:

| Element | What it is |
| --- | --- |
| Green dot + **RASPUTIN** | Branding. Not a link. |
| **CLUSTER** | Your cluster's install name, set during first-run setup. Falls back to `RASPUTIN` if none is set. Not a link. |
| **NODES ON LAN** | `online / total` — nodes whose agent the control plane can currently hear on its internal bus. Not a link. |
| **ON MESH** | `on-mesh / total`, or `—`. Nodes the mesh reports as currently joined. Not a link. |
| **ALERTS** | `NONE`, `n CRIT`, `n WARN`, or `n CRIT · n WARN`. **Links to Alerts.** |
| **TASKS RUNNING** | Jobs running right now. **Links to Tasks.** |
| Clock | The current time in **UTC**, ticking every second. |
| Your display name | Who is signed in. |
| **SIGN OUT** | Ends the session and returns you to the sign-in page. |

Both node counters turn amber when the number is short of the total. **ALERTS** turns red
when anything is critical, amber when the worst is a warning. Everything refreshes on its
own — node and alert counts poll every 15 seconds and also jump the moment the cluster
reports a node or job event, and the task count is driven by job events with the same poll
as a backstop. You should never need to reload a page to see a number move.

## The nav rail

A 48-pixel column of icons; hover any of them for its name. The section you are in carries
an accent-coloured left edge and a tinted background. In order down the rail:

1. **Nodes** — the cluster's machines, and where sign-in lands you.
2. **Apps** — what you have deployed.
3. **App Catalog** — what you can deploy.
4. **Metrics** — charts and history (needs *Metrics & logs* on in Settings).
5. **Storage** — disks and backup targets.
6. **Firewall** — WAN, rules, port forwards.
7. **Mesh** — mesh devices, keys, routes.
8. **Updates** — checking for and applying updates. Updates are always something you start.
9. **Tasks** — the job log: what ran, what is running, what failed.

Pinned to the bottom: **Alerts**, then **Settings**.

## Troubleshooting

**`NODES ON LAN` and `ON MESH` disagree.**
That is a real distinction, not a contradiction. `NODES ON LAN 6 / 7 · ON MESH 7 / 7` means
one machine is up and reachable over the mesh but its agent is not talking to the control
plane — so the control plane cannot drive, back up, or update it. Open **Nodes** and look for
the node marked `OFF BUS · on mesh`.

**`ON MESH` reads `—`.**
The control plane could not determine membership for every node, or no node has registered
yet. It reports "unknown" rather than a count that would quietly omit the nodes it could not
check.

**There is no Firewall icon.**
The cluster is in *Join my existing network* mode, where your own router does the
firewalling. The section is removed rather than shown as an empty set of controls.

**A strip under the top bar says first-run setup isn't complete.**
It appears on every page except first-run setup itself, with a **FINISH SETUP →** link, and
disappears as soon as first-run setup is finished. See
[Finish first-run setup](/docs/finish-first-run-setup/).

**One rail slot is greyed out and does nothing.**
There is nothing behind it. Skip it.
