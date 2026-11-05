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

Counts are exact, not presence checks: a page that loses one of two
identical links still fails. /download/'s no-releases-data fallback (two
release buttons) never renders in a normal build, so the test builds a copy of
the site without data/releases.json and checks that page too; it needs `hugo`
on PATH (or HUGO=/path/to/hugo).

Run after a production build (count.js is only included in production):
    hugo --minify && python3 test/goatcounter_events_test.py [public]
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "public")
HUGO = os.environ.get("HUGO") or shutil.which("hugo")

# count.js only uses the canonical link when it is on the host serving the page.
SITE_HOST = "rasputin.geekdojo.com"

# Every page built from baseof.html carries these footer events exactly once
# (plus the footer's partner-intake, counted per page below).
FOOTER = {"out-github-org": 1, "out-sponsors": 1}


def releases():
    with open(os.path.join(ROOT, "data", "releases.json"), encoding="utf-8") as f:
        return json.load(f)


def download_expected(data):
    """Exact event counts on /download/ for the committed data/releases.json.

    The image buttons and "Release notes" links render from the data file, so
    their counts follow it: one dl-image-* per image, one release-notes link per
    release with a releaseUrl. With the data file as committed this is
    os-releases 5, firewall-releases 3, dl-image-os 2, dl-image-firewall 1.
    """
    os_rel = data.get("os") or {}
    fw_rel = data.get("firewall") or {}
    return {
        "view-bootstrap-source": 1,
        "dl-image-os": len(os_rel.get("images") or []),
        "dl-image-firewall": len(fw_rel.get("images") or []),
        # manual-flash manifest, card manifest, dev-builds "OS",
        # "All OS releases on GitHub", + card "Release notes"
        "out-github-os-releases": 4 + (1 if os_rel.get("releaseUrl") else 0),
        # card manifest, dev-builds "firewall", + card "Release notes"
        "out-github-firewall-releases": 2 + (1 if fw_rel.get("releaseUrl") else 0),
        "partner-intake": 1,        # footer only; the page's own partner button is /#partners
        "kit-submit": 0,
        **FOOTER,
    }


# Built page -> exact count of each event on it. An event not listed must not
# appear on that page.
def expected():
    return {
        "index.html": {
            "partner-intake": 2,    # partners section + footer
            "kit-submit": 1,        # email form
            **FOOTER,
        },
        "download/index.html": download_expected(releases()),
        "thanks/index.html": {
            "partner-intake": 2,    # "Become a design partner." + footer
            **FOOTER,
        },
    }


# The event names this site uses (design §4). A typo in a template shows up here.
KNOWN = {
    "out-github-org", "out-sponsors", "partner-intake", "kit-submit",
    "view-bootstrap-source", "dl-image-os", "dl-image-firewall",
    "out-github-os-releases", "out-github-firewall-releases",
}

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


def counts(html):
    c = {}
    for e in events(html):
        c[e] = c.get(e, 0) + 1
    return c


def html_pages(public):
    for dirpath, _, files in os.walk(public):
        for name in files:
            if name.endswith(".html"):
                path = os.path.join(dirpath, name)
                with open(path, encoding="utf-8") as f:
                    yield os.path.relpath(path, public), f.read()


def check_counts(label, got, want):
    for ev in sorted(set(want) | set(got)):
        n, w = got.get(ev, 0), want.get(ev, 0)
        check("%s: %s ×%d" % (label, ev, w), n == w, "found %d" % n)


def test_event_counts():
    for page, want in expected().items():
        path = os.path.join(PUBLIC, page)
        check("%s is built" % page, os.path.exists(path))
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                check_counts(page, counts(f.read()), want)


def test_footer_everywhere():
    """Every page with the site footer carries its events exactly once."""
    bad = []
    pages = 0
    for rel, html in html_pages(PUBLIC):
        if 'class=site-foot' not in html and 'class="site-foot"' not in html:
            continue
        pages += 1
        c = counts(html)
        if any(c.get(ev, 0) != n for ev, n in FOOTER.items()) or c.get("partner-intake", 0) < 1:
            bad.append(rel)
    check("footer pages found", pages > 0)
    check("footer events on all %d footer pages" % pages, not bad, ", ".join(bad[:10]))


def test_no_unknown_events():
    seen = set()
    for _, html in html_pages(PUBLIC):
        seen.update(events(html))
    unknown = sorted(seen - KNOWN)
    check("no event name outside the design's list", not unknown, ", ".join(unknown))


def test_canonical_paths():
    """Every page that loads count.js has a canonical link on SITE_HOST with no query."""
    counted = 0
    bad = []
    for rel, html in html_pages(PUBLIC):
        if "gc.zgo.at/count.js" not in html:
            continue
        counted += 1
        m = CANON_RE.search(html)
        href = None
        if m:
            h = HREF_RE.search(m.group(0))
            href = h and (h.group(1) or h.group(2))
        u = urlsplit(href or "")
        host = (u.hostname or "").removeprefix("www.")
        if not href or host != SITE_HOST or u.query or u.fragment or "?" in href:
            bad.append("%s (%r)" % (rel, href))
    check("count.js is in the production build", counted > 0,
          "no page loads count.js; build with `hugo --minify` (production)")
    check("all %d counted pages have a query-free canonical link on %s" % (counted, SITE_HOST),
          not bad, "; ".join(bad[:10]))


def test_no_path_override():
    """No page overrides count.js's path, which would bypass the canonical link."""
    bad = [rel for rel, html in html_pages(PUBLIC)
           if "data-goatcounter-settings" in html or "window.goatcounter" in html]
    check("no count.js path override on any page", not bad, ", ".join(bad[:10]))


def test_download_fallback():
    """The no-releases-data branch of download.html (its two release buttons).

    That branch only renders when data/releases.json is missing, so the normal
    build above never contains it. Build a copy of the site without the data
    file and check the fallback page.
    """
    if not HUGO:
        check("hugo available for the fallback build (set HUGO or put hugo on PATH)", False)
        return
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "site")
        shutil.copytree(ROOT, src, ignore=shutil.ignore_patterns(
            ".git", "public", "resources", ".hugo_build.lock", "node_modules"))
        os.remove(os.path.join(src, "data", "releases.json"))
        out = os.path.join(tmp, "public")
        r = subprocess.run([HUGO, "--minify", "--quiet", "--enableGitInfo=false",
                            "--source", src, "--destination", out],
                           capture_output=True, text=True)
        check("fallback build (no data/releases.json) succeeds", r.returncode == 0,
              (r.stdout + r.stderr).strip()[-500:])
        if r.returncode != 0:
            return
        with open(os.path.join(out, "download", "index.html"), encoding="utf-8") as f:
            html = f.read()
        check("fallback download page renders the release buttons",
              "Rasputin OS releases" in html and "Firewall releases" in html)
        check_counts("download/index.html (no releases data)", counts(html), {
            "view-bootstrap-source": 1,
            # fallback "Rasputin OS releases" button, manual-flash manifest,
            # dev-builds "OS", "All OS releases on GitHub"
            "out-github-os-releases": 4,
            # fallback "Firewall releases" button, dev-builds "firewall"
            "out-github-firewall-releases": 2,
            "partner-intake": 1,
            **FOOTER,
        })


if __name__ == "__main__":
    if not os.path.isdir(PUBLIC):
        print("no built site at %s; run `hugo --minify` first" % PUBLIC)
        sys.exit(2)
    test_event_counts()
    test_footer_everywhere()
    test_no_unknown_events()
    test_canonical_paths()
    test_no_path_override()
    test_download_fallback()
    print()
    if failures:
        print("FAILED (%d): %s" % (len(failures), ", ".join(failures)))
        sys.exit(1)
    print("all GoatCounter funnel checks passed")
