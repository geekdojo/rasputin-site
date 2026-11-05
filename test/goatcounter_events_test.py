#!/usr/bin/env python3
"""Checks that the built site still carries its GoatCounter funnel events.

Why this file exists. The post-click funnel (geekdojo-brain
projects/rasputin/marketing/post-click-funnel-measurement.md) is measured with
`data-goatcounter-click` attributes, which count.js binds on its own, so the
site ships no JavaScript of its own for it. An attribute dropped in a template
edit is not an error anywhere: the page still renders, and the funnel step just
reads zero from then on. Only a check on the built HTML catches that.

It also pins the property that keeps ad visits in one row. count.js counts the
page at the path of `<link rel="canonical">` when that link is on the same
host, and sends the query string separately for campaign and ref capture. So a
canonical link with no query string is what keeps `/?rdt_cid=…` from becoming
its own path. If a page loses its canonical link, or the link picks up a query,
click IDs fragment the page again.

Run after a production build (count.js is only included in production):
    hugo --minify && python3 test/goatcounter_events_test.py [public]
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "public")

# Built page -> events it must carry. Every event in the design's event list
# appears at least once.
EXPECTED = {
    "index.html": [
        "out-github-org",           # footer GitHub
        "out-sponsors",             # footer Sponsor
        "partner-intake",           # footer + partners section
        "kit-submit",               # email form
    ],
    "download/index.html": [
        "view-bootstrap-source",
        "dl-image-os",
        "dl-image-firewall",
        "out-github-os-releases",
        "out-github-firewall-releases",
        "out-github-org",
        "out-sponsors",
        "partner-intake",
    ],
    "thanks/index.html": [
        "partner-intake",
    ],
}

# The event names this site uses. A typo in a template shows up here.
KNOWN = {e for evs in EXPECTED.values() for e in evs}

failures = []


def check(label, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + label + (("  — " + detail) if detail and not ok else ""))
    if not ok:
        failures.append(label)


# Minified HTML drops attribute quotes where it can, so match both forms.
EVENT_RE = re.compile(r'data-goatcounter-click=(?:"([^"]*)"|([^\s>]+))')
CANON_RE = re.compile(r'<link\b[^>]*\brel=(?:"canonical"|canonical)[^>]*>')
HREF_RE = re.compile(r'\bhref=(?:"([^"]*)"|([^\s>]+))')


def events(html):
    return [a or b for a, b in EVENT_RE.findall(html)]


def read(rel):
    with open(os.path.join(PUBLIC, rel), encoding="utf-8") as f:
        return f.read()


def test_events():
    for page, want in EXPECTED.items():
        path = os.path.join(PUBLIC, page)
        check("%s is built" % page, os.path.exists(path))
        if not os.path.exists(path):
            continue
        got = events(read(page))
        for ev in want:
            check("%s carries %s" % (page, ev), ev in got)


def test_no_unknown_events():
    seen = set()
    for dirpath, _, files in os.walk(PUBLIC):
        for name in files:
            if name.endswith(".html"):
                with open(os.path.join(dirpath, name), encoding="utf-8") as f:
                    seen.update(events(f.read()))
    unknown = sorted(seen - KNOWN)
    check("no event name outside the design's list", not unknown, ", ".join(unknown))


def test_canonical_paths():
    """Every page that loads count.js has a same-site canonical link with no query."""
    counted = bad = 0
    for dirpath, _, files in os.walk(PUBLIC):
        for name in files:
            if not name.endswith(".html"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), PUBLIC)
            with open(os.path.join(dirpath, name), encoding="utf-8") as f:
                html = f.read()
            if "gc.zgo.at/count.js" not in html:
                continue
            counted += 1
            m = CANON_RE.search(html)
            href = None
            if m:
                h = HREF_RE.search(m.group(0))
                href = h and (h.group(1) or h.group(2))
            if not href or "?" in href or "#" in href:
                bad += 1
                check("%s has a canonical link with no query" % rel, False, repr(href))
    check("count.js is in the production build", counted > 0,
          "no page loads count.js; build with `hugo --minify` (production)")
    check("all %d counted pages have a query-free canonical link" % counted, bad == 0)


def test_no_path_override():
    """No page overrides count.js's path, which would bypass the canonical link."""
    html = read("index.html")
    check("no data-goatcounter-settings override", "data-goatcounter-settings" not in html)
    check("no window.goatcounter override", "window.goatcounter" not in html)


if __name__ == "__main__":
    if not os.path.isdir(PUBLIC):
        print("no built site at %s; run `hugo --minify` first" % PUBLIC)
        sys.exit(2)
    test_events()
    test_no_unknown_events()
    test_canonical_paths()
    test_no_path_override()
    print()
    if failures:
        print("FAILED (%d): %s" % (len(failures), ", ".join(failures)))
        sys.exit(1)
    print("all GoatCounter funnel checks passed")
