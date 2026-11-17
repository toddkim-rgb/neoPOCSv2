import { Capacitor, SystemBars } from '@capacitor/core';
import { App } from '@capacitor/app';
import { reset, back, currentScreen } from './router.js';
import { closeSheet, sheetOpen } from './ui.js';
import { state, newHamCheck, selectPatient, completeTask } from './state.js';
import { NURSE2, HAM_CHECKS, TRF_CHECKS } from './data.js';
import { attachScanner } from './scanner.js';
import { openMedDialog } from './screens/med.js';
import './screens/entry.js';
import './screens/hub.js';
import './screens/med.js';
import './screens/voice.js';
import './screens/detail.js';
import './screens/vitals.js';
import './screens/work.js';
import './screens/nav.js';
import './screens/memos.js';
import './screens/quick.js';
import './screens/transfuse.js';
import './screens/update.js';
import { install } from './versions.js';
import { startPii } from './pii.js';
import { initSwipe } from './swipe.js';
import { startNight } from './night.js';
import { feedback } from './feedback.js';
import { openLogout } from './screens/nav.js';
import { takePatientScan, patientPending, cancelPatientScan } from './patientscan.js';

const DESIGN_W = 412;
const DESIGN_H = 892;
const html = document.documentElement;
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const isNative = Capacitor.isNativePlatform();

/* ---------------- scaling ---------------- */
function readInset(name) {
  const v = getComputedStyle(html).getPropertyValue(`--safe-area-inset-${name}`).trim();
  if (v) return parseFloat(v) || 0;
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;padding-top:env(safe-area-inset-${name})`;
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}

// only touch the inline style when a value really changes (the observer below watches it)
function setVar(name, value) {
  if (html.style.getPropertyValue(name) !== value) html.style.setProperty(name, value);
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Browsers show the exact 412×892 Figma frame; `?device` previews the scaled on-device layout.
  const desktop = !params.has('device') && (!!shot || !isNative);
  html.classList.toggle('desktop', desktop);
  html.classList.toggle('shot', !!shot);
  if (desktop) {
    const frameH = shot ? Number(params.get('h') || DESIGN_H) : DESIGN_H;
    setVar('--s', '1');
    setVar('--st', '52px');
    setVar('--sb', '24px');
    setVar('--stage-h', `${frameH}px`);
    setVar('--desk-s', shot ? '1' : Math.min(1, (h - 32) / DESIGN_H).toFixed(4));
    return;
  }
  const s = w / DESIGN_W;
  setVar('--s', s.toFixed(5));
  setVar('--st', `${(readInset('top') / s).toFixed(2)}px`);
  setVar('--sb', `${(readInset('bottom') / s).toFixed(2)}px`);
  setVar('--stage-h', `${(h / s).toFixed(2)}px`);
  // the WebView shrinks while the soft keyboard is open
  tallest = Math.max(tallest, h);
  html.classList.toggle('kb', h < tallest * 0.8);
}
let tallest = 0;

window.addEventListener('resize', layout);
// Capacitor injects --safe-area-inset-* on <html> once the native insets are known.
let lastInsets = '';
new MutationObserver(() => {
  const cs = html.style;
  const now = `${cs.getPropertyValue('--safe-area-inset-top')}|${cs.getPropertyValue('--safe-area-inset-bottom')}`;
  if (now !== lastInsets) {
    lastInsets = now;
    layout();
  }
}).observe(html, { attributes: true, attributeFilter: ['style'] });

/* ---------------- events ---------------- */
const stage = document.getElementById('stage');
let suppressClick = false;

stage.addEventListener('click', (e) => {
  if (suppressClick) {
    suppressClick = false;
    e.preventDefault();
    return;
  }
  const t = e.target.closest('[data-act]');
  if (!t || t.closest('#sheet-layer')) return;
  const cur = currentScreen();
  const fn = cur?.screen.actions?.[t.dataset.act];
  if (fn) {
    e.preventDefault();
    // the PDA scan buttons stand for the laser scanner: 스캔음 (주간) · 진동 (야간)
    if (/^scan(-patient|-bag|-tube|-unit)?$/.test(t.dataset.act)) feedback('scan');
    fn(t, cur.params, e);
  }
});

// long press (e.g. 스캔하기 → scan simulation sheet)
let pressTimer = null;
stage.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('[data-long]');
  if (!t) return;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    const cur = currentScreen();
    const fn = cur?.screen.actions?.[t.dataset.long];
    if (fn) {
      suppressClick = true;
      feedback('long');
      fn(t, cur.params, e);
    }
  }, 550);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
  stage.addEventListener(ev, () => clearTimeout(pressTimer)),
);
stage.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- hardware: back button & scanner ---------------- */
function handleBack() {
  // 환자 팔찌 스캔 popup (음성메모 · 사진 촬영 · 사진첨부): 뒤로가기 = 취소
  if (patientPending()) return cancelPatientScan();
  if (sheetOpen()) return closeSheet();
  if (!back()) {
    if (isNative) App.minimizeApp();
  }
}
if (isNative) App.addListener('backButton', handleBack);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') handleBack();
});

// dark camera screen → light status-bar icons
window.addEventListener('screenchange', () => {
  if (!isNative) return;
  const dark = document.getElementById('root').dataset.bg === 'dark';
  SystemBars.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
});

attachScanner((code) => {
  // a popup waiting for a wristband takes the scan first
  feedback('scan');
  if (takePatientScan(code)) return;
  if (sheetOpen()) closeSheet(true);
  const cur = currentScreen();
  cur?.screen.onScan?.(code, cur.params);
});

/* ---------------- start ---------------- */
function startShot(name) {
  // ?shot=<screen>&… renders one screen in a given state for design comparison
  const p = Object.fromEntries(params.entries());
  // ?ver=0.2.0 runs as that installed version (업데이트 시연) · ?pid=<등록번호> shows another sample patient
  // · ?finished=med,trf marks their tasks done today
  if (p.ver) install(p.ver);
  if (p.pid) selectPatient(p.pid);
  if (p.finished) p.finished.split(',').forEach((k) => completeTask(k, '17:24'));
  state.scan = { patient: p.patient === '1', drug: p.drug === '1' };
  if (p.tab) state.hubTab = p.tab;
  if (p.ai === 'chips') state.aiMore = true;
  if (p.loginError) state.loginError = true;
  if (p.kind && state.work[p.kind]?.scan) state.work[p.kind].scan = { patient: p.patient === '1', drug: p.drug === '1' };
  // 채혈하기: drug=1 → every 채혈관 confirmed, tubes=N → the first N
  if (p.kind === 'bld') {
    const ids = state.work.bld.orders.map((o) => o.id);
    state.work.bld.tubes = p.drug === '1' ? ids : ids.slice(0, Number(p.tubes || 0));
  }
  if (name === 'ham') {
    // the design frames show every check ticked
    const n = p.kind === 'trf' ? TRF_CHECKS.length : HAM_CHECKS.length;
    const ham = { ...newHamCheck(n), checks1: Array(n).fill(true), checks2: Array(n).fill(true) };
    if (p.step !== 'first') Object.assign(ham, { second: NURSE2.label, at1: '2026-09-17 18:32' });
    if (p.step === 'done') ham.at2 = '2026-09-17 18:38';
    if (p.dialog === 'second') ham.at1 = '2026-09-17 18:32';
    if (p.kind === 'trf') state.work.trf.ham = ham;
    else state.ham = ham;
  }
  if (p.done && state.work[p.kind]) state.work[p.kind].ham = { ...newHamCheck(), done: true };
  if (p.open) state.scriptOpen.detail = [true, false];
  if (p.vhist) state.vhistOpen = true; // 환자 상세 · 임상관찰기록 상세보기
  // common-voice-02 'Stroke Active': script open, summary and script edited
  if (p.script === '1') {
    Object.assign(state.voice, { sumActive: true, scriptEdited: true });
    state.scriptOpen.review = true;
  }
  reset(name, { ...p, step: p.step, kind: p.kind, shown: p.shown ? Number(p.shown) : undefined }, '');
  // ?dialog=fail|reset|mismatch|prn|second opens that popup over the screen
  if (p.dialog === 'logout') openLogout();
  else if (p.dialog) openMedDialog(p.dialog, { check: p.kind === 'trf' ? 'trf' : 'med' });
  if (p.sheet) {
    const id = p.id || 'o2';
    const cur = currentScreen();
    // a screen may expose `sheet-<name>` for its own sheets (setting: slot1/slot2, navmenu: room)
    const act = cur.screen.actions[`sheet-${p.sheet}`] ? `sheet-${p.sheet}` : p.sheet === 'time' ? 'time-sheet' : 'status-sheet';
    cur.screen.actions[act]({ dataset: { id } }, cur.params);
    document.querySelector('.sheet-wrap')?.classList.add('open');
  }
}

layout();
// 개인정보 자동 가림 (screenshots: still, ?mask=1 shows the masked state)
startPii({ still: !!shot, masked: params.get('mask') === '1' });
initSwipe(); // 투약 리스트 카드 스와이프 → 삭제 · 취소
// 야간모드: 22:00–07:00 (사용자설정) · screenshots: day, or ?night=1
startNight({ forced: params.has('night') ? params.get('night') === '1' : shot ? false : null });
document.fonts.load('500 16px "Pretendard Variable"').finally(() => {
  if (shot) startShot(shot);
  else reset('splash', {}, 'fade');
  html.classList.add('ready');
});
