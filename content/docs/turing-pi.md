---
title: "Rasputin on a Turing Pi 2"
description: "Provisioning a Turing Pi 2 cluster board with Rasputin — including a flashing path that needs no USB cable, and the module choice that avoids the whole problem."
weight: 11
---

The [Turing Pi 2](https://turingpi.com/) puts four compute modules on one mini-ITX board with a BMC that can power,
flash and reach the serial console of every slot over the network. That maps closely onto
what Rasputin already does, so a Turing Pi makes a tidy Rasputin cluster.

This guide is written against **Rasputin OS 2026.07.6**, Turing Pi board revision 2.5.1, Turing
Pi BMC firmware 2.3.2, and Raspberry Pi Compute Module 4. Everything here was run on that
hardware.

## Read this before you buy modules

**If you have the choice, get CM4 *Lite* modules — the ones without on-board eMMC.**

The CM4's single SDIO0 bus is hardwired to on-module eMMC on non-Lite parts, so the microSD
slot on the Turing Pi's CM4 adapter **only works with Lite modules**.

With a Lite module, installing Rasputin is the same as on any other Raspberry Pi: follow the
[download page](/download/), which flashes the card for you. Put the finished card in the CM4
adapter's microSD slot, seat the adapter in a node slot, and power it on.

Everything between here and [Provision the cluster](#provision-the-cluster) is only needed for
eMMC modules.

With an eMMC module there is no card slot to use, so the image has to be written to the eMMC
over the board — which is the rest of this page. It works fine and it is not difficult, but it
takes about 17 minutes per node and a few steps you would otherwise skip.

Either kind makes a perfectly good Rasputin node once it is running. This only affects how you
install.

## What you need for an eMMC install

| | |
|---|---|
| **A microSD card in the *BMC's* own slot** | Not a node slot. The BMC's internal storage is about 144 MB — too small to hold a multi-GB image. 64 GB exFAT worked here; the BMC also reads ext2/3/4, vfat and f2fs. |
| **The BMC on your LAN, and its address** | See the note below on finding it. |
| **BMC credentials** | Default `root` / `turing`. Authentication is required as of BMC firmware 2.0.0. |
| **The `rasputin-provision` tool** | You install this yourself — see below. It generates the cluster's seed files. |

**Finding the BMC's address.** `turingpi.local` resolves over mDNS if your machine is on the
same network segment. If that name does not resolve for you, look up the BMC's IP in your
router's DHCP lease list. Everywhere this guide writes `<bmc-ip>`, substitute whichever one
works for you.

**Installing `rasputin-provision`.** It is not part of the OS image — it runs on *your*
machine, not on a node. Build it from the control-plane source with
[Go](https://go.dev/dl/) 1.26 or newer installed:

```bash
git clone https://github.com/geekdojo/rasputin-control-plane.git
cd rasputin-control-plane/api
go build -o ../rasputin-provision ./cmd/rasputin-provision
cd ..
```

That leaves a `rasputin-provision` binary in the `rasputin-control-plane` directory. Run it as
`./rasputin-provision` from there, or copy it somewhere on your `PATH` — the examples below
write it without a path.

Check your BMC firmware version before starting:

```bash
curl -sk -u root:turing "https://<bmc-ip>/api/bmc?opt=get&type=about"
```

This guide was written against 2.3.2 and we left the firmware where it was. There is an open
report upstream (BMC-Firmware #134) of a 1.0.2 → 1.1.0 update leaving a board unresponsive, so
if you are on an older version it is worth reading up before updating rather than doing it
as a reflex.

## Generate the matched set

One entry for the control plane, one per additional node:

```bash
rasputin-provision \
  --cluster-id my-cluster \
  --node controlplane:cp-1 \
  --node compute:node-1 \
  --ssh-authorized-key-file ~/.ssh/<your-key>.pub \
  --out ./my-cluster
```

Substitute your own values:

- `--cluster-id` — any short lowercase name for this cluster.
- `--node <role>:<name>` — one `controlplane` entry, plus one `compute` entry per other node.
  The names are yours to choose; they are how each node appears in the dashboard.
- `--ssh-authorized-key-file` — your SSH **public** key, the `.pub` file. If you do not have
  one, `ssh-keygen -t ed25519` creates a pair; the public half is the `.pub`.
- `--out` — a directory to write into.

That directory will then contain one `seed-<name>.env` per node — `seed-cp-1.env` and
`seed-node-1.env` for the example above — plus `controlplane-bus-tokens.json` and a
`manifest.json` audit record. **Keep the whole directory; the seeds contain join
credentials.**

The SSH key is load-bearing. Rasputin images bake **no** SSH key of any kind, so without one
your only way in is the serial console.

## Stage the image on the BMC's card

The card is not mounted automatically — and until it is, the BMC will report its own 144 MB of
internal storage, which is misleading if you are checking for free space.

```bash
ssh root@<bmc-ip> 'mkdir -p /mnt/sdcard && mount /dev/mmcblk0p1 /mnt/sdcard'
scp -O rasputin-os-rpi-2026.07.6.img root@<bmc-ip>:/mnt/sdcard/rasputin-rpi.img
```

The `rpi` image from the [download page](/download/) is compressed, and the BMC needs it
**decompressed** — `xz -d rasputin-os-rpi-2026.07.6.img.xz` gives roughly 3.1 GB. Copying it
across takes about 8 minutes.

Stage it once: the same file flashes every node.

## Flash a node

Drive the BMC's REST API directly:

```bash
# node is 0-BASED here: node=0 is slot 1, node=1 is slot 2
curl -sk -u root:turing \
  "https://<bmc-ip>/api/bmc?opt=set&type=flash&node=0&file=/mnt/sdcard/rasputin-rpi.img&local=true"
# -> {"handle":<id>}

# poll for progress
curl -sk -u root:turing "https://<bmc-ip>/api/bmc?opt=get&type=flash"
```

`local=true` is required — without it the BMC expects an upload body rather than a path it
already has, and answers ``Invalid `length` query parameter``.

Two things worth knowing:

- **Flash is an asynchronous job owned by the BMC**, not by your client. Closing the connection
  does not cancel it. The status endpoint keeps reporting the *previous* job's `Done` until a
  new one starts, so a `Done` you did not just cause means no job started — not success.
- **Power only the node you are flashing.** With two modules enumerating, slot-targeted USB
  operations fail with `Several supported devices found`.

Expect roughly 17 minutes per node.

> The vendor also documents flashing over USB from a PC using `rpiboot`. On our board that
> handshook once and we could not reproduce it across three cable positions, both USB modes and
> six power cycles. The BMC path above needs no USB cable at all, so that is what we use and
> what this guide covers.

## First boot

Power the node and watch it come up through the BMC's console:

```bash
# uart is 0-based too
curl -sk -u root:turing "https://<bmc-ip>/api/bmc?opt=get&type=uart&node=0"
```

You should see:

```
rasputin-firstboot: ERROR: no provisioning seed — this node is un-provisioned.
```

That is expected and safe. Firstboot does not mark itself complete, so it runs again as soon as
a seed appears. No image changes are needed for the console — the `rpi` image already enables
the UART the Turing Pi routes to its BMC.

## Install your SSH key over the console

Since the image bakes no key, the first one goes in over the serial console. Writes are one
command at a time:

```bash
u(){ curl -sk -u root:turing --get \
  --data-urlencode "opt=set" --data-urlencode "type=uart" --data-urlencode "node=0" \
  --data-urlencode "cmd=$1" "https://<bmc-ip>/api/bmc"; }

u "root"; u "rasputin"
u "mkdir -p /var/lib/rasputin/dropbear && chmod 700 /var/lib/rasputin/dropbear"
u "echo '<your-ssh-public-key>' > /var/lib/rasputin/dropbear/authorized_keys"
u "chmod 600 /var/lib/rasputin/dropbear/authorized_keys"
```

## Provision the cluster

The seed partition is mounted read-write on a running node, so seeding is a copy and a reboot —
no reflash, no card removal:

Do the control plane first. `<node-ip>` is that node's address on your LAN — find it in your
router's DHCP leases, or read it off the node's console with the `uart` command above, which
prints an `IP address:` line at the login prompt.

```bash
scp -O ./my-cluster/seed-cp-1.env \
  root@<node-ip>:/run/rasputin-seed/rasputin-seed.env
ssh root@<node-ip> reboot
```

The file must be named `rasputin-seed.env` on the node — that is the name firstboot looks for.

Wait for the control plane to come back, then open `https://rasputin.local` and register a
passkey. Repeat the two commands above for each compute node using its own `seed-<name>.env`;
they will find the control plane and enroll themselves.

From here it is ordinary Rasputin — see [Provisioning & the seed
file](/docs/provisioning/).

## Power control from the dashboard

Rasputin can drive the Turing Pi's BMC, so nodes get **BMC ON/OFF** and **FORCE RESTART** in
their panel. Console is deliberately not offered on this board — use the Turing Pi's own
`tpi uart` or its web console instead, and see [BMC — power and console](/docs/bmc/) for why.

Configuration currently lives in the control-plane node's environment file. SSH to the control
plane and add:

```bash
# /var/lib/rasputin/node.env
RASPUTIN_BMC_BACKEND=turingpi
RASPUTIN_BMC_TURINGPI_ENDPOINT=turingpi.local
RASPUTIN_BMC_TURINGPI_USER=root
RASPUTIN_BMC_TURINGPI_PASS=<your-bmc-password>
RASPUTIN_BMC_TURINGPI_MAP=cp-1:1,node-1:2
RASPUTIN_BMC_TURINGPI_FINGERPRINT=<sha256-of-the-bmc-cert>
```

`MAP` tells Rasputin which board slot each node sits in: `<node-id>:<slot>`, comma-separated,
using the node names you chose earlier and the slot numbers printed on the board (1–4). List
only the slots you have filled.

The fingerprint pins the BMC's TLS certificate. The board presents a self-signed certificate
minted at the Unix epoch — it has no clock at boot — so it reads as permanently expired and no
certificate-authority trust can accept it. Pinning the exact certificate is both stricter and
the only thing that works. Get it with:

```bash
echo | openssl s_client -connect <bmc-ip>:443 2>/dev/null \
  | openssl x509 -noout -fingerprint -sha256
```

Then restart the agent (`systemctl restart rasputin-agent`) and the controls appear.

> Editing a file over SSH is the current mechanism, not the intended one. A Settings form for
> this — discovering the board, confirming its certificate, and holding the credentials — is
> designed and on the [roadmap](/docs/roadmap/). Until it lands, the environment file is the
> supported path, and the Settings picker cannot configure this backend.

## Notes

- **Slot numbering is inconsistent in the BMC API.** `power` uses 1-based names (`node1=1`),
  while `usb`, `uart` and `flash` take a 0-based `node` value. Reading slot 1's console as
  `node=1` returns slot 2's empty buffer with no error, which looks exactly like a dead console.
  Rasputin's driver handles this internally; it only matters when driving the API by hand, as
  above.
- **A CM4 has no NVMe option on this board.** The M.2 slot is wired for the RK1; a CM4 runs on
  its eMMC or SD card. Keep write-heavy workloads off CM4 nodes.
- **DHCP leases move.** A node's address is not its identity — reach the cluster by name, and
  the BMC by `turingpi.local`.
- **There is no RK1 image yet.** Rasputin currently ships images for Raspberry Pi (`rpi`) and
  x86 (`n100`), so the Turing RK1 module is not supported as a Rasputin node today. It is a
  genuine build target rather than a refusal — if you would like one, [open an
  issue](https://github.com/geekdojo/rasputin-os/issues) and tell us. Demand is how we decide
  what to add next. An RK1 can still sit in a slot running something else; Rasputin's BMC
  controls work per slot regardless of what is in them.
