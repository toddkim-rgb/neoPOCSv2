// Captures each prototype screen at 1x in the frame sizes of the OLD Figma file (Rd6Qc354…, Page 3).
// The app now follows the SSol design: use scripts/shoot-ssol.mjs for current comparisons.
// usage: node scripts/shoot.mjs <outDir> [filter]   (dev server must be running on :5173)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SHOTS = [
  ['01_splash', 'splash', 892],
  ['02_auth-input', 'login-id&loginError=1', 892],
  ['03_auth-bio', 'login-bio', 892],
  ['04_hub-urgent', 'hub&tab=urgent', 892],
  ['05_hub-mypatients', 'hub&tab=my', 892],
  ['06_hub-menu', 'hub&tab=menu', 1046],
  ['07_med-scan', 'scan', 892],
  ['08_err-barcode', 'scan&dialog=fail', 892],
  ['09_err-reset', 'scan&dialog=reset', 892],
  ['10_err-mismatch', 'task&patient=1&dialog=mismatch', 892],
  ['11_task-patientonly', 'task&patient=1', 888],
  ['12_task-drugonly', 'task&drug=1', 1326],
  ['13_task-both', 'task&patient=1&drug=1', 1286],
  ['14_voice-01', 'voice&step=record&shown=4', 892],
  ['15_voice-02', 'voice&step=review', 983],
  ['16_voice-03', 'voice&step=done', 892],
  ['17_check-1st-a', 'ham&step=first', 892],
  ['18_check-1st-b', 'ham&step=first&dialog=second', 892],
  ['19_check-2nd', 'ham&step=second', 892],
  ['20_check-02', 'ham&step=done', 892],
  ['21_time-popup', 'task&patient=1&drug=1&sheet=time', 892],
  ['22_flag-popup', 'task&patient=1&drug=1&sheet=status', 892],
  ['23_done', 'done', 892],
  ['24_detail', 'detail&open=1', 2445],
];

// Edge (Chromium) is present on every Windows 11 machine.
const CHROME = process.env.CHROME || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const out = process.argv[2];
const filter = process.argv[3];
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'neo-shot-')),
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter', '--disable-breakpad', '--disable-lcd-text'],
});
try {
  const page = await browser.newPage();
  for (const [name, query, h] of SHOTS) {
    if (filter && !name.includes(filter)) continue;
    await page.setViewport({ width: 412, height: h, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:5173/?shot=${query}&h=${h}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('html.ready');
    await new Promise((r) => setTimeout(r, 450));
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log('shot', name);
  }
} finally {
  await browser.close();
}
