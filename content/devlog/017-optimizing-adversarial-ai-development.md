---
title: "Optimizing Adversarial AI Development"
date: 2026-10-01
description: "Rasputin issues that need code now go through four Claude Code agents that check each other's work. Quality went up, and so did the cost, so I priced one run role by role and changed where the spend was going."
summary: "Rasputin issues that need code now go through four Claude Code agents that check each other's work. Quality went up, and so did the cost, so I priced one run role by role and changed where the spend was going."
---

As Rasputin continues to age from a greenfield application, the increased complexity and need for 
thorough testing, has highlighted some challenges with single agent development. Single agent development, 
where one agent plans, develops, and tests, works well enough in a brand new application but starts 
to really show challenges as complexity increases. Rasputin hit that wall this past week while I 
was refactoring some code smells (like not using dependency injection). To solve the issue I've now 
split the workflow to four separate agents driven from a common skill. Claude called it `develop-issue`, 
and hey, I'm GenX, so chuckled at that a bit. 

The `develop-issue` skill takes one GitHub issue and runs it through four roles. The
**orchestrator** is the session I talk to. It dispatches the others, keeps the record and never
writes product code. The **builder** plans the change, then writes it with unit tests in its
own git worktree. The **design reviewer** attacks the plan against the issue, the design doc and
the written engineering standard, and writes the test cases before any code exists. The
**verifier** checks out the change at one exact commit, runs every test case, measures
coverage of the lines it touched and reads the CI and security gates.

The rule the setup exists for is that no agent grades its own work: each piece is checked by at
least two parties that didn't produce it. The reviewer and the verifier are read-only and work
in a detached worktree at the commit under review, and the orchestrator confirms that worktree
is untouched before it accepts a verdict. I approve the plan before any code is written, and I
merge. Every plan, review, test case, finding and piece of evidence goes into a private records
repo, so the GitHub issue only carries short check-ins for me.

**Quality immediately went up.** Honestly, I was surprised by how much better both the code and 
the tests became. Much more thoroughly thought out and tested. Having said that, the first cut 
was also MUCH more expensive and time consuming.

## Optimizing the skill

The first runs were expensive, so I had Claude go through one run's transcripts role by role,
pricing every API call. Three things came out of it:

- **Nothing pinned a model.** Every role ran on whatever model and effort the session was running. 
  Each role's agent file now pins Opus 5.5 and an effort level: `medium` for the builder and the verifier,
  `high` for the design reviewer, which is the role that finds the defects.
- **The builder that wrote the plan was resumed to build it.** The prompt cache expires after
  five idle minutes, and a plan waits much longer than that for review and for my approval, so
  every resume re-wrote the builder's whole context back into the cache. The build and every fix
  round now start a fresh builder, briefed from the record. The builder is only resumed for plan
  revisions.
- **The orchestrator was hand-copying.** Each round it pulled role output out of the agent
  transcripts with one-off Python and `sed`, and patched the findings ledger with regexes. That
  is now a handful of small scripts with unit tests: one extracts a role's final message
  verbatim, and the others edit the ledger, the record's README and check a reviewer's worktree.
  The roles emit fixed markers so the extraction never guesses.

I also looked at moving roles to Sonnet or Haiku. Most of the spend was cache reads of large
contexts, and those cost the same on Sonnet 5.5 as on Opus 5.5. The reviewers were a small
share of the bill and caught every design defect. The context was the problem, so I left the
models alone.

## The datapoints

To be fully transparent, I did not test on precisely the same issue. I did use two similarly 
complex and roughly the same sized issues. The before-run was a shell test harness that needed 
bench access, three plan rounds and five decisions from me. The after-run was a Go change to the 
control plane that could be unit-tested in CI. What we were testing here is the hand-off between 
sessions, so repeating with the same issue is less important. I'm looking for directionally significant here.

| | Before | After |
|---|---|---|
| Total cost | $43.92, before code review | $24.96, through merge |
| Builders | $31.11 | $10.37 |
| Builder cache rewrites | ~$10.27 | $2.99 |
| Builder average context | 288k tokens (peak 485k) | 36k-158k tokens |
| Orchestrator | $7.65 (average context 217k) | $5.38 (average context 176k) |
| Wall-clock time | 202 min, still unfinished | 70.6 min to hand-off; 48 of the 104 min to merge were waiting on me |

The builder rows are where the change shows. The after-run's builders cost a third of the
before-run's, and the context rows show why: no builder
carried a planning session into the build, so none of them grew to hundreds of thousands of
tokens and none paid to re-write that into the cache after an idle gap. The orchestrator came down less, because it still holds the
whole run, but it no longer reads role output into its own context to copy it.

The after-run went through two plan rounds and two code rounds, all under the cap of three. The
reviewer still caught two blocking defects before merge, one of them an empty trust
configuration that silently fell back to the system certificate store, which is exactly the
behaviour that issue existed to remove. 

The first run on the new setup also turned up three smaller problems: a verifier that reported
while CI was still running, a findings map still written by hand, and a mistyped worktree path.
Those are fixed in the two plugin versions after it. Every role stays on Opus for now. The verifier is
the one role whose work looked mechanical enough for a cheaper model, and if it keeps coming
back with evidence and no defects, it's the first one I'll trial on Sonnet.

{{< devlog-footer >}}
