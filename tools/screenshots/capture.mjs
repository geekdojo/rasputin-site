#!/usr/bin/env node
// Capture control-plane UI screenshots for the marketing site.
//
//   node capture.mjs --login          headed Chrome; tap your passkey once,
//                                     session is saved to auth-state.json
//   node capture.mjs                  headless; captures dashboard, apps, tasks
//   node capture.mjs --all            adds updates, firewall-rules, login
//   node capture.mjs dashboard apps   just the named shots
//
// Output lands in ../../static/img/ui/ at 2x (3200x1800). The control plane
// serves its own CA, so TLS errors are ignored for this origin only.

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

// Text that only renders once the authed dashboard has data.
const AUTHED_MARKER = /NODES ONLINE|NODE CONTROLS/;

const SHOTS = {
  dashboard: {
    path: '/',
    ready: (page) => page.getByText('NODES ONLINE').first().waitFor({ timeout: 30_000 }),
    settle: 3000, // let the hex grid + HUD background finish animating in
  },
  apps: {
    path: '/apps',
    settle: 2500,
  },
  tasks: {
    path: '/tasks',
    settle: 2000,
    prepare: async (page) => {
      // Best-effort: expand the first job so the saga steps + event stream show.
      for (const sel of ['tbody tr', '[class*="task" i] button', 'main [role="button"]']) {
        try {
          await page.locator(sel).first().click({ timeout: 3000 });
          await page.waitForTimeout(1500);
          return;
        } catch { /* try the next selector */ }
      }
      console.warn('  (could not expand a task row — capturing the plain list)');
    },
  },
  updates: { path: '/updates', settle: 2500, all: true },
  'firewall-rules': { path: '/firewall/rules', settle: 2500, all: true },
  login: { path: '/login', settle: 2000, all: true, unauthenticated: true },
};

const args = process.argv.slice(2);

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

  for (const name of names) {
    const shot = SHOTS[name];
    const context = shot.unauthenticated ? await newContext(browser, { withState: false }) : authed;
    const page = await context.newPage();
    console.log(`${name} <- ${BASE}${shot.path}`);
    await page.goto(BASE + shot.path, { waitUntil: 'domcontentloaded' });
    if (shot.ready) await shot.ready(page);
    if (shot.prepare) await shot.prepare(page);
    await page.waitForTimeout(shot.settle ?? 2000);
    const file = join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    await optimize(file);
    await page.close();
    if (shot.unauthenticated) await context.close();
  }
  await browser.close();
  console.log(`Done -> ${OUT}`);
}

if (args.includes('--login')) {
  await login();
} else {
  const named = args.filter((a) => !a.startsWith('--'));
  const names = named.length
    ? named
    : Object.keys(SHOTS).filter((n) => !SHOTS[n].all || args.includes('--all'));
  const unknown = names.filter((n) => !SHOTS[n]);
  if (unknown.length) {
    console.error(`Unknown shot(s): ${unknown.join(', ')}. Known: ${Object.keys(SHOTS).join(', ')}`);
    process.exit(1);
  }
  await capture(names);
}
