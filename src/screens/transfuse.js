// 수혈 진행 (not in the Figma file; built from the existing cards, badges, vital cells and popups).
// 환자 팔찌 → 수혈하기 목록 → 수행하기 → 1차·2차 인증 → 이중 확인 완료 → 확인 → 수혈 진행 화면:
//   [수혈 시작] (시작 시각 기록) → 예상 종료 시각 · 15분 중간 체크 타이머 · 혈액팩이 줄어드는 애니메이션 · [긴급 종료]
//   15분: 알림 → 활력징후 + 이상반응 체크 → 이상 없음 = 계속 / 이상반응 = 긴급 종료
//   혈액팩이 비면 [수혈 완료] (종료 시각·투여량 기록) → 다음 단위 혈액번호 스캔 → [수혈 시작] … → 수혈 완료 기록
//   [긴급 종료] → 사유 선택 → 종료 시각·투여량 기록 → 수혈 중단 기록
// The demo clock starts at the real time of 수혈 시작 and can run ×60 / ×600 so that a 2-hour unit can be shown.
import { register, go, pop, replace, rerender } from '../router.js';
import { header, button, badge, esc, toast, openSheet, closeSheet, openDialog, asset3d, statusBlock } from '../ui.js';
import { icon } from '../icons.js';
import { patientTitle, NURSE, DEMO_DATE, VITAL_STEP } from '../data.js';
import { PATIENTS } from '../patients.js';
import { state, completeTask } from '../state.js';
import { openMedDialog, confirmReset, openScanSim, FAIL_SIM } from './med.js';
import { flagOf } from './vitals.js';
import { toWorkScan } from './work.js';

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

/* ---------------- session (state.work.trf.run) ---------------- */
// one bag per 혈액 단위, in order (단위별로 차례로)
const bagsOf = (orders) =>
  orders.flatMap((o) => o.units.map((unit) => ({ oid: o.id, name: o.name, unit, abo: o.abo, volume: o.volume || 300, minutes: o.minutes || 120 })));

/** The selected patient's transfusion: bags, the current one, its timer, the 15분 체크 and the record. */
export function trfRun() {
  const w = state.work.trf;
  if (!w.run) {
    w.run = { bags: bagsOf(w.orders), i: 0, phase: 'ready', speed: 60, start: 0, base: 0, t0: 0, hold: false, chk: null, log: [], reason: null };
  }
  return w.run;
}

const bagOf = (run) => run.bags[run.i];
const total = (run) => bagOf(run).minutes * MIN;
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

/* ---------------- the blood bag ---------------- */
const BAG = 'M30 30h100a12 12 0 0 1 12 12v170c0 22-14 34-34 42l-14 8H66l-14-8c-20-8-34-20-34-42V42a12 12 0 0 1 12-12z';
const LEVEL_TOP = 52; // blood surface of a full bag
const LEVEL_SPAN = 210; // full → empty
const WAVE = `M-120 ${LEVEL_TOP}${' q15 -5 30 0 q15 5 30 0'.repeat(6)} V320 H-120z`;
const shortName = (name) => (/red/i.test(name) ? 'RBC' : /white/i.test(name) ? 'WBC' : /plasma/i.test(name) ? 'FFP' : 'BLOOD');

function bagSvg(bag, left, running) {
  const ticks = [1, 0.75, 0.5, 0.25]
    .map((f) => {
      const y = LEVEL_TOP + (1 - f) * LEVEL_SPAN;
      return `<line x1="145" x2="152" y1="${y}" y2="${y}"/><text x="155" y="${y + 3.5}">${Math.round(bag.volume * f)}</text>`;
    })
    .join('');
  return `
    <svg class="bag${running ? ' running' : ''}" viewBox="0 0 160 300" role="img" aria-label="혈액팩 남은 양 ${Math.round(left * 100)}%">
      <defs>
        <clipPath id="bag-clip"><path d="${BAG}"/></clipPath>
        <linearGradient id="bag-blood" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#7a0b18"/><stop offset="0.45" stop-color="#c3192d"/><stop offset="1" stop-color="#850d1b"/>
        </linearGradient>
        <linearGradient id="bag-shine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.3" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path class="bag-hanger" d="M68 6h24a8 8 0 0 1 8 8v16H60V14a8 8 0 0 1 8-8z"/>
      <path class="bag-body" d="${BAG}"/>
      <g clip-path="url(#bag-clip)">
        <g class="bag-level" data-v="level" style="transform:translateY(${((1 - left) * LEVEL_SPAN).toFixed(1)}px)">
          <path class="bag-wave" d="${WAVE}" fill="url(#bag-blood)"/>
        </g>
        <rect x="18" y="30" width="124" height="240" fill="url(#bag-shine)"/>
      </g>
      <g class="bag-ticks">${ticks}</g>
      <rect class="bag-label" x="44" y="118" width="64" height="42" rx="4"/>
      <text class="bag-t1" x="76" y="136">${shortName(bag.name)}</text>
      <text class="bag-t2" x="76" y="152">${esc(bag.abo)}</text>
      <rect class="bag-port" x="74" y="261" width="12" height="13" rx="2"/>
      <rect class="bag-chamber" x="67" y="273" width="26" height="24" rx="7"/>
      <rect class="bag-pool" x="70" y="288" width="20" height="6" rx="3"/>
      <circle class="bag-drop" cx="80" cy="279" r="2.6"/>
    </svg>`;
}

/* ---------------- 수혈 진행 화면 ---------------- */
const STATUS = {
  ready: ['수혈 대기', 'wait'],
  running: ['수혈 중', 'run'],
  due: ['15분 체크 필요', 'due'],
  empty: ['혈액팩 비움', 'done'],
  scan: ['다음 단위 대기', 'wait'],
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

function logRows(run) {
  return run.log
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
    const bag = bagOf(run);
    const e = elapsed(run);
    const left = 1 - e / total(run);
    const started = run.phase === 'running' || run.phase === 'empty';
    const [status, tone] = STATUS[run.phase === 'running' && run.chk === 'due' ? 'due' : run.phase];
    return `
      ${header({ title: patientTitle(), left: 'back', right: 'menu' })}
      <div class="screen-body scroll trf-run">
        <section class="tr-card tr-head">
          <div class="tr-name"><span>${esc(bag.name)}</span><img class="warn" src="${asset3d('warning-red')}" alt="고위험">${badge(`${run.i + 1}/${run.bags.length} 단위`, 'count-grad')}</div>
          <p class="tr-sub">혈액번호 <b>${bag.unit}</b><i></i><b class="abo">혈액형 : ${esc(bag.abo)}</b><i></i>${bag.volume}ml</p>
          ${run.phase === 'scan' ? `<p class="tr-scan">${icon.error}<span>다음 단위의 혈액번호를 스캔해 주세요.</span></p>` : ''}
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
        ${run.log.length ? `<section class="tr-card tr-log"><p class="tr-card-title">수혈 기록</p>${logRows(run)}</section>` : ''}
      </div>
      ${footer(run)}`;
  },
  mount(el, params) {
    const run = trfRun();
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
      // the demo clock runs on from the previous unit's end (plus the real time spent on the next scan)
      const last = run.log[run.log.length - 1];
      const start = last ? Math.max(Date.now(), last.end + (Date.now() - run.doneAt)) : Date.now();
      Object.assign(run, { phase: 'running', start, base: 0, t0: Date.now(), hold: false, chk: null });
      navigator.vibrate?.(20);
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
    'scan-unit': () => scanUnit(bagOf(trfRun()).unit),
    'scan-unit-sim': () => openScanSim(unitSims(), scanUnit),
  },
  onBack: () => {
    leave('hub');
    return true;
  },
  onScan: (code) => (trfRun().phase === 'scan' ? scanUnit(code) : toast('수혈 중에는 다른 바코드를 스캔할 수 없습니다.')),
});

/** 뒤로가기 · ☰: only before the first unit starts; a running transfusion ends with 수혈 완료 or 긴급 종료. */
function leave(then) {
  const run = trfRun();
  if (run.phase === 'ready' && run.i === 0 && !run.log.length) return then === 'hub' ? pop() : confirmReset('menu');
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
    navigator.vibrate?.([40, 80, 40]);
    rerender();
    return toast('혈액팩이 비었습니다. 수혈 완료를 눌러 기록해 주세요.');
  }
  paint(el, run, e);
}

/** Moves the bag level, times and countdown without re-rendering the screen. */
function paint(el, run, e) {
  const bag = bagOf(run);
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
  navigator.vibrate?.([60, 80, 60]);
  rerender();
  openDialog(
    {
      title: '15분 중간 체크',
      tone: 'info',
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

/* ---------------- 단위 완료 · 다음 단위 · 긴급 종료 ---------------- */
function logBag(run, status, reason = null) {
  const bag = bagOf(run);
  const e = elapsed(run);
  run.log.push({
    unit: bag.unit,
    start: run.start,
    end: clockOf(run, e),
    ml: Math.round((bag.volume * e) / total(run)),
    status,
    reason,
    chk: run.chk && run.chk !== 'due' ? run.chk : null,
  });
}

/** The bag is empty: record the end time; next unit (scan) or the whole transfusion is done. */
function finishBag(run) {
  logBag(run, 'done');
  run.doneAt = Date.now();
  if (run.i + 1 < run.bags.length) {
    Object.assign(run, { i: run.i + 1, phase: 'scan', base: 0, hold: false, chk: null });
    rerender();
    return toast(`${run.i}단위 수혈을 완료했습니다. 다음 단위의 혈액번호를 스캔해 주세요.`);
  }
  run.phase = 'done';
  completeTask('trf', hhmm(run.log[run.log.length - 1].end));
  replace('trfdone', {}, 'fade');
}

function scanUnit(code) {
  const run = trfRun();
  if (run.phase !== 'scan') return;
  const c = String(code).trim().toUpperCase();
  if (!c || c === '#FAIL') return openMedDialog('fail');
  const j = run.bags.findIndex((b) => b.unit === c);
  if (j >= 0 && j < run.i) return toast('이미 수혈한 혈액입니다.');
  if (j < 0) {
    // another patient's blood is 불일치; any other label stands for the next unit (demo)
    const other = PATIENTS.some((p) => state.pt[p.id].work.trf.orders.some((o) => o.code === c || o.units.includes(c)));
    if (other || /9999$/.test(c)) return openMedDialog('mismatch');
  } else if (j > run.i) {
    [run.bags[run.i], run.bags[j]] = [run.bags[j], run.bags[run.i]]; // a later unit of the same order may come first
  }
  run.phase = 'ready';
  rerender();
  toast('혈액번호가 확인되었습니다. 수혈 시작을 눌러 주세요.');
}

function unitSims() {
  const run = trfRun();
  const other = PATIENTS.find((p) => p.id !== state.pid && state.pt[p.id].work.trf.orders.length);
  return [
    { label: `혈액번호 · ${bagOf(run).unit} (다음 단위)`, code: bagOf(run).unit },
    run.i > 0 && { label: `혈액번호 · ${run.bags[0].unit} (수혈 완료한 단위)`, code: run.bags[0].unit },
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
    `<div class="sheet-head"><p class="sheet-title">긴급 종료 사유</p><span class="chip on"><span>${run.phase === 'running' ? hhmm(at) : '수혈 전'}</span></span></div>
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
  if (run.phase === 'running' || run.phase === 'empty') logBag(run, 'stopped', reason);
  run.phase = 'stopped';
  run.reason = reason;
  run.stoppedAt = run.log.length ? run.log[run.log.length - 1].end : Date.now();
  completeTask('trf', hhmm(run.stoppedAt), '수혈중단');
  navigator.vibrate?.(30);
  replace('trfdone', {}, 'fade');
}

/* ---------------- 15분 중간 체크 ---------------- */
let form = null; // { unit, values, reactions }
function checkForm() {
  const run = trfRun();
  const unit = bagOf(run).unit;
  if (!form || form.unit !== unit) {
    form = { unit, values: Object.fromEntries(state.vitals.items.map((i) => [i.k, i.v])), reactions: [] };
  }
  return form;
}
const FLAG_LABEL = { danger: '경고', warn: '주의' };
const fmtV = (k, n) => (VITAL_STEP[k] < 1 ? n.toFixed(1) : String(Math.round(n)));

function checkCell(item, value) {
  const flag = flagOf(item.k, value);
  return `
    <div class="vt-cell" data-k="${item.k}">
      <div class="vt-top"><span class="vt-k">${item.k}</span><span class="vflag-tag ${flag || 'ok'}">${FLAG_LABEL[flag] || '정상'}</span></div>
      <div class="vt-mid">
        <button class="vstep" data-act="vstep" data-k="${item.k}" data-d="-1" aria-label="${item.k} 감소">−</button>
        <input class="vval ${flag || ''}" data-k="${item.k}" type="text" inputmode="decimal" value="${esc(value)}" style="width:${Math.max(2, String(value).length) * 11.6 + 4}px" aria-label="${item.k}" autocomplete="off">
        <button class="vstep" data-act="vstep" data-k="${item.k}" data-d="1" aria-label="${item.k} 증가">+</button>
        <span class="vunit">${item.unit}</span>
      </div>
    </div>`;
}

register('trfcheck', {
  bg: 'screen',
  render: () => {
    const run = trfRun();
    const f = checkForm();
    const any = f.reactions.length > 0;
    return `
      ${header({ title: patientTitle(), right: 'close' })}
      <div class="screen-body scroll trf-check">
        <div class="ham-hero">
          <img src="${asset3d('vital')}" alt="">
          <h2 class="status-title gtext">15분 중간 체크</h2>
          <p class="status-desc">수혈 시작 15분이 지났습니다.\n활력징후와 이상반응을 확인해 주세요.</p>
        </div>
        <section class="vcard">
          <div class="vcard-head"><span class="l"><span class="vcard-title">활력징후</span></span><span class="tr-unit">${bagOf(run).unit}</span></div>
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
      input.addEventListener('focus', () => input.select());
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
      const cur = parseFloat(f.values[k]);
      const next = (Number.isNaN(cur) ? 0 : cur) + Number(t.dataset.d) * VITAL_STEP[k];
      f.values[k] = fmtV(k, Math.max(0, k === 'SpO2' ? Math.min(100, next) : next));
      refresh(document.querySelector('.scr-trfcheck'), k);
    },
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
      saveVitals(f, at);
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
  input.style.width = `${Math.max(2, String(value).length) * 11.6 + 4}px`;
  const tag = cell.querySelector('.vflag-tag');
  tag.className = `vflag-tag ${flag || 'ok'}`;
  tag.textContent = FLAG_LABEL[flag] || '정상';
}

/** The check's vitals go to the 임상관찰기록 (환자상세). */
function saveVitals(f, at) {
  state.vitals = {
    time: at,
    who: NURSE.label,
    items: state.vitals.items.map((i) => ({ ...i, v: f.values[i.k], at: `${DEMO_DATE.slice(5).replace('-', '/')} ${at}`, flag: flagOf(i.k, f.values[i.k]) })),
  };
}

/* ---------------- 수혈 완료 · 중단 기록 ---------------- */
register('trfdone', {
  bg: 'screen',
  render: () => {
    const run = trfRun();
    const stopped = run.phase === 'stopped';
    const ml = run.log.reduce((n, l) => n + l.ml, 0);
    return `
      ${header({ title: patientTitle() })}
      <div class="screen-body scroll trf-done${stopped ? ' stopped' : ''}">
        <span class="spacer" style="flex-grow: 50"></span>
        ${statusBlock(
          stopped
            ? { img: 'warning-red', title: '수혈 중단', desc: '긴급 종료 사유와 종료 시각·투여량이\nEMR에 기록되었습니다.' }
            : { img: 'check-blue', title: '수혈 완료', desc: '단위별 수혈 시작·종료 시각과 투여량이\nEMR에 기록되었습니다.' },
        )}
        <section class="tr-card tr-log">
          <div class="tr-log-head"><p class="tr-card-title">수혈 기록</p>${badge(`${run.log.filter((l) => l.status === 'done').length}/${run.bags.length} 단위 완료`, 'count-grad')}</div>
          ${run.log.length ? logRows(run) : '<p class="tr-log-sub">수혈한 단위가 없습니다.</p>'}
          <div class="tr-log-total"><span>총 투여량</span><b>${ml} ml</b></div>
          ${stopped ? `<div class="tr-log-total stop"><span>긴급 종료</span><b>${hhmm(run.stoppedAt)} · ${esc(run.reason)}</b></div>` : ''}
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
