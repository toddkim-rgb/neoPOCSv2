// 야간모드 (요청): 22:00–07:00 by default (사용자설정: 자동 전환 · 시작 · 종료 30분 단위 · 지금 바꾸기).
// At night the screens turn dark (html.night, styles/night.css) and 알림 · 조작 vibrate instead of sounding
// (feedback.js). Switching on the nurse's own ('지금 야간모드') lasts until the next scheduled change.
import { state } from './state.js';
import { toast } from './ui.js';
import { feedback } from './feedback.js';

const html = document.documentElement;
let shown = null; // the mode on screen
let windowWas = null; // the schedule's mode at the last check

const mins = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Is `d` inside the night window (start–end, across midnight)? */
export function inNightWindow(d = new Date(), n = state.settings.night) {
  const t = d.getHours() * 60 + d.getMinutes();
  const s = mins(n.start);
  const e = mins(n.end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export function isNight() {
  const n = state.settings.night;
  if (n.manual != null) return n.manual;
  return n.auto && inNightWindow();
}

/** Puts the mode on screen; `announce` = tell the nurse when it changed. */
export function applyNight({ announce = true } = {}) {
  const on = isNight();
  html.classList.toggle('night', on);
  if (shown !== null && shown !== on && announce) {
    feedback('alert');
    toast(on ? '야간모드로 바뀌었습니다. 화면이 어두워지고 소리 대신 진동으로 알립니다.' : '주간모드로 바뀌었습니다.');
  }
  shown = on;
}

/** After a settings change: the schedule's current state is the new baseline. */
export function syncNight() {
  const n = state.settings.night;
  windowWas = n.auto && inNightWindow();
  applyNight();
}

function tick() {
  const n = state.settings.night;
  const w = n.auto && inNightWindow();
  if (windowWas !== null && w !== windowWas) n.manual = null; // the schedule changed: a manual choice ends
  windowWas = w;
  applyNight();
}

/** `forced`: screenshots (?night=1 · ?night=0) show that mode without a timer. */
export function startNight({ forced = null } = {}) {
  if (forced !== null) {
    html.classList.toggle('night', forced);
    return;
  }
  tick();
  setInterval(tick, 20000);
  document.addEventListener('visibilitychange', () => !document.hidden && tick());
}
