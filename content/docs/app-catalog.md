---
title: "The app catalog"
description: "Apps arrive without a firmware update — and catalog versions only ever go forward. What that means, why, and how to run your own catalog if you want different behaviour."
weight: 14
---

Your cluster ships with a set of one-click apps, and that set updates **on its own**. The
catalog is published separately from the OS image, so a new app can reach your cluster
without you flashing anything — the control plane checks once a day, verifies the signature,
and the new tiles appear in **App Catalog**.

You can see exactly where your catalog came from at the top of that page: its version, how
many apps it has, and when the cluster last checked. There's a **CHECK NOW** button if you
don't want to wait for the daily poll.

## Catalog versions only go forward

This is the part worth knowing before you hit it:

**A cluster will not accept a catalog older than the one it already has.** There is no
version pin and no rollback. If catalog v7 is on your cluster, v6 is refused — even though
v6 is a perfectly valid, correctly signed catalog that we published ourselves.

That is deliberate, and it is a real constraint rather than a missing feature. If an app
you were using disappears from the catalog, or a tile changes in a way you didn't want, you
cannot go back to the catalog you had.

Two things soften it in practice:

- **Apps you have already installed are not touched.** The catalog is the *menu*, not your
  running apps. An app keeps running on the compose stack it was installed with, and that
  stack never changes underneath it — there is no auto-update path that could rewrite it.
- **A bad catalog is fixed by publishing forward, not by rolling back.** If we ship a broken
  tile, the fix is the next version, and your cluster picks it up on its next check or the
  moment you press CHECK NOW.

## Why forward-only

Every app in a tile is pinned to an exact image digest. That is what makes a tile
reproducible — and it also means an **old catalog pins old images**, including ones with
vulnerabilities that have since been patched out.

Now consider what a cluster can actually tell about a catalog it has been handed. It checks
the signature, and the signature says *"we published this"*. It does not say *when*, and it
cannot: a signature that verified in June still verifies today. So a correctly-signed
six-month-old catalog and a correctly-signed current one look **identical** to the check
that matters.

If a cluster accepted an older version, anyone able to feed it a stale-but-genuine catalog
could walk every cluster in the fleet back to image digests with known CVEs — using nothing
but a file we ourselves signed. Refusing to go backwards is the only defence that doesn't
depend on the cluster knowing what today's version is supposed to be.

The honest trade is: you lose the ability to pin, and you gain the guarantee that nobody
else can pin you either.

## Running your own catalog

If you want different behaviour, the supported answer is to **point your cluster at a
different catalog** rather than fork Rasputin. It's a config change, but be clear-eyed
about the second half of it.

On the control plane, add the repository to `/var/lib/rasputin/node.env` and restart the
API:

```sh
echo 'RASPUTIN_CATALOG_REPO=yourname/your-catalog' >> /var/lib/rasputin/node.env
systemctl restart rasputin-api
```

`RASPUTIN_CATALOG_REPO` is `owner/repo` on GitHub. If your catalog lives somewhere that
isn't github.com, set `RASPUTIN_CATALOG_API_BASE` to that host's API base as well. Neither
is part of the [seed file](/docs/provisioning/) — the seed's key list is closed, so this is
an edit on a running node, not something you can bake into a fresh flash.

**The part people miss:** your cluster still verifies the bundle signature before it will
load anything, and it checks two things — that the signing certificate chains to the
cluster's trust root, and that it carries Rasputin's catalog-signing purpose. A catalog you
publish yourself satisfies neither by default. Running your own catalog therefore means
running your own signing chain and installing your own trust root on the node. That is a genuine
escape hatch — the door is deliberately left open — but it is a PKI project, not a one-line
environment variable, and we would rather you knew that before you started than after.

Two smaller options are worth knowing before you take that on:

- **A custom app.** If you just want to run something the catalog doesn't carry, paste its
  Compose stack into **App Catalog → New custom app**. No catalog, no signing, no ceremony —
  and unlike a catalog tile, nothing about it is constrained by us.
- **Ask for the app.** The catalog exists to grow. If something is missing, that's a request
  worth making rather than a fork worth maintaining.

## Forward-only is not the same as auto-updating

Worth separating, because they get conflated:

| | Updates itself? | Can you go back? |
|---|---|---|
| The **catalog** (the menu of apps) | Yes, daily | No — forward only |
| An **installed app** | No | It keeps running exactly as installed |
| The **OS image** | Only when you ask | Yes — A/B slots, with automatic rollback on a failed boot |

The one thing that moves on its own is the list of apps you *could* install. Nothing you're
already running changes because a new catalog arrived.
