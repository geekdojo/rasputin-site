---
lesson: provisioning.intermediate
---

## What you need

- **The beginner lesson,** [What provisioning gives a new machine](https://rasputin.geekdojo.com/learn/provisioning/beginner/).
  It covers seed files and the identity, role and address they carry.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15 (`sh`, which is bash there, and zsh), Debian 12
  (`sh` is dash) and BusyBox, a minimal Linux toolset, with the same output on all of them. It
  was not tested on Windows.
- **`sh`, `mkdir`, `printf`, `cp`, `cat`, `ls` and `rm`**, already part of macOS and Linux.
  Nothing to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-os)'s control plane and the machines that run
apps boot the same image. On first boot, a short script reads the seed file and sets the machine
up. Some seed settings have a fallback: a missing cluster name becomes `rasputin`, as the
manual says.

The role has no such fallback. `controlplane` and `compute` are different jobs, and nothing on
a blank drive says which one a machine was meant for. So the script has to decide what to do
with a seed that names no role: pick one, or stop.

That case happened. A comment in the first-boot script records it: *"a seed write silently
failed to land"* on the drive, and the machine booted the blank template.

## The decision, and what lost

**First boot stops.** Rasputin's provisioning design, an internal record, states it: *"firstboot
fails loud on an un-provisioned node."* With no role, the script logs an error and exits with a
failure. The agent, the Rasputin program that connects a machine to its control plane, does not
start. Nothing is marked as done, so the script runs again once a real seed is on the drive and
the machine reboots. The [manual](https://rasputin.geekdojo.com/docs/add-a-node/) says a node
whose seed carries no role "stops at first boot rather than guessing."

**What lost is what the script did before.** The design records the incident: the node
*"silently defaulted to `compute`"*, named itself from its board serial, and dialed a control-plane
address that did not resolve on that network. The script's comment says such a node *looks "up" but never appears in inventory*.

**The fix kept the defaults that have a right answer.** The address fallback became the control
plane's default local name. The node id kept its board-serial fallback for a while, and a
separate change rejected placeholder serials such as "Default string", which two boards would
share. Later still, the node id lost its fallback altogether: first boot no longer makes one up,
and a seed that names no node stops it, like a seed that names no role.

**A second decision in the same family: test a dependency before designing around it.** The
first-run bootstrap design, also internal, started from what looked like a loop: passkey sign-in
needs HTTPS, HTTPS seemed to need a DNS name, DNS seemed to need the firewall configured, and
configuring the firewall needs someone signed in. *"Walking the dependency graph, three of the
four links dissolve without new infrastructure."* The firewall's stock setup hands out
addresses before Rasputin manages it. The control plane announces its own `.local` name on the
local network with no DNS server. The cluster's own certificate authority signs the control
plane's HTTPS certificate with no domain. A "pairing beacon" once imagined for the firewall was
later closed as unnecessary, because the flashing tool writes each firewall's seed
before first boot.

## What it cost

**The record names no cost of stopping.** It records a mitigation, and the mitigation shows
where the cost lands. First boot installs the seed's SSH key, the key that lets you log in to the
machine over the network, *before* the checks that stop it, so *"a botched seed that at least
carries a key still leaves the operator SSH access to debug it."*

**Inferred, not recorded: a stopped machine is loud only to someone looking at that machine.**
The control plane never hears from it. The manual's troubleshooting agrees: a node that cannot
reach the cluster fails quietly, the Nodes page shows at most its pending slot, and you
check the machine at its local console. Stopping trades a machine that looks fine for one
that needs a visit.

**Also inferred, not recorded: every check is a new way to stop a boot.** A later check stops
first boot on a control-plane seed with no node id, because, in the manual's words, *"the control
plane's identity must be stable."* The record counts that check as a benefit. The cost is our
reading: a hand-written seed that used to boot now does not.

## What Rasputin does not do here

It does not guess a role. It does not report a machine that stopped at first boot: until the
machine joins, the control plane shows at most the slot reserved for it, and nothing times that
slot out.

## Try it

You will write two first-boot scripts that differ in that one choice, boot both machines on a
seed that never landed, then deliver the real seeds.

**1. Make a sandbox.** Run these one at a time:

```
mkdir firstboot-choice
cd firstboot-choice
mkdir controlplane machine-a machine-b
printf 'ROLE=\nNODE_ID=\nCONTROL_PLANE=\n' > machine-a/seed.env
cp machine-a/seed.env machine-b/
```

As in the beginner lesson, `controlplane` stands in for the control plane: a machine joins by
writing a file there. Both seeds are the blank template, every setting empty, which is what a
drive holds when the real seed never reached it.

**2. Write the quiet script.** Copy from `cat` down to the last `END`:

```
cat > quiet.sh <<'END'
m=$1
if [ -f "$m/provisioned" ]; then exit 0; fi
. "./$m/seed.env"
ROLE=${ROLE:-compute}
NODE_ID=${NODE_ID:-node-$m}
CONTROL_PLANE=${CONTROL_PLANE:-old-controlplane}
echo "$NODE_ID, role $ROLE" > "$m/provisioned"
echo "$m: up as $NODE_ID, role $ROLE"
if [ -d "$CONTROL_PLANE" ]; then echo "$ROLE" > "$CONTROL_PLANE/$NODE_ID"; fi
END
```

`$1` is the machine's folder. The `if [ -f … ]` line makes this a first boot: once a machine
has a `provisioned` file, the script does nothing. `.` reads the seed's settings.
`${ROLE:-compute}` means "the value of `ROLE`, or `compute` if it is empty". These are the
fallbacks in Rasputin's record: a role of `compute`, a name from the machine, and an address that does
not resolve here, `old-controlplane`. `[ -d … ]` checks that a folder
exists, so a machine with the wrong address reports nowhere, and says nothing about it.

**3. Write the loud script.** The same, except for the role and the address fallback:

```
cat > loud.sh <<'END'
m=$1
if [ -f "$m/provisioned" ]; then exit 0; fi
. "./$m/seed.env"
if [ -z "$ROLE" ]; then
  echo "$m: ERROR: the seed names no role. Stopping."
  exit 1
fi
NODE_ID=${NODE_ID:-node-$m}
CONTROL_PLANE=${CONTROL_PLANE:-controlplane}
echo "$NODE_ID, role $ROLE" > "$m/provisioned"
echo "$m: up as $NODE_ID, role $ROLE"
if [ -d "$CONTROL_PLANE" ]; then echo "$ROLE" > "$CONTROL_PLANE/$NODE_ID"; fi
END
```

`[ -z "$ROLE" ]` is true when `ROLE` is empty, and `exit 1` ends the script with a failure.

**4. Boot both on the blank seed.** Predict what the control plane will list.

```
sh quiet.sh machine-a && echo "service: started" || echo "service: failed"
sh loud.sh machine-b && echo "service: started" || echo "service: failed"
ls -1 controlplane
```

`&&` runs the next command only if the script succeeded, and `||` only if it failed. The echoed
line stands in for what a service manager, the program that starts services at boot, records.
`ls -1` lists one name per line (`-1` is the digit one).

```
machine-a: up as node-machine-a, role compute
service: started
machine-b: ERROR: the seed names no role. Stopping.
service: failed
```

The control plane lists nothing, for either machine. From where it sits, a machine that guessed
and a machine that stopped look exactly alike: absent. The difference exists only on the
machines. `machine-a` says it is up, and its service manager agrees. `machine-b` says what is
wrong.

**5. Deliver the real seeds, and reboot.** Both machines were meant to be databases. Predict
the list again.

```
printf 'ROLE=database\nNODE_ID=node-1\nCONTROL_PLANE=controlplane\n' > machine-a/seed.env
printf 'ROLE=database\nNODE_ID=node-2\nCONTROL_PLANE=controlplane\n' > machine-b/seed.env
sh quiet.sh machine-a && echo "service: started" || echo "service: failed"
sh loud.sh machine-b && echo "service: started" || echo "service: failed"
ls -1 controlplane
```

```
service: started
machine-b: up as node-2, role database
service: started
node-2
```

`machine-b` read its real seed and joined. `machine-a` printed nothing, reported started, and is
still missing.

**6. Ask `machine-a` what it thinks it is.**

```
cat machine-a/provisioned
```

```
node-machine-a, role compute
```

It finished its first boot on the guess, so it never read the seed you just wrote. The silent
default did more than hide the problem: it recorded the guess as done. The loud script marked
nothing, which is why the real seed worked on `machine-b`.

**7. Undo the guess.**

```
rm machine-a/provisioned
sh quiet.sh machine-a && echo "service: started" || echo "service: failed"
ls -1 controlplane
```

```
machine-a: up as node-1, role database
service: started
node-1
node-2
```

Here the fix is one file, once you know it is needed. Nothing on the control plane told you.

**8. Clean up.**

```
cd ..
rm -rf firstboot-choice
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `firstboot-choice`.

## Check yourself

1. In step 4, the control plane listed neither machine. Where could you tell them apart?
2. What breaks if the quiet script's address fallback is `controlplane`, the folder that exists,
   and step 4 runs again?
3. A board reports its serial number as "Default string". Why is that a bad node id, when a real
   serial is a good one?
4. A design says new machines cannot get network addresses until the control plane is running,
   and proposes a beacon to work around it. What do you check first?

### Answers

1. Only on the machines: the message each printed, and the service status. The quiet machine
   reported started.
2. `machine-a` joins as `node-machine-a`, role `compute`. It is listed and looks healthy, and
   the database it was meant to be never runs. It fails differently, not less.
3. A default is only safe when it has one right answer. Many boards report the same placeholder,
   so two machines would claim one id.
4. Whether the dependency is real. In Rasputin's case the firewall's stock setup already handed
   out addresses before the control plane existed.

## Where to go next

- **When a node never joins:** [Add a node](https://rasputin.geekdojo.com/docs/add-a-node/), in
  Rasputin's manual; its troubleshooting covers a pending node and a node that stopped at first
  boot.
- **Which seed settings are required:** [Provisioning & the seed file](https://rasputin.geekdojo.com/docs/provisioning/).
