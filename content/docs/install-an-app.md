---
title: "Install an app"
aliases:
  - /docs/app-catalog/
description: "Pick an app from the catalog, place it on a node, deploy it — and understand what consenting to a privileged app actually grants."
weight: 40
applies-to: "2026.08.5"
---

Every app on your cluster comes from the **App Catalog**. Installing one is two presses
apart: `INSTALL` declares the app, `DEPLOY NOW` starts it.

`<app>` below is the instance name you give the app at install.

<!-- IMAGE: /img/ui/app-catalog.png — the App Catalog with its freshness strip and curated sections -->

## Do this

1. **Open `App Catalog`** on the nav rail. The `ADD APP` button on the **Apps** page goes to
   the same place.
2. **Find the app.** The search box filters the tiles already loaded in your browser,
   matching name, tagline, description and category; the buttons beside it filter by
   category. Unfiltered, the tiles sit in curated sections.
3. **Press `INSTALL` on its card.** Nothing is installed by that click. It opens a drawer
   with the tile's full description, any external API keys it needs, its declared ports — the
   one marked `★` is what the built-in reverse proxy will front — and the complete Compose
   stack, to read and copy before you commit to anything.
4. **If the drawer shows a privilege panel, read the `THIS APP CAN` list and flip `CONSENT`.**
   Most tiles ask nothing here. See [Consenting to what an app asks for](#consenting-to-what-an-app-asks-for).
5. **Name it and place it.** The **instance name** defaults to the tile's id, must be unique,
   and becomes the app's DNS label — it is what you will type to reach it. The **target node**
   defaults to the first eligible one, and only nodes that can actually host the app are
   offered.
6. **Leave `LAN ACCESS` off** unless you want the app to have a name on your home network.
   Off is the default and you can change it later on the live app. See
   [`LAN ACCESS`](/docs/your-apps/#lan-access).
7. **Press `INSTALL`.** This *declares* the app — it does not start it, so you get a chance to
   review what you just created.
8. **Press `DEPLOY NOW`.** The footer then hands you the app's address, its `FIRST RUN` note
   from the publisher, and a way through to the **Apps** page to watch it come up.

One more thing can appear in the footer. If the tile declares a `CRITICAL` volume and your
cluster has no backup target or schedule, you get a `BACKUP` acknowledgement — not a refusal,
but a checkbox that starts unticked, a link to where the fix is, and a record that you
installed knowing this app's data would not be backed up. Its row nags on the **Apps** page
until a target exists.

## What the catalog is

Every tile is a curated, signed application stack with its images pinned to exact digests.
The pin is enforced twice: the publisher's linter refuses to publish a tile whose images are
not pinned, and your cluster re-checks the pins — against the publisher's declared image list
for the tile, not against the Compose text — before it will load the catalog at all.

Unfiltered, tiles are grouped into `ESSENTIALS` ("the credibility floor — every cluster
should run these"), `SHOW-OFF` (instant "look what my homelab does", no extra hardware) and
`EVERYDAY FAVORITES` ("the workhorses this crowd votes for"), followed by `CUSTOM`, which is
not a collection of tiles at all. A section with no tiles in your catalog is not shown. As
soon as you type or pick a category the sections collapse into one flat `N RESULTS` list;
clear the search and choose `ALL` to get them back.

A card's badges are short: a RAM floor (`256M RAM`, `2G RAM`) is what the node needs free;
`PREFERS X86` is a placement hint and not a restriction; `NEEDS KEYS` means the app needs
accounts you hold with a third-party service before it does anything useful, and the drawer
names which — you add them to the app after install, and Rasputin never asks for them or
holds them; `ELEVATED` is a privilege tier, below.

**The strip across the top of the page** carries `CATALOG v<N>`, the tile count, when the
cluster last looked for a published catalog, and `CHECK NOW` to look immediately instead of
waiting for the daily poll. An amber `BUILT IN` means nothing has been adopted from the
internet — these are the tiles baked into the image this cluster is running. A cluster that
has never reached the internet says so out loud, because *"that is not the same as being up to
date."* Two kinds of bad news land here rather than being swallowed: a failed check, which
never degrades the catalog you already have, and individual tiles *this build* refused, listed
by id with the reason — nearly always a cluster older than the catalog it is reading, so the
rest of the catalog loads and updating the cluster brings the missing tiles in.

`CATALOG v<N>` is a plain counter on the catalog's own release stream and has nothing to do
with your cluster's software version on the **Updates** page. The two move independently:
new apps reach your cluster without you flashing anything, and a software update does not
rewrite your catalog. **Catalog versions move forward only, and a downgrade is refused** —
even of an older catalog we published and signed ourselves, because an old catalog pins old
images and a signature cannot tell "current" from "validly signed three months ago". A bad
catalog is fixed by publishing forward, never by rolling back. Apps you have already
installed are untouched by any of it: an app keeps running on the stack it was installed
with.

**Forward-only is not the same as auto-updating.** Worth separating, because they get
conflated:

| | Updates itself? | Can you go back? |
|---|---|---|
| The **catalog** (the menu of apps) | Yes, daily | No — forward only |
| An **installed app** | No | It keeps running exactly as installed |
| The **OS image** | Only when you ask | Yes — A/B slots, with automatic rollback on a failed boot |

The one thing that moves on its own is the list of apps you *could* install. Nothing you're
already running changes because a new catalog arrived.

## Consenting to what an app asks for

**What it protects.** Most apps stay inside their own container — their own files and the
network they are given, and nothing else on the node. Those tiles are *routine* and carry no
privilege badge at all; badging them would make the badge mean "this is an app". Some apps
genuinely need more, and Rasputin's position is that such an app should be **declared and
consented to, not refused**: refusing the most-wanted app in a category is a missing feature,
not a security posture. What makes privilege hard to weigh is that it is normally *invisible*, so
the catalog makes it visible and asks you.

Open a non-routine tile and the drawer shows the tier, the publisher's one-line reason for
needing it, and a **`THIS APP CAN`** list — every privilege the stack takes, written out as a
sentence each, with a `+ what does this mean?` link that expands a plain-language explanation
of the tier. That list is not a promise the publisher makes. It is derived by reading the
app's own Compose file, signed along with the rest of the catalog, and re-checked by your
cluster before it will load the tile — if the declaration claims less than the Compose
actually takes, the tile is refused. **It is what the app takes, not what it claims.**

- **`ELEVATED`** (amber) — *"Reaches past its own container, but cannot take over the node."*
  The app asked for a piece of hardware, a folder on the node, or a network capability.
  Plenty of honest apps need this: a Zigbee dongle, a media library on a disk, a VPN client
  that manages its own routes. It still cannot become root on the node.
- **`HOST-TRUSTING`** (red) — *"Effectively root on this node."* The app can do what the
  node's administrator can do; assume it can read any file on the node and change how it
  boots. **No tile in the catalog today declares this tier**, so this is the vocabulary the
  screen would use rather than something you will meet.

**What consenting does not do.** It is a gate on **you**, the owner — it makes sure nobody
grants an app root by clicking the same button they click for a note-taking app. It is **not
a sandbox**, and it does not constrain the app at all. What actually confines an app is its
Compose file and the container runtime that enforces it; Rasputin runs what the signed tile
says, and that Compose is copied onto the app at install and does not change afterwards.
Consent is also all-or-nothing: you cannot agree to half of the `THIS APP CAN` list, and
nothing re-asks you afterwards, because the stack you consented to is the stack that keeps
running.

**The consequence of each choice.** A routine tile asks nothing. An `ELEVATED` tile asks you
to flip a `CONSENT` toggle reading *"Let \<app\> reach beyond its own container"*. A
`HOST-TRUSTING` tile would ask for the toggle **and** for you to type the app's id back, with
a blunt hint: *"You can change your mind later, but you cannot un-run it."* The toggle starts
off every time you open the drawer — a previous decision is never carried forward — and
`INSTALL` stays disabled until consent is satisfied, with a hover that says why. There is no
third option and no reduced-privilege install: consent, or do not install the app.

**What you cannot consent to.** A tile that would reach the platform's own trust chain — the
certificate trust store, the control plane's state directory, the agent's credentials — is
refused outright, always. That is not protecting you from yourself: an app that can rewrite
the trust store can authorize every future update, so consenting to it would destroy the
basis of every later consent. One practical consequence: no catalog tile can be a whole-disk
backup tool that mounts the root filesystem. A custom app can.

**What you cannot take back.** You can stop and delete an app, but you cannot un-run it —
whatever it did while it held that privilege, it did, and deleting it does not undo it. So
install a non-routine tile because you trust who publishes it, not because the app is
popular.

## Your own Compose stack

The last section on the catalog page is `CUSTOM` — *"Bring your own Docker Compose stack."* It
holds one dashed card whose button is `NEW CUSTOM APP`, which opens a drawer asking for a
name, a target node from the same list of eligible nodes, and a `COMPOSE` text area for your
YAML. `ADD APP` declares it; as with a tile, deploying is a separate step.

A custom app then behaves like any other in the table — same `DEPLOY`, `STOP` and `DELETE`,
same detail drawer. What it does not get is everything the catalog was the source of:

- **No privilege tiering, no consent prompt, and no validation** of the stack beyond the YAML
  being non-empty. Rasputin never parses it. Everything the container runtime permits is
  available to you here, including what no tile is allowed to do — mounting the container
  runtime's socket, or the platform's own state directory.
- **No access address anywhere in the UI.** A tile names its web port and that is what the
  proxy fronts; a custom app declares no port to Rasputin, so its drawer reads
  `This app doesn't expose a web port.`, no `OPEN` button ever appears, and no proxy route is
  provisioned. Reach it as you would on any Docker host: at the target node's address, on
  whatever port your Compose file publishes. It does still get the `LAN ACCESS` toggle, which
  for a custom app means only a `.lan` name pointing at its node — a name, not a route and
  not a filter.
- **No volume classification**, so no backup class, no per-volume backup guarantee, and no
  restore offered in its drawer. Its data is yours to look after.
- **No `FIRST RUN` or `ABOUT` guidance**, because there is no tile to supply it.

What *is* checked is the paperwork: the name is normalised to a DNS label of at most 32
characters and must be unique, the target node must exist and be a compute node, and a
tailnet-only app aimed at a node known not to be on the mesh is refused rather than installed
unreachable.

## Running your own catalog

If you want different behavior from the published catalog, the supported answer is to
**point your cluster at a different catalog** rather than fork Rasputin. It's a config
change, but be clear-eyed about the second half of it.

On the control plane, add the repository to `/var/lib/rasputin/node.env` and restart the API:

```
echo 'RASPUTIN_CATALOG_REPO=yourname/your-catalog' >> /var/lib/rasputin/node.env
systemctl restart rasputin-api
```

`RASPUTIN_CATALOG_REPO` is `owner/repo` on GitHub. If your catalog lives somewhere that isn't
github.com, set `RASPUTIN_CATALOG_API_BASE` to that host's API base as well. Neither is part
of the [seed file](/docs/provisioning/) — the seed's key list is closed, so this is an edit on
a running node, not something you can bake into a fresh flash.

**The part people miss:** your cluster still verifies the bundle signature before it will load
anything, and it checks two things — that the signing certificate chains to the cluster's
trust root, and that it carries Rasputin's catalog-signing purpose. A catalog you publish
yourself satisfies neither by default. Running your own catalog therefore means running your
own signing chain and installing your own trust root on the node. That is a genuine escape
hatch — the door is deliberately left open — but it is a PKI project, not a one-line
environment variable, and we would rather you knew that before you started than after.

Two smaller options are worth knowing before you take that on:

- **A custom app.** If you just want to run something the catalog doesn't carry, use
  [your own Compose stack](#your-own-compose-stack) above. No catalog, no signing, no
  ceremony — and unlike a catalog tile, nothing about it is constrained by us.
- **Ask for the app.** The catalog exists to grow. If something is missing, that's a request
  worth making rather than a fork worth maintaining.

## Troubleshooting

**Every tile reads `DETAILS` instead of `INSTALL`.**
Your cluster has no node that can host them. Open one and the drawer names what is missing.
Eligibility is narrow on purpose: the node must be reachable — anything not `OFFLINE`, so a
`STALE` node still counts — in a compute role, and of a matching architecture. **A
control-plane node is never offered**, whatever a hint on the page suggests; that gate is
deliberate and no amount of retrying gets past it. Enroll a compute node.

**A tile you expected is not there.**
Check the freshness strip for rejected tiles. A tile that declares something this build does
not understand is refused rather than installed without the badge, constraint or consent
prompt that goes with it. Update the cluster.

**The strip says the cluster has never checked for updates.**
It has not reached a published catalog, so you are looking at the tiles baked into its image.
Press `CHECK NOW`.

**`CHECK NOW` seems to hang.**
It is fire-and-forget: the control plane runs the fetch in the background while the page
watches. After 30 seconds the page says so rather than spinning forever — reload to see how
it ended.

**`Last check failed: …`**
The fetch or the signature check did not succeed. The catalog already in effect is untouched;
a failed check never degrades what you have.

**`INSTALL` is grayed out.**
Consent is not satisfied, or a required field is empty. Hover the button and it says which.

**You pressed `INSTALL` and nothing is running.**
`INSTALL` declares the app. Press `DEPLOY NOW` in the footer, or `DEPLOY` on the app's row in
the **Apps** page.

**Your custom app deployed but there is no link to it.**
There never will be. A custom app declares no port to Rasputin; reach it at the node's
address on the port your Compose file publishes.
