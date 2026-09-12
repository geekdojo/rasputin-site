---
title: "Open a serial console"
aliases:
  - /docs/bmc/
description: "Reach a wedged node's serial line from the browser — how to open a console, what line mode cannot do, why one console takes over a whole BitScope rack, and which boards offer one at all."
weight: 101
applies-to: "2026.08.5"
---

**SERIAL CONSOLE** is the screen you use when a node has stopped talking to you. The agent is
gone, SSH is gone, and the only thing left is the machine's serial line — reached through the
management hardware beside it rather than over the network. What you get in the browser is the
node's own console output and a way to send it a line of text.

It is a small screen with three parts: a connection badge in the header, an output pane, and a
one-line input at the bottom.

Before you start, check [whether your hardware has a console at
all](#whether-your-hardware-has-a-console-at-all) — for one supported board the answer is no.
Throughout, `<node-id>` is a node's own id as the **Nodes** page shows it.

## Do this

1. **Select the node on the [Nodes page](/docs/check-a-node/)** and press **`CONSOLE`** in the
   **BMC** section of `NODE CONTROLS`. That is the only way in from the UI: there is no node
   picker on the console screen.
2. **Wait for the badge, top right beside the `NODES` back link, to read `OPEN`.** When the
   session opens, the control plane writes one line into the pane naming the session and the
   backend driving it, where `<session-id>` is that session's own identifier:

```
*** sol session <session-id> open (bitscope)
```

3. **Watch the node.** Everything it emits is appended as it arrives. The pane follows the
   bottom only while you are already near it, so scrolling up to read history stops it
   chasing new output; scroll back down and it resumes following.
4. **To send something, type one line and press Enter** (or click **`SEND`**). A newline is
   added for you. The field takes focus when the page loads and is enabled only while the
   badge reads `OPEN`. Read [Typing is the unproven half](#typing-is-the-unproven-half)
   before you rely on this.
5. **Leave by the `NODES` back link.** Nothing reconnects: once the badge reads `CLOSED` or
   `ERROR`, that is final for this page. Reopen from the node's controls, or reload.

**The badge is the state of your browser's connection, not of the node.** `CONNECTING` in
amber while the page checks that a BMC host reaches this node and opens the session; `OPEN` in
green with the input enabled; `CLOSED` in gray when the session ended — by you leaving, by
someone taking the bus, by the far end, or because it was never accepted in the first place;
`ERROR` in red when the connection failed. A refused connection does not settle on `ERROR`:
it reports the failure and then reports itself closed, so the badge moves on to `CLOSED`.
**The badge alone cannot tell a refusal from a takeover from the known fault below** — the
pane is what distinguishes them, and troubleshooting says how.

## What BMC controls you get

Each node's panel shows only the controls its management hardware can honor:

| Control | What it does |
|---|---|
| **BMC ON / OFF** | Cuts or restores power at the board. A hard cut — the OS is not asked. |
| **FORCE RESTART** | Restarts the node without the OS's cooperation. Use `REBOOT (OS)` instead while the node still responds. |
| **CONSOLE** | A serial console in the browser, reaching the node's login prompt with no network or agent involved. |

A control that your hardware cannot honor **is not rendered**. That is deliberate: a button
that fails on click is worse than an absent one, because it costs you a diagnosis during an
outage.

| Board | Power / restart | Console | Notes |
|---|---|---|---|
| **Turing Pi 2 / 2.5** | Yes | Use the board's own — [why](#whether-your-hardware-has-a-console-at-all) | Over the board's REST API. Needs BMC firmware 2.0.0+. Setting one up: the [Turing Pi guide](/docs/turing-pi/). |
| **BitScope CB04B blades** | Yes | Yes, full character mode | Over the rack's serial control bus, reached through the serial port of one node in the rack — the **rack manager**. `FORCE RESTART` here is a hard power cycle; the blades have no reset line. Setting one up: the [BitScope rack guide](/docs/bitscope-rack/). |

Other hardware is not supported yet. Rasputin is alpha and the list is short on purpose —
each entry is a driver we run on our own bench, not a spec we read.

Rasputin models BMC ability **per node, not per cluster**: each management host tells the
control plane which nodes it reaches *and what it can do for each one*. Power, restart and
console are advertised separately, and a console additionally declares its fidelity, so a
line-oriented or lossy console can be labeled instead of quietly disappointing you. Choosing
a backend and naming the host node is done in **Settings → BMC** — see
[Settings](/docs/settings/).

## Whether your hardware has a console at all

| Board | Console | Why |
|---|---|---|
| **BitScope CB04B blades** | Yes, character mode | The rack's control bus carries a real bidirectional serial bridge to each blade |
| **Turing Pi 2 / 2.5** | **No — by ratified decision** | Use the board's own BMC console instead |
| **Mock (development)** | Yes, character mode | Not hardware — a development stand-in |

**The Turing Pi has no Rasputin console, on purpose.** The board's BMC does expose its nodes'
serial output, but only as a polled ring buffer that is read in chunks and written a command
at a time. A console built on that drops output between reads and mangles what you type, and a
console that lies to you during an outage was judged worse than no console at all. So the
Turing Pi backend advertises power and restart only, and **no `CONSOLE` button appears for its
nodes.** Reach those nodes' consoles through the board's own BMC interface.

**The Mock backend is a development stand-in.** It fakes a full-fidelity BMC, so every node it
is configured with shows a working `CONSOLE`. It is not something you would select on an
appliance.

**No BMC section at all?** If you select a node and its controls panel has no BMC section — no
power, no restart, no console, and no explanation anywhere — the cause is almost always that
no management hardware has been selected for the cluster. BMC is off until you choose a
backend in **Settings → BMC**, and while it is off the whole section is simply absent. Nothing
on the Nodes page says so. The other cause is that your BMC host does not list that particular
node: each node gets only the controls its own management hardware can honor, so one unmapped
slot shows a node with no BMC section beside its neighbours that have one. See
[Settings](/docs/settings/) for choosing a backend; which nodes get controls is the map your BMC
host advertises, which is what this section describes.

## Typing is the unproven half

**Line mode sends whole lines and nothing else.** The footer states it: *"Line-mode v0 console
(Enter sends the line). xterm.js character-mode is the planned upgrade."* That rules out most
of what you would reach for at a real terminal — no Ctrl-C, Ctrl-D or any other control key;
no arrow keys, so no command history and no cursor movement; no tab completion; and no
full-screen programs, because `top`, `vi`, `less` and anything else that paints the terminal
need per-keystroke input and cursor control line mode has no way to send. What it is good for:
watching a node boot, reading kernel messages a wedged machine is still printing, and logging
in to run a short command whose output you read back.

**Console output from a BitScope rack is validated on real hardware** — byte-for-byte in both
directions during a bench session on the rack, including the addressing and framing underneath
it.

**Typed input is not yet dependable, and there is a known open fault.** During that same bench
session the first line an operator sent did reach the node's serial port, and then the console
closed itself before a second line could be sent — with nothing on the Rasputin side having
asked it to. The suspected cause is a byte in the node's own output stream that the control
bus treats as "close the connection", which would mean the far end can end your session at any
moment. That fault is open and unresolved. In the same session the node's login prompt
accepted the line and never echoed or answered it, which is a second, separate open question
about how a login prompt behaves over this bridge.

Practically, for this release:

- Treat the console as a reliable way to **watch** a node and an unproven way to **type** at
  it.
- If the badge flips to `CLOSED` right after your first line, **that is the known fault, not a
  mistake you made.** Reopen from the node's controls.
- Do not build a recovery procedure that depends on sending a sequence of commands here. If
  you need dependable interactive access to a wedged node, attach a serial cable directly.

## What out-of-band console access actually grants

**What it protects.** Your ability to recover a node that has stopped answering. It is the one
path into a machine that does not depend on the node's agent, its SSH server, or its network
being up, which is exactly why it exists.

**What it does not protect.** It is not a lesser form of access than the ones it replaces.
Reaching a node's serial line puts you where someone standing in front of that machine with a
keyboard would be — see *Signing in protects the web interface, not the box* in
[Get in the first time](/docs/get-in-the-first-time/) for what a local console grants on a
Rasputin OS node. What stands in front of it is the web interface's passkey gate and nothing
narrower: anyone who can sign in to your cluster and open a node's controls can open a console
on any node the management hardware advertises. The console screen itself asks you for
nothing. Stated plainly: a signed-in operator with a BMC backend configured can reach a root
console on any node it covers, so operator access is effectively root access on those nodes.
The action that follows is to be deliberate about who you register a passkey for on this
cluster.

**The consequence of each available choice.** On a BitScope rack the surprising part is that
concurrency is **bus-wide, not per-node** — a rack's manager reaches all its blades over one
shared serial line.

- **Opening a console on any node takes over the existing session — even a session on a
  different node.** The old session receives a notice in its pane and closes.
- **That is deliberately take-over rather than refuse.** A browser tab someone closed without
  signing out must never be able to lock the rack's only console out of reach during an
  outage.
- **The practical rule: if two people are working on the cluster, only one of you has a
  console.** The second to open one ends the first one's without being told they did — the
  notice goes to the operator who was displaced, not to the one who displaced them. If you are
  not alone on the cluster, say so before you open a console; someone mid-recovery on another
  blade is the person you are cutting off.
- **Power commands interrupt an open console.** A power-off, power-on or `FORCE RESTART`
  issued against *any* node on the bus suspends the console bridge at a command boundary, runs
  the power command, and reopens the console. You see a gap in the scrollback. That is expected
  and it is why the console can survive you restarting the very node you are watching — but
  you lose whatever it printed during the gap.
- **An open console blocks reconfiguring BMC.** The control plane refuses to reconfigure BMC
  while a session is open, and the job fails with `N SoL session(s) open — close the console
  before reconfiguring BMC`. The count is cluster-wide, so a console open on any node blocks
  it. Pushing a new BMC selection also warns `Any open serial console closes.`, because the
  host node takes over the bus and re-registers — but the refusal is what you meet first.
  Close the console, then apply. See [Settings](/docs/settings/).

**What you cannot take back.** The scrollback, and the session you displaced.

- **Scrollback is capped at 2000 messages** and older ones are dropped with no way to get them
  back. That is 2000 *arrivals* from the node, not 2000 lines — a chatty boot can deliver
  several lines in one and a slow prompt one character in one — so treat it as "roughly a
  generously sized screen's worth of recent history" rather than an exact line count.
- **Output can also be dropped under flood.** There are two buffers between the node and your
  browser, a 256-message one on the BMC host and a roughly thousand-message one in the control
  plane, and a console spewing faster than the browser drains is allowed to lose bytes rather
  than stall the control bus. The smaller one, on the BMC host, drops first. A node in a crash
  loop printing continuously is exactly the case where this shows up.
- **So if you need a boot log kept, copy it out of the pane as it arrives.** Nothing on the
  cluster is keeping it for you.
- **A displaced operator cannot resume.** Their session is gone; all they can do is reopen and
  displace you in turn.

## Troubleshooting

**You typed `/console` and got "No node selected."**
The node's id travels in the address as a query parameter — `/console?node=<node-id>` — rather
than as part of the path, because the dashboard is a set of static pages built ahead of time
and your node ids only exist once the cluster is running. That address works if you bookmark
or type it; `/console` with no node offers a link back to Nodes instead.

**"No BMC host reaches this node's serial line — the console isn't available for it."**
You reached the address of a node no management hardware knows about. Note that this message
is slightly more optimistic than the check behind it: the page only verifies that *some* BMC
host lists this node at all, and whether that host can offer a *console* for it is checked by
the control plane when the connection opens.

**The badge flashed `ERROR`, settled on `CLOSED`, and the pane is completely empty.**
The control plane refused the session — usually a node whose board does power but not console,
reached by typing the address rather than pressing the button. A refusal never prints the
`*** sol session …` line, so the pane stays empty; that emptiness, not the badge, is what
identifies it. Open consoles with the `CONSOLE` button, which only exists where a console
genuinely does.

**The badge went to `CLOSED` with no `ERROR` flash, after the pane had output.**
Either someone opened a console elsewhere on the bus, or the known far-end close fault fired.
The pane distinguishes them: a takeover leaves `*** console taken over: …` in your pane, and
the fault leaves nothing. Reopen from the node's controls. If it recurs after every first
line, that is the open fault.

**The badge is stuck on `CONNECTING`.**
The reachability check has not answered yet, the session is still being set up, or the BMC
host's agent is not answering. Check the BMC host node is online, then reopen.

**`OPEN`, but the pane stays empty.**
The bridge is up and the node is emitting nothing. A node sitting at an idle prompt prints
nothing until something happens. Restart the node from its controls and watch the boot output,
which is the case this console is best at.

**There is no `CONSOLE` button on any node.**
No BMC backend is selected for the cluster. Choose one in **Settings → BMC** — see
[Settings](/docs/settings/).

**There is no `CONSOLE` button on a Turing Pi node.**
Correct, and by ratified decision: that board offers no console Rasputin will present as one
today. Use the board's own BMC console.

**One node has no BMC section while its neighbours do.**
That node is not among the targets the BMC host is configured with — both shipped hardware
backends work from an operator-declared address map. Add it to the map in **Settings → BMC**.

**A gap in the scrollback.**
A power command interrupted the bridge, or output was dropped under flood. Expected; nothing
to do.

**Your typed line vanished with no response.**
The line was sent; whether the far end answers is an open question on this hardware. Do not
retry blind. Attach a serial cable if you need dependable interactive access.

**The input field is disabled.**
The badge is not `OPEN`. Wait, or reopen the console.

**A BMC settings change was refused with `N SoL session(s) open`.**
Close your console tab and try the change again.
