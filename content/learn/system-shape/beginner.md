---
lesson: system-shape.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 and on Ubuntu 24.04. It was not tested on
  Windows.
- **`mkdir`, `echo`, `cat`, `cp`, `sh`, `tail`, `grep` and `rm`**, commands that are already part
  of macOS and Linux. Nothing to install, and no administrator rights needed. `sh` is not the same
  program on every system, and every step printed the same output on both systems.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

A **distributed system** is a group of computers that work together over a network. Even a
small one, three or four machines at home, usually has the same three parts:

- The **control plane** manages. It holds the **desired state**: what you have asked for, such
  as "machine A runs the web server".
- The **nodes** are the managed machines, and they do the work. Each runs an **agent**, a small
  program that carries out instructions on that machine.
- The **channel** is the network connection between them. It carries instructions down to the
  nodes and reports back up.

Which part decides what? The control plane decides what *should* happen. A node decides what
*does* happen on it, because in normal operation only the node's own agent carries out work on
it, and only the node knows for certain what it is running.

That last point is the one people miss. A control plane's screen is not a live view of the
machines. It is a collection of **reports**, each as old as the last message that got through.
To tell an old report from a current one, many systems have every node send a **heartbeat**, a
short "still here" message at a regular interval, and treat a missing heartbeat as a warning.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os/blob/2026.08.5/README.md) is an open-source
system for running a small group of computers at home: in its README's words, *"a small fleet of
nodes … managed from one web UI"*. One machine runs the control plane.

[Its manual](https://rasputin.geekdojo.com/docs/check-a-node/) describes the channel, which
Rasputin calls a **message bus**: every node's agent *"holds a connection to the cluster's message
bus on the control plane"*, and heartbeats, logs, app deployments and update commands all travel
over it. When a node's heartbeat stops, the control plane also asks a second network, called the
mesh, whether it can still see the machine. If it can, the node is marked `OFF BUS`: the machine
is up, and the control plane cannot update it, back it up or command it. Otherwise it is marked
`OFFLINE`.

## Try it

You will play the control plane and two nodes. Each part gets a folder, and one rule holds for
the whole lab: **a part writes only in its own folder.** The channel is the only thing that
copies between them.

**1. Make a sandbox.** Run these one at a time:

```
mkdir shape-lab
cd shape-lab
mkdir control-plane node-a node-b
echo nothing > node-a/status
echo nothing > node-b/status
```

`mkdir` makes a new, empty folder; `cd` moves you into it. `echo` prints a word, and `>` sends it
into a file instead of the screen. Both nodes start running nothing.

**2. Write the agent and the channel.** Copy the whole block and paste it into the terminal at
once:

```
cat > agent.sh <<'EOF'
cat $1/told >> $1/status
EOF
cat > channel.sh <<'EOF'
cp control-plane/want-$1 $1/told
cp $1/status control-plane/status-$1
EOF
```

This writes two tiny programs, **scripts**, where `$1` stands for the node you name. `agent.sh`
runs what the node was told and adds a line saying so to its `status` file (`>>` adds to the end).
Each line is a report; each new line is a heartbeat. `channel.sh` is one trip: `cp` copies the
instruction down, then the status up.

**3. Ask for something, and send it.** You are the control plane.

```
echo web > control-plane/want-node-a
sh channel.sh node-a
```

`sh` runs a script. The instruction has reached node A, and a report has come back. Predict: what
does the control plane say node A runs?

```
tail -n 1 control-plane/status-node-a
```

```
nothing
```

`tail -n 1` prints the last line of a file. Nothing is broken. The report left node A on the same
trip that delivered the instruction, before the node had acted on it.

**4. Let the node act.**

```
sh agent.sh node-a
grep -n . node-a/status control-plane/status-node-a
```

```
node-a/status:1:nothing
node-a/status:2:web
control-plane/status-node-a:1:nothing
```

`grep` prints the lines of a file that match a pattern. `.` matches any line that is not empty,
and `-n` adds line numbers, so the last number is the heartbeat count. Node A runs `web`; the
control plane will not know until the next trip. Even when everything works, a report is as old
as the last trip.

**5. Finish that trip, and bring node B up the same way.**

```
sh channel.sh node-a
echo web > control-plane/want-node-b
sh channel.sh node-b
sh agent.sh node-b
sh channel.sh node-b
grep -n . control-plane/status-*
```

```
control-plane/status-node-a:1:nothing
control-plane/status-node-a:2:web
control-plane/status-node-b:1:nothing
control-plane/status-node-b:2:web
```

`*` stands for every file whose name starts that way. Both report `web`, after two heartbeats.

**6. Break each node a different way.** Node A's agent stops, so only its channel runs. Node B's
channel is cut, so only its agent runs. Two rounds:

```
sh channel.sh node-a
sh agent.sh node-b
sh channel.sh node-a
sh agent.sh node-b
```

Predict: can the control plane tell which node has which problem?

```
grep -n . control-plane/status-*
```

```
control-plane/status-node-a:1:nothing
control-plane/status-node-a:2:web
control-plane/status-node-b:1:nothing
control-plane/status-node-b:2:web
```

Nothing changed for either node. Both heartbeat counts are stuck at 2, so the control plane knows
both reports are old, but not why. Only the nodes' folders show it:

```
grep -n . node-a/status node-b/status
```

```
node-a/status:1:nothing
node-a/status:2:web
node-b/status:1:nothing
node-b/status:2:web
node-b/status:3:web
node-b/status:4:web
```

Node A went silent. Node B kept working, sending heartbeats into a cut channel. The heartbeat
looks the same for both. Telling them apart takes a second way to see the machine; in Rasputin,
that is the mesh.

**7. Clean up.**

```
cd ..
rm -rf shape-lab
```

`rm` deletes; `-r` includes everything inside the folder, and `-f` skips the questions. It cannot
be undone, so check you typed `shape-lab`.

## Check yourself

1. In the lab, which part decided what node A should run, and which part decided what it did run?
2. In step 3 nothing was broken. Why did the control plane still say `nothing`?
3. A Rasputin node shows `OFF BUS`. Does that mean the machine is switched off?

### Answers

1. The control plane decided what should run. Node A decided what did run, and was the only part
   that knew it for certain.
2. The report came up on the same trip that took the instruction down, before node A had acted.
3. No. Its heartbeat has stopped reaching the control plane, but a second network, the mesh, can
   still see the machine. The machine is up; the control plane cannot command it.

## Where to go next

- **Node states, one by one:** [Check on a node](https://rasputin.geekdojo.com/docs/check-a-node/),
  in Rasputin's manual, explains `OFF BUS`, `OFFLINE` and the heartbeat behind them.
- **What the top bar counts:** [Finding your way around](https://rasputin.geekdojo.com/docs/finding-your-way-around/)
  explains `NODES ON LAN`, the nodes the control plane can currently hear.
