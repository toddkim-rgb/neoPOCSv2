// Renders a few states in the on-device (scaled) layout at common PDA viewport sizes.
// usage: node scripts/device-shots.mjs <outDir>
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const VIEWPORTS = [
  ['411x822', 411, 822, 2.625],
  ['360x720', 360, 720, 3],
];
const STATES = [
  ['hub', 'hub&tab=urgent'],
  ['task', 'task&patient=1&drug=1'],
  ['ham', 'ham&step=second'],
  ['sheet', 'task&patient=1&drug=1&sheet=status'],
  ['detail', 'detail&open=1'],
];
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'neo-dev-')),
  args: ['--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter', '--disable-breakpad', '--disable-lcd-text'],
});
const page = await browser.newPage();
for (const [vp, w, h, dpr] of VIEWPORTS) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  for (const [name, q] of STATES) {
    await page.goto(`http://127.0.0.1:5173/?device&shot=${q}`, { waitUntil: 'load' });
    await page.waitForSelector('html.ready');
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(out, `${vp}_${name}.png`) });
  }
  console.log('done', vp);
}
await browser.close();
