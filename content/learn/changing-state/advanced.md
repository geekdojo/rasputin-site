---
lesson: changing-state.advanced
---

## What you need

- **The intermediate lesson,** [Converge or act once, derive or store](https://rasputin.geekdojo.com/learn/changing-state/intermediate/).
  This lesson uses its idea of converging, and does not repeat why.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Ubuntu 24.04 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `mkdir`, `echo`, `cat`, `touch`, `printf`, `grep`, `ls` and `rm`**, already part of
  macOS and Linux. Nothing to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## How it is built

A **saga** is a change made of steps that run in order, each with its own effect, with no single
transaction around them. Rasputin's
[job runner](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/jobs/saga.go)
runs a workflow's steps in order and retries a failing step up to its `Retries` count. When the
retries run out, the job fails. [`ARCHITECTURE.md`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/ARCHITECTURE.md):
*"Steps have retries; the saga has **no compensation**."* **Compensation** is a step that undoes
an earlier one. The runner's list of step statuses includes `compensated`, and nothing sets it.

For the steps that matter, there would be nothing to undo with: a format cannot be unformatted.
Safety comes from three rules instead, all visible in the workflow that claims a disk for backups,
[`storage/jobs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/storage/jobs.go).

**1. Steps that can refuse go first.**

| Step | Runs on | What it does |
|---|---|---|
| `validate` | control plane | refuses a request that makes no sense, or a second target the operator did not ask to replace |
| `enumerate` | agent | refuses a disk that is gone, is the boot disk, or is not the one the operator confirmed |
| `check_existing` | control plane | refuses to format a disk that already holds backups, unless the operator chose to adopt or destroy them |
| `claim` | agent | formats the disk: irreversible, never retried |
| `persist_target` | control plane | records the new target |

The code's comment: *"every refusal has to come BEFORE the irreversible act rather than after
it."*

**2. The irreversible step is declared, not remembered.** A step marked `Irreversible: true` is
never retried, and a workflow that gives one a retry count is rejected when it is registered. The
runner also refuses to run it at all when the job's **ledger**, its record of step attempts, already
holds an attempt, and fails the job with `jobs: irreversible step refused`. The
[tests](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/jobs/irreversible_test.go)
say why a failed attempt counts: *"it may have failed AFTER the effect landed. Failure is not
evidence that nothing happened."* The runner cannot find out, because commands to agents are
request and reply, and *"a lost reply is indistinguishable from work that never happened."*

**3. The step carries its own guard as well.** Before it writes, the agent re-checks the disk's
fingerprint against the one the operator confirmed. The format replaces the partition table that
fingerprint is computed from, so, in the agent's
[code](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/agent/internal/storage/blockdev.go),
*"that difference is what makes a replayed claim refuse."* The runner's refusal and the agent's are
two separate guards. Some steps need neither, because of their shape: a backup run's prune step
says how many generations the disk should hold, so a second run on a settled disk deletes nothing.
Its code declines to mark it irreversible, because *"Irreversible means: running this step twice
does the thing twice."* That is converging, inside a single step.

**Updates follow the same order.** The node update writes the new system into the idle slot,
reboots, checks the result, and only then tells the bootloader to keep the new slot
([manual](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/#rollback-and-the-two-system-slots)).
The act that cannot be taken back comes last. A failure before it is not undone by software: the
bootloader falls back to the old slot, or a failed health check marks the new slot bad and the
node reboots into its old system.

## Where it breaks

Each case below is fixed, or stated as a limit, in Rasputin's public code and manual.

**After the irreversible step.** A claim job can fail once the format has run. The
[manual](https://rasputin.geekdojo.com/docs/set-up-backups/) says so: *"if the claim job fails
after the format has run, the key is already stamped on the disk."* Nothing unformats it.
Recovery goes forward: the disk carries a marker describing itself, so a new scan finds it and the
operator adopts it.

**State the runner does not own.** The update workflow keeps its own row per node. A job that
failed at download, install or verify was marked failed, and the row was never touched, so the
Updates page showed a failed run as in progress indefinitely. The fix is a hook the workflow sets,
called once on every ending, that writes only to a row still in progress. The manual now says
*"Every path now records a terminal status"*.

**What one step made, the next must read.** Every step receives the job's original request. Mesh
enrollment makes a key in one step and sends it to the agent in the next. The first version's
sending step read the original request instead of the earlier step's result, and the agent
rejected the enrollment with *"empty auth key"*. The earlier step's work had already happened.

**A habit instead of a declaration.** Before the declaration existed, "irreversible" meant an
author remembering `Retries: 0`, which, in the runner's words, *"reads as correct in review and
is wrong the first time someone copies an existing workflow as a starting point."* The update's
install had been safe against a repeat *"only because RAUC's A/B target makes a re-install
harmless — a property of the medium, not of the runner"*. And `ARCHITECTURE.md` records that the
belief in an undo had already misled a design: the disk-claim workflow *"was drafted around a
rollback-and-dedup model that does not exist, where the step being rolled back was a disk
format."*

## What Rasputin does not do here

No step is undone, and no irreversible step is made safe to repeat: the runner refuses the repeat, and a person
decides what happens next. A job interrupted by a control-plane restart is marked failed, not
resumed; the control plane's own update is the one workflow built to finish across that restart.
Update rollback is per node, not an undo for the fleet.

## Try it

You will build a tiny runner with a ledger, claim a pretend disk with it, and break it three ways.

**1. Make a sandbox and a disk.** The disk is a folder: a size, and some photos.

```
mkdir saga-lab
cd saga-lab
mkdir disk
echo 50 > disk/size
echo 'my photos' > disk/photos.txt
touch ledger.txt
```

**2. Write the runner.** Paste the whole block at once:

```
cat > run.sh <<'EOF'
job=$1
while read -r step retries irreversible; do
  if [ "$irreversible" = yes ] && grep -qx "$job $step" ledger.txt; then
    echo "$job: $step refused, the ledger records an attempt"
    exit 1
  fi
  echo "$job $step" >> ledger.txt
  tries=0
  until sh "$step.sh"; do
    tries=$((tries + 1))
    if [ "$irreversible" = yes ] || [ "$tries" -gt "$retries" ]; then
      echo "$job: failed at $step"
      exit 1
    fi
    echo "$job: retrying $step"
  done
done < "$2"
echo "$job: done"
EOF
```

`cat > run.sh <<'EOF'` writes every line up to `EOF` into `run.sh`. The runner takes a job name
and a workflow file, one step per line: name, retries, and `yes` if irreversible. It writes each
attempt to `ledger.txt` before running the step. `grep -qx` quietly checks for an exactly matching
line. `until sh "$step.sh"` repeats the step until it succeeds, and `-gt` means greater than.

**3. Write three steps.** A step fails by ending with a non-zero status: `exit 1`, or a test that
does not pass.

```
cat > check.sh <<'EOF'
if [ "$(cat disk/size)" -lt 100 ]; then
  echo "  check: disk too small"
  exit 1
fi
EOF
cat > format.sh <<'EOF'
rm -f disk/photos.txt
echo format >> formats.log
echo claimed > disk/marker
if [ -f lost-reply ]; then
  rm lost-reply
  exit 1
fi
EOF
cat > record.sh <<'EOF'
echo disk > target.txt
EOF
```

`format.sh` wipes the disk, logs a line, and writes a marker. If a file named `lost-reply` exists,
it deletes it and fails after the work is done: the format happened, and the report of it was
lost.

**4. Put the irreversible step first.** Predict what is left on the disk.

```
printf '%s\n' 'format 0 no' 'check 0 no' 'record 0 no' > wrong.wf
sh run.sh job-1 wrong.wf
ls -1 disk
```

```
  check: disk too small
job-1: failed at check
marker
size
```

`printf '%s\n'` writes each quoted line into the file. `ls -1` lists one name per line; without
`-1`, a terminal shows them in columns. The check refused, correctly, and the photos
were already gone. No step after the format could save them.

**5. Put the refusal first.** Restore the photos, and run the same steps in the other order:

```
echo 'my photos' > disk/photos.txt
rm disk/marker formats.log
printf '%s\n' 'check 0 no' 'format 0 no' 'record 0 no' > claim.wf
sh run.sh job-2 claim.wf
ls -1 disk
```

```
  check: disk too small
job-2: failed at check
photos.txt
size
```

Same refusal, and the disk is untouched.

**6. Give the format a retry, and lose its reply.** A bigger disk this time, and every step may
retry once:

```
echo 500 > disk/size
printf '%s\n' 'check 1 no' 'format 1 no' 'record 1 no' > claim.wf
touch lost-reply
sh run.sh job-3 claim.wf
cat formats.log
```

```
job-3: retrying format
job-3: done
format
format
```

The job says done. The log says the disk was formatted twice. On a real disk, the second format
would destroy whatever the first one set up, and the job's record would still read as a success.

**7. Declare the format irreversible.** Reset, lose the reply again, and run the same job twice,
as a job picked up again after a crash would:

```
rm disk/marker target.txt formats.log
printf '%s\n' 'check 1 no' 'format 0 yes' 'record 1 no' > claim.wf
touch lost-reply
sh run.sh job-4 claim.wf
sh run.sh job-4 claim.wf
cat formats.log
ls -1 disk
```

```
job-4: failed at format
job-4: format refused, the ledger records an attempt
format
marker
size
```

One format. The first run failed without retrying. The second run's check ran again, because it is
safe to repeat, and the format was refused. Now look at the disk: it *was* formatted. The job
failed, and the effect landed anyway. The ledger is per job: a person who starts a new job gets an
empty one, and this guard does not see the earlier attempt.

**8. Recover forward.** Nothing will unformat the disk, but the disk says what it is. Adopt it:

```
cat > adopt.sh <<'EOF'
if [ ! -f disk/marker ]; then
  echo "  adopt: no marker, nothing to adopt"
  exit 1
fi
echo disk > target.txt
EOF
echo 'adopt 1 no' > adopt.wf
sh run.sh job-5 adopt.wf
cat target.txt
grep job-4 ledger.txt
```

```
job-5: done
disk
job-4 check
job-4 format
job-4 check
```

The target is recorded from the marker, not from job 4's result. The ledger still shows job 4's
attempts, including the one that was refused: the record of what happened survives the recovery.

**9. Clean up.**

```
cd ..
rm -rf saga-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `saga-lab`.

## Check yourself

1. In step 4, the check refused correctly. Why were the photos gone anyway?
2. In step 6, the job said done. What did it hide?
3. What breaks if, in step 7, the format line is `format 0 no` instead of `format 0 yes`?
4. Why can Rasputin's prune step retry when its write step cannot?
5. An update fails its health check after writing the idle slot. What undoes the write?

### Answers

1. The format ran before the check. The runner has no undo, so a refusal only protects what comes
   after it.
2. A second format. The first attempt's work landed and its reply was lost, so the retry repeated
   the effect, and "done" described the last attempt, not everything that happened.
3. The first run still fails at the format, without a retry. The second run formats the disk
   again and reports done: nothing consults the ledger for a step that is not declared.
4. Prune states an end result, a number of generations to keep, so running it twice on a settled
   disk changes nothing. Writing a new generation adds one each time it runs.
5. Nothing in software. The node marks the new slot bad and reboots into its old system; the
   bootloader's choice of slot is the recovery.

## Where to go next

- **Adopt, format, or destroy, and what cannot be taken back:** [Set up backups](https://rasputin.geekdojo.com/docs/set-up-backups/),
  in Rasputin's manual.
- **Slots, commit and rollback:** [Know whether an update worked](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/).
- **Steps and retries on the record:** [Watch what the cluster is doing](https://rasputin.geekdojo.com/docs/watch-what-the-cluster-is-doing/).
- **The code:** the runner in
  [`saga.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/jobs/saga.go),
  the disk-claim workflow in
  [`storage/jobs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/storage/jobs.go),
  and the update workflow in
  [`updater/jobs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/updater/jobs.go).
