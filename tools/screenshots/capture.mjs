#!/usr/bin/env node
// Capture control-plane UI screenshots for the marketing site and the user manual.
//
//   node capture.mjs --login          headed Chrome; tap your passkey once,
//                                     session is saved to auth-state.json
//   node capture.mjs                  headless; captures dashboard, apps, tasks
//   node capture.mjs --all            the marketing six: adds updates,
//                                     firewall-rules, login
//   node capture.mjs --manual         the user-manual figure set (see MANUAL
//                                     SHOTS below) — one passkey session
//   node capture.mjs --everything     --all plus --manual, in one run
//   node capture.mjs dashboard apps   just the named shots
//
// `--all` still means exactly the marketing six it always did; `--manual` and
// `--everything` are additive. Shots that serve both sets are listed in both
// groups and captured once per run — the manual's own chapters need the
// dashboard, apps, tasks, updates, firewall-rules and login screens too, so as
// it happens `--manual` currently covers every shot and `--everything` is the
// same set. `--everything` is the flag to reach for anyway: it stays correct
// when a marketing-only shot is added.
//
// Output lands in ../../static/img/ui/ at 2x (3200x1800). The control plane
// serves its own CA, so TLS errors are ignored for this origin only.
//
// Point it at a cluster with RASPUTIN_URL, e.g.
//   RASPUTIN_URL=https://e12bench.local node capture.mjs --everything

import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const BASE = process.env.RASPUTIN_URL || 'https://rasputin.local';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'static', 'img', 'ui');
const STATE = join(HERE, 'auth-state.json');
const VIEWPORT = { width: 1600, height: 900 };

// Text that only renders once the authed dashboard has data. NODE CONTROLS is
// the NodeControls panel heading (NodeControls.tsx) — a static label on the
// landing page, so it does not depend on a node being selected or on any
// counter having a value yet. The previous marker, NODES ONLINE, was the old
// top-bar label; it was renamed to NODES ON LAN and every capture had been
// failing on it since.
const AUTHED_MARKER = /NODE CONTROLS/;

// Best-effort click: walk the candidate locators in order, take the first one
// that exists, warn and carry on if none do. This is the warn-and-continue
// shape the per-shot hooks already used, hoisted so every hook shares it — a
// missing locator must degrade one shot, never abort the run.
async function tryClick(page, locators, what, settleMs = 1500) {
  for (const locator of locators) {
    try {
      await locator.first().click({ timeout: 3000 });
      if (settleMs) await page.waitForTimeout(settleMs);
      return true;
    } catch { /* try the next locator */ }
  }
  console.warn(`  (could not ${what} — capturing without it)`);
  return false;
}

// Node ids are runtime values minted per cluster (cp-1, cp-firewall1, …), so
// anything that needs a node DISCOVERS one from the live inventory. Never
// hardcode a node id or an IP: the bench has no DHCP reservations and a
// hardcoded id is wrong on every other cluster. Call this only after the page
// is already on the control-plane origin, so the session cookie is sent.
async function firstNodeId(page, { role } = {}) {
  try {
    const nodes = await page.evaluate(async () => {
      const r = await fetch('/api/nodes', { credentials: 'include' });
      if (!r.ok) return [];
      const body = await r.json();
      return Array.isArray(body) ? body.map((n) => ({ id: n.id, role: n.role, status: n.status })) : [];
    });
    const byRole = role ? nodes.find((n) => n.role === role) : undefined;
    return (byRole ?? nodes.find((n) => n.status === 'online') ?? nodes[0])?.id ?? null;
  } catch {
    return null;
  }
}

// Open the /metrics node drawer on a given tab. The drawer is a query param —
// /metrics?node=<id>&tab=<tab> — honoured only when the querystring FIRST
// appears; it never writes the URL back when you switch tabs. So: navigate
// with the deep link, then also click the tab, which is what a human does and
// what keeps the shot right if the deep link stops being honoured.
async function openNodeDrawer(page, tab) {
  const id = await firstNodeId(page);
  if (!id) {
    console.warn('  (no node id from /api/nodes — capturing the fleet view instead)');
    return;
  }
  await page.goto(`${BASE}/metrics?node=${encodeURIComponent(id)}&tab=${tab}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await tryClick(page, [page.getByRole('tab', { name: tab.toUpperCase(), exact: true })], `select the ${tab.toUpperCase()} tab`);
}

// ---------------------------------------------------------------------------
// READ-ONLY ON THE BENCH. These shots run against a LIVE cluster. A `prepare`
// hook may navigate, select a row or a tab, and open read-only disclosure
// surfaces (detail drawers, node drawers). It must NEVER touch a mutating
// control: no APPLY, RECONCILE, INSTALL, DEPLOY, STOP, DELETE, REBOOT, UPDATE,
// UPDATE ALL, BACK UP NOW, GENERATE KEY, CHECK NOW, RESCAN, TURN ON/OFF,
// CONTINUE — UNLOCK THIS DISK; no form submission and no toggle. If a page can
// only be made to look good by changing cluster state, capture it as it is and
// let the manual describe the state honestly.
//
// A page that is legitimately empty or switched off (metrics with observability
// disabled, /restore on a cluster that already has an operator) is captured in
// that state on purpose. Do not "fix" it by clicking the enable button.
//
// /console is deliberately NOT captured: the page opens a serial-over-LAN
// WebSocket on mount, and SoL is one session for the whole rack, so capturing
// it would take the console away from whoever is using it.
// ---------------------------------------------------------------------------

const SHOTS = {
  // --- marketing ----------------------------------------------------------
  dashboard: {
    path: '/',
    groups: ['marketing', 'manual'],
    ready: (page) => page.getByText('NODE CONTROLS').first().waitFor({ timeout: 30_000 }),
    prepare: async (page) => {
      // The page auto-selects the first node now, so this is usually a no-op.
      // Kept because it is cheap and it pins the selection to the control-plane
      // node rather than whatever sorts first. `ctrl` is the short role tag the
      // hex cells render (ROLE_SHORT in app/(authed)/page.tsx); the old
      // /^node-/ fallback could never match, since cells are labelled with the
      // node id (cp-1, cp-firewall1) and no cluster mints "node-" ids.
      // Only the role tags, never a bare structural selector: the hex grid's
      // last cell is ADD NODE, and clicking that opens the enrollment wizard.
      // These four are the whole ROLE_SHORT map, so one of them always matches.
      await tryClick(
        page,
        [
          page.getByText('ctrl', { exact: true }),
          page.getByText('fw', { exact: true }),
          page.getByText('work', { exact: true }),
          page.getByText('stor', { exact: true }),
        ],
        'select a node in the hex map',
      );
    },
    settle: 3000, // let the hex grid + HUD background finish animating in
  },
  apps: {
    path: '/apps',
    groups: ['marketing', 'manual'],
    settle: 2500,
  },
  tasks: {
    path: '/tasks',
    groups: ['marketing', 'manual'],
    settle: 2000,
    prepare: async (page) => {
      // Expand the first job so the saga steps + event stream show. The rows
      // carry the onToggle handler themselves (tasks/page.tsx), inside
      // <table aria-label="Task queue">; scope to that table so this can never
      // reach a button in some other surface.
      await tryClick(
        page,
        [
          page.locator('table[aria-label="Task queue"] tbody tr'),
          page.locator('main table tbody tr'),
        ],
        'expand a task row',
      );
    },
  },
  updates: { path: '/updates', groups: ['marketing', 'manual'], all: true, settle: 2500 },
  'firewall-rules': { path: '/firewall/rules', groups: ['marketing', 'manual'], all: true, settle: 2500 },
  login: { path: '/login', groups: ['marketing', 'manual'], all: true, settle: 2000, unauthenticated: true },

  // --- MANUAL SHOTS -------------------------------------------------------
  // One per UI surface the manual chapters describe. Read the READ-ONLY note
  // above before adding to this list.

  // ch 01 — access and settings
  trust: {
    path: '/trust',
    groups: ['manual'],
    unauthenticated: true,
    ready: (page) => page.getByText('SECURE YOUR CONNECTION').first().waitFor({ timeout: 20_000 }),
    settle: 2000,
  },
  settings: {
    path: '/settings',
    groups: ['manual'],
    ready: (page) => page.getByText('APPEARANCE / THEME').first().waitFor({ timeout: 20_000 }),
    settle: 2500,
  },

  // ch 03 — apps and catalog
  'app-catalog': {
    path: '/app-catalog',
    groups: ['manual'],
    ready: (page) => page.getByText(/APP CATALOG — \d+/).first().waitFor({ timeout: 30_000 }),
    settle: 3000,
  },
  'app-detail': {
    path: '/apps',
    groups: ['manual'],
    ready: (page) => page.getByText(/APPS — \d+/).first().waitFor({ timeout: 30_000 }),
    prepare: async (page) => {
      // The app name is a button that opens the read-only detail drawer; the
      // same row also holds DEPLOY / STOP / DELETE, so match on the name
      // button's own accessible name ("Details for <app>") and nothing looser.
      await tryClick(page, [page.getByRole('button', { name: /^Details for / })], 'open an app detail drawer', 2000);
    },
    settle: 2500,
  },

  // ch 04 — observability
  metrics: {
    path: '/metrics',
    groups: ['manual'],
    ready: (page) => page.getByText('METRICS', { exact: true }).first().waitFor({ timeout: 30_000 }),
    settle: 3500, // charts fetch /api/obs/series after the page paints
  },
  'metrics-node-drawer': {
    path: '/metrics',
    groups: ['manual'],
    prepare: (page) => openNodeDrawer(page, 'metrics'),
    settle: 3500,
  },
  'metrics-node-logs': {
    path: '/metrics',
    groups: ['manual'],
    prepare: (page) => openNodeDrawer(page, 'logs'),
    settle: 3500,
  },
  alerts: { path: '/alerts', groups: ['manual'], settle: 2500 },

  // ch 05 — storage
  storage: {
    path: '/storage',
    groups: ['manual'],
    ready: (page) => page.getByText('DISKS ON').first().waitFor({ timeout: 30_000 }),
    settle: 3000, // the backup-target health probe lands after first paint
  },

  // ch 07 — firewall (the header tabs; RULES is the marketing shot above)
  'firewall-overview': {
    path: '/firewall',
    groups: ['manual'],
    ready: (page) => page.getByText('PORT FORWARDS').first().waitFor({ timeout: 20_000 }),
    settle: 2500,
  },
  'firewall-port-forwards': { path: '/firewall/port-forwards', groups: ['manual'], settle: 2500 },
  'firewall-wan': { path: '/firewall/wan', groups: ['manual'], settle: 2500 },
  'firewall-advanced': { path: '/firewall/advanced', groups: ['manual'], settle: 2500 },

  // ch 08 — mesh
  'mesh-overview': {
    path: '/mesh',
    groups: ['manual'],
    ready: (page) => page.getByText('PRE-AUTH KEYS').first().waitFor({ timeout: 20_000 }),
    settle: 2500,
  },
  'mesh-devices': {
    path: '/mesh/devices',
    groups: ['manual'],
    ready: (page) => page.getByText('ENROLL RASPUTIN NODE').first().waitFor({ timeout: 20_000 }),
    settle: 2500,
  },
  // KEYS renders the pre-auth key table. GENERATE is a mutation — never click it.
  'mesh-keys': { path: '/mesh/keys', groups: ['manual'], settle: 2500 },
  'mesh-routes': { path: '/mesh/routes', groups: ['manual'], settle: 2500 },

  // ch 09 — setup. On a finished cluster this is the all-complete state, which
  // is the state most readers will see; the per-card copy is unchanged.
  setup: {
    path: '/setup',
    groups: ['manual'],
    ready: (page) => page.getByText('FIRST-RUN SETUP').first().waitFor({ timeout: 20_000 }),
    settle: 2500,
  },

  // ch 11 — restore. Unauthenticated by design. On a cluster that already has
  // an operator this shows only the closed state; that is the honest figure,
  // and the chapter says so.
  restore: {
    path: '/restore',
    groups: ['manual'],
    unauthenticated: true,
    settle: 2500,
  },
};

const args = process.argv.slice(2);

function selection() {
  const names = Object.keys(SHOTS);
  const wantAll = args.includes('--all');
  const wantManual = args.includes('--manual');
  const wantEverything = args.includes('--everything');

  if (wantEverything || (wantAll && wantManual)) return names;
  if (wantManual) return names.filter((n) => SHOTS[n].groups.includes('manual'));
  // Unchanged from before groups existed: bare invocation is the marketing
  // shots that aren't flagged `all`; --all is the whole marketing set.
  return names.filter((n) => SHOTS[n].groups.includes('marketing') && (!SHOTS[n].all || wantAll));
}

async function newContext(browser, { withState }) {
  return browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
    ...(withState && existsSync(STATE) ? { storageState: STATE } : {}),
  });
}

async function login() {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await newContext(browser, { withState: false });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  console.log(`Chrome is open at ${BASE} — sign in with your passkey.`);
  await page.getByText(AUTHED_MARKER).first().waitFor({ timeout: 300_000 });
  await context.storageState({ path: STATE });
  console.log(`Signed in. Session saved to ${STATE} — you can close the window.`);
  await browser.close();
}

// Quantize in place; the flat dark UI compresses ~3x with no visible change.
// pngquant exits 98/99 when it would grow the file or miss the quality floor —
// both mean "keep the original", not failure.
async function optimize(file) {
  const before = statSync(file).size;
  try {
    await exec('pngquant', ['--force', '--strip', '--skip-if-larger', '--quality', '70-95', '--speed', '1', '--ext', '.png', file]);
    const after = statSync(file).size;
    console.log(`  pngquant: ${Math.round(before / 1024)}K -> ${Math.round(after / 1024)}K`);
  } catch (e) {
    if (e.code === 98 || e.code === 99) return;
    console.warn(`  (pngquant unavailable or failed — keeping the raw capture: ${e.message.split('\n')[0]})`);
  }
}

async function capture(names) {
  if (!existsSync(STATE)) {
    console.error('No saved session. Run: node capture.mjs --login');
    process.exit(1);
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const authed = await newContext(browser, { withState: true });

  // Fail fast if the saved session has expired.
  const probe = await authed.newPage();
  await probe.goto(BASE, { waitUntil: 'domcontentloaded' });
  try {
    await probe.getByText(AUTHED_MARKER).first().waitFor({ timeout: 20_000 });
  } catch {
    console.error('Saved session no longer works. Run: node capture.mjs --login');
    await browser.close();
    process.exit(1);
  }
  await probe.close();

  const failed = [];
  for (const name of names) {
    const shot = SHOTS[name];
    const context = shot.unauthenticated ? await newContext(browser, { withState: false }) : authed;
    const page = await context.newPage();
    console.log(`${name} <- ${BASE}${shot.path}`);
    try {
      await page.goto(BASE + shot.path, { waitUntil: 'domcontentloaded' });
      // A rotted `ready` marker used to abort the whole run — that is how the
      // committed screenshots went stale unnoticed. Warn and capture anyway:
      // a shot that looks wrong is visible, a run that never happened is not.
      if (shot.ready) {
        try {
          await shot.ready(page);
        } catch {
          console.warn('  (ready marker never appeared — capturing what rendered)');
        }
      }
      if (shot.prepare) await shot.prepare(page);
      await page.waitForTimeout(shot.settle ?? 2000);
      const file = join(OUT, `${name}.png`);
      await page.screenshot({ path: file });
      await optimize(file);
    } catch (e) {
      console.warn(`  (FAILED: ${e.message.split('\n')[0]})`);
      failed.push(name);
    }
    await page.close();
    if (shot.unauthenticated) await context.close();
  }
  await browser.close();
  console.log(`Done -> ${OUT}`);
  if (failed.length) {
    console.error(`Failed shot(s): ${failed.join(', ')}`);
    process.exit(1);
  }
}

if (args.includes('--login')) {
  await login();
} else {
  const named = args.filter((a) => !a.startsWith('--'));
  const names = named.length ? named : selection();
  const unknown = names.filter((n) => !SHOTS[n]);
  if (unknown.length) {
    console.error(`Unknown shot(s): ${unknown.join(', ')}. Known: ${Object.keys(SHOTS).join(', ')}`);
    process.exit(1);
  }
  await capture(names);
}
