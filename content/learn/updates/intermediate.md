---
lesson: updates.intermediate
---

## What you need

- **The beginner lesson,** [How an update can fall back](https://rasputin.geekdojo.com/learn/updates/beginner/).
  It covers A/B slots, the trial boot, and rollback.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `awk` and `sed`**, already part of macOS and Linux. Nothing to install, and no
  administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

An A/B update makes one machine safe to update: if the new system fails, that machine falls back
to the old one. A **fleet**, many machines updated together, adds questions that no single
machine can answer. How many update at once? And when some fail, does the rollout keep going?

[Rasputin](https://github.com/geekdojo/rasputin-control-plane)'s control plane first answered with
the simplest rule: one node at a time, and stop at the first failure. In a 24-node stress test,
recorded in the internal decision record ADR-0005, *"two separate runs each halted the whole fleet
on the first node that failed its verify"*, leaving ten or more nodes and the control plane
itself not updated each time. The same record says *"The A/B path itself is solid."* The
stopping rule turned one node's problem into the whole fleet's.

## The decision, and what lost

ADR-0005 was accepted on 2026-08-11. Nodes update in **tiers**, groups by role, one tier after
another, with the control plane's own node included and ordered last. Within a tier:

- **A canary of one.** In the compute and storage tiers, one node per processor architecture
  updates alone first. If it fails, the record says, *"nothing else in the fleet is touched. This
  is the one place abort survives"*.
- **Bounded fan-out.** After the canary, at most **K** nodes update at the same time, the "max in
  flight". The default is 4.
- **A failure budget.** Every node is attempted, and a failed node is reported rather than
  stopping the run. Once failures in the tier reach the budget, 15% of the tier by default, no
  further node starts. Nodes already updating are allowed to finish.

The record's reason for carrying on past a failure: *"the canary has already cleared the image, so
several independent failures during fan-out indicate fleet heterogeneity rather than a bad
bundle"*. Each node's rollback is its own, so one node failing says nothing about the next.

| Alternative | Why it lost |
|---|---|
| Stop at the first failure, as before | It stopped whole fleets on one node. Kept as a separate mode it was rejected too, because *"`K=1` plus `maxFailures=1` already expresses it"*. |
| Update every node at once | *"a full compute-plane outage during the reboot window is fine on a fresh cluster and unacceptable on one running workloads"* |
| A fixed failure budget of 3 | In the owner's review: *"3 is fine for 24 nodes, useless on a 3-node cluster"*. A fixed 3 can never trip on two nodes. |

## What it cost

**The brake does not stop what is already moving.** The budget stops nodes starting. It never
cancels one in flight, because a node mid-reboot is the worst moment to change your mind. So with
K nodes in flight when the budget is reached, up to K − 1 more failures can still land. A
simulated fleet measured it: *"Choosing `K` is therefore also choosing how far past the brake a
fleet coasts."*

**The defaults are not measured.** For K the record says *"The default is a starting point, not a
measured one."* It was chosen for how many nodes reboot at once, about a sixth of a 24-node tier.
The 15% budget is *"anchored on one data point"*.

**Partial success becomes normal.** *"'Completed with failures' becomes the common outcome, not
the exception."* The per-node report, not a single pass or fail, is what an operator reads.

**On a small tier the budget never acts.** It can only refuse a node that has not started, and
the limit on nodes in flight counts the canary as part of the tier. So at the default K, in a
compute or storage tier of five or fewer nodes, every node after the canary starts at once. The
canary and each node's own rollback are the only protection there.

## What Rasputin does not do here

An operator starts every update; nothing updates on a schedule. Once a rollout is deployed there
is no cancel: the canary and the failure budget are the only brakes. A stopped run is not a
rollback. Nodes that already committed the new system keep it. Nothing reverses a failed node's
work: a node that falls back does so because its bootloader chose the old system.

## Try it

You will build a rollout planner for one tier, then run the old rule and the new one on the same
fleet.

**1. Make a sandbox and a fleet.** Each line is a node and how its update will turn out. Paste the
whole block at once:

```
mkdir rollout-lab
cd rollout-lab
cat > fleet.txt <<'EOF'
n01 ok
n02 ok
n03 ok
n04 ok
n05 fail
n06 fail
n07 fail
n08 fail
n09 fail
n10 ok
n11 ok
n12 ok
EOF
```

`cat > fleet.txt <<'EOF'` writes every line up to `EOF` into `fleet.txt`. Five nodes in a row will
fail, perhaps from a hardware quirk the canary does not share.

**2. Write the planner.**

```
cat > rollout.sh <<'EOF'
awk -v k="$2" -v budget="$3" '
{ name[NR] = $1; result[NR] = $2 }
END {
  print "canary " name[1] "=" result[1]
  if (result[1] == "fail") {
    print "canary failed: run stopped, " NR - 1 " not started"
    exit
  }
  ok = 1; failed = 0; i = 2; round = 1
  while (i <= NR && (budget == 0 || failed < budget)) {
    round++
    line = "round " round ":"
    for (n = 0; n < k && i <= NR; n++) {
      line = line " " name[i] "=" result[i]
      if (result[i] == "fail") failed++; else ok++
      i++
    }
    print line
  }
  print "updated " ok ", failed " failed ", not started " NR - i + 1 ", rounds " round
}' "$1"
EOF
```

Run it as `sh rollout.sh <fleet file> <K> <budget>`. `awk` reads the file into two lists, and the
part after `END` plans the run. The first node is the canary. After it, nodes start in **rounds**
of up to K, and a round stands for one reboot's worth of time. The budget is checked before each
round, and `0` means unlimited, as it does in Rasputin.

**3. Run the old rule.** K of 1 and a budget of 1 is one at a time, stopping at the first failure:

```
sh rollout.sh fleet.txt 1 1
```

```
canary n01=ok
round 2: n02=ok
round 3: n03=ok
round 4: n04=ok
round 5: n05=fail
updated 4, failed 1, not started 7, rounds 5
```

One node failed, and seven healthy ones never got the update.

**4. Run best-effort with no budget.**

```
sh rollout.sh fleet.txt 4 0
```

```
canary n01=ok
round 2: n02=ok n03=ok n04=ok n05=fail
round 3: n06=fail n07=fail n08=fail n09=fail
round 4: n10=ok n11=ok n12=ok
updated 7, failed 5, not started 0, rounds 4
```

Every node was attempted, in fewer rounds. But nothing noticed five failures in a row, a signal
worth looking at before the rest of a large fleet is touched.

**5. Add a budget of 2.** Predict the number of failures before you run it:

```
sh rollout.sh fleet.txt 4 2
```

```
canary n01=ok
round 2: n02=ok n03=ok n04=ok n05=fail
round 3: n06=fail n07=fail n08=fail n09=fail
updated 4, failed 5, not started 3, rounds 3
```

A budget of 2, and 5 failures. After round 2 only one node had failed, so round 3 started, and
all four of its nodes failed together: the budget plus K − 1, the most it can coast. Rasputin
starts a node whenever another finishes rather than in rounds, but the limit is the same.

**6. Trade speed for a shorter coast.**

```
sh rollout.sh fleet.txt 2 2
```

```
canary n01=ok
round 2: n02=ok n03=ok
round 3: n04=ok n05=fail
round 4: n06=fail n07=fail
updated 4, failed 3, not started 5, rounds 4
```

Three failures instead of five, and more rounds to reach the same point. A smaller K coasts less
and takes longer. The default of 4 makes that choice for you.

**7. Ship a bad image.** Make the canary fail:

```
sed 's/^n01 ok/n01 fail/' fleet.txt > bad-image.txt
sh rollout.sh bad-image.txt 4 2
```

```
canary n01=fail
canary failed: run stopped, 11 not started
```

`sed 's/old/new/'` replaces text, and `^` means the start of a line. One failure, and nothing else
was touched.

**8. Try a small cluster.** Three nodes: the canary and two that will fail.

```
sed -n '1p;5,6p' fleet.txt > small.txt
sh rollout.sh small.txt 4 1
```

```
canary n01=ok
round 2: n05=fail n06=fail
updated 1, failed 2, not started 0, rounds 2
```

`sed -n '1p;5,6p'` prints only lines 1, 5 and 6. The budget was 1, and both nodes failed: they
were in flight together before either failure was known. Only the canary got a chance to act.
At the default K, Rasputin would start these two at once as well.

**9. Clean up.**

```
cd ..
rm -rf rollout-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check you
typed `rollout-lab`.

## Check yourself

1. In step 5, why did a budget of 2 end with 5 failures?
2. A tier has 20 nodes, K is 8 and the budget is 3. What is the most failures the run can record
   before it stops?
3. What breaks if you set the budget to `0`, meaning "zero tolerance"?
4. The canary passes, then six fan-out nodes fail. Should the run have stopped at the first of
   them? What does the record say several such failures mean?

### Answers

1. The budget is checked before nodes start. Four nodes were already in flight when the second
   failure landed, and all four failed.
2. Ten: the budget plus K − 1, if exactly two have failed when eight more start and all eight fail.
3. Nothing stops. In the planner, and in Rasputin, a budget of `0` means unlimited, so it removes
   the brake instead of tightening it.
4. No. The canary has already cleared the image, so several failures during fan-out point to
   differences between machines. The run continues until the budget is reached, and each failed
   node falls back on its own.

## Where to go next

- **The rollout, from the operator's side:** the canary gate, `MAX IN FLIGHT` and `MAX FAILURES`
  in [Roll out an update](https://rasputin.geekdojo.com/docs/roll-out-an-update/#what-update-all-commits-you-to),
  in Rasputin's manual.
- **Reading the report afterward:** [Know whether an update worked](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/).
- **The code:** the bounded fan-out loop, `runBounded`, in
  [`system_jobs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/updater/system_jobs.go),
  and the default budget in
  [`proto/updates.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/proto/updates.go).
