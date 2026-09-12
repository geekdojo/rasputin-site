---
title: "Reach your LAN over the mesh"
description: "A subnet route lets mesh devices reach machines that are not Rasputin nodes — the order the layers have to line up in, and what the whole mesh can reach once you approve one."
weight: 92
applies-to: "2026.08.5"
---

A device on the mesh can always reach your Rasputin **nodes**, and the apps running on them.
A **subnet route** extends that: it lets mesh devices reach an entire network sitting behind
one of your nodes — the other machines on your LAN, a separate VLAN — by routing that traffic
through the node.

**You want one when** a mesh device needs to reach a printer, NAS, or camera that is on your
LAN but is not a Rasputin node, or when a segment of your network is only reachable through a
particular node. **You do not need one** to reach the nodes themselves or their apps.

`<lan-cidr>` below is the subnet you want to reach, in CIDR form — the address range of the
LAN or VLAN sitting behind the node.

## Do this

The order matters. Approving a route Rasputin cannot deliver is the most common way to spend
an afternoon on this tab.

1. **Open `Mesh → DEVICES` and read the `ROUTES` column for the node that will carry the
   traffic.** That is what the node is actually advertising. A node's primary LAN is
   advertised automatically when it enrolls.
2. **If the subnet you want is not in that column, it has to go in at enrollment.** What a node
   advertises is set when it enrolls, by the **advertise routes** field — a comma-separated
   list of CIDRs — in the **ENROLL RASPUTIN NODE** form on the same tab. That form offers only
   online nodes that are **not yet in the tailnet**, so for a node already enrolled there is
   no control here that changes what it advertises. Confirm the CIDR shows in the node's
   `ROUTES` column before going on.
3. **Open `Mesh → ROUTES` and press `ADD ROUTE`:** **name** (your label, e.g. `lan-vlan-10`),
   **node** — the one actually attached to that subnet — and **CIDR**, e.g. `<lan-cidr>`.
4. **Press `APPLY`.** `ADD ROUTE` only records the intent; **`APPLY` is what approves the
   route** on the coordinator. Approving a subnet the node never advertised does nothing —
   the apply skips that route and reports the node as not yet enrolled rather than failing,
   which is why step 1 comes first.
5. **Test from a device on the mesh.** Rows have an on/off toggle, `EDIT`, and `DELETE`, and
   unlike pre-auth keys **every field of a route stays editable**.

<!-- SCREENSHOT: mesh-routes.png — the ROUTES tab with one approved route and the ADD ROUTE
form. -->

**Rasputin is IPv4 only, and this is the one form that does not check.** The firewall rejects
an IPv6 address when it compiles your intents, and the **advertise routes** field on the enroll
form rejects one outright. The `ADD ROUTE` CIDR field does neither: an IPv6 CIDR is stored,
pushed to the coordinator, and will not work — you get no error, just a route that does
nothing. Enter IPv4 CIDRs here.

## What approving a route actually opens up

**What it protects.** Nothing new — a route is an extension of reach, not a control. It is
worth treating with the same care as a firewall change, because that is what it is.

**What it does not protect.** The machines on the routed subnet get no say in this. They were
reachable only from your LAN; after the route they are reachable from the mesh too, and they
are almost certainly the devices on your network with the weakest authentication — a printer's
admin page, a camera's default password, a NAS share. **And the tailnet is open internally:**
with no access-control policy in this release, **every** device on the mesh can reach the whole
CIDR you approved, not only the device you had in mind.

**The consequence of each choice.**

- **No route** — mesh devices reach your nodes and their apps, and nothing else on your LAN.
- **A narrow route** — approve the smallest CIDR that covers what you actually need. A `/24`
  when you needed one machine's subnet exposes the rest of that subnet to every mesh device.
- **A route for a whole VLAN** — everything in the VLAN is on the mesh's reachable surface,
  including whatever is added to that VLAN later.

**The return path is handled for you.** The node translates mesh addresses onto the LAN, so
the machines there can reply without any configuration of their own. They also cannot tell
which mesh device reached them.

**What you cannot take back.** A route is reversible in the UI — toggle it off or delete it,
then `APPLY`. What you cannot take back is the reach while it was live: a device on your mesh
that used the route has already been on that subnet, and you have no per-device record of what
went where.

## When a route is approved but still does not work

Approval is only one of the layers that has to line up. In order:

1. **The node must advertise the subnet.** A node picks this up when it enrolls — its primary
   LAN is advertised automatically. A subnet you approve that the node never advertised
   **cannot** work: approval cannot conjure a route the node is not offering. This is the step
   to fix, not just to notice. Adding a route on the ROUTES tab does **not** make a node
   advertise it: the advertised set is written at enrollment, from the **advertise routes**
   field, and no control on any tab changes it afterwards. Check the `ROUTES` column on
   DEVICES for what the node is actually advertising.
2. **Rasputin must approve it** — the ROUTES tab, plus `APPLY`.
3. **Policy must allow it.** With no access-control policy, everything is allowed. If a policy
   has been added outside Rasputin, it has to permit the path.
4. **The return path** is already handled for you, as above.

If a route shows in the UI and traffic still fails, walk those four in order. **It is almost
always the first one.**

## Troubleshooting

**The route is approved and traffic still fails.**
Check the node's `ROUTES` column on DEVICES. If the CIDR is not there, the node is not
advertising it and approval cannot help. The CIDR has to be in the **advertise routes** field
of `ENROLL RASPUTIN NODE` at the moment the node enrolls; confirm it appears in the `ROUTES`
column, then approve it here.

**The node you want is not offered in `ENROLL RASPUTIN NODE`.**
That form only offers nodes that are online and missing from the tailnet — once every online
node is enrolled it says so and shows no picker at all. An offline node does not appear
either; bring it back up.

**The node is already enrolled and does not advertise the subnet you need.**
This release has no control for that. The advertised set is fixed at enrollment and the enroll
form will not offer a node that is already in the tailnet, so a second segment or VLAN that
was not named at enrollment cannot be added from the UI. A node's *primary* LAN is advertised
automatically, so this only bites on additional subnets. Approving the route anyway is
harmless and does nothing.

**You added the route but nothing was pushed.**
`ADD ROUTE` records an intent. `APPLY` is what approves it on the coordinator — the header
pill will say `PENDING` until you do.

**You entered an IPv6 CIDR and it was accepted.**
It was, and it will not work. Rasputin is IPv4 only; this field is simply the one that does
not validate. Replace it with the IPv4 CIDR.

**A mesh device can reach the subnet and you did not intend it to.**
Every device on the mesh can reach every approved route — there is no per-device policy in
this release. Toggle the route off and `APPLY` if the reach is wider than you wanted.

**You want a mesh device to reach an app on a node.**
You do not need a route for that. Nodes and their apps are reachable from the mesh already —
see [What the mesh gives you](/docs/the-mesh/) for which name to use.
