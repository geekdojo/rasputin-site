---
title: "Respond to an alert"
description: "The ALERTS badge turned red — what raised it, what clicking a row does, which alerts you can acknowledge and which you can only fix, and what the page will never tell you."
weight: 51
applies-to: "2026.08.5"
---

**Alerts** is the one place that says "look here first". It is a single list: everything the
control plane currently considers a concern, most severe first and, within a severity, oldest
first. Reach it from the **ALERTS** tile in the top bar, or from the bottom of the nav rail.

`<node-id>` throughout is the identifier printed on a node's card.

<!-- SCREENSHOT: alerts.png -->

## Do this

1. **Read the top-bar tile** to know the shape of the problem before you open anything. It is
   severity-honest and never reports a warning while something critical is outstanding: `NONE`,
   `N CRIT`, `M WARN`, or `N CRIT · M WARN` coloured for the critical count.
2. **Open Alerts.** The heading spells out both counts. The list re-reads itself every 15
   seconds and also on node and job events, so it keeps up without a reload.
3. **Read the worst row.** Each carries a severity badge (`CRIT` or `WARN`, with a coloured left
   edge), an icon for where it came from, a title, a detail line, and how long the condition has
   been true.
4. **Click the row.** Most rows point somewhere and take you straight there — a node alert to
   **Nodes** with that node selected, a job alert to **Tasks** expanded on that job, a setup
   alert to first-run setup. An app alert lands you on the **Apps** table unfiltered; find its row
   yourself.
5. **Fix the thing the alert describes.** That is the whole response. Almost every alert here is
   re-derived from live state every time the page is read, so it disappears on its own the
   moment the condition stops being true. There is nothing to clear.
6. **If you want to silence a threshold alert rather than fix it**, open the node's drawer from
   **Metrics** ([See how a node is behaving](/docs/see-how-a-node-is-behaving/)) and use its
   **ALERTS** tab. **ACK** and dismiss live there and nowhere else — see below.

## What actually feeds the list

Nothing is "raised" and stored waiting for you. With one exception, the list is **derived from
scratch every time it is read**, by asking the subsystems that already know:

| Source | Raises | Severity |
|---|---|---|
| **Nodes** | A node that is offline, or reachable on the mesh but off the bus | CRIT |
| **Nodes** | A node whose heartbeat has gone stale | WARN |
| **Tasks** | Each job that failed in the last 24 hours | WARN |
| **Apps** | Each app whose last known status is failed | WARN |
| **Backups** | An app whose data has not been captured within its schedule | WARN, or CRIT for an app classed critical |
| **Backups** | An app holding critical data with no backup target claimed or the schedule off | WARN |
| **Backups** | A claimed backup target that failed its health check | CRIT |
| **Setup** | First-run setup not finished | WARN |
| **Security** | The node bus running with authentication off | WARN |

The 24-hour cut-off on failed jobs is deliberate: past a day a failure is history and belongs on
the Tasks page, not in a banner.

**The one exception is threshold alerts**, and they work the other way round. When **Metrics &
logs** is on, the stack runs a rule evaluator against the recorded metrics and posts what fires
back to the control plane, where it *is* stored. You do not opt into the rules separately —
three of them ship on and evaluating:

| Rule | Fires when | Severity |
|---|---|---|
| **NodeDown** | No metrics have arrived for five minutes, and that stays true for a further five — so about ten minutes of silence before it fires | CRIT |
| **HighCPU** | A node's CPU stays above 90% for 5 minutes | WARN |
| **DiskAlmostFull** | A node's data partition passes 85% for 5 minutes | WARN |

So this list has a real rules engine behind it with persisted state, and that is the part worth
knowing when you are reading a row: a derived row is a statement about right now, and a
threshold row is a record of something that fired.

## What you can and cannot do about a row

**Derived alerts have no acknowledge.** There is no "I know" for a stale node. Fix the node and
the row leaves; until then it stays, because the page is reporting the node rather than
remembering it.

**Threshold alerts carry ACK and dismiss — but only on a node's ALERTS tab.** Those controls
exist in exactly one place in the UI: the **ALERTS** tab of the node drawer, reached by clicking
the node's card on **Metrics**. They are not on the Alerts page. So the page that shows you
every alert is not the page on which you can act on one, and acting on one means knowing which
node it belongs to and going there.

**Which, for the one CRIT rule, you cannot.** **NodeDown** looks for the *absence* of a metric,
and an absence carries no node label — so the alert it produces has nothing identifying the node
attached to it. Its row on the Alerts page is not clickable, it appears on no node's ALERTS tab,
and there is nowhere to acknowledge or dismiss it. It tells you only that *some* node has gone
quiet. The derived node alerts are the better signal for the same condition, because they name
their node: use the `OFFLINE` and `STALE` pills on the node cards to find out which machine it
is. (The rule's own summary text says five minutes; ten is what it actually does.)

**A genuinely dead node therefore produces two rows, one problem.** The derived alerts follow
the node's own state thresholds, not the moment the heartbeat stops: a `WARN` stale alert at
thirty seconds of silence, then the `CRIT` node-offline alert at two minutes. If the mesh
still sees the machine, that `CRIT` row reads `OFF BUS` instead of offline — same alert, more
evidence. **NodeDown** then fires about ten minutes later from the other direction. The two
are not de-duplicated against each other. Read them as one event.

**You cannot author a rule.** The three are fixed; this release has no UI for editing a threshold
or adding a rule. Two screens' empty states end with the words *"or when it crosses a threshold
you've set"* — on the Alerts page and on a node's ALERTS tab. Read that as "a threshold",
because there is nowhere to set one. It is describing an intent, not a control you have.

**There is no history.** When a condition clears, its derived alert is simply gone — no record
that it happened, no log of when it started or stopped. A node that went stale overnight and
recovered leaves nothing behind on this page. Use [Tasks](/docs/watch-what-the-cluster-is-doing/)
for job failures and a node's logs for anything else, and if an alert matters, capture it while
it is on screen.

**And nothing is sent anywhere.** No email, no push, no webhook. This page, the top-bar badge
and the per-node ALERTS tab are the whole delivery mechanism. You have to look.

## Troubleshooting

**The badge is red but the page shows nothing you recognise.**
Sort order is severity first, then oldest first, and there is no filtering, search or sorting of
your own — you get the whole list in a fixed order. Read down from the top.

**A CRIT row will not click.**
It is **NodeDown**, which has no node attached to point at. Go to **Metrics** or **Nodes** and
find the node whose pill reads `OFFLINE` or `STALE`.

**The same dead node appears twice.**
Expected. One row is derived from the node's missing heartbeat, the other is the **NodeDown**
rule noticing the missing metrics about ten minutes later. They are not de-duplicated.

**You cannot find ACK anywhere on the Alerts page.**
It is not there. Open the node from **Metrics** and use the drawer's **ALERTS** tab. Derived
alerts have no ACK at all, and **NodeDown** reaches no node's tab.

**A node's ALERTS tab reads `NO ACTIVE ALERTS` while the Alerts page shows a CRIT.**
The tab shows only alerts that name *this* node. An alert with no node label — **NodeDown** —
appears on no tab.

**Clicking an app alert dumped you on the whole Apps table.**
The link does not yet select or open the app it came from. Find the app's row yourself.

**An alert you were looking at vanished while you read it.**
Derived alerts are re-derived on every read and disappear the moment the condition stops being
true. There is no history to check it against, so if you need the detail, capture it before you
walk away.

**You turned Metrics & logs off and the threshold alerts stopped.**
The rule evaluator runs as part of the observability stack. With recording off there are no
recorded metrics to evaluate, so **NodeDown**, **HighCPU** and **DiskAlmostFull** stop firing.
The derived alerts in the table above are unaffected — they never needed recording.

**An empty page and an empty badge read differently.**
The badge says `NONE`; the page heading always spells out both counts, `0 CRIT · 0 WARN`
included. Same state.
