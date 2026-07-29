---
title: "Rasputin on a Turing Pi 2"
description: "Provisioning a Turing Pi 2 cluster board with Rasputin — including a flashing path that needs no USB cable, and the module choice that avoids the whole problem."
weight: 11
---

The [Turing Pi 2](https://turingpi.com/) puts four compute modules on one mini-ITX board with a BMC that can power,
flash and reach the serial console of every slot over the network. That maps closely onto
what Rasputin already does, so a Turing Pi makes a tidy Rasputin cluster.

This guide is written against **Rasputin OS 2026.07.7**, Turing Pi board revision 2.5.1, Turing
Pi BMC firmware 2.3.2, and Raspberry Pi Compute Module 4. Everything here was run on that
hardware.

## Read this before you buy modules

**If you have the choice, get CM4 *Lite* modules — the ones without on-board eMMC.**

The CM4's single SDIO0 bus is hardwired to on-module eMMC on non-Lite parts, so the microSD
slot on the Turing Pi's CM4 adapter **only works with Lite modules**.

Which kind you have decides which half of this page you follow:

| Module | Path |
|---|---|
| **CM4 Lite** (no eMMC) | [Lite modules — the short path](#lite-modules--the-short-path). The card slot works, so this is the ordinary Rasputin install. |
| **CM4 with eMMC** | [eMMC modules — flashing over the BMC](#emmc-modules--flashing-over-the-bmc). No usable card slot, so the board writes the image itself. |

Either kind makes a perfectly good Rasputin node once it is running. This only affects how you
install.

## Lite modules — the short path

Nothing here is Turing Pi specific. A Lite module boots from the adapter's microSD slot, so it
installs like any other Raspberry Pi.

**The control-plane node.** Follow the [download page](/download/). Its one-line installer
flashes the card *and* writes the node's seed, so the card comes out ready to boot.

**Every other node.** Once the control plane is up, use its own **Add node** wizard. It hands
you a one-liner with that node's enrollment seed already baked in — you do not create seeds by
hand.

For each node: put the finished card in the CM4 adapter's microSD slot, seat the adapter in a
board slot, and power it on.

That is the whole install. You can skip to [Power control from the
dashboard](#power-control-from-the-dashboard) — the sections in between exist only because
eMMC modules cannot use a card.

## eMMC modules — flashing over the BMC

An eMMC module has no usable card slot, so the image has to be written to the on-module eMMC
by the board itself. The one-line installer on the download page cannot help here — it flashes
a drive attached to *your* machine — so this path is manual: generate the cluster's seeds
yourself, stage the image on the BMC, flash each node, and seed it afterwards.

It works reliably. It just takes about 17 minutes per node and several steps the Lite path
does not have.

### What you need

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

### Generate the matched set

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

### Stage the image on the BMC's card

The card is not mounted automatically — and until it is, the BMC will report its own 144 MB of
internal storage, which is misleading if you are checking for free space.

```bash
ssh root@<bmc-ip> 'mkdir -p /mnt/sdcard && mount /dev/mmcblk0p1 /mnt/sdcard'
scp -O rasputin-os-rpi-2026.07.7.img root@<bmc-ip>:/mnt/sdcard/rasputin-rpi.img
```

The `rpi` image from the [download page](/download/) is compressed, and the BMC needs it
**decompressed** — `xz -d rasputin-os-rpi-2026.07.7.img.xz` gives roughly 3.1 GB. Copying it
across takes about 8 minutes.

Stage it once: the same file flashes every node.

### Flash a node

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

### First boot

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

### Install your SSH key over the console

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

### Seed each node

The seed partition is mounted read-write on a running node, so seeding is a copy and a reboot —
no reflash, and nothing to remove from the board.

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

This applies however you installed — Lite or eMMC, it is the board's BMC either way.

Once configured, every node gets **BMC ON/OFF** and **FORCE RESTART** in its panel. Console is
deliberately not offered on this board — use the Turing Pi's own `tpi uart` or its web console
instead, and see [BMC — power and console](/docs/bmc/#why-the-turing-pi-has-no-console) for why.

Go to **Settings → BMC** and choose **Turing Pi 2 / 2.5**, then pick the node that will talk to
the board — the control plane is the usual choice, and it has to be on the board's network.

1. **Enter the BMC username and password.** Defaults are `root` / `turing`. If yours are still
   the defaults, change them on the board first: its BMC is reachable on your LAN and that
   account also has SSH.
2. **Press DETECT BOARD.** Leave the address blank and it finds the board itself, then shows
   you the certificate it presented. You do not need to know the board's IP, and you do not
   need to read the certificate out yourself.
3. **Check the certificate, then press DETECT BOARD again.** The second press reads each slot's
   console and fills in which node is in which slot. Your password is only ever sent to a board
   presenting the certificate you accepted.
4. **Adjust the slot list if you need to and press APPLY.** Slots the board could not identify
   — powered off, or running something that is not Rasputin — are left for you to set.

The controls appear as soon as the node running the BMC re-registers.

**About that certificate.** The board's is self-signed and dated 1970, because the BMC has no
clock at boot. It therefore always reads as expired, and no certificate-authority trust can
accept it — pinning the exact certificate is both stricter and the only thing that works. If it
ever changes, Rasputin refuses to connect rather than trusting the new one silently; clear the
fingerprint and detect again if you deliberately reinstalled the BMC firmware.

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
