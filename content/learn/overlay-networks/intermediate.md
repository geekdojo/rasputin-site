---
lesson: overlay-networks.intermediate
---

## What you need

- **The beginner lesson,** [What an overlay network is](https://rasputin.geekdojo.com/learn/overlay-networks/beginner/).
  It covers WireGuard peer lists and the coordination server that hands them out.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12, Ubuntu 24.04 and BusyBox, a minimal
  Linux toolset. The output matched on all four except one error message, shown in step 8. It
  was not tested on Windows.
- **`sh`, `awk`, `cp` and `printf`**, already part of macOS and Linux. Nothing to install, and
  no administrator rights.

You do not need Rasputin hardware, Rasputin code, Tailscale, or an account anywhere.

## The situation

A **control plane** is the program that manages a group of machines. Rasputin's is one program,
the api, and it needs other servers to do its job. Two of them: a coordination server for the
mesh, and a DNS server that answers names on your home network.

Each can be brought in one of two ways. A **library** is code compiled into your own program: one
process, and you call its functions directly. A **sidecar** is a separate program that yours
starts, watches and talks to through the interface that program publishes, such as an HTTP API.

## The decision, and what lost

Rasputin made the choice twice and went opposite ways.

**The coordination server is a sidecar.** Rasputin's mesh runs Headscale in its own container,
and the api starts it and calls its HTTP API. The mesh design, an internal record, gives three
reasons. The first: *"Headscale's `hscontrol` package isn't a stable library API; library import
would bind our upgrade cadence to theirs."* The second, in the record's words, is a forced
upgrade order: *"you must step 0.27 → 0.28 → 0.29"*. The third is the size of everything a
library import would pull in. The message bus, by contrast, is compiled in, and the record
explains why the precedent did not carry over: *"NATS publishes an explicit library API.
Headscale does not."*

**The DNS server is embedded.** A later decision record, ADR-0004, chose a responder built into
the api, *"not a sidecar (CoreDNS / Knot / NSD)"*. The names it answers come from tables already
in the api's memory, so a machine whose address changes is answered correctly at the next query,
*"with no zone-file regenerate-and-reload hop a sidecar would need."* The record states the
rule it follows: *"Headscale is a sidecar precisely because it is a third-party product we don't
own."*

| Option | Outcome | Recorded reason |
|---|---|---|
| Import Headscale as a library | Lost | No stable library API; its upgrade order becomes yours |
| Run CoreDNS, Knot or NSD beside the api | Lost | Every change becomes a file to write and reload |
| Embed the NATS message bus | Chosen | NATS publishes a library API |

## What it cost

**A separate process is something to wait for.** One early version started Headscale before it
did anything else and exited if that failed. The record: the OS image's smoke test *"caught it
when the api never answered `/healthz`"*, its health check. Bring-up now runs in the background,
and until it finishes, mesh operations return an error that says the
[backend is still initializing](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/notready_client.go).
The container image is also a dependency: before it was built into the OS image, a control plane
that booted before its firewall had no route to download it and *"sits retrying `docker pull`
forever"*.

**Data has to cross the boundary.** The names apps have on the mesh are written into a file
Headscale reloads, on the mesh's regular reconcile, so a new app name waits for it. The embedded
DNS server has no such step: its code says it answers *"from memory on every query with no
zone-file reload"*.

**Embedding means owning correctness.** ADR-0004: *"Embedded DNS trades inherited correctness for
owned correctness."* A mature DNS server already handles negative answers, fallback to TCP and
names in mixed case. An embedded one has to get them right itself, so the record made tests
*"a hard requirement, not a hope"*: unit tests, plus a repeatable
[functional test](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/nameserver/functional_test.go)
that queries a live responder.

## What Rasputin does not do here

Rasputin does not manage WireGuard peers itself; Headscale hands out the peer lists. It does not
model Headscale's access-control policy. And in the manual's words, the mesh *"does not give you
away-from-home access in this release."*

## Try it

You will give one small app both options for looking up a device's mesh address, then break
each one in the way the record describes.

**1. Make a sandbox.**

```
mkdir mesh-choice
cd mesh-choice
```

**2. Write the app's own table of devices.**

```
printf '%s\n' 'desktop 100.64.0.1' 'laptop 100.64.0.2' > devices.txt
```

**3. Write the library.** Paste the whole block at once:

```
cat > lib.sh <<'EOF'
find_addr() {
  awk -v n="$1" '$1 == n { print $2 }' devices.txt
}
EOF
```

`cat > lib.sh <<'EOF'` writes every line up to `EOF` into `lib.sh`. `find_addr` is a function:
it prints the second word of the line in `devices.txt` whose first word is the name you pass.

**4. Write the sidecar.** It has its own config file, and one published command, `lookup`:

```
cat > server.sh <<'EOF'
if [ ! -f server.conf ]; then
  echo "server: no config file" >&2
  exit 1
fi
case $1 in
  lookup) awk -v n="$2" '$1 == n { print $2 }' server.conf ;;
esac
EOF
```

`[ ! -f server.conf ]` is true when the file does not exist. `>&2` sends the message to the error
stream, and `exit 1` reports failure.

**5. Write the app.** It answers a health check, then looks a name up:

```
cat > app.sh <<'EOF'
how=$1
name=$2
if [ "$how" = embedded ]; then
  . ./lib.sh
  addr=$(find_addr "$name")
elif ! addr=$(sh server.sh lookup "$name"); then
  echo "app: names not ready"
  if [ "$startup" = strict ]; then exit 1; fi
fi
echo "app: healthy"
echo "app: $name is ${addr:-unknown}"
EOF
```

`. ./lib.sh` loads the library into the app's own process. The `elif` line runs the sidecar as a
separate process and checks whether it failed. `${addr:-unknown}` prints `unknown` when nothing
was found.

**6. Start both, before the sidecar has a config.** On a fresh machine, the sidecar's config does
not exist yet. Predict which runs print `app: healthy`:

```
sh app.sh embedded laptop
startup=strict sh app.sh sidecar laptop
sh app.sh sidecar laptop
```

`startup=strict` sets a variable for that one command only.

```
app: healthy
app: laptop is 100.64.0.2
server: no config file
app: names not ready
server: no config file
app: names not ready
app: healthy
app: laptop is unknown
```

The strict run never reported healthy. Only the name lookup had failed, and the whole app went
down because it waited on the sidecar. Putting the server in its own process did not isolate the
failure; not waiting for it did. That is the early Rasputin failure described above.

**7. Give the sidecar its config, then add a device to the app's table.**

```
cp devices.txt server.conf
echo 'phone 100.64.0.3' >> devices.txt
sh app.sh embedded phone
sh app.sh sidecar phone
cp devices.txt server.conf
sh app.sh sidecar phone
```

`cp` copies the table into the sidecar's config, standing in for rendering one. `>>` adds a line.

```
app: healthy
app: phone is 100.64.0.3
app: healthy
app: phone is unknown
app: healthy
app: phone is 100.64.0.3
```

The library reads the app's own data, so the phone was there at once. The sidecar knew only what
had been copied across. A real sidecar also has to be told to reload; this one rereads its file
on every call.

**8. Upgrade both.** A new release renames an internal function, as churning internals do. The
sidecar gets the same change inside, and keeps its `lookup` command:

```
cat > lib.sh <<'EOF'
addr_of() {
  awk -v n="$1" '$1 == n { print $2 }' devices.txt
}
EOF
cat > server.sh <<'EOF'
if [ ! -f server.conf ]; then
  echo "server: no config file" >&2
  exit 1
fi
addr_of() {
  awk -v n="$1" '$1 == n { print $2 }' server.conf
}
case $1 in
  lookup) addr_of "$2" ;;
esac
EOF
sh app.sh embedded laptop
sh app.sh sidecar laptop
```

```
app.sh: line 5: find_addr: command not found
app: healthy
app: laptop is unknown
app: healthy
app: laptop is 100.64.0.2
```

The first line varies: Debian and Ubuntu print `app.sh: 5: find_addr: not found`, and BusyBox
prints `app.sh: line 5: find_addr: not found`. The embedded app broke on a change it did not make.
In a compiled program that is a build that fails until your own code changes. The sidecar's
caller never saw the change, because it only uses the published command.

**9. Clean up.**

```
cd ..
rm -rf mesh-choice
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `mesh-choice`.

## Check yourself

1. In step 6, what had actually failed when the strict app refused to report healthy?
2. What breaks if you import a server as a library and its next minor release renames a
   function you call? Which option in the lab absorbed that?
3. In step 7, why did the embedded lookup know about the phone before the sidecar did?
4. You embed a server so that it reads your own data directly. What do you now owe that a mature
   separate server would have given you?

### Answers

1. Only the sidecar, which had no config file. The app's other work was fine; waiting for the
   sidecar took it down.
2. Your program stops building or working until you change your own code. The sidecar absorbed
   it, because its caller relies only on the published `lookup` command.
3. The library ran inside the app and read the app's own table. The sidecar read a copy that had
   to be written out first.
4. Its correctness. Rasputin's record answers that with unit tests and a repeatable functional
   test against a live responder.

## Where to go next

- **The mesh itself:** [What the mesh gives you](https://rasputin.geekdojo.com/docs/the-mesh/),
  in Rasputin's manual, covers the two kinds of names and what the mesh does not give you.
- **The sidecar's supervisor:** [`supervisor_docker.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/supervisor_docker.go),
  which starts Headscale's container.
- **The embedded responder:** the [nameserver package](https://github.com/geekdojo/rasputin-control-plane/tree/v2026.08.5/api/internal/nameserver),
  whose `doc.go` explains why it is not a sidecar.
