#!/usr/bin/env bash
# List every docs page and lesson written for a Rasputin release that is too
# old compared with the current stable release. The comparison half of
# .github/workflows/docs-freshness.yml, kept here so it runs the same way on a
# laptop as in Actions.
#
# Usage:   scripts/docs-freshness.sh <current-stable>
# Example: scripts/docs-freshness.sh 2026.08.5
#          scripts/docs-freshness.sh "$(gh api repos/geekdojo/rasputin-os/releases/latest -q .tag_name)"
#
# Where the stamps live:
#   - a docs page: `applies-to:` in its own front matter (content/docs/**/*.md)
#   - a lesson:    `applies-to:` in its entry in data/learn.yaml (a lesson page's
#                  front matter holds only `lesson: <topic>.<level>`)
#
# What counts as stale: the page's CalVer MINOR (YYYY.MM — the micro is
# ignored) is MINORS_BEHIND or more months older than the stable release's
# minor. Default 2, so a page one minor behind is never reported: when a new
# minor is cut, every page in the tree is one behind the same day, and a canary
# that fires on that trains everyone to ignore it. `applies-to: "evergreen"` is
# never reported. A missing or unreadable stamp IS reported, because a page the
# canary cannot read is a page it would otherwise skip forever (the Hugo build
# guards should make that impossible; this is the second line).
#
# Output: one markdown bullet per page to report, worst first. No output means
# nothing is stale. Exit 0 whenever it could judge; exit 2 if the stable
# version given is not CalVer, so the caller can skip rather than false-alarm.
set -euo pipefail
cd "$(dirname "$0")/.."

stable="${1:-}"
threshold="${MINORS_BEHIND:-2}"

if [[ ! "$stable" =~ ^([0-9]{4})\.([0-9]{2})(\.[0-9]+)?$ ]]; then
  echo "docs-freshness: current stable '${stable}' is not a CalVer release (YYYY.MM.MICRO)" >&2
  exit 2
fi
stable_minor="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
stable_index=$(( 10#${BASH_REMATCH[1]} * 12 + 10#${BASH_REMATCH[2]} ))

# "<path><TAB><stamp>" for every docs page and every lesson.
stamps() {
  find content/docs -name '*.md' ! -name '_index.md' | sort | while read -r page; do
    # The first `applies-to:` inside the front matter (between the first two
    # `---` lines), with surrounding quotes stripped. Empty if absent.
    stamp=$(awk '
      NR == 1 && $0 == "---" { in_fm = 1; next }
      in_fm && $0 == "---"   { exit }
      in_fm && /^applies-to:/ {
        sub(/^applies-to:[ \t]*/, ""); gsub(/["\047]/, ""); sub(/[ \t]+$/, "")
        print; exit
      }' "$page")
    printf '%s\t%s\n' "$page" "$stamp"
  done

  # Lesson entries in data/learn.yaml: within `lessons:`, each `- id:` starts an
  # entry and its `applies-to:` belongs to it. learn-guard.html guarantees the
  # page for id <topic>.<level> is content/learn/<topic>/<level>.md.
  awk '
    function flush() {
      if (id != "") { split(id, p, "."); printf "content/learn/%s/%s.md\t%s\n", p[1], p[2], stamp }
      id = ""; stamp = ""
    }
    /^[^ \t#]/ { flush(); in_lessons = ($0 ~ /^lessons:/); next }
    in_lessons && /^[ \t]*- id:/ {
      flush(); id = $0; sub(/^[ \t]*- id:[ \t]*/, "", id); gsub(/["\047]/, "", id); sub(/[ \t]+$/, "", id); next
    }
    in_lessons && id != "" && /^[ \t]+applies-to:/ {
      stamp = $0; sub(/^[ \t]+applies-to:[ \t]*/, "", stamp); gsub(/["\047]/, "", stamp); sub(/[ \t]+$/, "", stamp)
    }
    END { flush() }' data/learn.yaml
}

# "<sort key><TAB><bullet>"; the key puts unreadable stamps first, then the
# furthest behind.
stamps | while IFS=$'\t' read -r page stamp; do
  if [ "$stamp" = "evergreen" ]; then
    continue
  elif [[ "$stamp" =~ ^([0-9]{4})\.([0-9]{2})(\.[0-9]+)?$ ]]; then
    behind=$(( stable_index - (10#${BASH_REMATCH[1]} * 12 + 10#${BASH_REMATCH[2]}) ))
    if [ "$behind" -ge "$threshold" ]; then
      printf '%s\t- `%s` — applies-to `%s`, %s minors behind stable `%s`\n' \
        "$behind" "$page" "$stamp" "$behind" "$stable_minor"
    fi
  else
    printf '%s\t- `%s` — applies-to is missing or unreadable (`%s`)\n' 99999 "$page" "${stamp:-none}"
  fi
done | sort -t$'\t' -k1,1nr -k2,2 | cut -f2-
