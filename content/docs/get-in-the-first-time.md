---
title: "Get in the first time"
aliases:
  - /docs/getting-started/
description: "Install the cluster's certificate, register the first passkey, and sign in — the one-time task, the two security decisions inside it, and what to do when a step doesn't take."
weight: 10
applies-to: "2026.08.5"
---

Getting in is a one-time job per device: teach the device to trust your cluster, then create
the passkey that *is* your account.

Throughout, `<cluster-id>` is your cluster's own identifier, fixed when you provisioned it. A
cluster that was never named answers to `rasputin.local`.

## Before you start

This document starts at a node that has been flashed and booted. If you have not got that far
yet, this is what the first node takes:

- **A first node** — a Raspberry Pi, or any UEFI amd64 box. This one becomes the **control
  plane**: the web UI and API your browser talks to. More nodes can follow later; one is
  enough to start. See [supported hardware](/docs/hardware/) for what has actually been
  booted, and what is only expected to work.
- **Storage for it** — a microSD card, NVMe, or USB drive to flash.
- **A wired network with DHCP** — the boring kind you already have. (IPv4 only, by design.)
- **A computer to flash from** — macOS or Linux for the one-command path; Windows works via
  the manual steps.
- **Your SSH public key** — optional but recommended. Images ship with **no key baked in**, so
  the one you provide is the only way in over SSH. See [Seed an SSH key while you still
  can](/docs/add-a-node/#seed-an-ssh-key-while-you-still-can).
- **A passkey** — sign-in is passkey-only (Touch ID, Windows Hello, or a security key). There
  are no passwords anywhere.

On macOS or Linux, plug the first node's card or drive into your computer and run:

```
curl -fsSL https://rasputin.geekdojo.com/bootstrap.sh | sudo bash
```

It asks four questions — which hardware, a name for the cluster, a name for the node, which
SSH key — then downloads the latest stable image, verifies its SHA-256 against the release
manifest, flashes the drive (external drives only, behind a typed confirmation), writes your
control-plane seed, and reads it back from the medium to prove it landed.

On Windows, or to do each step by hand: take an image from the [Download page](/download/),
verify it, flash it, and drop a `rasputin-seed.env` on the volume labeled `RASPUTIN-OS` — the
[seed-file reference](/docs/provisioning/) covers every field. Scripting the flash, or letting
an AI agent drive it? Every prompt above has an env-var override, including a no-write dry
run; the contract is on [Install with an AI agent](/docs/agents/).

Then slot the card, connect ethernet, and power on. First boot takes a few minutes.

## Do this

1. **Open a browser and type your cluster's address with no `https://`** —
   `<cluster-id>.local`. You land on a page headed **SECURE YOUR CONNECTION**.
2. **Install the cluster's certificate authority** using the block for your operating
   system, and copy the command from your own screen — the page generates it with the
   address you actually arrived by.
   - **macOS** and **Linux**: one command in Terminal. It asks for your password.
   - **Windows**: **DOWNLOAD CERTIFICATE**, then open the file → *Install Certificate…* →
     **Local Machine** → *Place all certificates in the following store* → **Trusted Root
     Certification Authorities**.
   - **iPhone / iPad**: **DOWNLOAD CONFIGURATION PROFILE**, then install it under
     *Settings → General → VPN & Device Management*, then switch it on under
     *Settings → General → About → Certificate Trust Settings*. Both steps.
3. **Quit your browser completely and reopen it.** Browsers read newly installed
   certificates only when they start.
4. **Go back to the trust page and press `CONTINUE SECURELY`.** You arrive at sign-in over
   HTTPS with no warning.
5. **Name yourself.** Type a **USER NAME** (letters, digits, `-` `_` `.`). **DISPLAY NAME**
   is optional and is what the top bar shows.
6. **Press `REGISTER PASSKEY`** and approve the prompt — Touch ID, Face ID, Windows Hello,
   or a hardware security key. There is no password to choose.
7. You land on **first-run setup**, which turns the box into a cluster you can use. See
   [Finish first-run setup](/docs/finish-first-run-setup/).

On every later visit, return to `https://<cluster-id>.local` and press
**SIGN IN WITH PASSKEY**. There is nothing to type.

**Do steps 1 to 4 again on each device you want to use** — a phone, a second laptop. The
trust page carries a QR code captioned *SCAN TO OPEN*, so a phone can reach it without
typing; check the address row is labeled `NAME`, not `HOST`, before you scan it.

## What installing the certificate actually establishes

Your cluster is not on the public internet and has no public domain name, so no public
certificate authority can vouch for it. Instead **the cluster mints its own certificate
authority the first time it powers on** and issues itself a certificate for its own name.
The certificate is real and the encryption is real — but until a device has been handed that
authority, the device has no way to check *who* it is talking to, so it shows a warning.

Installing the authority buys you two things: your browser can verify that the machine
answering to your cluster's name is your cluster, and passkey sign-in becomes reliable,
because it runs in what browsers call a secure context.

**What it does not buy you.** It is not authentication *of you* — that is the passkey. It
does not encrypt anything that was not already encrypted; the connection was encrypted
before you installed it. It says nothing about any other device on your network. And it is
strictly per device — installing it on your laptop does nothing for your phone, and nothing
for a second browser on the same machine that keeps its own certificate store.

**If you skip it** and take the escape hatch below `CONTINUE SECURELY`, the page is honest
about what you get: the connection is still encrypted, your browser just cannot vouch for
it. Specifically:

- **The warning returns on every visit, on every device**, and anyone you hand the cluster
  to meets it too.
- **Your browser cannot detect impersonation.** Encryption without verification means
  something else on your network answering to the cluster's name would look identical to
  your browser. On a home LAN that is a low risk. It is not zero.
- **Sign-in may simply not work.** Clicking through a certificate warning does not reliably
  produce a secure context. On Chromium-based browsers (Chrome, Edge, Brave) we have seen
  the passkey step fail outright rather than prompting, and Rasputin can neither detect that
  nor work around it.

Skipping is a way to look around. It is not a way to run a cluster.

**What you cannot take back.** Installing writes to the device's own system trust store, so
the change is to your laptop or phone, not to the cluster — it stays in place until you
remove it on that device. One command on the trust page is genuinely destructive if you run
it blind: the Linux **Firefox** command ends by replacing
`/etc/firefox/policies/policies.json` outright, which destroys any Firefox policy your
machine or your distribution already set. Read
[Firefox on Linux still warns](#troubleshooting) before you run it.

## The passkey is bound to the cluster's name

Sign-in is **passkey only**. There is no username field on the sign-in form, no password, no
password reset, no emailed code, and no fallback. Your passkey is the account.

The binding is the security property. Your browser ties the credential to the **name** you
registered it under — for Rasputin that name is the cluster itself — so the passkey is
offered only when you are actually at your cluster, and cannot be replayed anywhere else.
The standard requires two things Rasputin cannot fake:

- **A secure context** — in practice `https://`, or `http://localhost`. Plain `http://` to
  any other host is not one.
- **A domain name, never an IP address.** WebAuthn refuses to use a bare IP as an identity.

So `http://<LAN-IP>:8080` — `<LAN-IP>` being the cluster's numeric address on your
network — fails on both counts at once, and is the single most common
"my passkey doesn't work" cause. **The supported path is the cluster's own name over
HTTPS** — `https://<cluster-id>.local`, with the certificate installed. It needs no
tunnel, no port forwarding, and no extra software. Always come back by that name.

**What the binding does not protect.** It binds a credential to a *name*, not to a person:
anyone who can satisfy the authenticator on a device that holds a passkey can sign in as
you. It says nothing about where you are connecting from, and it does not make the cluster
reachable from outside your own network. And it is not account recovery — there is none.

**What you cannot take back.** Lose every device that holds a passkey and there is no way
back in from the sign-in page: no reset, no code, no support override. **Register a second
passkey while you still have access** — a phone as well as a laptop, or a hardware key kept
somewhere safe. (On a cluster that has *no* operator at all and a backup disk attached, the
sign-in page offers **RESTORE FROM BACKUP →** instead. That restores a previous cluster's
identity; it is not a way to recover a passkey you lost.)

## Signing in protects the web interface, not the box

**What it protects.** Your passkey gates the web interface and the API behind it. Nobody
reaches your cluster's controls across the network without a credential held on one of your
own devices, and there is no password to guess, phish, or reuse.

**What it does not protect.** Every node has a local console — a monitor and USB keyboard,
or a serial adapter. At that console, root logs in with the password `rasputin`, which is
built into the image and is therefore the same on every Rasputin OS node everywhere. The
root filesystem is read-only, so you cannot change it from the running system; making it
operator-changeable is still open work. It is set in the public build configuration, so it
is not a secret — treat it as a label on the door rather than a lock.

**What follows for you.** Physical access to a node is root on that node: its data, its
credentials, and its place on your cluster. The passkey is not what keeps someone out of
the box, so decide where the hardware lives accordingly — and if a node has been out of
your control, re-provision it rather than trusting it back onto the cluster.

**Give yourself a way in that isn't the console.** Rasputin's SSH server accepts keys and
nothing else — there is no password to authenticate with over the network — and the image
ships no key at all. So supply your SSH public key when you enroll each node. Skip it and
that node has no network shell ever again: fixing it means physically going to it and using
the shared console password. Store your key once under **Settings → Operator SSH key** and
every enrollment after that offers it prefilled. Note the limit before you rely on it: that
stored key applies to *future* enrollments only, so adding it later grants nothing on nodes
already running, and removing it revokes nothing — see [Settings](/docs/settings/).

## Troubleshooting

**The browser just says it can't connect.**
First boot takes a few minutes and nothing is listening until it finishes — that is the boot,
not a failure. Scripting the wait? `curl -fsS http://<cluster-id>.local/healthz` answers
`{"status":"ok"}` the moment the control plane is up.

**`<cluster-id>.local` never resolves at all.**
Routine on Windows without mDNS, and behind some routers. Find the node in your router's DHCP
lease list — the control plane appears under its cluster id — and browse to its IP address
directly. Install the certificate and come back by name before you register a passkey: one
registered at an IP address is not offered at the name, or the other way round.

**The browser says the certificate is *expired* on a freshly flashed node.**
The node's clock is wrong, not its certificate — common on boards with no battery-backed
clock, on networks with broken NTP. See [time sync](/docs/provisioning/#time-sync).

**You still see a browser warning after installing the certificate.**
Quit the browser completely and reopen it — a reload is not enough, and this fixes most
cases. Each device is separate, so a warning on your phone means the phone still needs the
install. A second browser on the same machine is usually fine on macOS and Windows, which
share one OS store, but a browser that keeps its own store needs its own step.

**Firefox on Linux still warns.**
Firefox never consults the system trust store, so the Debian/Ubuntu and Fedora/RHEL commands
cannot help it. The page's third Linux command fixes it by writing a Firefox enterprise
policy — and its final step **replaces** `/etc/firefox/policies/policies.json`. If that file
already exists (a managed workstation, or anywhere policies are already set), do not run the
command whole: run only its `curl` and `install` halves, which put the certificate at
`/usr/local/share/rasputin/mesh-ca.pem`, then merge this into your existing file by hand:

```
"Certificates": { "Install": ["/usr/local/share/rasputin/mesh-ca.pem"] }
```

Either way, fully quit Firefox and reopen it. The policy is read at startup.

**On iPhone or iPad the profile installed but the warning stays.**
The second step was missed. *Settings → General → About → Certificate Trust Settings*, and
switch the profile on. Installing alone does not trust it.

**`SIGN IN WITH PASSKEY` does nothing at all.**
Almost always the secure-context problem: you are on plain `http://`, on an IP address, or
you clicked through a certificate warning in a Chromium browser. Install the certificate,
reach the cluster by name over HTTPS, and try again.

**Your passkey isn't offered.**
You are at a different address from the one you registered at. A passkey registered at
`<cluster-id>.local` is not offered anywhere else — including at the cluster's IP address.
Go back to the name.

**The trust page's address row reads `HOST`, not `NAME`.**
The page could not read the cluster's name over the plain-HTTP listener, which is common on
the very first visit, so it is showing the address you arrived by. The QR code carries that
same address. Reach the page by `<cluster-id>.local` and check the row again before you
scan it or register a passkey.

**"Cancelled or denied by the authenticator."**
You dismissed the prompt, or the device refused — wrong finger, timed out, key not inserted.
Press the button again.

**"A credential already exists on this device for this account."**
This device already holds a passkey for the account. Sign in rather than register.

**"Couldn't reach the api. Is rasputin-api running on localhost:8080?"**
The UI loaded but the control plane's API did not answer. On a running cluster this points
at the control-plane service, not at anything you did.
