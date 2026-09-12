#!/usr/bin/env node
// UI-label drift check — the logic behind .github/workflows/ui-strings-freshness.yml.
//
// WHAT IT DOES. The manual (content/docs/) quotes the UI's own words in inline
// code spans: `DEPLOY APP`, `NODE CONTROLS`, `CHECK FOR UPDATES`. This reads
// every such span, keeps the ones that look like UI copy (see THE FILTER), and
// asks one question of each: does the control plane's UI code, at its LATEST
// STABLE release tag, still contain that text anywhere? A quoted label that no
// longer appears is reported with every page that quotes it.
//
// ONE DIRECTION ONLY. A UI string the manual does not quote is never a finding.
// The manual is not a label inventory; checking that direction produces
// hundreds of non-findings on day one and would be muted within a week.
//
// NO HAND-KEPT LIST. The quoted labels are derived from the prose itself, not
// from a `ui-strings:` front-matter list, because a list someone must keep in
// sync is one more thing that goes stale.
//
// THE CORPUS. geekdojo/rasputin-control-plane at its latest stable release tag,
// read as a source tarball:
//   * ui/**/*.ts(x), excluding *.test.*: every string literal, every static
//     chunk of a template literal, and every JSX text node, comments dropped.
//   * api/**/*.go, excluding *_test.go: every string literal, comments dropped.
//     The UI displays copy the api writes — the first-run setup step titles in
//     api/internal/setup/service.go, restore and backup error text, task kinds,
//     alert reasons — so a ui/-only corpus reports those as missing. All of api/
//     rather than a hand-picked package list: a list of packages is itself a
//     thing that drifts, and the cost of the width is only that a label removed
//     from the UI but still spelled somewhere in api/ goes unnoticed (weaker
//     protection, not a false alarm). At v2026.08.5, 12 checked labels are
//     found only in api/ (`Register a passkey`, `Verify PKI trust`,
//     `the archive did not pass verification`, …). agent/ is NOT read:
//     calibration needed nothing from it, and every extra tree read makes a
//     vanished label likelier to survive as an unrelated literal somewhere.
// Comments are dropped on purpose: the UI source mentions labels in comments
// ("The header's NODES ON LAN count"), and a renamed label surviving in a stale
// comment must not count as present.
//
// MATCHING. Case-insensitive substring of a single extracted string, after
// folding whitespace, HTML entities and JS escapes. Case-insensitive because the
// screen and the source disagree on case: 47 .toUpperCase() call sites and CSS
// text-transform render lowercase source as capitals. A label the manual writes
// with placeholders or runtime separators (`ENROLL <NODE-ID> IN MESH`,
// `MISSING · since …`) is checked as its literal fragments. A fragment that
// only exists once a runtime value is spliced in (`STABLE CHANNEL`, from
// `${channel.toUpperCase()} CHANNEL`) is matched exactly against the code's
// literal text around that one value (see spliceMatch).
//
// WHAT IT CANNOT DO — read this before trusting a green run or a red one:
//   * It catches a quoted label DISAPPEARING. It cannot catch a label that is
//     still there but whose behaviour changed, moved screens, or gained a step.
//   * Matching is substring-based and case-insensitive, so a SHORT or COMMON
//     word (`STOP`, `SAVE`, `NAME`) is nearly always found somewhere, even after
//     the button is gone: weak protection. At v2026.08.5, 194 of the 371 checked
//     labels (52%) are single words, 75 of them five letters or fewer, and for
//     228 (61%) every part also appears in some other string. Distinctive
//     multi-word labels (`CLAIM BACKUP TARGET`, `FINISH SETUP & CONTINUE`) are
//     what it guards well. Each issue body reports the current figures.
//   * A label assembled at runtime is checked as its literal fragments, so it
//     notices a fragment vanishing, not a reorder; the runtime value itself
//     (`STABLE` in `STABLE CHANNEL`) is not verified.
//   * It cannot see a label the manual describes in prose without quoting it in
//     a code span, and it does not read fenced code blocks.
//
// FAILING LOUDLY. If the stable tag, the tarball, or the source tree cannot be
// read, or the corpus or the manual's candidate set is implausibly small, the
// result is `broken`, never `clean`. A check that passes when it cannot see is
// the failure this exists to prevent.
//
// Output: writes status (clean | drift | broken), title and body.md into
// $OUT_DIR and logs a summary. Exit code is 0 whenever those files were written;
// the workflow decides what a status means.
//
// Env:
//   OUT_DIR       where to write status/title/body.md (default: <os tmpdir>/ui-strings-freshness)
//   CP_REPO       control-plane repo (default: geekdojo/rasputin-control-plane)
//   CP_TAG        use this tag instead of resolving the latest stable release
//   CP_DIR        read an already-extracted control-plane tree instead of
//                 downloading one (local runs; CP_TAG then only labels the report)
//   MIN_CORPUS    fewest distinct ui/ strings before the check calls itself
//                 broken (default 1500; v2026.08.5 yields 2,528)
//   MIN_API       the same floor for api/ Go strings (default 1500; v2026.08.5
//                 yields 3,757). Separate, because a blind api/ half would report
//                 every api-written label as missing while ui/ looked healthy.
//   MIN_LABELS    fewest checked labels from the manual before the check calls
//                 itself broken (default 150; the manual yields 371)
//   VERBOSE=1     also print every checked label and its fate

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT_DIR = resolve(process.env.OUT_DIR || join(tmpdir(), 'ui-strings-freshness'));
const CP_REPO = process.env.CP_REPO || 'geekdojo/rasputin-control-plane';
const MIN_CORPUS = Number(process.env.MIN_CORPUS || 1500);
const MIN_API = Number(process.env.MIN_API || 1500);
const MIN_LABELS = Number(process.env.MIN_LABELS || 150);
const DOCS = 'content/docs';
const MARKER = '<!-- ui-strings-freshness -->';

class Broken extends Error {}

// --- 1. the control plane at its latest stable tag ---------------------------
function resolveControlPlane() {
  if (process.env.CP_DIR) {
    return { tag: process.env.CP_TAG || '(local tree)', dir: resolve(process.env.CP_DIR), temp: false };
  }
  let tag = process.env.CP_TAG;
  if (!tag) {
    let rel;
    try {
      rel = JSON.parse(execFileSync('gh', ['api', `repos/${CP_REPO}/releases/latest`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (e) {
      throw new Broken(`cannot read the latest stable release of \`${CP_REPO}\`: ${(e.stderr || e.message || '').toString().split('\n')[0]}`);
    }
    tag = rel.tag_name;
    if (!tag) throw new Broken(`\`${CP_REPO}\` has no latest stable release`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'ui-strings-cp-'));
  try {
    const tgz = execFileSync('gh', ['api', `repos/${CP_REPO}/tarball/${encodeURIComponent(tag)}`], { maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    writeFileSync(join(dir, 'cp.tar.gz'), tgz);
    execFileSync('tar', ['-xzf', 'cp.tar.gz', '--strip-components=1'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw new Broken(`cannot download or unpack the source tarball of \`${CP_REPO}@${tag}\`: ${(e.stderr || e.message || '').toString().split('\n')[0]}`);
  }
  return { tag, dir, temp: true };
}

function walk(dir, keep, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, keep, out);
    else if (keep(name)) out.push(p);
  }
  return out;
}

// --- 2. extraction -----------------------------------------------------------
// A small hand-written lexer, not a parser: enough to tell code from strings,
// comments and JSX text in the UI's own house style. Its failure mode is a
// corpus that is too small or garbled, which the MIN_CORPUS floor catches.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', times: '×', bull: '•', check: '✓' };

function decodeEscapes(s) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/gs, (_, e) => {
    if (e[0] === 'u' && e[1] === '{') return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: ' ', t: ' ', r: ' ' }[e] ?? e;
  });
}
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e] ?? m);

// Fold for comparison: lower case, typographic punctuation to one spelling,
// whitespace runs to one space.
function fold(s) {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u00a0\s]+/g, ' ')
    .trim();
}

const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await']);
const JSX_KEYWORDS = new Set(['return', 'case', 'default', 'else', 'yield', 'await', 'do']);

function lexTs(src, jsx, pairs) {
  const out = [];
  let i = 0;
  const n = src.length;
  // prev significant token, for regex-vs-divide and JSX-vs-less-than decisions
  let prevChar = '';
  let prevWord = '';

  const isIdStart = (c) => /[A-Za-z_$]/.test(c);
  const isId = (c) => /[A-Za-z0-9_$]/.test(c);

  function readString(q) {
    let j = i + 1;
    let s = '';
    while (j < n && src[j] !== q) {
      if (src[j] === '\\') { s += src.slice(j, j + 2); j += 2; continue; }
      if (src[j] === '\n') break; // unterminated: bail out at the line end
      s += src[j++];
    }
    i = j + 1;
    out.push(decodeEscapes(s));
  }

  // Template literal: collect static chunks; lex ${...} as code.
  function readTemplate() {
    let j = i + 1;
    let s = '';
    const chunks = [];
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') { s += src.slice(j, j + 2); j += 2; continue; }
      if (src[j] === '$' && src[j + 1] === '{') {
        out.push(decodeEscapes(s));
        chunks.push(decodeEscapes(s));
        s = '';
        i = j + 2;
        code(true);
        j = i; // code() stops after the matching }
        continue;
      }
      s += src[j++];
    }
    out.push(decodeEscapes(s));
    chunks.push(decodeEscapes(s));
    for (let k = 0; k + 1 < chunks.length; k++) pairs.push([chunks[k], chunks[k + 1]]);
    i = j + 1;
  }

  function skipComment() {
    if (src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; return true; }
    if (src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; return true; }
    return false;
  }

  function readRegex() {
    let j = i + 1;
    let inClass = false;
    while (j < n && src[j] !== '\n') {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
      j++;
    }
    j++;
    while (j < n && /[a-z]/.test(src[j])) j++;
    i = j;
  }

  // JSX element starting at src[i] === '<'. Consumes through its end.
  function element() {
    i++; // <
    // fragment <> or tag name
    while (i < n && /[A-Za-z0-9_.$:-]/.test(src[i])) i++;
    // attributes
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (i >= n) return;
      const c = src[i];
      if (c === '/' && src[i + 1] === '>') { i += 2; return; }
      if (c === '>') { i++; break; }
      if (c === '"' || c === "'") {
        // JSX attribute strings take no escapes
        const e = src.indexOf(c, i + 1);
        out.push(decodeEntities(src.slice(i + 1, e < 0 ? n : e)));
        i = e < 0 ? n : e + 1;
        continue;
      }
      if (c === '{') { i++; code(true); continue; }
      if (c === '/' && (src[i + 1] === '*' || src[i + 1] === '/')) { skipComment(); continue; }
      i++;
    }
    children();
  }

  // Children of one element. A run like `ENROLL {id} IN MESH` is also kept
  // as a splice pair ("ENROLL ", " IN MESH") around its one expression.
  function children() {
    let text = '';
    let before = null; // text node just before the latest {expression}
    const flush = () => {
      const t = decodeEntities(text);
      if (t.trim()) out.push(t);
      if (before !== null) { pairs.push([before, t]); before = null; }
      text = '';
    };
    while (i < n) {
      const c = src[i];
      if (c === '{') {
        const t = text;
        const opened = i;
        i++;
        code(true);
        // {' '} and {/* comment */} are spacing, not a runtime value
        if (/^\{\s*(?:(['"]) *\1|\/\*[\s\S]*\*\/)\s*\}$/.test(src.slice(opened, i))) { text = t + ' '; continue; }
        text = t;
        flush();
        before = decodeEntities(t);
        continue;
      }
      if (c === '<') {
        flush();
        before = null;
        if (src[i + 1] === '/') { const e = src.indexOf('>', i); i = e < 0 ? n : e + 1; return; }
        element();
        continue;
      }
      text += c;
      i++;
    }
    flush();
  }

  // Code until an unmatched } (when nested) or end of input.
  function code(nested) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) { skipComment(); continue; }
      if (c === '"' || c === "'") { readString(c); prevChar = 'x'; prevWord = ''; continue; }
      if (c === '`') { readTemplate(); prevChar = 'x'; prevWord = ''; continue; }
      if (c === '/') {
        if (REGEX_PREV.has(prevChar) || REGEX_KEYWORDS.has(prevWord)) { readRegex(); prevChar = 'x'; prevWord = ''; continue; }
        i++; prevChar = '/'; prevWord = ''; continue;
      }
      if (jsx && c === '<' && (isIdStart(src[i + 1] || '') || src[i + 1] === '>')) {
        const exprPos = ['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '>', ''].includes(prevChar) || JSX_KEYWORDS.has(prevWord);
        if (exprPos && !(prevChar === '>' && prevWord === '')) { element(); prevChar = 'x'; prevWord = ''; continue; }
      }
      if (c === '{') { depth++; i++; prevChar = '{'; prevWord = ''; continue; }
      if (c === '}') {
        if (nested && depth === 0) { i++; return; }
        depth--; i++; prevChar = '}'; prevWord = ''; continue;
      }
      if (isIdStart(c)) {
        let j = i;
        while (j < n && isId(src[j])) j++;
        prevWord = src.slice(i, j);
        prevChar = REGEX_KEYWORDS.has(prevWord) || JSX_KEYWORDS.has(prevWord) ? '' : 'x';
        i = j;
        continue;
      }
      if (/[0-9]/.test(c)) { while (i < n && /[0-9A-Za-z_.]/.test(src[i])) i++; prevChar = 'x'; prevWord = ''; continue; }
      // `=>` is an operator, not a closing angle, for JSX-position purposes
      if (c === '=' && src[i + 1] === '>') { i += 2; prevChar = '='; prevWord = ''; continue; }
      prevChar = c === ')' || c === ']' ? 'x' : c;
      prevWord = '';
      i++;
    }
  }

  code(false);
  return out;
}

function lexGo(src, pairs) {
  const out = [];
  let last = null; // { end, text } of the previous string literal
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '`') { const e = src.indexOf('`', i + 1); out.push(src.slice(i + 1, e < 0 ? n : e)); i = e < 0 ? n : e + 1; continue; }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== '"' && src[j] !== '\n') {
        if (src[j] === '\\') { s += src.slice(j, j + 2); j += 2; continue; }
        s += src[j++];
      }
      const text = decodeEscapes(s);
      out.push(text);
      // "pulled from " + channel + " channel"
      if (last && /^\s*\+\s*[\w.()\[\]]+\s*\+\s*$/.test(src.slice(last.end, i))) pairs.push([last.text, text]);
      // "pulled from %s channel"
      const verbs = text.split(/%[-+# 0-9.*]*[a-zA-Z]/);
      for (let k = 0; k + 1 < verbs.length; k++) pairs.push([verbs[k], verbs[k + 1]]);
      i = j + 1;
      last = { end: i, text };
      continue;
    }
    if (c === "'") { // rune literal
      let j = i + 1;
      while (j < n && src[j] !== "'" && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

function buildCorpus(cpDir) {
  if (!existsSync(join(cpDir, 'ui')) || !existsSync(join(cpDir, 'api'))) {
    throw new Broken(`the control-plane tree has no \`ui/\` and \`api/\` — the layout moved or the download is empty`);
  }
  const uiFiles = walk(join(cpDir, 'ui'), (f) => /\.(tsx?|mts)$/.test(f) && !/\.test\./.test(f) && !f.endsWith('.d.ts'));
  const goFiles = walk(join(cpDir, 'api'), (f) => f.endsWith('.go') && !f.endsWith('_test.go'));
  const ui = new Set();
  const api = new Set();
  const rawPairs = [];
  for (const f of uiFiles) for (const s of lexTs(readFileSync(f, 'utf8'), f.endsWith('x'), rawPairs)) { const v = fold(s); if (v) ui.add(v); }
  for (const f of goFiles) for (const s of lexGo(readFileSync(f, 'utf8'), rawPairs)) { const v = fold(s); if (v) api.add(v); }
  // Splice pairs: the literal text either side of one runtime value. A side
  // with fewer than two letters (" · ", "") says nothing and is dropped.
  const words = (t) => (t.match(/\p{L}/gu) || []).length >= 2;
  const splices = new Map();
  for (const [a, b] of rawPairs) {
    const L = words(a) ? fold(a) : '';
    const R = words(b) ? fold(b) : '';
    if (L || R) splices.set(`${L}\n${R}`, { L, R });
  }
  if (api.size < MIN_API) {
    throw new Broken(`the api corpus has ${api.size} distinct string(s) from ${goFiles.length} api/ Go file(s), below the floor of ${MIN_API} — the extractor or the tree is broken, not the api`);
  }
  if (ui.size < MIN_CORPUS) {
    throw new Broken(`the UI corpus has ${ui.size} distinct string(s) from ${uiFiles.length} ui/ file(s), below the floor of ${MIN_CORPUS} — the extractor or the tree is broken, not the UI`);
  }
  return { ui, api, splices: [...splices.values()], uiFiles: uiFiles.length, goFiles: goFiles.length, text: [...ui, ...api].join('\n') };
}

// --- 3. the quoted labels, from the manual's prose ------------------------------
// THE FILTER. A code span in the manual is treated as a quoted UI label unless
// it is plainly something else. Every rule here was needed to make a run against
// a manual already verified against its stable tag report zero; the PR that
// introduced this file lists each false-positive class and its rule.

// Inline code spans, CommonMark-style: a run of N backticks closes on the next
// run of exactly N, and a span may wrap onto the next line (`LAN` + newline +
// `ACCESS`). Front matter and fenced code blocks (at any indent) are not prose.
function codeSpans(md) {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  const prose = body.replace(/^([ \t]*)(```+|~~~+)[\s\S]*?^[ \t]*\2[ \t]*$/gm, '');
  const spans = [];
  for (const para of prose.split(/\n[ \t]*\n/)) {
    for (const m of para.matchAll(/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g)) {
      let t = m[2].replace(/\n[ \t>]*/g, ' ');
      if (/^ .* $/.test(t) && t.trim()) t = t.slice(1, -1);
      spans.push(t);
    }
  }
  return spans;
}

// What a span is, if it is plainly not UI copy. null means "check it".
function classify(span) {
  const s = span.trim();
  const oneToken = !/\s/.test(s);
  if (/^[0-9a-f]{2}(?::[0-9a-f]{2})+$/i.test(s)) return 'fingerprint';                        // `67:7E:57:…`
  if ((s.match(/\p{L}/gu) || []).length < 2) return 'no-words';                               // `+`, `—`, `A`, `24h`, `2026.08.5`
  if (/^[-./~]/.test(s)) return 'flag-or-path';                                               // `--out`, `.raucb`, `/setup`
  if (/:\/\/|^[a-z]+:\S/.test(s)) return 'url-or-key-value';                                  // `https://…`, `tag:rasputin-node`
  if (/[_=@\\{}$|*]/.test(s)) return 'identifier-or-assignment';                              // `RASPUTIN_NODE_ID`, `KEY=value`, `CN=…`
  if (/\S\/\S/.test(s)) return 'path-or-cidr';                                                // `owner/repo`, `100.64.0.0/10`
  if (/(?:^|\s)-{1,2}[a-z]/i.test(s) || COMMANDS.has(s.split(/[\s:]/)[0])) return 'command-line'; // `xz -d …`, `docker compose down`
  if (oneToken && /\p{L}\.\p{L}/u.test(s)) return 'dotted-name';                              // `rasputin.local`, `apps.reconcile`
  if (oneToken && s === s.toLowerCase()) return 'lowercase-token';                           // `scp`, `guest`, `nvme0n1`, `<node-id>`
  if (/^[a-z-]+(?:\s*(?:\/|→)\s*[a-z-]+)+$/.test(s)) return 'value-notation';                // `online / total`, `a → b`
  return null;
}
// Commands the manual quotes inline without a flag, and whose output it quotes:
// `docker compose down`, `docker compose up: exit status 1`, `tpi uart`.
const COMMANDS = new Set(['docker', 'tpi']);

// Quoted text that is not Rasputin UI copy at all, and that no rule above can
// tell apart from a label. Each entry says what it really is. NEVER add text
// the Rasputin UI shows here to make a run go green: fix the page instead.
const NOT_UI = new Map([
  ['Work laptop', 'an example device name the reader types, not UI text'],
  ['Several supported devices found', "the Turing Pi BMC's own error, not Rasputin's"],
  ['IP address:', "the node console's login banner, not the web UI"],
  ['ROW-SLOT', 'notation for a BitScope rack position, explained in the prose'],
  ['Invalid `length` query parameter', "the Turing Pi BMC API's own error, not Rasputin's"],
]);
// Text the UI does show, but which the control plane never spells: it arrives
// as data from another repo. Not checked, and listed in every report so it is
// never silently unwatched.
const ELSEWHERE = new Map([
  ['ALREADY-FULL', "a growpart result written by rasputin-os's first-boot script, relayed by the agent and upper-cased by the UI"],
]);

// Inside a quoted label the manual writes placeholders for text the UI fills
// in at runtime (<node-id>, …, ..., counters N/M/n, example numbers and sizes
// like 3h or 256M), and the UI joins runtime parts with separators (·, →,
// " / ", "label: value"). A label is checked as the literal fragments between
// those; every fragment must be found.
const PLACEHOLDER = /<[^<>]*>|…|\.\.\.|\b[NMn]\b|\b\d+(?:[.:]\d+)*[a-z%]*\b|\s*[·→]\s*|\s+\/\s+|:\s+/gi;
const EDGE = /^[\s·—–:→/()|,.+-]+|[\s·—–:→/()|,.+-]+$/g;
const hasWords = (t) => (t.match(/\p{L}/gu) || []).length >= 2;

function fragments(label) {
  return label
    .split(PLACEHOLDER)
    .map((f) => fold((f || '').replace(EDGE, '')))
    .filter(hasWords);
}

function readManual() {
  const dir = join(ROOT, DOCS);
  if (!existsSync(dir)) throw new Broken(`\`${DOCS}/\` does not exist`);
  const pages = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const quotes = new Map(); // span -> Set(page)
  for (const p of pages) {
    for (const span of codeSpans(readFileSync(join(dir, p), 'utf8'))) {
      if (!quotes.has(span)) quotes.set(span, new Set());
      quotes.get(span).add(`${DOCS}/${p}`);
    }
  }
  const skipped = {};
  const labels = [];
  const elsewhere = [];
  for (const [span, pagesOf] of quotes) {
    if (ELSEWHERE.has(span)) { elsewhere.push({ label: span, pages: [...pagesOf].sort(), why: ELSEWHERE.get(span) }); continue; }
    const why = NOT_UI.has(span) ? 'not-ui (named in NOT_UI)' : classify(span);
    if (why) { (skipped[why] ||= []).push(span); continue; }
    const frags = fragments(span);
    if (!frags.length) { (skipped['placeholders-only'] ||= []).push(span); continue; }
    labels.push({ label: span, pages: [...pagesOf].sort(), frags });
  }
  if (labels.length < MIN_LABELS) {
    throw new Broken(`the manual yielded ${labels.length} checkable label(s) from ${quotes.size} code span(s) across ${pages.length} page(s), below the floor of ${MIN_LABELS} — the prose extraction or the filter is broken`);
  }
  return { pages: pages.length, candidates: quotes.size, labels, skipped, elsewhere };
}

// --- 4. evaluate ------------------------------------------------------------
// A fragment is found when it is a substring of one extracted string. Failing
// that, it is found when it reads as one splice with its runtime value filled
// in: the fragment must be EXACTLY the literal text either side of a single
// ${...}, {...}, `+ x +` or %s in the code (a side with no words counts as
// empty), with ONE word between that is itself a whole string literal somewhere
// in the code, i.e. an enum value. `STABLE CHANNEL` is found from
// `${check.channel.toUpperCase()} CHANNEL` plus the literal "stable". Exact, not
// prefix or suffix: a looser rule let the retired `NODES ONLINE` pass as
// "…config: nodes %s and" around "online".
function spliceMatch(f, corpus) {
  const w = f.split(' ');
  for (let k = 0; k < w.length; k++) {
    const v = w[k];
    if (!/^[\p{L}\p{N}-]{1,24}$/u.test(v) || !corpus.exact.has(v)) continue;
    const a = w.slice(0, k).join(' ');
    const b = w.slice(k + 1).join(' ');
    if (!hasWords(a + b)) continue;
    for (const { L, R } of corpus.splices) {
      if (L === a && R === b) return { L, v, R };
    }
  }
  return null;
}

function evaluate() {
  const manual = readManual();
  const cp = resolveControlPlane();
  let corpus;
  try {
    corpus = buildCorpus(cp.dir);
  } finally {
    if (cp.temp) rmSync(cp.dir, { recursive: true, force: true });
  }
  corpus.exact = new Set([...corpus.ui, ...corpus.api]);
  const uiText = [...corpus.ui].join('\n');
  const missing = [];
  const counts = { plain: 0, apiOnly: 0, splice: 0, common: 0, singleWord: 0 };
  for (const l of manual.labels) {
    const lost = [];
    let spliced = false;
    let apiOnly = false;
    for (const f of l.frags) {
      if (corpus.text.includes(f)) { if (!uiText.includes(f)) apiOnly = true; continue; }
      if (spliceMatch(f, corpus)) { spliced = true; continue; }
      lost.push(f);
    }
    if (lost.length) missing.push({ ...l, lost });
    else counts[spliced ? 'splice' : apiOnly ? 'apiOnly' : 'plain']++;
    // Weak protection, measured: every fragment is a single word, or every
    // fragment turns up in 2+ distinct extracted strings, so removing any one
    // control would not make the label disappear.
    if (l.frags.every((f) => !f.includes(' '))) counts.singleWord++;
    if (l.frags.every((f) => { let c = 0; for (const s of corpus.exact) if (s.includes(f) && ++c > 1) return true; return false; })) counts.common++;
    if (process.env.VERBOSE) console.log(`${lost.length ? 'MISSING' : spliced ? 'splice ' : 'ok     '} ${JSON.stringify(l.label)} -> ${JSON.stringify(l.frags)}`);
  }
  return { manual, cp, corpus, missing, counts };
}

// --- 5. render --------------------------------------------------------------
const CP_URL = `https://github.com/${CP_REPO}`;
const SITE_URL = 'https://github.com/geekdojo/rasputin-site/blob/main';
const esc = (t) => t.replace(/\|/g, '\\|');
const pct = (a, b) => `${Math.round((100 * a) / b)}%`;

function renderFindings(r) {
  const { manual, cp, corpus, missing, counts } = r;
  const n = manual.labels.length;
  const L = [MARKER, ''];
  L.push(
    `Checked **${n}** UI label(s) that ${manual.pages} page(s) of \`${DOCS}/\` quote in inline code against the code of \`${CP_REPO}\` at its latest stable release **[\`${cp.tag}\`](${CP_URL}/tree/${cp.tag})**: ${corpus.ui.size} distinct strings from ${corpus.uiFiles} \`ui/\` files and ${corpus.api.size} from ${corpus.goFiles} \`api/\` Go files. Matching is case-insensitive, because the UI upper-cases much of its text at render time.`,
    '',
    '> **What this can and cannot tell you.** A label listed below is quoted by the manual but appears nowhere in the UI or api strings at that tag, in any case — so the control was almost certainly renamed or removed. A clean run proves much less: it cannot notice a label that is still there but whose behaviour changed; a short or common word (`STOP`, `SAVE`) is found somewhere almost always; and prose that describes a control without quoting it is invisible.',
    '',
  );
  if (missing.length) {
    L.push(`## Quoted labels the UI no longer contains (${missing.length})`, '', `| quoted label | quoted on | text not found at \`${cp.tag}\` |`, '|---|---|---|');
    for (const m of missing) {
      L.push(`| \`${esc(m.label)}\` | ${m.pages.map((p) => `[\`${p}\`](${SITE_URL}/${p})`).join('<br>')} | ${m.lost.map((f) => `\`${esc(f)}\``).join(', ')} |`);
    }
    L.push(
      '',
      '## Fixing it',
      '',
      `For each label, find what the control is called at \`${cp.tag}\` (search the UI source for a word that survived, or look at the bench), then fix the page: rename the quote, or rewrite the step if the control is gone. Re-read the whole page against \`${cp.tag}\` while you are there and bump its \`applies-to:\` in the same PR.`,
      '',
      'If a listed quote is not UI text at all (a command, a hostname, a device name), the filter in `scripts/ui-strings-freshness.mjs` let a whole class through: fix that rule, or as a last resort name the text in `NOT_UI` with what it really is. **Never** add text the UI shows there to make this issue close.',
      '',
      'This issue updates itself on each run and closes once every quoted label is found. To re-run after a fix merges:',
      '',
      '```sh',
      'gh workflow run ui-strings-freshness.yml --repo geekdojo/rasputin-site',
      '```',
      '',
    );
  }
  if (manual.elsewhere.length) {
    L.push(`## Quoted, but not checkable here (${manual.elsewhere.length})`, '', 'The UI shows these, but the control plane never spells them: the text arrives as data from another repo. Nothing watches them.', '');
    for (const e of manual.elsewhere) L.push(`- \`${e.label}\` (${e.pages.join(', ')}): ${e.why}`);
    L.push('');
  }
  L.push(
    '<details><summary>How much this run protects</summary>',
    '',
    `- ${counts.plain + counts.apiOnly + counts.splice} of ${n} found: ${counts.plain} in \`ui/\` text, ${counts.apiOnly} only in \`api/\` strings, ${counts.splice} only as a runtime splice (literal text around one enum value).`,
    `- **${counts.common} of ${n} (${pct(counts.common, n)}) are weakly protected**: every part of the label also appears in at least one other string, so removing one control would not make it disappear. ${counts.singleWord} (${pct(counts.singleWord, n)}) are single words.`,
    `- ${manual.candidates} distinct code spans in the manual; ${manual.candidates - n - manual.elsewhere.length} were filtered out as not UI text (${Object.entries(manual.skipped).sort().map(([k, v]) => `${k} ${v.length}`).join(', ')}).`,
    '',
    '</details>',
    '',
    'Reproduce from a rasputin-site checkout with `gh` signed in: `node scripts/ui-strings-freshness.mjs` (add `VERBOSE=1` to see every label).',
  );
  return L.join('\n');
}

function renderBroken(why) {
  return [
    MARKER,
    '',
    '## The ui-strings-freshness check is broken — it cannot see',
    '',
    `**${why}**`,
    '',
    'This is **not** a clean result. The check stopped before it compared any label, so treat every UI label the manual quotes as unverified until a run completes. Fix the cause (the logic and both floors are in `scripts/ui-strings-freshness.mjs`) and re-run:',
    '',
    '```sh',
    'gh workflow run ui-strings-freshness.yml --repo geekdojo/rasputin-site',
    '```',
  ].join('\n');
}

// --- main -------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
let status;
let title;
let body;
try {
  const r = evaluate();
  status = r.missing.length ? 'drift' : 'clean';
  title = r.missing.length
    ? `UI labels: ${r.missing.length} quoted in the manual no longer exist in the UI at ${r.cp.tag}`
    : `UI labels quoted in the manual all exist at ${r.cp.tag}`;
  body = renderFindings(r);
  const c = r.counts;
  console.log(`${status}: ${r.missing.length} missing of ${r.manual.labels.length} checked, from ${r.manual.candidates} distinct code spans, against ${CP_REPO}@${r.cp.tag}`);
  console.log(`  corpus: ui=${r.corpus.ui.size} strings (${r.corpus.uiFiles} files), api=${r.corpus.api.size} strings (${r.corpus.goFiles} files), ${r.corpus.splices.length} splice pairs`);
  console.log(`  found: plain=${c.plain} api-only=${c.apiOnly} splice=${c.splice}; weak (every part in 2+ strings)=${c.common}; single-word=${c.singleWord}`);
  for (const [why, list] of Object.entries(r.manual.skipped).sort()) console.log(`  filtered ${why}: ${list.length}`);
  for (const e of r.manual.elsewhere) console.log(`  NOT CHECKABLE ${JSON.stringify(e.label)}: ${e.why}`);
  for (const m of r.missing) console.log(`  MISSING ${JSON.stringify(m.label)} [${m.lost.join(' | ')}] on ${m.pages.join(', ')}`);
} catch (e) {
  const why = e instanceof Broken ? e.message : `unexpected error: ${e.stack || e.message}`;
  status = 'broken';
  title = 'UI-strings-freshness check is BROKEN — it cannot see';
  body = renderBroken(why);
  console.log(`broken: ${why}`);
}
writeFileSync(join(OUT_DIR, 'status'), status + '\n');
writeFileSync(join(OUT_DIR, 'title'), title + '\n');
writeFileSync(join(OUT_DIR, 'body.md'), body + '\n');
