---
title: "Remove a node"
description: "Retire a node from the cluster — the six steps, exactly which records REMOVE NODE deletes and which it leaves alone, and what none of it can undo."
weight: 32
applies-to: "2026.08.5"
---

`REMOVE NODE` is the most consequential control on the **Nodes** page, and it does something
narrower than most people expect: it is a control-plane-side *forget*, plus two revocations.
Read [What REMOVE NODE actually does](#what-remove-node-actually-does) before you use it.

If you are trying to *fix* a node rather than retire it, this is the wrong button — see
[Check on a node](/docs/check-a-node/).

## Do this

1. **Stop the workloads first, if that is what you want.** Removing the node does not reach
   onto the machine. Uninstall its apps from the **Apps** page *before* you remove it.
2. **On **Nodes**, click the node's hexagon** to select it and fill the controls panel. Check
   the full id in the panel header is the node you mean.
3. **Press `REMOVE NODE` under `ACTIONS`.** A confirmation dialog opens and fetches a
   **CASCADE** preview.
4. **Read the cascade preview.** `APP DEPLOYMENTS` counts the app deployment records targeting
   this node; `MESH ENROLLMENT` says whether the node's mesh device is removed, or that it was
   never enrolled; `FIREWALL STATE` says whether a firewall reconciliation record is removed.
   The confirm button stays disabled until the preview returns.
5. **Confirm.** The mesh device is deleted first, then the local records.
6. **Check the hexagon is gone from the map.** If the node is still listed after an error,
   re-run the removal — see [What you cannot take back](#what-you-cannot-take-back).

**`REMOVE NODE` is not shown on the control-plane node.** The control plane *is* the cluster —
its inventory, its bus, its database and the web UI you are reading this in all run there.
Removing it is not a supported operation, so the button is not rendered, and the API refuses it
as well if something else asks.

## What REMOVE NODE actually does

**What it protects.** It takes the node's standing in the cluster away. It deletes the node's
device from the mesh, **revokes the join token** the node uses to get onto the bus, and deletes
the control plane's own records for it: its app deployment records, its firewall
reconciliation state, and its inventory row. After a clean removal the machine has no way back
onto the bus or the mesh and no place in the cluster's inventory.

**What it does not protect.** It does not touch the physical machine. Nothing is wiped, nothing
is reinstalled, the machine is not powered off, and **its agent keeps running**. Specifically:

- **It does not stop the workloads.** The apps vanish from the **Apps** page because their
  control-plane *records* are deleted — nothing reaches onto the machine to stop containers or
  delete data. Whatever was running keeps running, and its app data is untouched. Removing a
  node is not a way to uninstall its apps.
- **It does not cut a live connection instantly.** Revoking the token stops the node the next
  time it needs to reconnect; an agent already connected keeps its existing session until
  then. That window is bounded — a bus credential is capped at 24 hours — but if you need a
  machine off the cluster *now*, power it down or unplug it as well.
- **It does not erase the node's history.** Its metrics, backup records and update history stay
  in the control plane's database under the old node id.
- **The token revocation is best-effort.** If it fails, the control plane logs it and carries
  on with the removal rather than blocking it, so a removal can complete with the old token
  still live — and the dialog does not tell you when that happened. If you are retiring a node
  for security reasons rather than for convenience, check the control plane's log, and treat
  the old enrollment file as still sensitive until you have.
- **The cascade preview is a summary, not the full list.** It does not mention the token
  revocation at all, and its count for apps means *records* removed.

**The consequence of each choice.**

- **Uninstalling the apps first, then removing** leaves the machine idle and the cluster's
  records clean. This is the order you want in almost every case.
- **Removing with apps still deployed** deletes the deployment records while the containers
  keep running on a machine the cluster can no longer see or drive. You now have workloads
  with no record of them.
- **Removing a node you intend to bring back** means enrolling it again from scratch, with a
  new enrollment file. There is no pause and no re-attach. See [Add a node](/docs/add-a-node/).
- **Removing while the mesh is unreachable** does nothing at all: the mesh device is deleted
  first, and if the mesh cannot be reached the removal fails and **nothing is deleted**. The
  node is still there when you close the error. That is deliberate — try again once the mesh
  is healthy.
- **Leaving the confirm button disabled.** If the preview fails, the button stays disabled;
  the control plane will not let you confirm a cascade whose scope it could not establish.
  Close the dialog and reopen it to retry.

### What you cannot take back

**There is no undo and no restore.** The records are deleted, not archived.

**Past the mesh deletion, the cascade is not transactional.** A failure later in it — deleting
the app records, the firewall state, or the inventory row — returns an error with the earlier
deletions **already applied**: the mesh device and the app records can be gone while the node
is still listed on this page. Re-run the removal. The steps that already succeeded are harmless
to repeat, and re-running is how you finish a removal that stopped half-way.

**The old enrollment file is dead.** Bringing that hardware back means a new enrollment file
and a reflash, because the old file's token is revoked.

**Ignore the dialog's wording about a "fresh node".** The confirmation dialog says *"a
re-registering agent will appear as a fresh node"*. That predates the token revocation and is
wrong twice over: with the token revoked, an agent presenting the old file does not get back on
the bus at all — and a node's id comes from its own seed, so a machine that did re-register
would come back under the **same** id, not as a new one.

**Do not reuse a removed node's name for different hardware.** The node id is what a machine
presents when it joins, and the removed node's metrics, backups and update history are still
filed under it — so the old history and the new machine end up under one name. Pick a fresh
name.

## Troubleshooting

**There is no `REMOVE NODE` button.**
You have the control-plane node selected. Removing the control plane is not a supported
operation, so the button is not rendered.

**The confirm button never becomes clickable.**
The cascade preview has not returned, or it failed. The control plane will not confirm a
cascade whose scope it could not establish. Close the dialog and reopen it to retry.

**The removal failed and the node is still listed.**
If it failed at the mesh step, nothing was deleted and you can simply try again once the mesh
is healthy. If it failed later, the earlier deletions have already been applied — the mesh
device and the app records may be gone with the node still on the page. Re-run the removal;
repeating the steps that succeeded is harmless.

**The node is gone from Nodes but its apps are still running.**
Expected. Only the control plane's records were deleted. Nothing reached onto the machine, so
the containers and their data are untouched. Get onto the machine yourself and stop them, or —
next time — uninstall from the **Apps** page before removing the node.

**You removed a node for security reasons and want to be sure the token is dead.**
The dialog will not tell you: the revocation is best-effort and a failure is logged rather than
surfaced. Read the control plane's log for the removal, treat the old enrollment file as live
until you have, and power the machine down if you need it off the cluster immediately.

**You removed the wrong node.**
There is no restore. Enroll the machine again from scratch with a new enrollment file — see
[Add a node](/docs/add-a-node/). Its old metrics, backup records and update history remain in the
database under the original node id.

**You wanted to take a node out of service temporarily.**
`REMOVE NODE` is not a pause. Power the machine down instead, and leave it enrolled — it will
show as `OFFLINE` until it comes back.
