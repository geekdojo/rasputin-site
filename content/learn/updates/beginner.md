---
lesson: updates.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS, in both zsh and bash, and on Linux (Ubuntu
  24.04). It was not tested on Windows.
- **`sh`, `echo`, `cat`, `touch` and `rm`**, commands that are already part of macOS and Linux.
  Nothing to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere. Nothing in this lesson
touches the way your own computer starts.

## The idea

**Updating** an operating system, the software that runs a computer, means replacing the files
it runs from. Overwriting them in place has a bad moment: if the power fails halfway, or the new
version cannot start, the computer has neither the old system nor a working new one.

An **A/B update** avoids that moment by keeping **two copies** of the system, in two **slots**
called A and B. One slot is running and the other is idle. An update writes the new version into
the idle slot and never touches the running one.

The switch happens at **boot**, when the computer starts. The first program to run is the
**bootloader**, whose only job is to choose a system and start it. It keeps a few notes between
starts: which slot to try first, which slots are allowed, and whether a slot has used its try.

The new slot's first start is a **trial**. The bootloader uses up the slot's one try, a **boot
counter** of one, and starts it. If the new system comes up properly, it says so; that is
**marking it good**, and the bootloader keeps choosing it. If it never says so, because it crashed,
hung or lost power, the next start finds the try used up, and the bootloader picks the other
slot: the old system, still intact. That fallback is a **rollback**. It undoes nothing, because
the old system was never changed.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. Every machine it manages has two system slots, and an operator starts
every system update: its [manual](https://rasputin.geekdojo.com/docs/roll-out-an-update/) says
*"There is no scheduler, no nightly job, no maintenance window"*. The new system goes into the idle
slot and starts as a trial. If it does not come up properly, the machine goes back to the old
slot, so a failed update leaves, in the
[manual's words](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/#rollback-and-the-two-system-slots),
*"a node that did not update, rather than a node you have to re-flash"*.

## Try it

You will build a model bootloader in a folder: two text files as the slots, a few empty files as
its notes, and a script that does what a bootloader does at each start. It is a general model of
two slots and a fallback, not a copy of any real bootloader, and it starts a line of text rather
than an operating system.

**1. Make a sandbox.**

```
mkdir ab-lab
cd ab-lab
```

`mkdir` makes a new, empty folder, and `cd` moves you into it.

**2. Install version 1 in slot A.**

```
echo "version 1" > slot-a
echo "empty" > slot-b
echo "a b" > order
touch a.good
```

`echo` prints text, and `>` sends it into a file instead. `order` is the note saying which slot
to try first. `touch` makes an empty file; `a.good` existing is the note "slot A is allowed".

**3. Write the bootloader.** Copy all of these lines at once:

```
cat > boot.sh <<'EOF'
for slot in $(cat order); do
  if [ -e $slot.good ] && [ ! -e $slot.tried ]; then
    touch $slot.tried
    echo $slot > running
    echo "Starting slot $slot: $(cat slot-$slot)"
    exit
  fi
done
echo "No slot left to try"
EOF
```

`cat > boot.sh <<'EOF'` saves every line up to `EOF` into a file named `boot.sh`. The script goes
through the slots in `order` and starts the first one that is allowed (its `.good` file exists)
and has not used its try (no `.tried` file): `-e` asks whether a file exists, and `!` reverses
the answer. Starting a slot uses its try and records which slot is running.

**4. Write "mark good".**

```
cat > good.sh <<'EOF'
rm $(cat running).tried
echo "Slot $(cat running) marked good"
EOF
```

A healthy system runs this after it starts. `rm` removes the running slot's `.tried` note, so the
slot can be started again next time.

**5. Start the computer.**

```
sh boot.sh
sh good.sh
```

```
Starting slot a: version 1
Slot a marked good
```

`sh boot.sh` runs the script. This is an ordinary day: start, then mark good.

**6. Update.** The operator installs version 2. It goes into the idle slot:

```
echo "version 2" > slot-b
touch b.good
echo "b a" > order
```

Slot A still holds version 1. The notes now say that slot B is allowed, and to try it first.

**7. Restart into the new version.**

```
sh boot.sh
```

```
Starting slot b: version 2
```

Version 2 started without a problem. Now restart again **without** running `good.sh`. Predict
which version runs:

```
sh boot.sh
```

```
Starting slot a: version 1
```

Slot B had used its try and was never marked good, so the bootloader moved on to slot A. It cannot
tell a system that hung from a working one that never said so: both leave only a used try. Now
look at slot B:

```
cat slot-b
```

```
version 2
```

Nothing was undone. Version 2 is still there; the bootloader chose not to start it.

**8. Try the update again, properly.** Slot A is running, so it marks itself good first:

```
sh good.sh
rm b.tried
sh boot.sh
sh good.sh
sh boot.sh
```

```
Slot a marked good
Starting slot b: version 2
Slot b marked good
Starting slot b: version 2
```

Removing `b.tried` gives slot B a fresh try, as starting the update again would. This time
version 2 marks itself good, so the next start keeps it. Only now is the update finished.

Every step prints the same output on macOS and on Linux.

**9. Clean up.**

```
cd ..
rm -rf ab-lab
```

`rm` deletes; `-r` includes everything inside the folder, and `-f` skips the questions. It cannot
be undone, so check you typed `ab-lab`.

## Check yourself

1. During an A/B update, which slot receives the new version, and why not the other one?
2. In step 7, version 2 started without a problem, yet the next start ran version 1. Why?
3. The power fails in the middle of step 6, before the new `order` is written. Which version runs
   at the next start?

### Answers

1. The idle slot, so the running system stays complete and there is always one to fall back to.
2. It was never marked good. The bootloader sees only a used try.
3. Version 1. Slot A was never touched, and `order` still says to try it first. That is why
   changing the order is the last step.

## Where to go next

- **Rollback on a real cluster:** [Know whether an update worked](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/#rollback-and-the-two-system-slots),
  in Rasputin's manual, covers the two slots, the trial start, and the record a rollback leaves.
- **Starting an update:** [Roll out an update](https://rasputin.geekdojo.com/docs/roll-out-an-update/)
  shows what an operator does.
- **The code:** one of Rasputin's bootloader scripts,
  [`grub.cfg`](https://github.com/geekdojo/rasputin-os/blob/2026.08.5/board/rasputin/n100/grub.cfg),
  in the public `rasputin-os` repository.
