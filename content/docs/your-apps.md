---
title: "Your apps"
description: "The Apps list and the detail drawer: reading an app's status, opening it, the keys you give it, and the two addresses every app gets — plus what the LAN ACCESS toggle really controls."
weight: 41
applies-to: "2026.10.5"
---

**Apps** is the ledger of everything your cluster has been told to run — one row per app,
running or not. The header counts them, `APPS — <N>`, and `ADD APP` beside it goes to the
[App Catalog](/docs/install-an-app/), which is where every new app comes from.

`<app>` below is an app's instance name. `<cluster-id>` is your cluster's own identifier,
which the drawer prints in full — use its `COPY` button rather than typing it.

<!-- IMAGE: /img/ui/apps.png — the Apps table with a RUNNING row and its action buttons -->

## Do this

1. **Click the `Apps` icon**, second on the nav rail. Each row carries the app's `NAME`, the `TARGET` node it
   runs on (chosen at install and fixed thereafter), its `STATUS`, and the clock time of the
   last deploy.
2. **Read the status.** `RUNNING` is green. `DEPLOYING`, `STARTING` and `STOPPING` are amber
   and mean an operation is in flight. `FAILED` is red and carries a detail saying why.
   `STOPPED` and `UNKNOWN` are gray. The list updates itself over a websocket and polls as a
   backstop, so you should not need to reload.
3. **Press `OPEN` to use the app.** It appears only when the app is `RUNNING` *and* declares
   a web page, and it opens the app itself in a new tab. An app with no web page — a
   database, a game server — never offers it.
4. **Click the app's name for the detail drawer**, which is where its addresses, its backup
   state and the publisher's own guidance live.
5. **Act on the app from its row**: `DEPLOY` (or `START`, once it has run before) brings its
   Compose stack up on its target node, and `STOP` and `DELETE` are covered in
   [Stop or delete an app](/docs/stop-or-delete-an-app/).

Two backup badges can appear beside a name, never both at once. `OVERDUE · 9d` (red) means this app
has something worth backing up and the backup did not happen — hover it for the recorded
reason, click it for **Storage**. `NO BACKUP TARGET` (amber) means the app has data worth
keeping and the cluster has nowhere to put it. **Apps whose backup did not happen are listed
first**, ahead of everything else; a missed backup is meant to be the first thing you see.

<!-- IMAGE: /img/ui/app-detail.png — the app detail drawer, showing ACCESS and the LAN ACCESS toggle -->

## The two addresses

**What they are.** An app that declares a web page gets two addresses, and the drawer lists
both with a `COPY` button each:

```
https://<app>.<cluster-id>.internal
https://<app>.lan.<cluster-id>.internal
```

These are not two views of one name. They are **two distinct fully-qualified names, one per
network**, and each has exactly one answer everywhere — rather than have one name resolve
differently depending on who is asking, the network is encoded in the name itself.

- The **bare** name is the **tailnet** name — the word the UI uses for the cluster's own mesh
  network. It is answered by the cluster's mesh DNS and resolves to the target node's tailnet
  address, so it works from any device that has joined the cluster's mesh. On a plain LAN
  client it does not resolve at all, which is correct: a LAN client could not route to a
  tailnet address anyway.
- The **`.lan.`** name is the LAN name. It is answered by the control plane's nameserver,
  resolves to the target node's LAN address, and **exists only while `LAN ACCESS` is on**.

Both are HTTPS. The node runs a local reverse proxy that terminates TLS with a certificate
minted from the cluster's own certificate authority and fronts the container, so you reach
the app at a real name with no port number attached.

**What they do not give you.** Neither is a way to reach your apps from away from home —
that is not something Rasputin claims. Which one `OPEN` hands you follows how you reached the
control plane: browse it over its LAN name and you get the app's `.lan` address, browse it
over the tailnet and you get the tailnet one. The drawer lists the tailnet address always and
the `.lan` address only while the toggle is on. While the app is stopped both links are
dimmed with a hint to deploy it first — the names are real, but nothing is listening. An app
with no web page shows `This app doesn't expose a web port.` instead; it is still reachable
at its names, on its own port, with whatever client it expects.

## `LAN ACCESS`

**What it controls.** The app's LAN *name*, and the route the node's reverse proxy keeps for
that name. Off is the default, and the toggle is live — you can change your mind on an app
that is already running and holds data.

- **Off — `Tailnet only`.** The app has only its tailnet name. No `.lan` record is published
  and the proxy has no LAN route to the app, so nothing answers for
  `https://<app>.lan.<cluster-id>.internal`.
- **On — `Reachable on your LAN`.** Adds the `.lan` name and the proxy's LAN route for it.
  The app stays reachable over the tailnet as well; this adds a name, it does not move the
  app. The toggle has no bearing on the tailnet name, which is always published for an app
  with a web port.

Turning it back off withdraws that name. In the UI's own words: *"Turn this off to withdraw
it — the app and its data stay put."* Nothing is stopped and nothing is deleted.

**What it does not protect.** It is a DNS and proxy-routing control, **not a firewall, and
not privacy.** An app's Compose stack publishes its own host port, and Rasputin copies that
stack onto the node exactly as the tile wrote it — so the container's port is bound on every
interface of the target node, and nothing in Rasputin filters it. Anyone already on your LAN
who knows the node's address and the app's published port reaches the app directly at
`<node-address>:<published-port>`, whatever this toggle says, bypassing the proxy and its
TLS. The install drawer lists a tile's declared ports, so you can see before you install what
a tile will publish.

So turning the toggle off removes the convenient name; **it does not make the app unreachable
from your LAN.** Treat an app's data as reachable by anyone on the same LAN as its node, and
put anything that must not be — a password vault, say — on a network whose access you
control.

**What you cannot take back.** The toggle itself: nothing, in either direction. Turning it on
again restores the name, and the app and its data are untouched either way. What the toggle
cannot take back is reachability it never controlled, which is the whole of the paragraph
above.

Occasionally the toggle saves but reports that the proxy certificate could not be re-issued
yet. The name stops resolving immediately and the proxy catches up on its next rotation; the
drawer tells you so rather than pretending the change was clean. If the save fails outright
the toggle reverts — it never sits there claiming a change that did not happen.

## The rest of the drawer

At the top: the status badge, the node the app is on, and — if the last operation left a
detail message — that message **unabridged** under `FAILURE` (red) or `LAST DETAIL`, with a
`VIEW TASKS` button that opens **Tasks** filtered to this app.

- **`BACKUP`** is one sentence about whether this app is backed up, in every state, from
  `Backed up 4h ago.` through `OVERDUE — never backed up.` to
  `Nothing to back up — no volume of this app is classed critical or state.` Where the control
  plane recorded a reason it appears underneath. `VIEW BACKUPS` opens **Storage**, where the
  runs table names every run and what it captured.
- **`SECRETS`** holds the keys the app's tile asks you for, one write-only field each. It is
  covered in [The keys you give an app](#the-keys-you-give-an-app-secrets) below.
- **`DATA` → `RESTORE DATA FROM A BACKUP…`** is offered for apps installed from a catalog
  tile, because only a tile classifies what its volumes hold. It is covered in full in
  [Restoring one app's data](#restoring-one-apps-data) below.
- **`FIRST RUN`** and **`ABOUT`** come from the app's catalog tile, not from Rasputin — the
  publisher's one-step note for the moment the app comes up, and the longer description with
  a link to the upstream project for the app's own documentation. An app you created from
  your own Compose stack has no tile, so the drawer reads
  `Custom app — no catalog guide. Manage it from the table.`

`BACK TO CATALOG` at the bottom returns you to the App Catalog.

## The keys you give an app (`SECRETS`)

Some apps use an account you hold with a third-party service, such as an API key for a data
feed. The app's tile names each key, and you set them in the app's drawer.

1. **Click the app's name** on the **Apps** page to open its drawer.
2. **Find `SECRETS`.**
3. **Type the value** into the key's field.
4. **Press `SAVE`.**

On a `RUNNING` app the drawer says `Saved. A redeploy has started so the app picks up the change.`,
the key reads `SET`, and `VIEW TASK` opens the redeploy.

- A field you leave blank keeps the value already stored.
- An app that is not `RUNNING` or `FAILED` is not redeployed. The drawer says
  `Saved. It takes effect the next time the app is deployed.` Deploy it from its row.
- Saving a value redeploys a running app even when the value is the one already stored.

**What it protects.** A key is write-only. Once saved, no screen and no API response returns
its value, not even to you: the drawer shows only `SET` or `NOT SET`. The field is a password
field, and it clears after a save. The stored keys are part of the cluster backup, so
restoring the cluster brings them back.

**What it does not protect.**

- The app receives the value as an environment variable. Root on the node can read it, and so
  can the app, which does what it likes with it.
- So can any other app on the same node that can reach the container runtime: a
  `HOST-TRUSTING` tile (see
  [Consenting to what an app asks for](/docs/install-an-app/#consenting-to-what-an-app-asks-for)),
  or a custom app whose Compose gives it that access (see
  [Your own Compose stack](/docs/install-an-app/#your-own-compose-stack)).
- The keys live in the cluster's secret store, and its limits apply; see
  [what the secret store protects, and what it does not](/docs/set-up-backups/#the-secret-store-what-it-protects-and-what-it-does-not).

**The consequence of each choice.**

- An optional key left unset: the app gets an empty value and still deploys.
- A required key left unset: the deploy is refused, naming the key, and any containers
  already running are left as they were.
- A key saved on a running app: the app is redeployed once to pick it up.

**What you cannot take back.** You can replace a key's value, but you cannot clear it back to
unset. Deleting the app deletes its stored keys, whether you keep its volumes or not, so
reinstalling it means typing them again.

A tile can also have the cluster create a password for the app's own use, such as one the app
shares with its own database. Nobody types it or sees it, and it does not appear under
`SECRETS`.

## Restoring one app's data

Open **Apps**, select the app, and choose **`DATA` → `RESTORE DATA FROM A BACKUP…`** from its
drawer. It is explicit, per app, and operator-initiated — nothing is ever restored
automatically. It is offered only for apps installed from a catalog tile, because only a tile
classifies what its volumes hold, and it puts data into an existing install: it never creates
one.

This is the per-app half of recovery. The cluster-level half — the control plane's database,
your passkeys and the mesh — is a separate flow on a separate page, and it never touches app
volumes; see [Restore a cluster](/docs/restore-a-cluster/).

**What it protects.** Your live volumes, right up to the last answer. The flow is a request,
not an action: a dialog asks which backup, then the archive key, then a confirmation whose
checkbox starts unticked, and **nothing is stopped or replaced until all three are answered.**
The archive secret is asked for here even though you are already signed in, so a signed-in
session is not on its own enough to replace an app's data. And the replacement is not a
delete: the previous contents of each replaced volume are **kept beside the volume on the node**
rather than removed, so the swap is reversible by hand.

**What it does NOT protect.** Its scope is one app and nothing wider, and it makes no judgment
about which copy is better:

- It replaces **that one app's data volumes, on the node hosting that app, from the generation
  you pick.** It does not touch any other app, the control plane's own identity, or volumes the
  generation does not hold.
- **It does not compare ages.** Rasputin does not check whether what is on the node is newer
  than what is in the generation. In many recoveries it is, and the right answer is to restore
  nothing. That comparison is yours to make before you start.
- It is not a repair for an app that is gone. With the app not installed there is nothing to
  restore into.

**The consequence of each available choice.**

- **Cancel at any of the three prompts.** Nothing is stopped and nothing is replaced. The
  refusals below are shown *before* you are asked for a secret.
- **Pick a generation.** You get exactly what that generation holds for this app. A generation
  that holds nothing for it is refused rather than applied as an empty restore.
- **Tick the confirmation and submit.** The app is stopped while each volume is exchanged and
  started again immediately after, so plan for the app being down for the length of the swap.
- **Restore nothing.** A real choice, and the correct one whenever the node's own copy is the
  freshest copy you have.

It refuses — and changes nothing — when the app is not installed, when the hosting node is
offline, or when the generation holds nothing for that app.

**What you cannot take back.** The exchange itself. There is no undo control: the previous
contents are set aside beside each volume on the node, so putting them back is a manual
operation on that node rather than a button here. The app's downtime during the swap is also
spent — it is short, but it is real, and it lands on whatever was using the app at the time.

## Troubleshooting

**A deploy is refused with `This app needs secrets that only its owner can supply`.**
A required key is not set, and the message names it. Set it under `SECRETS` in the app's
drawer, then deploy the app again.

**You saved a key and nothing changed.**
The app was not `RUNNING` or `FAILED`, so the save started no redeploy. Deploy the app from its
row.

**There is no `SECRETS` section in the drawer.**
Either the app's tile asks for no keys, or it is a custom app, which has no tile to ask for
them. Or the app was installed before its tile asked for keys: the drawer's `FIRST RUN` note
can still tell you to use `SECRETS`, because that note comes from the current tile. Press
`UPGRADE…` under `COMPOSE`. When the upgrade has finished, close the drawer and open it again,
and the section is there.

**The app never becomes `RUNNING`.**
Read the `STATUS` detail. The table clips a detail longer than 36 characters to its first 33
and an ellipsis, so hover it for the whole line, or click the app's name to open the drawer for it unabridged and
press `VIEW TASKS` — the task run that produced it is where the full command output lives.

**There is no `OPEN` button.**
Either the app is not `RUNNING`, or it does not declare a web page. A custom app never gets
one.

**`https://<app>.lan.<cluster-id>.internal` does not resolve.**
`LAN ACCESS` is off for that app, so the name was never published. Turn it on in the drawer,
or use the tailnet address from a device on the mesh.

**The app's name does not resolve anywhere on your network.**
The `.lan` name is answered by the control plane's nameserver, and your devices have to be
pointed at it — that is the **Network DNS** setting, and your router has to point at the
control plane. See [Settings](/docs/settings/).

**Your passkey works but an app's page shows a certificate warning.**
The app's certificate comes from the same cluster authority as the control plane's. A device
that trusts one trusts the other, so this is a device that has not had the authority
installed — see [Get in the first time](/docs/get-in-the-first-time/).

**`LAST DEPLOYED` shows a time of day with no date.**
That is all the column carries. The drawer and the **Tasks** page have the full history.

**An app you deleted is still running on its node.**
If the node could not be reached when you deleted it, the row went but the containers did
not: they can reappear until the cluster reconciles. See
[Stop or delete an app](/docs/stop-or-delete-an-app/).
