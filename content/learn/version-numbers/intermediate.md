---
lesson: version-numbers.intermediate
---

## What you need

- **The beginner lesson,** [Why software has version numbers](https://rasputin.geekdojo.com/learn/version-numbers/beginner/).
  It covers semantic and calendar versions, and `sort -V`.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `sort`, `printf`, `head` and `awk`**, already part of macOS and Linux. Nothing to
  install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-os) is built from three repositories with three
build pipelines: an operating system image for ordinary machines, a separate firewall image, and
the control-plane software (a web interface, its API, and an agent that runs on every machine).
The software is never installed on its own. The OS image carries a copy of it, and the firewall
image carries a copy of the agent.

The images carried dated versions, and the software used semantic versioning, still on major
number 0, so one installation had more than one version. And each agent reports its version to
the control plane, which has to decide from it whether a newer release exists and whether that
machine can do what it is about to be asked.

## The decision, and what lost

All three repositories publish on one calendar line, `YYYY.MM.MICRO`: year, month, and a counter
that restarts each month. The release-pipeline design, an internal record, states the goal:
*"an end user sees a single Rasputin version across the OS image, the control-plane software
bundled in it, and the firewall image."* Its reason for dates is one sentence: *"CalVer
communicates freshness for a rolling-base appliance better than SemVer."* A rolling base means
the product is rebuilt on outside software that keeps moving underneath it.

The record also says why the switch was safe: a year is far larger than a major number of 0, so
anything still comparing the old way reads the first calendar version as an upgrade, never a
downgrade.

| Alternative | Why it lost |
|---|---|
| Keep two schemes: dates for the images, semantic versions for the software | One installation keeps more than one version. |
| Semantic versioning for the shared line | For this kind of product, a date *"communicates freshness"* better. |
| One release list for all three products, each tag prefixed with its product | A later decision record, ADR-0002, retired it. GitHub marks one release "latest" per repository, so "latest" *"can only ever resolve one component"*, and three products' test builds interleave in one list. |

## What it cost

**The number stopped promising anything about compatibility.** A semantic major number is a
promise: nothing you rely on breaks until it changes. A date promises only when. So "can this
machine do that?" needs its own record. Rasputin's is a table,
[`agentverbs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/proto/agentverbs.go),
listing each agent command with *"the FIRST published release whose agent subscribes to the
verb"*. Its comment records why: before it, a machine whose agent predated a command was
reported offline. A command left out of the table is still reported as not answering, but
without the advice to update the machine.

**Everything on the line moves at the pace of its slowest part.** The app catalog, the list of
apps a cluster can install, was built into the software. The backlog recorded the cost: adding
an app meant *"a lockstep CalVer cut across three repos against a two-hour build floor — for
content that can change daily."* The catalog left the line. Its version is now, in the manual's
words, *"a plain counter on the catalog's own release stream"*.

**A shared number is a claim, and it stays true only where something checks it.** The firewall
build does not compile the agent; it downloads a published one named in a pin file. Four
consecutive stable firewall releases shipped an earlier release's agent, and nothing said so. The
build now refuses a stable release whose pinned agent does not carry the release's own version.

## What Rasputin does not do here

Machines on different versions are, in the manual's words, *"the normal case, not an error
state"*: an older agent that cannot report something an update check asks for degrades that
verdict rather than failing it. A newer OS or firewall release installs nothing until an operator
deploys it.

## Try it

You will write the check that semantic versioning invites, watch it go wrong on calendar
versions, then move the answer into a table.

**1. Make a sandbox.**

```
mkdir version-choice
cd version-choice
```

**2. Write the semantic-versioning check.** Package managers such as npm read `^1.6.0` as "1.6.0
or newer, with the same major number". Here is that rule as a script. Paste the whole block at
once:

```
cat > caret.sh <<'EOF'
have=$1
need=$2
if [ "${have%%.*}" != "${need%%.*}" ]; then
  echo "$have: no, different major number"
elif [ "$(printf '%s\n' "$need" "$have" | sort -V | head -n 1)" = "$need" ]; then
  echo "$have: yes"
else
  echo "$have: no, older than $need"
fi
EOF
```

`cat > caret.sh <<'EOF'` writes every line up to `EOF` into `caret.sh`; the quotes around `EOF`
stop the shell filling in `$1` while it writes. `$1` and `$2` are the two values you pass: the
machine's version, and the version that added what you need. `${have%%.*}` is everything before
the first dot, the major number. The `sort -V` line checks that the needed version comes first.

**3. Run it on semantic versions.** Four machines; the command you want arrived in 1.6.0.
Predict each answer, then run:

```
for v in 1.4.2 1.9.0 1.10.0 2.0.1; do sh caret.sh "$v" 1.6.0; done
```

`for v in …; do …; done` runs the script once per version, with `v` set to each in turn.

```
1.4.2: no, older than 1.6.0
1.9.0: yes
1.10.0: yes
2.0.1: no, different major number
```

The number answered two questions. Order: 1.4.2 is too old; 1.10.0 is newer. And a promise:
2.0.1 may have broken something, so it is refused.

**4. Switch to calendar versions and keep the check.** This is what a project does when it
changes scheme and keeps its tools. The command arrived in 2026.06.0. Predict the last line
before you run it:

```
for v in 2026.04.2 2026.09.0 2026.12.1 2027.01.0; do sh caret.sh "$v" 2026.06.0; done
```

```
2026.04.2: no, older than 2026.06.0
2026.09.0: yes
2026.12.1: yes
2027.01.0: no, different major number
```

The order is still right: 2027.01.0 sorts after 2026.06.0. The refusal is wrong. Nothing in that
machine's software broke anything; January arrived. In a calendar scheme the first number is the
year, and the check still reads it as a promise. It lets through every newer machine all year,
including one where something did break, then refuses them all when the year changes.

**5. Move the answer into a table.** Each line names a command and the first version that
answers it:

```
cat > floors.txt <<'EOF'
status 2026.01.0
backup 2026.06.0
EOF
```

**6. Write a check that reads the table.** It uses order only, and no promise:

```
cat > can.sh <<'EOF'
have=$1
cmd=$2
floor=$(awk -v c="$cmd" '$1 == c { print $2 }' floors.txt)
if [ -z "$floor" ]; then
  echo "$have: $cmd is not in the table"
elif [ "$(printf '%s\n' "$floor" "$have" | sort -V | head -n 1)" = "$floor" ]; then
  echo "$have: yes"
else
  echo "$have: no, $cmd arrived in $floor"
fi
EOF
```

`-v c="$cmd"` hands the command's name to `awk` as `c`; `awk` prints the second word of the line
whose first word is `c`. If no line matches, `floor` is empty, and `-z` tests for that.

**7. Run it on the same machines.**

```
for v in 2026.04.2 2026.09.0 2026.12.1 2027.01.0; do sh can.sh "$v" backup; done
```

```
2026.04.2: no, backup arrived in 2026.06.0
2026.09.0: yes
2026.12.1: yes
2027.01.0: yes
```

The new year no longer matters. Look back at step 3: the `1.6.0` you typed was already a table
with one row. Semantic versioning never told you which release added a command. What it added
was the promise that nothing else breaks within a major number. Calendar versioning drops that
promise, so the table is what is left.

**8. Ask for something the table does not know.**

```
sh can.sh 2027.01.0 restore
echo "restore 2027.01.0" >> floors.txt
sh can.sh 2026.12.1 restore
```

`>>` adds a line to the end of a file.

```
2027.01.0: restore is not in the table
2026.12.1: no, restore arrived in 2027.01.0
```

Without the row, the check cannot tell "too old" from "never recorded". That is the decision's
upkeep: a new row in every release that adds a command.

**9. Clean up.**

```
cd ..
rm -rf version-choice
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `version-choice`.

The scripts use only finished-release versions, because `sort -V` puts a `-dev` build after its
release, as the beginner lesson showed.

## Check yourself

1. In step 4, what changed in the software on the 2027.01.0 machine to make the check refuse it?
2. What breaks if `status` is removed in 2026.10.0, and a machine on 2026.12.1 is sent it? What
   do `caret.sh` and `can.sh` say?
3. An image bundles an agent from another repository, on one shared version line. Nobody updates
   the pin for three releases. What does the image's version tell you about its agent?
4. You maintain a library other projects depend on, and their package managers read `^` ranges.
   Which scheme fits, and what would the other one cost them?

### Answers

1. Nothing. The year changed, and the check read the year as a major number.
2. Both say yes. `caret.sh` sees the same first number; `can.sh` knows when a command arrived,
   not when it left. A removal needs its own record.
3. Nothing reliable. The label claims they match and nothing checks it, until a build step
   refuses to publish when the pin and the release version differ.
4. Semantic versioning. Their tools read your major number to decide whether an upgrade is safe.
   A calendar version would make those tools refuse every upgrade across a new year, and accept a
   breaking one within it.

## Where to go next

- **Mixed versions in a running fleet:** [Know whether an update worked](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/),
  in Rasputin's manual.
- **Test builds as a flag, not a number:** [Channels](https://rasputin.geekdojo.com/docs/roll-out-an-update/#channels-a-stable-cluster-never-sees-dev-releases).
- **A second version stream:** the catalog's counter in [Install an app](https://rasputin.geekdojo.com/docs/install-an-app/#what-the-catalog-is).
- **The code:** the command table,
  [`agentverbs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/proto/agentverbs.go),
  and the firewall's stable-release check in
  [`release.yml`](https://github.com/geekdojo/rasputin-openwrt-firewall/blob/2026.08.5/.github/workflows/release.yml).
