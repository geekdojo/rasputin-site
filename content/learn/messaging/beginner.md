---
lesson: messaging.beginner
---

## What you need

- **A terminal on macOS or Linux, open in three windows or tabs.** In macOS Terminal, Command-N
  opens one; most Linux terminals have a New Window item. On Windows, WSL
  (Windows Subsystem for Linux) gives you a Linux terminal. Tested on macOS and on Linux (Ubuntu
  24.04); not tested on Windows.
- **`tail`, `echo`, `cat` and `touch`**, commands that are already part of macOS and Linux.
  Nothing to install, and no administrator rights.

You do not need a message broker, Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

Programs on different machines work together by sending **messages**: small pieces of data such
as "I am still running" or "restart this app". Two patterns cover most of it.

**Publish/subscribe.** A program **publishes** a message to a **subject**, a name for one kind of
message, such as `heartbeat`. Every program that has **subscribed** to that subject gets a copy.
The publisher does not name the receivers, and is not told whether anyone got it. A
**heartbeat**, a regular "I am alive" message, fits this pattern.

**Request/reply.** A program sends a message that expects one answer, and waits. "Restart this
app" needs a reply: done, or failed. If no reply arrives before a **deadline**, the sender stops
waiting and reports that no reply came.

Between the programs usually sits a **message broker**, a program that passes each message to
whoever subscribed to its subject.

For two machines to talk over a network, one of them starts a **connection** to the other. The
one waiting to be contacted is **listening** on a **port**, a numbered door the operating system
opens for one program. Most home routers let a machine start connections outward, and refuse
incoming ones that nothing inside asked for. So a machine that must be
contacted needs a port the network lets through; a machine that only connects outward needs none.

With a broker, only the broker listens. Every other machine connects out to it and subscribes to
its own command subject. Commands arrive over that connection, because an open connection carries
messages both ways.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-control-plane) is an open-source system for
running a small group of computers at home. One computer, the control plane, manages the others
and runs the broker. A program on each machine, the agent, connects out to it: in the project's
[architecture notes](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/ARCHITECTURE.md),
*"agents never listen on a port"*. Each agent publishes a heartbeat to the subject
`rasputin.node.<node-id>.heartbeat`, where `<node-id>` is the machine's name in the cluster.
Commands are requests on subjects beginning `rasputin.node.<node-id>.cmd.`, and the control plane
waits for the reply.

## Try it

You will model a broker with a folder of files, and play the machines in three terminal windows.
A real broker is a program on the network, and usually keeps no copy of the messages. In this
model:

- the folder is the broker, and each file is a subject;
- adding a line to a file is publishing;
- watching a file for new lines is subscribing.

**1. Make a sandbox.** In window 1:

```
mkdir ~/msg-lab
cd ~/msg-lab
touch heartbeat node-1.cmd node-1.reply
```

`~` is short for your home folder, so `~/msg-lab` names the same folder in every window. `mkdir`
makes it, `cd` moves you into it, and `touch` creates three empty files, one per subject.

**2. Publish before anyone listens.**

```
echo "node-1 is up" >> heartbeat
```

Nothing prints. `>>` adds the line to the end of the file.

**3. Subscribe, twice.** In window 2, and then in window 3, run:

```
cd ~/msg-lab
tail -n 0 -f heartbeat
```

`tail -f` keeps watching a file and prints each new line as it arrives. `-n 0` means print none of
the lines already there. Predict: will either window show the message from step 2? Look at both.

**4. Publish again.** Neither window showed it: the message was published before they subscribed.
In window 1:

```
echo "node-1 is up" >> heartbeat
```

Windows 2 and 3 each print:

```
node-1 is up
```

On Linux it can take a second to appear. Window 1 printed nothing.

**5. Lose the subscribers.** Predict: when a subscriber leaves, will window 1 notice? In window 3,
press Control-C, which stops `tail`. Then, in window 1:

```
echo "node-1 is still up" >> heartbeat
```

Only window 2 prints it. Stop window 2 with Control-C too, and run the same command in window 1
once more. Nothing prints anywhere. Window 1 looked the same with two receivers, one and none.

**6. Answer requests.** Window 2 becomes node-1, which answers commands. Copy this as one line:

```
tail -n 0 -f node-1.cmd | while read -r request; do echo "$request" >> node-1.log; echo "node-1 did: $request" >> node-1.reply; done
```

`|` hands each new line from `tail` to a loop. `read -r` stores it as `request`; the `-r` keeps
any backslash as typed. Node-1 does the work, here writing it in its log, `node-1.log`, then
publishes a reply.

Window 3 is the sender, waiting for replies:

```
tail -n 0 -f node-1.reply
```

**7. Send a request.** In window 1:

```
echo "restart app" >> node-1.cmd
```

Window 3 prints:

```
node-1 did: restart app
```

Node-1 opened no door of its own, yet the command arrived.

**8. Lose a reply.** The sender's connection drops for a moment: press Control-C in window 3. In
window 1:

```
echo "stop app" >> node-1.cmd
```

Then reconnect the sender in window 3:

```
tail -n 0 -f node-1.reply
```

Nothing prints, and window 3 keeps waiting.

**9. Send a request nobody answers.** In window 2, press Control-C: node-1 is now off. In window 1:

```
echo "start app" >> node-1.cmd
```

Window 3 still prints nothing. You are the sender's deadline: press Control-C in window 3.

To the sender, steps 8 and 9 looked identical. Predict: in which did node-1 do the work? Then, in
window 1:

```
cat node-1.log
```

```
restart app
stop app
```

In step 8 node-1 did the work, and its reply was lost. In step 9 nothing happened. A missing reply
tells you only that no answer reached you, not whether the work was done.

`tail` is a different program on macOS and Linux, but every step behaves the same.

**10. Clean up.** In window 1:

```
cd ..
rm -rf msg-lab
```

`rm` deletes; `-r` includes everything inside the folder, and `-f` skips the questions. It cannot
be undone, so check you typed `msg-lab`. Close windows 2 and 3.

## Check yourself

1. Your program publishes a message and gets no error. What do you know about who received it?
2. Your program sends a request, and no reply comes before the deadline. Was the work done?
3. Node-1 had no door of its own open, yet it received a command. How?

### Answers

1. Nothing. As step 5 showed, publishing looks the same with two receivers, one, or none.
2. You cannot tell. Steps 8 and 9 looked the same to the sender, and only one of them did the
   work.
3. It connected out to the broker, and commands came back over the connection it opened.

## Where to go next

- **When the heartbeat stops:** [Check on a node](https://rasputin.geekdojo.com/docs/check-a-node/#what-the-state-words-mean),
  in Rasputin's manual, shows what the control plane concludes.
- **The subjects:** every subject name in
  [`subjects.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/proto/subjects.go),
  in the public repository.
- **The design:** the bus section of the project's
  [architecture notes](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/ARCHITECTURE.md).
