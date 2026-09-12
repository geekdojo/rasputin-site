---
title: "Watch what the cluster is doing"
description: "Every change to the cluster runs as a recorded job — how to read the queue, tell normal reconcile churn from trouble, and find the step and the command output a failure actually came from."
weight: 52
applies-to: "2026.08.5"
---

Every operation that has to touch a node becomes a **job**. Deploying an app, applying a
firewall rule, enrolling a node, turning on metrics, taking a backup — none of it happens as a
side effect of a button press. The button submits a job, the job runs as a series of recorded
steps, and the result is kept.

**Tasks** (nav rail → **Tasks**) is where you watch that happen, and it is the most useful page
in the product when something has gone wrong: "why did that fail?" almost always has a literal,
recorded answer here.

`<node-id>` throughout is the identifier printed on a node's card.

<!-- SCREENSHOT: tasks.png -->

## Do this

1. **Open Tasks.** The title is the summary: `TASK QUEUE — N RUNNING · N QUEUED · N FAILED`,
   counted over the jobs currently listed. On a healthy, idle cluster all three are zero.
2. **Read down the table**, newest first. Each row gives you the **JOB** id truncated to eight
   characters, the **KIND** of job (`apps.reconcile` and the like), its **STATUS** (`QUEUED`,
   `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`), the **NODE** it targets, when it **STARTED**,
   and its **DURATION** — or `running`.
3. **Click the row you care about.** It expands, in this order: the job's error if it failed; a
   per-app breakdown if a backup failed for specific apps; the **STEPS** the job ran, each with
   its status, its retry attempt if it retried, and its result or error; and the **EVENTS**
   timeline. An expanded job updates live as it runs.
4. **Read the failing step, not the row.** "The deploy failed" is the row. The step that failed
   and the command output it failed with — `push` reporting `docker compose up: exit status 1`
   and Compose's own complaint underneath it — is inside it. This is the level worth reaching
   for.

Two details that catch people out. **STARTED is your browser's local time while the clock in the
top bar is UTC** — worth remembering before you correlate a job against a log line. And job ids
are ULIDs, so they sort by time: jobs created close together share a long prefix, and eight
characters may not be enough to tell them apart by eye.

**PING NODE**, to the right of the heading, is the smallest possible end-to-end test: it submits
a `diag.ping` job to one node and the job appears in the table like any other, telling you
whether the control plane's bus reaches that node's agent and whether the agent answers. Type
the exact node ID. **The box comes pre-filled with `node-dev`**, a development placeholder that
is almost certainly not a node on your cluster — replace it, or you will queue a ping at a node
that does not exist.

## What is not a job

Not every button leaves a trace here, and it is worth knowing which. Changing an app's `LAN
ACCESS` toggle, pressing `CHECK NOW` on the catalog, and acknowledging or dismissing an alert
are all direct writes that take effect immediately. So is the ledger row an install creates —
only the *deploy* that follows it is a job. If you went looking for one of those on this page
and found nothing, nothing went wrong.

## Normal churn, and what is not

Rasputin continuously reconciles: it re-derives what each subsystem should look like and fixes
any drift, rather than assuming a change you made an hour ago is still in place. So a healthy
cluster produces a steady stream of successful jobs all by itself. This is the single most
common "is something wrong?" question about this page, so here is what normal looks like:

| Kind | Roughly how often | What it does |
|---|---|---|
| `firewall.reconcile` | Every 5 minutes | Re-applies the intended firewall configuration. |
| `firewall.dns_forward` | Every 5 minutes | Keeps the control-plane-managed DNS forward pointed at the right address. |
| `apps.reconcile` | Every 5 minutes | Checks installed apps against their intended state. |
| `mesh.reconcile` | Every 5 minutes | Converges mesh enrollment and routes. |
| `storage.reconcile` | Every 5 minutes, while a backup target is claimed | Health-checks the claimed target, including a write probe. |
| `obs.collectors.reconcile` | Every 5 minutes, once metrics are on | Makes sure each eligible node is running its collector. |

They are staggered rather than fired together, so they arrive spread across each five-minute
cycle instead of stampeding. Alongside them you will see occasional one-offs: an
`obs.collectors.deploy_node` when a collector needs installing or refreshing, an hourly backup
*check*, a daily certificate rotation sweep. Reconcile jobs finish in well under a second, so
catching one `RUNNING` is luck rather than a sign of load.

So: **a wall of `SUCCEEDED` reconcile jobs at a steady five-minute rhythm is the cluster working
correctly.** What is worth your attention is anything else —

- a `FAILED` row of any kind;
- the same reconcile kind failing repeatedly — drift it cannot fix;
- a job stuck in `RUNNING` far longer than its neighbours of the same kind;
- a kind you recognize as something *you* triggered, sitting in `QUEUED`.

## The window is about forty minutes wide

The table shows the most recent **50 jobs** and there is no pagination — older jobs exist, but
there is no way to page back to them from this screen. With six reconcile kinds firing every
five minutes, an idle cluster produces around seventy jobs an hour, so 50 rows is roughly the
last forty minutes of cluster life. **If you are looking for something from this morning, you
will not find it here.**

There is also no filtering or search of your own. The only filter is the one a link can apply:

- **From [Alerts](/docs/respond-to-an-alert/)**, clicking a failed-job alert opens this page focused
  on that job — scrolled into view, flashed once, and already expanded.
- **From an app**, the link filters the table to that app's jobs and shows a `filtered to app …`
  note with a **SHOW ALL** button to clear it.

Those two links are the practical way to reach an older job: arrive at it from the thing that
went wrong, rather than scrolling for it.

## Troubleshooting

**The page is a wall of jobs and you cannot tell if that is bad.**
Check the kinds. A steady five-minute rhythm of `*.reconcile` rows, all `SUCCEEDED`, is the
cluster reconciling itself and is what health looks like here. Look for `FAILED`, for a kind
failing over and over, or for a row stuck in `RUNNING`.

**The job you are looking for is not in the table.**
Either it has aged out of the 50-row window — roughly forty minutes on an idle cluster — or it
was never a job. See *What is not a job* above. If it was a failed job within the last day, it
also raised an alert; click through from **Alerts** and the page will land on it.

**A row says `FAILED` and the message is not enough.**
Expand it. The row's error is a summary; the **STEPS** list names the step that failed and
carries its result or error, which is usually the underlying command's own output. **EVENTS**
gives you the timeline.

**The same reconcile kind keeps failing.**
That is drift the cluster cannot correct on its own — it is trying every five minutes and losing.
Expand the most recent one and read the failing step; the subsystem named in the kind
(`firewall`, `apps`, `mesh`, `storage`, `obs`) tells you where to look next.

**A job's `NODE` column reads `—`.**
Either it is cluster-wide work with no single target, or it is an app job whose app has since
been removed. The node is read off the app's record, and once that record is gone nothing
recovers it.

**A job timestamp does not line up with a log line.**
**STARTED** is rendered in your browser's local time; the clock in the top bar is UTC. Convert
before you conclude they are minutes apart.

**A job is running and you want to stop it.**
You cannot from this screen — there is no cancel control. Once submitted, a job runs to
completion or failure.

**Your PING NODE job targeted a node that does not exist.**
The box ships pre-filled with `node-dev`, a development placeholder. Clear it and type the exact
`<node-id>` from the node's card.

**You pressed a button and no job appeared.**
Some actions are direct writes rather than jobs — an app's `LAN ACCESS` toggle, the catalog's
`CHECK NOW`, acknowledging or dismissing an alert, and the ledger row an install creates. They
take effect immediately and leave no row here.
