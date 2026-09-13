---
lesson: engineering-records.intermediate
---

## What you need

- **The beginner lesson,** [How to read a decision record](https://rasputin.geekdojo.com/learn/engineering-records/beginner/).
  It covers context, decision, alternatives and consequences, and why an old record is replaced
  rather than rewritten.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Ubuntu 24.04 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `mkdir`, `echo`, `cat`, `grep`, `awk`, `sort` and `rm`**, already part of macOS and
  Linux. Nothing to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

A **support claim** tells readers which hardware a product works on. Rasputin's first decision
record, ADR-0001, chose a deliberately tight one, to protect the promise that the product works
in its first hour. It named *"Raspberry Pi 5 / CM5 class and Intel N100 class"*: two Raspberry Pi
models, and Intel's N100 processor.

Model names ended up scattered across the website, two code repositories and a dozen development
blog posts. Rasputin's hardware support matrix, an internal record written later, explains why it
had to exist: a question about the hardware claim took a full working session to answer, because
*"the answer lived nowhere"*, and no page said which machines had actually been booted.

## The decision, and what lost

Public copy now states a category, never a model list: *"A Raspberry Pi, or any UEFI amd64
box."* **amd64** is the family of 64-bit Intel and AMD processors. **UEFI** is the firmware
standard modern PCs use to start. And the record keeps two claims apart:

| Claim | In the record's words | Comes from |
|---|---|---|
| **Runs on** | *"What the image supports by construction"* | how the image is built |
| **Tested on** | *"What has actually been booted"* | bench records and devlogs |

The record adds that *"conflating them is the failure mode this page guards"*, and that tested-on
*"is a record, not a promise"*: hardware missing from it is hardware nobody tried, not hardware
that failed.

| Alternative | Why it lost |
|---|---|
| Model numbers in the prose | *"Model numbers in prose rot"*: every mention has to be edited at once, and readers never see them updated. |
| ADR-0001's named list | Checked against what had been built and booted, *"that line is wrong in three ways"*: it named a module nobody had booted, it was narrower than the amd64 image really is, and it left out Raspberry Pi models that had been tested. |
| "We support arm64" | The arm64 image is a Raspberry Pi image. Other makers' arm64 boards do not boot it, so the category promises more than the image delivers. |

ADR-0001 was not replaced. It was **amended**: a dated note restates the list, and says *"The
decision is unchanged."* The facts behind one line changed; the choice of a tight, honest claim
did not.

## What it cost

ADR-0001 had listed the tight list as one defense against **support load**, the time spent
helping people run the product. A claim covering any UEFI amd64 machine weakens that defense, and
the amendment says so. It records the trade as accepted *"with the risk stated"*, and names what
now does the list's job: the published tested-on record.

That record is only as broad as the testing behind it. The matrix says *"Every amd64 machine ever
booted is N100 silicon"*: two different boards, one processor family. The broad claim is *"a claim
about how the image is built, not a measurement."*

**What is recorded, and what is not.** This record is short. It records the decision, the
alternatives and one cost. The amendment carries no **revisit trigger**, the named fact that would
reopen a decision, and the index of Rasputin's decision records lists revisit criteria as part of
the format without giving a reason. The reason used in this lab is this lesson's inference: a
trigger written as a checkable fact lets a later reader check for it, instead of arguing the whole
decision again.

## What Rasputin does not do here

The category claim covers nodes only. The firewall is a separate image, and an Intel N100 box is
its reference and only target. The Compute Module 5 is listed as expected, not tested: none has
been booted.

## Try it

You will keep a support claim both ways, watch the first one drift, then write a claim with a
trigger a script can check.

**1. Make a sandbox.**

```
mkdir support-lab
cd support-lab
```

**2. Put a model list in three pages.**

```
echo 'Runs on: Pi 5, N100' > home.txt
echo 'Runs on: Pi 5, N100' > download.txt
echo 'Runs on: Pi 5, N100' > faq.txt
```

**3. Someone boots a Pi 4, and updates the page in front of them.**

```
echo 'Runs on: Pi 4, Pi 5, N100' > download.txt
grep 'Runs on' *.txt
```

```
download.txt:Runs on: Pi 4, Pi 5, N100
faq.txt:Runs on: Pi 5, N100
home.txt:Runs on: Pi 5, N100
```

`*.txt` means every file ending in `.txt`, and `grep` starts each line with its file's name. Two
pages are now wrong, and none of the three says whether a model was booted or assumed.

**4. Keep the two claims apart instead.** One file records what was booted: model, architecture,
processor and evidence. One script states the rule the image is built to. Paste the whole block:

```
cat > tested.txt <<'EOF'
pi-4 arm64 bcm2711 devlog
pi-5 arm64 bcm2712 control-plane
mini-pc amd64 n100 firewall
module-board amd64 n100 lab-record
EOF
cat > runs-on.sh <<'EOF'
if [ "$1" = amd64 ] && [ "$2" = uefi ]; then exit 0; fi
if [ "$1" = arm64 ] && [ "$2" = pi-firmware ]; then exit 0; fi
exit 1
EOF
cat > status.sh <<'EOF'
if grep -q "^$1 " tested.txt; then
  echo "$1: tested"
elif sh runs-on.sh "$2" "$3"; then
  echo "$1: expected, never booted"
else
  echo "$1: not supported"
fi
EOF
```

`cat > file <<'EOF'` writes every line up to `EOF` into the file. `runs-on.sh` takes an
architecture and a way of booting, and `exit 0` means yes. `status.sh` checks the record first:
`grep -q "^$1 "` succeeds, silently, when a line starts with the model's name.

**5. Ask about three machines.** Predict each answer.

```
sh status.sh pi-5 arm64 pi-firmware
sh status.sh ryzen-box amd64 uefi
sh status.sh other-arm-board arm64 u-boot
```

```
pi-5: tested
ryzen-box: expected, never booted
other-arm-board: not supported
```

The pages would have said nothing about the second machine. The split says exactly how much is
known.

**6. Ask what backs the amd64 claim.**

```
awk '$2 == "amd64" { print $1, $3 }' tested.txt
awk '$2 == "amd64" { print $3 }' tested.txt | sort -u
```

```
mini-pc n100
module-board n100
n100
```

`awk` prints chosen words from lines that match: `$2` is a line's second word. `sort -u` sorts
and removes repeats. Two boards, one processor. Every other amd64 machine the rule covers rests on
how the image is built, not on testing.

**7. Write the revisit trigger as a check.** A claim should be reopened when a machine it says
will run fails to boot. Record failures, and check them against the rule:

```
echo 'old-laptop amd64 bios' > failed.txt
cat > revisit.sh <<'EOF'
while read -r model arch boot; do
  if sh runs-on.sh "$arch" "$boot"; then
    echo "revisit: $model should run it, and did not boot"
  fi
done < failed.txt
echo "failures checked: $(grep -c . failed.txt)"
EOF
sh revisit.sh
```

```
failures checked: 1
```

`while read -r model arch boot` reads `failed.txt` one line at a time. The old laptop starts with
BIOS, the firmware before UEFI, so the claim already excluded it. Its failure is not news. Now a
machine the claim covers fails:

```
echo 'ryzen-box amd64 uefi' >> failed.txt
sh revisit.sh
```

```
revisit: ryzen-box should run it, and did not boot
failures checked: 2
```

`>>` adds a line to the end of a file. The trigger fired on a fact, not on anyone's memory of the
decision. Write it into your own records the same way: *Revisit when* followed by something a
person, or a script, can check.

**8. Clean up.**

```
cd ..
rm -rf support-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `support-lab`.

## Check yourself

1. After step 3, which page was right?
2. A model reads "expected, never booted". Has it failed for anyone?
3. What breaks if a model goes into `tested.txt` because it has the same processor as a tested
   one, without being booted?
4. In step 7, why did the old laptop's failure not trigger a revisit?

### Answers

1. `download.txt` was the most recent, but nothing on any page said so, or said which models were
   booted and which assumed.
2. Nothing says it has. It is missing from the record because nobody tried it, not because it
   failed.
3. The record stops being a record and becomes a promise, and "tested" no longer tells a reader
   anything. Rasputin's amendment corrected a close cousin of this: the Compute Module 5 shares the Pi
   5's processor, had been carried as a supported target *"on the strength of that
   resemblance"*, and is now listed as expected.
4. The claim never covered it: it boots with BIOS, and the rule says amd64 needs UEFI. A trigger
   fires on evidence against the claim, not on every failure.

## Where to go next

- **Both claims, published:** [Supported hardware](https://rasputin.geekdojo.com/docs/hardware/),
  in Rasputin's manual.
- **Which image a machine takes:** [Add a node](https://rasputin.geekdojo.com/docs/add-a-node/),
  steps 2 and 3.
