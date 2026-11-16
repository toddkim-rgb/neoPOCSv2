// End-to-end click-through of the prototype in headless Chrome/Edge (SSol design flow).
// usage: node scripts/flow-test.mjs [outDir]   (dev server on :5173; ?device emulates the PDA layout)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Chrome first (headless Edge stopped starting after its 2026-11 update), Edge as a fallback.
const EXE =
  process.env.CHROME ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: true,
  pipe: true,
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'neo-flow-')),
  args: ['--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter', '--disable-breakpad', '--disable-lcd-text'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// MF52e: 1080×2160 px panel; emulate a 411×822 dp viewport with insets like Android 15
await page.setViewport({ width: 411, height: 822, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173/'}?device`, { waitUntil: 'load' });
await page.waitForSelector('html.ready');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const screen = () => page.evaluate(() => document.querySelector('#screens .screen')?.className.match(/scr-([\w-]+)/)?.[1]);
const dialog = () => page.evaluate(() => document.querySelector('.dlg-title')?.textContent || '');
const hubTab = () =>
  page.evaluate(() => ['my', 'urgent', 'menu'][[...document.querySelectorAll('.hub-dots i')].findIndex((d) => d.classList.contains('on'))]);
async function shot(label) {
  step += 1;
  if (out) await page.screenshot({ path: path.join(out, `${String(step).padStart(2, '0')}_${label}.png`) });
}
async function tap(selector, label) {
  await page.waitForSelector(selector, { visible: true, timeout: 4000 });
  // centre the target first: list buttons stick to the bottom and would cover an item scrolled to the edge
  await page.$eval(selector, (e) => e.scrollIntoView({ block: 'center' }));
  await sleep(60);
  await page.click(selector);
  await sleep(380);
  const s = await screen();
  const d = await dialog();
  console.log(`tap ${label.padEnd(26)} -> ${s}${d ? ` [${d}]` : ''}`);
  await shot(label);
  return s;
}
async function expect(name) {
  const s = await screen();
  if (s !== name) throw new Error(`expected screen ${name}, got ${s}`);
}
async function expectDialog(title) {
  const d = await dialog();
  if (d !== title) throw new Error(`expected popup "${title}", got "${d}"`);
}
// 활력징후 음성 입력: the demo sentence (headless Chrome has no microphone) → 입력하기
async function voiceDemo(label) {
  await tap('[data-act="vvoice"]', `${label}-voice`);
  await page.waitForSelector('.sheet.vv [data-sheet-act="demo"]', { visible: true });
  await page.click('.sheet.vv [data-sheet-act="demo"]');
  await waitFor(() => document.querySelector('.sheet.vv [data-sheet-act="apply"]')?.disabled === false, `${label} voice result`, 8000);
  const heard = await page.$eval('.sheet.vv .vv-text', (e) => e.textContent);
  await page.click('.sheet.vv [data-sheet-act="apply"]');
  await sleep(450);
  return heard;
}
// 수혈 목록: each 혈액번호 with its state, and the footer buttons
const unitsNow = () => page.$$eval('.unit', (els) => els.map((e) => `${e.querySelector('.no').textContent}:${e.className.replace('unit ', '')}`).join(' '));
const footBtns = () => page.$$eval('.sticky-foot .btn', (els) => els.map((e) => e.textContent).join('|'));
// 투약 리스트: drag a card to the left / hold it (swipe.js)
async function swipeLeft(sel) {
  await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await sleep(80);
  const b = await (await page.$(sel)).boundingBox();
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + b.width - 30, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width - 30 - i * 22, y), await sleep(16);
  await page.mouse.up();
  await sleep(350);
}
async function longPress(sel) {
  await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await sleep(80);
  const b = await (await page.$(sel)).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 20);
  await page.mouse.down();
  await sleep(750);
  await page.mouse.up();
  await sleep(300);
}
async function scanWedge(code) {
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press('Enter');
  await sleep(450);
  console.log(`scan ${code.padEnd(25)} -> ${await screen()}`);
}
async function waitFor(fn, label, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn)) return;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}`);
}
const trfStatus = () => page.$eval('[data-v="status"]', (e) => e.textContent).catch(() => '');
async function command(text) {
  await page.click('.ai-input');
  await page.type('.ai-input', text);
  await sleep(100);
  const typing = await page.$eval('.ai-bar', (e) => e.classList.contains('typing'));
  if (!typing) throw new Error('AI bar did not switch to the ✓ button while typing');
  await page.keyboard.press('Enter');
  await sleep(420);
  console.log(`cmd  ${text.padEnd(25)} -> ${await screen()} / ${await hubTab()}`);
}

try {
  await shot('splash');
  await tap('[data-act="login-id"]', 'login-id');
  await tap('[data-act="login"]', 'login-empty-error');
  const err = await page.$eval('.login-error', (e) => getComputedStyle(e).visibility);
  if (err !== 'visible') throw new Error('login error not shown');
  await page.type('#emp', '20251234');
  await page.type('#pw', 'pass');
  await tap('[data-act="login"]', 'hub');
  await expect('hub');
  if ((await hubTab()) !== 'urgent') throw new Error('hub should open on 환자허브');

  // AI 커맨드바: text commands move between the pages
  await command('내 환자');
  if ((await hubTab()) !== 'my') throw new Error('"내 환자" should open MY환자');
  await tap('.sort-chip[data-sort="ward"]', 'sort-ward');
  const first = await page.$eval('.myrow .myrow-name', (e) => e.textContent);
  if (!first.startsWith('문가은')) throw new Error(`위치 sort wrong: ${first}`);
  await command('메뉴');
  if ((await hubTab()) !== 'menu') throw new Error('"메뉴" should open the menu page');
  await tap('.menu-tile[data-act="todo"]', 'menu-todo-toast');
  await command('긴급 업무');
  if ((await hubTab()) !== 'urgent') throw new Error('"긴급" should open 환자허브');

  // + menu → 사진 촬영: the camera opens at once (the patient is scanned after the photo), then back to the hub
  await tap('[data-act="ai-more"]', 'ai-more');
  const open = await page.$eval('.ai-chips', (e) => e.classList.contains('open'));
  if (!open) throw new Error('AI chips did not open');
  await tap('[data-act="ai-monitor"]', 'ai-monitor');
  await expect('vcam');
  const camChip = await page.$eval('.cam-patient', (e) => e.textContent);
  if (!camChip.startsWith('환자 미확인')) throw new Error(`camera should start without a patient: ${camChip}`);
  await page.keyboard.press('Escape');
  await sleep(400);
  await expect('hub');

  // voice button → recognised text → ✓ → 투약하기
  await page.click('[data-act="ai-go"]');
  await sleep(1800);
  const heard = await page.$eval('.ai-input', (e) => e.value);
  if (!heard) throw new Error('voice simulation left the field empty');
  await tap('[data-act="ai-go"]', 'voice-command');
  // "김철수 환자 투약하기" names the patient → their 투약 list first, locked until the wristband
  await expect('task');
  if (!(await page.$('.task-lock'))) throw new Error('a named patient should open the locked 투약 list');
  await tap('[data-act="hdr-back"]', 'voice-command-leave');
  await tap('.dlg [data-sheet-act="ok"]', 'voice-command-leave-ok');
  await expect('hub');
  await command('투약'); // no patient → 바코드 스캔 first
  await expect('scan');

  // 바코드 스캔 → 뒤로가기 asks before leaving
  await tap('[data-act="hdr-back"]', 'scan-back');
  await expectDialog('환자정보 초기화');
  await tap('.dlg [data-sheet-act="cancel"]', 'reset-cancel');
  await expect('scan');
  await scanWedge('#FAIL');
  await expectDialog('바코드 인식 불가');
  await tap('.dlg [data-sheet-act="ok"]', 'fail-ok');
  // the wristband alone activates the 투약 list (no 처방 바코드 step): 고위험약물 → 1차 인증 opens at once
  await tap('[data-act="scan"]', 'ham-first');
  await expect('ham');
  await tap('[data-act="hdr-close"]', 'ham-close-first');
  await expect('task');
  if (!(await page.$('.task-b'))) throw new Error('the wristband should open the active 투약 list');
  await scanWedge('D9999');
  await expectDialog('환자/처방 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'mismatch-ok');
  await tap('[data-act="prn-info"]', 'prn-popup');
  await expectDialog('PRN 처방');
  await tap('.dlg [data-sheet-act="ok"]', 'prn-ok');
  await tap('[data-act="administer"]', 'ham-again'); // 인증 전 투약수행 → 1차 인증 again
  await expect('ham');
  await tap('[data-act="next"]', 'ham-incomplete');
  await expectDialog('');
  for (let i = 0; i < 5; i++) await page.click(`.ham-check[data-i="${i}"]`), await sleep(120);
  await tap('[data-act="next"]', 'ham-second-popup');
  await expectDialog('고위험약물 2차 인증');
  await scanWedge('NURSE-RFID-77');
  const second = await page.$eval('.ham-nurse .v', (e) => e.textContent.trim());
  if (second !== '김수아 간호사 N23240183') throw new Error(`2nd nurse not set by RFID: ${second}`);
  // 전체 확인: one tap checks all 5, a second tap clears them, a third checks them again
  await tap('[data-act="check-all"]', 'ham-check-all');
  if ((await page.$$('.ham-check.on')).length !== 5) throw new Error('전체 확인 should check every item');
  await tap('[data-act="check-all"]', 'ham-uncheck-all');
  if ((await page.$$('.ham-check.on')).length !== 0) throw new Error('전체 확인 again should clear them');
  await tap('[data-act="check-all"]', 'ham-check-all-2');
  const cnt = await page.$eval('.ham-count', (e) => e.textContent);
  if (cnt !== '확인 항목 5 / 5') throw new Error(`check count: ${cnt}`);
  await tap('[data-act="next"]', 'ham-done');
  const who = await page.$$eval('.ham-who .v', (els) => els.map((e) => e.textContent.trim()).join(' / '));
  console.log('이중점검:', who);
  await tap('[data-act="next"]', 'task-after-ham');
  await expect('task');
  const pending = await page.$('.sticky-foot.ham-pending');
  if (pending) throw new Error('투약수행 should be enabled after the double check');

  // sheets on the list
  await tap('.alarm-pill[data-id="o1"]', 'time-sheet');
  await tap('.sheet .opt[data-v="21:00"]', 'time-picked');
  await sleep(300);
  const t = await page.$eval('.alarm-pill[data-id="o1"]', (e) => e.textContent.trim());
  if (t !== '21:00') throw new Error(`time not updated: ${t}`);
  await tap('.tag[data-id="o3"]', 'status-sheet');
  await tap('.sheet .opt[data-v="H"]', 'status-H');
  await sleep(300);
  const st = await page.$eval('.tag[data-id="o3"]', (e) => e.textContent.trim() + '|' + e.className);
  if (!st.startsWith('H') || !st.includes('no')) throw new Error(`status not updated: ${st}`);
  if (await page.$('.tag.off[data-act]')) throw new Error('PRN status should not be selectable');
  if (await page.$('.alarm-pill.off[data-act]')) throw new Error('PRN time should not be selectable');

  // 투약 리스트 삭제: 왼쪽 스와이프 → 삭제 · 취소 (길게 누르기도 같음) → 사유 → 이번 투약에서 제외 · 되돌리기
  if (await page.$('.mswipe[data-id="o4"]')) throw new Error('PRN cards should not swipe');
  await swipeLeft('.mswipe[data-id="o1"] > .med-card');
  if (!(await page.$('.mswipe[data-id="o1"].open'))) throw new Error('swipe left should show 삭제 · 취소');
  await tap('.mswipe[data-id="o1"] [data-act="swipe-close"]', 'swipe-cancel');
  if (await page.$('.mswipe.open')) throw new Error('취소 should close the row');
  await longPress('.mswipe[data-id="o1"] > .med-card');
  if (!(await page.$('.mswipe[data-id="o1"].open'))) throw new Error('long-press should show 삭제 · 취소');
  await tap('.mswipe[data-id="o1"] [data-act="excl"]', 'excl-sheet');
  await tap('.sheet .opt[data-i="1"]', 'excl-N');
  await sleep(400);
  const ex = await page.evaluate(() => ({
    n: document.querySelector('.medlist-head .badge').textContent,
    head: document.querySelector('.excl-head')?.textContent,
    why: document.querySelector('.excl-row')?.textContent.replace(/\s+/g, ' '),
  }));
  console.log('제외:', ex);
  if (ex.n !== '총 4건' || !ex.head?.includes('1건') || !ex.why?.includes('금식')) throw new Error(`exclusion: ${JSON.stringify(ex)}`);
  await tap('[data-act="excl-undo"]', 'excl-undo');
  if (await page.$('.excl-head')) throw new Error('되돌리기 should put it back');
  await swipeLeft('.mswipe[data-id="o1"] > .med-card');
  await tap('.mswipe[data-id="o1"] [data-act="excl"]', 'excl-sheet-2');
  await tap('.sheet .opt[data-i="1"]', 'excl-N-2');
  await sleep(400);

  await tap('.pcard[data-act="patient-detail"] .pcard-row', 'detail');
  await expect('detail');
  await tap('[data-act="hdr-back"]', 'back-to-task');
  await expect('task');
  await tap('[data-act="voice"]', 'voice-record');
  await sleep(5200);
  await shot('voice-transcribed');
  await page.type('#note', '안색이 좋지않음..');
  await tap('[data-act="send-note"]', 'voice-note-sent');
  await tap('[data-act="finish-record"]', 'voice-review');
  await tap('[data-act="toggle-script"]', 'voice-script-open');
  if (!(await page.$eval('.resum', (e) => e.disabled))) throw new Error('다시 요약하기 should wait for a script edit');
  await page.click('.vr-chat [data-line="1"]');
  await page.keyboard.press('End');
  await page.keyboard.type(' (통증 2점)');
  await sleep(100);
  if (await page.$eval('.resum', (e) => e.disabled)) throw new Error('editing the script should enable 다시 요약하기');
  await tap('[data-act="resummarize"]', 'voice-resummarize');
  await sleep(1400);
  const edited = await page.$eval('.vr-chat [data-line="1"]', (e) => e.textContent);
  if (!edited.includes('(통증 2점)')) throw new Error('script edit was lost after re-summarising');
  await tap('[data-act="save"]', 'voice-done');
  await tap('[data-act="finish"]', 'back-to-task-2');
  await expect('task');

  await tap('[data-act="administer"]', 'done');
  await expect('done');
  const exToast = await page.$eval('#toast', (e) => e.textContent);
  if (!exToast.includes('제외한 1건')) throw new Error(`투약수행 should record the exclusion: ${exToast}`);
  await tap('[data-act="ok"]', 'scan-after-done');
  await expect('scan');

  // 처방 먼저: the patient card warns that the wristband is not scanned yet
  await scanWedge('D1003');
  await expect('task');
  if (!(await page.$('.scan-warn'))) throw new Error('patient-scan warning missing');
  await scanWedge('P21212457');
  if (await page.$('.scan-warn')) throw new Error('warning should go away after the patient scan');
  const hist = await page.$$eval('.med-card', (els) => els.map((e) => e.querySelectorAll('.trow:not(.now)').length).join(','));
  console.log('history rows per card after administration:', hist);
  await tap('[data-act="hdr-menu"]', 'reset-menu');
  await expectDialog('환자정보 초기화');
  await tap('.dlg [data-sheet-act="ok"]', 'navmenu');
  await expect('navmenu');

  // ---------- 채혈하기 (from the 햄버거메뉴) ----------
  await tap('.nav-item[data-k="bld"]', 'bld-scan');
  await expect('wscan');
  // 채혈관 before the patient → asks for the patient first
  await scanWedge('B1001');
  await expectDialog('환자 스캔 필요');
  await tap('.dlg [data-sheet-act="ok"]', 'bld-patient-first');
  await tap('[data-act="scan"]', 'bld-patient');
  await expect('wtask');
  const btnText = () => page.$eval('.sticky-foot .btn', (e) => e.textContent.trim());
  if ((await btnText()) !== '채혈관 바코드 스캔') throw new Error(`first tube button: ${await btnText()}`);
  await scanWedge('B9999');
  await expectDialog('환자/채혈관 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'bld-mismatch-ok');
  await tap('[data-act="scan-tube"]', 'bld-tube-1');
  if ((await btnText()) !== '다른 채혈관 바코드 스캔') throw new Error(`2nd tube button: ${await btnText()}`);
  await scanWedge('B1001');
  const dup = await page.$eval('.badge.count-grad', (e) => e.textContent);
  if (dup !== '채혈관 1/2') throw new Error(`a repeated tube must not count twice: ${dup}`);
  await tap('[data-act="scan-tube"]', 'bld-tube-2');
  if ((await btnText()) !== '채혈 확인') throw new Error(`confirm button: ${await btnText()}`);
  const okCards = await page.$$eval('.wcard.tube.ok', (els) => els.length);
  if (okCards !== 2) throw new Error(`confirmed tubes: ${okCards}`);
  await tap('[data-act="blood-confirm"]', 'bld-done');
  await expect('wdone');
  const doneTitle = await page.$eval('.status-title', (e) => e.textContent);
  if (doneTitle !== '채혈 완료') throw new Error(`done title: ${doneTitle}`);
  await tap('[data-act="ok"]', 'hub-from-bld');
  await expect('hub');

  // ---------- 수혈하기: 혈액백 = 혈액번호 + 혈액제제 바코드, 혈액백마다 고위험수행 이중확인 ----------
  await command('수혈');
  await expect('wscan');
  await scanWedge('T1002'); // Red Cell's 혈액제제 first: it names 김철수, the wristband is still missing
  await expect('wtask');
  if (!(await page.$('.scan-warn'))) throw new Error('수혈: patient-scan warning missing');
  await scanWedge('P21212457');
  await expect('wtask'); // no auto check: the list first
  if (await page.$('.scan-warn')) throw new Error('수혈: warning should go away after the wristband');
  if (await page.$('.wcard .tag, .wcard .alarm-pill')) throw new Error('수혈 list should not have the time / flag row');
  const hintNow = () => page.$eval('.tube-hint', (e) => e.textContent);
  if (!(await hintNow()).includes('혈액번호를 스캔')) throw new Error(`the 혈액제제 read first should ask for its 혈액번호: ${await hintNow()}`);
  await scanWedge('0918039240'); // White Cell's 혈액번호 with Red Cell's 혈액제제
  await expectDialog('혈액번호/혈액제제 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'trf-pair-mismatch-ok');
  await scanWedge('0918039242'); // 혈액번호 first …
  if ((await unitsNow()).split(' ')[2] !== '0918039242:half') throw new Error(`half-scanned bag: ${await unitsNow()}`);
  await scanWedge('T1002'); // … then its 혈액제제
  const kimUnits = await unitsNow();
  console.log('김철수 혈액번호:', kimUnits);
  if (!kimUnits.includes('0918039242:ok') || !kimUnits.includes('0918039241:wait')) throw new Error(`bag not confirmed: ${kimUnits}`);
  const kimN = await page.$$eval('.unit-n', (els) => els.map((e) => e.textContent).join(' / '));
  if (kimN !== '확인 0 / 1 / 확인 1 / 7') throw new Error(`확인 counts: ${kimN}`);
  if ((await footBtns()) !== '혈액 스캔|수행하기') throw new Error(`수혈 buttons: ${await footBtns()}`);
  await tap('[data-act="perform"]', 'trf-check-first');
  await expect('ham');
  const trfTitle = await page.$eval('.ham-hero .status-title', (e) => e.textContent);
  if (trfTitle !== '수혈하기 1차 인증') throw new Error(`trf check title: ${trfTitle}`);
  const kimBag = await page.$eval('.ham-card .ham-sub', (e) => e.textContent);
  if (!kimBag.includes('0918039242') || !kimBag.includes('1/8 단위')) throw new Error(`이중 인증 is for the confirmed bag: ${kimBag}`);
  for (let i = 0; i < 4; i++) await page.click(`.ham-check[data-i="${i}"]`), await sleep(120);
  await tap('[data-act="next"]', 'trf-second-popup');
  await expectDialog('고위험수행 이중 확인');
  await scanWedge('NURSE-RFID-77');
  const rows = await page.$$eval('.ham-nurse', (els) => els.map((e) => (e.classList.contains('filled') ? '■' : '□') + e.textContent.trim()).join(' / '));
  console.log('수혈 2차:', rows);
  if (!rows.startsWith('■1차') || !rows.includes('김수아 간호사 N23240183')) throw new Error('수혈 2차 rows wrong');
  for (let i = 0; i < 4; i++) await page.click(`.ham-check[data-i="${i}"]`), await sleep(120);
  await tap('[data-act="next"]', 'trf-check-done');
  await tap('[data-act="next"]', 'trf-run');
  await expect('trfrun'); // 이중 확인 완료 → 수혈 진행 화면 (수혈 시작 전)
  const kimBags = await page.$eval('.tr-name .badge', (e) => e.textContent);
  if (kimBags !== '1/8 단위') throw new Error(`김철수 units: ${kimBags}`);
  const runUnit = await page.$eval('.tr-sub b', (e) => e.textContent);
  if (runUnit !== '0918039242') throw new Error(`수혈 진행 bag: ${runUnit}`);
  // before 수혈 시작 the list is still reachable, and the bag's 이중 인증 still counts
  await tap('[data-act="hdr-back"]', 'trf-list');
  await expect('wtask');
  await tap('[data-act="perform"]', 'trf-run-2');
  await expect('trfrun');
  await tap('[data-act="speed"][data-s="600"]', 'trf-speed-600');
  await tap('[data-act="start"]', 'trf-start');
  if ((await trfStatus()) !== '수혈 중') throw new Error(`수혈 status after start: ${await trfStatus()}`);
  await tap('[data-act="hdr-back"]', 'trf-back-blocked');
  await expectDialog('수혈 진행 중');
  await tap('.dlg [data-sheet-act="ok"]', 'trf-back-blocked-ok');
  await waitFor(() => document.querySelector('.dlg-title')?.textContent === '15분 중간 체크', '15분 체크 popup');
  await tap('.dlg [data-sheet-act="ok"]', 'trf-check-15');
  await expect('trfcheck');
  await tap('[data-act="react"][data-i="1"]', 'trf-react-chill');
  const stopBtn = await page.$eval('.screen-foot .btn', (e) => e.textContent);
  if (stopBtn !== '이상반응 · 긴급 종료') throw new Error(`reaction button: ${stopBtn}`);
  await tap('[data-act="check-stop"]', 'trf-react-stop');
  await expectDialog('수혈 긴급 종료');
  await tap('.dlg [data-sheet-act="ok"]', 'trf-stopped');
  await expect('trfdone');
  const kimDone = await page.evaluate(() => ({
    title: document.querySelector('.status-title').textContent,
    stop: document.querySelector('.tr-log-total.stop b')?.textContent || '',
  }));
  console.log('김철수 수혈:', kimDone);
  if (kimDone.title !== '수혈 중단' || !kimDone.stop.includes('오한')) throw new Error('김철수 수혈 중단 record wrong');
  await tap('[data-act="ok"]', 'trf-scan-again');
  await expect('wscan');
  await tap('[data-act="hdr-menu"]', 'trf-leave');
  await tap('.dlg [data-sheet-act="ok"]', 'navmenu-from-trf');
  await expect('navmenu');

  // ---------- 활력징후 ----------
  await tap('.nav-item[data-k="vital"]', 'vital-scan');
  await expect('wscan');
  await tap('[data-act="scan"]', 'vital-task');
  await expect('vital');
  if ((await page.$eval('#root', (e) => e.dataset.bg)) !== 'green') throw new Error('활력징후 should use the green theme');
  if (await page.$('.scr-vital [data-act="mode"]')) throw new Error('활력징후 should not have 플랜 / 실시간');
  // cells start empty, the previous record under each one
  const firstCells = await page.$$eval('.vval', (els) => els.map((e) => e.value).join(''));
  if (firstCells) throw new Error(`활력징후 cells should start empty: ${firstCells}`);
  const prevSbp = await page.$eval('.vt-cell[data-k="SBP"] .vt-prev', (e) => e.textContent);
  if (prevSbp !== '이전 118 · 15:30') throw new Error(`previous SBP: ${prevSbp}`);
  if ((await page.$eval('.hdr-title', (e) => e.textContent)) !== '활력징후') throw new Error('활력징후 header should be the 업무명');
  // tapping an empty cell fills the previous value (selected, so typing replaces it)
  await page.click('.vval[data-k="DBP"]');
  await sleep(150);
  const dbpFilled = await page.$eval('.vval[data-k="DBP"]', (e) => [e.value, e.selectionStart, e.selectionEnd].join(','));
  if (dbpFilled !== '76,0,2') throw new Error(`tap should fill the previous DBP, selected: ${dbpFilled}`);
  if (!(await page.$('.vt-cell[data-k="PR"] .vt-prev b.danger'))) throw new Error('a previous 경고 value should be red');
  await tap('[data-act="vstep"][data-k="SBP"][data-d="1"]', 'vital-sbp-plus'); // from the previous 118
  const sbp = await page.$eval('.vval[data-k="SBP"]', (e) => e.value);
  if (sbp !== '119') throw new Error(`SBP stepper: ${sbp}`);
  await page.click('.vval[data-k="BT"]', { clickCount: 3 });
  await page.type('.vval[data-k="BT"]', '39.2');
  await sleep(150);
  const bt = await page.$eval('.vt-cell[data-k="BT"] .vflag-tag', (e) => e.textContent + '|' + e.className);
  if (!bt.startsWith('경고')) throw new Error(`BT flag: ${bt}`);
  // 측정 시간: 지금 → 시 · 분 (1분 단위)
  await tap('[data-act="time-sheet"]', 'vital-time-sheet');
  await page.click('.sheet.vtime [data-sheet-act="m"][data-d="1"]');
  await page.click('.sheet.vtime [data-sheet-act="m"][data-d="1"]');
  await page.click('.sheet.vtime [data-sheet-act="h"][data-d="-1"]');
  const picked = await page.$eval('.sheet.vtime', (s) => `${s.querySelector('[data-v="h"]').textContent}:${s.querySelector('[data-v="m"]').textContent}`);
  await tap('.sheet.vtime [data-sheet-act="ok"]', 'vital-time-ok');
  const foot = await page.$eval('.vtime-btn b', (e) => e.textContent);
  if (foot !== picked) throw new Error(`측정 시간 not applied: ${foot} (picked ${picked})`);
  // 초기화 empties the cells; 음성 입력 fills all six, then BT is corrected by hand and saved
  await tap('[data-act="vreset"]', 'vital-reset');
  if (await page.$$eval('.vval', (els) => els.some((e) => e.value))) throw new Error('초기화 should empty the cells');
  await tap('[data-act="save"]', 'vital-save-empty');
  if (!(await page.$eval('#toast', (e) => e.textContent)).includes('값을 입력해')) throw new Error('empty cells must not be saved');
  const vHeard = await voiceDemo('vital');
  const voiced = await page.$$eval('.vval', (els) => els.map((e) => e.value).join(' '));
  console.log('음성 입력:', vHeard, '→', voiced);
  if (voiced.split(' ').filter(Boolean).length !== 6) throw new Error(`voice should fill all six: ${voiced}`);
  await page.click('.vval[data-k="BT"]', { clickCount: 3 });
  await page.type('.vval[data-k="BT"]', '37.9');
  await tap('[data-act="save"]', 'vital-done');
  await expect('wdone');
  await tap('[data-act="ok"]', 'vital-scan-again');
  await expect('wscan');
  await scanWedge('P21212457');
  await tap('.pcard[data-act="patient-detail"] .pcard-row', 'vital-detail');
  await expect('detail');
  const saved = await page.$$eval('.vgrid .vcell', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  console.log('임상관찰기록:', saved);
  if (!saved.includes('37.9')) throw new Error('saved BT not shown on the detail screen');
  const savedAt = await page.$eval('.dcard.vitals .dcard-meta', (e) => e.textContent);
  if (!savedAt.includes(picked)) throw new Error(`saved 측정 시간: ${savedAt} (picked ${picked})`);

  // ---------- 사용자설정: alarms and quick menu change the hub ----------
  await tap('[data-act="hdr-menu"]', 'detail-menu');
  await tap('.dlg [data-sheet-act="ok"]', 'navmenu-from-detail');
  await tap('[data-act="home"]', 'home');
  await expect('hub');
  await tap('[data-act="open-setting"]', 'setting');
  await expect('setting');
  // 김철수's 투약 is done (above), so only 수혈 (정민호) and 활력징후 (안소율) are still urgent
  const statOf = () => page.$eval('.set-stat b', (e) => e.textContent);
  if ((await statOf()) !== '2건') throw new Error(`긴급처리업무 after 김철수 투약: ${await statOf()}`);
  await tap('.tgl[data-k="trf"]', 'alarm-trf-off');
  if ((await statOf()) !== '1건') throw new Error(`긴급처리업무 count after turning 수혈 off: ${await statOf()}`);
  await tap('.tgl[data-k="trf"]', 'alarm-trf-on');
  await tap('.vstep[data-act="alarm-min"][data-k="trf"][data-d="-1"]', 'alarm-trf-20');
  await tap('.set-slot[data-i="3"]', 'slot4-depth1');
  await tap('.sheet .opt[data-v="measure"]', 'slot4-depth2');
  await tap('.sheet .opt[data-v="body"]', 'slot4-body');
  await sleep(300);
  await tap('[data-act="hdr-close"]', 'hub-after-setting');
  await expect('hub');
  const hub = await page.evaluate(() => ({
    head: document.querySelector('.tab-urgent .hub-headline').textContent.replace(/\s+/g, ' '),
    chips: [...document.querySelectorAll('.ucard .gchip')].map((e) => e.textContent).join(' / '),
    tasks: [...document.querySelectorAll('.ucard-tname')].map((e) => e.textContent).join(' / '),
    quick: [...document.querySelectorAll('.shortcut span')].map((e) => e.textContent).join(' / '),
  }));
  console.log('hub after settings:', hub);
  if (!hub.head.includes('2건') || !hub.chips.includes('수혈 오더 20분 경과') || hub.chips.includes('투약')) throw new Error('alarm settings not applied to 긴급 처리 업무');
  if (!hub.quick.endsWith('신체계측')) throw new Error('quick slot 4 not applied');
  if (hub.tasks !== '수혈 / V/S') throw new Error(`긴급 card 업무명: ${hub.tasks}`);

  // ---------- 햄버거메뉴 → 주사실 설정 ----------
  await tap('[data-act="hdr-menu"]', 'navmenu-2');
  await expect('navmenu');
  await tap('[data-act="room"]', 'room-sheet');
  await tap('.sheet .opt[data-v="항암주사실"]', 'room-picked');
  await sleep(300);
  const room = await page.$eval('.nav-tile small', (e) => e.textContent);
  if (room !== '항암주사실') throw new Error(`주사실 not shown: ${room}`);
  await tap('[data-act="hdr-close"]', 'hub-from-navmenu');
  await expect('hub');

  // ---------- 음성간호메모 메인 → 환자별 검토 ----------
  await command('메모 목록'); // + → 음성메모 now records right away; the list is a command / hamburger tile
  await expect('vmain');
  const before = await page.$eval('.vmain .hub-headline', (e) => e.textContent.replace(/\s+/g, ' '));
  await tap('[data-act="open-memos"]', 'vpatient');
  await expect('vpatient');
  const firstType = await page.$eval('.memo-card .memo-head b', (e) => e.textContent);
  if (firstType !== '투약하기') throw new Error(`saved memo should be listed first: ${firstType}`);
  await tap('.memo-card:nth-of-type(2) [data-act="script"]', 'memo-script-open');
  await tap('.memo-check:not(.on)', 'memo-reviewed');
  const left = await page.$$eval('.memo-card .gchip', (els) => els.map((e) => e.textContent).join(' / '));
  if (left.includes('확인대기')) throw new Error(`memo still 확인대기: ${left}`);
  await tap('[data-act="tab"][data-t="round"]', 'memo-round');
  await tap('[data-act="hdr-back"]', 'vmain-2');
  const after = await page.$eval('.vmain .hub-headline', (e) => e.textContent.replace(/\s+/g, ' '));
  console.log('확인대기:', before, '→', after);
  if (before === after) throw new Error('확인대기 count did not change');

  // ---------- 로그아웃: settings back to default ----------
  await command('로그아웃');
  await expectDialog('로그아웃 안내');
  await tap('.dlg [data-sheet-act="ok"]', 'logout');
  await expect('splash');
  await tap('[data-act="login-id"]', 'login-again');
  await page.type('#emp', '20251234');
  await page.type('#pw', 'pass');
  await tap('[data-act="login"]', 'hub-again');
  const reset = await page.$eval('.tab-urgent .hub-headline', (e) => e.textContent.replace(/\s+/g, ' '));
  if (!reset.includes('3건')) throw new Error(`settings should reset on logout: ${reset}`);

  // ---------- 샘플 환자별 업무 ----------
  const title = () => page.$eval('.hdr-title', (e) => e.textContent.trim());
  // the patient's 이름(등록번호) is in the patient box / strip, the header shows the 업무명
  const shownPatient = () =>
    page.evaluate(() => {
      const n = document.querySelector('#screens .screen .pn');
      return n ? `${n.textContent}(${n.parentElement.querySelector('.pid').textContent})` : '';
    });
  const expectTitle = async (t) => {
    if (/\(\d{8}\)$/.test(t)) {
      if ((await shownPatient()) !== t) throw new Error(`expected patient ${t}, got ${await shownPatient()}`);
      if (/\(\d{8}\)/.test(await title())) throw new Error(`the header should show the 업무명, not ${await title()}`);
      return;
    }
    if ((await title()) !== t) throw new Error(`expected header ${t}, got ${await title()}`);
  };
  const urgentHead = () => page.$eval('.tab-urgent .hub-headline', (e) => e.textContent.replace(/\s+/g, ' '));
  const leaveToHub = async (label) => {
    await tap('[data-act="hdr-back"]', label);
    await tap('.dlg [data-sheet-act="ok"]', `${label}-ok`);
    await expect('hub');
  };
  const goMy = async () => {
    await command('내 환자');
    if ((await hubTab()) !== 'my') throw new Error('MY환자 page did not open');
  };
  const sheetRows = () =>
    page.$$eval('.sheet .task-opt', (els) => els.map((e) => `${e.dataset.k}:${e.querySelector('.task-st').textContent}${e.classList.contains('off') ? '(off)' : ''}`).join(' / '));
  const passChecks = async (n, label) => {
    for (let i = 0; i < n; i++) await page.click(`.ham-check[data-i="${i}"]`), await sleep(100);
    await tap('[data-act="next"]', `${label}-second`);
    await scanWedge('NURSE-RFID-77');
    for (let i = 0; i < n; i++) await page.click(`.ham-check[data-i="${i}"]`), await sleep(100);
    await tap('[data-act="next"]', `${label}-check-done`);
    await tap('[data-act="next"]', `${label}-task`);
  };

  // 긴급 처리 업무 → 정민호 수혈: the scan button reads 정민호's wristband
  await tap('.ucard[data-pid="20812233"]', 'urgent-trf-jmh');
  await expect('wscan');
  await expectTitle('수혈하기');
  await tap('[data-act="scan"]', 'jmh-wristband');
  await expect('wtask');
  await expectTitle('정민호(20812233)');
  // 수혈 오더 straight away — no 처방 스캔 step; nothing to give until a bag's two barcodes are scanned
  const jmhList = await page.evaluate(() => ({
    status: document.querySelector('.status-title')?.textContent || '',
    cards: [...document.querySelectorAll('.wcard .wcard-name')].map((e) => e.textContent.trim()),
    button: document.querySelector('.sticky-foot .btn')?.textContent,
  }));
  console.log('정민호 수혈 목록:', jmhList);
  if (jmhList.status || jmhList.cards.length !== 1 || jmhList.button !== '혈액 바코드 스캔') throw new Error('정민호: wristband should open the 수혈하기 list');
  await scanWedge('T1002'); // 김철수's 혈액 제제
  await expectDialog('환자/처방 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'jmh-mismatch-ok');
  // bag 1: the scan button reads its 혈액번호, then its 혈액제제; only that bag is given, 0918039312 stays 대기
  await tap('[data-act="scan-bag"]', 'jmh-bag1-unit');
  await tap('[data-act="scan-bag"]', 'jmh-bag1-code');
  if ((await unitsNow()) !== '0918039311:ok 0918039312:wait') throw new Error(`정민호 bag 1: ${await unitsNow()}`);
  await tap('[data-act="perform"]', 'jmh-check-first');
  await expect('ham');
  const jmhUnits = await page.$eval('.ham-card .ham-sub', (e) => e.textContent);
  if (!jmhUnits.includes('0918039311') || !jmhUnits.includes('1/2 단위')) throw new Error(`정민호 혈액번호: ${jmhUnits}`);
  await passChecks(4, 'jmh');
  await expect('trfrun');
  await tap('[data-act="speed"][data-s="600"]', 'jmh-speed-600');
  for (const n of [1, 2]) {
    if (n === 2) {
      // same 항목: no new 이중 인증 — the next bag needs only its 혈액번호, right on the 수혈 진행 화면
      await expect('trfrun');
      if ((await trfStatus()) !== '다음 혈액백 대기') throw new Error(`between bags: ${await trfStatus()}`);
      await scanWedge('0918039999'); // not this patient's blood
      await expectDialog('환자/처방 불일치');
      await tap('.dlg [data-sheet-act="ok"]', 'jmh-unit-mismatch-ok');
      await scanWedge('0918039311');
      if ((await page.$eval('#toast', (e) => e.textContent)) !== '이미 수혈한 혈액입니다.') throw new Error('a given bag should be refused');
      await scanWedge('T6001');
      if (!(await page.$eval('#toast', (e) => e.textContent)).includes('혈액번호만')) throw new Error('the 혈액제제 is not needed for the next bag');
      await scanWedge('0918039312');
      if ((await trfStatus()) !== '수혈 대기') throw new Error(`bag 2 should be ready: ${await trfStatus()}`);
      const bag2 = await page.evaluate(() => [document.querySelector('.tr-sub b').textContent, document.querySelector('.tr-name .badge').textContent].join(' '));
      if (bag2 !== '0918039312 2/2 단위') throw new Error(`bag 2: ${bag2}`);
      if (!(await page.$('[data-act="speed"][data-s="600"].on'))) throw new Error('the demo speed should carry over to the next bag');
      // before 수혈 시작 the list shows it confirmed, and 수행하기 comes straight back (no 이중 인증)
      await tap('[data-act="hdr-back"]', 'jmh-list-2');
      await expect('wtask');
      if ((await unitsNow()) !== '0918039311:done 0918039312:ok') throw new Error(`정민호 bag 2: ${await unitsNow()}`);
      await tap('[data-act="perform"]', 'jmh-run-2');
      await expect('trfrun');
    }
    await tap('[data-act="start"]', `jmh-start-${n}`);
    await waitFor(() => document.querySelector('.dlg-title')?.textContent === '15분 중간 체크', `정민호 15분 체크 ${n}`);
    await tap('.dlg [data-sheet-act="ok"]', `jmh-check-${n}`);
    if (n === 1) {
      await tap('[data-act="check-ok"]', 'jmh-check-empty');
      if ((await screen()) !== 'trfcheck') throw new Error('the 15분 체크 needs its vitals');
    }
    await voiceDemo(`jmh-check-${n}`);
    await tap('[data-act="check-ok"]', `jmh-check-ok-${n}`);
    await expect('trfrun');
    await waitFor(() => document.querySelector('[data-act="complete"]'), `정민호 bag ${n} empty`);
    await tap('[data-act="complete"]', `jmh-unit-done-${n}`);
  }
  await expect('trfdone');
  const jmhDone = await page.evaluate(() => ({
    title: document.querySelector('.status-title').textContent,
    units: document.querySelector('.tr-log-head .badge').textContent,
    rows: [...document.querySelectorAll('.tr-log-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    total: document.querySelector('.tr-log-total b').textContent,
  }));
  console.log('정민호 수혈:', jmhDone);
  if (jmhDone.title !== '수혈 완료' || jmhDone.units !== '2/2 단위 완료' || jmhDone.total !== '600 ml') throw new Error('정민호 수혈 record wrong');
  // unit 2 starts after unit 1 ended on the demo clock
  const [end1, start2] = [jmhDone.rows[0].match(/–(\d\d:\d\d)/)[1], jmhDone.rows[1].match(/(\d\d:\d\d)–/)[1]];
  if (start2 < end1 && end1 < '22:00') throw new Error(`unit 2 starts ${start2} before unit 1 ends ${end1}`);
  await tap('[data-act="ok"]', 'jmh-scan-again');
  await leaveToHub('jmh-leave');
  if (!(await urgentHead()).includes('2건')) throw new Error(`정민호 수혈 card should be gone: ${await urgentHead()}`);
  if (await page.$('.ucard[data-pid="20812233"]')) throw new Error('정민호 긴급 card still shown');

  // MY환자 → 강태우 → 업무 선택 시트
  await goMy();
  const jmhChip = await page.$eval('.myrow[data-pid="20812233"] .gchip', (e) => e.textContent);
  if (jmhChip !== '수혈완료') throw new Error(`정민호 MY chip: ${jmhChip}`);
  await tap('.myrow[data-pid="20733345"]', 'my-ktw');
  const ktwRows = await sheetRows();
  console.log('강태우 업무:', ktwRows);
  if (ktwRows !== 'med:대기 3건 / bld:대기 1관 / trf:오더 없음(off) / vital:17:00 예정') throw new Error(`강태우 sheet: ${ktwRows}`);
  await tap('.sheet .task-opt[data-k="med"]', 'ktw-med');
  // a chosen patient: their 투약 list first, locked until the wristband is scanned
  await expect('task');
  await expectTitle('강태우(20733345)');
  if (!(await page.$('.task-lock'))) throw new Error('강태우: the 투약 list should open locked');
  const locked = await page.$$eval('.task-lock .med-card', (els) => els.length);
  if (!locked) throw new Error('the locked list should show the 투약 orders');
  if (await page.$('.task-lock [data-act="status-sheet"], .task-lock [data-act="time-sheet"], .task-lock .mswipe')) throw new Error('a locked list must not be editable');
  if ((await footBtns()) !== '환자 팔찌 스캔') throw new Error(`locked list button: ${await footBtns()}`);
  const ktwCard = await page.$eval('.pcard', (e) => e.textContent.replace(/\s+/g, ' '));
  if (!ktwCard.includes('케톤산증') || !ktwCard.includes('033-05-01')) throw new Error(`강태우 card: ${ktwCard}`);
  if (await page.$('.pcard .mini-badge.infection')) throw new Error('강태우 has no infection — no icon');
  await scanWedge('D1001'); // 김철수's 처방
  await expectDialog('환자/처방 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'ktw-mismatch-ok');
  await scanWedge('P21212457'); // another patient's wristband is asked about
  await expectDialog('환자 불일치');
  await tap('.dlg [data-sheet-act="cancel"]', 'ktw-other-cancel');
  await expectTitle('강태우(20733345)');
  await tap('[data-act="scan-patient"]', 'ktw-drug'); // 강태우's wristband → active; 염화칼륨 = 고위험약물
  await expect('ham');
  const ktwHam = await page.$eval('.ham-drug', (e) => e.textContent);
  if (!ktwHam.includes('염화칼륨')) throw new Error(`강태우 고위험약물: ${ktwHam}`);
  // taking the 고위험약물 out of this round drops the 이중 인증; 되돌리기 needs it again
  await tap('[data-act="hdr-close"]', 'ktw-ham-close');
  await expect('task');
  const kcl = await page.$$eval('.mswipe[data-id]', (els) => els.find((e) => e.textContent.includes('염화칼륨'))?.dataset.id);
  await swipeLeft(`.mswipe[data-id="${kcl}"] > .med-card`);
  await tap(`.mswipe[data-id="${kcl}"] [data-act="excl"]`, 'ktw-excl');
  await tap('.sheet .opt[data-i="3"]', 'ktw-excl-H');
  await sleep(400);
  if (await page.$('.sticky-foot.ham-pending')) throw new Error('excluding the 고위험약물 should drop the 이중 인증');
  const kt = await page.$eval('#toast', (e) => e.textContent);
  if (!kt.includes('이중 인증 없이')) throw new Error(`강태우 exclusion toast: ${kt}`);
  await tap('[data-act="excl-undo"]', 'ktw-undo');
  if (!(await page.$('.sticky-foot.ham-pending'))) throw new Error('되돌리기 should need the 이중 인증 again');
  await tap('[data-act="administer"]', 'ktw-ham-again');
  await expect('ham');
  await passChecks(5, 'ktw');
  await expect('task');
  await tap('[data-act="administer"]', 'ktw-done');
  await expect('done');
  await tap('[data-act="ok"]', 'ktw-scan-again');

  // another wristband on the scan screen switches the patient (덮어쓰기)
  await scanWedge('P20655321');
  await expect('task');
  await expectTitle('서동건(20655321)');
  await leaveToHub('sdg-leave');

  // a patient without that order: 강태우 has no 수혈
  await command('강태우 수혈');
  await expect('wscan');
  await tap('[data-act="scan"]', 'ktw-trf-scan');
  await expectDialog('수행할 오더 없음');
  await tap('.dlg [data-sheet-act="ok"]', 'ktw-no-trf-ok');
  await expect('wscan');
  await leaveToHub('ktw-trf-leave');

  // 긴급 처리 업무 → 안소율 활력징후 (이상치 재확인): same flow as 활력징후, saving clears the card
  await tap('.ucard[data-pid="20876654"]', 'urgent-vital-asy');
  await tap('[data-act="scan"]', 'asy-wristband');
  await expect('vital');
  await expectTitle('안소율(20876654)');
  // the abnormal previous values are shown in colour (이상치 재확인)
  if (!(await page.$('.vt-cell[data-k="SBP"] .vt-prev b.danger'))) throw new Error('안소율 previous SBP should be 경고');
  await voiceDemo('asy');
  for (const [k, v] of [['SBP', '108'], ['PR', '92']]) {
    await page.click(`.vval[data-k="${k}"]`, { clickCount: 3 });
    await page.type(`.vval[data-k="${k}"]`, v);
  }
  await tap('[data-act="save"]', 'asy-vital-done');
  await expect('wdone');
  await tap('[data-act="ok"]', 'asy-scan-again');
  await leaveToHub('asy-leave');
  if (!(await urgentHead()).includes('1건')) throw new Error(`안소율 card should be gone: ${await urgentHead()}`);

  // MY환자 → 문가은 채혈 (2관), another patient's tube is 불일치
  await goMy();
  await tap('.myrow[data-pid="21033456"]', 'my-mge');
  await tap('.sheet .task-opt[data-k="bld"]', 'mge-bld');
  await tap('[data-act="scan"]', 'mge-wristband');
  await expect('wtask');
  await expectTitle('문가은(21033456)');
  await scanWedge('B1001'); // 김철수's 채혈관
  await expectDialog('환자/채혈관 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'mge-mismatch-ok');
  await tap('[data-act="scan-tube"]', 'mge-tube-1');
  await tap('[data-act="scan-tube"]', 'mge-tube-2');
  await tap('[data-act="blood-confirm"]', 'mge-bld-done');
  await tap('[data-act="ok"]', 'mge-hub');
  await expect('hub');
  await goMy();
  await tap('.myrow[data-pid="21033456"]', 'my-mge-2');
  const mgeRows = await sheetRows();
  console.log('문가은 업무:', mgeRows);
  if (!mgeRows.includes('bld:완료 17:24(off)')) throw new Error(`문가은 채혈 should be done: ${mgeRows}`);
  await tap('.sheet .task-detail', 'mge-detail');
  await expect('detail');
  await expectTitle('문가은(21033456)');
  const mge = await page.evaluate(() => ({
    allergy: document.querySelector('.allergy .pills').textContent.trim(),
    infection: document.querySelector('.infection .pills').textContent.trim(),
    ai: document.querySelector('.ai-count').textContent,
  }));
  console.log('문가은 상세:', mge);
  if (mge.allergy !== 'Codeine' || mge.infection !== '없음' || mge.ai !== '총 1건') throw new Error('문가은 detail wrong');
  await tap('[data-act="hdr-back"]', 'mge-detail-back');
  await expect('hub');

  // 음성간호메모 메인 → 서동건's memos
  await tap('[data-act="hdr-menu"]', 'navmenu-memos');
  await tap('[data-act="memos"]', 'vmain-3');
  await expect('vmain');
  const memoRows = await page.$$eval('.memo-rows .myrow-name', (els) => els.map((e) => e.textContent).join(' / '));
  if (memoRows !== '김철수(21212457) / 문가은(21033456) / 서동건(20655321) / 안소율(20876654)') throw new Error(`vmain rows: ${memoRows}`);
  await tap('[data-act="open-memos"][data-pid="20655321"]', 'vpatient-sdg');
  await expectTitle('서동건(20655321)');
  const sdgMemo = await page.$eval('.memo-card .memo-head b', (e) => e.textContent);
  if (sdgMemo !== '활력징후') throw new Error(`서동건 memo: ${sdgMemo}`);
  await tap('[data-act="hdr-back"]', 'vmain-4');
  await tap('[data-act="hdr-menu"]', 'navmenu-home');
  await tap('[data-act="home"]', 'hub-plus');
  await expect('hub');

  // ---------- AI 커맨드바 + 4종 (환자 없이 시작) ----------
  const plus = async (act, label) => {
    await tap('[data-act="ai-more"]', `${label}-more`);
    await tap(`[data-act="${act}"]`, label);
  };
  // 음성메모: 녹음 → 환자 팔찌 스캔 → 검토 → 저장 → 목록
  await plus('ai-voice-memo', 'free-memo');
  await expect('voice');
  await expectTitle('음성메모');
  // the transcript appears line by line; the 2nd line is the patient's
  await waitFor(() => document.querySelectorAll('.tl-who').length >= 2, 'patient line', 6000);
  const speaker = await page.$$eval('.tl-who', (els) => els.map((e) => e.textContent).join(' | '));
  if (!speaker.includes('환자 ')) throw new Error(`unknown-patient speaker expected: ${speaker}`);
  // the 녹음 input's + is the same menu as the AI 커맨드바; leaving asks first
  await tap('.voice-foot [data-act="ai-more"]', 'free-memo-plus');
  const vchips = await page.$$eval('.voice-foot .ai-chips.open .ai-chip', (els) => els.map((e) => e.textContent).join(' / '));
  if (vchips !== '음성메모 / 사진 촬영 / 스캔 / 사진첨부') throw new Error(`녹음 + menu: ${vchips}`);
  await tap('.voice-foot [data-act="ai-monitor"]', 'free-memo-leave-ask');
  await expectDialog('음성메모 녹음 중');
  await tap('.dlg [data-sheet-act="cancel"]', 'free-memo-stay');
  await expect('voice');
  await tap('[data-act="finish-record"]', 'free-memo-finish');
  await expectDialog('환자 팔찌 스캔');
  await scanWedge('D2001'); // a prescription is not a wristband
  await expectDialog('환자 팔찌 스캔');
  await scanWedge('P20733345');
  await expect('voice');
  await expectTitle('강태우(20733345)');
  await tap('[data-act="toggle-script"]', 'free-memo-script');
  const speakers = await page.$$eval('.vr-chat .chat-who', (els) => els.map((e) => e.textContent).join(' | '));
  if (!speakers.includes('강태우')) throw new Error(`scanned patient should name the speaker: ${speakers}`);
  await tap('[data-act="save"]', 'free-memo-save');
  await tap('[data-act="to-memos"]', 'free-memo-list');
  await expect('vmain');
  const listed = await page.$$eval('.memo-rows .myrow-name', (els) => els.map((e) => e.textContent).join(' / '));
  if (!listed.includes('강태우(20733345)')) throw new Error(`강태우 memo not listed: ${listed}`);
  await tap('[data-act="hdr-menu"]', 'navmenu-home-2');
  await tap('[data-act="home"]', 'hub-plus-2');

  // 스캔: 팔찌 → 업무 선택 → 투약 (팔찌 확인된 채로) · 처방 → 투약 (처방 우선)
  await plus('ai-scan', 'qscan');
  await expect('qscan');
  await expectTitle('스캔');
  await scanWedge('P21033456');
  const qRows = await sheetRows();
  console.log('스캔 → 문가은:', qRows);
  await tap('.sheet .task-opt[data-k="med"]', 'qscan-med');
  await expect('task');
  await expectTitle('문가은(21033456)');
  if (await page.$('.scan-warn')) throw new Error('스캔: the wristband should already count');
  if (!(await page.$('.task-b'))) throw new Error('스캔 → 투약: the wristband should open the active list');
  await leaveToHub('qscan-leave');
  await plus('ai-scan', 'qscan-2');
  await scanWedge('D6001');
  await expect('task');
  await expectTitle('정민호(20812233)');
  if (!(await page.$('.scan-warn'))) throw new Error('스캔 → 처방: wristband warning expected');
  await leaveToHub('qscan-leave-2');

  // 사진 촬영: 촬영 → 환자 팔찌 스캔 → AI 분석 → 측정값 확인
  await plus('ai-monitor', 'camera');
  await expect('vcam');
  await waitFor(() => document.querySelector('.scr-vcam')?.dataset.phase === 'detected', '모니터 감지', 6000);
  await tap('[data-act="shoot"]', 'camera-shoot');
  await expectDialog('환자 팔찌 스캔');
  await scanWedge('P20876654');
  await waitFor(() => document.querySelector('.scr-vreview'), 'camera analysis', 8000);
  await expectTitle('안소율(20876654)');
  await tap('[data-act="hdr-close"]', 'camera-close');
  await expect('hub');

  // 사진첨부: 갤러리(브라우저는 시연 앨범) → 사진 선택 → 환자 팔찌 스캔(스캔하기 = 김철수) → AI 분석
  await plus('ai-attach', 'attach');
  await expect('vcam');
  await waitFor(() => document.querySelector('.sheet .album-item'), 'album', 3000);
  const tiles = await page.$$eval('.sheet.gallery .album-item', (els) => els.length);
  if (tiles < 20) throw new Error(`gallery should show many photos: ${tiles}`);
  if (!(await page.$eval('[data-sheet-act="attach"]', (e) => e.disabled))) throw new Error('첨부하기 should wait for a photo');
  await tap('.album-item[data-k="ok"]', 'attach-pick');
  await tap('[data-sheet-act="attach"]', 'attach-attach');
  await expectDialog('환자 팔찌 스캔');
  await tap('.dlg [data-sheet-act="scan"]', 'attach-wristband');
  await waitFor(() => document.querySelector('.scr-vreview'), 'attach analysis', 8000);
  await expectTitle('김철수(21212457)');
  const again = await page.$eval('[data-act="retake"]', (e) => e.textContent);
  if (again !== '다른 사진 선택') throw new Error(`attach review button: ${again}`);
  if (!(await page.$('.vfield[data-k="SBP"] .vt-prev'))) throw new Error('측정값 확인 should show the previous values');
  await voiceDemo('attach');
  const ocrBt = await page.$eval('.vfield[data-k="BT"]', (e) => e.className + '|' + e.querySelector('.vf-in').value);
  if (!ocrBt.includes('edited') || ocrBt.endsWith('|')) throw new Error(`voice should fill the unread 체온: ${ocrBt}`);
  await tap('[data-act="hdr-close"]', 'attach-close');

  // ---------- 앱 버전 · 업데이트 (시연) ----------
  await tap('[data-act="open-setting"]', 'ver-setting');
  const verNow = await page.$eval('.app-row .v b', (e) => e.textContent);
  if (verNow !== 'v0.4.0') throw new Error(`current version: ${verNow}`);
  if (await page.$('.ver-list')) throw new Error('버전 이력 should not be on the settings screen');
  await tap('[data-act="open-versions"]', 'ver-history');
  await expect('versions');
  // 현재 버전 opened, the others folded
  const opened = await page.$$eval('.ver-card.open .ver-head b', (els) => els.map((e) => e.textContent).join(','));
  if (opened !== 'v0.4.0') throw new Error(`버전 이력 opened cards: ${opened}`);
  await tap('[data-act="ver-toggle"][data-v="0.2.0"]', 'ver-open-0.2.0');
  await tap('[data-act="pick-version"][data-v="0.2.0"]', 'ver-pick-0.2.0');
  await expectDialog('이전 버전으로 변경');
  await tap('.dlg [data-sheet-act="ok"]', 'ver-rollback');
  await expect('update');
  await waitFor(() => document.querySelector('.scr-splash') && document.querySelector('.dlg-title')?.textContent === '필수 업데이트', '필수 업데이트', 10000);
  const oldVer = await page.$eval('.logo-ver', (e) => e.textContent);
  if (oldVer !== 'v0.2.0') throw new Error(`splash version after rollback: ${oldVer}`);
  await page.keyboard.press('Escape'); // closing it does not unlock the app
  await sleep(300);
  await tap('[data-act="login-id"]', 'ver-login-blocked');
  await expectDialog('필수 업데이트');
  await tap('.dlg [data-sheet-act="ok"]', 'ver-force-update');
  await waitFor(() => document.querySelector('.scr-splash .logo-ver')?.textContent === 'v0.4.0', 'updated to v0.4.0', 10000);
  await sleep(700);
  if (await dialog()) throw new Error(`latest version should not ask again: ${await dialog()}`);

  // ---------- 개인정보 자동 가림: 10초 무조작 → 가림, 터치 → 표시 ----------
  await tap('[data-act="login-bio"]', 'pii-login');
  await tap('[data-act="login"]', 'pii-hub');
  const marks = await page.$$eval('.ucard-name .pii', (els) => els.map((e) => e.dataset.m).join(' '));
  if (!marks.includes('김*수') || !marks.includes('2121****')) throw new Error(`masked forms: ${marks}`);
  const isMasked = () => page.$eval('html', (e) => e.classList.contains('pii-masked'));
  if (await isMasked()) throw new Error('names should show while the PDA is used');
  await sleep(10600);
  if (!(await isMasked())) throw new Error('names should be masked after 10s without a touch');
  const seen = await page.$eval('.ucard-name', (e) => getComputedStyle(e.querySelector('.pii'), '::after').content);
  console.log('masked name:', seen);
  await page.$eval('.hub-headline', (e) => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await sleep(100);
  if (await isMasked()) throw new Error('a touch should show the names again');
  console.log('\nRESULT: OK', errors.length ? `(page errors: ${errors.join(' | ')})` : '(no page errors)');
} catch (e) {
  console.log('\nRESULT: FAIL', e.message, errors.length ? `page errors: ${errors.join(' | ')}` : '');
  await shot('failure');
} finally {
  await browser.close();
}
