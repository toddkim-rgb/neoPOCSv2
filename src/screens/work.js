// 채혈하기 (neo-bld) · 수혈하기 (neo-trf) · 활력징후 (neo-vital) — SSol design, phase 2.
// 채혈하기 runs in a fixed order: 환자 바코드 → 채혈관 바코드 (one per 채혈 오더; with 2+ orders the button asks for
// '다른 채혈관 바코드 스캔') → 채혈 확인 → 채혈 완료 → 종료 (환자허브).
// 수혈하기: common-scan-01 → 환자 팔찌 → 수혈하기 목록 at once (every 출고된 수혈 오더, no 처방 스캔 step). A blood bag carries
// two barcodes — 혈액번호 and 혈액제제 — scanned in either order; once they pair up, that 혈액번호 is '확인' (a wrong pair is
// 불일치). An order with several 혈액번호 shows each one's state (대기 · 제제 스캔 · 확인 · 수혈 완료 · 중단); only confirmed
// bags are given, one at a time: 수행하기 → 1차 · 2차 인증 (once per 항목) → 수혈 진행 (transfuse.js). The same 항목's later
// bags need only their 혈액번호 (on the 수혈 진행 화면, or here) and no new 이중 인증; another 항목 starts over with two
// barcodes and its own check. A bag scanned before the wristband still shows the list with the '환자 스캔' warning. 활력징후 needs only the patient scan; its task edits SBP·DBP·PR·RR·BT·SpO2 and saves them
// to the 임상관찰기록.
// Every flow works for the six sample patients: a wristband selects that patient, 채혈관/혈액 barcodes belong to one
// patient (another patient's label is 불일치), and a patient without that order gets '수행할 오더 없음'.
import { register, go, replace, backTo, rerender } from '../router.js';
import { header, button, aiButton, statusBlock, patientCard, patientLine, badge, esc, toast, openSheet, closeSheet, openDialog, asset3d } from '../ui.js';
import { icon } from '../icons.js';
import { patientTitle, PATIENT, NURSE, DEMO_DATE, VITAL_STEP, bloodType } from '../data.js';
import { PATIENTS, DEFAULT_PID, patientByCode } from '../patients.js';
import { state, resetWork, selectPatient, completeTask, taskStatus, trfUnits, unitStatus, trfNext, trfLeft } from '../state.js';
import { openMedDialog, confirmReset, startCheck, openNoOrders, openScanSim, patientSims, FAIL_SIM } from './med.js';
import { flagOf } from './vitals.js';
import { voiceButton, openVoiceInput, flashVoiced } from '../vvoice.js';

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
    // 측정 시간 = 지금 (분 단위까지 바꿀 수 있음); screenshots keep the design's 17:00
    if (!document.documentElement.classList.contains('shot')) state.work.vital.time = nowHHMM();
    return replace('vital', {}, 'fade');
  }
  if (p) return workPatient(kind, p.id);
  // 수혈: a 혈액번호 or 혈액제제 label; any other label fills the next missing step so the demo always moves forward
  const owner = workOwner(kind, c);
  if (owner || state.work[kind].scan.patient || /^T\d+/.test(c)) return trfScan(c, owner || state.pid);
  return workPatient(kind, state.pid);
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

/* ---------------- 수혈: 혈액백 = 혈액번호 + 혈액제제 바코드 ---------------- */
const orderOfUnit = (unit) => state.work.trf.orders.find((o) => o.units.includes(unit));
const bagName = (o) => (/red/i.test(o.name) ? 'Red Cell' : /white/i.test(o.name) ? 'White Cell' : o.name);

/** A 혈액번호 or 혈액제제 barcode of `owner`'s blood (unknown labels stand for the barcode the bag still needs). */
function trfScan(c, owner) {
  const w0 = state.work.trf;
  if (w0.scan.patient && owner !== state.pid) return openMedDialog('mismatch');
  selectPatient(owner); // a bag scanned first names its patient
  if (!taskStatus('trf').ok) return openNoOrders('trf');
  const w = state.work.trf;
  let unit = trfUnits().some((x) => x.unit === c) ? c : null;
  let code = w.orders.some((o) => o.code === c) ? c : null;
  if (!unit && !code) {
    if (w.pend?.unit) code = orderOfUnit(w.pend.unit).code;
    else unit = nextWaiting(w.pend?.code)?.unit || null;
    if (!unit && !code) return toast('확인할 혈액백이 없습니다.');
  }
  if (unit) {
    const st = w.bags[unit];
    if (st === 'done' || st === 'stop') return toast('이미 수혈한 혈액입니다.');
    if (st === 'ok') return toast('이미 확인된 혈액백입니다.');
    if (w.pend?.code) return w.pend.code === orderOfUnit(unit).code ? confirmBag(unit) : pairMismatch();
    // the 항목 is already double-checked (its first bag): a later bag needs only its 혈액번호
    if (w.checked[orderOfUnit(unit).id]) return confirmBag(unit);
    w.pend = { unit }; // (a 혈액번호 read again replaces the earlier one)
    return scanned('혈액번호를 확인했습니다. 같은 혈액백의 혈액제제 바코드를 스캔해 주세요.');
  }
  if (w.pend?.unit) return orderOfUnit(w.pend.unit).code === code ? confirmBag(w.pend.unit) : pairMismatch();
  if (!nextWaiting(code)) return toast('이 혈액제제의 혈액백은 모두 확인되었습니다.');
  w.pend = { code };
  scanned('혈액제제를 확인했습니다. 같은 혈액백의 혈액번호를 스캔해 주세요.');
}

/** The next 대기 bag (of the 혈액제제 `code`, else the focused order first). */
function nextWaiting(code) {
  const waiting = trfUnits().filter(({ unit }) => unitStatus(unit) === 'wait' || unitStatus(unit) === 'half');
  if (code) return waiting.find((x) => x.o.code === code);
  return waiting.find((x) => x.o.focus) || waiting[0];
}

function scanned(msg) {
  state.work.trf.scan.drug = true;
  showWork('trf');
  toast(msg);
}

function confirmBag(unit) {
  const w = state.work.trf;
  w.bags[unit] = 'ok';
  w.pend = null;
  w.scan.drug = true;
  showWork('trf');
  navigator.vibrate?.(20);
  toast(`혈액백(${unit})이 확인되었습니다.`);
}

function pairMismatch() {
  state.work.trf.pend = null;
  showWork('trf');
  openDialog(
    { title: '혈액번호/혈액제제 불일치', desc: '혈액번호와 혈액제제가 같은 혈액백이 아닙니다.\n같은 혈액백의 두 바코드를 다시 스캔해 주세요.' },
    { ok: () => closeSheet() },
  );
}

/** The barcode the PDA scan button reads next: the half-scanned bag's other label, else the next 대기 bag's 혈액번호. */
function nextBagCode() {
  const w = state.work.trf;
  if (w.pend?.unit) return orderOfUnit(w.pend.unit).code;
  return nextWaiting(w.pend?.code)?.unit;
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
  return `${header({ title: KINDS.bld.title, left: 'back', right: 'menu' })}
    <div class="screen-body scroll task-w">
      <div class="task-top">${aiButton()}${patientCard({ prn: state.orders.some((o) => o.prn) })}</div>
      <div class="medlist wlist">
        <div class="medlist-head">
          <span class="l"><span class="medlist-title gtext">채혈하기</span></span>
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
  if (step === 'bag') return bagSims();
  const unit = trfUnits()[0];
  return [...patientSims(), unit && { label: `혈액번호 · ${unit.unit}`, code: unit.unit }, productSim(), FAIL_SIM].filter(Boolean);
}
const openSim = (kind, step) => openScanSim(simItems(kind, step), (code) => handleWorkScan(kind, code));

/** 혈액 스캔 (long-press): this bag's other label, the next bags, a 혈액제제 of another product, another patient's blood. */
function bagSims() {
  const w = state.work.trf;
  const waiting = trfUnits().filter(({ unit }) => !w.bags[unit] && w.pend?.unit !== unit);
  const items = [];
  if (w.pend?.unit) {
    const o = orderOfUnit(w.pend.unit);
    items.push({ label: `혈액제제 · ${bagName(o)} (같은 혈액백)`, code: o.code });
    const diff = w.orders.find((x) => x.code !== o.code);
    if (diff) items.push({ label: `혈액제제 · ${bagName(diff)} (다른 제제)`, code: diff.code });
  } else if (w.pend?.code) {
    waiting.filter((x) => x.o.code === w.pend.code).slice(0, 3).forEach((x) => items.push({ label: `혈액번호 · ${x.unit} (같은 제제)`, code: x.unit }));
    const diff = waiting.find((x) => x.o.code !== w.pend.code);
    if (diff) items.push({ label: `혈액번호 · ${diff.unit} (다른 제제)`, code: diff.unit });
  } else {
    waiting.slice(0, 4).forEach((x) => items.push({ label: `혈액번호 · ${x.unit} · ${bagName(x.o)}`, code: x.unit }));
    w.orders.forEach((o) => items.push({ label: `혈액제제 · ${bagName(o)}`, code: o.code }));
  }
  const other = otherPatient((s) => s.work.trf.orders.length);
  if (other) items.push({ label: `다른 환자의 혈액 · ${other.name}`, code: state.pt[other.id].work.trf.orders[0].units[0] });
  return [...items, FAIL_SIM];
}

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

/* ---------------- 채혈하기 · 수혈하기 task (no 플랜 / 실시간: removed on request) ---------------- */

const UNIT_ST = {
  wait: ['대기', 'wait'],
  half: ['제제 스캔', 'half'],
  ok: ['확인', 'ok'],
  done: ['수혈 완료', 'done'],
  stop: ['중단', 'stop'],
};

/** 수혈 오더 card: the time / flag row of the design is replaced by each 혈액번호's state (확인 n / m). */
function trfCard(o) {
  const w = state.work.trf;
  const seen = o.units.filter((u) => w.bags[u]).length;
  const cells = o.units
    .map((u) => {
      const st = unitStatus(u);
      const [label, cls] = UNIT_ST[st];
      return `<span class="unit ${cls}"><span class="no">${u}</span><span class="st">${st === 'ok' || st === 'done' ? icon.check : ''}${label}</span></span>`;
    })
    .join('');
  return `
    <div class="wcard trf${seen === o.units.length ? ' all' : ''}">
      <p class="wcard-name">${esc(o.name)}<img class="warn" src="${asset3d('warning-red')}" alt="고위험"></p>
      <p class="wcard-sub"><b class="abo">혈액형 : ${bloodType(o)}</b>발행처 : ${o.issuer}<i></i>발행시간 : ${o.issued}</p>
      <div class="unit-box">
        <div class="unit-head"><span>혈액번호</span><span class="unit-n">확인 <b>${seen}</b> / ${o.units.length}</span></div>
        <div class="unit-grid">${cells}</div>
      </div>
    </div>`;
}

/** What the nurse scans next. */
function trfHint() {
  const w = state.work.trf;
  if (w.pend?.unit) return [false, `혈액번호 ${w.pend.unit} 확인 · 같은 혈액백의 혈액제제 바코드를 스캔해 주세요.`];
  if (w.pend?.code) return [false, `혈액제제(${bagName(w.orders.find((o) => o.code === w.pend.code))}) 확인 · 같은 혈액백의 혈액번호를 스캔해 주세요.`];
  const ok = trfUnits().filter(({ unit }) => w.bags[unit] === 'ok').length;
  if (ok) return [true, `확인된 혈액백 ${ok}개 · 수행하기를 눌러 주세요.`];
  const given = trfUnits().length - trfLeft().length;
  if (w.checked[nextWaiting()?.o.id]) return [false, `${given ? `${given}단위 수혈 완료 · ` : ''}다음 혈액백의 혈액번호를 스캔해 주세요.`];
  return [false, `${given ? `${given}단위 수혈 완료 · 다음 ` : ''}혈액백의 혈액번호와 혈액제제 바코드를 모두 스캔해 주세요.`];
}

function trfList(interactive) {
  const w = state.work.trf;
  const [all, hint] = trfHint();
  return `
    <div class="medlist wlist">
      <div class="medlist-head">
        <span class="l"><span class="medlist-title gtext">${KINDS.trf.list}</span></span>
        ${badge(`총 ${w.orders.length}건`, 'count-grad')}
      </div>
      ${interactive ? `<p class="tube-hint${all ? ' all' : ''}">${all ? icon.checkCircle : icon.error}<span>${hint}</span></p>` : ''}
      <div class="wcards">${w.orders.map(trfCard).join('')}</div>
    </div>`;
}

/** 혈액 스캔 until a bag is confirmed, then 수행하기 (with 혈액 스캔 beside it while bags are still 대기). */
function trfFoot() {
  const scan = (label, cls = '') => `<button class="btn${cls}" data-act="scan-bag" data-long="scan-sim-bag">${label}</button>`;
  if (!trfNext()) return `<div class="sticky-foot">${scan('혈액 바코드 스캔')}</div>`;
  const perform = button(KINDS.trf.action, 'perform', { cta: true });
  const waiting = trfLeft().some(({ unit }) => state.work.trf.bags[unit] !== 'ok');
  return waiting ? `<div class="sticky-foot two-btns">${scan('혈액 스캔', ' line')}${perform}</div>` : `<div class="sticky-foot">${perform}</div>`;
}

/** The action button follows the list (design) and sticks to the bottom once the list is taller than the screen. */
const stickyButton = (label, act, { cta = false } = {}) => `<div class="sticky-foot">${button(label, act, { cta })}</div>`;

register('wtask', {
  bg: 'screen',
  render: ({ kind }) => {
    if (kind === 'bld') return bloodTask();
    const w = state.work[kind];
    const { patient, drug } = w.scan;
    const hdr = header({ title: KINDS[kind].title, left: 'back', right: 'menu' });
    const prn = state.orders.some((o) => o.prn);
    // blood bag first: the wristband is still missing
    if (drug && !patient) {
      return `${hdr}
        <div class="screen-body scroll task-w">
          <div class="task-top">${aiButton()}${patientCard({ prn, scanWarn: true })}</div>
          ${trfList(false)}
          ${stickyButton('환자정보 스캔하기', 'scan-patient')}
        </div>`;
    }
    // wristband scanned: the patient's 수혈 오더 straight away; each bag is confirmed by its two barcodes
    return `${hdr}
      <div class="screen-body scroll task-w">
        <div class="task-top">${aiButton()}${patientCard({ prn })}</div>
        ${trfList(true)}
        ${trfFoot()}
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
    // 수혈: the PDA scan button reads the barcode the bag needs next; long-press picks a specific label
    'scan-bag': () => {
      const c = nextBagCode();
      if (!c) return toast('확인할 혈액백이 없습니다.');
      handleWorkScan('trf', c);
    },
    'scan-sim-bag': () => openSim('trf', 'bag'),
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
      if (kind === 'trf') {
        const next = trfNext();
        if (!next) return toast('혈액백의 혈액번호와 혈액제제 바코드를 먼저 스캔해 주세요.');
        // the 이중 인증 is once per 항목: a later bag of a checked 항목 goes straight to 수혈 진행
        return state.work.trf.checked[next.o.id] ? go('trfrun') : startCheck('trf');
      }
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

/* ---------------- 활력징후 (neo-vital-task-01; 플랜 / 실시간 removed, 측정 시간 시·분) ---------------- */
// The cells start empty — the previous record is shown under each one ('이전 118 · 15:30'), so an old value is never
// saved as a new measurement by accident. −/+ on an empty cell starts from the previous value.
const vitalValues = () => {
  const v = state.work.vital;
  if (!v.values) v.values = Object.fromEntries(state.vitals.items.map((i) => [i.k, '']));
  return v.values;
};
/** The patient's previous record of item `k` (임상관찰기록): { v, flag, time }. */
export function prevVital(k) {
  const i = state.vitals.items.find((x) => x.k === k);
  return i ? { v: i.v, flag: i.flag || flagOf(k, i.v), time: (i.at || '').split(' ')[1] || state.vitals.time } : null;
}
export const prevValues = () => Object.fromEntries(state.vitals.items.map((i) => [i.k, i.v]));
export const prevLine = (k) => {
  const p = prevVital(k);
  return p ? `<span class="vt-prev">이전 <b class="${p.flag || ''}">${esc(p.v)}</b> · ${p.time}</span>` : '';
};
/** −/+ : from the value in the cell, or from the previous record when the cell is still empty. */
export function stepValue(k, cur, d) {
  const base = parseFloat(cur);
  const from = Number.isNaN(base) ? parseFloat(prevVital(k)?.v) : base;
  const next = (Number.isNaN(from) ? 0 : from) + d * VITAL_STEP[k];
  return fmt(k, Math.max(0, k === 'SpO2' ? Math.min(100, next) : next));
}
const FLAG_LABEL = { danger: '경고', warn: '주의' };
const fmt = (k, n) => (VITAL_STEP[k] < 1 ? n.toFixed(1) : String(Math.round(n)));
/** Input width that hugs the number, like the design's centred values (Pretendard 20px digits ≈ 11.6px). */
const valueWidth = (v) => {
  const t = String(v);
  if (!t) return 34; // the '입력' placeholder
  return Math.round(Math.max(2, t.replace(/\./g, '').length) * 11.6 + (t.match(/\./g) || []).length * 5 + 2);
};
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 정상 · 주의 · 경고, or 미입력 while the cell is empty. */
export const flagTag = (k, value) => {
  if (!String(value).trim()) return ['미입력', 'none'];
  const flag = flagOf(k, value);
  return [FLAG_LABEL[flag] || '정상', flag || 'ok'];
};

export function vitalCell(item, value) {
  const flag = flagOf(item.k, value);
  const [label, cls] = flagTag(item.k, value);
  return `
    <div class="vt-cell has-prev" data-k="${item.k}">
      <div class="vt-top"><span class="vt-k">${item.k}</span><span class="vflag-tag ${cls}">${label}</span></div>
      <div class="vt-mid">
        <button class="vstep" data-act="vstep" data-k="${item.k}" data-d="-1" aria-label="${item.k} 감소">−</button>
        <input class="vval ${flag || ''}" data-k="${item.k}" type="text" inputmode="decimal" value="${esc(value)}" placeholder="입력" style="width:${valueWidth(value)}px" aria-label="${item.k}" autocomplete="off">
        <button class="vstep" data-act="vstep" data-k="${item.k}" data-d="1" aria-label="${item.k} 증가">+</button>
        <span class="vunit">${item.unit}</span>
      </div>
      ${prevLine(item.k)}
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
  const [label, cls] = flagTag(k, value);
  tag.className = `vflag-tag ${cls}`;
  tag.textContent = label;
}

/* 측정 시간 변경: 시 · 분 −/+ (1분 단위, 길게 누르면 빠르게) · 지금 */
const pad2 = (n) => String(n).padStart(2, '0');
function openVitalTime() {
  const v = state.work.vital;
  let [h, m] = v.time.split(':').map(Number);
  const col = (unit, label) => `
    <div class="vtp-col">
      <button class="vtp-btn" data-sheet-act="${unit}" data-d="1" aria-label="${label} 늘리기">${icon.arrowUp}</button>
      <b class="vtp-v" data-v="${unit}">00</b>
      <button class="vtp-btn" data-sheet-act="${unit}" data-d="-1" aria-label="${label} 줄이기">${icon.arrowDown}</button>
      <span class="vtp-l">${label}</span>
    </div>`;
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">측정 시간 변경</p><button class="chip on" data-sheet-act="now"><span>지금</span></button></div>
     <p class="sheet-hint">${DEMO_DATE} · 시와 분을 조절해 주세요. 길게 누르면 빠르게 바뀝니다.</p>
     <div class="vtime-pick">${col('h', '시')}<span class="vtp-colon">:</span>${col('m', '분')}</div>
     <div class="sheet-btns">
       <button class="btn line" data-sheet-act="cancel">취소</button>
       <button class="btn" data-sheet-act="ok">확인</button>
     </div>`,
    {
      h: (t) => !t.dataset.held && step(Number(t.dataset.d) * 60),
      m: (t) => !t.dataset.held && step(Number(t.dataset.d)),
      now: () => {
        [h, m] = nowHHMM().split(':').map(Number);
        paint();
      },
      cancel: () => closeSheet(),
      ok: () => {
        v.time = `${pad2(h)}:${pad2(m)}`;
        closeSheet();
        rerender();
        toast(`측정 시간을 ${v.time}(으)로 바꿨습니다.`);
      },
    },
    { cls: 'vtime' },
  );
  const sheet = document.querySelector('#sheet-layer .sheet.vtime');
  function paint() {
    sheet.querySelector('[data-v="h"]').textContent = pad2(h);
    sheet.querySelector('[data-v="m"]').textContent = pad2(m);
  }
  function step(dm) {
    const t = (((h * 60 + m + dm) % 1440) + 1440) % 1440;
    h = Math.floor(t / 60);
    m = t % 60;
    paint();
  }
  // long-press repeats
  sheet.querySelectorAll('.vtp-btn').forEach((b) => {
    let timer = null;
    const end = () => {
      clearTimeout(timer);
      clearInterval(timer);
      timer = null;
      setTimeout(() => delete b.dataset.held, 0);
    };
    b.addEventListener('pointerdown', () => {
      delete b.dataset.held;
      timer = setTimeout(() => {
        b.dataset.held = '1';
        timer = setInterval(() => step(Number(b.dataset.d) * (b.dataset.sheetAct === 'h' ? 60 : 1)), 90);
      }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, end));
  });
  paint();
}

register('vital', {
  bg: 'green',
  render: () => {
    const v = state.work.vital;
    const values = vitalValues();
    return `
      ${header({ title: KINDS.vital.title, left: 'back', right: 'menu' })}
      <div class="screen-body scroll task-w vital-body">
        <div class="task-top">${aiButton()}${patientCard({ prn: state.orders.some((o) => o.prn) })}</div>
        <section class="vcard">
          <div class="vcard-head">
            <span class="l"><span class="vcard-title">활력징후</span>${voiceButton()}</span>
            <button class="vreset" data-act="vreset">초기화 ${icon.refresh}</button>
          </div>
          <div class="vgrid2">${state.vitals.items.map((i) => vitalCell(i, values[i.k])).join('')}</div>
          <div class="vcard-foot"><button class="vtime-btn" data-act="time-sheet" aria-label="측정 시간 변경">${icon.alarmOutline}<span>${DEMO_DATE} <b>${v.time}</b></span>${icon.chevronRight}</button><span>${NURSE.label} (${NURSE.no})</span></div>
        </section>
        ${stickyButton('저장하기', 'save')}
      </div>`;
  },
  mount(el) {
    el.querySelectorAll('.vval').forEach((input) => {
      // 입력 칸을 누르면 직전 값이 채워지고 선택됨 (바로 치면 바뀜)
      input.addEventListener('focus', () => {
        const k = input.dataset.k;
        if (!input.value && prevVital(k)) {
          vitalValues()[k] = prevVital(k).v;
          refreshCell(k);
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
    'time-sheet': () => openVitalTime(),
    vstep: (t) => {
      const k = t.dataset.k;
      const values = vitalValues();
      values[k] = stepValue(k, values[k], Number(t.dataset.d));
      refreshCell(k);
    },
    vreset: () => {
      state.work.vital.values = null;
      rerender();
      toast('측정값을 비웠습니다.');
    },
    // 음성 입력: the recognised items fill their cells
    vvoice: () =>
      openVoiceInput({
        prev: prevValues(),
        onApply: (vals) => {
          Object.assign(vitalValues(), vals);
          rerender();
          flashVoiced('.vt-cell', Object.keys(vals));
        },
      }),
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
    ${header({ title: KINDS[kind].title })}
    <div class="screen-body center-status">
      ${patientLine()}
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
