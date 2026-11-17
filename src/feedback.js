// 알림 · 조작 피드백 (요청, 야간모드): 주간 = 짧은 효과음 · 야간 = 진동 (소리 없음).
//   scan  바코드를 읽음          ok    확인됨 (혈액백 · 모니터 감지 · 수혈 시작)
//   error 불일치 · 인식 불가 팝업  alert 안내 팝업 · 모드 전환     alarm 수혈 15분 체크
//   done  수행 완료 화면          long  길게 누르기 · 스와이프 메뉴
// Sounds are synthesised with Web Audio (no files). Devices that cannot vibrate (PC · iPhone) show a short
// '진동' sign instead, so the difference can be seen in a demo. The last feedback is kept on <html data-fb>.
import { icon } from './icons.js';

const TONES = {
  scan: [[1760, 0.07]],
  ok: [[1319, 0.06], [1760, 0.09]],
  error: [[440, 0.13], [0, 0.06], [440, 0.15]],
  alert: [[880, 0.12], [1319, 0.2]],
  alarm: [[988, 0.15], [0, 0.05], [988, 0.15], [0, 0.05], [1319, 0.28]],
  done: [[1047, 0.08], [1319, 0.08], [1568, 0.18]],
  long: [[660, 0.04]],
};
const PATTERNS = {
  scan: [35],
  ok: [25, 40, 25],
  error: [90, 60, 90],
  alert: [60, 80, 60],
  alarm: [140, 80, 140, 80, 220],
  done: [40, 50, 120],
  long: [20],
};

const html = document.documentElement;
let ctx = null;
function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx ||= new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// browsers allow sound only after a touch: open the audio context on the first one
window.addEventListener('pointerdown', () => audio(), { once: true, capture: true });

function play(seq) {
  try {
    const a = audio();
    if (!a) return;
    let t = a.currentTime + 0.01;
    for (const [f, d] of seq) {
      if (f) {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(a.destination);
        o.start(t);
        o.stop(t + d + 0.02);
      }
      t += d;
    }
  } catch {
    /* no audio: nothing to do */
  }
}

// a phone (coarse pointer) with the Vibration API really vibrates; anything else shows the sign
const canVibrate = 'vibrate' in navigator && matchMedia('(pointer: coarse)').matches;
let signTimer = null;
function sign() {
  const stage = document.getElementById('stage');
  if (!stage) return;
  let el = stage.querySelector('.vib-sign');
  if (!el) {
    el = document.createElement('div');
    el.className = 'vib-sign';
    el.innerHTML = `${icon.vibration}<span>진동</span>`;
    stage.appendChild(el);
  }
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(signTimer);
  signTimer = setTimeout(() => el.classList.remove('show'), 900);
}

/** Plays the feedback of `kind`: a sound by day, a vibration at night (야간모드). */
export function feedback(kind) {
  if (html.classList.contains('shot')) return;
  const night = html.classList.contains('night');
  if (night) {
    if (canVibrate) navigator.vibrate(PATTERNS[kind] || [20]);
    else sign();
  } else {
    play(TONES[kind] || TONES.long);
  }
  html.dataset.fb = `${night ? 'vibrate' : 'sound'}:${kind}`;
}

// 수행 완료 screens
const DONE = ['done', 'wdone', 'trfdone', 'vdone'];
window.addEventListener('screenchange', (e) => DONE.includes(e.detail?.name) && feedback('done'));
