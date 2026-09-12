---
lesson: changing-state.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 and on Ubuntu 24.04. It was not tested on
  Windows.
- **`mkdir`, `cat`, `echo`, `sh`, `tail`, `grep` and `rm`**, commands that are already part of
  macOS and Linux. Nothing to install, and no administrator rights needed. `sh` is not the same
  program on every system, and the lab printed the same output with macOS's and Ubuntu's.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

A system's **state** is what is true about it right now: which apps are installed, which rules
are on, which setting is chosen. A **change** is anything that alters the state.

Most systems let changes arrive by many routes: a button, a script, someone editing a file by
hand. Each route works. The trouble comes later, when you ask *what changed, and when?* A route
that writes nothing down leaves nothing to answer with.

The fix is a design rule: **send every change through one path**, and have that path write a
**record** as it acts. The record, often called a **log**, is a list that is only ever added to.
If the path really is the only way in, the log is complete, and you can read the system's
history from it: every change, in order.

The rule is only as strong as its exceptions. A route around the path, often called a **side
door**, costs more than one missing line. Once a change can skip the log, the log can no longer
tell you what the state is, and nothing in it warns you.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. In
[its manual](https://rasputin.geekdojo.com/docs/watch-what-the-cluster-is-doing/), every
operation that has to touch one of those computers becomes a **job**: *"The button submits a job,
the job runs as a series of recorded steps, and the result is kept."* The Tasks page in its web
interface lists the most recent jobs, and opening one shows each step and its result. When a step
fails for good, the job stops there, and the record shows how far it got.

The same page has a section headed *"What is not a job"*. A few buttons, such as the one that
acknowledges an **alert** (a warning the system raises), write directly and leave no row. The
manual lists those buttons. A change made on a machine by hand, outside the web interface, is not
a job either.

## Try it

You will build a tiny system with one path for changes, use it, then go around it once.

**1. Make a sandbox.** Run these one at a time:

```
mkdir changes-lab
cd changes-lab
```

`mkdir` makes a new, empty folder; `cd` moves you into it.

**2. Build the one path.** Copy the whole block and paste it into the terminal at once:

```
cat > change.sh <<'EOF'
echo "set lamp to $1" >> changes.log
echo "$1" > lamp.txt
EOF
```

This writes a two-line program, a **script**, into the file `change.sh`. The text up to the line
`EOF` goes into the file, and the quotes around `EOF` keep `$1` as written. Inside the script,
`$1` stands for the first word you give it. `>>` adds a line to the end of `changes.log`; a
single `>` replaces everything in `lamp.txt`. So each change is written to the log, then made.

**3. Make three changes through the path.**

```
sh change.sh off
sh change.sh on
sh change.sh dim
```

`sh` runs the script, and the word after its name becomes `$1`. It prints nothing.

**4. Read the history, then the state.**

```
cat changes.log
cat lamp.txt
```

```
set lamp to off
set lamp to on
set lamp to dim
dim
```

`cat` prints a file. The log holds every change, in order, and its last line matches the lamp.

**5. Go around the path.** Change the state directly, the way someone fixing a problem in a
hurry might:

```
echo off > lamp.txt
```

Predict: what does the log say the lamp is set to now?

**6. Ask the log, then the lamp.**

```
tail -n 1 changes.log
cat lamp.txt
```

```
set lamp to dim
off
```

`tail -n 1` prints only the last line of a file: the log's answer. The log says dim. The lamp
is off. Nothing in `changes.log` says the lamp changed, when, or that anything went wrong.

**7. Try to explain the state from the log.** Search it for the lamp's current setting:

```
grep off changes.log
```

```
set lamp to off
```

`grep` prints the lines that contain a word. A match, and it looks like an explanation. It is
the first change you made, replaced by two later ones. With a side door, the log does not just
miss a change. It offers a wrong answer that looks right.

**8. Send a change through the path again.**

```
sh change.sh off
tail -n 1 changes.log
cat lamp.txt
```

```
set lamp to off
off
```

The log and the lamp agree again. The history still has no line for step 5, and a line added
now would be a guess about when it happened and why.

**9. Clean up.**

```
cd ..
rm -rf changes-lab
```

`rm` deletes; `-r` includes everything inside the folder, and `-f` skips the questions. It cannot
be undone, so check you typed `changes-lab`.

## Check yourself

1. In step 4, what made it possible to list every change in order?
2. After step 5, the log still had every line it had before. Why could you no longer trust it?
3. You acknowledge an alert in Rasputin. Will the Tasks page show a job for it?

### Answers

1. Every change went through `change.sh`, which wrote a line to the log before changing the
   lamp.
2. A change had happened that the log did not show, so its last line no longer described the
   lamp, and nothing in the log said so.
3. No. Acknowledging an alert is one of the direct writes the manual lists under "What is not a
   job", so it leaves no row on the Tasks page.

## Where to go next

- **Reading the record:** [Watch what the cluster is doing](https://rasputin.geekdojo.com/docs/watch-what-the-cluster-is-doing/),
  in Rasputin's manual, explains the Tasks page, its steps, and what is not a job.
- **When a job fails:** [Respond to an alert](https://rasputin.geekdojo.com/docs/respond-to-an-alert/)
  explains the alert a failed job raises.
