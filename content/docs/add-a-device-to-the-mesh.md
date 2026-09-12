---
title: "Add a device to the mesh"
description: "Mint a one-time key, trust your cluster's certificate on that device, and join it to the tailnet — with what the key is worth, and what joining actually grants."
weight: 91
applies-to: "2026.08.5"
---

This is how your laptop or phone joins the mesh. A **pre-auth key** is a one-time secret that
lets a Tailscale client register with your coordinator without a login prompt.

Two things decide whether this goes smoothly. **The key is shown exactly once** — copy it the
moment it appears. And **the device has to trust your cluster's certificate before it can
join**, which is a per-device step the Mesh section does not walk you through; it is
[the step that strands people](#trusting-your-clusters-certificate-on-that-device).

`<cluster-id>` throughout is your cluster's own identifier, fixed when you provisioned it.

## Do this

1. **Open `Mesh → KEYS` and press `ADD DEVICE`.** Four inputs: **name** (your label, e.g.
   `Work laptop`), **device hint** (optional free text), **expiry** (`1h`,
   `24h (recommended)`, or `7d`), and **reusable** — **leave reusable unchecked**.
2. **Press `GENERATE KEY`.** It mints immediately; you do not need `APPLY` first. A banner
   appears with the key and a ready-made command.
3. **Copy the key or the command now, before you close that banner.** It is not stored in a
   form you can read back and there is no "show it again".
4. **On the device, install the Tailscale client** — from your operating system's usual
   package source, or the App Store on an iPhone or iPad.
5. **On the device, trust your cluster's certificate authority.** Open
   `https://<cluster-id>.local/trust` on that device and follow the block for its operating
   system. Without this the client cannot talk to your coordinator at all. See
   [below](#trusting-your-clusters-certificate-on-that-device).
6. **Point the client at your coordinator and hand it the key.** On a desktop or server that
   is one command, in the shape the banner's copy button gives you — see below.
7. **Confirm it worked.** The device appears on **DEVICES** with kind `USER` and a tailnet IP
   — within five minutes, or immediately if you press `RECONCILE`.

The command in step 6:

```
tailscale up --login-server=<your-rasputin-mesh-url> --auth-key=<your-key>
```

The two placeholders are not equal. **`<your-key>` is already substituted for you** — what the
banner copies contains the real key. **`<your-rasputin-mesh-url>` is a literal placeholder**
and is the one part you replace: use the **`login server`** URL from the mesh header, which
looks like `https://<cluster-id>.local:18080`.

**On an iPhone or iPad** there is no command line. Install the Tailscale app and, *before
signing in*, use its options menu → **Use custom coordination server** for that URL. No
managed-device setup is needed — but do step 5 first, or this fails.

<!-- SCREENSHOT: mesh-keys.png — the KEYS tab with the ADD DEVICE form and the keys table
showing NAME / USER / REUSABLE / TAGS / EXPIRES. -->

On Android, the equivalent flow is not something this release documents or tests. If you get
it working, it is not a path we can support yet.

## Trusting your cluster's certificate on that device

**This is the single most likely reason a device that looks correctly configured will not
connect.** Your coordinator serves HTTPS with a certificate issued by your own cluster, not by
a public authority, and the Tailscale client refuses to talk to a coordinator over plain HTTP.
So a device that does not trust your cluster's certificate authority cannot join.

**It is a per-device step, done by hand, and there is no automatic install.** It is not one of
the first-run setup cards — the card named `Verify PKI trust` there is about a different root,
the one that proves OS update bundles are authentic — it does not carry over from another
device, and **the Mesh section does not surface a route to it**: nothing on these tabs links
you to the page you need. That is worth knowing before you go looking for a button that is not
there.

The page that does it sits outside the signed-in UI: the pre-login trust page badged
`FIRST-RUN TRUST` and headed **`SECURE YOUR CONNECTION`**, at
`https://<cluster-id>.local/trust` on your LAN. It carries a QR code so you can open the
same page on a phone, plus a block per platform:

- **iPhone / iPad** — `DOWNLOAD CONFIGURATION PROFILE`. Install it under
  *Settings → General → VPN & Device Management*, then turn on full trust under
  *Settings → General → About → Certificate Trust Settings*. **Both steps** — the second is
  easy to miss and the certificate does not work without it.
- **macOS, Debian/Ubuntu, Fedora/RHEL** — a ready-made one-line command per platform, which
  downloads the certificate and adds it to the system trust store.
- **Firefox on any Linux distribution** — an extra command, because Firefox keeps its own
  certificate store and never reads the system one. Read the warning about it in
  [Get in the first time](/docs/get-in-the-first-time/) before you run it.
- **Windows** — `DOWNLOAD CERTIFICATE`, then open the file and install it into *Trusted Root
  Certification Authorities* for the local machine.

**What it protects.** It lets the device verify that the coordinator it is handing a key to is
actually your cluster. Without it, the client has no way to check who is on the other end, and
declines to proceed.

**What it does not protect.** It is not authentication of the device — the pre-auth key is
that. It says nothing about any other machine on your network. And it is strictly per device
and per trust store, so installing it on your laptop does nothing for your phone.

**What you cannot take back.** Installing writes to that device's own system trust store, so
the change is to your laptop or phone rather than to the cluster, and it stays until you remove
it there.

## What a pre-auth key is worth

**What it protects.** The key is the whole admission control for the mesh. Nothing joins your
tailnet without one, no account exists anywhere to be phished, and the key is minted by you on
your own coordinator.

**What it does not protect.** Read this before you hand one to anybody.

- **The tailnet is open internally.** This release ships no access-control policy, so a device
  that joins **can reach every node on the mesh, every advertised subnet, and every other
  device on it.** There are no per-device rules to fall back on. That is a deliberate trade for
  a household appliance: the trust boundary is *who you give a key to*, and it is the reason
  the defaults are one device, twenty-four hours. **Treat a pre-auth key like a house key, not
  like a guest password.**
- **Expiry bounds the joining, not the access.** The expiry you choose is how long the key can
  be *used to join*. Once a device has joined, it stays joined — expiry does nothing to it.
- **Deleting the key revokes nothing.** `DELETE` retires the key so it cannot be used again.
  **Devices that already joined with it keep their access.**

**The consequence of each choice.**

- **`reusable` unchecked** (the default, and what you want) — the key works for exactly one
  device and is then spent.
- **`reusable` checked** — anyone holding that key can add **more** devices until it expires,
  and each of them lands on an open tailnet. Leave it unchecked unless you mean it.
- **Expiry `1h` / `24h` / `7d`** — the window in which a leaked or forwarded key still works.
  Shorter is strictly better; `24h` is recommended because it survives a device you set up
  tomorrow morning.

**What you cannot take back.**

- **A key you lost.** There is no way to read it back. Delete that key and generate another.
- **A key's terms.** `EDIT` changes only the **name** and the **device hint**. Reusable,
  expiry, and tags are fixed at the moment the key is minted — the form says so. Changing any
  of them means deleting the key and generating a new one, which produces a different key
  value.
- **A device that joined.** **There is no way to remove a device from the mesh in this
  release** — not on the KEYS tab, and not on DEVICES, which has no action controls. Removing a
  device is an API operation with no interface in front of it. Deleting the key it joined with
  does not evict it, and nothing in the UI will. **The only control you have is who you give a
  key to.** If you need a device off the mesh today, that is a request to make of us.

The keys table itself is short: **NAME** (with the device hint beside it), **USER**,
**REUSABLE**, **TAGS** bound at mint time, and **EXPIRES**.

## Troubleshooting

**You closed the banner without copying the key.**
It cannot be recovered. Delete that key and generate a new one.

**The client will not connect, and says something about the certificate.**
The device does not trust your cluster's certificate authority. Open
`https://<cluster-id>.local/trust` on that device and follow its platform's block — the Mesh
tabs do not link to it.

**On an iPhone or iPad the profile installed but joining still fails.**
The second step was missed. *Settings → General → About → Certificate Trust Settings*, and
switch the profile on. Installing alone does not trust it.

**The command runs but the login server is wrong.**
`<your-rasputin-mesh-url>` is a literal placeholder the banner does not fill in. Replace it
with the `login server` URL from the mesh header.

**The device does not appear on DEVICES.**
Give it five minutes, or press `RECONCILE` to read the coordinator's state now.

**`GENERATE KEY` worked but the header still says `never applied`.**
Expected. Keys mint immediately and `APPLY` is about pushing your key and route intents; a
cluster with nothing to disagree about reads `IN SYNC`, `never applied`.

**The key expired before you got to the device.**
Expiry is the window for joining. Generate a new key; the expired one keeps counting on the
Overview card until you delete it.

**You handed out a reusable key and more devices joined than you meant.**
Delete the key so it cannot be used again. That does not remove the devices that already
joined — nothing in the UI does.
