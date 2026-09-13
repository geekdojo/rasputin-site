---
lesson: ci-gates.intermediate
---

## What you need

- **The beginner lesson,** [What a passing check proves](https://rasputin.geekdojo.com/learn/ci-gates/beginner/).
  It covers checks, exit statuses, and the difference between a gate and a report.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `grep`, `awk`, `basename`, `cat` and `mv`**, already part of macOS and Linux. Nothing
  to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

A **scanner** is a check that reads source code for patterns known to cause trouble, such as a
password written into a file. Each match is a **finding**. Some findings are real defects. Many
are **false positives**: the pattern matched, but the code is correct.

Every scanner raises two questions. What should make it fail? And should its failure stop a
merge, or only report?

[Rasputin](https://github.com/geekdojo/rasputin-control-plane)'s control-plane repository added a
scanner for its own Go code. Its first run found 148 findings in existing code, and nobody had
read them.

## The decision, and what lost

The first attempt used a **baseline**: record every existing finding, and fail only on findings
not in the record. It printed `OK` and was reverted. The script that replaced it says why in its
opening comment: *"For our own code a fix is always available, so the baseline was doing no
work"* beyond keeping the check green.

What replaced it is a **reviewed register**: one row per finding, each with a verdict (`real`,
`false-positive`, `deliberate`, `blocked` or `unreviewed`) and the reasoning behind it. The check
fails on a new finding, a row still marked unreviewed, or a real defect with no tracking issue. It
does not fail merely because known defects exist.

| Alternative | Why it lost |
|---|---|
| A baseline of existing findings | Nobody read them, and the check said `OK`. A baseline is kept for dependency advisories, where *"a fix may not be shippable yet"*. |
| Fail until no known defect is left | *"the same over-strictness that produced the unread baseline"* |
| Let the scanner's severity rating decide what matters | *"gosec's severity is a property of the RULE, not of our code"* (gosec is the scanner) |

Reading 11 of the medium-severity findings the baseline had accepted turned up *"6 real or
decision-needing"*. One was the sign-in session cookie shipped without its `Secure` flag, the
setting that tells a browser to send a cookie only over an encrypted connection. It shipped on
every appliance and has been fixed.

Which checks block a merge is a repository setting on GitHub, not part of the workflow files.
The change in the incident below ran twelve checks, and the settings require two: the jobs that
build and test the code. The rest only report, the register check among them. The
mutation-testing check, which measures whether the tests notice deliberately broken code,
describes itself as *"ADVISORY (calibration)"*. Inside a required job, the linter's warnings print
and pass, because *"making them blockers would only get them suppressed again"*.

## What it cost

**Every finding needs a person.** Wiring the scanner in took an hour. The internal
testing-strategy record: *"reading what it finds — which is the part that produces defects — was
the day."* A verdict is also tied to the exact code it describes, so editing a flagged line resets
its row to unreviewed.

**Green stops meaning clean.** A passing register check means nothing is new and nothing is
unread. It does not mean no defects exist. So every run prints the count of each verdict instead
of `OK`, and someone has to read it.

**A required check is required by name.** Renaming a job does not rename the requirement: the old
name stops reporting, and the change waits for it. On a change that renamed a required job, *"all
twelve checks were green"* and the change was blocked. The rename was dropped, and the job's name
now *"UNDER-DESCRIBES the job on purpose"*.

## What Rasputin does not do here

The register check does not block a merge; it reports. When it fails, the change can still
merge. A report puts a problem in front of a person; a gate refuses the merge. Which checks are
required is the owner's call, not a workflow's.

## Try it

You will build a scanner, judge its findings two ways, and write a merge gate that reads a list of
required check names.

**1. Make a sandbox and a file with findings.** Paste the whole block at once:

```
mkdir gate-lab
cd gate-lab
mkdir app checks
cat > app/links.txt <<'EOF'
docs=http://example.com/help
login=http://example.com/login
icon=http://www.w3.org/2000/svg
EOF
```

`cat > app/links.txt <<'EOF'` writes every line up to `EOF` into that file.

**2. Write the scanner.** Its one rule: flag any address starting `http://`, which is unencrypted.

```
echo "grep -H 'http://' app/*" > scan.sh
sh scan.sh
```

```
app/links.txt:docs=http://example.com/help
app/links.txt:login=http://example.com/login
app/links.txt:icon=http://www.w3.org/2000/svg
```

`-H` prints the file name before each match. Three findings, one real: a login page over plain
HTTP. The help link is harmless, and the `w3.org` address is an identifier that is never fetched.

**3. Write the merge gate.** It runs every check in `checks/`, then blocks only on the names in
`required.txt`:

```
cat > merge.sh <<'EOF'
for c in checks/*.sh; do
  name=$(basename "$c" .sh)
  if sh "$c" > /dev/null; then echo "$name: pass"; else echo "$name: FAIL"; fi
done > results.txt
cat results.txt
blocked=no
while read -r req; do
  result=$(awk -v n="$req:" '$1 == n { print $2 }' results.txt)
  if [ -z "$result" ]; then
    echo "blocked: required check $req did not report"; blocked=yes
  elif [ "$result" = FAIL ]; then
    echo "blocked: required check $req failed"; blocked=yes
  fi
done < required.txt
if [ $blocked = no ]; then echo "merge allowed"; fi
EOF
echo 'test -s app/links.txt' > checks/tests.sh
echo tests > required.txt
```

`basename "$c" .sh` turns `checks/tests.sh` into `tests`. `> /dev/null` throws away what a check
prints, so the gate goes by exit status alone. `while read -r req` reads `required.txt` one name at
a time. `test -s` passes when a file is not empty; it stands in for a test suite.

**4. Judge the findings with a baseline.** One of the three findings is a real defect. Predict
what the check prints before you run it:

```
sh scan.sh > baseline.txt
cat > checks/findings.sh <<'EOF'
sh scan.sh > found.txt
awk 'NR == FNR { known[$0] = 1; next }
     !($0 in known) { print "NEW: " $0; bad = 1 }
     END { if (!bad) print "OK"; exit bad }' baseline.txt found.txt
EOF
sh checks/findings.sh
sh merge.sh
```

```
OK
findings: pass
tests: pass
merge allowed
```

`awk` remembers each line of `baseline.txt` (`NR == FNR` holds only for the first file), then
prints any finding it does not remember. `OK`, with an unread real defect in the file: the sentence
the register script says *"let 148 unread findings look settled"*.

**5. Switch to a register.** Every row starts unreviewed:

```
awk '{ print "unreviewed - " $0 }' baseline.txt > register.txt
cat > checks/findings.sh <<'EOF'
sh scan.sh > found.txt
awk 'NR == FNR { known[$3] = 1; next }
     !($0 in known) { print "NEW: " $0 }' register.txt found.txt > problems.txt
awk '$1 == "unreviewed" { print "UNREVIEWED: " $3 }
     $1 == "real" && $2 == "-" { print "REAL, NO ISSUE: " $3 }' register.txt >> problems.txt
cat problems.txt
awk '{ n[$1]++ } END { printf "posture: %d real, %d false-positive, %d unreviewed\n", n["real"], n["false-positive"], n["unreviewed"] }' register.txt
[ ! -s problems.txt ]
EOF
sh checks/findings.sh
sh merge.sh
```

```
UNREVIEWED: app/links.txt:docs=http://example.com/help
UNREVIEWED: app/links.txt:login=http://example.com/login
UNREVIEWED: app/links.txt:icon=http://www.w3.org/2000/svg
posture: 0 real, 0 false-positive, 3 unreviewed
findings: FAIL
tests: pass
merge allowed
```

A register row is a verdict, an issue or `-`, and the finding. `>>` adds to a file. The last line,
`[ ! -s problems.txt ]`, fails when `problems.txt` is not empty.

The check failed, and the merge was allowed. Nothing in `findings.sh` decides that. Only
`required.txt` does, and `findings` is not in it. Rasputin's register check sits here.

**6. Review every finding.**

```
cat > register.txt <<'EOF'
false-positive - app/links.txt:docs=http://example.com/help
real issue-12 app/links.txt:login=http://example.com/login
false-positive - app/links.txt:icon=http://www.w3.org/2000/svg
EOF
sh checks/findings.sh
```

```
posture: 1 real, 2 false-positive, 0 unreviewed
```

It passes with a known defect in the file, tracked as issue 12. Mark that row `real -` and it
fails until the defect has an issue.

**7. Make it a gate, then add a finding.**

```
echo findings >> required.txt
echo 'logout=http://example.com/logout' >> app/links.txt
sh merge.sh
```

```
findings: FAIL
tests: pass
blocked: required check findings failed
```

**8. Record it, then rename the check.** Someone decides `security` is a clearer name:

```
echo 'real issue-12 app/links.txt:logout=http://example.com/logout' >> register.txt
mv checks/findings.sh checks/security.sh
sh merge.sh
```

```
security: pass
tests: pass
blocked: required check findings did not report
```

Every check passed, and the change is blocked: the gate waits for a name that no longer exists.
That is the safe direction. Skipping required names that never report would have silently
turned the gate into a report.

**9. Clean up.**

```
cd ..
rm -rf gate-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check you
typed `gate-lab`.

## Check yourself

1. In step 5, what let a failing check leave the merge allowed?
2. What breaks if someone fixes a typo in the `login=` line's path and does not touch the register?
3. You change the register check to fail whenever any `real` row exists. What happens to every
   change until the login link is fixed, including changes to unrelated files?
4. A library you depend on has a published advisory, and no fixed version exists yet. Baseline or
   register, and why?

### Answers

1. `findings` was not in `required.txt`. A check's authority lives in the list, not in the check.
2. The finding's text changes, so the check reports it as `NEW` and fails. The old verdict
   described code that no longer exists.
3. Every change is blocked, however unrelated. The record names that pressure as what produced the
   unread baseline the first time.
4. A baseline is defensible: the fix cannot ship yet, so the record holds known debt until a fixed
   version arrives. For your own code a fix is always available.

## Where to go next

- **The rename warning:** the `frontend` job's comment in Rasputin's
  [CI workflow](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/.github/workflows/ci.yml).
- **The register's rules:** the opening comment of
  [`sast-register.sh`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/scripts/sast-register.sh).
- **A baseline where it fits:** dependency advisories in
  [`vuln-scan.sh`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/scripts/vuln-scan.sh).
- **A check that only reports:**
  [`mutation-gate.yml`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/.github/workflows/mutation-gate.yml).
