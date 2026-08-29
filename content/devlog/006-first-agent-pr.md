---
title: "A cron job opened its first PR: one helper, 11 copy-pastes gone"
date: 2026-07-30
description: "The control-plane repo runs a Claude agent on a Monday cron that hunts duplicated and dead code, refutes its own findings, and opens a PR a human merges. Its first PR consolidated a SQLite open sequence pasted across 11 store packages — after four runs, a hidden transcript, and a turn budget starved by the Bash allowlist."
summary: "The control-plane repo runs a Claude agent on a Monday cron that hunts duplicated and dead code, refutes its own findings, and opens a PR a human merges. Its first PR consolidated a SQLite open sequence pasted across 11 store packages — after four runs, a hidden transcript, and a turn budget starved by the Bash allowlist."
---

Rasputin is a one-person project, so I have a standing interest in code
review that happens while I sleep. As of July 20th, 2026 the control-plane repo
runs a scheduled AI quality sweep: a Claude agent wakes on a Monday cron,
hunts for duplicated and dead code, tries to refute its own findings, and
opens a PR if anything survives. The first real PR merged the same day — it
consolidated a SQLite open sequence that had been copy-pasted byte-for-byte
across all 11 store packages, and deleted three dead symbols. Getting there
took four runs and two failure modes worth writing down.

**Timeline**

- **2026-07-19** — researched the 2025–2026 agent-quality tooling before
  building anything (24 sources, top claims adversarially verified). The
  consistent line across every credible source: agents find, fix, and open
  PRs; a human merges. Nobody has published a guardrail stack they trust
  for auto-merge. That constraint shaped the whole design.
- **2026-07-19** — `quality-sweep.yml` lands: `anthropics/claude-code-action@v1`
  in automation mode, Mondays 10:00 UTC. The prompt is find → verify → fix →
  gate → ship: refute each candidate before touching it, pass the exact
  checks `ci.yml` runs (gofmt, `go vet`, `go test -race`, `go build`, UI
  typecheck + build), push a branch, open a PR it cannot merge.
- **2026-07-20, run 1** — green in 2m40s, no PR, no visible reasoning. The
  action hides the agent transcript by default, so a no-findings run and a
  silent failure look identical. `show_full_output` + `display_report`
  fixed that.
- **2026-07-20, run 2** — skipped by the action itself. It refuses to run a
  workflow file that differs from main's copy — token-exfiltration
  protection, and it means every change to the sweep needs a merge before
  it can be tested.
- **2026-07-20, run 3** — failed at "Reached maximum number of turns (50)",
  8.5 minutes in, four edits made, nothing pushed.
- **2026-07-20, run 4** — 96 turns, 16 minutes, PR #16 opened with CI green.
  Merged the same day.

**The starvation bug**

Run 3's transcript is the instructive one. The agent wanted `staticcheck`
for dead-code analysis — the right call. The Bash allowlist permitted
`go:*`, so `go install honnef.co/go/tools/cmd/staticcheck` succeeded;
executing `~/go/bin/staticcheck` matched no allowed prefix, so every attempt
bounced. It burned roughly 15 of its 50 turns on GOBIN tricks, symlinks, and
`find / -name staticcheck` before discovering the loophole — `go run
honnef.co/go/tools/cmd/staticcheck` starts with `go`. By then the budget was
gone.

The fix was three lines of YAML: preinstall `staticcheck@2025.1.1` in a
setup step and put it on PATH, add `Bash(staticcheck:*)` to the allowlist,
and raise `--max-turns` to 150 — sized from the measured run, with the
60-minute job timeout as the hard stop. The prompt now states the toolbox up
front: these tools exist, install nothing else.

**What the first PR found**

- The open sequence —
  `?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(on)`,
  `SetMaxOpenConns(1)`, then the schema exec — pasted identically in 11
  store packages. Now a single `dbutil.Open` helper, with each package's
  error-message prefix preserved exactly. Changing one pragma used to mean
  editing 11 files.
- It left `alerts/store.go` alone after confirming its DSN diverges on
  purpose — the refute-your-own-finding step doing its job.
- Three staticcheck U1000 symbols removed, each with grep evidence in the
  PR body: an unused `msPtr`, a function-local `type cell`, an orphaned
  `errNoGrubenvState`.
- +66/−115 overall, every gate green before it pushed.

Cost: the workflow authenticates with an OAuth token from `claude
setup-token`, so runs draw from the same Claude Max subscription I already
use for daily development instead of metered per-token API credits — the
two billing paths are easy to conflate, and Anthropic's
[plan-usage article](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
explains the split better than I can keep current here. 96 turns and 16
minutes on a weekly cadence rounds to nothing against the plan's limits.
The guardrails stay: ~400-line diff cap,
no dependency or workflow changes, no touching the `/healthz` install
contract, and the merge button stays human.

**Takeaway:** the agent was never the hard part. The harness was —
transcript visibility, tool access, a measured turn budget, and gates the
run cannot skip.

{{< devlog-footer >}}
