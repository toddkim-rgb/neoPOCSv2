// 채혈하기 (neo-bld) · 수혈하기 (neo-trf) · 활력징후 (neo-vital) — SSol design, phase 2.
// 채혈하기 runs in a fixed order: 환자 바코드 → 채혈관 바코드 (one per 채혈 오더; with 2+ orders the button asks for
// '다른 채혈관 바코드 스캔') → 채혈 확인 → 채혈 완료 → 종료 (환자허브).
// 수혈하기: common-scan-01 → 환자 팔찌 → 수혈하기 목록 at once (no 처방 스캔 step; the patient's 수혈 오더 are known)
// → 수행하기 → 수혈하기 1차 인증 → 2차 인증 → 이중 확인 완료 → 수혈 진행 (transfuse.js: 시작 · 15분 체크 · 완료/긴급 종료). A blood bag scanned
// before the wristband still shows the list with the '환자 스캔' warning. 활력징후 needs only the patient scan; its task edits SBP·DBP·PR·RR·BT·SpO2 and saves them
// to the 임상관찰기록.
// Every flow works for the six sample patients: a wristband selects that patient, 채혈관/혈액 barcodes belong to one
// patient (another patient's label is 불일치), and a patient without that order gets '수행할 오더 없음'.
import { register, go, replace, backTo, rerender } from '../router.js';
import { header, button, aiButton, statusBlock, patientCard, badge, esc, toast, openSheet, closeSheet, openDialog, asset3d } from '../ui.js';
import { icon } from '../icons.js';
import { patientTitle, PATIENT, NURSE, TIME_SLOTS, TRF_STATUS, DEMO_DATE, VITAL_STEP } from '../data.js';
import { PATIENTS, DEFAULT_PID, patientByCode } from '../patients.js';
import { state, resetWork, selectPatient, completeTask, taskStatus } from '../state.js';
import { openMedDialog, confirmReset, startCheck, openNoOrders, openScanSim, patientSims, FAIL_SIM } from './med.js';
import { flagOf } from './vitals.js';

export const KINDS = {
  bld: { title: '채혈하기', list: '채혈하기', action: '채혈수행' },
  trf: { title: '수혈하기', list: '수혈하기', action: '수행하기' },
  vital: { title: '활력징후', green: true, patientOnly: true },
};
const themeBg = (kind) => (KINDS[kind]?.green ? 'green' : 'screen');

/* ---------------- scan handling ---------------- */
/** Which patient a 채혈관 (code · 검체번호) or 혈액 제제 (code · 혈액번호) barcode belongs to. */
const workOwner = (kind, c) =>
  PATIENTS.find((p) => state.pt[p.id].work[kind].orders.some((o) => o.code === c || o.specimen === c || o.units?.includes(c)))?.id;

/** Applies a scan to 채혈 · 수혈 · 활력징후. */
export function handleWorkScan(kind, code) {
  const c = String(code).trim().toUpperCase();
  if (!c || c === '#FAIL') return openMedDialog('fail');
  const p = patientByCode(c);
  if (kind === 'bld') return handleBloodScan(c, p);
  if (/9999$/.test(c)) return openMedDialog('mismatch');
  if (KINDS[kind].patientOnly) {
    // any badge on the wristband identifies the patient (an unknown label stands for the selected one)
    selectPatient(p?.id || state.pid);
    state.work.vital.values = null;
    return replace('vital', {}, 'fade');
  }
  if (p) return workPatient(kind, p.id);
  const owner = workOwner(kind, c);
  if (owner) return workOrder(kind, owner);
  // any other label fills the next missing step so the demo always moves forward
  return /^T\d+/.test(c) || state.work[kind].scan.patient ? workOrder(kind, state.pid) : workPatient(kind, state.pid);
}

function workPatient(kind, id) {
  // 처방 우선 스캔: the wristband must be the prescription's patient
  const w = state.work[kind];
  if (w.scan.drug && !w.scan.patient && id !== state.pid) return openMedDialog('mismatch');
  selectPatient(id); // 다른 환자 스캔 → (안내 없이) 덮어쓰기
  if (!taskStatus(kind).ok) return openNoOrders(kind);
  state.work[kind].scan.patient = true;
  showWork(kind);
}

function workOrder(kind, owner) {
  if (state.work[kind].scan.patient && owner !== state.pid) return openMedDialog('mismatch');
  selectPatient(owner); // the prescription names its patient
  if (!taskStatus(kind).ok) return openNoOrders(kind);
  const w = state.work[kind];
  // the list is already open after the wristband: a matching blood bag just confirms it
  if (w.scan.patient) {
    toast(w.scan.drug ? '이미 확인된 혈액 제제입니다.' : '혈액 제제 바코드가 확인되었습니다.');
    w.scan.drug = true;
    return;
  }
  w.scan.drug = true;
  showWork(kind);
}

function showWork(kind) {
  if (document.querySelector('.scr-wtask')) rerender();
  else replace('wtask', { kind }, 'fade');
}

/* ---------------- 채혈하기: 환자 → 채혈관 (×오더 수) → 채혈 확인 ---------------- */
const bloodDone = () => state.work.bld.tubes.length;
const bloodLeft = () => state.work.bld.orders.filter((o) => !state.work.bld.tubes.includes(o.id));

function handleBloodScan(c, p) {
  if (p) {
    if (state.work.bld.scan.patient && p.id === state.pid) return toast('환자 바코드가 이미 확인되었습니다.');
    selectPatient(p.id); // 다른 환자 → (안내 없이) 덮어쓰기, 확인한 채혈관도 초기화
    if (!taskStatus('bld').ok) return openNoOrders('bld');
    state.work.bld.scan.patient = true;
    state.work.bld.tubes = [];
    return document.querySelector('.scr-wtask') ? rerender() : replace('wtask', { kind: 'bld' }, 'fade');
  }
  const w = state.work.bld;
  if (!w.scan.patient) {
    return openDialog(
      { title: '환자 스캔 필요', desc: '채혈관보다 환자 바코드를 먼저 스캔해 주세요.\n환자 확인 후 채혈관 바코드를 스캔합니다.' },
      { ok: () => closeSheet() },
    );
  }
  const owner = workOwner('bld', c);
  if (/9999$/.test(c) || (owner && owner !== state.pid)) {
    return openDialog(
      { title: '환자/채혈관 불일치', desc: '환자와 채혈관이 일치하지 않습니다.\n환자 및 채혈관 바코드를 다시 확인해 주세요.' },
      { ok: () => closeSheet() },
    );
  }
  // a known 채혈관 (or its 검체번호); any other label stands for the next tube in the demo
  const o = w.orders.find((x) => x.code === c || x.specimen === c) || bloodLeft()[0];
  if (!o || w.tubes.includes(o.id)) return toast('이미 확인된 채혈관입니다.');
  w.tubes.push(o.id);
  rerender();
  const left = bloodLeft().length;
  toast(left ? `${o.name} 채혈관이 확인되었습니다. 다른 채혈관을 스캔해 주세요.` : '모든 채혈관이 확인되었습니다.');
}

function bloodCard(o) {
  const ok = state.work.bld.tubes.includes(o.id);
  return `
    <div class="wcard tube${ok ? ' ok' : ''}">
      <p class="wcard-name">${esc(o.name)}<span class="tube-st">${ok ? `${icon.check}확인` : '스캔 대기'}</span></p>
      <p class="wcard-line">검체번호 : ${o.specimen}<i></i>검체상세 : ${esc(o.detail)}</p>
      <p class="wcard-sub">발행처 : ${o.issuer}<i></i>발행시간 : ${o.issued}</p>
      <div class="trow now"><span class="l"><span class="alarm-pill">${icon.alarmFill}<span>${o.now.time} </span></span></span><span class="who">${esc(o.now.who)}</span></div>
    </div>`;
}

function bloodTask() {
  const w = state.work.bld;
  const n = w.orders.length;
  const done = bloodDone();
  const hint =
    done === 0 ? '채혈관 바코드를 스캔해 주세요.' : done < n ? '다른 채혈관 바코드를 스캔해 주세요.' : '모든 채혈관이 확인되었습니다. 채혈 확인을 눌러 주세요.';
  const btn =
    done === 0
      ? button('채혈관 바코드 스캔', 'scan-tube', { long: 'scan-sim-tube' })
      : done < n
        ? button('다른 채혈관 바코드 스캔', 'scan-tube', { long: 'scan-sim-tube' })
        : button('채혈 확인', 'blood-confirm', { cta: true });
  return `${header({ title: patientTitle(), left: 'back', right: 'menu' })}
    <div class="screen-body scroll task-w">
      <div class="task-top">${aiButton()}${patientCard({ prn: state.orders.some((o) => o.prn) })}</div>
      <div class="medlist wlist">
        <div class="medlist-head">
          <span class="l"><span class="medlist-title gtext">채혈하기</span>${modeChips(w.planMode)}</span>
          ${badge(`채혈관 ${done}/${n}`, 'count-grad')}
        </div>
        <p class="tube-hint${done === n ? ' all' : ''}">${done === n ? icon.checkCircle : icon.error}<span>${hint}</span></p>
        <div class="wcards">${w.orders.map(bloodCard).join('')}</div>
      </div>
      <div class="sticky-foot">${btn}</div>
    </div>`;
}

/* ---------------- scan simulation (long-press) ---------------- */
const tubeSims = (id = state.pid) => state.pt[id].work.bld.orders.map((o) => ({ label: `채혈관 · ${o.name}`, code: o.code }));
function productSim(id = state.pid) {
  const os = state.pt[id].work.trf.orders;
  const o = os.find((x) => x.focus) || os[0];
  return o && { label: `혈액 제제 · ${o.name}`, code: o.code };
}
const otherPatient = (has) => PATIENTS.find((p) => p.id !== state.pid && has(state.pt[p.id]));

/** Barcodes the PDA could read at this step: wristbands of every sample patient, this patient's labels, another patient's label. */
function simItems(kind, step) {
  if (KINDS[kind].patientOnly) return [...patientSims(), FAIL_SIM];
  if (kind === 'bld') {
    if (step !== 'tube') return [...patientSims(), tubeSims()[0], FAIL_SIM].filter(Boolean);
    const other = otherPatient((s) => s.work.bld.orders.length);
    return [...tubeSims(), other && { label: `다른 환자의 채혈관 · ${other.name}`, code: tubeSims(other.id)[0].code }, FAIL_SIM].filter(Boolean);
  }
  return [...patientSims(), productSim(), FAIL_SIM].filter(Boolean);
}
const openSim = (kind, step) => openScanSim(simItems(kind, step), (code) => handleWorkScan(kind, code));

/* ---------------- common-scan-01 ---------------- */
register('wscan', {
  bg: ({ kind }) => themeBg(kind),
  render: ({ kind }) => `
    ${header({ title: KINDS[kind].title, left: 'back', right: 'menu' })}
    <div class="screen-body center-status">
      <span class="spacer" style="flex-grow: 206"></span>
      ${statusBlock({
        img: KINDS[kind].green ? 'scan-green' : 'scan',
        title: '바코드 스캔',
        // 채혈하기 always starts with the patient's wristband
        desc: kind === 'bld' ? '채혈할 환자의 팔찌 바코드를\nPDA 레이저로 스캔하세요.' : '환자 또는 처방 정보의 RFID 바코드를\nPDA 레이저로 스캔하세요.',
      })}
      <span class="spacer" style="flex-grow: 261"></span>
    </div>
    <div class="screen-foot">${button('스캔하기', 'scan', { long: 'scan-sim' })}</div>`,
  actions: {
    'hdr-back': () => confirmReset('hub'),
    'hdr-menu': () => confirmReset('menu'),
    // the selected patient's wristband (긴급 처리 업무 · MY환자 에서 고른 환자, 메뉴에서 시작하면 김철수)
    scan: (t, { kind }) => handleWorkScan(kind, PATIENT.barcode),
    'scan-sim': (t, { kind }) => openSim(kind),
  },
  onBack: () => {
    confirmReset('hub');
    return true;
  },
  onScan: (code, { kind }) => handleWorkScan(kind, code),
});

/** Opens a work flow from the hub / menu / AI 커맨드바; `pid` = the patient it was opened for (scan button reads them). */
export function startWork(kind, pid = DEFAULT_PID) {
  selectPatient(pid);
  resetWork();
  go('wscan', { kind });
}

/* ---------------- 채혈하기 · 수혈하기 task ---------------- */
const modeChips = (mode) => `
  <span class="chips">
    <button class="chip${mode === 'plan' ? ' on' : ''}" data-act="mode" data-mode="plan"><span>플랜</span></button>
    <button class="chip${mode === 'plan' ? '' : ' on'}" data-act="mode" data-mode="live"><span>실시간</span></button>
  </span>`;

const workTag = (st, act, id) =>
  `<span class="tag${st === 'Y' ? '' : ' no'}"${act ? ` data-act="${act}" data-id="${id}" role="button"` : ''}>${icon.tagFill}<span>${esc(st)}</span></span>`;

function workCard(kind, o, interactive) {
  const now = `
    <div class="trow now"><span class="l"><span class="alarm-pill">${icon.alarmFill}<span>${o.now.time} </span></span>${
      kind === 'trf' ? workTag(o.now.st, interactive ? 'status-sheet' : '', o.id) : ''
    }</span><span class="who">${esc(o.now.who)}</span></div>`;
  if (kind === 'bld') {
    return `
      <div class="wcard">
        <p class="wcard-name">${esc(o.name)}</p>
        <p class="wcard-line">검체번호 : ${o.specimen}<i></i>검체상세 : ${esc(o.detail)}</p>
        <p class="wcard-sub">발행처 : ${o.issuer}<i></i>발행시간 : ${o.issued}</p>
        ${now}
      </div>`;
  }
  return `
    <div class="wcard">
      <p class="wcard-name">${esc(o.name)}<img class="warn" src="${asset3d('warning-red')}" alt="고위험"></p>
      <p class="wcard-line">혈액번호 : ${o.units.join(', ')}</p>
      <p class="wcard-sub"><b class="abo">혈액형 : ${o.abo}</b>발행처 : ${o.issuer}<i></i>발행시간 : ${o.issued}</p>
      ${now}
    </div>`;
}

function workList(kind, interactive) {
  const w = state.work[kind];
  return `
    <div class="medlist wlist">
      <div class="medlist-head">
        <span class="l"><span class="medlist-title gtext">${KINDS[kind].list}</span>${modeChips(w.planMode)}</span>
        ${badge(`총 ${w.orders.length}건`, 'count-grad')}
      </div>
      <div class="wcards">${w.orders.map((o) => workCard(kind, o, interactive)).join('')}</div>
    </div>`;
}

/** The action button follows the list (design) and sticks to the bottom once the list is taller than the screen. */
const stickyButton = (label, act, { cta = false } = {}) => `<div class="sticky-foot">${button(label, act, { cta })}</div>`;

register('wtask', {
  bg: 'screen',
  render: ({ kind }) => {
    if (kind === 'bld') return bloodTask();
    const w = state.work[kind];
    const { patient, drug } = w.scan;
    const hdr = header({ title: patientTitle(), left: 'back', right: 'menu' });
    const prn = state.orders.some((o) => o.prn);
    // blood bag first: the wristband is still missing
    if (drug && !patient) {
      return `${hdr}
        <div class="screen-body scroll task-w">
          <div class="task-top">${aiButton()}${patientCard({ prn, scanWarn: true })}</div>
          ${workList(kind, false)}
          ${stickyButton('환자정보 스캔하기', 'scan-patient')}
        </div>`;
    }
    // wristband scanned: the patient's 수혈 오더 straight away; 수행하기 runs the 이중 인증 first
    return `${hdr}
      <div class="screen-body scroll task-w">
        <div class="task-top">${aiButton()}${patientCard({ prn })}</div>
        ${workList(kind, true)}
        ${stickyButton(KINDS[kind].action, 'perform', { cta: true })}
      </div>`;
  },
  actions: {
    'hdr-back': () => confirmReset('hub'),
    'hdr-menu': () => confirmReset('menu'),
    voice: (t, { kind }) => {
      if (!state.work[kind].scan.patient) return toast('환자 스캔 후 음성간호메모를 진행할 수 있습니다.');
      state.voice.origin = kind; // bld | trf
      go('voice', { step: 'record' });
    },
    'patient-detail': () => go('detail'),
    'prn-info': () => openMedDialog('prn'),
    'scan-patient': (t, { kind }) => handleWorkScan(kind, PATIENT.barcode),
    mode: (t, { kind }) => {
      state.work[kind].planMode = t.dataset.mode;
      rerender();
    },
    'status-sheet': (t, { kind }) => openTrfStatus(t.dataset.id, kind),
    // 채혈관: the PDA scan button reads the next tube; long-press picks a specific label
    'scan-tube': () => handleBloodScan((bloodLeft()[0] || state.work.bld.orders[0]).code, null),
    'scan-sim-tube': () => openSim('bld', 'tube'),
    'blood-confirm': () => {
      if (bloodLeft().length) return toast('모든 채혈관 바코드를 먼저 스캔해 주세요.');
      completeTask('bld', state.work.bld.orders[0].now.time);
      go('wdone', { kind: 'bld' });
    },
    perform: (t, { kind }) => {
      // 수혈은 고위험수행: 수행하기 → 1차 인증 → 2차 인증 → 이중 확인 완료 → 수혈 진행 화면 (transfuse.js)
      if (kind === 'trf') return state.work.trf.ham?.done ? go('trfrun') : startCheck('trf');
      completeTask(kind, state.work[kind].orders[0].now.time);
      go('wdone', { kind });
    },
  },
  onBack: () => {
    confirmReset('hub');
    return true;
  },
  onScan: (code, { kind }) => handleWorkScan(kind, code),
});

/** neo-trf-flag-01: 수행 변경 (Y-수혈 시작 / E-종료). */
function openTrfStatus(id, kind = 'trf') {
  const o = state.work.trf.orders.find((x) => x.id === id);
  if (!o) return;
  const mode = state.work[kind].planMode === 'plan' ? '플랜' : '실시간';
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">수행 변경</p><span class="chip on"><span>${mode}</span></span></div>
     <div class="sheet-sub"><span class="sheet-drug">${esc(o.name)}</span></div>
     <div class="sheet-list">${TRF_STATUS.map(
       (s) => `<button class="opt${s.code === o.now.st ? ` sel${s.code === 'Y' ? '' : ' red'}` : ''}" data-sheet-act="pick" data-v="${s.code}"><span class="ico">${icon.tagOutline}</span><span class="lbl">${s.label}</span><span class="chev">${icon.chevronRight}</span></button>`,
     ).join('')}</div>`,
    {
      pick: (t) => {
        o.now.st = t.dataset.v;
        t.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.remove('sel', 'red'));
        t.classList.add('sel');
        if (t.dataset.v !== 'Y') t.classList.add('red');
        setTimeout(() => (closeSheet(), rerender()), 220);
      },
    },
  );
}

/* ---------------- 활력징후 (neo-vital-task-01, neo-vital-time-01) ---------------- */
const vitalValues = () => {
  const v = state.work.vital;
  if (!v.values) v.values = Object.fromEntries(state.vitals.items.map((i) => [i.k, i.v]));
  return v.values;
};
const FLAG_LABEL = { danger: '경고', warn: '주의' };
const fmt = (k, n) => (VITAL_STEP[k] < 1 ? n.toFixed(1) : String(Math.round(n)));
/** Input width that hugs the number, like the design's centred values (Pretendard 20px digits ≈ 11.6px). */
const valueWidth = (v) => {
  const t = String(v);
  return Math.round(Math.max(2, t.replace(/\./g, '').length) * 11.6 + (t.match(/\./g) || []).length * 5 + 2);
};
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function vitalCell(item, value) {
  const flag = flagOf(item.k, value);
  return `
    <div class="vt-cell" data-k="${item.k}">
      <div class="vt-top"><span class="vt-k">${item.k}</span><span class="vflag-tag ${flag || 'ok'}">${FLAG_LABEL[flag] || '정상'}</span></div>
      <div class="vt-mid">
        <button class="vstep" data-act="vstep" data-k="${item.k}" data-d="-1" aria-label="${item.k} 감소">−</button>
        <input class="vval ${flag || ''}" data-k="${item.k}" type="text" inputmode="decimal" value="${esc(value)}" style="width:${valueWidth(value)}px" aria-label="${item.k}" autocomplete="off">
        <button class="vstep" data-act="vstep" data-k="${item.k}" data-d="1" aria-label="${item.k} 증가">+</button>
        <span class="vunit">${item.unit}</span>
      </div>
    </div>`;
}

/** Updates one cell's colour and 정상/주의/경고 tag in place (keeps the keyboard open). */
function refreshCell(k) {
  const cell = document.querySelector(`.vt-cell[data-k="${k}"]`);
  if (!cell) return;
  const value = vitalValues()[k];
  const flag = flagOf(k, value);
  const input = cell.querySelector('.vval');
  if (input.value !== value) input.value = value;
  input.className = `vval ${flag || ''}`;
  input.style.width = `${valueWidth(value)}px`;
  const tag = cell.querySelector('.vflag-tag');
  tag.className = `vflag-tag ${flag || 'ok'}`;
  tag.textContent = FLAG_LABEL[flag] || '정상';
}

function openVitalTime() {
  const v = state.work.vital;
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">측정 시간 변경</p><span class="chip on"><span>플랜</span></span></div>
     <div class="sheet-list vtime-list">${TIME_SLOTS.map(
       (t) => `<button class="opt${v.planMode === 'plan' && t === v.time ? ' sel' : ''}" data-sheet-act="pick" data-v="${t}"><span class="ico">${icon.alarmOutline}</span><span class="lbl">${t}</span><span class="chev">${icon.chevronRight}</span></button>`,
     ).join('')}</div>`,
    {
      pick: (t) => {
        v.planMode = 'plan';
        v.time = t.dataset.v;
        t.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.remove('sel'));
        t.classList.add('sel');
        setTimeout(() => (closeSheet(), rerender()), 160);
      },
    },
  );
}

register('vital', {
  bg: 'green',
  render: () => {
    const v = state.work.vital;
    const values = vitalValues();
    return `
      ${header({ title: patientTitle(), left: 'back', right: 'menu' })}
      <div class="screen-body scroll task-w vital-body">
        <div class="task-top">${aiButton()}${patientCard({ prn: state.orders.some((o) => o.prn) })}</div>
        <section class="vcard">
          <div class="vcard-head">
            <span class="l"><span class="vcard-title">활력징후</span>${modeChips(v.planMode)}</span>
            <button class="vreset" data-act="vreset">초기화 ${icon.refresh}</button>
          </div>
          <div class="vgrid2">${state.vitals.items.map((i) => vitalCell(i, values[i.k])).join('')}</div>
          <div class="vcard-foot"><span>${DEMO_DATE} ${v.time}</span><span>${NURSE.label} (${NURSE.no})</span></div>
        </section>
        ${stickyButton('저장하기', 'save')}
      </div>`;
  },
  mount(el) {
    el.querySelectorAll('.vval').forEach((input) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9.]/g, '');
        vitalValues()[input.dataset.k] = input.value;
        refreshCell(input.dataset.k);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    });
  },
  actions: {
    'hdr-back': () => confirmReset('hub'),
    'hdr-menu': () => confirmReset('menu'),
    voice: () => {
      state.voice.origin = 'vital';
      go('voice', { step: 'record' });
    },
    'patient-detail': () => go('detail'),
    'prn-info': () => openMedDialog('prn'),
    mode: (t) => {
      const v = state.work.vital;
      // 플랜: 09/13/17/21 중 선택 · 실시간: 현재 시간으로 설정
      if (t.dataset.mode === 'plan') return openVitalTime();
      v.planMode = 'live';
      v.time = nowHHMM();
      rerender();
    },
    'time-sheet': () => openVitalTime(),
    vstep: (t) => {
      const k = t.dataset.k;
      const values = vitalValues();
      const cur = parseFloat(values[k]);
      const next = (Number.isNaN(cur) ? 0 : cur) + Number(t.dataset.d) * VITAL_STEP[k];
      values[k] = fmt(k, Math.max(0, k === 'SpO2' ? Math.min(100, next) : next));
      refreshCell(k);
    },
    vreset: () => {
      state.work.vital.values = null;
      rerender();
      toast('측정값을 초기화했습니다.');
    },
    save: () => {
      const v = state.work.vital;
      const values = vitalValues();
      const empty = state.vitals.items.filter((i) => !String(values[i.k]).trim());
      if (empty.length) return toast(`${empty.map((i) => i.k).join(', ')} 값을 입력해 주세요.`);
      // the detail screen's 임상관찰기록 now shows these values
      state.vitals = {
        time: v.time,
        who: NURSE.label,
        items: state.vitals.items.map((i) => ({
          ...i,
          v: values[i.k],
          at: `${DEMO_DATE.slice(5).replace('-', '/')} ${v.time}`,
          flag: flagOf(i.k, values[i.k]),
        })),
      };
      completeTask('vital', v.time);
      go('wdone', { kind: 'vital' });
    },
  },
  onBack: () => {
    confirmReset('hub');
    return true;
  },
});

/* ---------------- common-done-01 ---------------- */
register('wdone', {
  bg: ({ kind }) => themeBg(kind),
  render: ({ kind }) => `
    ${header({ title: patientTitle() })}
    <div class="screen-body center-status">
      <span class="spacer" style="flex-grow: 204"></span>
      ${statusBlock(
        kind === 'bld'
          ? { img: 'check-blue', title: '채혈 완료', desc: `채혈관 ${state.work.bld.tubes.length}개가 환자와 교차 검증되어\nEMR 시스템에 실시간 전송되었습니다.` }
          : { img: KINDS[kind].green ? 'check-green' : 'check-blue', title: '수행 완료', desc: '환자 및 처방 바코드 교차 검증 후\nEMR 시스템에 실시간 전송되었습니다.' },
      )}
      <span class="spacer" style="flex-grow: 263"></span>
    </div>
    <div class="screen-foot">${button('확인', 'ok')}</div>`,
  actions: {
    ok: (t, { kind }) => toWorkScan(kind),
  },
  onBack: ({ kind }) => {
    toWorkScan(kind);
    return true;
  },
});

/** 확인 → that work's 바코드 스캔 안내 화면 (채혈하기: 업무 종료 → 환자허브). */
export function toWorkScan(kind) {
  resetWork();
  if (kind === 'bld') {
    state.hubTab = 'urgent';
    return backTo('hub');
  }
  backTo(kind === 'vital' ? 'vital' : 'wtask', { kind });
  replace('wscan', { kind }, 'fade');
}
