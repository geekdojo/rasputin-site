---
title: "Rasputin on a Turing Pi 2"
description: "Provisioning a Turing Pi 2 cluster board with Rasputin — including a flashing path that needs no USB cable, and the module choice that avoids the whole problem."
weight: 22
applies-to: "2026.09.4"
---

The [Turing Pi 2](https://turingpi.com/) puts four compute modules on one mini-ITX board with a BMC that can power,
flash and reach the serial console of every slot over the network. That maps closely onto
what Rasputin already does, so a Turing Pi makes a tidy Rasputin cluster.

This guide is written against **Rasputin OS 2026.09.4**, Turing Pi board revision 2.5.1, Turing
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
a drive attached to *your* machine — so this path is manual: get one seed per node, put each
seed inside its own copy of the image, stage the copies on the BMC, and have the BMC flash each
node. Every node boots already seeded.

It works reliably. It just takes about 17 minutes per node and several steps the Lite path
does not have.

### Words this section uses

Substitute your own value everywhere one of these appears:

| Placeholder | What it means | Example |
|---|---|---|
| `<bmc-ip>` | The Turing Pi BMC's address on your network. See *Finding the BMC's address* below. | `turingpi.local` |
| `<version>` | The Rasputin OS version in the image's file name. | `2026.09.4` |
| `<node>` | The node's name — the one its seed was made for. | `cp-compute4` |
| `<slot>` | The board slot the module sits in, **1 to 4**, as printed on the board. | `1` |
| `<slot-1>` | The same slot minus one (**0 to 3**). Some BMC calls count from zero; see [Notes](#notes). | `0` |
| `<node-ip>` | The address the node gets from your DHCP server once it boots. | `192.168.1.170` |

### What you need

| | |
|---|---|
| **A microSD card in the *BMC's* own slot** | Not a node slot. The BMC's internal storage is about 144 MB — too small to hold a multi-GB image. 64 GB exFAT worked here; the BMC also reads ext2/3/4, vfat and f2fs. |
| **The BMC on your LAN, and its address** | See the note below on finding it. |
| **SSH access to the BMC as `root`** | Every BMC command in this guide runs *on the BMC*, over SSH. The default password is `turing`; if you have added your SSH key to the BMC, no password is asked for. |
| **`xz` and `mtools` on your machine** | `xz` decompresses the image; `mtools` writes a file into the image without mounting it. Neither ships with macOS. Install them with `brew install xz mtools` on macOS, or `sudo apt install xz-utils mtools` on Debian or Ubuntu. |
| **A seed for every node** | Where each one comes from is covered below. |

**Finding the BMC's address.** `turingpi.local` resolves over mDNS if your machine is on the
same network segment. If that name does not resolve for you, look up the BMC's IP in your
router's DHCP lease list. Use whichever works as `<bmc-ip>`.

**Why the BMC commands run over SSH.** The BMC's REST API, called from your own machine,
answers `401 Unauthorized` unless you send the BMC username and password with every request.
On the BMC itself, the same API at `127.0.0.1` answers without them. So you log in once with
`ssh`, and your BMC password never goes into a command line or your shell history.

Check your BMC firmware version before starting:

```bash
ssh root@<bmc-ip> 'curl -sk "https://127.0.0.1/api/bmc?opt=get&type=about"'
```

`curl -s` hides the progress meter. `-k` accepts the BMC's self-signed certificate, which is
safe here because the request never leaves the BMC.

This guide was written against 2.3.2 and we left the firmware where it was. There is an open
report upstream (BMC-Firmware #134) of a 1.0.2 → 1.1.0 update leaving a board unresponsive, so
if you are on an older version it is worth reading up before updating rather than doing it
as a reflex.

### Get each node's seed

A seed is the node's `rasputin-seed.env` enrollment file: its name, role, and the credentials
it joins the cluster with. **Every seed is a credential.** Keep it somewhere private and delete
it once the node is running.

Where a seed comes from depends on the node:

- **The control plane**, if it is on this board, is the one node that exists before there is
  a cluster to ask. Its seed comes from the `rasputin-provision` tool, given the control plane
  and nothing else — see [The control plane's seed](#the-control-planes-seed).
- **Every other node** gets its seed from the running control plane's **Add node** wizard, one
  node at a time — see [Every other node's seed](#every-other-nodes-seed). Never put a
  non-control-plane node into `rasputin-provision`.

So on a board that holds the control plane, do the control plane all the way through first,
then come back for the rest.

#### The control plane's seed

`rasputin-provision` is not part of the OS image — it runs on *your* machine. Build it from the
control-plane source with [Go](https://go.dev/dl/) 1.26 or newer installed:

```bash
git clone https://github.com/geekdojo/rasputin-control-plane.git
cd rasputin-control-plane/api
go build -o ../rasputin-provision ./cmd/rasputin-provision
cd ..
```

That leaves a `rasputin-provision` binary in the `rasputin-control-plane` directory; run it
from there as `./rasputin-provision`. Then:

```bash
./rasputin-provision \
  --cluster-id my-cluster \
  --node controlplane:cp-1 \
  --ssh-authorized-key-file ~/.ssh/<your-key>.pub \
  --out ./my-cluster
```

- `--cluster-id` — any short lowercase name for this cluster.
- `--node controlplane:<name>` — the control plane, and only the control plane.
- `--ssh-authorized-key-file` — your SSH **public** key, the `.pub` file. If you do not have
  one, `ssh-keygen -t ed25519` creates a pair; the public half is the `.pub`.
- `--out` — a directory to write into.

Among the files it writes is `seed-cp-1.env` (`seed-<name>.env`). That is the control plane's
seed. **Keep the whole directory private; the control plane's seed contains the cluster's bus
private key.**

The SSH key is load-bearing. Rasputin images bake **no** SSH key of any kind, so without one
your only way in is the serial console.

#### Every other node's seed

Once the control plane is running, sign in to its dashboard and use
[Add a node](/docs/add-a-node/), once per module:

1. On **Nodes**, click an open bay.
2. `ROLE`: **COMPUTE**. `ARCHITECTURE`: **ARM64** (a CM4 is a Raspberry Pi).
3. Accept or edit `NODE NAME`. This becomes `<node>`.
4. Check the `SSH KEY` field holds your public key.
5. Press **GENERATE ENROLLMENT FILE**.
6. Ignore the one-line command — it flashes a drive attached to your machine, and this module
   has none. Expand **Prefer to flash manually?** and press **DOWNLOAD rasputin-seed.env**.
7. Rename the download to `seed-<node>.env` so seeds for different nodes cannot get mixed up.
8. Press **DONE**. The node shows as pending until it boots and joins.

Each seed is bound to the one node name it was generated for.

### Put each node's seed inside its own copy of the image

**This is the step that replaces logging in at the console.** A seed sitting on the image's
`RASPUTIN-OS` volume before the node ever boots is how every other Rasputin install is
provisioned — the one-line installer on the [download page](/download/) does exactly this to a
drive attached to your machine. Here you do it to the image file instead, because the drive is
soldered to the module.

`mtools` writes straight into the image file: no mounting and no `sudo`, and the same commands
work on macOS and Linux.

```bash
# decompress once — the BMC needs the raw .img  (-k keeps the .xz)
xz -dk rasputin-os-rpi-<version>.img.xz

# then, per node:
cp rasputin-os-rpi-<version>.img rasputin-os-rpi-<version>-<node>.img

# 1. check you are pointing at the right volume — this must print  disk label="RASPUTIN-OS"
minfo -i rasputin-os-rpi-<version>-<node>.img@@512 :: | grep 'disk label'

# 2. write the seed under the name firstboot looks for
mcopy -o -i rasputin-os-rpi-<version>-<node>.img@@512 seed-<node>.env ::rasputin-seed.env

# 3. read it back and compare with your seed
mtype -i rasputin-os-rpi-<version>-<node>.img@@512 ::rasputin-seed.env | cmp - seed-<node>.env \
  && echo "seed is in the image"
```

What the pieces mean:

- **`@@512`** tells `mtools` the volume starts **512 bytes** into the file. `RASPUTIN-OS` is the
  image's first partition and starts at sector 1, and a sector is 512 bytes.
- **`::`** means the root of that volume. `::rasputin-seed.env` is a file at its root.
- **`-o`** on `mcopy` overwrites without asking. The image already carries an empty template
  `rasputin-seed.env`, and your seed replaces it.

**Do not skip step 1.** The image has three FAT volumes, and only `RASPUTIN-OS` is the seed.
Writing to the wrong one verifies clean and boots the node unseeded. If step 1 prints any other
label, or nothing, stop: this image's layout is not the one described here.

The file **must** be named `rasputin-seed.env` — that is the name firstboot looks for.

### Stage the images on the BMC's card

Check whether the card is already mounted:

```bash
ssh root@<bmc-ip> 'mount | grep mmcblk0p1'
```

If that prints a line ending in `on /mnt/sdcard …`, it is mounted; skip ahead. If it prints
nothing, mount it:

```bash
ssh root@<bmc-ip> 'mkdir -p /mnt/sdcard && mount /dev/mmcblk0p1 /mnt/sdcard'
```

Then copy each node's image. `-O` makes `scp` use the classic SCP protocol instead of SFTP,
which is how these steps were tested:

```bash
scp -O rasputin-os-rpi-<version>-<node>.img root@<bmc-ip>:/mnt/sdcard/
```

Each image is about 3.3 GB and takes roughly 6 to 8 minutes. A 64 GB card holds several
comfortably.

Confirm each arrived intact before you flash it — a truncated image gives a node the wrong
identity or no identity at all. The two checksums must be identical:

```bash
shasum -a 256 rasputin-os-rpi-<version>-<node>.img
ssh root@<bmc-ip> 'sha256sum /mnt/sdcard/rasputin-os-rpi-<version>-<node>.img'
```

### Flash a node

Log in to the BMC and stay there for this section:

```bash
ssh root@<bmc-ip>
```

Everything below runs in that BMC shell.

**Power only the node you are flashing.** With two modules enumerating, slot-targeted USB
operations fail with `Several supported devices found`. See what is on, then switch off the slot
you are about to flash and any other module that is on:

```bash
tpi power status
# power counts from 1: node1 is slot 1
curl -sk "https://127.0.0.1/api/bmc?opt=set&type=power&node<slot>=0"
```

Start the flash. Note that `flash` counts from **0**, so it takes `<slot-1>`:

```bash
# node=0 is slot 1, node=1 is slot 2
curl -sk "https://127.0.0.1/api/bmc?opt=set&type=flash&node=<slot-1>&file=/mnt/sdcard/rasputin-os-rpi-<version>-<node>.img&local=true"
# -> {"handle":1681083719}   (your number will differ — note it)

# poll for progress
curl -sk "https://127.0.0.1/api/bmc?opt=get&type=flash"
# -> {"Transferring":{"id":1681083719,...,"bytes_written":769474560}}
```

`local=true` is required — without it the BMC expects an upload body rather than a path it
already has, and answers ``Invalid `length` query parameter``.

Three things worth knowing:

- **Flash is an asynchronous job owned by the BMC**, not by your SSH session. Closing the
  connection does not cancel it. The status endpoint keeps reporting the *previous* job's
  `Done` until a new one starts, so check that the `id` in `Transferring` is the `handle` you
  were just given. A `Done` you did not just cause means no job started — not success.
- **The progress counter runs twice.** `bytes_written` climbs to the image size, then **resets to
  zero and climbs again**: the BMC writes the image and then reads it back to verify, both under
  the one `handle`. Treating that reset as a failed restart — or treating a full counter as
  completion — misreads a healthy flash.
- **Only `Done` means finished.** It reports the elapsed seconds and the byte count together,
  e.g. `{"Done":[{"secs":994,...},3288336384]}`.

Expect roughly 17 minutes per node. To flash the next module, keep this one off, then repeat
this section for the next slot and image.

> The vendor also documents flashing over USB from a PC using `rpiboot`. On our board that
> handshook once and we could not reproduce it across three cable positions, both USB modes and
> six power cycles. The BMC path above needs no USB cable at all, so that is what we use and
> what this guide covers.

### First boot provisions the node

When every module you are flashing is done, power each one on, still in the BMC shell:

```bash
curl -sk "https://127.0.0.1/api/bmc?opt=set&type=power&node<slot>=1"
```

**The node boots twice.** On the first boot, firstboot consumes the seed and the node reboots
itself; on the second it picks up a DHCP address and joins the cluster. Watch it appear in the
dashboard — the pending node turns online, usually within a couple of minutes of power-on.

The BMC console shows the boot too:

```bash
tpi uart -n <slot> get      # tpi counts from 1, like power
```

Expect kernel messages and a login prompt with the node's address, e.g.
`IP address: 192.168.1.170`. That is your `<node-ip>`. Firstboot's own messages did **not**
appear on the console in our runs, so don't wait for them there.

They are in the node's journal, from the first of its two boots. Your SSH key came in with the
seed, so you can log in now. A reflashed node has a new host key, so forget any old one for that
address first:

```bash
ssh-keygen -R <node-ip>
ssh root@<node-ip> 'journalctl -b -1 | grep rasputin-firstboot'
```

`-b -1` means the boot before the current one. Among the lines you should see:

```
rasputin-firstboot: scrubbed consumed secrets (join token, bus key) from seed FAT
rasputin-firstboot: provisioning complete
```

Their timestamps can show the image's build time rather than the real time, because the node
only sets its clock later in that first boot.

To confirm the node joined, look for the agent's registration in the current boot:

```bash
ssh root@<node-ip> 'journalctl -b | grep "registered as"'
# -> rasputin-agent: registered as cp-compute4 (role=compute)
```

Note the scrub: the join token and bus key are removed from the node's seed volume once
consumed. **The image copies are not scrubbed** — each still holds its node's unused seed. Once
the node is online, delete them, on your machine and on the BMC's card, along with the
`seed-<node>.env` files:

```bash
rm rasputin-os-rpi-<version>-<node>.img seed-<node>.env
ssh root@<bmc-ip> 'rm /mnt/sdcard/rasputin-os-rpi-<version>-<node>.img'
```

## Power control from the dashboard

This applies however you installed — Lite or eMMC, it is the board's BMC either way.

Once configured, every node gets **BMC ON/OFF** and **FORCE RESTART** in its panel. Console is
deliberately not offered on this board — use the Turing Pi's own `tpi uart` or its web console
instead, and see [whether your hardware has a console at
all](/docs/open-a-serial-console/#whether-your-hardware-has-a-console-at-all) for why.

Go to **Settings → BMC** and choose **Turing Pi 2 / 2.5**, then pick the node that will talk to
the board — the control plane is the usual choice, and it has to be on the board's network.

1. **Enter the BMC username and password.** Defaults are `root` / `turing`. If yours are still
   the defaults, change them on the board first: its BMC is reachable on your LAN and that
   account also has SSH.
2. **Press DETECT BOARD.** Leave **BMC ADDRESS** blank and it finds the board itself, then
   shows you the pin for the key it presented. You do not need to know the board's IP, and you
   do not need to read anything out of the board yourself. The search runs from the BMC host
   node, which is on the board's network — not from your browser, which may not be. Type an
   address (`turingpi.local`, or an IP) only if you would rather not have it look.
3. **Press ACCEPT THIS BOARD.** It is its own button because it is the moment you decide to
   trust this board. Rasputin then reads the board again with your credentials and fills in
   which node is in which slot, by reading each slot's console for its login prompt. Your
   password is only ever sent to a board presenting the key you accepted.
4. **Adjust the slot list if you need to and press APPLY.** Slots the board could not identify
   — powered off, or running something that is not Rasputin — are left for you to set.

The controls appear as soon as the node running the BMC re-registers.

**About that pin.** The board's certificate is self-signed and dated 1970, because the BMC has
no clock at boot. It therefore always reads as expired, and no certificate-authority trust can
accept it — pinning is both stricter and the only thing that works. What is pinned is the
board's key, in the same form as the pin your cluster's own bus uses, so a firmware update that
re-issues the certificate for the same key changes nothing. If the key ever does change,
Rasputin refuses to connect rather than trusting the new one silently, and names the two things
that cause it — the BMC firmware was reinstalled, or something else is answering in the board's
place. Detect the board again if it was the former.

**It works the way `ssh` does when it asks about an unknown host key**, and it carries the same
honest limitation: nothing independently verifies the key the *first* time you are shown it, and
the board's own web interface displays nothing to compare it against. On a network you control
that is a reasonable trade, and it is the same one `ssh` asks you to make.

Rasputin only talks to this board over HTTPS, with a pin. There is no option to accept any
certificate and no option to use a plain `http://` address: either would put the BMC password —
an account that also has SSH and controls power for every node in the chassis — on your network
in the clear. If a board was configured that way before, Settings says so and asks you to detect
it again; until you do, nothing is sent to it.

One thing worth being clear about: Rasputin recognizes a Turing Pi by how its BMC answers an
unauthenticated request, which is what lets the page say it found one before you have typed a
password. That is identification, not a security check — anything can imitate that response.
The key is the thing you accept, which is why your password only ever goes to a board presenting
the one you accepted.

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
