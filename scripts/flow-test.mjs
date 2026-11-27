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
// 수혈 목록: one card per 혈액팩 with its state (wait · half · ok · start · due · stop), and the footer buttons
const BAG_ST = ['wait', 'half', 'ok', 'start', 'due', 'stop'];
const bagsNow = () =>
  page.$$eval('.wcard.bag', (els, st) => els.map((e) => `${e.dataset.unit}:${[...e.classList].find((c) => st.includes(c))}`).join(' '), BAG_ST);
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

  // + menu → 사진 (사진 촬영 + 사진첨부 → one chip) → 바텀시트: 사진 촬영 환자 · 장비 · 기타 / 갤러리 → 장비 camera
  await tap('[data-act="ai-more"]', 'ai-more');
  const open = await page.$eval('.ai-chips', (e) => e.classList.contains('open'));
  if (!open) throw new Error('AI chips did not open');
  const hubChips = await page.$$eval('.hub-foot .ai-chip', (els) => els.map((e) => e.textContent).join(' / '));
  if (hubChips !== '음성메모 / 사진 / 스캔') throw new Error(`+ menu: ${hubChips}`);
  await tap('[data-act="ai-photo"]', 'ai-photo');
  const photoOpts = await page.$$eval('.sheet .photo-opt .lbl', (els) => els.map((e) => e.firstChild.textContent.trim()).join(' / '));
  if (photoOpts !== '환자 / 장비 / 기타 / 갤러리에서 선택') throw new Error(`사진 sheet: ${photoOpts}`);
  await tap('.photo-opt[data-k="device"]', 'photo-device');
  await expect('vcam');
  // the 촬영 모드 was picked on the sheet: no 환자 · 장비 · 기타 chips on the camera
  if (await page.$('.cam-modes, .cam-mode')) throw new Error('the camera should have no 촬영 모드 chips');
  const camHint = await page.$eval('.cam-hint', (e) => e.textContent);
  if (!camHint.startsWith('장비')) throw new Error(`장비 camera hint: ${camHint}`);
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
  if (!(await page.$('.pcard.locked .pcard-lock'))) throw new Error('before the wristband the patient box should be 비활성 (환자 미확인)');
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
  // 환자 팔찌 → 환자정보 확인 (투약 목록은 흐림) + '투약 바코드 스캔' → 투약 바코드 → 활성화; 고위험약물 → 1차 인증
  await tap('[data-act="scan"]', 'med-wristband');
  await expect('task');
  if (!(await page.$('.task-drug .drug-scan')) || !(await page.$('.pcard.ok .pcard-ok'))) throw new Error('after the wristband: 환자 확인 + 투약 바코드 스캔 안내');
  if (await page.$('.task-drug [data-act="status-sheet"], .task-drug .mswipe')) throw new Error('the 투약 list stays inactive until the 투약 바코드');
  if ((await footBtns()) !== '투약 바코드 스캔') throw new Error(`투약 바코드 button: ${await footBtns()}`);
  // 투약 플로우 변경 (2026-11-27): 투약 바코드를 스캔하면 바로 2차 인증으로 넘어가지 않고 약정보가 활성화된 목록을 보여준다
  await tap('[data-act="scan-drug"]', 'drug-scan');
  await expect('task');
  if (!(await page.$('.task-b'))) throw new Error('the drug scan should activate the 투약 list');
  if (!(await page.$('.med-card.alert'))) throw new Error('고위험약물 should be flagged in the active list (no auto 인증)');
  if ((await footBtns()) !== '처방 스캔|투약수행') throw new Error(`active list buttons: ${await footBtns()}`); // 스캔 버튼이 투약수행 옆에 항상 있음
  await scanWedge('D9999');
  await expectDialog('환자/처방 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'mismatch-ok');
  await tap('[data-act="prn-info"]', 'prn-popup');
  await expectDialog('PRN 처방');
  await tap('.dlg [data-sheet-act="ok"]', 'prn-ok');
  // 2차 인증은 투약수행을 누를 때 시작된다 (바코드 스캔 직후가 아님)
  await tap('[data-act="administer"]', 'ham-first');
  await expect('ham');
  await tap('[data-act="hdr-close"]', 'ham-close-first');
  await expect('task');
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

  // ---------- 채혈하기 (햄버거메뉴 전체 메뉴 → 통합 '투약/채혈/수혈' → 업무 카드, 2026-11-27 요청) ----------
  await tap('.nav-item[data-k="care3"]', 'care3-open');
  await expect('care3');
  await tap('[data-act="scan-patient"]', 'care3-scan'); // 팔찌 스캔 (기본 김철수)
  await tap('[data-act="care-task"][data-k="bld"]', 'bld-scan');
  await expect('wtask');
  // 채혈관 before the patient → asks for the patient first
  await scanWedge('B1001');
  await expectDialog('환자 스캔 필요');
  await tap('.dlg [data-sheet-act="ok"]', 'bld-patient-first');
  await tap('[data-act="scan-patient"]', 'bld-patient');
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
  // 채혈 확인 버튼 옆에 스캔 버튼도 항상 함께 있음 (2026-11-27 요청)
  if ((await footBtns()) !== '채혈관 스캔|채혈 확인') throw new Error(`confirm buttons: ${await footBtns()}`);
  const okCards = await page.$$eval('.wcard.tube.ok', (els) => els.length);
  if (okCards !== 2) throw new Error(`confirmed tubes: ${okCards}`);
  await tap('[data-act="blood-confirm"]', 'bld-done');
  await expect('wdone');
  const doneTitle = await page.$eval('.status-title', (e) => e.textContent);
  if (doneTitle !== '채혈 완료') throw new Error(`done title: ${doneTitle}`);
  // 통합 업무로 시작했으므로: 확인 → 남은 업무 카드 목록('care3')으로 복귀
  await tap('[data-act="ok"]', 'bld-scan-again');
  await expect('care3');
  const bldRowDone = await page.$eval('[data-k="bld"] .task-st', (e) => e.textContent.trim());
  if (!bldRowDone.startsWith('완료')) throw new Error(`채혈하기 should show as done on the care3 card list: ${bldRowDone}`);
  await tap('[data-act="hdr-back"]', 'bld-leave');
  await tap('.dlg [data-sheet-act="ok"]', 'hub-from-bld');
  await expect('hub');

  // ---------- 수혈하기: 혈액팩마다 카드 · 혈액백 = 혈액번호 + 혈액제제 바코드 · 항목마다 이중확인 → 수혈 시작 기록 ----------
  await command('수혈');
  await expect('wscan');
  await scanWedge('T1002'); // Red Cell's 혈액제제 first: it names 김철수, the wristband is still missing
  await expect('wtask');
  if (!(await page.$('.scan-warn'))) throw new Error('수혈: patient-scan warning missing');
  await scanWedge('P21212457');
  await expect('wtask'); // no auto check: the list first
  if (await page.$('.scan-warn')) throw new Error('수혈: warning should go away after the wristband');
  if (await page.$('.wcard .alarm-pill')) throw new Error('수혈 list should not have the time / flag row');
  const hintNow = () => page.$eval('.tube-hint', (e) => e.textContent);
  if (!(await hintNow()).includes('혈액번호를 스캔')) throw new Error(`the 혈액제제 read first should ask for its 혈액번호: ${await hintNow()}`);
  // one card per 혈액팩 (White Cell 1 + Red Cell 7), each with its n/m 단위
  const kimCards = await page.$$eval('.wcard.bag .badge', (els) => els.map((e) => e.textContent));
  if (kimCards.length !== 8 || kimCards[0] !== '1/8 단위' || kimCards[7] !== '8/8 단위') throw new Error(`김철수 혈액팩 cards: ${kimCards}`);
  await scanWedge('0918039240'); // White Cell's 혈액번호 with Red Cell's 혈액제제
  await expectDialog('혈액번호/혈액제제 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'trf-pair-mismatch-ok');
  await scanWedge('0918039242'); // 혈액번호 first …
  if ((await bagsNow()).split(' ')[2] !== '0918039242:half') throw new Error(`half-scanned bag: ${await bagsNow()}`);
  await scanWedge('T1002'); // … then its 혈액제제
  const kimUnits = await bagsNow();
  console.log('김철수 혈액팩:', kimUnits);
  if (!kimUnits.includes('0918039242:ok') || !kimUnits.includes('0918039241:wait')) throw new Error(`bag not confirmed: ${kimUnits}`);
  if ((await footBtns()) !== '혈액 스캔|수행하기') throw new Error(`수혈 buttons: ${await footBtns()}`);
  await tap('[data-act="perform"]', 'trf-check-first');
  await expect('ham');
  const trfTitle = await page.$eval('.ham-hero .status-title', (e) => e.textContent);
  if (trfTitle !== '수혈하기 1차 인증') throw new Error(`trf check title: ${trfTitle}`);
  const kimBag = await page.$eval('.ham-card .ham-sub', (e) => e.textContent);
  if (!kimBag.includes('0918039242') || !kimBag.includes('3/8 단위')) throw new Error(`이중 인증 is for the confirmed bag: ${kimBag}`);
  for (let i = 0; i < 4; i++) await page.click(`.ham-check[data-i="${i}"]`), await sleep(120);
  await tap('[data-act="next"]', 'trf-second-popup');
  await expectDialog('고위험수행 이중 확인');
  await scanWedge('NURSE-RFID-77');
  const rows = await page.$$eval('.ham-nurse', (els) => els.map((e) => (e.classList.contains('filled') ? '■' : '□') + e.textContent.trim()).join(' / '));
  console.log('수혈 2차:', rows);
  if (!rows.startsWith('■1차') || !rows.includes('김수아 간호사 N23240183')) throw new Error('수혈 2차 rows wrong');
  for (let i = 0; i < 4; i++) await page.click(`.ham-check[data-i="${i}"]`), await sleep(120);
  await tap('[data-act="next"]', 'trf-check-done');
  await tap('[data-act="next"]', 'trf-started');
  await expect('trfdone'); // 이중 확인 완료 → 수혈 시작 기록 (수혈 진행 화면 없음, 종료 시각 없음)
  const kimStart = await page.evaluate(() => ({
    title: document.querySelector('.status-title').textContent,
    bag: `${document.querySelector('.tr-sub b').textContent} ${document.querySelector('.tr-name .badge').textContent}`,
    times: [...document.querySelectorAll('.tr-time .k')].map((e) => e.textContent).join(' / '),
    old: !!document.querySelector('svg.bag, [data-act="speed"], [data-act="stop"], [data-act="complete"]'),
  }));
  console.log('김철수 수혈 시작:', kimStart);
  if (kimStart.title !== '수혈 시작' || kimStart.bag !== '0918039242 3/8 단위' || kimStart.times !== '수혈 시작 / 15분 체크' || kimStart.old) {
    throw new Error('김철수 수혈 시작 record wrong');
  }
  // started from the 업무 메뉴 (AI 커맨드바 '수혈'): 확인 → 수혈하기 바코드 스캔
  await tap('[data-act="ok"]', 'trf-scan-again');
  await expect('wscan');
  await scanWedge('P21212457');
  await expect('wtask');
  const kimStarted = await page.$eval('.wcard.bag[data-unit="0918039242"] .bag-st', (e) => e.textContent);
  if (!kimStarted.includes('수혈 시작') || !kimStarted.includes('예정')) throw new Error(`started bag card: ${kimStarted}`);
  // 15분 알람 (시연 15초): the open list marks the bag, a popup asks for the check
  await waitFor(() => document.querySelector('.dlg-title')?.textContent === '수혈 15분 체크', '15분 체크 알람', 25000);
  const alarm1 = await page.$eval('.tra-box', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  console.log('15분 체크 알람:', alarm1);
  if (!alarm1.includes('김철수') || !alarm1.includes('0918039242')) throw new Error(`alarm: ${alarm1}`);
  if (!(await page.$('.wcard.bag.due [data-act="trf-check"]'))) throw new Error('the bag card should ask for the check');
  await tap('.dlg [data-sheet-act="ok"]', 'trf-check-15');
  await expect('trfcheck');
  await tap('[data-act="react"][data-i="1"]', 'trf-react-chill');
  const stopBtn = await page.$eval('.screen-foot .btn', (e) => e.textContent);
  if (stopBtn !== '이상반응 · 수혈 중단') throw new Error(`reaction button: ${stopBtn}`);
  await tap('[data-act="check-stop"]', 'trf-react-stop');
  await expectDialog('수혈 중단');
  await tap('.dlg [data-sheet-act="ok"]', 'trf-stopped');
  await expect('trfdone');
  const kimStop = await page.evaluate(() => ({
    title: document.querySelector('.status-title').textContent,
    note: document.querySelector('.tr-note.stop')?.textContent || '',
  }));
  console.log('김철수 수혈 중단:', kimStop);
  if (kimStop.title !== '수혈 중단' || !kimStop.note.includes('오한')) throw new Error('김철수 수혈 중단 record wrong');
  await tap('[data-act="ok"]', 'trf-back-to-list'); // back to the screen before the check
  await expect('wtask');
  if (!(await bagsNow()).includes('0918039242:stop')) throw new Error(`stopped bag: ${await bagsNow()}`);
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
  if (prevSbp !== '이전 118 · 09/17 15:30') throw new Error(`previous SBP: ${prevSbp}`);
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
  if (!(await page.$eval('#toast', (e) => e.textContent)).includes('1개 이상')) throw new Error('a VS without any value must not be saved');
  const vHeard = await voiceDemo('vital');
  const voiced = await page.$$eval('.vval', (els) => els.map((e) => e.value).join(' '));
  console.log('음성 입력:', vHeard, '→', voiced);
  if (voiced.split(' ').filter(Boolean).length !== 6) throw new Error(`voice should fill all six: ${voiced}`);
  await page.click('.vval[data-k="BT"]', { clickCount: 3 });
  await page.type('.vval[data-k="BT"]', '37.9');
  // 저장 전 확인 팝업 (2026-11-27): 입력값을 보여주고 저장을 한 번 더 확인받는다
  await tap('[data-act="save"]', 'vital-save-confirm');
  await expectDialog('활력징후 저장');
  await tap('.dlg [data-sheet-act="ok"]', 'vital-done');
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
  // 직전 기록 보기: the same 6 cells as the latest record (no small table), each item's previous value within 24 hours
  await tap('[data-act="vitals-more"]', 'vital-prev');
  const prevRec = await page.evaluate(() => ({
    head: document.querySelector('.vprev-head')?.textContent.replace(/\s+/g, ' ').trim() || '',
    cells: [...document.querySelectorAll('.vgrid.prev .vcell')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    table: !!document.querySelector('.vhist, .vh-row'),
  }));
  console.log('직전 기록:', prevRec);
  if (prevRec.table || prevRec.cells.length !== 6 || !prevRec.head.startsWith('직전 기록') || !prevRec.head.includes('24시간 이내')) throw new Error(`직전 기록: ${JSON.stringify(prevRec)}`);
  // measured after 15:30 today: the replaced record (09/17 15:30, SBP 118) is the previous one; each cell shows its own date·time (2026-11-24)
  if (picked > '15:30' && (!prevRec.cells[0].includes('118') || !prevRec.cells[0].includes('09/17 15:30'))) throw new Error(`직전 기록 values: ${JSON.stringify(prevRec)}`);
  await tap('[data-act="vitals-more"]', 'vital-prev-close');
  if (await page.$('.vprev')) throw new Error('접기 should hide 직전 기록');

  // ---------- 사용자설정: alarms and quick menu change the hub ----------
  await tap('[data-act="hdr-menu"]', 'detail-menu');
  await tap('.dlg [data-sheet-act="ok"]', 'navmenu-from-detail');
  await tap('[data-act="home"]', 'home');
  await expect('hub');
  await tap('[data-act="open-setting"]', 'setting');
  await expect('setting');
  // 김철수's 투약 is done (above); the other 5 (강태우·문가은 투약, 서동건·안소율 V/S, 정민호 수혈) are still urgent
  const statOf = () => page.$eval('.set-stat b', (e) => e.textContent);
  if ((await statOf()) !== '5건') throw new Error(`긴급처리업무 after 김철수 투약: ${await statOf()}`);
  await tap('.tgl[data-k="trf"]', 'alarm-trf-off');
  if ((await statOf()) !== '4건') throw new Error(`긴급처리업무 count after turning 수혈 off: ${await statOf()}`);
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
    pids: [...document.querySelectorAll('.ucard[data-pid]')].map((e) => e.dataset.pid).join(' / '),
    quick: [...document.querySelectorAll('.shortcut span')].map((e) => e.textContent).join(' / '),
  }));
  console.log('hub after settings:', hub);
  if (!hub.head.includes('5건') || !hub.chips.includes('수혈 오더 20분 경과') || hub.pids.includes('21212457')) throw new Error('alarm settings not applied to 긴급 처리 업무');
  if (!hub.quick.endsWith('신체계측')) throw new Error('quick slot 4 not applied');
  if (hub.tasks !== '투약 / 투약 / V/S / V/S / 수혈') throw new Error(`긴급 card 업무명: ${hub.tasks}`);

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
  if (!reset.includes('6건')) throw new Error(`settings should reset on logout: ${reset}`);

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
  await expect('wtask');
  await expectTitle('정민호(20812233)');
  // 환자허브에서 고른 환자: 환자정보 비활성 + 수혈 오더 흐리게 → 환자 팔찌 스캔 → 활성
  const jmhLocked = await page.evaluate(() => ({
    card: !!document.querySelector('.pcard.locked .pcard-lock'),
    list: !!document.querySelector('.task-lock .wcards .wcard'),
    button: document.querySelector('.sticky-foot .btn')?.textContent,
  }));
  if (!jmhLocked.card || !jmhLocked.list || jmhLocked.button !== '환자 팔찌 스캔') throw new Error(`정민호 수혈 before the wristband: ${JSON.stringify(jmhLocked)}`);
  await tap('[data-act="scan-patient"]', 'jmh-wristband');
  await expect('wtask');
  if (!(await page.$('.pcard.ok .pcard-ok')) || (await page.$('.task-lock'))) throw new Error('정민호: the wristband should activate the patient box and the list');
  // 수혈 오더 straight away — no 처방 스캔 step; nothing to give until a bag's two barcodes are scanned
  const jmhList = await page.evaluate(() => ({
    status: document.querySelector('.status-title')?.textContent || '',
    cards: [...document.querySelectorAll('.wcard .wcard-name')].map((e) => e.textContent.trim()),
    button: document.querySelector('.sticky-foot .btn')?.textContent,
  }));
  console.log('정민호 수혈 목록:', jmhList);
  if (jmhList.status || jmhList.cards.length !== 2 || jmhList.button !== '혈액 바코드 스캔') throw new Error('정민호: wristband should open the 수혈하기 list (2 혈액팩)');
  await scanWedge('T1002'); // 김철수's 혈액 제제
  await expectDialog('환자/처방 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'jmh-mismatch-ok');
  // bag 1: the scan button reads its 혈액번호, then its 혈액제제; only that bag is given, 0918039312 stays 대기
  await tap('[data-act="scan-bag"]', 'jmh-bag1-unit');
  await tap('[data-act="scan-bag"]', 'jmh-bag1-code');
  if ((await bagsNow()) !== '0918039311:ok 0918039312:wait') throw new Error(`정민호 bag 1: ${await bagsNow()}`);
  await tap('[data-act="perform"]', 'jmh-check-first');
  await expect('ham');
  const jmhUnits = await page.$eval('.ham-card .ham-sub', (e) => e.textContent);
  if (!jmhUnits.includes('0918039311') || !jmhUnits.includes('1/2 단위')) throw new Error(`정민호 혈액번호: ${jmhUnits}`);
  await passChecks(4, 'jmh');
  await expect('trfdone');
  // started from the 환자허브 (긴급 카드): 확인 → 환자허브
  await tap('[data-act="ok"]', 'jmh-hub');
  await expect('hub');
  // 15분 알람 → 나중에: the check waits in 긴급 처리 업무
  await waitFor(() => document.querySelector('.dlg-title')?.textContent === '수혈 15분 체크', '정민호 15분 체크 알람', 25000);
  await tap('.dlg [data-sheet-act="later"]', 'jmh-alarm-later');
  await expect('hub');
  const dueCard = await page.$eval('.ucard.due[data-pid="20812233"]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  console.log('긴급 처리 업무 15분 체크:', dueCard);
  if (!dueCard.includes('15분 체크 필요') || !dueCard.includes('0918039311')) throw new Error(`15분 체크 card: ${dueCard}`);
  await tap('.ucard.due[data-pid="20812233"]', 'jmh-check-1');
  await expect('trfcheck');
  await tap('[data-act="check-ok"]', 'jmh-check-empty');
  if ((await screen()) !== 'trfcheck') throw new Error('the 15분 체크 needs its vitals');
  await voiceDemo('jmh-check-1');
  await tap('[data-act="check-ok"]', 'jmh-check-ok-1');
  await expect('hub');
  if (await page.$('.ucard.due')) throw new Error('the recorded check should leave 긴급 처리 업무');
  // bag 2 (same 항목) from the 긴급 카드 again: its 혈액번호 only, no new 이중 인증
  await tap('.ucard[data-pid="20812233"]', 'urgent-trf-jmh-2');
  await expect('wtask');
  await tap('[data-act="scan-patient"]', 'jmh-wristband-2');
  const jmhBag1 = await page.$eval('.wcard.bag[data-unit="0918039311"] .bag-st', (e) => e.textContent);
  if (!jmhBag1.includes('이상 없음')) throw new Error(`bag 1 after its check: ${jmhBag1}`);
  await scanWedge('0918039999'); // not this patient's blood
  await expectDialog('환자/처방 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'jmh-unit-mismatch-ok');
  await scanWedge('0918039311');
  if ((await page.$eval('#toast', (e) => e.textContent)) !== '이미 수혈을 시작한 혈액입니다.') throw new Error('a started bag should be refused');
  await scanWedge('0918039312');
  if ((await bagsNow()) !== '0918039311:start 0918039312:ok') throw new Error(`정민호 bag 2: ${await bagsNow()}`);
  await tap('[data-act="perform"]', 'jmh-start-2');
  await expect('trfdone'); // no 이중 인증 for the same 항목
  const bag2 = await page.evaluate(() => [document.querySelector('.tr-sub b').textContent, document.querySelector('.tr-name .badge').textContent].join(' '));
  if (bag2 !== '0918039312 2/2 단위') throw new Error(`bag 2: ${bag2}`);
  if (await page.$('.tr-note')) throw new Error('no 혈액팩 left: no note');
  await tap('[data-act="ok"]', 'jmh-hub-2');
  await expect('hub');
  if (!(await urgentHead()).includes('5건')) throw new Error(`정민호 수혈 card should be gone: ${await urgentHead()}`);
  if (await page.$('.ucard[data-pid="20812233"]')) throw new Error('정민호 긴급 card still shown');
  // bag 2's alarm → 체크하기 → 이상 없음
  await waitFor(() => document.querySelector('.dlg-title')?.textContent === '수혈 15분 체크', '정민호 2nd alarm', 25000);
  await tap('.dlg [data-sheet-act="ok"]', 'jmh-check-2');
  await expect('trfcheck');
  await voiceDemo('jmh-check-2');
  await tap('[data-act="check-ok"]', 'jmh-check-ok-2');
  await expect('hub');

  // MY환자 → 강태우 → 업무 선택 시트
  await goMy();
  const jmhChip = await page.$eval('.myrow[data-pid="20812233"] .gchip', (e) => e.textContent);
  if (jmhChip !== '수혈시작') throw new Error(`정민호 MY chip: ${jmhChip}`);
  await tap('.myrow[data-pid="20733345"]', 'my-ktw');
  const ktwRows = await sheetRows();
  console.log('강태우 업무:', ktwRows);
  // 투약/채혈/수혈 통합 (2026-11-27): med 대기3건 + bld 대기1관 → 'care3' 한 줄(2개 업무 남음), trf는 오더 없음이라 셈에서 빠짐
  if (ktwRows !== 'care3:대기 2건 / vital:17:00 예정') throw new Error(`강태우 sheet: ${ktwRows}`);
  await tap('.sheet .task-opt[data-k="care3"]', 'ktw-care3');
  await expect('care3');
  if (!(await page.$('.pcard.locked'))) throw new Error('강태우 care3: should open locked');
  await tap('[data-act="scan-patient"]', 'ktw-care3-wristband');
  await tap('[data-act="care-task"][data-k="med"]', 'ktw-med');
  // a chosen patient: their 투약 list first, locked until the wristband is scanned (its own, separate gate)
  await expect('task');
  await expectTitle('강태우(20733345)');
  if (!(await page.$('.task-lock'))) throw new Error('강태우: the 투약 list should open locked');
  const locked = await page.$$eval('.task-lock .med-card', (els) => els.length);
  if (!locked) throw new Error('the locked list should show the 투약 orders');
  if (await page.$('.task-lock [data-act="status-sheet"], .task-lock [data-act="time-sheet"], .task-lock .mswipe')) throw new Error('a locked list must not be editable');
  if ((await footBtns()) !== '환자 팔찌 스캔') throw new Error(`locked list button: ${await footBtns()}`);
  if (!(await page.$('.pcard.locked')) || (await page.$('.pcard-ok'))) throw new Error('강태우: patient box should be 비활성 before the wristband');
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
  await tap('[data-act="scan-patient"]', 'ktw-wristband'); // 강태우's wristband → 환자 확인, 투약 바코드를 기다림
  await expect('task');
  if (!(await page.$('.task-drug'))) throw new Error('강태우: 투약 바코드 스캔 안내 expected');
  await scanWedge('D1001'); // 김철수's 처방: 불일치
  await expectDialog('환자/처방 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'ktw-mismatch-2-ok');
  await tap('[data-act="scan-drug"]', 'ktw-drug'); // 염화칼륨 = 고위험약물
  await expect('task'); // 2026-11-27: 바코드 스캔 직후 자동으로 인증을 띄우지 않고 약정보가 먼저 활성화됨
  if (!(await page.$('.med-card.alert'))) throw new Error('강태우: 염화칼륨(고위험약물) should be flagged without an auto 인증');
  await tap('[data-act="administer"]', 'ktw-ham-first'); // 투약수행을 누를 때 2차 인증이 시작됨
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
  // 통합 업무 중 하나(투약)만 끝났을 뿐: 확인 → 환자허브가 아니라 남은 업무 카드 목록('care3')으로
  await tap('[data-act="ok"]', 'ktw-care3-again');
  await expect('care3');
  const ktwMedRow = await page.$eval('[data-k="med"] .task-st', (e) => e.textContent.trim());
  if (!ktwMedRow.startsWith('완료')) throw new Error(`강태우 투약 should show done on the care3 list: ${ktwMedRow}`);
  // 남은 채혈까지 마치면 카드 목록으로 복귀 (투약은 PRN 처방이 남아 있어 계속 열려 있으므로 '업무 완료' 화면으로는 가지 않음)
  await tap('[data-act="care-task"][data-k="bld"]', 'ktw-bld');
  await expect('wtask');
  if (!(await page.$('.pcard.locked'))) throw new Error('강태우 채혈: should open locked');
  await tap('[data-act="scan-patient"]', 'ktw-bld-wristband');
  await tap('[data-act="scan-tube"]', 'ktw-bld-tube');
  await tap('[data-act="blood-confirm"]', 'ktw-bld-done');
  await expect('wdone');
  await tap('[data-act="ok"]', 'ktw-bld-ok');
  await expect('care3');
  const ktwBldRow = await page.$eval('[data-k="bld"] .task-st', (e) => e.textContent.trim());
  if (!ktwBldRow.startsWith('완료')) throw new Error(`강태우 채혈 should show done on the care3 list: ${ktwBldRow}`);
  await leaveToHub('ktw-leave');

  // 업무 메뉴로 시작한 투약 → 바코드 스캔 화면; another wristband there switches the patient (덮어쓰기)
  await command('투약');
  await expect('scan');
  await scanWedge('P20655321');
  await expect('task');
  await expectTitle('서동건(20655321)');
  await leaveToHub('sdg-leave');

  // a patient without that order: 강태우 has no 수혈
  await command('강태우 수혈');
  await expectDialog('수행할 오더 없음');
  await tap('.dlg [data-sheet-act="ok"]', 'ktw-no-trf-ok');
  await expect('hub');

  // 긴급 처리 업무 → 안소율 활력징후 (이상치 재확인): same flow as 활력징후, saving clears the card
  await tap('.ucard[data-pid="20876654"]', 'urgent-vital-asy');
  await expect('vital');
  await expectTitle('안소율(20876654)');
  if (!(await page.$('.pcard.locked')) || !(await page.$('.task-lock .vcard'))) throw new Error('안소율 활력징후 should open locked');
  if (!(await page.$eval('.vval[data-k="SBP"]', (e) => e.disabled))) throw new Error('VS inputs must be disabled before the wristband');
  await tap('[data-act="scan-patient"]', 'asy-wristband');
  await expect('vital');
  if (!(await page.$('.pcard.ok')) || (await page.$('.task-lock'))) throw new Error('안소율: the wristband should activate 활력징후');
  await scanWedge('P20876654');
  await expect('vital'); // the same wristband again: '이미 확인된 환자입니다.', values kept
  // the abnormal previous values are shown in colour (이상치 재확인)
  if (!(await page.$('.vt-cell[data-k="SBP"] .vt-prev b.danger'))) throw new Error('안소율 previous SBP should be 경고');
  // 사진 입력: the monitor photo fills the cells it could read (BT is not on the monitor: stays empty)
  await tap('[data-act="vphoto"]', 'asy-photo');
  await expect('vcam');
  const fillCam = await page.evaluate(() => ({ title: document.querySelector('.hdr-title').textContent, modes: !!document.querySelector('.cam-modes') }));
  if (fillCam.title !== '활력징후 사진 입력' || fillCam.modes) throw new Error(`사진 입력 camera: ${JSON.stringify(fillCam)}`);
  await sleep(1800); // the demo camera settles on the monitor
  await tap('[data-act="shoot"]', 'asy-photo-shoot');
  await waitFor(() => !!document.querySelector('.scr-vital'), '사진 입력 → 활력징후', 9000);
  await sleep(300);
  const photoVals = await page.$$eval('.vval', (els) => els.map((e) => `${e.dataset.k}=${e.value}`).join(' '));
  console.log('사진 입력:', photoVals, '|', await page.$eval('#toast', (e) => e.textContent));
  if (photoVals !== 'SBP=125 DBP=81 PR=66 RR=17 BT= SpO2=98') throw new Error(`사진 입력 values: ${photoVals}`);
  for (const [k, v] of [['SBP', '108'], ['PR', '92']]) {
    await page.click(`.vval[data-k="${k}"]`, { clickCount: 3 });
    await page.type(`.vval[data-k="${k}"]`, v);
  }
  // 빈 칸이 있어도 저장 (저장 전 확인 팝업에 미입력 안내가 함께 보임)
  await tap('[data-act="save"]', 'asy-vital-save-confirm');
  await expectDialog('활력징후 저장');
  await tap('.dlg [data-sheet-act="ok"]', 'asy-vital-done');
  await expect('wdone');
  const asyDesc = await page.$eval('.status-desc', (e) => e.textContent);
  if (!asyDesc.includes('5개 항목') || !asyDesc.includes('미입력 : BT')) throw new Error(`partial save: ${asyDesc}`);
  // started from the 환자허브 (긴급 카드): 확인 → 환자허브
  await tap('[data-act="ok"]', 'asy-hub');
  await expect('hub');
  if (!(await urgentHead()).includes('3건')) throw new Error(`안소율 card should be gone: ${await urgentHead()}`);

  // MY환자 → 문가은 채혈 (2관), another patient's tube is 불일치
  await goMy();
  await tap('.myrow[data-pid="21033456"]', 'my-mge');
  await tap('.sheet .task-opt[data-k="care3"]', 'mge-care3');
  await expect('care3');
  if (!(await page.$('.pcard.locked'))) throw new Error('문가은 care3: should open locked');
  await tap('[data-act="scan-patient"]', 'mge-care3-wristband');
  await tap('[data-act="care-task"][data-k="bld"]', 'mge-bld');
  await expect('wtask');
  await expectTitle('문가은(21033456)');
  if (!(await page.$('.pcard.locked')) || !(await page.$('.task-lock .wcard.tube'))) throw new Error('문가은 채혈 should open locked');
  await scanWedge('P21033456'); // the PDA scan button reads the wristband
  await expect('wtask');
  if (!(await page.$('.pcard.ok')) || (await page.$('.task-lock'))) throw new Error('문가은: the wristband should activate 채혈');
  await scanWedge('B1001'); // 김철수's 채혈관
  await expectDialog('환자/채혈관 불일치');
  await tap('.dlg [data-sheet-act="ok"]', 'mge-mismatch-ok');
  await tap('[data-act="scan-tube"]', 'mge-tube-1');
  await tap('[data-act="scan-tube"]', 'mge-tube-2');
  await tap('[data-act="blood-confirm"]', 'mge-bld-done');
  await tap('[data-act="ok"]', 'mge-care3-after-bld');
  await expect('care3'); // 투약은 아직 남아 카드 목록으로 복귀
  const mgeBldRow = await page.$eval('[data-k="bld"] .task-st', (e) => e.textContent.trim());
  if (!mgeBldRow.startsWith('완료')) throw new Error(`문가은 채혈 should show done on the care3 list: ${mgeBldRow}`);
  await tap('[data-act="hdr-back"]', 'mge-leave');
  await tap('.dlg [data-sheet-act="ok"]', 'mge-hub');
  await expect('hub');
  await goMy();
  await tap('.myrow[data-pid="21033456"]', 'my-mge-2');
  const mgeRows = await sheetRows();
  console.log('문가은 업무:', mgeRows);
  if (!mgeRows.startsWith('care3:대기')) throw new Error(`문가은 should still have 투약 pending: ${mgeRows}`);
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
  // + → 사진 → 바텀시트: wound (환자) · device (장비) · other (기타) · gallery
  const photoPick = async (k, label) => {
    await plus('ai-photo', `${label}-sheet`);
    await tap(k === 'gallery' ? '.photo-opt[data-sheet-act="gallery"]' : `.photo-opt[data-k="${k}"]`, label);
  };
  // 음성메모: 녹음 → 검토 → 저장 (환자 팔찌 스캔) → 목록
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
  if (vchips !== '음성메모 / 사진 / 스캔') throw new Error(`녹음 + menu: ${vchips}`);
  await tap('.voice-foot [data-act="ai-photo"]', 'free-memo-leave-ask');
  await expectDialog('음성메모 녹음 중');
  await tap('.dlg [data-sheet-act="cancel"]', 'free-memo-stay');
  await expect('voice');
  await tap('[data-act="finish-record"]', 'free-memo-finish');
  // the patient isn't known yet: no patient strip, and the script still says 환자
  await expect('voice');
  const shownBeforeScan = await shownPatient();
  if (shownBeforeScan) throw new Error(`patient should not be shown before 저장: ${shownBeforeScan}`);
  await tap('[data-act="toggle-script"]', 'free-memo-script');
  const speakersBefore = await page.$$eval('.vr-chat .chat-who', (els) => els.map((e) => e.textContent).join(' | '));
  if (!speakersBefore.includes('환자 ')) throw new Error(`unscanned speaker expected: ${speakersBefore}`);
  await tap('[data-act="save"]', 'free-memo-save');
  await expectDialog('환자 팔찌 스캔');
  await scanWedge('D2001'); // a prescription is not a wristband
  await expectDialog('환자 팔찌 스캔');
  await scanWedge('P20733345');
  await expect('voice');
  await expectTitle('강태우(20733345)');
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
  await tap('.sheet .task-opt[data-k="care3"]', 'qscan-care3');
  await expect('care3');
  // 스캔 화면에서 이미 읽은 팔찌이므로 카드 목록이 잠금 없이 바로 열림 (carePassthrough)
  if (await page.$('.pcard.locked')) throw new Error('스캔: care3 should open unlocked (wristband already scanned)');
  await tap('[data-act="care-task"][data-k="med"]', 'qscan-med');
  await expect('task');
  await expectTitle('문가은(21033456)');
  if (await page.$('.scan-warn')) throw new Error('스캔: the wristband should already count');
  if (!(await page.$('.task-drug .drug-scan'))) throw new Error('스캔 → 투약: the wristband should ask for the 투약 바코드');
  await leaveToHub('qscan-leave');
  await plus('ai-scan', 'qscan-2');
  await scanWedge('D6001');
  await expect('task');
  await expectTitle('정민호(20812233)');
  if (!(await page.$('.scan-warn'))) throw new Error('스캔 → 처방: wristband warning expected');
  await leaveToHub('qscan-leave-2');

  // 사진 촬영: 촬영 → AI 분석 → 측정값 확인 (환자 미확인) → hdr-close (환자 팔찌 스캔은 '확인' 클릭 시로 미룸, 2026-11-24)
  await photoPick('device', 'camera');
  await expect('vcam');
  await waitFor(() => document.querySelector('.scr-vcam')?.dataset.phase === 'detected', '모니터 감지', 6000);
  await tap('[data-act="shoot"]', 'camera-shoot');
  await waitFor(() => document.querySelector('.scr-vreview'), 'camera analysis', 8000);
  if (await page.$('.pline')) throw new Error('patient should not show before the wristband scan');
  await tap('[data-act="hdr-close"]', 'camera-close');
  await expect('hub');

  // 사진첨부: 갤러리(브라우저는 시연 앨범) → 사진 선택 → AI 분석 → 측정값 확인(환자 미확인) → '확인' 클릭 시 환자 팔찌
  // 스캔(스캔하기 = 김철수) → 전송 전 최종 확인 → EMR 전송
  await photoPick('gallery', 'attach');
  await expect('vcam');
  await waitFor(() => document.querySelector('.sheet .album-item'), 'album', 3000);
  const tiles = await page.$$eval('.sheet.gallery .album-item', (els) => els.length);
  if (tiles < 20) throw new Error(`gallery should show many photos: ${tiles}`);
  if (!(await page.$eval('[data-sheet-act="attach"]', (e) => e.disabled))) throw new Error('첨부하기 should wait for a photo');
  await tap('.album-item[data-k="ok"]', 'attach-pick');
  await tap('[data-sheet-act="attach"]', 'attach-attach');
  await waitFor(() => document.querySelector('.scr-vreview'), 'attach analysis', 8000);
  if (await page.$('.pline')) throw new Error('patient should not show before the wristband scan');
  const again = await page.$eval('[data-act="retake"]', (e) => e.textContent);
  if (again !== '다른 사진 선택') throw new Error(`attach review button: ${again}`);
  if (await page.$('.vt-cell[data-k="SBP"] .vt-prev')) throw new Error('이전 측정값 should wait for the patient');
  await voiceDemo('attach');
  const ocrBt = await page.$eval('.vt-cell[data-k="BT"]', (e) => (e.querySelector('.vf-tag')?.className || '') + '|' + e.querySelector('.vval').value);
  if (!ocrBt.includes('edited') || ocrBt.endsWith('|')) throw new Error(`voice should fill the unread 체온: ${ocrBt}`);
  await tap('[data-act="review-ok"]', 'attach-review-ok');
  await expectDialog('환자 팔찌 스캔');
  await tap('.dlg [data-sheet-act="scan"]', 'attach-wristband');
  await waitFor(() => document.querySelector('.sheet-title')?.textContent === '전송 전 최종 확인', 'confirm sheet', 4000);
  const confirmPatient = await page.$eval('.sheet-drug', (e) => e.textContent);
  if (!confirmPatient.includes('김철수(21212457)')) throw new Error(`confirm sheet patient: ${confirmPatient}`);
  await tap('[data-sheet-act="send"]', 'attach-send');
  await expect('vdone');
  await expectTitle('김철수(21212457)');
  await tap('[data-act="finish"]', 'attach-finish');
  await expect('hub');

  // ---------- 사진 촬영 용도 (2026-11-23) ----------
  // 주입 펌프: 시연 대상 → 감지 → 촬영 → 펌프 표시값(환자 미확인) → '기록' 클릭 시 팔찌(강태우) 스캔 →
  // 처방 비교(처방 120 vs 펌프 100 → 확인 체크 필수) → 기록 (2026-11-24: 스캔은 저장 시점으로)
  await photoPick('device', 'pump');
  await expect('vcam');
  await tap('[data-act="cam-target"]', 'pump-target');
  await tap('[data-sheet-act="target"][data-k="pump"]', 'pump-target-pick');
  await waitFor(() => document.querySelector('.scr-vcam')?.dataset.phase === 'detected', '펌프 감지', 6000);
  const pumpTag = await page.$eval('.focus-tag span', (e) => e.textContent);
  if (pumpTag !== '주입 펌프 감지') throw new Error(`pump detection badge: ${pumpTag}`);
  await tap('[data-act="shoot"]', 'pump-shoot');
  await waitFor(() => document.querySelector('.scr-vpump'), 'pump record', 6000);
  if (await page.$('.pline')) throw new Error('patient should not show before 기록');
  const pumpRate = await page.$eval('.pf-in[data-k="rate"]', (e) => e.value);
  if (pumpRate !== '100') throw new Error(`pump rate read: ${pumpRate}`);
  if (await page.$('.pf-order.warn')) throw new Error('처방 비교 should wait for the patient');
  await tap('[data-act="pump-save"]', 'pump-save-scan');
  await expectDialog('환자 팔찌 스캔');
  await scanWedge('P20733345');
  await expect('vpump'); // blocked: order mismatch, 확인 체크박스 미체크
  await expectTitle('강태우(20733345)');
  if (!(await page.$('.pf-order.warn'))) throw new Error('order 120 mL/h vs pump 100 mL/h should be a mismatch');
  await tap('[data-act="pump-ack"]', 'pump-ack');
  await tap('[data-act="pump-save"]', 'pump-save');
  await expect('vsaved');
  await tap('[data-act="to-detail"]', 'pump-detail');
  await expect('detail');
  const pumpRow = await page.$eval('.photo-records .ph-row', (e) => e.textContent);
  if (!pumpRow.includes('100 mL/h') || !pumpRow.includes('불일치')) throw new Error(`사진 기록 pump row: ${pumpRow}`);

  // 사진 → 환자: the camera opens in 환자 mode (no chips) pointed at the wound, and finds it (no ruler)
  await tap('[data-act="hdr-back"]', 'pump-detail-back');
  await expect('hub');
  await photoPick('wound', 'wound-camera');
  await expect('vcam');
  if (await page.$('.cam-mode')) throw new Error('환자 camera: no 촬영 모드 chips');
  await waitFor(() => document.querySelector('.scr-vcam')?.dataset.phase === 'detected', '환부 감지', 6000);
  if ((await page.$eval('.focus-tag span', (e) => e.textContent)) !== '환부 감지') throw new Error('환자 mode should find the wound');
  if ((await page.$eval('.cam-sub', (e) => e.textContent)).includes('자')) throw new Error('no ruler any more');
  await tap('[data-act="cam-close"]', 'wound-camera-close');
  await expect('hub');

  // 장비 모드 · 알아볼 대상 없음 → '무엇을 촬영하셨나요?' → 기타 첨부 (환자 미확인) → '첨부' 클릭 시 팔찌(강태우) 스캔
  await photoPick('device', 'none-camera');
  await expect('vcam');
  await longPress('[data-act="shoot"]');
  await tap('[data-sheet-act="target"][data-k="none"]', 'none-shoot');
  await waitFor(() => document.querySelector('.sheet .purpose'), 'purpose sheet', 6000);
  await tap('.purpose[data-k="other"]', 'purpose-other');
  await waitFor(() => document.querySelector('.scr-vother'), 'other record', 4000);
  await tap('[data-act="other-save"]', 'other-save-blocked');
  await expect('vother');
  await tap('.sort-chip[data-act="o-tag"][data-v="장비·환경"]', 'other-tag');
  // the same photo can go elsewhere: 다른 용도로 → 환자 모니터 (nothing readable → 직접 입력) → back to 기타
  await tap('[data-act="other-use"]', 'other-use');
  await tap('.purpose[data-k="monitor"]', 'other-to-monitor');
  await expect('vreview');
  if (!(await page.$eval('.vr-title', (e) => e.textContent.includes('직접 입력')))) throw new Error('a photo without a monitor → 활력징후 직접 입력');
  await tap('[data-act="other-use"]', 'monitor-use');
  await tap('.purpose[data-k="other"]', 'monitor-to-other');
  await expect('vother');
  if (!(await page.$('.sort-chip.on[data-v="장비·환경"]'))) throw new Error('기타 첨부 should keep its tags');
  if (await page.$('.pline')) throw new Error('patient should not show before 첨부');
  await tap('[data-act="other-save"]', 'other-save');
  await expectDialog('환자 팔찌 스캔');
  await scanWedge('P20733345');
  await expect('vsaved');
  await tap('[data-act="to-detail"]', 'other-detail');
  await expect('detail');
  const nPhotos = await page.$$eval('.photo-records .ph-row', (els) => els.length);
  if (nPhotos !== 2) throw new Error(`강태우 멀티미디어 (사진 기록): ${nPhotos}`);

  // 멀티미디어 추가: 사진 · 동영상 · 음성기록(최대 10분) · 갤러리(여러 개) → 항목마다 메모 → 한 번에 저장
  if ((await page.$eval('.photo-records .dcard-title', (e) => e.textContent)) !== '멀티미디어') throw new Error('the card should be 멀티미디어');
  await tap('[data-act="media-add"]', 'media-add');
  await expect('media');
  await expectTitle('강태우(20733345)');
  await tap('[data-act="md-save"]', 'media-save-empty');
  await expect('media');
  await longPress('[data-act="md-photo"]'); // 시연 사진
  await longPress('[data-act="md-gallery"]'); // 시연 갤러리 3건
  await tap('[data-act="md-audio"]', 'media-rec');
  if (!(await page.$('.sheet.rec'))) throw new Error('음성 녹음 sheet expected');
  const recMax = await page.$eval('.sheet.rec .rec-max', (e) => e.textContent);
  if (!recMax.includes('10:00')) throw new Error(`음성 녹음 max: ${recMax}`);
  await sleep(1300);
  await tap('.sheet.rec [data-sheet-act="stop"]', 'media-rec-stop');
  const kinds = await page.$$eval('.md-card .badge', (els) => els.map((e) => e.textContent).join(','));
  console.log('멀티미디어 추가:', kinds);
  if (kinds !== '사진,사진,사진,동영상,음성기록') throw new Error(`draft items: ${kinds}`);
  await page.type('.md-card:nth-child(1) .md-memo', '천골 부위 드레싱 교환 전');
  await tap('.md-card:nth-child(2) [data-act="md-remove"]', 'media-remove');
  if ((await page.$$eval('.md-card', (els) => els.length)) !== 4) throw new Error('빼기 should drop one item');
  const saveLabel = await page.$eval('.screen-foot .btn', (e) => e.textContent);
  if (saveLabel !== '저장 (4건)') throw new Error(`save button: ${saveLabel}`);
  await tap('[data-act="md-save"]', 'media-save');
  await expect('detail');
  const mdRows = await page.$$eval('.photo-records .ph-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('멀티미디어 카드:', mdRows.length, mdRows[0]);
  if (mdRows.length !== 6 || !mdRows[0].includes('천골 부위 드레싱 교환 전')) throw new Error(`멀티미디어 card rows: ${mdRows.length}`);
  // a saved item opens with its memo: 메모 수정 → 저장
  await tap('.md-row[data-act="media-open"]', 'media-view');
  if (!(await page.$('.sheet.media-view .mv-memo'))) throw new Error('media viewer expected');
  await page.click('.sheet.media-view .mv-memo', { clickCount: 3 });
  await page.type('.sheet.media-view .mv-memo', '드레싱 교환 전 · 삼출물 소량');
  await tap('.sheet.media-view [data-sheet-act="save"]', 'media-memo-save');
  if (!(await page.$eval('.md-row', (e) => e.textContent.includes('삼출물 소량')))) throw new Error('메모 수정 not shown');
  await tap('[data-act="hdr-back"]', 'photo-detail-back');
  await expect('hub');

  // 사진 → 갤러리 · 환부: 부위 · 유형 · 크기(직접 입력, 자 추정 없음) 기록(환자 미확인) → '저장' 클릭 시 팔찌(김철수) 스캔 →
  // 이전 사진(09/15)과 비교를 보여주고 한 번 더 '저장'
  await photoPick('gallery', 'wound-attach');
  await waitFor(() => document.querySelector('.sheet .album-item'), 'album', 3000);
  await tap('.album-item[data-k="wound"]', 'wound-pick');
  await tap('[data-sheet-act="attach"]', 'wound-attach-go');
  await waitFor(() => document.querySelector('.scr-vwound'), 'wound record', 6000);
  if (await page.$('.pline')) throw new Error('patient should not show before 저장');
  const woundSize = await page.$$eval('.ph-num', (els) => els.map((e) => e.value).join('x'));
  if (woundSize !== 'x') throw new Error(`no size estimate any more: ${woundSize}`);
  if (await page.$('.ph-prev')) throw new Error('이전 사진 비교 waits for the patient (scanned on save)');
  await tap('.sort-chip[data-act="w-site"][data-v="천골·엉덩이"]', 'wound-site');
  for (const [f, v] of [['w', '3.2'], ['h', '2.2']]) {
    await page.type(`.ph-num[data-f="${f}"]`, v);
    await page.$eval(`.ph-num[data-f="${f}"]`, (e) => e.blur());
    await sleep(200);
  }
  if (await page.$('.ph-prev')) throw new Error('이전 사진 비교 should still wait for the patient');
  await tap('.sort-chip[data-act="w-type"][data-v="욕창"]', 'wound-type');
  // 환자 사진은 '필수' 구분 없음: no required marks, any item may be left out
  if (await page.$('.scr-vwound .ph-k em')) throw new Error("환자 사진 should not mark items '필수'");
  await tap('.sort-chip[data-act="w-stage"][data-v="2단계"]', 'wound-stage');
  await tap('[data-act="wound-save"]', 'wound-save-scan');
  await expectDialog('환자 팔찌 스캔');
  await tap('.dlg [data-sheet-act="scan"]', 'wound-wristband');
  await expect('vwound'); // the 이전 사진 비교 appears now the patient is known: 저장 again to confirm
  await expectTitle('김철수(21212457)');
  const trend = await page.$eval('.ph-prev', (e) => e.textContent);
  if (!trend.includes('크기 감소') || !trend.includes('09/15')) throw new Error(`previous photo comparison: ${trend}`);
  await tap('[data-act="wound-save"]', 'wound-save');
  await expect('vsaved');
  await tap('[data-act="finish"]', 'wound-finish');
  await expect('hub');

  // ---------- 앱 버전 · 업데이트 (시연) ----------
  await tap('[data-act="open-setting"]', 'ver-setting');
  const verNow = await page.$eval('.app-row .v b', (e) => e.textContent);
  if (verNow !== 'v2.5.0') throw new Error(`current version: ${verNow}`);
  if (await page.$('.ver-list')) throw new Error('버전 이력 should not be on the settings screen');
  await tap('[data-act="open-versions"]', 'ver-history');
  await expect('versions');
  // 현재 버전 opened, the others folded
  const opened = await page.$$eval('.ver-card.open .ver-head b', (els) => els.map((e) => e.textContent).join(','));
  if (opened !== 'v2.5.0') throw new Error(`버전 이력 opened cards: ${opened}`);
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
  await waitFor(() => document.querySelector('.scr-splash .logo-ver')?.textContent === 'v2.5.0', 'updated to v2.5.0', 10000);
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

  // ---------- 야간모드: 사용자설정 on / off · 주간 소리 / 야간 진동 ----------
  const isNightNow = () => page.$eval('html', (e) => e.classList.contains('night'));
  const fbNow = () => page.$eval('html', (e) => e.dataset.fb || '');
  await tap('[data-act="open-setting"]', 'night-setting');
  if (await page.$('[data-act="ham2"], [data-act="night-auto"], .night-t')) throw new Error('고위험수행 2차인증 · 야간모드 시간 설정 should be gone');
  if ((await page.$eval('[data-act="night-toggle"]', (e) => e.getAttribute('aria-checked'))) !== 'false') throw new Error('야간모드 should start off');
  if (await isNightNow()) throw new Error('야간모드 off → 주간');
  await tap('[data-act="night-toggle"]', 'night-on');
  if (!(await isNightNow())) throw new Error('야간모드 on should turn the screens dark');
  if ((await fbNow()) !== 'vibrate:alert') throw new Error(`the switch should vibrate at night: ${await fbNow()}`);
  const bg = await page.$eval('.set-card', (e) => getComputedStyle(e).backgroundColor);
  if (bg === 'rgb(255, 255, 255)') throw new Error('야간모드 cards should be dark');
  await tap('[data-act="hdr-close"]', 'night-hub');
  // this test runs as a phone (touch): the PDA really vibrates (PCs show a '진동' sign instead)
  await page.evaluate(() => {
    window.__vib = [];
    const v = navigator.vibrate.bind(navigator);
    navigator.vibrate = (pat) => (window.__vib.push(pat), v(pat));
  });
  await scanWedge('P21212457');
  if ((await fbNow()) !== 'vibrate:scan') throw new Error(`a scan at night should vibrate: ${await fbNow()}`);
  const vib = await page.evaluate(() => JSON.stringify(window.__vib));
  if (!vib.includes('[35]')) throw new Error(`the scan vibration pattern: ${vib}`);
  await tap('[data-act="open-setting"]', 'night-setting-2');
  await tap('[data-act="night-toggle"]', 'night-off');
  if (await isNightNow()) throw new Error('야간모드 off');
  if ((await fbNow()) !== 'sound:alert') throw new Error(`by day the feedback is a sound: ${await fbNow()}`);
  console.log('\nRESULT: OK', errors.length ? `(page errors: ${errors.join(' | ')})` : '(no page errors)');
} catch (e) {
  console.log('\nRESULT: FAIL', e.message, errors.length ? `page errors: ${errors.join(' | ')}` : '');
  await shot('failure');
} finally {
  await browser.close();
}
