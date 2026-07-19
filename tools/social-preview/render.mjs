#!/usr/bin/env node
// Render GitHub social-preview cards (1280x640) for the public Rasputin repos,
// in the rasputin-site design language (dark, Pantone 172 C, equatorial trench).
//
//   npm install                once
//   node render.mjs            renders every REPOS entry into ./out — captured
//                              at 2x, downscaled to the final 1280x640 via sips
//
// Upload each PNG by hand in the repo's Settings → General → Social preview
// (GitHub has no API for it). New repo or new wording: edit REPOS, rerun, re-upload.
// Reuses the system Chrome via playwright, same as tools/screenshots/capture.mjs.

import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const REPOS = [
  {
    name: 'rasputin-control-plane',
    role: 'Control plane — Go API · Web UI · Node agent',
  },
  {
    name: 'rasputin-os',
    role: 'Node OS — Read-only Buildroot · A/B updates · Auto-rollback',
  },
  {
    name: 'rasputin-openwrt-firewall',
    role: 'Firewall — OpenWrt on N100 · A/B rollback · Snort 3 IDS',
  },
  {
    name: 'rasputin-agents',
    role: 'Agent tooling — Claude Code plugin · Agent Skills',
  },
  {
    name: 'rasputin-site',
    role: 'Landing page + devlog',
  },
];

// Palette and type straight from rasputin-site assets/css/main.css.
const card = ({ name, role }) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root {
    --bg: #0b0c0e;
    --line: #262a32;
    --text: #d7dae0;
    --muted: #8b909b;
    --accent: #fa4616;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px; height: 640px; overflow: hidden; position: relative;
    background:
      linear-gradient(rgba(11,12,14,0.88), var(--bg) 78%),
      repeating-linear-gradient(-45deg, transparent 0 34px, rgba(250,70,22,0.05) 34px 35px),
      var(--bg);
    color: var(--text);
    font-family: var(--sans);
    -webkit-font-smoothing: antialiased;
  }

  /* ghost diamond, cropped by the right edge, clipped inside the frame */
  .ghost-wrap { position: absolute; inset: 23px; overflow: hidden; }
  .ghost {
    position: absolute; top: 50%; right: -322px;
    width: 880px; height: 880px; transform: translateY(-50%);
    opacity: 0.15;
  }

  /* notched hairline frame */
  .frame {
    position: absolute; inset: 22px;
    border: 1px solid var(--line);
    clip-path: polygon(28px 0, 100% 0, 100% calc(100% - 28px), calc(100% - 28px) 100%, 0 100%, 0 28px);
  }

  .inner {
    position: absolute; inset: 22px;
    padding: 44px 56px 40px;
    display: flex; flex-direction: column;
  }

  .head { display: flex; align-items: center; justify-content: space-between; }
  .brand {
    display: flex; align-items: center; gap: 14px;
    font-family: var(--mono); font-weight: 700;
    font-size: 26px; letter-spacing: 0.18em; color: var(--text);
  }
  .brand svg { display: block; }
  .tagline {
    font-family: var(--mono); font-size: 16px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--muted);
  }

  /* the equatorial trench: recessed double line, as on .site-head */
  .trench { margin-top: 26px; height: 0; border-top: 1px solid var(--line);
            box-shadow: 0 1px 0 #000, 0 2px 0 var(--line); }

  .main { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .org { font-family: var(--mono); font-size: 30px; color: var(--muted); margin-bottom: 10px; }
  .repo {
    align-self: flex-start; /* size to the text so the fit-shrink can measure it */
    font-weight: 800; font-size: 96px; line-height: 1.04;
    letter-spacing: -0.015em; color: #e8eaee; white-space: nowrap;
  }
  .role {
    margin-top: 26px;
    font-family: var(--mono); font-size: 22px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--accent);
  }

  .foot {
    border-top: 1px solid var(--line); padding-top: 18px;
    font-family: var(--mono); font-size: 18px; letter-spacing: 0.06em;
    color: var(--muted);
  }
</style></head><body>
  <div class="ghost-wrap">
    <svg class="ghost" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <path d="M256 86 426 256 256 426 86 256Z" fill="none" stroke="#fa4616" stroke-width="28" stroke-linejoin="round"/>
      <path d="M100 248h312" stroke="#fa4616" stroke-width="12"/>
      <path d="M100 264h312" stroke="#fa4616" stroke-width="12"/>
    </svg>
  </div>
  <div class="frame"></div>
  <div class="inner">
    <div class="head">
      <div class="brand">
        <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 1 23 12 12 23 1 12Z" fill="none" stroke="#fa4616" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M4 12h16" stroke="#fa4616" stroke-width="2.4"/>
        </svg>
        RASPUTIN
      </div>
      <div class="tagline">Open-source homelab cluster system</div>
    </div>
    <div class="trench"></div>
    <div class="main">
      <div class="org">geekdojo/</div>
      <div class="repo">${name}</div>
      <div class="role">${role}</div>
    </div>
    <div class="foot">rasputin.geekdojo.com</div>
  </div>
</body></html>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 2,
});

for (const repo of REPOS) {
  await page.setContent(card(repo), { waitUntil: 'networkidle' });
  // Shrink the repo name until it clears the ghost diamond's visible tip.
  await page.evaluate(() => {
    const el = document.querySelector('.repo');
    let size = 96;
    while (el.getBoundingClientRect().width > 1030 && size > 40) {
      size -= 2;
      el.style.fontSize = size + 'px';
    }
  });
  const raw = join(OUT, `${repo.name}@2x.png`);
  const final = join(OUT, `${repo.name}.png`);
  await page.screenshot({ path: raw, clip: { x: 0, y: 0, width: 1280, height: 640 } });
  await exec('sips', ['-z', '640', '1280', raw, '--out', final]);
  rmSync(raw);
  console.log('rendered', final);
}

await browser.close();
