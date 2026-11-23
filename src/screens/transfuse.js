// 수혈 시작 · 15분 체크 (not in the Figma file; built from the existing cards, badges, vital cells and popups).
// 2026-11-23 요청: 수혈 진행 화면 (혈액팩 애니메이션 · 예상 종료 · 경과 · 긴급 종료) 삭제, 종료 시각은 기록하지 않음.
// 환자 팔찌 → 수혈하기 목록 (혈액팩마다 카드: 혈액번호 + 혈액제제 스캔) → 수행하기 → 1차·2차 인증 (항목마다 한 번) →
// 수혈 시작 기록 (시작 시각) → '수혈 시작' 완료 화면 → 확인 → 환자허브 또는 바코드 스캔 화면 (업무를 시작한 곳).
// 15분 뒤 알람 (어느 화면이든 팝업; 시연은 15초 뒤, 시각은 실제 15분 기준으로 표시) → 체크하기 → 활력징후 + 이상반응 →
// 이상 없음 = 기록 후 원래 화면 / 이상반응 = 수혈 중단 기록. '나중에'는 긴급 처리 업무 카드와 혈액팩 카드에 남습니다.
import { register, go, pop, replace, rerender, currentScreen } from '../router.js';
import { header, button, badge, esc, toast, closeSheet, openDialog, asset3d, statusBlock, patientLine, sheetOpen } from '../ui.js';
import { icon } from '../icons.js';
import { NURSE, DEMO_DATE, bloodType } from '../data.js';
import { patientById } from '../patients.js';
import { state, completeTask, trfUnits, trfNext, trfLeft, trfDue, recordVitals, selectPatient } from '../state.js';
import { flagOf } from './vitals.js';
import { toWorkScan, prevLine, prevValues, prevVital, stepValue, flagTag } from './work.js';
import { refreshHub } from './hub.js';
import { voiceButton, openVoiceInput, flashVoiced } from '../vvoice.js';
import { feedback } from '../feedback.js';

const MIN = 60000;
const CHECK_MIN = 15; // 수혈 시작 15분 뒤 중간 체크
const ALARM_MS = 15000; // 시연: 15초 뒤 알람 (화면의 시각은 15분 기준)
export const REACTIONS = ['발열 (1℃ 이상 상승)', '오한', '두드러기 · 가려움', '호흡곤란', '흉통 · 요통', '저혈압 · 빈맥'];

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const isShot = () => document.documentElement.classList.contains('shot');

/* ---------------- 수혈 시작 기록 (state.work.trf.runs[혈액번호]) ---------------- */
const orderOf = (unit, w = state.work.trf) => w.orders.find((o) => o.units.includes(unit));
/** n / m 단위: the bag's place among every bag of the patient's 수혈 오더. */
export const seqOf = (unit) => `${trfUnits().findIndex((x) => x.unit === unit) + 1}/${trfUnits().length} 단위`;
/** The focused order's first bag (screenshots open the done / check screens directly). */
const demoUnit = () => (state.work.trf.orders.find((o) => o.focus) || state.work.trf.orders[0])?.units[0];

/** A started bag's record; screenshots get a demo start (17:30, 15분 체크 17:45). */
function runOf(unit) {
  const w = state.work.trf;
  if (!w.runs[unit] && isShot() && orderOf(unit)) {
    const start = new Date(2026, 8, 17, 17, 30).getTime();
    w.runs[unit] = { start, at: hhmm(start), chkAt: hhmm(start + CHECK_MIN * MIN), due: start, fired: true, chk: null, stop: null };
    w.bags[unit] = 'start';
  }
  return w.runs[unit];
}

/**
 * 수행하기 (이중 인증이 끝난 항목) · 고위험수행 이중 확인 완료 → 확인: the next confirmed bag starts now. Only the start
 * time is recorded; its 15분 체크 alarm is set. `push`: from the list (go), else from the double check (replace).
 */
export function startBag(push = false) {
  const next = trfNext();
  if (!next) return toast('혈액백의 혈액번호와 혈액제제 바코드를 먼저 스캔해 주세요.');
  const { unit } = next;
  const w = state.work.trf;
  const now = Date.now();
  w.bags[unit] = 'start';
  w.runs[unit] = { start: now, at: hhmm(now), chkAt: hhmm(now + CHECK_MIN * MIN), due: now + ALARM_MS, fired: false, chk: null, stop: null };
  w.ham = null;
  w.pend = null;
  // every bag started (or stopped): the 수혈 task is done today (긴급 처리 업무 카드 해소)
  if (!trfLeft().length) completeTask('trf', hhmm(now), '수혈시작');
  (push ? go : replace)('trfdone', { result: 'start', unit });
}

/* ---------------- 혈액팩 카드 (완료 · 15분 체크 화면) ---------------- */
function bagHead(unit, times) {
  const o = orderOf(unit);
  return `
    <section class="tr-card tr-head">
      <div class="tr-name"><span>${esc(o.name)}</span><img class="warn" src="${asset3d('warning-red')}" alt="고위험">${badge(seqOf(unit), 'count-grad')}</div>
      <p class="tr-sub">혈액번호 <b>${unit}</b><i></i><b class="abo">혈액형 : ${esc(bloodType(o))}</b><i></i>${o.volume}ml</p>
      <div class="tr-times">${times.map(([k, v, cls = '']) => `<div class="tr-time${cls ? ` ${cls}` : ''}"><span class="k">${k}</span><b>${v}</b></div>`).join('')}</div>
    </section>`;
}

/* ---------------- 15분 체크 알람 ---------------- */
// checked every second on any screen; waits while a popup or sheet is open, during login and on the check itself
const QUIET = ['splash', 'login-id', 'login-bio', 'trfcheck'];
setInterval(() => {
  if (isShot() || sheetOpen()) return;
  const cur = currentScreen()?.name;
  if (!cur || QUIET.includes(cur)) return;
  const due = trfDue().find((d) => !d.run.fired);
  if (!due) return;
  due.run.fired = true;
  // the 긴급 처리 업무 page and the patient's 수혈 목록 show the check at once
  if (cur === 'hub') refreshHub();
  if (cur === 'wtask' && state.pid === due.pid && currentScreen().params.kind === 'trf') rerender();
  alarm(due);
}, 1000);

function alarm({ pid, unit, run, o }) {
  const p = patientById(pid);
  feedback('alarm'); // 15분 체크 알람: 주간 알람음 · 야간 진동
  openDialog(
    {
      title: '수혈 15분 체크',
      tone: 'info',
      fb: false,
      cls: 'trf-alarm',
      desc: '수혈 시작 15분이 지났습니다.\n활력징후와 이상반응을 확인해 주세요.',
      body: `<div class="tra-box">
          <p class="tra-pt"><b>${esc(p.name)}</b><span>${p.id}</span><span>${esc(p.bed)}</span></p>
          <p class="tra-bag">${esc(o.name)}</p>
          <p class="tra-sub">혈액번호 ${unit}<i></i>시작 ${run.at}<i></i>체크 ${run.chkAt}</p>
        </div>`,
      buttons: [
        { label: '나중에', act: 'later', line: true },
        { label: '체크하기', act: 'ok' },
      ],
    },
    {
      later: () => {
        closeSheet();
        toast('환자허브 긴급 처리 업무에서 15분 체크를 할 수 있습니다.');
      },
      ok: () => {
        closeSheet();
        openCheck(pid, unit);
      },
    },
  );
}

/* ---------------- 15분 중간 체크 ---------------- */
// the check belongs to the alarm's patient: the screen before it comes back afterwards (with its own patient)
let from = null;
let form = null; // { unit, values, reactions }

/** 알람 '체크하기' · 긴급 처리 업무 카드 · 혈액팩 카드 '체크하기'. */
export function openCheck(pid, unit) {
  from = { pid: state.pid };
  if (pid !== state.pid) selectPatient(pid);
  form = null;
  go('trfcheck', { unit });
}

function closeCheck() {
  form = null;
  if (from && from.pid !== state.pid) selectPatient(from.pid);
  from = null;
  if (!pop()) replace('hub', {}, 'fade');
}

function checkForm(unit) {
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
  render: ({ unit = demoUnit() }) => {
    const run = runOf(unit);
    const f = checkForm(unit);
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
        ${bagHead(unit, [['수혈 시작', run.at], ['15분 체크', run.chkAt, 'due']])}
        <section class="vcard">
          <div class="vcard-head"><span class="l"><span class="vcard-title">활력징후</span>${voiceButton()}</span></div>
          <div class="vgrid2">${state.vitals.items.map((i) => checkCell(i, f.values[i.k])).join('')}</div>
          <div class="vcard-foot"><span>${run.chkAt} 측정</span><span>${NURSE.label} (${NURSE.no})</span></div>
        </section>
        <section class="tr-card">
          <p class="tr-card-title">이상반응 확인 <small>해당하는 증상을 모두 선택하세요</small></p>
          <div class="ham-checks">${REACTIONS.map(
            (r, i) => `<button class="ham-check${f.reactions.includes(i) ? ' on' : ''}" data-act="react" data-i="${i}"><span class="cb">${icon.check}</span><span>${esc(r)}</span></button>`,
          ).join('')}</div>
        </section>
      </div>
      <div class="screen-foot">${
        any ? `<button class="btn danger" data-act="check-stop">이상반응 · 수혈 중단</button>` : button('이상 없음 · 수혈 계속', 'check-ok', { cta: true })
      }</div>`;
  },
  mount(el, { unit = demoUnit() }) {
    el.querySelectorAll('.vval').forEach((input) => {
      // 입력 칸을 누르면 직전 값이 채워지고 선택됨
      input.addEventListener('focus', () => {
        const k = input.dataset.k;
        if (!input.value && prevVital(k)) {
          checkForm(unit).values[k] = prevVital(k).v;
          refresh(el, unit, k);
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
        checkForm(unit).values[input.dataset.k] = input.value;
        refresh(el, unit, input.dataset.k);
      });
      input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    });
  },
  actions: {
    // 닫기: the check stays to do (긴급 처리 업무 · 혈액팩 카드)
    'hdr-close': () => closeCheck(),
    vstep: (t, { unit = demoUnit() }) => {
      const f = checkForm(unit);
      const k = t.dataset.k;
      f.values[k] = stepValue(k, f.values[k], Number(t.dataset.d));
      refresh(document.querySelector('.scr-trfcheck'), unit, k);
    },
    vvoice: (t, { unit = demoUnit() }) =>
      openVoiceInput({
        prev: prevValues(),
        onApply: (vals) => {
          Object.assign(checkForm(unit).values, vals);
          rerender();
          flashVoiced('.scr-trfcheck .vt-cell', Object.keys(vals));
        },
      }),
    react: (t, { unit = demoUnit() }) => {
      const f = checkForm(unit);
      const i = +t.dataset.i;
      f.reactions = f.reactions.includes(i) ? f.reactions.filter((x) => x !== i) : [...f.reactions, i].sort();
      rerender();
    },
    'check-ok': (t, { unit = demoUnit() }) => {
      const f = checkForm(unit);
      const empty = state.vitals.items.filter((i) => !String(f.values[i.k]).trim());
      if (empty.length) return toast(`${empty.map((i) => i.k).join(', ')} 값을 입력해 주세요.`);
      const run = runOf(unit);
      saveVitals(f, run.chkAt);
      run.chk = { at: run.chkAt, ok: true };
      closeCheck();
      toast('15분 중간 체크를 기록했습니다. 이상 없음 · 수혈을 계속합니다.');
    },
    'check-stop': (t, { unit = demoUnit() }) => {
      const f = checkForm(unit);
      const run = runOf(unit);
      // stopping comes first: the vitals are recorded only when all of them were entered
      if (state.vitals.items.every((i) => String(f.values[i.k]).trim())) saveVitals(f, run.chkAt);
      confirmStop(unit, f.reactions.map((i) => REACTIONS[i].replace(/ \(.*\)/, '')).join(', '));
    },
  },
  onBack: () => {
    closeCheck();
    return true;
  },
});

function refresh(el, unit, k) {
  const cell = el?.querySelector(`.vt-cell[data-k="${k}"]`);
  if (!cell) return;
  const value = checkForm(unit).values[k];
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

/** 이상반응 → 수혈 중단: 중단 시각 (15분 체크 시각) · 사유 기록. */
function confirmStop(unit, reasons) {
  openDialog(
    {
      title: '수혈 중단',
      desc: `이상반응(${reasons})으로\n수혈을 즉시 중단합니다.`,
      buttons: [
        { label: '취소', act: 'cancel', line: true },
        { label: '수혈 중단', act: 'ok' },
      ],
      cls: 'danger',
    },
    { cancel: () => closeSheet(), ok: () => (closeSheet(), stopBag(unit, reasons)) },
  );
}

function stopBag(unit, reason) {
  const w = state.work.trf;
  const run = runOf(unit);
  run.chk = { at: run.chkAt, ok: false };
  run.stop = { at: run.chkAt, reason };
  w.bags[unit] = 'stop';
  form = null;
  if (!trfLeft().length) completeTask('trf', run.chkAt, '수혈중단');
  feedback('error');
  replace('trfdone', { result: 'stop', unit }, 'fade');
}

/* ---------------- 수혈 시작 완료 · 수혈 중단 기록 ---------------- */
register('trfdone', {
  bg: 'screen',
  render: ({ result = 'start', unit = demoUnit() }) => {
    const run = runOf(unit);
    const stopped = result === 'stop';
    const left = trfLeft().length;
    return `
      ${header({ title: '수혈하기' })}
      <div class="screen-body scroll trf-done${stopped ? ' stopped' : ''}">
        ${patientLine()}
        <span class="spacer" style="flex-grow: 50"></span>
        ${statusBlock(
          stopped
            ? { img: 'warning-red', title: '수혈 중단', desc: '이상반응과 중단 시각이\nEMR에 기록되었습니다.' }
            : { img: 'check-blue', title: '수혈 시작', desc: '수혈 시작 시각이 EMR에 기록되었습니다.\n15분 뒤 중간 체크 알람이 울립니다.' },
        )}
        ${bagHead(
          unit,
          stopped
            ? [['수혈 시작', run.at], ['수혈 중단', run.stop?.at || run.chkAt, 'stop']]
            : [['수혈 시작', run.at], ['15분 체크', run.chkAt, 'due']],
        )}
        ${stopped ? `<p class="tr-note stop">${icon.error}<span>사유 : ${esc(run.stop?.reason || '')}</span></p>` : ''}
        ${!stopped && left ? `<p class="tr-note">${icon.error}<span>남은 혈액팩 ${left}개 · 다음 혈액팩은 수혈하기 목록에서 스캔합니다.</span></p>` : ''}
        <p class="tr-log-who">${NURSE.label} (${NURSE.no})</p>
        <span class="spacer" style="flex-grow: 70"></span>
      </div>
      <div class="screen-foot">${button('확인', 'ok')}</div>`;
  },
  actions: {
    // 수혈 시작 → 업무를 시작한 곳 (환자허브 · 바코드 스캔) · 수혈 중단 → 15분 체크 전 화면
    ok: (t, { result = 'start' }) => (result === 'stop' ? closeCheck() : toWorkScan('trf')),
  },
  onBack: ({ result = 'start' }) => {
    if (result === 'stop') closeCheck();
    else toWorkScan('trf');
    return true;
  },
});
