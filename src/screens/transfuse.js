// 수혈 진행 (not in the Figma file; built from the existing cards, badges, vital cells and popups).
// 환자 팔찌 → 수혈하기 목록 (혈액백 = 혈액번호 + 혈액제제 스캔) → 수행하기 → 1차·2차 인증 → 이중 확인 완료 → 확인 →
// 수혈 진행 화면, one confirmed bag at a time:
//   [수혈 시작] (시작 시각 기록) → 예상 종료 시각 · 15분 중간 체크 타이머 · 혈액팩이 줄어드는 애니메이션 · [긴급 종료]
//   15분: 알림 → 활력징후 + 이상반응 체크 → 이상 없음 = 계속 / 이상반응 = 긴급 종료
//   혈액팩이 비면 [수혈 완료] (종료 시각·투여량 기록) → 같은 항목의 다음 혈액백: 혈액번호 스캔만 (이중 인증 없이) → [수혈 시작] …
//   (다른 항목은 목록에서 바코드 2개 + 이중 인증) → 수혈 완료 기록
//   [긴급 종료] → 사유 선택 → 종료 시각·투여량 기록 → 수혈 중단 기록
// The demo clock starts at the real time of 수혈 시작 and can run ×60 / ×600 so that a 2-hour unit can be shown.
import { register, go, pop, replace, backTo, rerender } from '../router.js';
import { header, button, badge, esc, toast, openSheet, closeSheet, openDialog, asset3d, statusBlock, patientLine } from '../ui.js';
import { icon } from '../icons.js';
import { patientTitle, NURSE, DEMO_DATE, bloodType } from '../data.js';
import { PATIENTS } from '../patients.js';
import { state, completeTask, trfUnits, trfNext, trfLeft, recordVitals } from '../state.js';
import { confirmReset, openMedDialog, openScanSim, FAIL_SIM } from './med.js';
import { flagOf } from './vitals.js';
import { toWorkScan, prevLine, prevValues, prevVital, stepValue, flagTag } from './work.js';
import { voiceButton, openVoiceInput, flashVoiced } from '../vvoice.js';
import { feedback } from '../feedback.js';

const MIN = 60000;
const CHECK_MIN = 15; // 수혈 시작 15분 뒤 중간 체크
const SPEEDS = [
  [1, '실시간'],
  [60, '×60'],
  [600, '×600'],
];
export const REACTIONS = ['발열 (1℃ 이상 상승)', '오한', '두드러기 · 가려움', '호흡곤란', '흉통 · 요통', '저혈압 · 빈맥'];
const STOP_REASONS = [...REACTIONS, '정맥로 문제 (침윤 · 누출)', '환자 거부 · 요청', '기타'];

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** h:mm */
const dur = (ms) => {
  const m = Math.max(0, Math.floor(ms / MIN));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
};
/** m:ss */
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

/* ---------------- session (state.work.trf.run: the bag being transfused) ---------------- */
/** The bag being transfused: the next bag confirmed by its two barcodes (and double-checked). */
export function trfRun() {
  const w = state.work.trf;
  if (!w.run) {
    let next = trfNext();
    if (!next) {
      // screenshots (?shot=trfrun) open this screen directly: take the first bag as confirmed
      if (!document.documentElement.classList.contains('shot')) return null;
      next = trfLeft()[0];
      if (!next) return null;
      w.bags[next.unit] = 'ok';
    }
    const { unit, o } = next;
    w.run = { unit, oid: o.id, name: o.name, comp: o.comp, abo: o.abo, rh: o.rh, volume: o.volume || 300, minutes: o.minutes || 120, phase: 'ready', speed: w.speed, start: 0, base: 0, t0: 0, hold: false, chk: null };
  }
  return w.run;
}

/** n / m 단위: this bag's place among every bag of the patient's 수혈 오더. */
const seqOf = () => trfUnits().length - trfLeft().length + 1;
const total = (run) => run.minutes * MIN;
/** Transfused time of the current bag (demo clock: real time × speed, held while a demo-speed check is open). */
function elapsed(run) {
  if (run.phase === 'ready' || run.phase === 'scan') return 0;
  const e = run.base + (run.hold || run.phase !== 'running' ? 0 : (Date.now() - run.t0) * run.speed);
  return Math.min(e, total(run));
}
const clockOf = (run, e = elapsed(run)) => run.start + e;
function freeze(run) {
  run.base = elapsed(run);
  run.t0 = Date.now();
  run.hold = true;
}
function thaw(run) {
  run.t0 = Date.now();
  run.hold = false;
}

/* ---------------- the blood bag (3D style: glossy bag, label card, drip chamber) ---------------- */
// The label shows the order's 혈액 제제 종류 (comp) and 혈액형 + Rh; the blood surface sinks as it is transfused and drops
// fall into the drip chamber while it runs. Liquid colours follow the product (RBC · WBC red, FFP · PLT amber).
const BAG = 'M34 50H126a16 16 0 0 1 16 16V194c0 15-9 23-24 29l-16 7c-6 3-9 6-10 10H68c-1-4-4-7-10-10l-16-7c-15-6-24-14-24-29V66a16 16 0 0 1 16-16Z';
const BAG_IN = 'M38 56H122a12 12 0 0 1 12 12V192c0 12-8 19-21 24l-15 7c-5 2-8 6-9 10H71c-1-4-4-8-9-10l-15-7c-13-5-21-12-21-24V68a12 12 0 0 1 12-12Z';
const LEVEL_TOP = 92; // blood surface of a full bag
const LEVEL_SPAN = 146; // full → empty (below the neck)
const WAVE = `M-60 ${LEVEL_TOP}${' q15 -6 30 0 t30 0'.repeat(6)} V320 H-60Z`;
const WAVE_EDGE = `M-60 ${LEVEL_TOP}${' q15 -6 30 0 t30 0'.repeat(6)}`;
const BLOOD = {
  red: ['#ff4a52', '#e3101f', '#9c0410'],
  amber: ['#ffd36b', '#f2b233', '#c98a12'],
};
const compOf = (bag) => bag.comp || (/red/i.test(bag.name) ? 'RBC' : /white/i.test(bag.name) ? 'WBC' : /plasma/i.test(bag.name) ? 'FFP' : /platelet/i.test(bag.name) ? 'PLT' : 'BLOOD');

function bagSvg(bag, left, running) {
  const comp = compOf(bag);
  const [c0, c1, c2] = BLOOD[comp === 'FFP' || comp === 'PLT' ? 'amber' : 'red'];
  const ticks = [1, 0.75, 0.5, 0.25]
    .map((f) => {
      const y = LEVEL_TOP + (1 - f) * LEVEL_SPAN;
      return `<line x1="146" x2="152" y1="${y}" y2="${y}"/><text x="155" y="${y + 3.5}">${Math.round(bag.volume * f)}</text>`;
    })
    .join('');
  const type = `${esc(bag.abo)}${esc(bag.rh || '')}`;
  return `
    <svg class="bag${running ? ' running' : ''}${left <= 0.001 ? ' empty' : ''}" viewBox="0 0 180 300" role="img" aria-label="${comp} ${type} 혈액팩 남은 양 ${Math.round(left * 100)}%">
      <defs>
        <clipPath id="bag-clip"><path d="${BAG_IN}"/></clipPath>
        <linearGradient id="bag-plastic" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#f1f4fa"/><stop offset="1" stop-color="#dfe5ef"/>
        </linearGradient>
        <linearGradient id="bag-handle" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe5ef"/>
        </linearGradient>
        <linearGradient id="bag-blood" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="${c0}"/><stop offset="0.45" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
        </linearGradient>
        <linearGradient id="bag-side" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="0.22" stop-color="#fff" stop-opacity="0"/>
          <stop offset="0.8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/>
        </linearGradient>
        <radialGradient id="bag-dropg" cx="0.4" cy="0.6" r="0.7">
          <stop offset="0" stop-color="#ff5a60"/><stop offset="1" stop-color="#c70d1c"/>
        </radialGradient>
        <filter id="bag-card" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#6b0a12" flood-opacity="0.22"/>
        </filter>
      </defs>
      <path class="bag-handle" fill-rule="evenodd" d="M70 12h20a12 12 0 0 1 12 12v30H58V24a12 12 0 0 1 12-12Zm2 9a4 4 0 0 0-4 4v25h24V25a4 4 0 0 0-4-4Z"/>
      <path class="bag-body" d="${BAG}"/>
      <g clip-path="url(#bag-clip)">
        <g class="bag-level" data-v="level" style="transform:translateY(${((1 - left) * LEVEL_SPAN).toFixed(1)}px)">
          <g class="bag-wave"><path d="${WAVE}" fill="url(#bag-blood)"/><path class="bag-edge" d="${WAVE_EDGE}" stroke="${c0}"/></g>
        </g>
        <rect x="18" y="50" width="124" height="200" fill="url(#bag-side)"/>
      </g>
      <path class="bag-rim" d="${BAG_IN}"/>
      <path class="bag-gloss" d="M30 84V73c0-9 6-14 15-14h10"/>
      <g class="bag-ticks">${ticks}</g>
      <g class="bag-label" filter="url(#bag-card)">
        <rect x="38" y="116" width="84" height="64" rx="9"/>
      </g>
      <path class="bag-ldrop" d="M55 124c4 6 9.5 11 9.5 17.5a9.5 9.5 0 0 1-19 0C45.5 135 51 130 55 124Z"/>
      <ellipse class="bag-lshine" cx="51.5" cy="140" rx="1.8" ry="3.4" transform="rotate(20 51.5 140)"/>
      <line class="bag-ldiv" x1="71" x2="71" y1="124" y2="153"/>
      <text class="bag-t1" x="76" y="137">${comp}</text>
      <text class="bag-t2" x="75" y="156">${type}</text>
      <rect class="bag-lbar" x="46" y="162" width="68" height="4" rx="2"/>
      <rect class="bag-lbar" x="46" y="170" width="46" height="4" rx="2"/>
      <rect class="bag-neck" x="67" y="236" width="26" height="12" rx="3.5"/>
      <rect class="bag-stem" x="75" y="247" width="10" height="16" rx="2"/>
      <rect class="bag-flow" x="78" y="247" width="4" height="16" rx="2" fill="${c1}"/>
      <rect class="bag-chamber" x="62" y="261" width="36" height="34" rx="9"/>
      <path class="bag-drop" d="M80 263c1.6 2.2 3 4 3 5.6a3 3 0 0 1-6 0c0-1.6 1.4-3.4 3-5.6Z" fill="${c1}"/>
      <rect class="bag-pool" x="69" y="281" width="22" height="7.5" rx="3.75" fill="${c1}"/>
    </svg>`;
}

/* ---------------- 수혈 진행 화면 ---------------- */
const STATUS = {
  ready: ['수혈 대기', 'wait'],
  running: ['수혈 중', 'run'],
  due: ['15분 체크 필요', 'due'],
  empty: ['혈액팩 비움', 'done'],
  scan: ['다음 혈액백 대기', 'wait'],
};

function checkRow(run) {
  if (run.phase === 'ready' || run.phase === 'scan') {
    return `<span class="k">15분 중간 체크</span><span class="v">수혈 시작 15분 후</span>`;
  }
  if (run.chk === 'due') {
    return `<span class="k">${icon.error}15분 중간 체크 필요</span><button class="btn tr-chk-btn" data-act="check">체크하기</button>`;
  }
  if (run.chk) {
    const tag = run.chk.ok ? '이상 없음' : '이상반응';
    return `<span class="k">${icon.checkCircle}15분 중간 체크 완료</span><span class="v">${run.chk.at} · ${tag}</span>`;
  }
  return `<span class="k">15분 중간 체크 · ${hhmm(run.start + CHECK_MIN * MIN)}</span><span class="v"><b data-v="cd">${mmss(CHECK_MIN * MIN - elapsed(run))}</b> 남음</span>`;
}

function logRows(log) {
  return log
    .map(
      (l, n) => `
      <div class="tr-log-row">
        <span class="no">#${n + 1}</span>
        <span class="u">${l.unit}</span>
        <span class="t">${hhmm(l.start)}–${hhmm(l.end)}</span>
        <span class="ml">${l.ml}ml</span>
        <span class="st ${l.status}">${l.status === 'done' ? '완료' : '중단'}</span>
      </div>
      <p class="tr-log-sub">${l.chk ? `15분 체크 ${l.chk.at} · ${l.chk.ok ? '이상 없음' : '이상반응'}` : '15분 체크 전'}${l.reason ? ` · 사유: ${esc(l.reason)}` : ''}</p>`,
    )
    .join('');
}

function footer(run) {
  if (run.phase === 'ready') return `<div class="screen-foot">${button('수혈 시작', 'start', { cta: true })}</div>`;
  if (run.phase === 'empty') return `<div class="screen-foot">${button('수혈 완료', 'complete', { cta: true })}</div>`;
  if (run.phase === 'scan') {
    return `<div class="screen-foot two-btns"><button class="btn danger-line" data-act="stop">긴급 종료</button>${button('혈액번호 스캔', 'scan-unit', { long: 'scan-unit-sim' })}</div>`;
  }
  return `<div class="screen-foot"><button class="btn danger" data-act="stop">긴급 종료</button></div>`;
}

register('trfrun', {
  bg: 'screen',
  render: () => {
    const run = trfRun();
    if (!run) return `${header({ title: '수혈하기', left: 'back' })}<div class="screen-body"></div>`;
    const w = state.work.trf;
    const bag = run;
    const e = elapsed(run);
    const left = 1 - e / total(run);
    const started = run.phase === 'running' || run.phase === 'empty';
    const [status, tone] = STATUS[run.phase === 'running' && run.chk === 'due' ? 'due' : run.phase];
    return `
      ${header({ title: '수혈하기', left: 'back', right: 'menu' })}
      <div class="screen-body scroll trf-run">
        ${patientLine()}
        <section class="tr-card tr-head">
          <div class="tr-name"><span>${esc(bag.name)}</span><img class="warn" src="${asset3d('warning-red')}" alt="고위험">${badge(`${seqOf()}/${trfUnits().length} 단위`, 'count-grad')}</div>
          <p class="tr-sub">혈액번호 <b>${bag.unit || '스캔 대기'}</b><i></i><b class="abo">혈액형 : ${esc(bloodType(bag))}</b><i></i>${bag.volume}ml</p>
          ${run.phase === 'scan' ? `<p class="tr-scan">${icon.error}<span>같은 항목의 다음 혈액백 · 혈액번호만 스캔해 주세요.</span></p>` : ''}
        </section>
        <div class="tr-stage">
          ${bagSvg(bag, left, run.phase === 'running' && !run.hold)}
          <div class="tr-side">
            <span class="tr-status ${tone}" data-v="status">${status}</span>
            <p class="tr-pct"><b data-v="pct">${Math.round(left * 100)}</b><small>%</small></p>
            <p class="tr-ml">남은 혈액 <b data-v="ml">${Math.round(bag.volume * left)}</b> / ${bag.volume} ml</p>
            <p class="tr-rate">주입 속도 ${(bag.volume / bag.minutes).toFixed(1)} ml/min</p>
          </div>
        </div>
        <section class="tr-card tr-times">
          <div class="tr-time"><span class="k">시작</span><b>${started ? hhmm(run.start) : '--:--'}</b></div>
          <div class="tr-time"><span class="k">예상 종료</span><b>${started ? hhmm(run.start + total(run)) : `${dur(total(run))} 소요`}</b></div>
          <div class="tr-time"><span class="k">경과</span><b data-v="el">${dur(e)}</b></div>
          <div class="tr-bar"><i data-v="bar" style="width:${((1 - left) * 100).toFixed(1)}%"></i></div>
        </section>
        <section class="tr-card tr-check${run.chk === 'due' ? ' due' : run.chk ? ' ok' : ''}" data-v="check">${checkRow(run)}</section>
        <div class="tr-speed"><span>시연 속도</span>${SPEEDS.map(
          ([s, label]) => `<button class="chip${run.speed === s ? ' on' : ''}" data-act="speed" data-s="${s}"><span>${label}</span></button>`,
        ).join('')}</div>
        ${w.log.length ? `<section class="tr-card tr-log"><p class="tr-card-title">수혈 기록</p>${logRows(w.log)}</section>` : ''}
      </div>
      ${footer(run)}`;
  },
  mount(el, params) {
    const run = trfRun();
    if (!run) return backTo('wtask', { kind: 'trf' });
    // ?shot=trfrun&phase=running&at=40 — a still state for screenshots
    if (params.shot === 'trfrun' && params.phase && run.phase === 'ready' && params.phase !== 'ready') {
      Object.assign(run, { phase: params.phase === 'due' ? 'running' : params.phase, start: Date.now(), base: Number(params.at || 0) * MIN, t0: Date.now(), hold: true });
      if (params.phase === 'due') run.chk = 'due';
      else if (Number(params.at) >= CHECK_MIN) run.chk = { at: hhmm(run.start + CHECK_MIN * MIN), ok: true };
      return rerender();
    }
    startTicker();
  },
  actions: {
    'hdr-back': () => leave('hub'),
    'hdr-menu': () => leave('menu'),
    start: () => {
      const run = trfRun();
      const w = state.work.trf;
      // the demo clock runs on from the previous bag's end (plus the real time spent on the next scan and check)
      const last = w.log[w.log.length - 1];
      const start = last ? Math.max(Date.now(), last.end + (Date.now() - w.doneAt)) : Date.now();
      Object.assign(run, { phase: 'running', start, base: 0, t0: Date.now(), hold: false, chk: null });
      feedback('ok');
      rerender();
      toast(`수혈을 시작했습니다. 예상 종료 ${hhmm(run.start + total(run))}`);
    },
    speed: (t) => {
      const run = trfRun();
      if (run.phase === 'running' && !run.hold) {
        run.base = elapsed(run);
        run.t0 = Date.now();
      }
      run.speed = Number(t.dataset.s);
      state.work.trf.speed = run.speed; // the next bag keeps it
      rerender();
    },
    check: () => go('trfcheck'),
    stop: () => confirmStop(),
    complete: () => {
      const run = trfRun();
      if (run.chk === 'due') {
        toast('15분 중간 체크를 먼저 기록해 주세요.');
        return go('trfcheck');
      }
      finishBag(run);
    },
    'scan-unit': () => {
      const next = sameWaiting(trfRun())[0];
      if (next) scanUnit(next.unit);
    },
    'scan-unit-sim': () => openScanSim(unitSims(), scanUnit),
  },
  onBack: () => {
    leave('hub');
    return true;
  },
  onScan: (code) => {
    const run = trfRun();
    if (run?.phase === 'scan') return scanUnit(code);
    toast(run?.phase === 'ready' ? '수혈 시작을 눌러 주세요.' : '수혈 중에는 다른 바코드를 스캔할 수 없습니다.');
  },
});

/** 뒤로가기 · ☰: before 수혈 시작 or between bags (back to the list); a running bag ends with 수혈 완료 or 긴급 종료. */
function leave(then) {
  const run = trfRun();
  if (!run || run.phase === 'ready' || run.phase === 'scan') {
    if (then !== 'hub') return confirmReset('menu');
    if (run?.phase === 'scan') state.work.trf.run = null; // the next bag can also be scanned on the list later
    return backTo('wtask', { kind: 'trf' });
  }
  openDialog(
    { title: '수혈 진행 중', desc: '수혈을 완료하거나 긴급 종료한 뒤\n다른 화면으로 이동할 수 있습니다.' },
    { ok: () => closeSheet() },
  );
}

/* ---------------- timer ---------------- */
let ticker = null;
function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(tick, 200);
  tick();
}
window.addEventListener('screenchange', (e) => {
  if (e.detail.name !== 'trfrun') clearInterval(ticker);
});

function tick() {
  const el = document.querySelector('.scr-trfrun');
  if (!el) return clearInterval(ticker);
  const run = trfRun();
  if (run.phase !== 'running') return;
  const e = elapsed(run);
  if (!run.chk && e >= CHECK_MIN * MIN) return dueCheck(run);
  if (e >= total(run)) {
    freeze(run);
    run.phase = 'empty';
    feedback('alert');
    rerender();
    return toast('혈액팩이 비었습니다. 수혈 완료를 눌러 기록해 주세요.');
  }
  paint(el, run, e);
}

/** Moves the bag level, times and countdown without re-rendering the screen. */
function paint(el, run, e) {
  const bag = run;
  const left = 1 - e / total(run);
  const set = (k, v) => {
    const n = el.querySelector(`[data-v="${k}"]`);
    if (n) n.textContent = v;
  };
  el.querySelector('[data-v="level"]').style.transform = `translateY(${((1 - left) * LEVEL_SPAN).toFixed(1)}px)`;
  el.querySelector('[data-v="bar"]').style.width = `${((1 - left) * 100).toFixed(1)}%`;
  set('pct', Math.round(left * 100));
  set('ml', Math.round(bag.volume * left));
  set('el', dur(e));
  set('cd', mmss(CHECK_MIN * MIN - e));
}

/** 15 minutes in: alarm + popup; at demo speed the clock waits for the check. */
function dueCheck(run) {
  run.chk = 'due';
  if (run.speed > 1) {
    freeze(run);
    run.base = CHECK_MIN * MIN; // a fast demo tick may overshoot: the check is at 15:00
  }
  feedback('alarm'); // 15분 체크 알람: 주간 알람음 · 야간 진동
  rerender();
  openDialog(
    {
      title: '15분 중간 체크',
      tone: 'info',
      fb: false,
      desc: '수혈 시작 15분이 지났습니다.\n활력징후와 이상반응을 확인해 주세요.',
      buttons: [{ label: '체크하기', act: 'ok' }],
    },
    {
      ok: () => {
        closeSheet();
        go('trfcheck');
      },
    },
  );
}

/* ---------------- 단위 완료 · 다음 혈액백 · 긴급 종료 ---------------- */
function logBag(run, status, reason = null) {
  const e = elapsed(run);
  state.work.trf.log.push({
    unit: run.unit,
    start: run.start,
    end: clockOf(run, e),
    ml: Math.round((run.volume * e) / total(run)),
    status,
    reason,
    chk: run.chk && run.chk !== 'due' ? run.chk : null,
  });
}

/** Bags of the same 항목 not given yet (확인 first). */
const sameWaiting = (run) =>
  trfLeft()
    .filter((x) => x.o.id === run.oid)
    .sort((a, b) => (state.work.trf.bags[b.unit] === 'ok') - (state.work.trf.bags[a.unit] === 'ok'));

/**
 * The bag is empty: record the end time. The same 항목's next bag needs only its 혈액번호 here (no new 이중 인증);
 * another 항목 goes back to the list (바코드 2개 + 이중 인증); nothing left = 수혈 완료.
 */
function finishBag(run) {
  const w = state.work.trf;
  logBag(run, 'done');
  w.bags[run.unit] = 'done';
  w.doneAt = Date.now();
  w.ham = null;
  const n = w.log.filter((l) => l.status === 'done').length;
  const same = sameWaiting(run);
  if (same.length) {
    // already confirmed on the list → ready at once, else 혈액번호 스캔
    const ready = w.bags[same[0].unit] === 'ok' ? same[0].unit : null;
    Object.assign(run, { unit: ready, phase: ready ? 'ready' : 'scan', start: 0, base: 0, t0: 0, hold: false, chk: null });
    rerender();
    return toast(ready ? `${n}단위 수혈을 완료했습니다. 다음 혈액백(${ready})의 수혈 시작을 눌러 주세요.` : `${n}단위 수혈을 완료했습니다. 다음 혈액백의 혈액번호를 스캔해 주세요.`);
  }
  w.run = null;
  if (trfLeft().length) {
    backTo('wtask', { kind: 'trf' });
    return toast(`${n}단위 수혈을 완료했습니다. 다른 혈액제제는 바코드 2개 스캔과 이중 인증이 필요합니다.`);
  }
  w.result = { stopped: false };
  completeTask('trf', hhmm(w.log[w.log.length - 1].end));
  replace('trfdone', {}, 'fade');
}

/** 다음 혈액백 (같은 항목): its 혈액번호 only. Another 항목's bag, a given bag or another patient's blood is refused. */
function scanUnit(code) {
  const run = trfRun();
  if (run?.phase !== 'scan') return;
  const w = state.work.trf;
  const c = String(code).trim().toUpperCase();
  if (!c || c === '#FAIL') return openMedDialog('fail');
  let hit = trfUnits().find((x) => x.unit === c);
  if (!hit) {
    const other = PATIENTS.some((p) => p.id !== state.pid && state.pt[p.id].work.trf.orders.some((o) => o.code === c || o.units.includes(c)));
    if (other || /9999$/.test(c)) return openMedDialog('mismatch');
    if (w.orders.some((o) => o.code === c)) return toast('같은 항목의 다음 혈액백은 혈액번호만 스캔합니다.');
    hit = sameWaiting(run)[0]; // any other label stands for the next bag (demo)
    if (!hit) return;
  }
  if (['done', 'stop'].includes(w.bags[hit.unit])) return toast('이미 수혈한 혈액입니다.');
  if (hit.o.id !== run.oid) {
    return openDialog(
      { title: '다른 혈액제제', desc: `${hit.o.name}은(는) 다른 항목입니다.\n목록에서 바코드 2개 스캔과 이중 인증 후 수혈합니다.` },
      { ok: () => closeSheet() },
    );
  }
  w.bags[hit.unit] = 'ok';
  run.unit = hit.unit;
  run.phase = 'ready';
  rerender();
  toast('혈액번호가 확인되었습니다. 수혈 시작을 눌러 주세요.');
}

function unitSims() {
  const run = trfRun();
  const w = state.work.trf;
  const given = trfUnits().find((x) => ['done', 'stop'].includes(w.bags[x.unit]));
  const diff = trfLeft().find((x) => x.o.id !== run.oid);
  const other = PATIENTS.find((p) => p.id !== state.pid && state.pt[p.id].work.trf.orders.length);
  return [
    ...sameWaiting(run).slice(0, 3).map((x) => ({ label: `혈액번호 · ${x.unit} (같은 항목)`, code: x.unit })),
    given && { label: `혈액번호 · ${given.unit} (수혈 완료한 혈액백)`, code: given.unit },
    diff && { label: `혈액번호 · ${diff.unit} (다른 항목)`, code: diff.unit },
    other && { label: `다른 환자의 혈액 · ${other.name}`, code: state.pt[other.id].work.trf.orders[0].units[0] },
    FAIL_SIM,
  ].filter(Boolean);
}

/** 긴급 종료 → 사유 선택 → 종료 시각 · 투여량 기록. `reasons`: already known (이상반응 at the 15분 체크). */
function confirmStop(reasons) {
  const run = trfRun();
  const at = clockOf(run);
  if (reasons) {
    return openDialog(
      {
        title: '수혈 긴급 종료',
        desc: `이상반응(${reasons})으로\n수혈을 즉시 중단합니다.`,
        buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '긴급 종료', act: 'ok' }],
        cls: 'danger',
      },
      { cancel: () => closeSheet(), ok: () => (closeSheet(), stopRun(reasons)) },
    );
  }
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">긴급 종료 사유</p><span class="chip on"><span>${run.phase === 'running' ? hhmm(at) : run.phase === 'scan' ? '다음 혈액백 전' : '수혈 전'}</span></span></div>
     <p class="sheet-hint">수혈을 즉시 중단합니다. 종료 사유를 선택해 주세요.</p>
     <div class="sheet-list sim-list">${STOP_REASONS.map(
       (r, i) => `<button class="opt" data-sheet-act="pick" data-i="${i}"><span class="ico">${icon.error}</span><span class="lbl">${esc(r)}</span><span class="chev">${icon.chevronRight}</span></button>`,
     ).join('')}</div>`,
    {
      pick: (t) => {
        closeSheet();
        stopRun(STOP_REASONS[+t.dataset.i]);
      },
    },
  );
}

function stopRun(reason) {
  const run = trfRun();
  const w = state.work.trf;
  if (run.phase === 'running' || run.phase === 'empty') logBag(run, 'stopped', reason);
  if (run.unit && run.phase !== 'scan') w.bags[run.unit] = 'stop';
  const at = w.log.length ? w.log[w.log.length - 1].end : Date.now();
  w.result = { stopped: true, reason, at };
  w.run = null;
  w.ham = null;
  completeTask('trf', hhmm(at), '수혈중단');
  feedback('error');
  replace('trfdone', {}, 'fade');
}

/* ---------------- 15분 중간 체크 ---------------- */
let form = null; // { unit, values, reactions }
function checkForm() {
  const unit = trfRun().unit;
  if (!form || form.unit !== unit) {
    // empty cells: the previous record is shown under each one (이전 값이 새 측정값으로 남지 않게)
    form = { unit, values: Object.fromEntries(state.vitals.items.map((i) => [i.k, ''])), reactions: [] };
  }
  return form;
}

const valueW = (v) => (String(v) ? Math.max(2, String(v).length) * 11.6 + 4 : 34);

function checkCell(item, value) {
  const flag = flagOf(item.k, value);
  const [label, cls] = flagTag(item.k, value);
  return `
    <div class="vt-cell has-prev" data-k="${item.k}">
      <div class="vt-top"><span class="vt-k">${item.k}</span><span class="vflag-tag ${cls}">${label}</span></div>
      <div class="vt-mid">
        <button class="vstep" data-act="vstep" data-k="${item.k}" data-d="-1" aria-label="${item.k} 감소">−</button>
        <input class="vval ${flag || ''}" data-k="${item.k}" type="text" inputmode="decimal" value="${esc(value)}" placeholder="입력" style="width:${valueW(value)}px" aria-label="${item.k}" autocomplete="off">
        <button class="vstep" data-act="vstep" data-k="${item.k}" data-d="1" aria-label="${item.k} 증가">+</button>
        <span class="vunit">${item.unit}</span>
      </div>
      ${prevLine(item.k)}
    </div>`;
}

register('trfcheck', {
  bg: 'screen',
  render: () => {
    const run = trfRun();
    const f = checkForm();
    const any = f.reactions.length > 0;
    return `
      ${header({ title: '수혈하기', right: 'close' })}
      <div class="screen-body scroll trf-check">
        ${patientLine()}
        <div class="ham-hero">
          <img src="${asset3d('vital')}" alt="">
          <h2 class="status-title gtext">15분 중간 체크</h2>
          <p class="status-desc">수혈 시작 15분이 지났습니다.\n활력징후와 이상반응을 확인해 주세요.</p>
        </div>
        <section class="vcard">
          <div class="vcard-head"><span class="l"><span class="vcard-title">활력징후</span>${voiceButton()}</span><span class="tr-unit">${run.unit}</span></div>
          <div class="vgrid2">${state.vitals.items.map((i) => checkCell(i, f.values[i.k])).join('')}</div>
          <div class="vcard-foot"><span>${hhmm(clockOf(run))} 측정</span><span>${NURSE.label} (${NURSE.no})</span></div>
        </section>
        <section class="tr-card">
          <p class="tr-card-title">이상반응 확인 <small>해당하는 증상을 모두 선택하세요</small></p>
          <div class="ham-checks">${REACTIONS.map(
            (r, i) => `<button class="ham-check${f.reactions.includes(i) ? ' on' : ''}" data-act="react" data-i="${i}"><span class="cb">${icon.check}</span><span>${esc(r)}</span></button>`,
          ).join('')}</div>
        </section>
      </div>
      <div class="screen-foot">${
        any ? `<button class="btn danger" data-act="check-stop">이상반응 · 긴급 종료</button>` : button('이상 없음 · 수혈 계속', 'check-ok', { cta: true })
      }</div>`;
  },
  mount(el) {
    el.querySelectorAll('.vval').forEach((input) => {
      // 입력 칸을 누르면 직전 값이 채워지고 선택됨
      input.addEventListener('focus', () => {
        const k = input.dataset.k;
        if (!input.value && prevVital(k)) {
          checkForm().values[k] = prevVital(k).v;
          refresh(el, k);
        }
        input.select();
        input.dataset.focused = '1';
      });
      // the click that focused the cell must not undo the selection on mouseup
      input.addEventListener('mouseup', (e) => {
        if (!input.dataset.focused) return;
        delete input.dataset.focused;
        e.preventDefault();
      });
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9.]/g, '');
        checkForm().values[input.dataset.k] = input.value;
        refresh(el, input.dataset.k);
      });
      input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    });
  },
  actions: {
    'hdr-close': () => pop(),
    vstep: (t) => {
      const f = checkForm();
      const k = t.dataset.k;
      f.values[k] = stepValue(k, f.values[k], Number(t.dataset.d));
      refresh(document.querySelector('.scr-trfcheck'), k);
    },
    vvoice: () =>
      openVoiceInput({
        prev: prevValues(),
        onApply: (vals) => {
          Object.assign(checkForm().values, vals);
          rerender();
          flashVoiced('.scr-trfcheck .vt-cell', Object.keys(vals));
        },
      }),
    react: (t) => {
      const f = checkForm();
      const i = +t.dataset.i;
      f.reactions = f.reactions.includes(i) ? f.reactions.filter((x) => x !== i) : [...f.reactions, i].sort();
      rerender();
    },
    'check-ok': () => {
      const f = checkForm();
      const empty = state.vitals.items.filter((i) => !String(f.values[i.k]).trim());
      if (empty.length) return toast(`${empty.map((i) => i.k).join(', ')} 값을 입력해 주세요.`);
      const run = trfRun();
      const at = hhmm(clockOf(run));
      saveVitals(f, at);
      run.chk = { at, ok: true };
      thaw(run);
      pop();
      toast('15분 중간 체크를 기록했습니다. 수혈을 계속합니다.');
    },
    'check-stop': () => {
      const f = checkForm();
      const run = trfRun();
      const at = hhmm(clockOf(run));
      // stopping comes first: the vitals are recorded only when all of them were entered
      if (state.vitals.items.every((i) => String(f.values[i.k]).trim())) saveVitals(f, at);
      run.chk = { at, ok: false };
      confirmStop(f.reactions.map((i) => REACTIONS[i].replace(/ \(.*\)/, '')).join(', '));
    },
  },
  onBack: () => {
    pop();
    return true;
  },
});

function refresh(el, k) {
  const cell = el?.querySelector(`.vt-cell[data-k="${k}"]`);
  if (!cell) return;
  const value = checkForm().values[k];
  const flag = flagOf(k, value);
  const input = cell.querySelector('.vval');
  if (input.value !== value) input.value = value;
  input.className = `vval ${flag || ''}`;
  input.style.width = `${valueW(value)}px`;
  const tag = cell.querySelector('.vflag-tag');
  const [label, cls] = flagTag(k, value);
  tag.className = `vflag-tag ${cls}`;
  tag.textContent = label;
}

/** The check's vitals go to the 임상관찰기록 (환자상세). */
function saveVitals(f, at) {
  recordVitals({
    time: at,
    who: NURSE.label,
    items: state.vitals.items.map((i) => ({ ...i, v: f.values[i.k], at: `${DEMO_DATE.slice(5).replace('-', '/')} ${at}`, flag: flagOf(i.k, f.values[i.k]) })),
  });
}

/* ---------------- 수혈 완료 · 중단 기록 ---------------- */
register('trfdone', {
  bg: 'screen',
  render: () => {
    const w = state.work.trf;
    const stopped = !!w.result?.stopped;
    const ml = w.log.reduce((n, l) => n + l.ml, 0);
    return `
      ${header({ title: '수혈하기' })}
      <div class="screen-body scroll trf-done${stopped ? ' stopped' : ''}">
        ${patientLine()}
        <span class="spacer" style="flex-grow: 50"></span>
        ${statusBlock(
          stopped
            ? { img: 'warning-red', title: '수혈 중단', desc: '긴급 종료 사유와 종료 시각·투여량이\nEMR에 기록되었습니다.' }
            : { img: 'check-blue', title: '수혈 완료', desc: '단위별 수혈 시작·종료 시각과 투여량이\nEMR에 기록되었습니다.' },
        )}
        <section class="tr-card tr-log">
          <div class="tr-log-head"><p class="tr-card-title">수혈 기록</p>${badge(`${w.log.filter((l) => l.status === 'done').length}/${trfUnits().length} 단위 완료`, 'count-grad')}</div>
          ${w.log.length ? logRows(w.log) : '<p class="tr-log-sub">수혈한 단위가 없습니다.</p>'}
          <div class="tr-log-total"><span>총 투여량</span><b>${ml} ml</b></div>
          ${stopped ? `<div class="tr-log-total stop"><span>긴급 종료</span><b>${hhmm(w.result.at)} · ${esc(w.result.reason)}</b></div>` : ''}
          <p class="tr-log-who">${NURSE.label} (${NURSE.no})</p>
        </section>
        <span class="spacer" style="flex-grow: 70"></span>
      </div>
      <div class="screen-foot">${button('확인', 'ok')}</div>`;
  },
  actions: {
    ok: () => toWorkScan('trf'),
  },
  onBack: () => {
    toWorkScan('trf');
    return true;
  },
});
