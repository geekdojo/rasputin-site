---
lesson: updates.advanced
---

## What you need

- **The intermediate lesson,** [Rolling an update across a fleet](https://rasputin.geekdojo.com/learn/updates/intermediate/).
  It covers the canary, bounded fan-out and the failure budget, all of which trust one verdict
  per node. This lesson is about that verdict.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `od`, `tr`, `cat`, `cp` and `rm`**, already part of macOS and Linux. Nothing to install,
  and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## How it is built

A Rasputin node update is a seven-step job, laid out at the top of
[`jobs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/updater/jobs.go):
validate, precheck, download, install, reboot, wait and verify, then health check and commit. The
last two decide whether the update worked, and everything above a single node reads their answer.

**A boot identity, captured before the reboot.** Linux mints a random identifier for every boot,
readable at `/proc/sys/kernel/random/boot_id`. The node's agent reports it, and the precheck step
records it before the reboot is requested. The wait step reads that stored value and never asks
again, because after the reboot, asking returns the new boot's identity, the very thing it is
compared against.

Why an identity rather than a boot time: the decision record, ADR-0005, rejected the timestamp
because *"the majority node is a no-RTC Pi whose wall clock is wrong until timesyncd runs … an
identity needs no clock"*. RTC is a real-time clock, the battery-backed chip that keeps time while
a machine is off. An identity needs only one comparison: equal or not.

**Waiting by asking.** The wait step asks the node every two seconds until a different boot
answers. A "node registered" message only makes it ask sooner; it is never evidence, because the
old system can send one just as easily.

**Four conditions, and an answer of unknown.**
[`verify.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/updater/verify.go)
defines the contract: (a) a different boot from the one told to reboot, (b) the slot the update
wrote, (c) the version the update installed, and (d) the health checks, run as a separate step.
(a) and (c) can be yes, no, or unknown; (b) is yes or no. An older agent that cannot report a
boot identity or a version makes that condition unknown. The verdict then **degrades**: it still
passes, and it is labeled as resting on less evidence. A known wrong answer never degrades: a
mismatched slot or version fails, and the old boot answering means keep waiting.

**Recovery is the bootloader's.** If (d) fails, the control plane marks the new slot bad, and the
node reboots itself about two seconds later into the slot it came from. No software reverses the
install; the old system was never touched. The control plane also stops trusting the node's
recorded version, because the running version is about to change.

**Each side of a check has one owner.** The control plane knows which version it is installing
before it asks the node anything, from the release's manifest. The node knows which version it was
running before. ADR-0005 states the rule: *"the api must not accept an agent's echo for a value it
already holds authoritatively."*

## Where it breaks

Every failure below is fixed, and each is recorded in the public code or a closed issue.

**The old system answers.** Before boot identity, only the slot was checked, *"evaluated against
whatever answered first"*. A healthy node was checked against its old boot and recorded as rolled
back. This is one of three bugs the design was built on, which the record says were *"all
invisible to the existing unit suite and all found by a 24-node run"*. The four below surfaced
later, while the fixes were checked on real machines.

**The degraded path forgot to wait.** With no prior identity to compare, an earlier version waited
only for the agent to answer, *"which the pre-reboot agent does immediately, so a node was recorded
committed ~46s before it finished rebooting"*. The fix accepts either of two proofs that a reboot
happened: the node reports an identity at all, which the old agent could not, or it stopped
answering and then answered again.

**A flag that never cleared.** The wait step once set a flag the first time the old boot answered,
and never cleared it. The old boot always answers for the first seconds, so a node that then
rebooted and went quiet was reported as *"node never rebooted: still answering"*, *"the exact
opposite of what happened"*. The flag now describes only the latest answer.

**The node graded its own exam.** An older agent echoed something that was not a version, and the
install step let that echo overwrite the version the control plane had recorded. Condition (c)
then compared a real version with the echo and failed every update to machines running that agent.
The control plane's own value now wins, and an echo only fills an empty one.

**A cleanup that could not run.** A node told to reboot that never came back still counted as up
to date: the wait step gave up and returned before reaching the code that marks the node's version
unconfirmed. The first fix moved that call ahead of the return, but handed it the step's own
deadline, which had already expired, so it did nothing. A test caught it. The comment's rule:
*"Cleanup after a cancellation must never inherit the cancellation."*

## What Rasputin does not do here

Rollback is per node; there is no fleet undo. A missing boot identity does not block an update:
it degrades the verdict and labels it. Nothing updates until an operator starts it.

## Try it

You will build a model node, a slot-only check, and the verify contract, then break the contract
the two ways Rasputin's did.

**1. Make a sandbox and a node.** Paste the whole block at once:

```
mkdir verify-lab
cd verify-lab
mkdir node
echo 1 > node/slot-a
echo a > node/next
cat > node.sh <<'EOF'
cd node
case $1 in
  start)
    cp next booted
    od -An -N8 -tx1 /dev/urandom | tr -d ' \n' > boot_id
    touch up ;;
  reboot) rm up ;;
  install)
    if [ "$(cat booted)" = a ]; then to=b; else to=a; fi
    echo "$2" > "slot-$to"
    echo "$to" > next ;;
  boot) [ -e up ] || exit 1; [ -e old-agent ] || cat boot_id ;;
  slot) [ -e up ] || exit 1; cat next ;;
  version) [ -e up ] || exit 1; [ -e old-agent ] || cat "slot-$(cat booted)" ;;
esac
EOF
sh node.sh start
```

The files in `node/` are the machine: two slots, `next` (the slot the bootloader starts next),
`booted` (the slot running now), `boot_id`, and `up`, present while it answers. `start` boots:
it runs the `next` slot and mints an identity from 8 random bytes, which `od` prints as hexadecimal
and `tr` joins into one word. `install` writes the idle slot and marks it next, as Rasputin's
installer does. `boot`, `slot` and `version` are the agent's answers, and fail while the node is
down. This agent's `slot` reports the slot marked next, as Rasputin's agent once did on some
machines; today's reports the slot it actually booted. The file `old-agent` makes it an agent too
old to report an identity or a version.

**2. Write a slot-only check, and install version 2.**

```
echo '[ "$(sh node.sh slot)" = "$1" ] && echo updated || echo "not updated"' > naive.sh
prior=$(sh node.sh boot)
sh node.sh install 2
sh naive.sh b
sh node.sh version
```

```
updated
1
```

`prior` holds the identity from before the reboot, as the precheck step does. The check says
`updated`, and the node is still running version 1. Nothing has rebooted.

**3. Write the contract.**

```
cat > verify.sh <<'EOF'
boot=$(sh node.sh boot) || { echo "no answer: keep waiting"; exit 1; }
if [ -z "$1" ] || [ -z "$boot" ]; then
  b=unknown
elif [ "$boot" = "$1" ]; then
  echo "same boot: not rebooted yet, keep waiting"; exit 1
else
  b=differs
fi
[ "$(sh node.sh slot)" = "$2" ] || { echo "wrong slot: rolled back"; exit 1; }
version=$(sh node.sh version)
if [ -z "$version" ]; then
  v=unknown
elif [ "$version" = "$3" ]; then
  v=matches
else
  echo "wrong version: running $version"; exit 1
fi
echo "verified: boot $b, version $v"
EOF
sh verify.sh "$prior" b 2
sh verify.sh "" b 2
```

```
same boot: not rebooted yet, keep waiting
wrong version: running 1
```

You run it as `sh verify.sh <prior identity> <slot> <version>`. `$1`, `$2` and `$3` are those
three, and `||` runs the part after it when the command before fails. With the identity, the
verdict is right: wait. With `""` in its place, the check has only slot and version to go on, and
it calls a healthy node that simply has not rebooted a failure.

**4. Reboot.**

```
sh node.sh reboot
sh verify.sh "$prior" b 2
sh node.sh start
sh verify.sh "$prior" b 2
```

```
no answer: keep waiting
verified: boot differs, version matches
```

**5. Break it: an agent too old to report.** Update to version 3 with the old agent:

```
touch node/old-agent
prior=$(sh node.sh boot)
sh node.sh install 3
sh verify.sh "$prior" a 3
```

```
verified: boot unknown, version unknown
```

Predict before reading on: has the node rebooted? It has not. It is still running version 2 on
slot `b`. Each unknown degraded the verdict, as designed, and together they let the running old
system pass. This is the shape of the bug that recorded a node committed ~46 seconds early.

**6. Fix it: demand proof of a reboot.**

```
cat > wait.sh <<'EOF'
if ! sh node.sh slot > /dev/null; then
  touch went-quiet; echo "no answer: keep waiting"; exit 1
fi
if [ -z "$1" ] && [ -z "$(sh node.sh boot)" ] && [ ! -e went-quiet ]; then
  echo "no proof of a reboot: keep waiting"; exit 1
fi
rm -f went-quiet
sh verify.sh "$@"
EOF
sh wait.sh "$prior" a 3
sh node.sh reboot
sh wait.sh "$prior" a 3
sh node.sh start
sh wait.sh "$prior" a 3
```

```
no proof of a reboot: keep waiting
no answer: keep waiting
verified: boot unknown, version unknown
```

`wait.sh` remembers, in the file `went-quiet`, that the node stopped answering. With no identity to
compare, it accepts a node that reports one anyway or one that went quiet and came back; neither
can come from a system that never rebooted. `"$@"` passes all three arguments on to `verify.sh`.
The final pass is still degraded, and says so.

Every step prints the same on macOS and Linux, except that the identity in `node/boot_id` differs
on every run.

**7. Clean up.**

```
cd ..
rm -rf verify-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check you
typed `verify-lab`.

## Check yourself

1. In step 2, why is a slot check worse than useless before the reboot?
2. Why does the wait step read the stored identity instead of asking the node for it again?
3. What breaks if `wait.sh` sets `went-quiet` but never removes it after a verdict?
4. A node's agent echoes a version after install. When should that echo be trusted?

### Answers

1. Installing marks the new slot as next, and the model's agent reports the slot marked next, as
   some of Rasputin's older agents did. So the old system already reports the new slot, and the
   check passes on evidence that exists before any reboot.
2. After the reboot, asking returns the new identity, which is what the stored one is compared
   against.
3. The next update inherits proof of a reboot from the last one, and an old agent that has not
   rebooted passes again, as in step 5.
4. Only for a value the control plane does not already hold, such as the version the node was
   running before. For the version being installed, the control plane's own record wins.

## Where to go next

- **Reading the verdict on a real cluster:** [the verify contract](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/#the-verify-contract)
  and `DEGRADED`, in Rasputin's manual.
- **The code:** `waitForNewBoot` and `classifyBoot` in
  [`verify.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/updater/verify.go),
  and their tests in
  [`verify_test.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/updater/verify_test.go).
- **Where the identity comes from:** the agent's
  [`facts.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/agent/internal/host/facts.go).
