---
title: "My agent's memory grew to 93 files and 78% of it was in the wrong place"
date: 2026-08-18
description: "My coding agent's persistent memory reached 93 files and tripped the index size warning. The audit found four separate files carrying the same rule in different words, plus rules that duplicated a wiki page and a task's own instructions. 73 of the 93 entries moved to the places that already load them, and a four-question test for what belongs in memory now runs on every session."
summary: "My coding agent's persistent memory reached 93 files and tripped the index size warning. The audit found four separate files carrying the same rule in different words, plus rules that duplicated a wiki page and a task's own instructions. 73 of the 93 entries moved to the places that already load them, and a four-question test for what belongs in memory now runs on every session."
---

I'll preface this entire devlog with the statement that both Karpathy and Cherny 
recommend simply deleting your Claude|agents.md and memory files whenever a new model is 
released. So some of what I talk about below is technically at odds with their 
guidance. With that said...

My coding agent (Claude) keeps a persistent memory — a directory of small markdown files it
writes to when it learns something durable, plus an index it loads every session. I
audited it this week because the index tripped a size warning. It held 93 files,
the index was at 17.2 KB against a 24.4 KB read limit, and nothing in it was older
than 48 days. It had been growing at about 2.5 files a day since I turned it on.

As with the brain, I'm finding all aspects of working with an AI harness require a 
fair amount of 'plaque' cleaning on a routine basis to keep them healthy. In this 
case, I relocated 73 of the 93 entries and provided the agent with stronger guidelines on what 
belongs in memory and what should go in Claude|agents.md (or in a skill).

## Timeline

- **2026-06-25-ish**
  Memory enabled. Capture rule: if the user corrects you or
  something durable happens, write it down.
- **2026-08-12**
  The index hits 70% of its read limit and warns. First
  compaction: tighten every one-line hook, keep all 93 entries. Buys ~2 weeks at
  the observed write rate. 54 files typed `feedback`, 34 `project`, 3 `user`,
  2 `reference`. The 34 `project` entries read like wiki pages: branch-protection
  posture, cluster inventories, asset locations.

## What the audit actually found

**Four files were the same rule.** *Don't invent a cause the user didn't state*,
*don't quote a stale list as live*, *don't infer a probe result as a decision*, and
*don't infer physical topology from a device model* are four faces of one lesson.
I had written the fourth that same afternoon, with the other three loaded in
context, and not noticed. Nothing in the capture step asks whether a rule already
exists in different words.

**One rule was already in a wiki page I'd written hours earlier.** A note about
node IPs not being stable went into a network doc and into memory, same session.

**Eleven of thirteen mail-handling rules were already in the scheduled task that
does the mail.** The memories had been shadowing the skill that already carried
them, in full, with more detail.

**A first pass at checking that produced four false positives.** A grep for
"Reddit" matched an unrelated line about a keyword-alert service; "Trash" matched
a CLI verb. Trusting it would have deleted four live rules. The check that worked
was reading the matches.

## The rule I settled on

Memory holds **behaviour**. Everything else has a better home, and the test is
four questions asked before writing:

1. Does this change what I *do*, or what I *know*? Execution stays; knowledge goes
   to a wiki.
2. Does it only fire during one kind of task? Then it belongs in that task's
   instructions, which load deterministically and are versioned in git — memory is
   recalled by relevance, which is weaker.
3. Does it need a version, a status, or a closure? That's an issue or a wiki page.
   Memory cannot express state and nothing in it expires.
4. Is it already in the always-loaded file, a skill, or a wiki — or does an
   existing memory say it in different words?

Thirty rules went into the skills that use them. Twenty-eight became wiki pages.
Two became GitHub issues, because they carry state a page shouldn't. Six were
personal facts and went to the personal wiki. Twenty stayed.

The four tests now live in the project file that loads on every session, because a
policy that only exists in the conversation where I decided it changes nothing —
something wrote three new memories while I was auditing.

I don't yet know whether four tests are the right four, or whether the gate holds
against a month of ordinary work. The cleanup took an afternoon; the rule is the
part that has to survive. I'll re-run the audit in September and report the number
either way — if it's back above fifty I'd rather publish that than quietly do the
cleanup again.

{{< devlog-footer >}}
