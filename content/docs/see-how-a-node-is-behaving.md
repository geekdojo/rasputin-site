---
title: "See how a node is behaving"
description: "Read a machine's CPU, memory, disk, containers and logs on the Metrics page — and why the Nodes page and the Metrics page can show different numbers for the same node."
weight: 50
applies-to: "2026.08.5"
---

You think a machine is unhealthy, or you want to know what it has been doing. **Metrics** is
the fleet view — one card per node, the whole cluster on one screen — and clicking a card
opens everything Rasputin knows about that one machine.

`<node-id>` throughout is the identifier printed on a node's card.

<!-- SCREENSHOT: metrics.png -->

## Do this

1. **Open Metrics** from the nav rail. One card per node, sorted firewall first, then control
   plane, then compute, then storage — so the order stays put as nodes come and go.
2. **Read the summary strip** above the cards: nodes registered, how many are **ONLINE**, and
   **LAST WRITE** — how long ago the recording stack last accepted a sample.
3. **Scan the cards.** Each carries the node ID and a status pill (`ONLINE`, `STALE`, `OFFLINE`,
   or `OFF BUS · on mesh`), its role and hostname, **CPU** and **MEM** with a sparkline, and a
   footer giving its agent build, its OS image, and when it was last heard from.
4. **Set the range** top right — `LAST 15M` through `LAST 24H`, defaulting to `LAST 30M`. It
   drives every sparkline *and* the charts and logs inside the drawer.
5. **Click the card** for the node you care about. A drawer opens with four tabs: **METRICS**,
   **CONTAINERS**, **LOGS**, **ALERTS**. (A firewall node also gets an **IDS** tab — see the
   firewall chapter.) `Esc` closes it.
6. **METRICS** — four stacked charts over the selected range: **CPU %**, **MEMORY %**,
   **DISK %**, **MEMORY (BYTES)**. That is the whole tab.
7. **CONTAINERS** — every container the collector can see on that node, busiest first, with its
   image, a one-minute CPU average in cores, its memory, and when it last started.
8. **LOGS** — that node's container logs, newest first. Pick one container from the dropdown,
   type a case-insensitive regular expression into the grep box, and read.

**The cards are not a live ticker.** Samples arrive every ten seconds, but a card refetches only
when you change the range, when the set of nodes changes, or when you press **REFRESH**. The
status pills and **LAST WRITE** are the exception — they refresh on their own.

**OPEN IN GRAFANA** hands you to the full Prometheus-style stack underneath for anything these
pages are too small for; **IN GRAFANA** in the drawer header and **FULL SEARCH IN GRAFANA** at
the foot of LOGS do the same for one node and its logs. No second sign-in — Grafana is served
under `/observability/` on the control plane's own address, behind the session you already have.

<!-- SCREENSHOT: metrics-node-drawer.png -->
<!-- SCREENSHOT: metrics-node-logs.png -->

## Metrics & logs is a decision about what gets recorded and kept

Most of what the Metrics page draws needs **Metrics & logs** turned on (Settings → **METRICS &
LOGS**). Until you turn it on the cards still appear, with live status, role and hostname, but
every CPU and MEM value reads `OFF` and the page offers a **TURN ON** button.

This is an explicit opt-in because it is not a display preference. It starts recording your
cluster's activity to disk and keeps it.

**What it gives you.** History instead of a single live number: each node's CPU, memory and
disk over time, the container table, searchable logs across the selected range, the Grafana
dashboards, and the threshold rules that feed **Alerts**. Without it you still get node status,
tasks and the derived alerts — you just cannot ask what a number was an hour ago.

**What it does not give you.** It is not a retention *policy*. There is no size cap, no
retention setting, and no prune control anywhere in the UI. The recorded data grows for as long
as recording is on, at whatever rate your cluster's own chatter dictates, on the control plane's
data partition — the one charted as **DISK %**. The time-series side keeps a year by default,
but that default is not a ceiling you have set and not one you can change from these pages. The
only lever the UI gives you is on and off.

**The consequence of each choice.**

- **Leave it off.** Nothing is recorded. The Nodes page still shows live CPU and memory, so you
  keep the thirty-second view of every machine and lose the historical one. Nothing accumulates.
- **Turn it on.** Switching it on confirms first, then downloads roughly 500 MB the first time;
  expect a few minutes before charts fill in, and follow the job from the **Follow it in
  Tasks →** link rather than watching the page. From then on your cluster keeps a record of
  what every node was doing and what every container logged. Prefer a control plane with an SSD
  or NVMe drive over a memory card — this is a growing directory, not a fixed one.
- **Turn it back off.** Recording stops. Everything already recorded **stays on disk**, and
  turning it on again picks up where it left off.

**What you cannot take back.** Turning the switch off is not a delete — it stops the growth and
leaves the history. And a period you did not record cannot be recovered afterwards: turn
recording on in August and the charts begin in August, however long the cluster has been
running. If you expect to ever ask "was this normal last month?", the time to decide is before
the month you want to look at.

## Why the Nodes page and the Metrics page can disagree

This trips people up, so it is worth being precise: **the same node can show 4% CPU on the
Nodes page and 1% on the Metrics page at the same moment, and neither number is wrong.**

Both start from the same place. The agent on each node samples the host every ten seconds and
publishes that sample on the cluster bus. From there it takes two routes.

**Route one — the always-on ring buffer.** The control plane writes every sample straight into
a local SQLite store that keeps the last 24 hours. The Nodes page reads that store over the last
15 minutes and displays *the single newest sample in it*. This route does not depend on
**Metrics & logs** at all — it is why the Nodes page shows live CPU and memory on a cluster that
has never turned recording on. Its memory percentage is worked out in your browser from the used
and total bytes in that one sample.

**Route two — the time-series database.** When **Metrics & logs** is on, the control plane
*also* forwards each sample into VictoriaMetrics. The Metrics page asks that database for a
range resampled to roughly 120 evenly spaced points — the step is the range divided by 120,
clamped to no finer than 10 seconds and no coarser than 5 minutes — and the card shows the last
of those points, which is the value at the most recent step boundary rather than the newest
sample.

So the two differ in four ways that matter:

- **Freshness.** The Nodes page shows the newest sample in the ring buffer — but it asks for it
  only every 30 seconds, so what you are reading can be up to half a minute behind. The Metrics
  page shows the value at the most recent resampling boundary, which can be up to one step
  old — about 15 seconds at `LAST 30M`, and up to 5 minutes at `LAST 24H`. Which one is fresher
  therefore depends on the range: at `LAST 15M` or `LAST 30M` the Metrics page's point can
  easily be the newer of the two, while at `LAST 24H` the Nodes page wins by minutes. On a node
  whose load is moving, that alone is enough to make the numbers differ.
- **Smoothing.** Widen the range and each drawn point covers more ground. The same spike that is
  obvious at `LAST 15M` can be invisible at `LAST 24H` — not because the data is missing, but
  because you asked for a coarser picture.
- **Arithmetic.** For memory in particular, the two are not even computing the same way: one
  divides a raw pair of numbers in your browser, the other reads back a percentage the recorder
  stored. Expect them to land close, not identical.
- **Availability.** The ring-buffer write happens first and is never held up by the second. The
  forward into the database is best-effort. If the recording stack was down for a minute, the
  Nodes page still has that minute and the Metrics page has a gap.

And the histories are different lengths: the ring buffer holds 24 hours, while the time-series
database keeps a year by default — but only from the moment you turned recording on.

A useful rule of thumb:

- **Nodes page** — *what is this machine doing right now.*
- **Metrics page** — *what has this machine been doing.*

If you need one number you can quote, the Nodes page is the simplest place to get it — while
remembering it refreshes every 30 seconds, and that at a narrow range the Metrics page's last
point may be the newer reading. If you need to know whether a number is unusual, take it from
Metrics.

## Reading a node's containers and logs

Two columns in the CONTAINERS table are easy to misread.

**CPU is not a percentage and is not capped at 1.00.** `0.35` means the container used about a
third of one core averaged over the last minute; `2.40` on an eight-core node means about two
and a half cores — busy, but nowhere near saturating the machine. Compare it against the node's
core count, not against 100. Because it is a one-minute average, a container that spikes for
five seconds barely registers; the CPU chart on the METRICS tab is the better place to see short
spikes.

**STARTED is a stand-in for a restart count, which is not collected.** The table's own footnote
says so:

```
CPU is a 1-minute average; 1.00 = one full core. STARTED is the container's last start time — a stand-in for a restart count, which isn't collected yet.
```

What that means in practice: a container that has been crash-looping shows a recent start time
while its neighbours show days, which is a real signal — but a container that crashed and
restarted twice an hour ago looks identical to one that started cleanly an hour ago. The column
can also be wrong in the other direction: a value plainly older than the cluster itself —
hundreds of days on a machine you flashed last month — is a collector artifact, not a fact about
that container. Read the column as a hint. Much younger than its neighbours means "worth
checking the logs"; absurdly old means nothing at all.

**On a control-plane node, the containers listed are Rasputin's own machinery, not your apps.**
`rasputin-victoriametrics` and `rasputin-loki` store the recorded metrics and logs,
`rasputin-grafana` serves the dashboards, `rasputin-alloy` is the collector that ships to them,
`rasputin-vmalert` evaluates the built-in threshold rules, and `rasputin-headscale` coordinates
the cluster mesh. All but the mesh one appear once **Metrics & logs** is on. They are supposed
to be there; do not stop them, and do not go looking for your installed apps here. Your own
workloads show up on a **compute** node, alongside `rasputin-obs-collector` — the
per-node collector Rasputin deploys and keeps converged. A **firewall** node has no container
runtime at all, so the tab reads `NO CONTAINERS REPORTING`, which is correct rather than broken.

In the LOGS tab, the container dropdown lists every container currently running on the node
*plus* anything that logged during the selected range — so a quiet-but-running container is
still selectable and one that has since exited is still findable. The grep box takes a
case-insensitive regular expression, applied about a third of a second after you stop typing.
Lines written to standard error are drawn in red. A footer reads `N of M shown · range <range>`;
up to 200 lines are displayed out of the matches fetched. There is no live tail — press
**REFETCH**, or change a filter.

### Worked example: an app stopped answering

1. Open **Metrics**, set the range to `LAST 30M`, and click the `<node-id>` card.
2. On **CONTAINERS**, find the app's container. If **STARTED** reads a couple of minutes ago
   while everything else reads days, it has restarted recently — that is your thread to pull.
3. On **LOGS**, pick that container from the dropdown. You now have only its lines instead of
   every container on the node interleaved.
4. Type a broad term into the grep box — `error|panic|fatal` is a good first pass.
5. Nothing? Clear the grep and widen the range to `LAST 1H`. A container that died quietly often
   says why in its last few lines *before* the restart, which may be outside a 30-minute window.
6. Still nothing useful, or too much to read here — **FULL SEARCH IN GRAFANA**.

The filters compose: container *and* grep *and* range at once. Narrowing to one container first
is almost always the fastest move.

## Troubleshooting

**Every CPU and MEM value reads `OFF`.**
**Metrics & logs** is not on. Turn it on in Settings, or from the page's **TURN ON** button, and
read the section above first — it starts recording to disk and there is no prune.

**Metrics is on but the charts are empty.**
The first start downloads roughly 500 MB. Give it a few minutes and follow the job from **Follow
it in Tasks →**. `NO DATA YET` under a chart means that series has nothing in the window yet.

**A number is not moving.**
The cards do not poll. Press **REFRESH**, or change the range.

**`LAST WRITE` is climbing into minutes while nodes are still `ONLINE`.**
The nodes are fine and the recorder is not — that slot is the honest health check for the
recording stack itself. On a healthy cluster it sits at a handful of seconds. Before the stack
is up it reads `NOT RECORDING`, `STARTING…` or `WAITING FOR FIRST WRITE` instead.

**A chart has gaps in the line.**
Gaps are drawn as breaks, not as zeroes, so a gap means no samples reached the database in that
window — most often the recording stack was down for a while. The forward into it is
best-effort; the Nodes page's ring buffer will still have that period.

**`DISK %` looks wrong compared with what `df` says.**
It charts the node's persistent data partition, not `/`. On the appliance `/` is a read-only
system image that is ~100% full by design; charting it would be misleading and useless. What you
see is the partition that actually fills up — container data, app volumes and recorded history.

**You suspect a memory leak but the percentage looks flat.**
Use **MEMORY (BYTES)** at `LAST 24H`. A percentage flattens the difference between a node steady
at 40% and one that has crept from 38% to 41% over six hours.

**A node reads `OFF BUS · on mesh`.**
The machine is reachable over the mesh but its agent has stopped talking to the control plane —
a different problem from a dead machine. The control plane cannot drive, back up or update it
until the agent is back.

**A link you copied to the drawer opened the wrong tab.**
Deep links are per-node, not per-tab. The address bar understands
`/metrics?node=<node-id>&tab=<tab>` and will open the drawer on the tab you name, but switching
tabs inside the drawer does not update the address bar — so a link you copy after clicking
around reopens the node on whichever tab the link *originally* named, usually METRICS. Build the
link by hand if the tab matters, and expect a bookmark of the drawer to land on the node rather
than the view.

**The LOGS tab came back empty.**
`NO ENTRIES IN RANGE` means the window itself is empty — widen the range. `NO ENTRIES MATCH
FILTER` means the window has lines and your filter excluded them — loosen the expression.

**A container's `STARTED` reads hundreds of days on a machine you flashed last month.**
A collector artifact. Ignore that value; it says nothing about the container.
