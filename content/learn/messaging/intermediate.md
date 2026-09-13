---
lesson: messaging.intermediate
---

## What you need

- **The beginner lesson,** [How machines send each other messages](https://rasputin.geekdojo.com/learn/messaging/beginner/).
  It covers publish/subscribe, request/reply, deadlines, and why a machine that connects outward
  needs no open port.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12, Ubuntu 24.04 and BusyBox, a minimal
  Linux toolset, with the same output on all four. It was not tested on Windows.
- **`sh`, `awk`, `cat`, `echo`, `grep` and `touch`**, already part of macOS and Linux. Nothing to
  install, and no administrator rights.

You do not need a message broker, Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-control-plane) runs a small group of machines at
home. One machine, the control plane, sends commands such as "deploy this app" to a program on
every machine, the agent. Two facts constrain how.

**Direction.** If the control plane had to connect to each agent, every machine would need a
listening port, an open door waiting for connections, and one of those machines is the
firewall.

**Absence.** A machine can be switched off, rebooting, or updating when a command is sent.
Something has to decide what happens to that command.

A **transport** is the software that carries messages between programs. Choosing one means
answering both questions: who connects to whom, and what happens to a message whose receiver is
not there.

## The decision, and what lost

Rasputin uses NATS, a message broker. The control-plane design, an internal record, lists the
reasons. Among them: *"Outbound-only agents. Every agent dials"* the broker, so there are *"No
listening ports on the firewall node."* And durability, a queue that keeps a message until its
receiver takes it: *"Agent goes offline for hours → JetStream retains its commands → agent rejoins
and drains."* JetStream is the part of NATS that stores messages.

| Alternative | Why it lost, in the record |
|---|---|
| gRPC, a request/reply framework | Durability: *"No equivalent in gRPC."* |
| MQTT, a broker common on home networks | *"Missing: durable streams, request/reply, object/KV store, replay semantics."* |
| Kafka, a durable log broker | Named in the section's heading; no reason is recorded. |

Two notes on reading this table. The record lists outbound-only agents as a reason for NATS, but
does not say gRPC could not do it: a gRPC agent can dial out and hold a stream open. Its stated
difference is durability. And MQTT version 5 added properties for request/reply, which the record
does not discuss.

## What it cost

**The headline reason against gRPC never shipped.** The public architecture notes, on what the
bus does not give you, say it plainly: *"There is no work-queue delivery and no dedup."* Dedup,
short for deduplication, is recognizing a message you have already handled. Commands are plain
request/reply. *"An agent that is offline has nothing queued for it and receives nothing on
reconnect."* JetStream is used only as a passive archive of job history.

The record does not say why the command queue was not built. A related internal note defers
durable resume of interrupted jobs, *"unbuilt and unscheduled until a second use case needs it."*

**So every sender has to decide what "no reply" means.** The same notes: *"a lost reply is
indistinguishable from work that never happened."* Retrying might repeat the work; not retrying
might leave it undone. Rasputin's general answer is a rule, not a mechanism. A step whose effect
cannot be undone is marked irreversible, and the job runner never retries it automatically. The notes call
that *"a refusal, not idempotency"*: idempotent work is safe to repeat, and this work is not made
safe, only not repeated.

## What Rasputin does not do here

Rasputin does not queue a command for a machine that is offline, its bus does not deduplicate
commands, and it does not undo the earlier steps of a job that fails.

## Try it

You will send commands over a transport with no queue, then over one with a queue, and see what
each does with an absent machine and a lost reply.

**1. Make a sandbox.**

```
mkdir transport-choice
cd transport-choice
```

**2. Write a sender with no queue.** A file named `online` stands for the worker being connected.
`did.log` is the worker's record of what it actually did. Paste the whole block:

```
cat > send.sh <<'EOF'
if [ ! -e online ]; then
  echo "no reply: $1"
  exit 1
fi
echo "$1" >> did.log
if [ -n "$LOSE_REPLY" ]; then
  echo "no reply: $1"
  exit 1
fi
echo "done: $1"
EOF
```

`[ ! -e online ]` is true when the file does not exist. `$1` is the command you pass. When
`LOSE_REPLY` is set, the worker does the work and the reply goes missing; `-n` tests that it is
not empty.

**3. Three commands.** The worker is connected, then away, then back with a reply lost on the way:

```
touch online
sh send.sh "restart app"
rm online
sh send.sh "stop app"
touch online
LOSE_REPLY=1 sh send.sh "add user ana"
```

`LOSE_REPLY=1 sh …` sets the variable for that one command only.

```
done: restart app
no reply: stop app
no reply: add user ana
```

**4. Retry what got no reply.** Retrying is the obvious fix. Predict how many lines `did.log`
will hold:

```
sh send.sh "stop app"
sh send.sh "add user ana"
cat did.log
```

```
done: stop app
done: add user ana
restart app
add user ana
stop app
add user ana
```

The retry fixed `stop app`, which had never run, and ran `add user ana` a second time. From the
sender, both failures printed the same line.

**5. Add a queue.** The queue keeps each command in a file. The worker drains it when it comes
back, and records how many lines it has finished in `acked`, its acknowledgment:

```
cat > queue.sh <<'EOF'
echo "$1" >> queue.txt
echo "queued: $1"
EOF
cat > drain.sh <<'EOF'
acked=$(cat acked 2>/dev/null || echo 0)
awk -v n="$acked" 'NR > n' queue.txt | while read -r cmd; do
  echo "$cmd" >> did.log
  echo "done: $cmd"
  if [ -n "$CRASH" ]; then
    echo "worker stopped before its acknowledgment"
    exit 1
  fi
  acked=$((acked + 1))
  echo "$acked" > acked
done
EOF
```

`2>/dev/null || echo 0` means "0 if there is no `acked` file yet". `awk 'NR > n'` prints the
lines after the first `n`. `$((acked + 1))` is arithmetic.

**6. Queue a command while the worker is away.** Start a fresh log first:

```
rm did.log
sh queue.sh "stop app"
sh drain.sh
```

```
queued: stop app
done: stop app
```

The command waited, and ran when the worker drained the queue. That is the durability the record
wanted.

**7. Stop the worker between the work and the acknowledgment.** Predict: does the queue prevent a
second `add user ben`?

```
sh queue.sh "add user ben"
CRASH=1 sh drain.sh
sh drain.sh
cat did.log
```

```
queued: add user ben
done: add user ben
worker stopped before its acknowledgment
done: add user ben
stop app
add user ben
add user ben
```

No. The queue removed the lost command and kept the double. The duplicate moved from the sender's
retry to the worker's restart, because the queue cannot tell "not done" from "done, not
acknowledged". Removing it takes dedup: an ID on each command, and a record of finished IDs written in the same
step as the work.

**8. Refuse instead.** Rasputin's shipped rule, in miniature: never retry what cannot be undone.

```
cat > retry.sh <<'EOF'
if grep -qx "$1" irreversible.txt; then
  echo "not retried: $1 cannot be undone, so a person checks first"
else
  sh send.sh "$1"
fi
EOF
echo "add user ana" > irreversible.txt
sh retry.sh "add user ana"
sh retry.sh "stop app"
```

`grep -qx` matches a whole line and prints nothing; it only reports whether it found one.

```
not retried: add user ana cannot be undone, so a person checks first
done: stop app
```

`add user ana` did not run again, and nothing was made safe: a person still has to find out
whether `ana` exists.

**9. Clean up.**

```
cd ..
rm -rf transport-choice
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check you
typed `transport-choice`.

## Check yourself

1. In Rasputin as shipped, a command is sent to an agent that is rebooting. What happens when the
   agent reconnects?
2. What breaks if `send.sh` retries every command that gets no reply?
3. Which failure from step 4 did the queue remove, and which did it only move?
4. You pick a transport in which the control plane connects to each machine. What must every
   machine have, and which machine did Rasputin's record not want it on?
5. A design lists durability as its main reason for a transport. How do you find out whether
   durability shipped?

### Answers

1. Nothing. The request got no reply, nothing was queued, and nothing is delivered on reconnect.
2. Work that ran but lost its reply runs again, as `add user ana` did.
3. It removed the lost command. The double moved to a worker that stops before acknowledging.
4. A listening port. The record names the firewall: *"No listening ports on the firewall node."*
5. Read the code at the release tag. Notes written beside it help, but check them against it.

## Where to go next

- **What the bus does not give you:** the section of that name in Rasputin's
  [architecture notes](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/ARCHITECTURE.md#what-the-bus-does-not-give-you).
- **Where commands come from:** every change in Rasputin runs as a recorded job, the subject of
  [Why every change goes through one path](https://rasputin.geekdojo.com/learn/changing-state/beginner/).
