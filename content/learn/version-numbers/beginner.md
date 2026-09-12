---
lesson: version-numbers.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS. Step 8 was also run on Linux. The Git steps
  were not tested on Linux, and nothing was tested on Windows.
- **Git**, the tool most software projects use to track changes. Type `git --version` and press
  Return. If you see a version number, you have it. If not: on macOS, install Git from
  [git-scm.com](https://git-scm.com/downloads); on Linux, install the package `git`. Installing
  it may need administrator rights on macOS and does need them on Linux. This lesson was tested
  with Git 2.54.0.
- **`sort`** and **`printf`**, commands that are already part of macOS and Linux. Nothing to install.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

A **release** is a build of some software that someone decided to hand to users. A **version
number** is the label on one release.

Version numbers exist to answer two questions. The first is for people: *which one do you have?*
A bug report that says "it crashes on 1.9.0" can be checked against 1.9.0. The second is often
asked by a program, not a person: *is there anything newer than what I have?* To answer it, the
program has to put two version numbers in order. That is the hard part.

Two schemes are common:

- **Semantic versioning** (SemVer) looks like `1.9.0`: MAJOR.MINOR.PATCH. The first number goes
  up when something you rely on changes in a way that could break you.
- **Calendar versioning** (CalVer) starts with a date. `2026.07.1` might mean "a release from July
  2026, counter 1".

Many projects also hand out **pre-releases**: test builds made before a release is finished,
marked with a suffix such as `-beta.1` or `-dev.9`.

Here is why ordering is harder than it looks. To a computer, `1.10.0` is just text, and text is
sorted one character at a time, the way a dictionary is. Compare `1.10.0` with `1.9.0`: the first
two characters match, then `1` meets `9`, and `1` comes first. So text sorting puts 1.10.0 before
1.9.0, even though ten is more than nine.

Pre-releases add a second problem, and no tool can solve it for you: does `2026.07.1-dev.9` come
before or after `2026.07.1`? That is a choice, and the project has to write its choice down.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small group of computers at home. It
publishes its software on one calendar line, `YEAR.MONTH.COUNTER`, and its test builds add `-dev.`
and a number, such as `2026.08.5-dev.204`. You can see them on its
[releases page](https://github.com/geekdojo/rasputin-os/releases).

Rasputin's rule is written in one small file,
[`version.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/releases/version.go):
compare the year, month and counter as numbers; a finished release outranks any `-dev` build of
the same number; and, in the file's own words, *"among -dev builds the higher N is newer"*, where
N is the number after `dev.`. So `dev.9` is older than
`dev.72`, even though a plain text sort puts `dev.9` last. You will see that happen next.

## Try it

You will make a throwaway Git project, give it version labels, and watch three tools put them in
three different orders.

**1. Make a sandbox.** Run these one at a time:

```
mkdir version-lab
cd version-lab
git init
```

`mkdir` makes a new, empty folder; `cd` moves you into it; `git init` turns it into a Git project.
Git may print several lines starting with `hint:` about a branch name. They are harmless.

**2. Tell Git who you are, for this folder only.**

```
git config user.name "Your Name"
git config user.email "you@example.com"
```

Git records a name and email with every change. Because there is no `--global` flag, these
settings apply only inside `version-lab`. The placeholder values are fine; nothing here is shared.

**3. Make one release and label it three ways.**

```
git commit --allow-empty -m "First release"
git tag v1.2.0
git tag v1.9.0
git tag v1.10.0
```

A **commit** is a saved snapshot. `--allow-empty` lets you save one with no files in it, since you
only need something to label, and `-m` gives it a message. A **tag** is a name pinned to a commit.
Real projects put each tag on a different commit; for this exercise, one commit is enough.

**4. Predict, then list.** Write down the order you expect. Then run:

```
git tag
```

```
v1.10.0
v1.2.0
v1.9.0
```

Text order: `v1.10.0` comes first because `1` sorts before `9`.

**5. Ask for version order.**

```
git tag --sort=version:refname
```

```
v1.2.0
v1.9.0
v1.10.0
```

`--sort` chooses the order. `version:refname` means "treat each tag name as a version", so runs of
digits are compared as numbers. Put a minus in front, `--sort=-version:refname`, and the newest
comes first.

**6. Add Rasputin-shaped labels.**

```
git tag 2026.07.1-dev.9
git tag 2026.07.1-dev.72
git tag 2026.07.1
git tag --list '2026*'
git tag --list '2026*' --sort=version:refname
```

`--list '2026*'` shows only tags starting with `2026`. Keep the quotes: without them, some shells
try to match `2026*` against file names and stop with an error. The two listings print:

```
2026.07.1
2026.07.1-dev.72
2026.07.1-dev.9
```

```
2026.07.1
2026.07.1-dev.9
2026.07.1-dev.72
```

Text order puts `dev.72` before `dev.9`. Version order fixes that, but it ranks the finished
release *lowest* — the opposite of Rasputin's rule.

**7. Tell Git your rule.**

```
git -c versionsort.suffix=-dev tag --list '2026*' --sort=version:refname
```

```
2026.07.1-dev.9
2026.07.1-dev.72
2026.07.1
```

`-c` sets a Git setting for this one command. `versionsort.suffix=-dev` says "a name ending in
`-dev` and something is a pre-release; put it before the release". Now the order matches Rasputin's.

**8. Try a different tool.**

```
printf '%s\n' 2026.07.1-dev.72 2026.07.1 2026.07.1-dev.9 | sort
printf '%s\n' 2026.07.1-dev.72 2026.07.1 2026.07.1-dev.9 | sort -V
```

`printf '%s\n'` prints each value on its own line, and `|` hands those lines to `sort`. Plain
`sort` gives text order, like step 6. `sort -V` gives version order, and again ranks the finished
release lowest. `sort` has no option to change that. Both results are the same on macOS and on
Linux.

**9. Clean up.**

```
cd ..
rm -rf version-lab
```

`rm` deletes; `-r` includes everything inside the folder, and `-f` skips the questions. It cannot
be undone, so check you typed `version-lab`.

## Check yourself

1. Why does `git tag` list `v1.10.0` before `v1.9.0`?
2. In steps 6 and 8, two tools sorted correctly by number and still disagreed with Rasputin. About
   what?
3. A program checks for updates by sorting version labels as text. You are on `2026.07.1-dev.9`
   and `2026.07.1-dev.72` is published. Which does it treat as newest?

### Answers

1. Text is compared one character at a time, and `1` comes before `9`.
2. Where a pre-release goes. Both put `2026.07.1` before its `-dev` builds; Rasputin puts it after.
   Neither is wrong. It is a choice, which is why a project writes its rule down.
3. `dev.9`, because it sorts last as text. It would tell you that you are already up to date.

## Where to go next

- **Versions in a running system:** [Know whether an update worked](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/),
  in Rasputin's manual, shows how an update checks the version a machine reports after it
  installs one.
- **The code:** the ordering rule in
  [`version.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/releases/version.go)
  in the public `rasputin-control-plane` repository.
- **Real version labels:** Rasputin's [releases page](https://github.com/geekdojo/rasputin-os/releases).
