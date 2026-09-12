---
lesson: overlay-networks.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 and on Ubuntu Linux 24.04. It was not
  tested on Windows.
- **`awk`, `grep`, `diff`, `printf` and `cp`**, small commands that are already part of macOS
  and Linux. Nothing to install. To check awk, type `awk 'BEGIN { print "awk works" }'` and
  press Return. You should see `awk works`. Every
  command here gave the same output on both systems.

You do not need Rasputin hardware, Rasputin code, or an account anywhere. You do not need
WireGuard or Tailscale either: installing them needs administrator rights, so this lab builds
their peer lists as plain text instead.

## The idea

Every network gives out its own **addresses**. Move a laptop to another network and its address
changes, and machines on different networks often cannot reach each other directly.

An **overlay network** is a network built on top of others. Each member gets a second address
that belongs only to the overlay and stays the same wherever the machine is. To send a packet to
another member, a machine wraps it inside an ordinary packet addressed to that member's current
real address. The networks underneath see only the outer packet.

**WireGuard** does the wrapping. It encrypts each packet and sends it to a **peer**, another
machine on its list of peers. For each peer the list holds a **public key**, a code the peer
shares so others can recognize it; the overlay addresses that belong to that peer; and usually an
**endpoint**, a real address to start sending to, which WireGuard updates from the peer's own
packets. A machine accepts packets only from peers on its list, so the list is also who may
reach it.

**Tailscale** is built on WireGuard. Its **coordination server** keeps the list of devices and
hands each one its peers, so nobody writes the lists by hand. **Headscale** is an open-source
coordination server you run yourself. The devices still run the Tailscale client, and the
packets are still WireGuard.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. Each cluster has its own overlay, which Rasputin calls the mesh. Its
design records that *"Every Rasputin node joins a private tailnet driven by a self-hosted
Headscale control server."* A **tailnet** is Tailscale's word for one overlay network.

The [manual](https://rasputin.geekdojo.com/docs/the-mesh/) adds that the nodes and your devices
run the standard Tailscale client, that nothing is registered with a third party, and that the
mesh makes the cluster reachable by name across your own networks. It says plainly: *"It does
not give you away-from-home access in this release."* And with no access-control policy, every
device on the mesh can reach every other.

## Try it

You will generate each device's WireGuard peer list from one list of devices, then change the
devices and see which lists follow.

**1. Make a sandbox.**

```
mkdir overlay-lab
cd overlay-lab
```

`mkdir` makes a new, empty folder, and `cd` moves you into it.

**2. List three devices.**

```
printf '%s\n' 'desktop 100.64.0.1 192.0.2.10 KEY-desktop' 'laptop 100.64.0.2 198.51.100.20 KEY-laptop' 'server 100.64.0.3 203.0.113.30 KEY-server' > devices.txt
```

`printf '%s\n'` prints each quoted piece on its own line, and `>` saves them in `devices.txt`.
Each line is a name, an overlay address, a real address, and a public key. Tailscale gives out
overlay addresses from `100.64.0.0` to `100.127.255.255`, a range written `100.64.0.0/10`. The
real addresses, reserved for examples, come from three different networks. The keys are
stand-ins.

**3. Write the generator.** Paste all nine lines at once:

```
cat > peers.awk <<'EOF'
$1 != me {
  print "[Peer]"
  print "# " $1
  print "PublicKey = " $4
  print "AllowedIPs = " $2 "/32"
  print "Endpoint = " $3 ":51820"
}
EOF
```

This saves everything up to `EOF` in `peers.awk`. For every device that is not `me`, it prints
a peer section in WireGuard's format, with the name as a `#` comment. `AllowedIPs` is the peer's
overlay address; `/32` means exactly that one address. `Endpoint` is its real address, plus
51820, the port WireGuard commonly uses.

**4. Generate the desktop's list.**

```
awk -v me=desktop -f peers.awk devices.txt
```

```
[Peer]
# laptop
PublicKey = KEY-laptop
AllowedIPs = 100.64.0.2/32
Endpoint = 198.51.100.20:51820
[Peer]
# server
PublicKey = KEY-server
AllowedIPs = 100.64.0.3/32
Endpoint = 203.0.113.30:51820
```

`-v me=desktop` tells the generator which device it is writing for.

**5. Generate every list, and count.**

```
for d in desktop laptop server; do awk -v me=$d -f peers.awk devices.txt > $d.conf; done
grep -c Peer *.conf
```

```
desktop.conf:2
laptop.conf:2
server.conf:2
```

`for` runs the generator once per name, with `$d` holding the name, and saves each list in its
own file. `grep -c` counts matching lines in each file; `*.conf` means every file ending in
`.conf`. Every device lists every other, so every device can reach every other.

**6. Add a device.** Predict: which files change?

```
cp laptop.conf laptop.before
printf '%s\n' 'phone 100.64.0.4 192.0.2.40 KEY-phone' >> devices.txt
for d in desktop laptop server phone; do awk -v me=$d -f peers.awk devices.txt > $d.conf; done
grep -c Peer *.conf
diff laptop.before laptop.conf
```

```
desktop.conf:3
laptop.conf:3
phone.conf:3
server.conf:3
10a11,15
> [Peer]
> # phone
> PublicKey = KEY-phone
> AllowedIPs = 100.64.0.4/32
> Endpoint = 192.0.2.40:51820
```

`cp` keeps a copy of the laptop's list, `>>` adds a line to a file, and `diff` shows what
changed. Nothing about the laptop changed, yet its list did, and so did every other. Four
devices need 12 peer sections; twenty would need 380. Keeping them current is the coordination
server's job.

**7. Keep the phone away from the server.** Predict: whose list do you have to change?

```
grep -v '^phone ' devices.txt > server-devices.txt
awk -v me=server -f peers.awk server-devices.txt > server.conf
grep -c Peer *.conf
grep '# server' phone.conf
```

```
desktop.conf:3
laptop.conf:3
phone.conf:3
server.conf:2
# server
```

`grep -v` keeps the lines that do not start with `phone `, and the generator writes the
server's list from those. Only the server's list changed. The phone's list still names the
server, but the server accepts packets only from peers on its list, so the two can no longer
exchange packets. One end was enough.

**8. Clean up.**

```
cd ..
rm -rf overlay-lab
```

`rm -rf` deletes the folder and everything in it, without asking. It cannot be undone, so check
you typed `overlay-lab`.

## Check yourself

1. In step 6, you added a phone. Why did the laptop's list change?
2. A group moves from Tailscale's coordination server to Headscale. What does WireGuard still do?
3. You add a laptop to a Rasputin mesh that has its default policy. Which devices on the mesh can
   it reach?

### Answers

1. Every device lists every other device as a peer, so a new device has to appear in every list.
2. It still encrypts and wraps the packets between devices. Only the server that hands out the
   lists changed.
3. Every other device on the mesh.

## Where to go next

- **The mesh itself:** [What the mesh gives you](https://rasputin.geekdojo.com/docs/the-mesh/),
  in Rasputin's manual, covers the names devices use on the mesh and what it does not give you.
- **Adding a device:** [Add a device to the mesh](https://rasputin.geekdojo.com/docs/add-a-device-to-the-mesh/)
  explains the one-time key and what joining grants.
- **The code:** the mesh
  [source](https://github.com/geekdojo/rasputin-control-plane/tree/v2026.08.5/api/internal/mesh)
  in the public `rasputin-control-plane` repository.
