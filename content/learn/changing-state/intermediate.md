---
lesson: changing-state.intermediate
---

## What you need

- **The beginner lesson,** [The parts of a small distributed system](https://rasputin.geekdojo.com/learn/system-shape/beginner/).
  It covers the control plane, its nodes, and heartbeats.
  [Why every change goes through one path](https://rasputin.geekdojo.com/learn/changing-state/beginner/)
  helps too, but is not required.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Ubuntu 24.04 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `mkdir`, `echo`, `cat`, `touch`, `printf`, `grep` and `rm`**, already part of macOS
  and Linux. Nothing to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

A control plane holds **desired state**, what should be true, and learns **observed state**,
what is true, from reports. It has to answer two questions.

When something has to happen to a machine, does it act once, when an **event** such as "node
added" arrives? Or does it **converge**: compare desired with observed on a schedule, in a pass
called a **reconcile**, and act on any gap it finds?

And for a fact that changes, such as whether a node is up, does it **store** the fact when it
changes, or **derive** it, computing it from other recorded facts each time someone asks?

## The decision, and what lost

**Converge, not act once.** [Rasputin](https://github.com/geekdojo/rasputin-os)'s nodes join a
private network, the **mesh**, run by a coordination server on the control plane. Joining used
to be an event: when a node first registered, the control plane enrolled it, exactly once, with no
retry. On a fresh cluster, nodes register while that server is still starting. The mesh design,
an internal record, found *"21 of 23 computes unenrolled"* on one cluster: only the two that
registered after the server was up had joined, and the only fix was enrolling each node by hand.
The decision: *"mesh membership is a converged invariant, not a fire-once event."* A reconcile
now enrolls any missing node; the event stays as the fast path.

**Derive, not store.** Rasputin's first-run setup wizard shows which steps are done. An early
draft kept one stored row per step, and the setup design rejected it: *"That table would have
lied to us as soon as a subsystem changed underneath it."* Each step is now checked against the
subsystem it belongs to. Node status works the same way. The nodes design: *"Status is never
stored — it's computed from last_seen on every read. This keeps writes cheap and the status fresh
without a separate update path."* `last_seen` is the time of the node's last heartbeat.

That design does not weigh storing status. This lesson's reading of why it lost, shown in the
lab: a stored `online` is written when a heartbeat arrives, and when heartbeats
stop, nothing arrives to write anything else.

Deriving also made a later change cheap. A node silent for over two minutes used to read
`OFFLINE`. Now, if the mesh still sees the machine, it reads `OFF BUS`: the machine is up and its
agent is not ([manual](https://rasputin.geekdojo.com/docs/check-a-node/)). The new word is one
rule in [one place](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/inventory/presence.go),
so everything that reads status agrees, and no stored status had to be rewritten.

## What it cost

**Converging never stops working.** Each reconcile is a **job**, a recorded run of steps listed
on the web interface's Tasks page. With six kinds running every five minutes, the manual says an
idle cluster produces about seventy jobs an hour, so the page's 50 rows cover roughly forty
minutes. A reconcile also needs guards: enrollment is tried only for nodes that are online, never
while an enroll job is queued or running, and after a failure it waits, starting at 30 seconds
and doubling to a 30-minute cap.

**A derived answer can lag, and intent cannot be derived.** The setup design says *"the wizard can
flicker — a freshly-completed step can briefly show as un-done while the relevant subsystem
catches up"*, and calls it an *"Acceptable trade for honest state."* What a person chose, such as the installation's
name or how it is wired to the network, has no subsystem to ask. User intent is stored.

**Nothing announces a derived change.** To update the web interface's live view when a status
changes, a separate check runs every 10 seconds and compares the computed status with the last
one it announced. Calling that a cost of deriving is this lesson's reading; the record describes
it as the design.

## What Rasputin does not do here

The mesh reconcile enrolls firewall, compute and storage nodes that are online. It never enrolls
the control plane; you enroll that yourself, from setup or the Mesh page. A mesh the control plane
cannot read never turns `OFFLINE` into `OFF BUS`.

## Try it

You will enroll nodes both ways, then keep node status both ways. Time is a number you type, so
every run prints the same.

**1. Make a sandbox and a server that is still starting.**

```
mkdir state-lab
cd state-lab
echo starting > server
touch enrolled.txt
cat > enroll.sh <<'EOF'
if [ "$(cat server)" = up ]; then
  echo "$1" >> enrolled.txt
  echo "enrolled $1"
else
  echo "failed $1: server is $(cat server)"
fi
EOF
```

`touch` makes an empty file. `cat > enroll.sh <<'EOF'` writes every line up to `EOF` into
`enroll.sh`; paste that part as one block. `$1` is the node's name, and `>>` adds a line to the
end of a file.

**2. Act once, on each node's arrival.** Three nodes register while the server starts, then it
comes up and a fourth registers. Predict what `enrolled.txt` holds.

```
for n in node-1 node-2 node-3; do sh enroll.sh "$n"; done
echo up > server
sh enroll.sh node-4
cat enrolled.txt
```

```
failed node-1: server is starting
failed node-2: server is starting
failed node-3: server is starting
enrolled node-4
node-4
```

The server is up, and three nodes are still out: their events came and went, and nothing sends
them again.

**3. Converge instead.** Write down what should be true, and a reconcile that closes the gap:

```
printf '%s\n' node-1 node-2 node-3 node-4 > want.txt
cat > reconcile.sh <<'EOF'
while read -r n; do
  grep -qx "$n" enrolled.txt || sh enroll.sh "$n"
done < want.txt
EOF
```

`printf '%s\n'` prints each word on its own line. The loop reads `want.txt` a line at a time.
`grep -qx` quietly checks for a line that matches exactly, and `||` runs the enrollment only if
it does not.

```
sh reconcile.sh
sh reconcile.sh
grep -c . enrolled.txt
```

```
enrolled node-1
enrolled node-2
enrolled node-3
4
```

The first pass enrolled the three; the second found no gap. `grep -c .` counts non-empty
lines.

**4. Pay for it.** A fifth node is wanted while the server restarts. Run two passes:

```
echo node-5 >> want.txt
echo restarting > server
sh reconcile.sh
sh reconcile.sh
```

```
failed node-5: server is restarting
failed node-5: server is restarting
```

Every pass tries again, and in Rasputin every pass is a job on the record.

**5. Keep status both ways.** Each heartbeat records when it arrived, in `seen`, and also stores
the word `online`, in `stored`. A second script derives status from `seen`, using 30 and 120
seconds as the limits for `stale` and `offline`.

```
mkdir seen stored
cat > beat.sh <<'EOF'
echo "$2" > "seen/$1"
echo online > "stored/$1"
EOF
cat > derive.sh <<'EOF'
for f in seen/*; do
  gap=$(( $1 - $(cat "$f") ))
  if [ "$gap" -lt 30 ]; then s=online
  elif [ "$gap" -lt 120 ]; then s=stale
  else s=offline
  fi
  echo "${f#seen/} $s"
done
EOF
```

`$(( … ))` does arithmetic: the time asked about, minus the last heartbeat. `-lt` means less
than. `${f#seen/}` is the file name without its folder. Now both nodes beat at second 1000, and
only node 1 beats again, at 1300:

```
sh beat.sh node-1 1000
sh beat.sh node-2 1000
sh beat.sh node-1 1300
```

**6. Ask at second 1310.** Predict what each approach says about node 2.

```
grep . stored/*
sh derive.sh 1310
```

```
stored/node-1:online
stored/node-2:online
node-1 online
node-2 offline
```

The stored word says node 2 is online, and nothing will change it: only a heartbeat writes it, and
node 2 has stopped sending them. The derived answer was computed just now.

**7. Add a second source, and a new word.** The mesh saw node 2 at second 1305. Add one rule on
top of the derived status:

```
mkdir mesh
echo 1305 > mesh/node-2
cat > presence.sh <<'EOF'
sh derive.sh "$1" | while read -r node s; do
  if [ "$s" = offline ] && [ -f "mesh/$node" ]; then s=off-bus; fi
  echo "$node $s"
done
EOF
sh presence.sh 1310
```

```
node-1 online
node-2 off-bus
```

`|` feeds one script's output into the next. The heartbeat recorded before this rule existed
reads with the new word, and nothing was rewritten. Take the mesh's sighting away:

```
rm mesh/node-2
sh presence.sh 1310
```

```
node-1 online
node-2 offline
```

With no sighting, the rule does not guess.

**8. Clean up.**

```
cd ..
rm -rf state-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `state-lab`.

## Check yourself

1. In step 2, the server came up. Why did nodes 1 to 3 stay out?
2. What breaks if a reconcile has no guards, the server is down for an hour, and passes run every
   five minutes?
3. In step 6, what would it take to make `stored/node-2` say `offline`?
4. Had Rasputin stored status, what would adding `OFF BUS` have needed besides the new rule?

### Answers

1. Acting once means acting on the event, and their events arrived while the server was
   starting. Nothing recorded that they still needed enrolling.
2. Twelve failed attempts an hour for every missing node, each one recorded, pushing real work
   off the end of a short list. Rasputin's reconcile waits longer after each failure.
3. A second writer that runs on a timer, checks every node's last heartbeat and rewrites the word:
   a separate update path, which is what the nodes design says deriving avoids.
4. A pass rewriting every stored status that should now read `OFF BUS`, and a writer to change
   it again whenever the mesh's sighting did. Derived, the one rule was enough.

## Where to go next

- **Every node state, and where each sends you:** [Check on a node](https://rasputin.geekdojo.com/docs/check-a-node/),
  in Rasputin's manual.
- **Reconcile jobs on the record:** [Watch what the cluster is doing](https://rasputin.geekdojo.com/docs/watch-what-the-cluster-is-doing/).
- **The code:** the status rule in
  [`presence.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/inventory/presence.go),
  and the enrollment reconcile in
  [`mesh/jobs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/mesh/jobs.go).
