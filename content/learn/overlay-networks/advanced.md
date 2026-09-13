---
lesson: overlay-networks.advanced
---

## What you need

- **The intermediate lesson,** [Embedding a server or running it beside you](https://rasputin.geekdojo.com/learn/overlay-networks/intermediate/).
  It covers why Rasputin runs Headscale as a separate process and talks to it through its HTTP
  API. The beginner lesson's WireGuard peer lists, and `AllowedIPs` in particular, come back here.
- **Addresses written as CIDR.** `192.168.50.0/24` names a network: the first 24 bits are fixed,
  so it covers the 256 addresses from `192.168.50.0` to `192.168.50.255`.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12, Ubuntu 24.04 and BusyBox, a minimal
  Linux toolset, with the same output on all four. It was not tested on Windows.
- **`sh`, `awk`, `echo` and `cat`**, already part of macOS and Linux. Nothing to install, and no
  administrator rights.

You do not need Rasputin hardware, Rasputin code, Tailscale, or an account anywhere. A real
subnet router needs Tailscale installed and administrator rights, so the lab builds a model of
the four layers instead, with real address arithmetic. There is no optional lane that runs
Rasputin; its tests are linked for reading at the end.

## How it is built

A device on Rasputin's mesh reaches Rasputin nodes directly. A **subnet route** extends that to
a whole network behind one node, such as a printer on the home LAN: the node forwards mesh
traffic onto that network. The node doing the forwarding is a **subnet router**.

A subnet route works only when four independent layers line up, and each has a different owner.

**1. Advertise: the node offers the subnet.** When a node enrolls, Rasputin's agent runs
`tailscale up`, adding `--advertise-routes` only when routes to advertise were given
([`real.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/agent/internal/tailscale/real.go)).
Each route has to be a network prefix, `192.168.50.0/24`, not the node's own address with a mask
([`advertise.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/advertise.go)).

**2. Approve: the coordinator agrees.** A route added on the Mesh ROUTES tab is only an intent
until `APPLY`. The apply job's `push_routes` step
([`jobs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/jobs.go))
calls Headscale's `approve_routes` endpoint
([`headscale_real.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/headscale_real.go)):
the published interface the intermediate lesson was about. Headscale, pinned in Rasputin at
0.28.0, serves only the routes a node
[both announces and has approved](https://github.com/juanfont/headscale/blob/v0.28.0/hscontrol/types/node.go),
matched exactly. A served route is added to that node's `AllowedIPs` in the peer list every
other device receives. That is the beginner lesson's list: the route becomes part of what that
peer may send and where traffic for the subnet goes.

The device has a say too. Tailscale's
[subnet router documentation](https://tailscale.com/kb/1019/subnets) says Linux devices use
subnet routes only when started with `--accept-routes`, while Android, iOS, macOS, tvOS and
Windows pick them up automatically.

**3. Policy: the path is allowed.** Rasputin ships no access-control policy, so in the manual's
words everything is allowed. A policy added outside Rasputin has to permit the path.

**4. Return path: the reply finds its way back.** The printer sees a request and replies to the
source address. By default a Tailscale subnet router rewrites that source to its own LAN address,
called **source NAT**, and Rasputin does not turn it off: the agent's `tailscale up` passes no
flag that changes it. The printer replies to the node, which passes the reply back over the mesh.
The [manual](https://rasputin.geekdojo.com/docs/reach-your-lan-over-the-mesh/) notes the
consequence: machines on the LAN *"cannot tell which mesh device reached them."* Without source
NAT, Tailscale's documentation says LAN devices need a return route sending `100.64.0.0/10` to
the router.

## Where it breaks

The first three breaks below come from Rasputin's manual or a merged, public fix. The fourth is
what all of them have in common.

**The advertised set is fixed at enrollment.** Approving a subnet a node never advertised does
nothing; in the manual's words, *"approval cannot conjure a route the node is not offering."* The
enroll form offers only nodes not yet on the mesh, so for an enrolled node no control changes
what it advertises. The manual's advice for a listed route that carries no traffic is to walk the
four layers in order, starting at advertise: *"It is almost always the first one."*

**A host address is not a network.** Until a fix merged in public pull request
[#242](https://github.com/geekdojo/rasputin-control-plane/pull/242), the agent reported the
network it suggested as its own interface address with its mask. `tailscale up` refuses that.
The code comment records the refusal from a bench node, *"192.168.1.149/24 has non-address bits
set; expected 192.168.1.0/24"*, and the result: *"every operator-driven enroll that took the
enroll-defaults suggestion failed at `tailscale up`."* The agent now reports the network. The api
refuses a typed value that is not a network prefix, naming the form it would accept, and
rewrites only defaults it generates itself. Nobody typed those.

**An IPv6 route is accepted and does nothing.** Rasputin is IPv4 only. The manual says the ADD
ROUTE CIDR field is the one form that does not check: an IPv6 CIDR is stored, pushed to the
coordinator, and does not work, with no error.

**The device never says which layer failed.** From the device on the mesh, each break looks the
same: no reply. The lab shows it.

## What Rasputin does not do here

- In the manual's words, the mesh *"does not give you away-from-home access in this release."*
  The lab's laptop is a mesh device on your own networks.
- Rasputin does not manage WireGuard peers. Headscale hands out the peer lists.
- There is no control to change what an already-enrolled node advertises.
- There is no per-device policy. Every device on the mesh can reach every approved subnet.

## Try it

You will model a laptop on the mesh reaching a printer at `192.168.50.7` through a node whose
LAN address is `192.168.50.2` and whose mesh address is `100.64.0.5`. Then you will break each
layer on purpose and compare what the laptop sees.

**1. Make a sandbox.**

```
mkdir route-lab
cd route-lab
```

**2. Write the four layers.** Paste the whole block at once:

```
cat > layers.awk <<'EOF'
function num(ip,  o) { split(ip, o, "."); return ((o[1] * 256 + o[2]) * 256 + o[3]) * 256 + o[4] }
function size(route,  r) { split(route, r, "/"); return 2 ^ (32 - r[2]) }
function base(route,  r) { split(route, r, "/"); return num(r[1]) }
function inside(ip, route) { return int(num(ip) / size(route)) == int(base(route) / size(route)) }
function fail(msg) { print msg; print "laptop: no reply"; exit }
FILENAME == "advertised.txt" { adv[$1] = 1 }
FILENAME == "approved.txt" { ok[$1] = 1 }
END {
  for (r in adv) {
    if (base(r) % size(r) != 0) fail("1 advertise: refused " r ", host bits set")
    if (inside(dest, r)) a = r
  }
  if (a == "") fail("1 advertise: nothing covers " dest)
  print "1 advertise: " a
  if (!(a in ok)) fail("2 approve: " a " is advertised, not approved")
  print "2 approve: node's AllowedIPs = 100.64.0.5/32, " a
  print "3 policy: none, so allowed"
  print dest " received a request from " (snat == "on" ? "192.168.50.2" : "100.64.0.2") >> "printer.log"
  if (snat != "on") fail("4 return: reply to 100.64.0.2 goes to 192.168.50.1, with no route back to the mesh")
  print "4 return: reply to 192.168.50.2, the node"
  print "laptop: reply from " dest
}
EOF
```

The first four lines are the address arithmetic. `num` turns `192.168.50.7` into one number.
`size` is how many addresses a prefix covers: 2 to the power of the bits left over. `inside`
divides both numbers by that size, dropping the remainder; if the results match, the address
falls in the prefix. `base(r) % size(r)` is the remainder, and anything but 0 means host bits are
set. `fail` prints why, prints what the laptop sees, and stops.

The rest reads each file into a list, `FILENAME` saying which file a line came from, then checks
the layers in order. A reply that reaches the printer is logged in `printer.log`. Without source
NAT, the printer sends its reply to its own default gateway, the home router at `192.168.50.1`,
which does not know that mesh addresses are reached through the node.

**3. Write the command that runs it.**

```
cat > reach.sh <<'EOF'
awk -v dest="$1" -v snat="${snat:-on}" -f layers.awk advertised.txt approved.txt
EOF
```

`$1` is the address you pass. `${snat:-on}` is `on` unless you set `snat` yourself.

**4. Line the layers up, and reach the printer.**

```
echo 192.168.50.0/24 > advertised.txt
echo 192.168.50.0/24 > approved.txt
sh reach.sh 192.168.50.7
```

```
1 advertise: 192.168.50.0/24
2 approve: node's AllowedIPs = 100.64.0.5/32, 192.168.50.0/24
3 policy: none, so allowed
4 return: reply to 192.168.50.2, the node
laptop: reply from 192.168.50.7
```

**5. Turn off source NAT.** Predict: does the request reach the printer?

```
snat=off sh reach.sh 192.168.50.7
cat printer.log
```

`snat=off` sets the variable for that one command.

```
1 advertise: 192.168.50.0/24
2 approve: node's AllowedIPs = 100.64.0.5/32, 192.168.50.0/24
3 policy: none, so allowed
4 return: reply to 100.64.0.2 goes to 192.168.50.1, with no route back to the mesh
laptop: no reply
192.168.50.7 received a request from 192.168.50.2
192.168.50.7 received a request from 100.64.0.2
```

The first log line is step 4. The second is this run: the request arrived. Every layer on the way
there passed, and the laptop still saw nothing, because the break was on the way back. The
printer did answer; its reply went to a router that could not deliver it.

**6. Approve a narrower route than the node advertises.**

```
echo 192.168.50.0/25 > approved.txt
sh reach.sh 192.168.50.7
```

```
1 advertise: 192.168.50.0/24
2 approve: 192.168.50.0/24 is advertised, not approved
laptop: no reply
```

`192.168.50.0/25` is the first half of the advertised network, and the printer is inside it. The
approval still matched nothing, because Headscale matches the advertised route exactly.

**7. Advertise the node's address instead of its network.** This is the value the agent used to
suggest.

```
echo 192.168.50.0/24 > approved.txt
echo 192.168.50.2/24 > advertised.txt
sh reach.sh 192.168.50.7
```

```
1 advertise: refused 192.168.50.2/24, host bits set
laptop: no reply
```

`192.168.50.2/24` looks like a route and describes the same 256 addresses. But `.2` is not the
start of the network, so the remainder is not 0. A real `tailscale up` refuses it with the
message quoted above.

**8. Reach a network nobody advertised.** A second network behind the same node, not named at
enrollment:

```
echo 192.168.50.0/24 > advertised.txt
sh reach.sh 192.168.60.9
```

```
1 advertise: nothing covers 192.168.60.9
laptop: no reply
```

This is the manual's "almost always" case, and approving `192.168.60.0/24` would not change the
result.

**9. Compare what the laptop saw.** Steps 5 to 8 broke four different things, and the last line
is identical every time: `laptop: no reply`. The laptop cannot tell you where it broke. That is
why the diagnosis starts at the node and walks outward, in order, instead of starting from the
symptom.

**10. Clean up.**

```
cd ..
rm -rf route-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `route-lab`.

## Check yourself

1. A route shows as approved and a mesh device gets no reply. Which layer do you check first,
   and what do you read to check it?
2. What breaks if you turn off source NAT on a subnet router and add nothing else? Where would
   you see evidence that the request arrived?
3. A node advertises `10.0.0.0/16` and you approve `10.0.5.0/24`. Does a device reach `10.0.5.20`?
4. Why was `192.168.1.149/24` refused, when it describes the same addresses as `192.168.1.0/24`?
5. After you approve a route on a Rasputin mesh, which devices on the mesh can reach that subnet?

### Answers

1. Advertise. Read the node's ROUTES column on Mesh → DEVICES: approval cannot add a route the
   node is not offering.
2. Replies go to the LAN machines' own gateway, which does not send mesh addresses to the node, so
   nothing comes back. The request is visible on the LAN side: in the lab, `printer.log`.
3. No. Headscale serves a route only when the approved route matches the advertised one exactly.
4. Its address has host bits set: `.149` is not the start of the network. `tailscale up` accepts
   only the network prefix itself.
5. Every one. There is no per-device policy in this release.

## Where to go next

- **The four layers, from the operator's side:** [Reach your LAN over the mesh](https://rasputin.geekdojo.com/docs/reach-your-lan-over-the-mesh/),
  in Rasputin's manual.
- **What joining grants:** [Add a device to the mesh](https://rasputin.geekdojo.com/docs/add-a-device-to-the-mesh/).
- **The fix, with its tests:** pull request [#242](https://github.com/geekdojo/rasputin-control-plane/pull/242),
  and [`advertise_test.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/advertise_test.go)
  at the tag.
- **Upstream:** Tailscale's [subnet routers](https://tailscale.com/kb/1019/subnets) page covers
  approval, `--accept-routes` and source NAT.
