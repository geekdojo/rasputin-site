---
lesson: engineering-records.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 and on Ubuntu 24.04. It was not tested on
  Windows.
- **`mkdir`, `cat`, `grep`, `sed`, `cp` and `rm`**, commands that are already part of macOS and
  Linux. Nothing to install, and no administrator rights needed. `sed` differs between them in one
  way, covered in step 6.
- **`nano`**, a text editor that runs in the terminal, for step 8. It comes with macOS and
  usually with Ubuntu; if `nano` is not found, `sudo apt install nano` adds it, which needs
  administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

Code shows *what* a system does. It rarely shows *why*, and never what was turned down. A year
later someone asks "why don't we just…?", and nobody remembers.

A **decision record** answers that. It is a short document written when a choice is made, and
kept. Software teams often call them **ADRs**, architecture decision records, and
number them in order. Most have four parts, under headings that vary:

- **Context:** the problem, and the facts that were true at the time.
- **Decision:** what was chosen.
- **Alternatives considered:** what else was on the table, and why each one lost.
- **Consequences:** what the choice makes easier, and what it makes harder.

Each record also has a **status**, such as *Proposed*, *Accepted* or *Superseded*. Superseded
means a later record replaced this one.

Two habits make records useful. When a decision changes, a new record replaces the old one, and
only the old one's status changes. And the new record weighs the old alternatives again, because
the facts that ruled them out may have changed.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. Its code lives in **repositories** ("repos"), online folders that
hold a project's files and history; each finished version it publishes is a **release**. A
private repo is visible only to its owners. Rasputin's decision records are private, so this one
is quoted.

In July 2026, record number 2 retired a separate public copy of Rasputin's releases, called the
mirror. Its context: *"The mirror existed for exactly one reason: the source repos were
private"*. They had since been made public. The decision: *"Retire the
`rasputin-releases` mirror."* One alternative, a separate place just for test builds, is marked
*"Rejected"*. Among the consequences: Rasputin now checks three repos for new releases instead of
one.

## Try it

You will write two records, the second replacing the first, then search them as a newcomer
would.

**1. Make a sandbox.** Run these one at a time:

```
mkdir decisions-lab
cd decisions-lab
```

`mkdir` makes a new, empty folder; `cd` moves you into it.

**2. Write the first record.** Copy the whole block and paste it into the terminal at once:

```
cat > 0001-notes-on-laptop.md <<'EOF'
# 0001: Keep project notes in a text file on my laptop
Status: Accepted

## Context
My notes are scattered across emails. I use one computer.

## Decision
Keep all project notes in one text file on my laptop.

## Alternatives considered
A notes app that syncs. Rejected: I use one computer, so syncing adds nothing.

## Consequences
Any tool can search it. If the laptop is lost, so are the notes.
EOF
```

`cat >` writes the text that follows, up to the line `EOF`, into the named file. The quotes
around `EOF` stop the shell changing the text. While you paste, the terminal may show `>` or
`heredoc>` on each line. That is normal.

**3. Find the four parts.**

```
grep -n '^## ' 0001-notes-on-laptop.md
```

```
4:## Context
7:## Decision
10:## Alternatives considered
13:## Consequences
```

`grep` prints the lines that match a pattern, and `-n` adds line numbers. `'^## '` matches lines
that start with `## `: the headings.

**4. The facts change. Write a second record.**

```
cat > 0002-notes-in-synced-folder.md <<'EOF'
# 0002: Move project notes to a synced folder
Status: Accepted. Supersedes 0001.

## Context
I now also use a desktop computer. The notes file is only on the laptop.

## Decision
Keep the same text file in a folder that syncs between both computers.

## Alternatives considered
Email the file to myself. Rejected: two copies drift apart.

## Consequences
Both computers have the notes, as long as syncing works.
EOF
```

**5. Ask what is in force.** Predict: how many records say they are current?

```
grep '^Status' *.md
```

```
0001-notes-on-laptop.md:Status: Accepted
0002-notes-in-synced-folder.md:Status: Accepted. Supersedes 0001.
```

Both. `*.md` stands for every file ending in `.md`, and `grep` starts each line with its file's
name. Writing 0002 changed nothing in 0001, which still says it is current.

**6. Change the old record's status, and nothing else.**

```
sed -i.bak 's/^Status: Accepted$/Status: Superseded by 0002/' 0001-notes-on-laptop.md
rm 0001-notes-on-laptop.md.bak
grep '^Status' *.md
```

```
0001-notes-on-laptop.md:Status: Superseded by 0002
0002-notes-in-synced-folder.md:Status: Accepted. Supersedes 0001.
```

`sed` edits text. `s/old/new/` replaces the first with the second, and `^` and `$` mean the whole
line must match. `-i.bak` edits the file itself and keeps the original as a `.bak` copy, which the
next line deletes. Plain `-i` works on Linux, but on macOS it stops with
`invalid command code`.

**7. Ask a newcomer's question.** "Why don't we use a notes app?" Predict which record answers
it.

```
grep -n 'notes app' *.md
```

```
0001-notes-on-laptop.md:11:A notes app that syncs. Rejected: I use one computer, so syncing adds nothing.
```

Line 11 sits under Alternatives considered, the heading on line 10 in step 3. The only answer
is in the superseded record, and its reason stopped being true when you got a second computer.
Record 0002 never weighed the notes app again.

**8. Write your own.** Pick a choice you actually face, such as a laptop to buy. Make a blank
record:

```
cat > 0003-my-choice.md <<'EOF'
# 0003: <the choice, in a few words>
Status: Proposed

## Context
<the problem, and the facts true today>

## Decision
<what you are choosing>

## Alternatives considered
<each other option, and why it lost>

## Consequences
<what gets easier, and what gets harder>
EOF
```

Open it in `nano`:

```
nano 0003-my-choice.md
```

Replace each line in angle brackets, brackets included, with your own words. Save with
Control-O, then Return; leave with Control-X. Then check:

```
grep -n '<' 0003-my-choice.md
```

It prints each line that still holds a placeholder, and nothing once all are replaced.

**9. Clean up.**

```
cp 0003-my-choice.md ..
cd ..
rm -rf decisions-lab
```

The first line keeps your record, in the folder above (`..`). `rm` deletes; `-r`
includes everything inside the folder, and `-f` skips the questions. It cannot be undone, so
check you typed `decisions-lab`.

## Check yourself

1. Where in a decision record do you look to learn why an obvious option was not chosen?
2. After step 4, why was record 0001 misleading, though every sentence in it had been true?
3. What change removed the one reason Rasputin's mirror existed?

### Answers

1. Alternatives considered.
2. Its status still said Accepted after a later record had replaced it.
3. Its source code repositories, private until then, were made public.

## Where to go next

- **Where the releases went:** each repository publishes its own, as on the
  [`rasputin-os` releases page](https://github.com/geekdojo/rasputin-os/releases).
