// 활력징후 음성 입력 (요청, not in the Figma file) — 활력징후 측정 · 사진 촬영/첨부 측정값 확인 · 수혈 15분 중간 체크.
// 마이크 → 듣는 중 (받아쓰기) → 항목별 인식 결과 → 입력하기 (칸이 채워지고 잠깐 강조).
//   "혈압 128에 82, 맥박 76, 호흡 18, 체온 36.8, 산소포화도 97" · 숫자 또는 한글 수사(백이십팔 · 삼십육 점 팔)
// The browser's speech recognition (Web Speech API, ko-KR) is used when it exists; without it, without the microphone
// permission or when it fails, the screen's demo sentence is "heard" instead ('시연 문장으로 입력' does that any time).
// Note: browser speech recognition sends the audio to the browser vendor (Google · Apple) for processing.
import { openSheet, closeSheet, toast, esc } from './ui.js';
import { icon } from './icons.js';

const ORDER = ['SBP', 'DBP', 'PR', 'RR', 'BT', 'SpO2'];
const RANGE = { SBP: [40, 300], DBP: [20, 200], PR: [20, 250], RR: [4, 60], BT: [30, 45], SpO2: [50, 100] };
const NAME = { SBP: '수축기', DBP: '이완기', PR: '맥박', RR: '호흡', BT: '체온', SpO2: '산소포화도' };
const EXAMPLE = '혈압 128에 82, 맥박 76, 호흡 18, 체온 36.8, 산소포화도 97';

/** The mic pill in a vital card head. */
export const voiceButton = () => `<button class="vvoice-btn" data-act="vvoice" aria-label="음성으로 활력징후 입력">${icon.mic}<span>음성 입력</span></button>`;

/* ---------------- parsing ---------------- */
const KO = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
function koInt(s) {
  let total = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch in KO) cur = KO[ch];
    else if (ch === '십') (total += (cur || 1) * 10), (cur = 0);
    else if (ch === '백') (total += (cur || 1) * 100), (cur = 0);
  }
  return total + cur;
}
function koNumber(tok) {
  const [a, b] = tok.split(/\s*점\s*/);
  const n = koInt(a);
  return b ? parseFloat(`${n}.${[...b].map((c) => KO[c] ?? '').join('')}`) : n;
}
// digits, or a Korean numeral of 2+ syllables (a lone 이 · 사 is a particle or part of a word, not a number)
const NUM = /(\d+(?:\.\d+)?)|([영공일이삼사오육륙칠팔구십백]{2,}(?:\s*점\s*[영공일이삼사오육륙칠팔구]+)?)/g;
const numbersIn = (seg) => [...seg.matchAll(NUM)].map((m) => (m[1] ? parseFloat(m[1]) : koNumber(m[2])));

const KEY = /(혈압|비피|수축기|이완기|맥박|심박수?|펄스|호흡수?|체온|산소\s*포화도|포화도|산소|SBP|DBP|SpO2|BP|PR|HR|RR|BT)/gi;
function keyOf(word) {
  const w = word.replace(/\s/g, '').toUpperCase();
  if (/혈압|비피|^BP$/.test(w)) return 'BP';
  if (/수축기|^SBP$/.test(w)) return 'SBP';
  if (/이완기|^DBP$/.test(w)) return 'DBP';
  if (/맥박|심박|펄스|^PR$|^HR$/.test(w)) return 'PR';
  if (/호흡|^RR$/.test(w)) return 'RR';
  if (/체온|^BT$/.test(w)) return 'BT';
  return 'SpO2';
}

function fit(k, n) {
  if (n == null || Number.isNaN(n)) return null;
  if (k === 'BT' && n > 45 && n < 450) n /= 10; // "368" → 36.8
  const [lo, hi] = RANGE[k];
  if (n < lo || n > hi) return null;
  return k === 'BT' ? n.toFixed(1) : String(Math.round(n));
}

/** "혈압 128에 82, 맥박 76 …" → { SBP: '128', DBP: '82', PR: '76' }. Numbers without any item name fill SBP, DBP, PR … in order. */
export function parseVitals(raw) {
  const text = String(raw)
    .replace(/(\d)\s*점\s*(\d)/g, '$1.$2')
    .replace(/(\d)\s*[/／]\s*(\d)/g, '$1 $2');
  const out = {};
  const hits = [...text.matchAll(KEY)];
  if (!hits.length) {
    numbersIn(text).forEach((n, i) => {
      const v = ORDER[i] && fit(ORDER[i], n);
      if (v) out[ORDER[i]] = v;
    });
    return out;
  }
  hits.forEach((m, i) => {
    const seg = text.slice(m.index + m[0].length, hits[i + 1]?.index ?? text.length);
    const nums = numbersIn(seg);
    const k = keyOf(m[0]);
    if (k === 'BP') {
      const s = fit('SBP', nums[0]);
      const d = fit('DBP', nums[1]);
      if (s) out.SBP = s;
      if (d) out.DBP = d;
    } else {
      const v = fit(k, nums[0]);
      if (v) out[k] = v;
    }
  });
  return out;
}

/** A plausible sentence for the demo: the patient's previous values, a little changed. */
export function demoSentence(prev = {}) {
  const n = (k, d, fb) => {
    const p = parseFloat(prev[k]);
    return Number.isNaN(p) ? fb : p + d;
  };
  const bt = n('BT', 0.2, 36.8);
  return `혈압 ${Math.round(n('SBP', -4, 124))}에 ${Math.round(n('DBP', -2, 78))}, 맥박 ${Math.round(n('PR', -6, 84))}, 호흡 ${Math.round(n('RR', -2, 18))}, 체온 ${(bt > 45 ? 36.8 : bt).toFixed(1)}도, 산소포화도 ${Math.min(100, Math.round(n('SpO2', 1, 97)))}`;
}

/* ---------------- the sheet ---------------- */
const FALLBACK = ['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'language-not-supported', 'bad-grammar'];
let session = 0; // a newer listen / demo makes older callbacks stale

/**
 * Opens 음성으로 입력. `prev`: { SBP: '118', … } for the demo sentence · `onApply(values)` gets only the recognised items.
 */
export function openVoiceInput({ prev = {}, onApply }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let result = {};
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">음성으로 입력</p><span class="chip on" data-v="mode"><span>${SR ? '음성 인식' : '시연'}</span></span></div>
     <div class="vv-stage" data-v="stage">
       <button class="vv-mic" data-sheet-act="mic" aria-label="다시 말하기">${icon.mic}</button>
       <p class="vv-state" data-v="state">듣고 있습니다…</p>
       <p class="vv-text" data-v="text"></p>
     </div>
     <p class="vv-hint">예) ${EXAMPLE}</p>
     <div class="vv-result" data-v="result"></div>
     <div class="sheet-btns">
       <button class="btn line" data-sheet-act="again">다시 말하기</button>
       <button class="btn" data-sheet-act="apply" disabled>입력하기</button>
     </div>
     <button class="vv-demo" data-sheet-act="demo">시연 문장으로 입력</button>`,
    {
      mic: () => listen(),
      again: () => listen(),
      demo: () => demo(),
      apply: () => {
        if (!Object.keys(result).length) return;
        stop();
        closeSheet();
        onApply(result);
      },
      dismiss: () => stop(),
    },
    { cls: 'vv' },
  );
  const $ = (k) => document.querySelector(`#sheet-layer .sheet.vv [data-v="${k}"]`);
  // closed (입력하기 · dim · 뒤로가기) or replaced by a newer listen: older callbacks do nothing
  const alive = (id) => id === session && !!document.querySelector('#sheet-layer .sheet.vv');

  function stop() {
    session++;
    try {
      rec?.abort();
    } catch {
      /* already ended */
    }
    rec = null;
  }
  function setState(phase, msg, text = '') {
    const stage = $('stage');
    if (!stage) return;
    stage.dataset.phase = phase;
    $('state').textContent = msg;
    $('text').textContent = text ? `“${text}”` : '';
    if (phase === 'listening') showResult(null);
  }
  function showResult(values) {
    result = values || {};
    const box = $('result');
    const btn = document.querySelector('#sheet-layer .sheet.vv [data-sheet-act="apply"]');
    if (!box) return;
    btn.disabled = !Object.keys(result).length;
    if (!values) return (box.innerHTML = '');
    box.innerHTML = ORDER.map((k) =>
      result[k]
        ? `<span class="vv-chip ok"><b>${k}</b>${esc(result[k])}</span>`
        : `<span class="vv-chip miss"><b>${k}</b>${NAME[k]} 미인식</span>`,
    ).join('');
  }
  function finish(text) {
    const values = parseVitals(text);
    const n = Object.keys(values).length;
    setState('done', n ? `${n}개 항목을 인식했습니다.` : '인식한 측정값이 없습니다. 다시 말해 주세요.', text);
    showResult(values);
  }

  /** The demo sentence appears as if being dictated. */
  function demo(note) {
    stop();
    const id = session;
    const sentence = demoSentence(prev);
    const mode = $('mode');
    if (mode) mode.innerHTML = '<span>시연</span>';
    setState('listening', note || '듣고 있습니다… (시연)');
    const words = sentence.split(' ');
    let i = 0;
    const step = () => {
      if (!alive(id)) return;
      i++;
      $('text').textContent = `“${words.slice(0, i).join(' ')}”`;
      if (i < words.length) setTimeout(step, 170);
      else setTimeout(() => alive(id) && finish(sentence), 350);
    };
    setTimeout(step, 400);
  }

  function listen() {
    if (!SR) return demo();
    stop();
    const id = session;
    let finalText = '';
    let error = null;
    try {
      rec = new SR();
    } catch {
      return demo('음성 인식을 사용할 수 없어 시연 문장으로 입력합니다.');
    }
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      if (!alive(id)) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      $('text').textContent = `“${finalText}${interim}”`;
    };
    rec.onerror = (e) => (error = e.error);
    rec.onend = () => {
      if (!alive(id)) return;
      rec = null;
      if (finalText.trim()) return finish(finalText.trim());
      if (FALLBACK.includes(error)) return demo('음성 인식을 사용할 수 없어 시연 문장으로 입력합니다.');
      setState('idle', '말씀을 듣지 못했습니다. 마이크를 눌러 다시 말해 주세요.');
    };
    setState('listening', '듣고 있습니다… 측정값을 말해 주세요.');
    try {
      rec.start();
    } catch {
      demo('음성 인식을 사용할 수 없어 시연 문장으로 입력합니다.');
    }
  }

  listen();
}

/** Briefly highlights the cells voice just filled (after the screen re-rendered). */
export function flashVoiced(selector, keys, msg = `음성으로 ${keys.length}개 항목을 입력했습니다.`) {
  requestAnimationFrame(() =>
    keys.forEach((k) => {
      const el = document.querySelector(`${selector}[data-k="${k}"]`);
      if (!el) return;
      el.classList.remove('voiced');
      void el.offsetWidth;
      el.classList.add('voiced');
    }),
  );
  toast(msg);
}
