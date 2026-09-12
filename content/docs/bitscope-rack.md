---
title: "Rasputin on a BitScope blade rack"
description: "Configuring a BitScope CB04B blade rack with Rasputin — the rack manager that owns the serial control bus, and the address map that decides which node a power button actually cuts."
weight: 23
applies-to: "2026.08.5"
---

A BitScope CB04B blade rack puts several nodes on a blade and several blades in a rack — the
bus addresses six rows of four — and every node has its own BMC. All of those BMCs share **one
control bus**, and that bus is reached over the serial port of a single node sitting in the
rack — the **rack manager**. Rasputin drives that bus directly, so a wedged node is a button in
the dashboard instead of a walk to the rack.

A rack is a different shape of problem from a network BMC like the [Turing Pi
2](/docs/turing-pi/). There is nothing on the network to look for, so there is nothing to
detect: you tell Rasputin where the bus is and what is plugged in where. That last part is the
whole job, and it is the part nothing can check for you.

## Read this before you build the rack

**Write the positions down as you build.** Rasputin addresses a node by where it physically
sits, and nothing verifies the map you type. If you are provisioning the rack yourself you
already know which node id you seeded onto which card as you slide it into a slot — recording
it then is the only method that costs nothing. Every other way of finding out involves powering
nodes off to see which one goes dark.

**Pick your rack manager before you flash it.** The manager needs a seed flag that is read at
first boot, so it is a provisioning-time decision and getting it wrong means flashing that node
again. The next section is the one to read before you start.

## The rack manager

One node in the rack drives the control bus over its own serial port. It has to have been
provisioned with `RASPUTIN_BMC_HOST=1` in its seed — see the [seed-file
reference](/docs/provisioning/).

That flag takes the login prompt and the kernel's own messages off the node's serial port,
because on that port they are not log output — they are bytes on a live command bus. It costs
one extra reboot during first boot.

**It is read at first boot, so this is a provisioning-time decision.** If the node you want as
manager was not provisioned with the flag, provision it again with it set. Then choose that
same node as the **BMC HOST** in Settings — the two have to agree, and nothing checks that for
you yet.

## Configure it in Settings

BMC is off until you select a backend. Nothing registers, nothing is advertised, and the
control plane refuses every BMC operation until then — a cluster that has not been told about
management hardware does not guess.

Go to **Settings → BMC**, choose the **BitScope CB04B blade rack** backend, and pick your rack
manager as the **BMC HOST NODE**. Every BMC command is routed to that node's agent, which is
why it has to be the one node actually wired to the bus. Then fill in the three fields below
and press **APPLY**.

- **SERIAL DEVICE** — leave it blank. Blank means `/dev/ttyS0`, the Pi's 40-pin-header UART,
  which is the port a rack manager drives the bus over. Fill this in only if your manager
  reaches the bus some other way.

  *On 2026.07.7 and earlier, type `/dev/ttyS0` here.* Those releases defaulted to
  `/dev/serial0` — the Raspberry Pi OS name for the same port, which the Rasputin image does
  not create, so a blank field could not open the bus. Typing it works on every release.
- **UNLOCK SEQUENCE** — leave it blank. The blades' BMCs ship locked and blank means the
  factory unlock sequence. Fill this in only if you have written a different one into the
  blades' EEPROMs yourself.
- **ADDRESS MAP** — below.

## The address map

A blade derives each node's address from its position on the bus, with no commissioning step.
So the map is a list of rack positions and which Rasputin node is in each one.

A position is `ROW-SLOT`:

- **Rows are `A` to `F`, top to bottom** — `A` is the topmost blade in the rack.
- **Slots are `0` to `3`, right to left** as you face the front — `0` is the rightmost node on
  a blade.

So `A-0` is the **top-right** node and `F-3` the **bottom-left**. Both axes count from the
top-right corner, which is worth fixing in your head before you start typing: it is the
opposite of the bottom-up numbering most racks use.

One JSON row per node:

```
[
  {"pos": "A-0", "node_id": "c01"},
  {"pos": "A-1", "node_id": "c02"},
  {"pos": "A-2", "node_id": "c03"}
]
```

`node_id` is the Rasputin node id — the name the node appears under in the dashboard, which is
the one you gave it when you provisioned it.

Only the nodes you list get BMC controls. A slot that is empty, or that holds something which
is not part of this cluster, is simply left out; Rasputin then advertises nothing for it rather
than offering a button that would act on someone else's machine.

**Get the positions right before the rack is carrying anything.** Nothing verifies this map for
you. If a row is off by one, the OFF button on the node you meant cuts power to its neighbor,
and that will look like a Rasputin bug rather than a typo. Two ways to be sure:

- **Write it down as you build** — as above, the only method that costs nothing.
- **Verify one node at a time.** On a rack that is not doing anything yet, apply your best
  guess, then power one node off from the dashboard and check that the node that goes offline
  is the one you meant. Walk the rack once and you never have to do it again.

## Power and console from the dashboard

Once configured, every node you listed gets **BMC ON/OFF**, **FORCE RESTART** and **CONSOLE**
in its panel. A rack is the one supported *hardware* backend that offers all three — the Turing
Pi deliberately offers no console.

**FORCE RESTART is a hard power cycle** — off, a pause, back on. The blades have no reset line,
so there is nothing gentler available in the hardware, and Rasputin records the result as a
hard power-cycle rather than letting "restart" imply something softer than it is. Use
`REBOOT (OS)` instead while the node still responds.

**The console is full character mode, and it is bus-wide rather than per-node.** One shared
serial line means opening a console on any node in the rack takes over whichever session was
already open, even on a different node; power commands interrupt an open console; and an open
console blocks reconfiguring BMC. [Open a serial
console](/docs/open-a-serial-console/) covers what that means while you are using it.

## Troubleshooting

**The OFF button cut power to the wrong node.**
The address map is off by one, or two entries are swapped. Nothing validates it, so this is a
typo rather than a fault. Correct it in **Settings → BMC** and walk the rack once with the
one-node-at-a-time check above.

**No BMC controls appear anywhere after APPLY.**
The bus could not be opened. On **2026.07.7 and earlier** a blank **SERIAL DEVICE** cannot open
it — type `/dev/ttyS0`. Otherwise check that the node you chose as **BMC HOST NODE** is the one
wired to the bus, and that it was provisioned with `RASPUTIN_BMC_HOST=1`.

**One node has no BMC section while its neighbours do.**
That node is not in the address map. Both shipped backends work from an operator-declared map,
so a node that is not listed is advertised nothing. Add it.

**A BMC settings change was refused with `N SoL session(s) open`.**
The control plane will not reconfigure BMC while a serial console is open, and the count is
cluster-wide. Close the console tab and apply again.

**The rack manager's own serial port shows a login prompt.**
It was not provisioned with `RASPUTIN_BMC_HOST=1`. On that port a login prompt and kernel
messages are bytes on a live command bus, not log output. Provision that node again with the
flag set.
