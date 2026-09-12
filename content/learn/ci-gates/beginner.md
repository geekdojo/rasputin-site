---
lesson: ci-gates.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS with Git 2.50.1 and 2.54.0, and on Linux
  (Debian) with Git 2.47.3. It was not tested on Windows.
- **Git**, the tool most software projects use to track changes. Type `git --version` and press
  Return. If you see a version number, you have it. If not: on macOS, install Git from
  [git-scm.com](https://git-scm.com/downloads); on Linux, install the package `git`. Installing
  it may need administrator rights on macOS and does need them on Linux.
- **`sh`, `echo` and `chmod`**, already part of macOS and Linux.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

A software project changes one proposed edit at a time. Each **change** is reviewed and then
**merged**: added to the main copy of the code.

**Continuous integration** (CI) checks every change automatically, as soon as it is proposed. A
separate computer takes the change and runs a list of **checks**: programs that confirm, for
example, that the code builds and its tests pass. A **test** is a small program that runs part of
the code with a known input and compares the result with the expected answer.

Every program, a check included, ends with an **exit status**: a number it hands back when it
finishes. `0` means success; anything else means failure. The words a check prints are for
people. The exit status is what CI reads.

A **gate** is a check allowed to stop a change: if it fails, the change cannot be merged. Other
checks only **report**: they show a result and let the change through either way. Which checks
are gates is a separate decision, usually recorded somewhere other than the list of checks. On
GitHub, the file that says what to run does not say what must pass; the repository's settings do.

So a passing check proves only that what it checked came out as expected. It does not prove the
code is right where no test looks, and a result alone does not say whether a failure would have
blocked anything.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-control-plane) is an open-source system for
running a small group of computers at home. Its control-plane repository runs a
[CI workflow](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/.github/workflows/ci.yml)
on every proposed change, with checks that include tests and a build. A comment in the file notes
that what blocks a merge is *"configured outside this file"*, in the repository's settings. Those
settings name required checks, so, as another comment records, renaming one check once left a
change blocked while *"all twelve checks were green"*.

## Try it

You will build a tiny program, a check for it, and a gate. The gate is a Git **pre-commit
hook**: a script Git runs before saving each **commit**, a snapshot of your files. If the script
fails, Git refuses the commit. In CI the checks run on a separate computer; here your own Git
plays that part.

**1. Make a sandbox.** Run these one at a time:

```
mkdir ci-lab
cd ci-lab
git init
git config user.name "Your Name"
git config user.email "you@example.com"
```

`mkdir` makes a new, empty folder; `cd` moves you into it; `git init` turns it into a Git project.
It prints a line beginning `Initialized empty Git repository`, and may print `hint:` lines;
neither is an error. With no `--global` flag, the name
and email apply only inside `ci-lab`; the placeholders are fine.

**2. Write the program.**

```
echo 'echo $(( $1 * 2 ))' > double.sh
sh double.sh 3
```

```
6
```

`double.sh` prints double the number you give it: `$1` is that number, and `$(( ))` does the
arithmetic. The single quotes keep the line exactly as typed, and `>` sends it into the file.

**3. Write a check.** Copy all of these lines at once:

```
cat > check.sh <<'EOF'
if [ "$(sh double.sh 2)" = "4" ]; then
  echo "check passed"
else
  echo "check FAILED"
  exit 1
fi
EOF
sh check.sh
echo $?
```

```
check passed
0
```

`cat > check.sh <<'EOF'` saves every line up to `EOF` into `check.sh`. The check runs the program
with `2` and compares the answer with `4`; if they differ, `exit 1` ends it with a failure status.
`echo $?` prints the exit status of the command before it.

**4. Make the check a gate.**

```
echo 'sh check.sh' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
git add double.sh check.sh
git commit -q -m "Add double"
```

```
check passed
```

`.git/hooks/pre-commit` is where Git looks for this hook, and `chmod +x` marks it as runnable.
`git add` chooses files for the commit. In `git commit`, `-m` gives the commit a message, and `-q`
stops Git printing its own summary, so what you see comes from the hook.

**5. Break the program.**

```
echo 'echo $(( $1 * 3 ))' > double.sh
git commit -q -a -m "Triple it"
git log --format=%s
```

```
check FAILED
Add double
```

`-a` includes every changed file Git already tracks. `git log --format=%s` lists saved commits by
message, newest first. Only `Add double` is there: the gate refused the change.

**6. Predict, then commit.** Will the gate accept this one?

```
echo 'echo $(( $1 + 2 ))' > double.sh
sh double.sh 3
git commit -q -a -m "Add two"
```

```
5
check passed
```

Double 3 is 6, and the program says 5. The gate accepted it anyway, because `2 + 2` and `2 * 2`
are both 4. The check proved one thing, the answer for `2`, and nothing else.

**7. Turn the gate into a report.**

```
echo 'sh check.sh || true' > .git/hooks/pre-commit
echo 'echo $(( $1 * 3 ))' > double.sh
git commit -q -a -m "Triple it"
git log --format=%s
```

```
check FAILED
Triple it
Add two
Add double
```

`||` means "if the command before this failed, run the one after", and `true` always succeeds.
The check still ran and still printed `check FAILED`, but the hook now always exits `0`, so Git
saved the commit. Nothing in the output shows that the check lost its power to block. Only reading
the hook, where that authority is written down, tells you.

Apart from `hint:` lines, every step prints the same on macOS and Linux.

**8. Clean up.**

```
cd ..
rm -rf ci-lab
```

`rm` deletes; `-r` includes everything inside the folder, and `-f` skips the questions. It cannot
be undone, so check you typed `ci-lab`.

## Check yourself

1. A check prints `check FAILED`. What does CI look at to decide whether it failed?
2. In step 6, the check passed. What did that prove about `double.sh`?
3. A proposed change shows one failing check, and the page still lets you merge it. Is something
   broken?

### Answers

1. Its exit status. In step 7 the check exited `1`, but the hook threw that away and exited `0`,
   and Git went by the hook.
2. Only that it prints `4` when given `2`. For `3` it was wrong.
3. Not necessarily: that check may only report. Whether a check blocks is a separate setting, so
   read the setting rather than guess from the result.

## Where to go next

- **A real list of checks:** Rasputin's
  [CI workflow](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/.github/workflows/ci.yml),
  whose comments explain why a check's name matters.
- **Checks running:** the workflow's
  [recent runs](https://github.com/geekdojo/rasputin-control-plane/actions/workflows/ci.yml) in the
  public repository.
