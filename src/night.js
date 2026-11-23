// 야간모드 (요청): 사용자설정의 '야간모드' 스위치로 켜고 끔 (시간에 따른 자동 전환은 없음 — 2026-11-23 요청으로 제거).
// 켜면 화면이 어두워지고 (html.night, styles/night.css) 알림 · 조작은 소리 대신 진동 (feedback.js).
import { state } from './state.js';
import { toast } from './ui.js';
import { feedback } from './feedback.js';

const html = document.documentElement;
let shown = null; // the mode on screen

export const isNight = () => !!state.settings.night.on;

/** Puts the mode on screen; `announce` = tell the nurse when it changed. */
export function applyNight({ announce = true } = {}) {
  const on = isNight();
  html.classList.toggle('night', on);
  if (shown !== null && shown !== on && announce) {
    feedback('alert');
    toast(on ? '야간모드를 켰습니다. 화면이 어두워지고 소리 대신 진동으로 알립니다.' : '야간모드를 껐습니다.');
  }
  shown = on;
}

/** `forced`: screenshots (?night=1 · ?night=0) show that mode. */
export function startNight({ forced = null } = {}) {
  if (forced !== null) {
    html.classList.toggle('night', forced);
    return;
  }
  applyNight({ announce: false });
}
