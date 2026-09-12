---
title: "Bring in a bundle by hand"
description: "The air-gapped path: upload a locally built or hand-carried .raspbundle, what verifies it, and the catalog it lands in."
weight: 73
applies-to: "2026.08.5"
---

This is the rare path. Normally the control plane fetches and verifies release artifacts
itself — see [Roll out an update](/docs/roll-out-an-update/) — so manual upload is deliberately not
the primary action on the page. Use it in two cases: your cluster has no route to the internet
and you are carrying artifacts in by hand, or you have built a bundle locally.

The control plane states the same thing under the control:

> only needed for air-gapped installs or a locally built bundle — produce a `.raspbundle` with
> `scripts/build-bundle.sh`, then upload it

## Do this

1. **Produce the `.raspbundle`** with `scripts/build-bundle.sh`, and get the file onto the
   machine your browser is running on.
2. **Open Updates** on the nav rail and scroll past the `BUNDLES` table.
3. **Expand `ADVANCED — MANUAL / AIR-GAPPED UPLOAD`** — a collapsed disclosure below the table.
4. **Choose the file and press `UPLOAD BUNDLE`.** It goes through the same verified ingest as a
   staged artifact: streamed to a temporary file with its content hash computed, verified, and
   atomically moved into the catalog.
5. **Find it in `BUNDLES`.** It now appears like any other artifact, with the same row actions.
6. **Roll it out** with `DEPLOY` for [one node](/docs/update-one-node/), or with `UPDATE MATCHING`
   for every online node that takes that one artifact — a fleet-scale run, covered in
   [What UPDATE ALL commits you to](/docs/roll-out-an-update/#what-update-all-commits-you-to),
   including a warning about its confirmation dialog's wording.

## The bundle catalog

The `BUNDLES` table is every artifact in your catalog, whether it arrived by staging from the
channel or by upload here.

| Column | What it means |
| --- | --- |
| `VERSION` | The release version this artifact belongs to, plus where it came from (for example `· pulled from dev channel`) |
| `ARCH` | `amd64` or `arm64` |
| `COMPAT` | The hardware SKU string this artifact is built for — what gets matched against a node |
| `SIZE` | The artifact's size on the control plane's disk |
| `SIGNED BY` | The common name of the certificate that signed the bundle, or the signer named by the release manifest for a staged artifact. An amber `UNVERIFIED` badge appears instead on a bundle taken in without signature checking |
| `UPLOADED` | When it entered the catalog. Hover for its content hash |

`DELETE` removes an artifact from the catalog. Its confirmation warns that any node currently
mid-update will fail, because a node in the middle of a run fetches its bundle from this catalog
by content hash. **Do not delete a bundle while a rollout referencing it is running.**

## What an uploaded bundle is verified against

**What it protects.** Ingest is the same for an uploaded bundle as for a staged one: the file is
streamed to a temporary location with its content hash computed on the way, verified, and only
then atomically moved into the catalog. A truncated or corrupted transfer does not become a
catalog entry, and `SIGNED BY` records the common name of the certificate that signed it. The
trust root still gates everything downstream: with no signing root CA on the control plane, OS
updates are refused outright and nothing installs, uploaded or not — see
[Signing and the trust root](/docs/roll-out-an-update/#signing-and-the-trust-root).

**What it does not protect.** Staging from the channel hands the control plane a signed manifest
published alongside the release, and the artifact is checked against it. A hand-carried bundle
brings only whatever signature it carries itself. Two consequences follow:

- **It was never channel-filtered.** The channel filter decides what `CHECK FOR UPDATES` offers
  you; nothing on this path consults it. An artifact uploaded here sits in the catalog and is
  available to `DEPLOY` and `UPDATE MATCHING` regardless of the stream your cluster is seeded to.
  See [Channels](/docs/roll-out-an-update/#channels-a-stable-cluster-never-sees-dev-releases).
- **On a control plane in permissive development mode, signatures are not checked at all.** The
  bundle is recorded as `<unverified>` and carries an amber `UNVERIFIED` badge under
  `SIGNED BY`. That badge is the record of how the artifact entered the catalog.

**The consequence.** On this path you are the chain of custody. Nothing between
`scripts/build-bundle.sh` and the catalog row establishes that the bundle is the release you
think it is, beyond the signature on the bundle itself — so treat the medium you carried it on,
and the machine you built it on, as part of the update path. What still applies in full once it
is deployed is the node's own protection: the four-part
[verify contract](/docs/know-whether-an-update-worked/#the-verify-contract) and
[the two system slots](/docs/know-whether-an-update-worked/#rollback-and-the-two-system-slots).

**What you cannot take back.** `DELETE` is immediate and fails any node mid-update that was
about to fetch that artifact. And on an air-gapped cluster there is no channel to re-stage from:
a bundle you delete has to be carried in again.

## Troubleshooting

**There is no upload control on the Updates page.**
It is a collapsed disclosure below the bundles table, labelled
`ADVANCED — MANUAL / AIR-GAPPED UPLOAD`. It is not the primary action by design, because the
normal path is staging from the channel.

**The uploaded bundle shows `UNVERIFIED` under `SIGNED BY`.**
The control plane is running in permissive development mode and did not check the signature. Do
not deploy that bundle, and do not run that configuration on an appliance.

**`UPDATE ALL` is still greyed out after uploading.**
A hardware SKU your fleet needs is not in the catalog; the tooltip names it. A release is one
artifact per architecture, and Rasputin counts only the architectures your fleet actually runs —
a mixed cluster is not staged until both are there.

**Nothing stages or installs, and there is a banner at the top of the page.**
The control plane booted without a signing root CA, and OS updates are refused — the whole path,
not one step. On Rasputin hardware the root CA ships in the OS image, so on an appliance this
means re-flash.

**A node failed mid-run just after you deleted a bundle.**
That is the documented consequence: a node in the middle of a run fetches its bundle from the
catalog by content hash. Re-upload the artifact and deploy to that one node.

**`UPDATE MATCHING` left half the fleet behind.**
It carries a single artifact, so it reaches only the nodes of that one architecture. The others
are not failures — they were never in the plan. Use `UPDATE ALL` on the release row when you
mean the whole fleet.
