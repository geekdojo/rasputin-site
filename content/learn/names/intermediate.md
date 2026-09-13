---
lesson: names.intermediate
---

## What you need

- **The beginner lesson,** [How a name becomes an address](https://rasputin.geekdojo.com/learn/names/beginner/).
  It covers resolvers, authoritative nameservers and what split-horizon DNS is.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `printf` and `awk`**, already part of macOS and Linux. Nothing to install, and no
  administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere. The lab sends no DNS
questions at all: it models two nameservers with text files, because trying this for real would
mean querying your own network.

## The situation

A [Rasputin](https://github.com/geekdojo/rasputin-control-plane/tree/v2026.08.5) cluster lives
on two networks at once. One is your home network, the **LAN**. The other is the cluster's
**mesh**, a private network its machines join, along with devices you add; mesh addresses come
from `100.64.0.0/10`. By default, a device on only one of the two cannot use an address from the
other.

Each network has its own nameserver: the mesh has its own DNS, and the control plane, the computer
that manages the cluster, runs one for the LAN. An app such as Jellyfin needs a name that works
from both.

## The decision, and what lost

The decision record ADR-0004 first chose split-horizon: one name, answered per network. In its
words, *"Same name, network-appropriate address."* Later that day, in settling how names work on the
mesh, the same record replaced it: *"a node or app has two distinct FQDNs — one per network — so
every name has exactly one answer everywhere."* An FQDN, a fully qualified domain name, is a
complete name such as `jellyfin.home.internal`, where `home` stands for the cluster's name.

The bare name is the mesh name. The LAN name adds `.lan.`: `jellyfin.lan.home.internal`. The
record calls this *"a naming choice that dissolves split-horizon rather than managing it"*. It
gives two further reasons for which name is bare: it needed no change to the mesh's DNS, which
already answered a bare name for every machine, and it makes the clean name the mesh path. The
split also let LAN become a per-app choice: an app gets a mesh name by default, and a `.lan.`
name only when you turn its LAN access on.

| Alternative | Why it lost |
|---|---|
| One name, answered per network (split-horizon) | Replaced the day it was chosen. The record gives the one-answer rule as the result, and records no incident. |
| Send every question for the zone to the control plane's nameserver | *"it would hand tailnet clients LAN IPs (unroutable) and fight MagicDNS's synthesis of the same base domain."* Tailnet is the mesh; MagicDNS is its DNS. |
| Let the LAN nameserver answer with mesh addresses | *"a LAN client can't (and shouldn't have to) route to a `100.64/10` address"* |
| Mark the kind of thing instead of the network, such as `.nodes.` | *"The axis is network, not entity … because apps need the split too."* |

The record does not describe what went wrong with split-horizon in use. The lab shows the failure
its second row names.

## What it cost

**A name works only on its own network.** On the LAN, the control plane's nameserver answers
"no such name" for the bare name. The record calls that correct: *"a LAN-only client can't route
a tailnet IP anyway."* A television on your LAN has to be given the `.lan.` name.

**People have to pick the right name.** Each app with LAN access shows two addresses, and the
manual carries a troubleshooting entry for exactly this: *"A name that works on your LAN does not
work over the mesh, or the reverse."* The record does not weigh this as a cost; the manual's entry
is the evidence that it happens.

**Work already under way moved.** Records being built at the bare name, with LAN addresses, had
to *"re-key under `.lan.`"*.

## What Rasputin does not do here

No Rasputin name resolves differently depending on who asks. The control plane's nameserver holds no
bare names. Rasputin does not claim that either name reaches your apps from away from home. Turning
an app's LAN access off withdraws its `.lan.` name; the manual is plain that this is *"not a
firewall, and not privacy."* The separate `<cluster-id>.local` name, found by mDNS, works only on
the LAN; this lesson leaves it aside.

## Try it

You will write the same app into two tables of DNS records, one per design, and watch where each
fails: with an address that hangs, or with "no such name".

**1. Make a sandbox.**

```
mkdir two-names
cd two-names
```

**2. Write both designs.**

```
printf '%s\n' 'mesh-dns jellyfin.home.internal 100.64.0.7' 'lan-dns jellyfin.home.internal 192.168.1.20' > split.txt
printf '%s\n' 'mesh-dns jellyfin.home.internal 100.64.0.7' 'lan-dns jellyfin.lan.home.internal 192.168.1.20' > two.txt
```

Each line is a record: which nameserver holds it, the name, the address. `mesh-dns` stands for the
mesh's DNS and `lan-dns` for the control plane's nameserver. In `split.txt` both servers hold the
same name. In `two.txt` each holds its own.

**3. Write a device that looks a name up and connects.** Paste the whole block at once:

```
cat > open.sh <<'EOF'
table=$1
device=$2
server=$3
name=$4
addr=$(awk -v s="$server" -v n="$name" '$1 == s && $2 == n { print $3 }' "$table")
if [ -z "$addr" ]; then
  echo "$server: no such name. Fails at once."
  exit
fi
case "$device $addr" in
  "mesh 100.64."*|"lan 192.168."*) echo "$server: $addr, connected" ;;
  *) echo "$server: $addr, no route from $device. Waits, then times out." ;;
esac
EOF
```

`cat > open.sh <<'EOF'` writes every line up to `EOF` into `open.sh`. The script takes four
values: the table, which network the device is on, which server its question reaches, and the
name. `awk` prints the address from the matching record, if one exists. `case` then checks whether
that address belongs to the device's network. In this model, mesh addresses start `100.64.`, and
a device reaches only addresses on its own network.

**4. Watch split-horizon work.** A television on the LAN asks the LAN server; a laptop on the mesh
asks the mesh server:

```
sh open.sh split.txt lan lan-dns jellyfin.home.internal
sh open.sh split.txt mesh mesh-dns jellyfin.home.internal
```

```
lan-dns: 192.168.1.20, connected
mesh-dns: 100.64.0.7, connected
```

One name, two correct answers. That is split-horizon's appeal: one name to bookmark.

**5. Send the laptop's question to the other server.** The laptop runs the mesh client and sits
on your guest Wi-Fi, a network of yours other than the LAN. The rejected alternative sends every
question for the zone to the control plane's nameserver. Predict what the laptop gets, then run
both servers:

```
for server in mesh-dns lan-dns; do sh open.sh split.txt mesh "$server" jellyfin.home.internal; done
```

```
mesh-dns: 100.64.0.7, connected
lan-dns: 192.168.1.20, no route from mesh. Waits, then times out.
```

`for server in …; do …; done` runs the script once per server. The name was right, and the server
answered correctly for its own network, but nothing in the name says which answer you got. In this
model the symptom is a hang; on a real network it can also be an immediate error, or a different
device that holds that address.

**6. Run the same laptop on the two-name table.**

```
for server in mesh-dns lan-dns; do sh open.sh two.txt mesh "$server" jellyfin.home.internal; done
```

```
mesh-dns: 100.64.0.7, connected
lan-dns: no such name. Fails at once.
```

The same mistake, sending the question to the wrong server, now fails at once and names the
problem. No server holds a second answer for the name.

**7. Pay the cost.** The television on the LAN uses the name everyone uses on the mesh, then the
LAN name:

```
sh open.sh two.txt lan lan-dns jellyfin.home.internal
sh open.sh two.txt lan lan-dns jellyfin.lan.home.internal
```

```
lan-dns: no such name. Fails at once.
lan-dns: 192.168.1.20, connected
```

Someone has to hand the television a different name. That is the price the record accepted.

**8. Find what two names do not fix.** Give the laptop the LAN name:

```
sh open.sh two.txt mesh lan-dns jellyfin.lan.home.internal
```

```
lan-dns: 192.168.1.20, no route from mesh. Waits, then times out.
```

The hang is back. Two names do not stop a device using an address it cannot reach. What changed is
where the mistake shows: in step 5 the name was right and the answer was wrong for the asker; here
the wrong choice is in the name itself, and `lan` says so.

**9. Clean up.**

```
cd ..
rm -rf two-names
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check you
typed `two-names`.

## Check yourself

1. In step 5, which was wrong: the name, the server's answer, or something else?
2. What breaks if someone adds `jellyfin.home.internal` to the LAN nameserver "so the television
   works"?
3. In step 8 a device got an address it could not use under the two-name design. What is different
   from step 5?
4. A small office has a VPN and an office network, and one internal wiki. Would you give it one name
   with two answers, or two names? What does each cost the people using it?

### Answers

1. Neither alone. The answer was right for the network of the server that gave it and wrong for
   the device that asked, and the name could not tell them apart.
2. The bare name has two answers again: that is split-horizon. A mesh device whose question reaches
   the LAN nameserver gets step 5's hang. Rasputin's nameserver answers "no such name" instead.
3. The name. Someone typed the `.lan.` name on a device that is not on the LAN, and the name says
   which network it is for.
4. Either can be right. One name means one bookmark everywhere, but the answer depends on which
   resolver a device reaches, and a wrong answer can show up as a hang. Two names fail at once and
   readably, but people have to learn which name fits where.

## Where to go next

- **Which name to use where:** [What the mesh gives you](https://rasputin.geekdojo.com/docs/the-mesh/#names-and-which-one-to-use-where),
  in Rasputin's manual.
- **An app's two addresses and its LAN access switch:** [Your apps](https://rasputin.geekdojo.com/docs/your-apps/).
- **The LAN nameserver's records:** the projection that builds the `.lan.` names, in
  [`cluster_source.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/nameserver/cluster_source.go).
