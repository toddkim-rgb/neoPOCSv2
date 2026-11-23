// Captures prototype screens matching the SSol design frames (Figma file 11zTP3cEcnnQsCNchWnVei).
// usage: node scripts/shoot-ssol.mjs <outDir> [prefixes]   (dev server must be running on :5173)
// Compare with: python scripts/compare.py ../figma-ssol/design-p1 <outDir> <resultDir> [h|m]   (phase 1)
//               python scripts/compare.py ../figma-ssol/design-p2 <outDir> <resultDir> [b|t|v]  (phase 2, filter by prefix)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SHOTS = [
  ['h1_hub-urgent', 'hub&tab=urgent', 892],
  ['h2_hub-chips', 'hub&tab=urgent&ai=chips', 892],
  ['h3_hub-typing', 'hub&tab=urgent&ai=typing', 892],
  ['h4_hub-my', 'hub&tab=my', 892],
  ['h5_hub-menu', 'hub&tab=menu', 1006],
  ['m01_scan', 'scan', 892],
  ['m02_err-barcode', 'scan&dialog=fail', 892],
  ['m03_err-reset', 'scan&dialog=reset', 892],
  ['m04_err-mismatch', 'task&patient=1&dialog=mismatch', 888],
  ['m06_task-drug', 'task&drug=1', 1355],
  ['m07_task-both', 'task&patient=1&drug=1', 1286],
  ['m08_prn', 'scan&dialog=prn', 892],
  ['m09_time', 'task&patient=1&drug=1&sheet=time', 892],
  ['m10_flag', 'task&patient=1&drug=1&sheet=status', 892],
  ['m11_ham1', 'ham&step=first', 957],
  ['m12_ham-pop', 'ham&step=first&dialog=second', 957],
  ['m13_ham2', 'ham&step=second', 957],
  ['m14_ham-done', 'ham&step=done', 892],
  ['m15_done', 'done', 892],
  // phase 2 (compare with ../figma-ssol/design-p2)
  ['b1_scan', 'wscan&kind=bld', 892],
  ['b2_task', 'wtask&kind=bld&patient=1&drug=1', 892],
  ['b3_done', 'wdone&kind=bld', 892],
  ['t1_scan', 'wscan&kind=trf', 892],
  ['t2_task', 'wtask&kind=trf&patient=1&drug=1&done=1', 892],
  ['t4_check1', 'ham&kind=trf&step=first', 933],
  ['t5_pop', 'ham&kind=trf&step=first&dialog=second', 933],
  ['t6_check2', 'ham&kind=trf&step=second', 957],
  ['t7_checkdone', 'ham&kind=trf&step=done', 891],
  ['t8_done', 'wdone&kind=trf', 892],
  ['v1_scan', 'wscan&kind=vital', 892],
  ['v2_task-plan', 'vital&kind=vital&patient=1', 892],
  ['v4_time', 'vital&kind=vital&patient=1&sheet=time', 892],
  ['v5_done', 'wdone&kind=vital', 892],
  // phase 3 (compare with ../figma-ssol/design-p3)
  ['p3-d1_detail', 'detail&open=1', 2471],
  ['p3-v1_voice-rec', 'voice&step=record&shown=4', 892],
  ['p3-v2_voice-review', 'voice&step=review', 892],
  ['p3-v3_voice-edit', 'voice&step=review&script=1', 1031],
  ['p3-v4_voice-done', 'voice&step=done', 892],
  ['p3-s1_setting', 'setting', 1358],
  ['p3-s2_slot1', 'setting&sheet=slot1', 892],
  ['p3-s3_slot2', 'setting&sheet=slot2', 892],
  ['p3-s4_logout', 'setting&dialog=logout', 892],
  ['p3-n1_menu', 'navmenu', 1499],
  ['p3-n2_room', 'navmenu&sheet=room', 892],
  ['p3-c1_vmain', 'vmain', 892],
  ['p3-c2_vpatient', 'vpatient&tab=perform', 888],
  ['p3-c3_vround', 'vpatient&tab=round', 888],
];

// Chrome first (headless Edge stopped starting after its 2026-11 update), Edge as a fallback.
const CHROME =
  process.env.CHROME ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
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
    // filter: comma-separated name prefixes, e.g. `b,t,v` or `m1`
    if (filter && !filter.split(',').some((f) => name.startsWith(f))) continue;
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
