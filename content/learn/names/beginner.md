---
lesson: names.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS only. It was not tested on Linux or Windows.
- **`dig`**, a tool that asks DNS questions and prints the replies. Type `dig -v` and press
  Return. If you see a version number, you have it. Every Mac has it. On Linux you may see
  `command not found`: it comes in the package `bind9-dnsutils` (Debian, Ubuntu) or `bind-utils`
  (Fedora), and installing one needs administrator rights. Tested with dig 9.10.6; newer
  versions print a few extra lines.
- **An internet connection.** Some workplace and public networks block DNS questions to outside
  servers, and dig prints `connection timed out; no servers could be reached`. Try another
  network.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

Computers reach each other by **IP address**, a number such as `104.20.23.154`. People use
names. **DNS**, the Domain Name System, turns names into addresses.

Names form a tree, read from the right: `example.com` sits under `com`, and `com` sits under
the **root**, the top of the tree. Each branch is a
**zone**, and each zone has **authoritative nameservers**: servers that hold that zone's
records and answer for that zone only.

Your computer does not walk the tree itself. It asks a **recursive resolver**, usually run by
your router, your internet provider, or a public service. The resolver starts at the root,
follows the pointers down to the name's own nameservers, hands you the answer, and remembers it
for a while.

So the reply to "what is the address of this name?" depends on who you ask. A resolver passes on
an answer it fetched. An authoritative server gives its own. A server that does not hold the
name gives none. A server can also be set up to give different askers different answers. A
network that answers a name one way for devices inside it and another way, or not at all, for
everyone else is using **split-horizon DNS**.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. An app on it that has a web page gets the name
`<app>.<cluster-id>.internal`, for devices on the cluster's private mesh network. It can also
get `<app>.lan.<cluster-id>.internal`, for devices on your home network. `<app>` is the app's
name, and `<cluster-id>` is the name the cluster was given when it was set up.

Rasputin chose two names over split-horizon, one name with two answers. In
[its manual's](https://rasputin.geekdojo.com/docs/your-apps/) words, *"the network is encoded
in the name itself"*. The `.lan.` names are answered by a nameserver built into the control
plane, the computer that manages the others. Its
[source](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/nameserver/doc.go)
records that it answers "no such name" for the other form.

## Try it

You will put questions to four different servers and compare the replies. dig only asks
questions, so there is nothing to clean up afterwards.

**1. Ask a resolver.**

```
dig @1.1.1.1 example.com
```

`dig` prints the whole reply. `@1.1.1.1` sends the question to that server, a public resolver
run by Cloudflare, instead of the one your computer normally uses. `example.com` is a name
reserved for examples. Among the output, find these lines:

```
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 51909
;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1
;; ANSWER SECTION:
example.com.		97	IN	A	172.66.147.243
example.com.		97	IN	A	104.20.23.154
```

`NOERROR` means the question was answered. An answer line reads: the name, how many seconds it
may be remembered, `IN` for internet, the record type (`A` is an address), and the address.
Your id, seconds, addresses and their order may differ, and you may see `ad` among the flags. `ra`
means "recursion available": this server looks names up for others.

**2. Ask the top of the tree.** Predict first: the root is at the top, so it should know.

```
dig @a.root-servers.net example.com
```

`a.root-servers.net` is one of the root servers. Find:

```
;; flags: qr rd; QUERY: 1, ANSWER: 0, AUTHORITY: 13, ADDITIONAL: 27
;; WARNING: recursion requested but not available
;; AUTHORITY SECTION:
com.			172800	IN	NS	l.gtld-servers.net.
```

`ANSWER: 0`. The root does not know the address. It sent a **referral** instead: `NS`
(nameserver) records naming the servers that hold `com`. The warning is harmless. dig asked the
server to look the name up, and root servers do not do that for anyone.

**3. Find who holds the name.**

```
dig @1.1.1.1 example.com NS +short
```

`NS` asks for nameserver records instead of addresses. `+short` prints only the answer. On
2026-09-12 it printed:

```
hera.ns.cloudflare.com.
elliott.ns.cloudflare.com.
```

Yours may differ. Copy any one line. In steps 4 and 5, replace `<nameserver>`, angle brackets
included, with that line. The dot at the end can stay.

**4. Ask the name's own server.**

```
dig @<nameserver> example.com
```

```
;; flags: qr aa rd; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1
```

`aa` means "authoritative answer": this server holds the record itself. Step 1's reply had no
`aa`, because the resolver was passing on an answer it got from a server like this one.

**5. Ask it about a name it does not hold.**

```
dig @<nameserver> wikipedia.org
```

```
;; ->>HEADER<<- opcode: QUERY, status: REFUSED, id: 58446
```

`REFUSED`, with no answer. Your id will differ. An authoritative server answers for its own zones and nothing else.

**6. Ask two resolvers the same question.** Predict: same question, same answer?

```
dig @1.1.1.1 whoami.akamai.net +short
dig @8.8.8.8 whoami.akamai.net +short
```

`8.8.8.8` is Google's public resolver. You get two different addresses, for example:

```
104.23.250.5
172.253.2.16
```

Both are correct. Akamai's nameserver answers this name with the address of whoever asked it,
and here that is the resolver, not you. Your addresses will differ and can change between runs.
The name was built to show this; large websites use the same mechanism to send you to a
nearby server. If both lines match, something on your network may be answering DNS questions
itself, whichever server you name.

## Check yourself

1. In step 2, the root server replied without an error but gave no address. What did it give
   you instead?
2. A friend and you look up the same name and get different addresses. Is one of you getting a
   wrong answer?
3. On your home network, a device using Rasputin's nameserver looks up
   `jellyfin.<cluster-id>.internal` and gets no address. Is that nameserver broken?

### Answers

1. A referral: the nameservers for `com`, the next step down the tree.
2. Not necessarily. As step 6 showed, a server can answer by who is asking, and both answers can
   be correct.
3. No. That is the mesh name, and that nameserver deliberately does not answer it. On your home
   network, the name to use is `jellyfin.lan.<cluster-id>.internal`, if the app has one.

## Where to go next

- **Intermediate — names you cannot change:** why a name used across a whole system becomes
  permanent, and what giving up renaming bought.
- **Names with no DNS server:** mDNS and `.local` names, which need a local network to try.
