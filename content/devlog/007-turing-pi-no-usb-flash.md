---
title: "Flashing a Turing Pi without the USB cable"
date: 2026-08-04
description: "Two CM4 modules on a Turing Pi 2 now run stock Rasputin OS 2026.07.6. The documented rpiboot-over-USB path handshook once and never reproduced, so the image went onto the BMC's own microSD card and flashed over the BMC's REST API — 994 seconds a node, no USB cable involved."
summary: "Two CM4 modules on a Turing Pi 2 now run stock Rasputin OS 2026.07.6. The documented rpiboot-over-USB path handshook once and never reproduced, so the image went onto the BMC's own microSD card and flashed over the BMC's REST API — 994 seconds a node, no USB cable involved."
---

Two CM4 modules on a Turing Pi 2 now run stock Rasputin OS `2026.07.6`, enrolled
under bus-auth `enforce`, with no image changes. The vendor's documented
flashing path — rpiboot over USB from a PC — handshook once and never
reproduced. The path that works stages the image on the BMC's own microSD card
and flashes over the BMC's REST API, with no USB cable involved.

**Timeline**

- 2026-07-27: Turing Pi 2 on the bench, board rev 2.5.1, BMC firmware 2.3.2,
  two `CM4004008` modules — 4 GB RAM, 8 GB eMMC, no wireless.
- rpiboot connected once, sent `bootcode.bin`, and reached the second-stage boot
  server. Nothing after that ever enumerated — across three cable positions,
  both BMC USB modes, and six power cycles. A half-second-resolution watch of
  the USB bus through a full cold cycle caught no enumeration at all, not even a
  transient one.
- Switched to the BMC. Its internal storage is 144 MB, so a 3.1 GB image needs a
  card in the BMC's own microSD slot. A 64 GB exFAT card mounted fine — the BMC
  kernel carries exfat, ext2/3/4, vfat and f2fs.
- SCP to that card: 8 minutes at 6.4 MB/s. Flash: 994 seconds,
  3,288,336,384 bytes, byte-exact against the source.
- 2026-07-28: second node flashed in 993 seconds. Two-node cluster live.

**The fix**

`tpi flash` is a client of the BMC's REST API, and on the second node it failed
silently — no output, no process, no job created, while `opt=get&type=flash`
kept returning the *previous* job's `Done`. That reads exactly like success.
Driving the API directly worked:

```
curl -sk -u root:turing \
  "https://<bmc>/api/bmc?opt=set&type=flash&node=1&file=/mnt/sdcard/rasputin.img&local=true"
{"handle":850517293}
```

`local=true` is required — omit it and the BMC answers ``Invalid `length` query
parameter``, because it expects an upload body rather than the path it already
holds. Progress comes from `opt=get&type=flash`, and the job belongs to `bmcd`:
killing the client does not cancel it, and a stale `Done` means no job started.

Node indexing in that API is worth reading twice. `power` takes 1-based
parameter *names* (`node1=1`). `usb`, `uart` and `flash` take a 0-based `node`
*value*. Reading slot 1's console as `node=1` returns slot 2's empty buffer with
no error, which costs about twenty minutes of believing the console is dead.

Seeding needed no reflash. The seed partition is mounted read-write on a running
node, so provisioning is `scp` plus a reboot:

```
scp -O seed-tp-cp1.env root@<node>:/run/rasputin-seed/rasputin-seed.env
```

Rasputin images bake no SSH key, so the first key goes in over the BMC's UART —
`opt=set&type=uart` drives a console shell one command at a time. Slow, and
enough to bootstrap the rest.

**Takeaway:** when a documented flashing path dies, inventory what the
management processor can already reach. On this board that was storage, a
network API, and a serial console — enough to provision the whole cluster
without touching the USB port.

{{< devlog-footer >}}
