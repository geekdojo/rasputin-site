---
title: "Check on a node"
description: "Read a node's state on the Nodes page and act on it — what ONLINE, OFF BUS and OFFLINE each send you to go and look at, plus reboot, ping and logs."
weight: 31
applies-to: "2026.08.5"
---

Signing in lands you on **Nodes**, the one screen that shows the whole cluster at once: a
honeycomb map on the left, one hexagon per machine, and **NODE CONTROLS** on the right for the
node you have selected. Each hexagon carries the node's id (truncated past ten characters), a
short role tag — `ctrl`, `fw`, `work`, `stor` — and a live CPU percentage refreshed every 30
seconds. Nothing here is a live console: it is a view of the cluster as the control plane sees
it, refreshed continuously, plus a small set of deliberate actions.

Throughout, `<node-id>` is a node's name in the cluster.

## Do this

1. **Read cluster health off the top bar, not off the map.** `NODES ON LAN` and `ON MESH` count
   the whole cluster. A hexagon's status dot is colored **only on the hexagon you have
   selected** — every other hex draws it neutral gray whatever that node's state.
2. **Click a hexagon to select it.** It outlines in the accent color and pulses, and its
   detail fills the controls panel, headed by the node's full id. Click it again to deselect;
   on arrival the page selects the center hex for you.
3. **Read the `LAN` row in `STATUS`** — the node's heartbeat presence: `ONLINE`, `STALE`,
   `OFFLINE`, or `OFF BUS · on mesh`. Hover it for the underlying timings.
4. **Read the `MESH` row.** Mesh membership is reported separately and independently:
   `JOINED <mesh address>`, `ABSENT — last seen …`, or `UNKNOWN`. A node can be `ONLINE` on the
   LAN and not on the mesh at all. Never read `UNKNOWN` as healthy.
5. **Glance at `UTILIZATION`** — `CPU` and `MEMORY` bars. The agent samples the host every 10
   seconds; this page re-reads the newest sample every 30 seconds, so a bar can be up to half
   a minute behind. Both read
   `—` when the node is `OFFLINE` or `OFF BUS`, rather than leaving the last sample sitting
   there looking live.
6. **Act, under `ACTIONS` and `DIAGNOSTICS`.** `REBOOT (OS)` asks the node's operating system
   to restart gracefully, and is enabled only while the node is `ONLINE`. `PING` asks the
   node's agent to answer over the bus — it proves the agent process is up and reachable, and
   nothing else. `VIEW LOGS` leaves this page for **Metrics**, filtered to this node with the
   logs tab selected (`/metrics?node=<node-id>&tab=logs`). `UPDATE` updates nothing from here;
   it takes you to the **Updates** page.
7. **Read `DEPLOYED APPS` as this node's list only.** It changes every time you select a
   different hexagon, and `— none —` is entirely normal on a control plane or a firewall. The
   cluster-wide list lives on the **Apps** page.

<!-- SCREENSHOT: dashboard.png — the Nodes page with one hexagon selected and the NODE CONTROLS
panel filled in. -->

## What the state words mean

The legend under the map lists seven words. Four describe a node's presence, one is reserved
and never shown, and two describe a slot. The node's agent sends a heartbeat every **10
seconds**, and every threshold below is measured from the last one the control plane heard.

**`OFF BUS` does not come after `OFFLINE` — it replaces it.** Once the heartbeat has stopped,
the control plane asks a second question: can the mesh still see the machine? The answer
decides which word you get, and that is the diagnostic value of the whole list — one of these
states sends you to the agent, the other sends you to the box.

| Heartbeat last heard | Mesh | State | Where to look |
| --- | --- | --- | --- |
| within 30 seconds | not consulted | `ONLINE` | nowhere |
| 30 seconds to 2 minutes | not consulted | `WARNING` / `STALE` | wait a minute |
| over 2 minutes | still sees the machine | `OFF BUS` | **the agent** |
| over 2 minutes | lost it, or cannot say | `OFFLINE` | **the machine** |

**`ONLINE`** (green) — a heartbeat arrived within the last 30 seconds, so the node has missed
at most two. Mesh state is irrelevant here: a node can be `ONLINE` and not be on the mesh at
all, which is exactly why `LAN` and `MESH` are separate rows.

**`WARNING`** (yellow) — nothing heard for 30 seconds to 2 minutes. The intermediate state, and
usually transient: a busy node, a brief network hiccup, a node part-way through a reboot you
asked for. If it clears on its own within a minute or two, nothing is wrong. It deliberately
never turns into `OFF BUS`, because three missed heartbeats is too little evidence to name a
cause. Note the wording differs between the two places it appears: the legend calls it
`WARNING`, while the `LAN` row in the controls panel spells the same state `STALE`.

**`OFF BUS`** (amber) — the heartbeat has stopped for over 2 minutes **and the mesh can still
see the machine.** Every node's agent holds a connection to the cluster's message bus on the
control plane, and heartbeats, metrics, logs, app deployments and update commands all ride it;
nodes separately join a private mesh network the control plane can also see. `OFF BUS` is what
the control plane says when those two disagree. **The machine is up and the network is fine —
go and look at the agent, or its configuration.** The `LAN` row reads `OFF BUS · on mesh`, and
hovering it gives you both facts at once, in the form "bus last heard *age* · mesh seen
*age*", so you never have to cross-reference the **Mesh** page. It also raises a critical
alert, which reads *"Node `<node-id>` is OFF BUS — Reachable over the mesh (seen … ago) but its
agent has not heartbeated for … ; restart the agent or check its log"*.

<!-- SCREENSHOT: alerts.png — the critical OFF BUS alert. -->

Because the bus is how the control plane drives a node, an off-bus node cannot be updated,
backed up or commanded, and reports no live CPU or memory. `PING` is the exception worth
knowing: it is *not* disabled on an off-bus node, so the button stays clickable and the job
simply fails. What still works is everything that does not go through the node's agent — you
can reach the machine yourself over the mesh, and its BMC power and console controls, if it has
them, are unaffected — see
[Whether your hardware has a console at all](/docs/open-a-serial-console/#whether-your-hardware-has-a-console-at-all).
The fix is to restart the agent on that node,
over SSH, over the mesh, or at its local console, and to read its log for why it dropped.

**`OFFLINE`** (gray) — the heartbeat has stopped for over 2 minutes **and** the mesh has lost
the machine too, or mesh membership could not be determined at all; an undetermined mesh never
upgrades a node to `OFF BUS`. As far as the control plane can tell, the machine is down: the
hexagon reads `OFFL` instead of a CPU figure, the panel blanks utilisation, and `REBOOT (OS)`
is disabled because there is nothing listening to ask. **Go and look at the machine** — power,
network, or a BMC power cycle.

**`UPDATING`** — listed in the legend and reserved in the code, but nothing in the shipped UI
ever puts a node into this state. You will not see it. Watch an update on the **Updates** and
**Tasks** pages instead.

**`PENDING`** (dashed accent, slowly pulsing) and **`OPEN BAY`** (dashed gray) are not node
states but slots: a slot reserved by an enrollment whose machine has not joined yet, and an
empty slot. See [Add a node](/docs/add-a-node/).

<!-- SCREENSHOT: a hexagon in WARNING and a hexagon in OFFLINE, each selected so its status dot
is colored, with the LAN row visible in the controls panel. -->

The two top-bar counters divide on the same question, and the asymmetry is useful: an off-bus
node is **excluded** from `NODES ON LAN` and **still counted** in `ON MESH`. So
`NODES ON LAN 6 / 7 · ON MESH 7 / 7` is the cluster-level signature of exactly one off-bus
node.

## Troubleshooting

**Every hexagon's status dot is gray except the one you clicked.**
That is the shipped behavior, not a fault: the dot is colored only on the selected hexagon.
Read cluster-wide health from `NODES ON LAN` and `ON MESH` in the top bar, and per-node health
from the `LAN` row in the panel.

**The hexagons moved.**
Positions are fixed by role and then by node id — the firewall takes the center, then the
control plane, then compute, then storage, then anything else alphabetically — and selecting a
node never moves anything. The one thing that shifts positions is the **number** of slots in
use: add or remove a node, or generate or cancel a pending enrollment, and the map snaps to
the smallest silhouette that holds them all and every hex re-seats.

**The legend says `WARNING` but the panel says `STALE`.**
Same state, two spellings. The legend under the map calls it `WARNING`; the `LAN` row in the
controls panel calls it `STALE`.

**You are waiting for a node to show `UPDATING`.**
It never will. Nothing in the shipped UI assigns that state. Follow an update on **Updates**
and **Tasks**.

**A node reads `OFF BUS · on mesh`.**
Its agent has dropped off the bus while the machine itself is still reachable — go to the
agent, not to the hardware. The panel also says so in its own amber box when you select such a
node. See [What the state words mean](#what-the-state-words-mean).

**A node reads `OFFLINE`.**
Go to the machine: power, network, or a BMC power cycle. `REBOOT (OS)` is disabled, because it
is a request sent over the bus and there is nothing listening to ask.

**A node you rebooted went `WARNING` and you are waiting for `OFFLINE`.**
A reboot that completes normally never reaches `OFFLINE` — that needs two minutes of silence,
and a normal reboot is usually back green inside a couple of minutes.

**The top bar's `NODES ON LAN` and `ON MESH` disagree.**
A real distinction, not a contradiction: `ONLINE` means the LAN heartbeat is current and says
nothing about the mesh. A count short on LAN but full on mesh is one or more off-bus nodes —
open the map and look for `OFF BUS · on mesh`.

**`DEPLOY APP` took you to the Apps page.**
That is what the button does. It does not open a deploy form and it does not pre-select the
node you had highlighted — you choose the target node there, in the deploy flow. Treat it as a
shortcut to **Apps**.

**An app you deployed is not in `DEPLOYED APPS`.**
That list is the apps on the selected node only. Select the node it actually runs on, or open
the **Apps** page for the cluster-wide list.

**A node keeps running out of space although its drive is large.**
Check `GROWPART` in `STATUS`. Rasputin's images ship a fixed-size data partition and grow it
to fill the drive on first boot; `SKIPPED` or `FAILED` — both drawn in yellow — mean that
never happened and the data partition is still at its small image size. `ALREADY-FULL` is the
healthy steady state. Confirm with the `STORAGE` row on the same panel: a total far below the
drive's real size settles it. Both rows are a boot-time snapshot, not a live gauge — use
**Metrics** for live disk fill.

**A `CONFIG FAULT` box appeared on a node.**
The node's own configuration file asked for something its agent refused — a misspelled value,
an unknown backend. The box names the setting, what it cost you in plain terms, the value that
was set and what was expected. Fix `/var/lib/rasputin/node.env` on that node and restart the
agent. The node is otherwise running and reachable; the named capability is simply off.

**`STORAGE` or `GROWPART` shows a word this page does not list.**
The agent checks the shape of the value, not its membership of a closed set, so a newer image
can introduce one. An unfamiliar word there means a newer image than this page documents, not
a fault.

**`HOSTNAME` does not match the node id.**
Often it does, but it is the machine's own hostname as the agent reports it: a firewall reports
`OpenWrt`, and the control plane reports the cluster name.

**`TYPE` reads `—`.**
The node's agent predates architecture reporting. The node is otherwise fine.
