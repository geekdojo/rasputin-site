---
title: "Add a node"
description: "Flash a machine and enroll it into your cluster — the eight steps, the two credentials you decide about on the way, and what to do when a node never joins."
weight: 30
applies-to: "2026.08.5"
---

Adding a node is a one-time job per machine: fill in a short form, generate the machine's
enrollment file, flash it onto the drive, and power the machine on. Everything else happens
by itself on first boot.

Throughout, `<prefix>` is the shared prefix your existing node ids already have, and
`<node-id>` is the name you give this one.

## Do this

1. **On **Nodes**, click an open bay** — any dim, dashed hexagon on the rim of the honeycomb.
   Its `+` opens the **ADD NODE** dialog.
2. **Pick `ROLE`.** `COMPUTE` ("runs apps & workloads") is selected for you and is right for an
   ordinary node. `FIREWALL` ("network edge & security") is for the box at the edge of your
   network: a separate, Intel/AMD-only image, and two network ports.
3. **Pick `ARCHITECTURE` to match the board you are about to flash** — `AMD64` ("Intel / AMD,
   UEFI boot"), the default, or `ARM64` ("Raspberry Pi"). Read those blurbs literally: the
   AMD64 image's one hard requirement is UEFI boot, and the ARM64 image boots a Raspberry Pi,
   not other ARM boards. `FIREWALL` hides this step — that role has one image.
4. **Accept or edit `NODE NAME`.** Prefilled with the next free name in your cluster's
   `<prefix><role><n>` pattern; it must be unique, and a clash is rejected inline. **This is
   the node's permanent id in the cluster.**
5. **Put your SSH public key in `SSH KEY (OPTIONAL)`,** or take the prefill. Do not leave it
   blank: see [Seed an SSH key while you still can](#seed-an-ssh-key-while-you-still-can).
6. **Press `GENERATE ENROLLMENT FILE`.** The name is now reserved and a join token is issued
   and bound to it. You are shown the file once — see
   [The enrollment file is a credential](#the-enrollment-file-is-a-credential).
7. **Write it to the drive.** With the new node's drive plugged into your own computer, run the
   single command the dialog shows: it downloads your cluster's image for the architecture you
   picked, verifies it, flashes the drive, writes the enrollment file onto it, reads it back to
   confirm it landed, and ejects. macOS and Linux. To flash by hand instead, expand **Prefer to
   flash manually?** and follow its three steps — copy `rasputin-seed.env` to the root of the
   boot partition, the small FAT volume labeled `RASPUTIN-OS` (`RASPUTIN-FW` on a firewall),
   going by the label and not by size.
8. **Connect the node to the network and power it on.** First boot is the whole enrollment. Its
   slot shows a dashed, pulsing `PENDING` hex labeled `waiting…` and flips to a live node
   within a poll or two of the machine joining. Expect one extra reboot early on while the node
   grows its data partition.

<!-- SCREENSHOT: the ADD NODE dialog with the ROLE and ARCHITECTURE cards, NODE NAME prefilled,
and the SSH KEY field showing the remembered-key note. Default MISSION CONTROL theme. -->

## The enrollment file is a credential

`GENERATE ENROLLMENT FILE` mints the node's credentials. What you get back is a short
`KEY=value` text file — `rasputin-seed.env`, or `seed.env` for a firewall — carrying the
node's role, its id, the cluster id, the address of the cluster's bus, the **join token**, and
your SSH key. It is the same seed file described in
[Provisioning & the seed file](/docs/provisioning/), which documents every line.

**What it protects.** The join token in it is what lets a machine become a member of your
cluster, and it is **bound to this one node id**. Nothing else gates joining: a machine that
presents a valid token for an id gets onto the bus and the mesh. Treat the file the way you
would treat a password.

**What it does not protect.** It does not expire — the token stays valid until something
revokes it. It is not an identity for anything but joining, and it is not a lock on the
machine. And the node's first-boot attempt to wipe the token off the boot partition is
deliberately **best-effort**: if the boot volume cannot be written to, the scrub is skipped
rather than failing the provision. **Treat a flashed drive as carrying a live secret until you
have looked at the file yourself.**

**The consequence of each choice.** The single command keeps the file out of your hands and out
of the command's URL — it rides along as an environment variable — and it will only write to
external, removable drives, asking you to type the disk's name rather than accept a `y`.
Flashing by hand puts the
file's contents on your screen and, if you use `DOWNLOAD rasputin-seed.env`, a copy on your own
disk; that copy is yours to delete once the node is up. Either way, **one file, one machine**:
the token is bound to a single node id, so two machines flashed from the same file both claim
that id rather than becoming two nodes.

**What you cannot take back.** The control plane shows the file to you **once** and does not
show it again, so a copy you lose before the node boots cannot be retrieved — cancel the
pending enrollment and generate a new one. Going the other way, revoking the token is
final for that file: canceling a pending enrollment, or
[removing the node](/docs/remove-a-node/) later, stops that file working, and bringing the
hardware back means a new enrollment and a reflash.

## Seed an SSH key while you still can

**Supply your SSH public key here, on every node, every time.** A node can only be given a key
as it is enrolled, and a node enrolled without one has **no network shell for the rest of its
service** — the only way into it is the local console, protected by a default password shared
by every Rasputin OS node. This one line is the cheapest thing you can do now to avoid a node
you can only fix by carrying a keyboard to it.

Paste one SSH **public** key, one line — the contents of something like
`~/.ssh/id_ed25519.pub`. If your cluster has seen a key before, the field arrives prefilled
with a note saying so; a newly-seen key is remembered for next time and is managed under
[Settings](/docs/settings/).

**What it protects.** Rasputin's image runs a **key-only** SSH server — no password
authentication at all — and ships with **no key baked in**. The key you seed here is therefore
the only thing that makes SSH to this node possible.

**What it does not protect.** SSH is a way in for you, not a defense of the machine: physical
access to a node is still root on that node. And the remembered key under **Settings** applies
to **future enrollments only** — adding a key there grants nothing on nodes already running,
and removing one revokes nothing.

**The consequence of leaving it blank** is a node reachable through this dashboard and its
local console only, for as long as you run it. That is a deliberate choice, not a default to
drift into.

**What you cannot take back.** There is no way to add the key from this page afterwards. To
change or add a key on a node that is already running you have to get onto it by the means it
already has — its existing key, or its local console — or re-enroll it.
[Replace or revoke an SSH key on a node](/docs/replace-or-revoke-an-ssh-key/) walks through the
change over SSH.

## Troubleshooting

**The node stays `PENDING` long after you powered it on.**
Nothing times a pending bay out, so the hex will sit there until the node joins or you cancel
it. A node that cannot reach the cluster fails quietly — there is nothing to see on this page
but the pending hex — so check the machine itself at its local console. The causes we have
seen: the wrong image for the board (an ARM64 image on an Intel box, or the reverse); the
enrollment file copied to the wrong partition, or renamed; the machine not actually on the
same network as the control plane; or a legacy-BIOS machine that never booted the AMD64 image
at all.

**The machine shows nothing on screen and never boots.**
The AMD64 image requires UEFI boot. A legacy-BIOS machine simply never boots it, with nothing
on screen to tell you why.

**You want to undo an enrollment you generated.**
Hover the `PENDING` hex and it offers `CLICK TO CANCEL`. Canceling revokes the join token —
the enrollment file stops working and the name is freed. If you have already flashed a drive
with that file, that drive can no longer join: generate a new enrollment and reflash. The
confirmation dialog says exactly this before you commit.

**The honeycomb re-seated itself when you generated the enrollment.**
Expected. The map always draws the smallest complete hexagon that holds every slot in use, so
adding or removing a node — or generating or canceling a pending enrollment — changes the
number of slots and every hex moves. Selecting a node never moves anything.

**The node booted but the agent never started.**
A node whose seed carries no role stops at first boot rather than guessing. That is the
expected behavior for an image that was flashed without an enrollment file, not a fault. Put
the enrollment file on the `RASPUTIN-OS` volume and reboot; first boot runs again.

**The `STORAGE` role card will not select.**
It is not available in this release. Choose `COMPUTE`.

**There is no open bay to click.**
A cluster holds at most 24 nodes. At that size the map is full and no open bay is drawn.

**The map is replaced by a line of text telling you to start `rasputin-agent`.**
No node has ever registered. That is normal only on a control plane that has not finished its
own first boot; see [Provisioning & the seed file](/docs/provisioning/) for the starter path
for that first node.

**The new node's `OS IMAGE` does not match the rest of the cluster.**
Worth a glance whenever you add a node — see [Check on a node](/docs/check-a-node/). New nodes
should be flashed with the same build the rest of the cluster runs, and the image the dialog
links is your cluster's current one.
