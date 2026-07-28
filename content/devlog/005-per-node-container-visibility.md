---
title: "Every node's container view showed the wrong node"
date: 2026-07-28
description: "Rasputin ran cAdvisor only on the control plane, so every node's Containers drawer showed the control plane's containers. The fix: per-node collectors remote-writing through an mTLS ingress on the api, with the client cert's CN as the node identity and the metrics store still bound to loopback."
summary: "Rasputin ran cAdvisor only on the control plane, so every node's Containers drawer showed the control plane's containers. The fix: per-node collectors remote-writing through an mTLS ingress on the api, with the client cert's CN as the node identity and the metrics store still bound to loopback."
---

Rasputin's observability stack has run cAdvisor on the control plane since
June — per-container CPU, memory, network, and disk, one slide-over drawer per
node. But cAdvisor ran *only* on the control plane, so every node's Containers
drawer showed the control plane's containers. A container on compute node `c02`
was invisible in `c02`'s own view.

**The constraint that shaped the fix:**

- VictoriaMetrics is bound loopback-only (`127.0.0.1:8428`) with no
  authentication. That is deliberate — an unauthenticated metrics store has no
  business on the LAN.
- Compute nodes can't reach loopback on the control plane, so per-node Alloy
  can't just remote-write to VM. Something has to authenticate the write and
  keep VM where it is.

**The decision (2026-07-17) — mTLS through the api, no open holes:**

- Run Alloy + cAdvisor on each Docker-capable node, remote-writing through a
  new mTLS-authenticated ingress on the api. The api is already the single
  authenticated front door for the read side (`/api/obs/*`, the Grafana proxy);
  this makes it the front door for metric ingress too. VM never leaves loopback.
- Auth is mTLS off the per-installation mesh CA the cluster already has, which
  retires the whole bearer-token idea — nothing to mint, store, deliver, or
  revoke on a second path. The TLS handshake is the auth: verified once per
  connection, reused for the stream, which is the right shape for a persistent
  remote-write feed.
- The node's client-leaf CN is its `node_id`. The api reads that id off the
  verified client cert and reverse-proxies the raw remote-write body to the
  loopback VM at `/api/v1/write?extra_label=node_id=<cn>`. VM's `extra_label`
  stamps the id server-side and overrides anything the node sent — so the
  identity is cryptographic and server-authoritative, and the api never has to
  decode the Prometheus protobuf or pull in a new dependency.

**The fix — the pieces (control-plane repo, dev builds):**

- **Client-auth leaf minter** (`c879620`): parameterize the mesh leaf minter's
  EKU to stamp `clientAuth` (it stamped `serverAuth` only); re-mint on EKU drift.
- **mTLS ingress** (`2066cd4`): a dedicated `:8443`
  `RequireAndVerifyClientCert` listener with mesh-CA client trust.
  `POST /api/obs/ingest` reads `node_id` from the cert CN, checks it against
  inventory (unknown node → 403), and proxies to loopback VM. A connection
  without a mesh-CA-signed client cert never finishes the handshake.
- **Collector compose builder** (`a55c801`): `obs.BuildCollectorCompose`
  renders a self-contained collector compose — Alloy's config and all three PEM
  files (client leaf, key, mesh CA) carried inline as compose `configs`
  content, so the agent writes no extra files. `network_mode: host`, because a
  bridged container can't resolve the control plane's `rasputin.local` mDNS
  name — Docker's DNS forwarder bypasses nss-mdns. Data-root pinned to the
  appliance's `/var/lib/rasputin/docker`.
- **Reconcile + sagas** (`2474092`): `obs.collectors.reconcile` runs on the
  scheduler every 5 minutes — obs on → deploy a collector to every online
  compute/storage node; obs off → tear them down. Per-node deploy mints the
  leaf, renders the compose, and ships it over the *existing*
  `docker.deploy` command. No new agent command. The decision core is a pure
  function with fixed-clock tests over the whole matrix.
- **Containers filter** (`2354a68`): `containers.go` injects
  `node_id="<id>"` into the cAdvisor PromQL so each drawer selects its own
  node. This also closes a latent bug — without the label, same-named
  containers across nodes (every node runs a `rasputin-obs-collector`) collapse
  into one merged, wrong row.

**What shipped:** CP `v2026.07.4` + OS `2026.07.4`, both SKUs signed — pieces
1–5 plus the cAdvisor data-root fix (`8e6d311`) and the 24-node cap guard, cut
together. They went out on the dev channel first as CP `dev.56` / OS `dev.110`
on 2026-07-18, which is what the bench run below used, and went stable
2026-07-19.

**Bench validation (2026-07-18, the 24-node cluster):**

- Upgraded the control plane only. obs was already enabled, so the collectors
  auto-converged onto the fleet — no toggle, no per-node touch. The compute
  nodes didn't need updating; the collector rides the existing `docker.deploy`
  path and their images already carry compose `v2.32.4`.
- Roughly 22 compute nodes pulled the Alloy image at once through one egress.
  All but one landed on the first pass; `c13` hit a transient Docker Hub TLS
  handshake timeout in the pull herd. It self-healed — a failed deploy cools
  down 30 minutes, then the next reconcile retries, uncontended by then. The
  image caches locally, so the 6-hour redeploys don't re-pull; the herd is a
  one-time first-enable cost.
- `uptime-kuma` on `c02` finally showed up in `c02`'s own Containers drawer,
  next to its `rasputin-obs-collector`. That single frame exercises the whole
  chain: reconcile deploy → collector compose up → client-leaf mint + mTLS
  handshake to `:8443` → server-side `node_id` stamp → drawer filter. VM
  stayed on loopback the entire time.

![c02's own Containers drawer: uptime-kuma alongside rasputin-obs-collector, each reporting real per-container memory. The whole per-node chain in one frame, captured with the control plane on dev.114.](/img/005-c02-containers-drawer.png)

Both tail items closed the same day. `c13`'s deploy self-healed on the next
reconcile, which is what the 30-minute cooldown is for. The disable→teardown
check found a real bug — the reconcile's 6-hour freshness throttle keyed on the
last deploy and ignored a teardown since, so an obs off→on left collectors
stopped for up to six hours — fixed in `48d8248` and regression-tested.

**Takeaway:** an unauthenticated metrics store can still collect from the whole
fleet — put an mTLS ingress in front of it and let the client cert's CN be the
node identity, so nothing has to open a port or trust a shared token.

*Rasputin is an open-source (AGPL) homelab cluster system — a control plane,
node OS, and firewall image that make a few Raspberry Pis or N100 boxes behave
like one appliance. It's pre-alpha, on
[GitHub](https://github.com/geekdojo/rasputin-control-plane), and I'm looking for a
handful of design partners to run it and tell me what's broken.*
