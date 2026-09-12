#!/usr/bin/env node
// Screenshot-staleness check — the logic behind .github/workflows/screenshot-freshness.yml.
//
// WHAT IT DOES. For every screenshot in static/img/ui/, it asks one question:
// has the UI source for the route that image depicts changed since the image
// was committed here? "Committed" means when the image's current bytes first
// entered this repo, so restoring an old capture does not reset its age. The UI
// source is read from the control plane (geekdojo/rasputin-control-plane) at
// its LATEST STABLE release tag, because the site documents stable, not main.
//
// WHAT IT CANNOT DO — read this before trusting a green run or a red one:
//   * It notices that a route's CODE changed after its screenshot. It cannot
//     tell whether that change is VISIBLE in the image: a refactor or a type
//     fix marks a shot stale while the picture is still right.
//   * It only sees the route's own files (see ROUTE SOURCE below). A change in
//     a shared component under ui/components/ or ui/lib/ (the dashboard's
//     NodeGrid, for example) is invisible to it, so a clean run does not prove
//     a picture is current.
//   * It cannot recapture anything, and must never try: the UI is passkey-gated
//     by design, so capture needs a human (tools/screenshots/capture.mjs --login).
//   * It does not check whether a caption is still true. It only lists which
//     stale images carry a caption or alt text on the landing page.
//
// THE MAPPING. Which image shows which route comes from the SHOTS map in
// tools/screenshots/capture.mjs — the capture tool's own table, so there is no
// second copy to drift. The object literal is extracted from that file and
// evaluated in an empty sandbox (its hook functions are never called).
//
// ROUTE SOURCE. A route like /firewall/rules resolves to the ui/app/ directory
// whose path, with Next.js route groups such as (authed) stripped, is
// firewall/rules and which holds a page.tsx. Its source is every file in that
// directory — descending into subdirectories that are not routes of their own —
// plus the layout.tsx / template.tsx of each ancestor directory, since those
// render around the page (the side nav, the firewall tab bar).
//
// FAILING LOUDLY. If the mapping cannot be read, yields suspiciously few routes,
// the control-plane repo or its stable tag cannot be read, or the checkout is
// shallow (every image would share one date), the result is `broken` — never
// `clean`. A check that passes when it cannot see is the failure this exists for.
//
// Output: writes status (clean | stale | broken), title and body.md into
// $OUT_DIR, and logs a summary to stdout. Exit code is 0 whenever those files
// were written; the workflow decides what a status means.
//
// Env:
//   OUT_DIR        where to write status/title/body.md (default: <os tmpdir>/screenshot-freshness)
//   CP_REPO        control-plane repo (default: geekdojo/rasputin-control-plane)
//   MIN_ROUTES     fewest distinct routes the mapping may yield before the check
//                  calls itself broken (default: 6 — the landing page's marketing
//                  set alone is six distinct routes)
//   SHOT_DATE_OVERRIDES
//                  TEST HOOK ONLY, never set in the workflow: comma-separated
//                  name=ISO-date pairs that replace an image's first-committed
//                  date, e.g. dashboard=2026-07-18T00:00:00Z, to prove the
//                  stale path without rewriting git history.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(process.cwd());
const OUT_DIR = resolve(process.env.OUT_DIR || join(tmpdir(), 'screenshot-freshness'));
const CP_REPO = process.env.CP_REPO || 'geekdojo/rasputin-control-plane';
const MIN_ROUTES = Number(process.env.MIN_ROUTES || 6);
const CAPTURE = 'tools/screenshots/capture.mjs';
const IMG_DIR = 'static/img/ui';
const HOME = 'layouts/home.html';
const MARKER = '<!-- screenshot-freshness -->';

class Broken extends Error {}

function sh(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ghApi(path) {
  let out;
  try {
    out = sh('gh', ['api', path]);
  } catch (e) {
    const why = (e.stderr || e.message || '').toString().split('\n')[0];
    throw new Broken(`cannot read \`${path}\` from the GitHub API: ${why}`);
  }
  try {
    return JSON.parse(out);
  } catch {
    throw new Broken(`\`${path}\` did not return JSON`);
  }
}

// --- 1. the image -> route mapping, from capture.mjs ------------------------
function readShots() {
  if (!existsSync(join(ROOT, CAPTURE))) throw new Broken(`\`${CAPTURE}\` does not exist`);
  const src = readFileSync(join(ROOT, CAPTURE), 'utf8');
  const start = src.search(/^const SHOTS = \{$/m);
  if (start < 0) throw new Broken(`no \`const SHOTS = {\` line in \`${CAPTURE}\``);
  const bodyStart = src.indexOf('{', start);
  const end = src.indexOf('\n};', bodyStart);
  if (end < 0) throw new Broken(`the SHOTS literal in \`${CAPTURE}\` has no closing \`};\` line`);
  let shots;
  try {
    // An empty context: the hook functions reference page/tryClick, but they are
    // only defined here, never called, so nothing outside the literal runs.
    shots = vm.runInNewContext(`(${src.slice(bodyStart, end + 2)})`, {}, { timeout: 1000 });
  } catch (e) {
    throw new Broken(`the SHOTS literal in \`${CAPTURE}\` does not evaluate: ${e.message}`);
  }
  if (!shots || typeof shots !== 'object') throw new Broken(`SHOTS in \`${CAPTURE}\` is not an object`);
  const entries = Object.entries(shots);
  for (const [name, s] of entries) {
    if (!s || typeof s.path !== 'string' || !s.path.startsWith('/')) {
      throw new Broken(`SHOTS entry \`${name}\` has no string \`path\` starting with /`);
    }
  }
  const routes = new Set(entries.map(([, s]) => s.path.split('?')[0]));
  if (routes.size < MIN_ROUTES) {
    throw new Broken(
      `SHOTS in \`${CAPTURE}\` yielded ${routes.size} distinct route(s) (${entries.length} shot(s)), below the floor of ${MIN_ROUTES} — the extraction is probably wrong`,
    );
  }
  return Object.fromEntries(entries.map(([name, s]) => [name, s.path.split('?')[0]]));
}

// --- 2. captions and alt text on the landing page ---------------------------
function readClaims() {
  const html = readFileSync(join(ROOT, HOME), 'utf8');
  const refs = (html.match(/img\/ui\/[\w.-]+\.png/g) || []).length;
  const claims = {};
  for (const m of html.matchAll(/partial "shot\.html" \(dict([\s\S]*?)\) \}\}/g)) {
    const field = (k) => (m[1].match(new RegExp(`"${k}"\\s+"([^"]*)"`)) || [])[1];
    const file = (field('src') || '').match(/img\/ui\/([\w.-]+)\.png$/);
    if (file) claims[file[1]] = { alt: field('alt'), caption: field('caption') };
  }
  if (Object.keys(claims).length !== refs) {
    throw new Broken(
      `\`${HOME}\` references ${refs} image(s) under img/ui/ but only ${Object.keys(claims).length} parsed as shot.html partials — caption-bearing images would go unlisted`,
    );
  }
  return claims;
}

// --- 3. when each image's current bytes were first committed here -----------------------------
function imageDates(names, overrides) {
  if (sh('git', ['rev-parse', '--is-shallow-repository']) !== 'false') {
    throw new Broken('the rasputin-site checkout is shallow, so image commit dates are meaningless (checkout needs fetch-depth: 0)');
  }
  // The date that matters is when these exact BYTES entered the repo, not the
  // newest commit touching the path: restoring an old capture byte-for-byte
  // (as happened to the hero on 2026-09-12) makes a fresh commit of old pixels.
  // So walk the path's whole history and take the oldest commit whose blob is
  // identical to the one at HEAD, even if other bytes came in between.
  const dates = {};
  for (const name of names) {
    const file = `${IMG_DIR}/${name}.png`;
    const history = sh('git', ['log', '--format=%H %cI', '--', file]).split('\n').filter(Boolean);
    if (!history.length) continue; // present on disk but never committed; reported as unverifiable
    const blobAt = (commit) => { try { return sh('git', ['rev-parse', `${commit}:${file}`]); } catch { return null; } };
    const head = blobAt(history[0].split(' ')[0]);
    let first = null;
    for (const entry of history) {
      const [commit, date] = entry.split(' ');
      if (blobAt(commit) === head) first = { date, sha: commit.slice(0, 7) };
    }
    const last = history[0].split(' ');
    dates[name] = { ...first, lastCommitted: last[1], lastSha: last[0].slice(0, 7) };
  }
  for (const [name, date] of Object.entries(overrides)) {
    if (!dates[name]) throw new Broken(`SHOT_DATE_OVERRIDES names \`${name}\`, which has no committed image`);
    dates[name] = { ...dates[name], date: new Date(date).toISOString(), sha: 'OVERRIDDEN' };
  }
  return dates;
}

// --- 4. the control plane at its latest stable tag --------------------------
function readControlPlane() {
  const rel = ghApi(`repos/${CP_REPO}/releases/latest`);
  if (!rel.tag_name) throw new Broken(`\`${CP_REPO}\` has no latest stable release`);
  const tree = ghApi(`repos/${CP_REPO}/git/trees/${encodeURIComponent(rel.tag_name)}?recursive=1`);
  if (tree.truncated) throw new Broken(`the git tree of \`${CP_REPO}@${rel.tag_name}\` came back truncated`);
  const files = (tree.tree || []).filter((t) => t.type === 'blob' && t.path.startsWith('ui/app/')).map((t) => t.path);
  const pageDirs = files.filter((f) => /\/page\.tsx$/.test(f)).map((f) => f.slice(0, -'/page.tsx'.length));
  if (pageDirs.length < MIN_ROUTES) {
    throw new Broken(`\`${CP_REPO}@${rel.tag_name}\` has only ${pageDirs.length} page.tsx file(s) under ui/app/ — the UI moved or the tree read failed`);
  }
  return { tag: rel.tag_name, files, pageDirs };
}

const routeOf = (dir) => '/' + dir.replace(/^ui\/app\/?/, '').split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/');

function routeSources(route, cp) {
  const dirs = cp.pageDirs.filter((d) => routeOf(d) === route);
  if (dirs.length !== 1) return { error: dirs.length ? `route resolves to ${dirs.length} directories` : `no page.tsx for this route at ${cp.tag}` };
  const dir = dirs[0];
  const otherRoutes = cp.pageDirs.filter((d) => d !== dir && d.startsWith(dir + '/'));
  const own = cp.files.filter((f) => f.startsWith(dir + '/') && !otherRoutes.some((o) => f.startsWith(o + '/')));
  const ancestors = [];
  const parts = dir.split('/');
  for (let i = 2; i < parts.length; i++) {
    const anc = parts.slice(0, i).join('/');
    for (const special of ['layout.tsx', 'template.tsx']) {
      if (cp.files.includes(`${anc}/${special}`)) ancestors.push(`${anc}/${special}`);
    }
  }
  return { dir, sources: [...own, ...ancestors] };
}

const newestCache = new Map();
function newestCommit(file, tag) {
  if (!newestCache.has(file)) {
    const list = ghApi(`repos/${CP_REPO}/commits?sha=${encodeURIComponent(tag)}&path=${encodeURIComponent(file)}&per_page=1`);
    if (!Array.isArray(list) || !list.length) throw new Broken(`no commit history for \`${file}\` at \`${tag}\``);
    const c = list[0];
    newestCache.set(file, {
      sha: c.sha,
      date: c.commit.committer.date,
      subject: c.commit.message.split('\n')[0],
      url: c.html_url,
      file,
    });
  }
  return newestCache.get(file);
}

// --- 5. evaluate ------------------------------------------------------------
function evaluate() {
  const overrides = Object.fromEntries(
    (process.env.SHOT_DATE_OVERRIDES || '').split(',').filter(Boolean).map((kv) => kv.split('=')),
  );
  const shots = readShots();
  const claims = readClaims();
  const images = readdirSync(join(ROOT, IMG_DIR)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
  if (!images.length) throw new Broken(`\`${IMG_DIR}\` holds no images`);
  for (const name of Object.keys(claims)) {
    if (!shots[name]) throw new Broken(`the landing page shows \`${name}.png\` but capture.mjs has no SHOTS entry for it`);
  }
  const dates = imageDates(images, overrides);
  const cp = readControlPlane();

  const stale = [];
  const fresh = [];
  const unverifiable = [];
  for (const name of images.sort()) {
    const route = shots[name];
    if (!route) { unverifiable.push({ name, why: `no SHOTS entry in \`${CAPTURE}\`, so its route is unknown` }); continue; }
    if (!dates[name]) { unverifiable.push({ name, why: 'the image has never been committed' }); continue; }
    const r = routeSources(route, cp);
    if (r.error) { unverifiable.push({ name, route, why: r.error }); continue; }
    const byDate = (list) => list.map((f) => newestCommit(f, cp.tag)).sort((a, b) => b.date.localeCompare(a.date))[0];
    const newest = byDate(r.sources);
    // The ancestor layouts often dominate, so also name the newest commit to
    // the route's own directory: that is usually the one worth reading.
    const ownNewest = byDate(r.sources.filter((f) => f.startsWith(r.dir + '/')));
    const row = { name, route, dir: r.dir, image: dates[name], newest, ownNewest, claims: claims[name] };
    (new Date(newest.date) > new Date(dates[name].date) ? stale : fresh).push(row);
  }
  for (const name of Object.keys(shots)) {
    if (!images.includes(name)) unverifiable.push({ name, route: shots[name], why: `a SHOTS entry with no \`${IMG_DIR}/${name}.png\` — never captured` });
  }
  return { cp, stale, fresh, unverifiable, total: images.length };
}

// --- 6. render --------------------------------------------------------------
const day = (iso) => iso.slice(0, 10);
const ageDays = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const CP_URL = `https://github.com/${CP_REPO}`;

function renderFindings({ cp, stale, fresh, unverifiable, total }) {
  const L = [MARKER, ''];
  L.push(
    `Compared ${total} screenshot(s) in \`${IMG_DIR}/\` against the UI source of \`${CP_REPO}\` at its latest stable release **\`${cp.tag}\`**. A screenshot is listed as stale when a commit reachable from that tag touched its route's UI source after the image's current bytes were first committed here (restoring an old capture does not reset its age).`,
    '',
    '> **What this can and cannot tell you.** It notices that a route\'s code changed after its screenshot. It cannot tell whether that change is visible — a refactor may change nothing on screen — and it does not see shared components under `ui/components/` or `ui/lib/`. Read the commit, then decide. It cannot recapture anything: the UI is passkey-gated, so that needs a human.',
    '',
  );
  if (stale.length) {
    L.push(`## Stale (${stale.length})`, '', '| image | route | these bytes first committed | newest UI commit at `' + cp.tag + '` |', '|---|---|---|---|');
    for (const s of stale) {
      L.push(
        `| \`${s.name}.png\` | \`${s.route}\` | ${day(s.image.date)} (\`${s.image.sha}\`, ${ageDays(s.image.date)}d ago)${s.image.lastSha && s.image.lastSha !== s.image.sha ? `; same bytes re-committed ${day(s.image.lastCommitted)} (\`${s.image.lastSha}\`)` : ''} | ${day(s.newest.date)} [\`${s.newest.sha.slice(0, 7)}\`](${s.newest.url}) ${s.newest.subject.replace(/\|/g, '\\|')} — \`${s.newest.file}\`${s.ownNewest && s.ownNewest.sha !== s.newest.sha ? `<br>route's own directory: ${day(s.ownNewest.date)} [\`${s.ownNewest.sha.slice(0, 7)}\`](${s.ownNewest.url}) ${s.ownNewest.subject.replace(/\|/g, '\\|')}` : ''} |`,
      );
    }
    L.push('');
    const withClaims = stale.filter((s) => s.claims);
    if (withClaims.length) {
      L.push(`## Caption-bearing images (${withClaims.length}) — check the claim, not just the pixels`, '');
      L.push('`layouts/home.html` pairs these stale images with a caption and alt text. After recapturing, **check the new image still makes that text true** — a refreshed image can turn a true caption false (the hero claims a 24-node rack; a capture from a smaller bench contradicts it). Fix the image or the text before merging.', '');
      for (const s of withClaims) {
        L.push(`- \`${s.name}.png\``);
        if (s.claims.caption) L.push(`  - caption: "${s.claims.caption}"`);
        if (s.claims.alt) L.push(`  - alt: "${s.claims.alt}"`);
      }
      L.push('');
    }
  }
  if (unverifiable.length) {
    L.push(`## Could not evaluate (${unverifiable.length})`, '', 'These keep this issue open: an image the check cannot map is an image nobody is watching.', '');
    for (const u of unverifiable) L.push(`- \`${u.name}.png\`${u.route ? ` (\`${u.route}\`)` : ''}: ${u.why}`);
    L.push('');
  }
  if (stale.length) {
    L.push(
      '## Recapture',
      '',
      'Capture on the bench by default; the production rack only by Bryce\'s explicit decision — which a caption-bearing image above may need, since its text names the cluster. `<cluster>` is the target cluster\'s mDNS name (for example `e12bench`); resolve it fresh each time, never reuse an IP:',
      '',
      '```sh',
      'cd tools/screenshots',
      'npm ci                                   # installs playwright; needs Google Chrome installed',
      'export RASPUTIN_URL=https://<cluster>.local',
      'node capture.mjs --login                 # opens Chrome; touch your passkey once',
      `node capture.mjs ${stale.map((s) => s.name).join(' ')}`,
      '```',
      '',
      'Then open one PR with the new PNGs. This issue closes itself on the next run once nothing is stale.',
      '',
    );
  }
  L.push(`<details><summary>Current (${fresh.length})</summary>`, '');
  for (const f of fresh) L.push(`- \`${f.name}.png\` (\`${f.route}\`): image ${day(f.image.date)}, newest UI commit ${day(f.newest.date)}`);
  L.push('', '</details>');
  return L.join('\n');
}

function renderBroken(why) {
  return [
    MARKER,
    '',
    '## The screenshot-freshness check is broken — it cannot see',
    '',
    `**${why}**`,
    '',
    'This is **not** a clean result. The check stopped before it could judge any screenshot, so treat every image as unverified until the next run completes. Fix the cause (the mapping lives in `tools/screenshots/capture.mjs` → `SHOTS`; the logic in `scripts/screenshot-freshness.mjs`) and re-run:',
    '',
    '```sh',
    'gh workflow run screenshot-freshness.yml --repo geekdojo/rasputin-site',
    '```',
  ].join('\n');
}

// --- main -------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
let status;
let title;
let body;
try {
  const result = evaluate();
  const open = result.stale.length + result.unverifiable.length;
  if (!open) {
    status = 'clean';
    title = 'Screenshots current';
    body = renderFindings(result);
  } else {
    status = 'stale';
    const oldest = result.stale.map((s) => ageDays(s.image.date)).sort((a, b) => b - a)[0];
    title = result.stale.length
      ? `Screenshots stale: ${result.stale.length} of ${result.total} behind the UI at ${result.cp.tag} (oldest ${oldest}d)`
      : `Screenshots: ${result.unverifiable.length} image(s) the freshness check cannot evaluate`;
    body = renderFindings(result);
  }
  console.log(`${status}: ${result.stale.length} stale, ${result.fresh.length} current, ${result.unverifiable.length} unverifiable (control plane ${result.cp.tag})`);
  for (const s of result.stale) console.log(`  STALE ${s.name}.png ${s.route}: image ${s.image.date} < ${s.newest.date} ${s.newest.sha.slice(0, 7)} ${s.newest.file} "${s.newest.subject}"`);
  for (const u of result.unverifiable) console.log(`  UNVERIFIABLE ${u.name}.png: ${u.why}`);
} catch (e) {
  const why = e instanceof Broken ? e.message : `unexpected error: ${e.stack || e.message}`;
  status = 'broken';
  title = 'Screenshot-freshness check is BROKEN — it cannot see';
  body = renderBroken(why);
  console.log(`broken: ${why}`);
}
writeFileSync(join(OUT_DIR, 'status'), status + '\n');
writeFileSync(join(OUT_DIR, 'title'), title + '\n');
writeFileSync(join(OUT_DIR, 'body.md'), body + '\n');
