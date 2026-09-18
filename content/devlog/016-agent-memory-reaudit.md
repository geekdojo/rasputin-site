---
title: "A month later, my agent's memory is back to 47 files"
date: 2026-09-17
description: "My coding agent writes its own memory files and reloads them at the start of every session. Five weeks after cutting that store from 93 files to 20 and putting a four-question gate in front of it, the re-audit came back at 47 — and about half the new entries got past the gate in ways it was never going to catch."
summary: "My coding agent writes its own memory files and reloads them at the start of every session. Five weeks after cutting that store from 93 files to 20 and putting a four-question gate in front of it, the re-audit came back at 47 — and about half the new entries got past the gate in ways it was never going to catch."
---

Every time I open a session with my coding agent, it reads a block of standing instructions
before it reads anything about the job I've actually given it. Part of that block is a memory
the agent maintains itself — notes it writes, unprompted, when it learns something it expects
to need again. It is loaded on every startup, it sits in front of the model while it works out
how to approach the task, and for the first few months I ran it I had never read the whole
thing through.

In [devlog #11](/devlog/011-agent-memory-audit/) I read it: 93 files, written over seven weeks,
and I cut them to 20. I did that for startup cost and for clarity. Every one of those files is
context the agent pays for before it has done anything useful, and a pile of duplicated, stale
and occasionally contradictory rules is a worse thing to put in front of a model than a short
list of real ones — instructions that argue with each other are instructions it has to pick
between. So I gave it four questions to answer before writing anything new, and said I'd re-run
the audit in September and publish the number either way.

This is that re-audit. The gate half held: the agent writes a fraction of what it used to, and
the entries still getting through are getting through in ways the four questions were never
going to catch.

## What the memory actually is

If you haven't worked with a coding agent that keeps one, the mechanism is small.

- A **memory** is one short markdown file holding one durable rule — *quote every shell
  expansion, because the shell differs between my Mac and my Linux boxes* — written by the agent
  mid-session when it learns something it expects to need again.
- Those files live in a directory. There's one directory per project I work in, and I'll call
  each one a **store**. My main store belongs to the workspace where I do most of my planning;
  the Rasputin repos have their own.
- Beside them sits an **index**, `MEMORY.md`: one line per file, a title and a hook. The agent
  reads the whole index at the start of every session and pulls a file's full text only when a
  line looks relevant to what I've just asked for. The index has a 24.4 KB read limit and warns
  at 70% of it. That warning is what started the original audit.
- Each memory also carries a type label — `user`, `feedback`, `project`, `reference` — set by
  the agent when it writes the file.
- The agent decides on its own when to write one. Nothing prompts it, nothing reviews it
  afterwards, and nothing in it expires.

The index is text the agent reads before it reads anything about the actual problem. A store
full of rules that are duplicated elsewhere, or only true during one kind of work, is a cost
paid at the top of every session, and a stale fact in there is worse than a missing one — the
agent acts on it.

## The four questions

In August I moved 73 of the 93 entries into places that already load them. That means either a
**skill** — a task's own instruction file, which the harness loads whenever that task runs and
which is versioned in git — or a **wiki page**, the project documentation a human reads. What
stayed had to pass four questions, asked before writing anything new:

1. Does this change what I *do*, or what I *know*? Execution stays; knowledge goes to a wiki.
2. Does it only fire during one kind of task? Then it belongs in that task's instructions, which
   load deterministically and are versioned in git — memory is recalled by relevance, which is
   weaker.
3. Does it need a version, a status, or a closure? That's an issue or a wiki page. Memory cannot
   express state and nothing in it expires.
4. Is it already in the always-loaded project file, a skill, or a wiki — or does an existing
   memory say it in different words?

The questions sit in the project instruction file that loads on every session, so the agent has
them in front of it every time it might write. They run at write time and at no other time.

## Timeline

- **2026-08-12** — Main store cut to 20 files and a 3.9 KB index. The four questions go into the
  project file that loads on every session.
- **2026-08-17** — I find a store I'd never audited: the Rasputin project's own, at 28 files. I
  move out the seven typed `project` and add the same four questions to that project's file,
  leaving 21.
- **2026-09-14** — Re-audit. Everything measured before anything is changed.

## The numbers

- **Main store:** 20 → 47 files, and the index the agent loads every session went from 3.9 KB to
  9.3 KB. 29 written and 2 deleted over 33 days — 0.9 files a day, against 2.5 before the cut.
  That's under the fifty I'd said I would treat as a bad result. The index is at 38% of its
  24.4 KB limit; the warning that started all this fires at 70%.
- **Rasputin store:** 21 files, none written since 08-17. Six sessions ran in that project in
  that time against roughly 800 in the main one, so zero writes tells me nothing about whether
  the gate works there.
- **The rest:** there are 11 of these directories on this machine and 6 have anything in them.
  The four I hadn't counted hold one or two files each, so the totals don't move. In August I
  recorded 08-17 as finding *a second store*. A store appears for every project directory I
  open, so the number isn't two — it's however many projects I've worked in, and I had audited
  one of them.

## What the 27 new entries were

I read every entry written since the cut and put each one back through the four questions.

- **14 passed.** General behaviour rules with no better home: how to report a result, when to
  ask before acting, what to do when a check fails.
- **3 shouldn't exist.** Two duplicated rules that landed in a documentation standard a day
  later. The third was a release-status record typed `project` — exactly the category question
  three exists to catch — written to replace an earlier record whose facts had gone wrong.
- **10 are rules carrying facts.** These pass question one and bring something with them: a
  bench hostname that has since changed, a hazard that was fixed the same day, a product design
  principle that other contributors need to see and can't.

One move went the way it's supposed to. A debugging rule written to memory at 13:48 was in the
skill that runs that task by 16:56 the same day, and the memory was deleted.

## Why the gate missed them

- **It only runs at write time.** Four rules went into memory and into a wiki page or a skill
  within two days of each other, twice on the same day. Nothing goes back to delete the memory
  once the better home exists.
- **Correcting an entry skips the gate.** The `project` record replaced one with wrong facts.
  Fixing a memory reads as maintenance, so nothing asks whether the entry belongs in memory at
  all.
- **A fact can ride inside a rule past question one.** *Only run this on the bench* changes what
  the agent does, so it passes — and it carries the bench's hostname with it, which changes
  every epic.
- **My 08-17 pass used the type label as the test.** I moved everything typed `project` and left
  the rest, which is quicker than reading 28 files and doesn't work: the label is the agent's
  guess at the time of writing, not a verdict. About 15 of the 21 that stayed fail the
  questions — copies of skills and project files, product principles, and one rule telling the
  agent it may commit straight to `main` that a newer rule forbids. One entry had been retyped
  from `user` to `feedback` without a word of its text changing.

## What I changed

- **Main store: 47 → 41 files, index 9.3 KB → 8.3 KB.** Deleted the three that shouldn't exist.
  Stripped stale facts out of seven more — hostnames, the closed hazard, version numbers — and
  moved the task-specific half of four rules into the skills that run those tasks. Four entries
  stated one lesson in different words; they're a single entry now, with each original's trigger
  kept in its description so it still gets recalled by any of the four phrasings.
- **Rasputin store: 21 → 2 files, index 4.0 KB → 416 B.** Eight were copies of rules already in
  a skill or a project file and were deleted, along with the commit-to-`main` rule. Ten moved:
  four product principles and UI conventions into the design docs, a QEMU debugging recipe into
  its own wiki page, and the rest into the release, devlog, provisioning and docs skills. Two
  behaviour rules stayed.

The four questions stay as written. They catch a bad entry at the moment it's written and do
nothing after that, so I've added one rule beside them: when a rule lands in a skill or a wiki
page, the memory that carried it gets deleted in the same change, and editing an existing entry,
including to fix a fact, means asking the four questions again. That covers the first two
failure modes above. The third — facts riding inside rules — I don't have an answer for, since
the questions can't tell a rule from a rule with a hostname in it, and I'm not convinced a fifth
question would either. For now the only thing catching those is me reading the store. There is 
probably room for some automation here but there is also a reason why Boris Cherny advises folks 
to delete these types of files every six months.

{{< devlog-footer >}}
