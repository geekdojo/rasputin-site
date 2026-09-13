---
lesson: names.advanced
---

## What you need

- **The intermediate lesson,** [Two names instead of one name with two answers](https://rasputin.geekdojo.com/learn/names/intermediate/).
  It covers why Rasputin gives each network its own name. This lesson is about how the LAN name
  is answered, and where that breaks.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15 (dig 9.10.6, Python 3.9.6), Debian 13 (dig 9.20,
  Python 3.13) and Alpine Linux 3, as an ordinary user. It was not tested on Windows.
- **`dig`**, from the beginner lesson. Every Mac has it. On Linux it comes in `bind9-dnsutils`
  (Debian, Ubuntu), `bind-utils` (Fedora), `bind-tools` (Alpine) or `bind` (Arch), and installing
  it needs administrator rights. Newer versions differ only in lines this lab does not show.
- **Python 3**, standard library only. Type `python3 --version`. On macOS it comes with Apple's
  Command Line Tools, which it offers to install if they are missing. On Linux it is usually
  present; otherwise the package `python3` needs administrator rights.
- **An internet connection** for steps 7 to 9, which ask Cloudflare's public resolver at
  `1.1.1.1`. On a network that blocks outside DNS, the script prints `no reply` for it.

You do not need Rasputin hardware or an account anywhere, and nothing here runs Rasputin. The
responder listens on port 5300 of your own machine, which needs no administrator rights.

## How it is built

**One zone, answered from memory.** Rasputin's control plane runs an authoritative nameserver for
`<cluster-id>.internal`, built into its API server on the `miekg/dns` library. There is no zone
file. [`cluster_source.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/nameserver/cluster_source.go)
computes the records from the node and app tables every time a question arrives, so in the
[responder's](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/nameserver/responder.go)
words, *"a change is visible on the next lookup, no reload."* It holds
`<node>.lan.<cluster-id>.internal` for every node, and `<app>.lan.<cluster-id>.internal` for each
app with LAN access on, each pointing at a LAN address. A second source answers the zone's top
name, and one extra name outside the zone, with the control plane's own address. A record whose
data is not ready yet is *"omitted … rather than served wrong"*.

**Four kinds of reply.** Apart from the SOA and NS records at the zone's top name, the responder
picks one of four replies:

| Question | Reply |
|---|---|
| A name it holds, asking for an IPv4 address (type `A`) | The address, remembered for 60 seconds |
| A name it holds, asking for another type, such as `AAAA` (IPv6) | **NODATA**: status `NOERROR`, no answer |
| A name inside the zone that it does not hold, including every bare node or app name | **NXDOMAIN**: no such name |
| A name outside the zone | **REFUSED** |

NODATA and NXDOMAIN both carry the zone's **SOA** (start of authority) record. Its last field
tells a caching resolver how long to remember the negative reply: 30 seconds here. Every reply
except REFUSED sets `aa`, authoritative. None of its own replies sets `ra`: it looks up nothing
for anyone. Rasputin is IPv4-only, so every `AAAA` question about a real name gets NODATA. The
code also handles what a toy skips: EDNS0 message sizes, truncation with a retry over TCP, and names in any letter case.

**Where it listens.** [`server.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/nameserver/server.go)
binds the control plane's LAN address for UDP and TCP, *"never 0.0.0.0:53"*, so it leaves
systemd-resolved's local stub at `127.0.0.53` alone.

**How devices reach it.** With a Rasputin firewall, the firewall's own DNS server forwards
`.internal` questions to the control plane and sends everything else to the internet. Without
one, the manual's [Network DNS](https://rasputin.geekdojo.com/docs/settings/#network-dns) setting
makes the control plane answer for the whole network: it answers its zone and forwards every other
question to one upstream resolver. That setting is off by default.

## Where it breaks

**A backup nameserver does not reliably rescue "no such name".** From a published Rasputin devlog:
*"Adding the control plane as a 'backup' DNS server does not work."* A device moves to its next
nameserver when one fails to answer, and NXDOMAIN is an answer. The decision record ADR-0004
rejects the path for that reason: *"a secondary is never consulted"*. Resolvers differ. Checked for
this lesson: the resolver in glibc 2.41, a common Linux C library, stopped at the first server's
NXDOMAIN every time and moved on after REFUSED, when `/etc/resolv.conf` listed the servers
directly. Many distributions route lookups through a local stub such as systemd-resolved instead,
with its own rules. musl 1.2.6, used by Alpine Linux, asks every server at once, and whichever
answers first wins.

**An authoritative-only server as the only resolver.** On a 2026-08-09 bench run, pointing a
network's DNS at a control plane that answered nothing but its own zone *"black-holed lookups for
public websites"*: every other name got REFUSED. The fix was the optional forwarder behind Network
DNS. Its cost is in the manual: while the control plane is down, devices pointed at it *"cannot
resolve names — not your apps, and not the internet."*

**REFUSED where NODATA belonged.** The extra name sits outside the zone, so an earlier version
refused every question about it except `A`. The most common other question is `AAAA`. The fix's
comment records what followed: `tailscaled`, the mesh client, *"treats that REFUSE as a failed
lookup"* and falls back to public DNS, which cannot know the name, and *"nodes then never rejoin
the mesh."* A name with an address exists, so another type now gets NODATA. (The real name was
the cluster's `.local` name; this lesson leaves `.local` and mDNS to their own documentation.)

**Addresses move.** Nodes get no reserved addresses, so a node's LAN address changes on most
reboots; the next query reads the new one. The control plane's own address cannot heal that way
once a router points at it, which is why the manual says to reserve it. Short lifetimes cut both
ways: they exist *"to bound how long a stale IP or a not-yet-existent name
can be cached"*, so a name added just after someone asked for it can read as missing for up to
30 seconds.

## What Rasputin does not do here

It gives no name two answers, and it holds no bare names. It is not a recursive resolver:
the forwarder is off by default and passes questions to one upstream. It serves no IPv6. The zone
has no secondary servers. Rasputin does not claim that either name reaches your cluster from away
from home. This lesson does not try mDNS, because that means querying your own network.

## Try it

You will build an authoritative responder for `home.internal`, question it with dig, watch a
backup server go unasked, then reintroduce a real bug on purpose.

**1. Make a sandbox.**

```
mkdir dns-lab
cd dns-lab
```

**2. Write the records.**

```
printf '%s\n' 'home.internal 192.0.2.10' 'home.test 192.0.2.10' 'nas.lan.home.internal 192.0.2.20' > records.txt
```

`192.0.2.0/24` is reserved for documentation and exists on no real network. `home.test` stands
for the extra name outside the zone; `.test` is reserved for testing and is in no public DNS.

**3. Write the responder.** Paste the whole block at once:

```
cat > responder.py <<'EOF'
import socket, struct, sys

ZONE = "home.internal"
TTL, NEGATIVE_TTL = 60, 30

def wire(name):
    return b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\0"

def soa():
    data = wire("ns." + ZONE) + wire("hostmaster." + ZONE)
    data += struct.pack(">5I", 1, 7200, 3600, 1209600, NEGATIVE_TTL)
    return wire(ZONE) + struct.pack(">HHIH", 6, 1, NEGATIVE_TTL, len(data)) + data

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("127.0.0.1", int(sys.argv[1])))
while True:
    query, client = sock.recvfrom(512)
    qid, flags = struct.unpack(">HH", query[:4])
    labels, i = [], 12
    while query[i]:
        labels.append(query[i + 1:i + 1 + query[i]].decode().lower())
        i += query[i] + 1
    name, qtype = ".".join(labels), struct.unpack(">H", query[i + 1:i + 3])[0]
    table = dict(line.split() for line in open("records.txt"))
    in_zone = name == ZONE or name.endswith("." + ZONE)
    answer, authority, rcode, aa = b"", b"", 0, 0x0400
    if qtype == 1 and name in table:
        answer = b"\xc0\x0c" + struct.pack(">HHIH", 1, 1, TTL, 4) + socket.inet_aton(table[name])
    elif not in_zone and name not in table:
        rcode, aa = 5, 0
    elif name in table:
        authority = soa()
    else:
        rcode, authority = 3, soa()
    header = struct.pack(">6H", qid, 0x8000 | aa | (flags & 0x0100) | rcode,
                         1, len(answer) > 0, len(authority) > 0, 0)
    sock.sendto(header + query[12:i + 5] + answer + authority, client)
EOF
```

The loop reads one question, walks its name label by label, and reads the type. `table` is built
from `records.txt` on every question, as Rasputin's projection is. The four branches are the table
above, in the same order as Rasputin's code: an address, REFUSED (rcode 5, no `aa`), NODATA, and
NXDOMAIN (rcode 3). The header copies the question's id, sets "this is a reply" (`0x8000`) and
`aa`, and echoes the question back.

**4. Start it and ask for a name it holds.**

```
python3 responder.py 5300 &
echo $! > pid.txt
sleep 1
dig @127.0.0.1 -p 5300 nas.lan.home.internal
```

`&` runs the responder in the background; `$!` is its process id, saved for clean-up. `sleep 1`
gives it a second to start. `-p 5300` sends dig's question to that port. Find:

```
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 40883
;; flags: qr aa rd; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0
;; WARNING: recursion requested but not available
nas.lan.home.internal.	60	IN	A	192.0.2.20
```

Your id will differ. `aa` is set, and the warning is dig noticing there is no `ra`.

**5. Ask three questions it has no address for.** Predict which replies carry the SOA:

```
dig @127.0.0.1 -p 5300 nas.lan.home.internal AAAA
dig @127.0.0.1 -p 5300 nas.home.internal
dig @127.0.0.1 -p 5300 example.com
```

Find, in order:

```
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 439
;; flags: qr aa rd; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 0
home.internal.		30	IN	SOA	ns.home.internal. hostmaster.home.internal. 1 7200 3600 1209600 30
;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 47802
;; flags: qr aa rd; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 0
home.internal.		30	IN	SOA	ns.home.internal. hostmaster.home.internal. 1 7200 3600 1209600 30
;; ->>HEADER<<- opcode: QUERY, status: REFUSED, id: 34987
;; flags: qr rd; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 0
```

The first two are confident replies: `aa`, and an SOA saying how long to believe them. The bare
name gets NXDOMAIN, as bare names do from Rasputin's nameserver. Only the third says the question
is not this server's business.

**6. Change the zone without restarting.**

```
echo "tv.lan.home.internal 192.0.2.30" >> records.txt
dig @127.0.0.1 -p 5300 tv.lan.home.internal +short
```

```
192.0.2.30
```

`+short` prints only the answer. No reload happened; the next question simply read the file.

**7. Write a resolver that tries servers in order.**

```
cat > ask.sh <<'EOF'
name=$1
type=$2
shift 2
for server in "$@"; do
  status=$(dig @"${server%:*}" -p "${server#*:}" +tries=1 +time=2 "$name" "$type" | awk '/status:/ { sub(",", "", $6); print $6 }')
  echo "$server: ${status:-no reply}"
  case "$status" in
    NOERROR|NXDOMAIN) break ;;
  esac
done
EOF
```

This follows glibc's rule: stop at the first reply that is an answer, `NOERROR` or `NXDOMAIN`,
and move on after anything else. `shift 2` leaves only the servers. `${server%:*}` is the part
before the colon, `${server#*:}` the part after. `awk` pulls the status word from dig's header.

Now list the public resolver first and your responder as the backup:

```
sh ask.sh nas.lan.home.internal A 1.1.1.1:53 127.0.0.1:5300
```

```
1.1.1.1:53: NXDOMAIN
```

Your responder holds the name and was never asked. `.internal` is not in public DNS, so the
public resolver's "no such name" is correct, and final.

**8. Make it the only resolver.**

```
sh ask.sh nas.lan.home.internal A 127.0.0.1:5300
sh ask.sh example.com A 127.0.0.1:5300
```

```
127.0.0.1:5300: NOERROR
127.0.0.1:5300: REFUSED
```

The zone works and the rest of the internet does not. That is the bench's black hole, and the
reason Rasputin added a forwarder.

**9. Break the extra name's answer on purpose.** First the working version. Then stop the responder,
delete one condition, and start the broken copy:

```
sh ask.sh home.test AAAA 127.0.0.1:5300 1.1.1.1:53
kill "$(cat pid.txt)"
sed 's/ and name not in table//' responder.py > broken.py
python3 broken.py 5300 &
echo $! > pid.txt
sleep 1
sh ask.sh home.test A 127.0.0.1:5300 1.1.1.1:53
sh ask.sh home.test AAAA 127.0.0.1:5300 1.1.1.1:53
```

`sed` copies the file with ` and name not in table` removed, so REFUSED now covers every name
outside the zone, held or not. Your shell may print a line saying a responder was terminated,
here and at clean-up.

```
127.0.0.1:5300: NOERROR
127.0.0.1:5300: NOERROR
127.0.0.1:5300: REFUSED
1.1.1.1:53: NXDOMAIN
```

The IPv4 question still works, which is how a bug like this hides. The IPv6 question is refused,
the resolver moves on, and a public server that can never know the name reports that it does not
exist. One missing condition turned "exists, no IPv6" into "does not exist".

**10. Clean up.**

```
kill "$(cat pid.txt)"
cd ..
rm -rf dns-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check you
typed `dns-lab`.

## Check yourself

1. A name exists but has no IPv6 address. What should an `AAAA` question get, and what goes wrong
   if it gets NXDOMAIN instead?
2. Why not list the control plane first and a public resolver second on every device?
3. A LAN device asks Rasputin's nameserver for `jellyfin.<cluster-id>.internal`. Which reply comes
   back, and why not REFUSED?
4. What breaks if the responder read `records.txt` once, at start-up?

### Answers

1. NODATA. NXDOMAIN says the name does not exist at all, so a resolver may remember that for the
   negative lifetime and fail the IPv4 lookup too.
2. It works only as far as each device's resolver moves on after REFUSED, and when the control
   plane is down every lookup waits for it to fail first. On a resolver that asks both at once,
   the public resolver's NXDOMAIN for a `.internal` name can arrive first. Rasputin's answers are a
   forward for the zone, or its own forwarder.
3. NXDOMAIN with the SOA. The name is inside the zone the server is authoritative for, and it holds
   no such record, so "no such name" is its answer to give.
4. Step 6 fails until a restart. In Rasputin, every node's changed address after a reboot would be
   wrong until the control plane restarted.

## Where to go next

- **Pointing a network at the control plane:** [Network DNS](https://rasputin.geekdojo.com/docs/settings/#network-dns),
  in Rasputin's manual, including what happens while the control plane is down.
- **An app's two addresses:** [Your apps](https://rasputin.geekdojo.com/docs/your-apps/).
- **The code:** the [nameserver package](https://github.com/geekdojo/rasputin-control-plane/tree/v2026.08.5/api/internal/nameserver),
  with its replies in `responder.go` and their tests in `responder_test.go`.
