// 채혈하기 (neo-bld) · 수혈하기 (neo-trf) · 활력징후 (neo-vital) — SSol design, phase 2.
// 채혈하기 runs in a fixed order: 환자 바코드 → 채혈관 바코드 (one per 채혈 오더; with 2+ orders the button asks for
// '다른 채혈관 바코드 스캔') → 채혈 확인 → 채혈 완료 → 종료 (환자허브).
// 수혈하기: common-scan-01 → 환자 팔찌 → 수혈하기 목록 at once (every 출고된 수혈 오더, no 처방 스캔 step). A blood bag carries
// two barcodes — 혈액번호 and 혈액제제 — scanned in either order; once they pair up, that 혈액번호 is '확인' (a wrong pair is
// 불일치). Every 혈액팩 has its own card (2026-11-23: 대기 · 제제 스캔 · 확인 · 수혈 시작 · 15분 체크 · 중단); only confirmed
// bags are given, one at a time: 수행하기 → 1차 · 2차 인증 (once per 항목) → 수혈 시작 기록 (transfuse.js; 종료 시각 없음,
// 15분 뒤 체크 알람). The same 항목's later bags need only their 혈액번호 and no new 이중 인증; another 항목 starts over with
// two barcodes and its own check. A bag scanned before the wristband still shows the list with the '환자 스캔' warning.
// 활력징후 needs only the patient scan; its task edits SBP·DBP·PR·RR·BT·SpO2 (직접 · 음성 · 모니터 사진 입력, 빈 칸이
// 있어도 저장) and saves them to the 임상관찰기록.
// 업무 완료 → 확인 (2026-11-23): 환자허브에서 환자를 골라 시작한 업무는 환자허브로, 업무 메뉴 · 퀵메뉴 · 스캔으로 시작한
// 업무는 그 업무의 바코드 스캔 화면으로 돌아갑니다 (state.origin).
// 환자허브 (긴급 카드 · MY환자 업무 선택 · AI 커맨드바에 환자 이름) opens the chosen patient's work at once, like 투약
// (2026-11-23): 환자정보 비활성 + 업무 내용 흐리게 → 환자 팔찌 스캔 → 환자정보 활성 (✓ 환자 확인) → 업무 수행.
// Without a chosen patient (메뉴 · 퀵메뉴 · AI 커맨드바 '채혈') the 바코드 스캔 screen comes first, as before.
// Every flow works for the six sample patients: a wristband selects that patient, 채혈관/혈액 barcodes belong to one
// patient (another patient's label is 불일치), and a patient without that order gets '수행할 오더 없음'.
import { register, go, replace, backTo, rerender } from '../router.js';
import { header, button, aiButton, statusBlock, patientCard, patientLine, badge, esc, toast, openSheet, closeSheet, openDialog, asset3d, resetBar } from '../ui.js';
import { icon } from '../icons.js';
import { patientTitle, PATIENT, NURSE, DEMO_DATE, VITAL_STEP, bloodType, MENU_ITEM } from '../data.js';
import { PATIENTS, DEFAULT_PID, patientByCode } from '../patients.js';
import {
  state, resetWork, resetPatient, selectPatient, completeTask, taskStatus, trfUnits, unitStatus, trfNext, trfLeft, recordVitals, TASK_LABEL,
} from '../state.js';
import { openMedDialog, confirmReset, startCheck, openNoOrders, openScanSim, patientSims, FAIL_SIM, handleMedScan } from './med.js';
import { flagOf, startCamera } from './vitals.js';
import { startBag, openCheck } from './transfuse.js';
import { voiceButton, openVoiceInput, flashVoiced } from '../vvoice.js';
import { feedback } from '../feedback.js';

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
    const id = p?.id || state.pid;
    if (state.work.vital.scan.patient && id === state.pid && document.querySelector('.scr-vital')) return toast('이미 확인된 환자입니다.');
    selectPatient(id);
    state.work.vital.scan.patient = true;
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
    if (st === 'start') return toast('이미 수혈을 시작한 혈액입니다.');
    if (st === 'stop') return toast('수혈을 중단한 혈액입니다.');
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
  feedback('ok');
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
  // 채혈 확인 버튼 옆에도 스캔 버튼을 항상 함께 둔다(스마트폰은 하드웨어 스캔 버튼이 없음, 2026-11-27 요청).
  // 수행 버튼과 나란히 놓일 땐(line) 다른 화면(수혈하기 '혈액 스캔')과 같은 짧은 이름을 써서 줄바꿈 없이 들어가게 한다.
  const scanBtn = (line) => button(line ? '채혈관 스캔' : done === 0 ? '채혈관 바코드 스캔' : '다른 채혈관 바코드 스캔', 'scan-tube', { line, long: 'scan-sim-tube' });
  const foot =
    done === n
      ? `<div class="sticky-foot two-btns">${scanBtn(true)}${button('채혈 확인', 'blood-confirm', { cta: true })}</div>`
      : `<div class="sticky-foot">${scanBtn(false)}</div>`;
  const prn = state.orders.some((o) => o.prn);
  if (!w.scan.patient) {
    // a chosen patient: 환자정보 비활성 and the 채혈관 dim until the wristband is scanned
    return `${header({ title: KINDS.bld.title, left: 'back', right: 'menu' })}${resetBar()}
      <div class="screen-body scroll task-w task-lock">
        <div class="task-top">${aiButton()}${patientCard({ prn, locked: true })}</div>
        ${lockHint('이어서 채혈관 바코드를 스캔합니다.')}
        <div class="medlist wlist">
          <div class="medlist-head"><span class="l"><span class="medlist-title gtext">채혈하기</span></span>${badge(`채혈관 0/${n}`, 'count-grad')}</div>
          <div class="wcards">${w.orders.map(bloodCard).join('')}</div>
        </div>
        ${scanPatientButton()}
      </div>`;
  }
  return `${header({ title: KINDS.bld.title, left: 'back', right: 'menu' })}${resetBar()}
    <div class="screen-body scroll task-w">
      <div class="task-top">${aiButton()}${patientCard({ prn, confirmed: true })}</div>
      <div class="medlist wlist">
        <div class="medlist-head">
          <span class="l"><span class="medlist-title gtext">채혈하기</span></span>
          ${badge(`채혈관 ${done}/${n}`, 'count-grad')}
        </div>
        <p class="tube-hint${done === n ? ' all' : ''}">${done === n ? icon.checkCircle : icon.error}<span>${hint}</span></p>
        <div class="wcards">${w.orders.map(bloodCard).join('')}</div>
      </div>
      ${foot}
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

/**
 * Opens a work flow. `pid` = a patient chosen on the 환자허브 (or named in the AI 커맨드바): their 업무 화면 at once with
 * 환자정보 비활성, activated by the wristband scan. Without one (메뉴 · 퀵메뉴) the 바코드 스캔 screen comes first.
 */
export function startWork(kind, pid) {
  selectPatient(pid || DEFAULT_PID);
  resetWork();
  state.origin = pid ? 'hub' : 'menu'; // 완료 후 돌아갈 곳
  if (!pid) return go('wscan', { kind });
  if (!taskStatus(kind).ok) return openNoOrders(kind);
  go(kind === 'vital' ? 'vital' : 'wtask', { kind });
}

/** 팔찌 스캔 전 안내 (투약과 같은 문구) and the button that scans the chosen patient's wristband. */
const lockHint = (next) =>
  `<p class="tube-hint lock-hint">${icon.error}<span>환자 팔찌를 스캔하면 환자정보가 활성화됩니다. ${next}</span></p>`;
const scanPatientButton = () => `<div class="sticky-foot">${button('환자 팔찌 스캔', 'scan-patient', { long: 'scan-sim-patient' })}</div>`;

/* ---------------- 채혈하기 · 수혈하기 task (no 플랜 / 실시간: removed on request) ---------------- */

/**
 * A 혈액팩's state on its card: [class, tag, line]. 대기 · 제제 스캔 · 확인 → 수혈 시작 (15분 체크 예정 · 필요 · 완료) · 중단.
 * The end of a bag is not recorded (2026-11-23), so a started bag stays '수혈 시작'.
 */
function bagState(unit) {
  const w = state.work.trf;
  const st = unitStatus(unit);
  if (st === 'wait') return ['wait', '대기', w.checked[orderOfUnit(unit).id] ? '혈액번호를 스캔해 주세요.' : '혈액번호와 혈액제제 바코드를 스캔해 주세요.'];
  if (st === 'half') return ['half', '제제 스캔', '같은 혈액백의 혈액제제 바코드를 스캔해 주세요.'];
  if (st === 'ok') return ['ok', '확인', '수행하기를 누르면 수혈을 시작합니다.'];
  const r = w.runs[unit] || { at: '--:--', chkAt: '--:--', due: Infinity };
  if (st === 'stop') return ['stop', '중단', `시작 ${r.at} · 중단 ${r.stop?.at || r.chkAt} · ${r.stop?.reason || ''}`];
  if (r.chk) return ['start', '수혈 시작', `시작 ${r.at} · 15분 체크 ${r.chk.at} 이상 없음`];
  if (r.due <= Date.now()) return ['due', '수혈 시작', `시작 ${r.at} · 15분 체크 필요`];
  return ['start', '수혈 시작', `시작 ${r.at} · 15분 체크 ${r.chkAt} 예정`];
}

/** One card per 혈액팩 (혈액번호): product · n/m 단위 · 혈액번호 · 혈액형 · 용량, and its state. */
function bagCard({ unit, o }, i, n) {
  const [cls, tag, line] = bagState(unit);
  const mark = ['ok', 'start', 'due'].includes(cls) ? icon.check : cls === 'stop' ? icon.error : '';
  return `
    <div class="wcard trf bag ${cls}" data-unit="${unit}">
      <p class="wcard-name">${esc(o.name)}<img class="warn" src="${asset3d('warning-red')}" alt="고위험">${badge(`${i + 1}/${n} 단위`, 'count-grad')}</p>
      <p class="wcard-line">혈액번호 <b>${unit}</b><i></i><b class="abo">혈액형 : ${bloodType(o)}</b><i></i>${o.volume}ml</p>
      <p class="wcard-sub">발행처 : ${o.issuer}<i></i>발행시간 : ${o.issued}</p>
      <div class="bag-st"><span class="tag">${mark}${tag}</span><span class="txt">${esc(line)}</span>${
        cls === 'due' ? `<button class="bag-chk" data-act="trf-check" data-unit="${unit}">체크하기</button>` : ''
      }</div>
    </div>`;
}

/** What the nurse scans next. */
function trfHint() {
  const w = state.work.trf;
  if (!trfLeft().length) return [true, '남은 혈액팩이 없습니다.'];
  if (w.pend?.unit) return [false, `혈액번호 ${w.pend.unit} 확인 · 같은 혈액백의 혈액제제 바코드를 스캔해 주세요.`];
  if (w.pend?.code) return [false, `혈액제제(${bagName(w.orders.find((o) => o.code === w.pend.code))}) 확인 · 같은 혈액백의 혈액번호를 스캔해 주세요.`];
  const ok = trfUnits().filter(({ unit }) => w.bags[unit] === 'ok').length;
  if (ok) return [true, `확인된 혈액백 ${ok}개 · 수행하기를 누르면 수혈을 시작합니다.`];
  const given = trfUnits().length - trfLeft().length;
  if (w.checked[nextWaiting()?.o.id]) return [false, `${given ? `${given}단위 수혈 시작 · ` : ''}다음 혈액백의 혈액번호를 스캔해 주세요.`];
  return [false, `${given ? `${given}단위 수혈 시작 · 다음 ` : ''}혈액백의 혈액번호와 혈액제제 바코드를 모두 스캔해 주세요.`];
}

function trfList(interactive) {
  const units = trfUnits();
  const [all, hint] = trfHint();
  return `
    <div class="medlist wlist">
      <div class="medlist-head">
        <span class="l"><span class="medlist-title gtext">${KINDS.trf.list}</span></span>
        ${badge(`혈액팩 ${units.length}개`, 'count-grad')}
      </div>
      ${interactive ? `<p class="tube-hint${all ? ' all' : ''}">${all ? icon.checkCircle : icon.error}<span>${hint}</span></p>` : ''}
      <div class="wcards">${units.map((x, i) => bagCard(x, i, units.length)).join('')}</div>
    </div>`;
}

/** 혈액 스캔 버튼은 수행하기 · 확인 옆에 항상 함께 둔다(스마트폰은 하드웨어 스캔 버튼이 없음, 2026-11-27 요청). */
function trfFoot() {
  const scan = (label, cls = ' line') => `<button class="btn${cls}" data-act="scan-bag" data-long="scan-sim-bag">${label}</button>`;
  if (!trfLeft().length) return `<div class="sticky-foot two-btns">${scan('혈액 바코드 스캔')}${button('확인', 'trf-finish', { cta: true })}</div>`;
  if (!trfNext()) return `<div class="sticky-foot">${scan('혈액 바코드 스캔', '')}</div>`;
  const perform = button(KINDS.trf.action, 'perform', { cta: true });
  return `<div class="sticky-foot two-btns">${scan('혈액 스캔')}${perform}</div>`;
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
    // a chosen patient: 환자정보 비활성 and the 수혈 오더 dim until the wristband is scanned
    if (!patient && !drug) {
      return `${hdr}${resetBar()}
        <div class="screen-body scroll task-w task-lock">
          <div class="task-top">${aiButton()}${patientCard({ prn, locked: true })}</div>
          ${lockHint('이어서 혈액백의 혈액번호와 혈액제제 바코드를 스캔합니다.')}
          ${trfList(false)}
          ${scanPatientButton()}
        </div>`;
    }
    // blood bag first: the wristband is still missing
    if (drug && !patient) {
      return `${hdr}${resetBar()}
        <div class="screen-body scroll task-w">
          <div class="task-top">${aiButton()}${patientCard({ prn, scanWarn: true })}</div>
          ${trfList(false)}
          ${stickyButton('환자정보 스캔하기', 'scan-patient')}
        </div>`;
    }
    // wristband scanned: the patient's 수혈 오더 straight away; each bag is confirmed by its two barcodes
    return `${hdr}${resetBar()}
      <div class="screen-body scroll task-w">
        <div class="task-top">${aiButton()}${patientCard({ prn, confirmed: true })}</div>
        ${trfList(true)}
        ${trfFoot()}
      </div>`;
  },
  actions: {
    'hdr-back': () => confirmReset('hub'),
    'hdr-menu': () => confirmReset('menu'),
    'reset-scan': () => confirmReset('hub'),
    voice: (t, { kind }) => {
      if (!state.work[kind].scan.patient) return toast('환자 스캔 후 음성간호메모를 진행할 수 있습니다.');
      state.voice.origin = kind; // bld | trf
      go('voice', { step: 'record' });
    },
    'patient-detail': () => go('detail'),
    'prn-info': () => openMedDialog('prn'),
    'scan-patient': (t, { kind }) => handleWorkScan(kind, PATIENT.barcode),
    'scan-sim-patient': (t, { kind }) => openSim(kind),
    // 수혈: the PDA scan button reads the barcode the bag needs next; long-press picks a specific label
    'scan-bag': () => {
      const c = nextBagCode();
      if (!c) return toast('확인할 혈액백이 없습니다.');
      handleWorkScan('trf', c);
    },
    'scan-sim-bag': () => openSim('trf', 'bag'),
    // 15분 체크 필요 (혈액팩 카드) · 남은 혈액팩 없음 → 확인
    'trf-check': (t) => openCheck(state.pid, t.dataset.unit),
    'trf-finish': () => toWorkScan('trf'),
    // 채혈관: the PDA scan button reads the next tube; long-press picks a specific label
    'scan-tube': () => handleBloodScan((bloodLeft()[0] || state.work.bld.orders[0]).code, null),
    'scan-sim-tube': () => openSim('bld', 'tube'),
    'blood-confirm': () => {
      if (bloodLeft().length) return toast('모든 채혈관 바코드를 먼저 스캔해 주세요.');
      completeTask('bld', state.work.bld.orders[0].now.time);
      go('wdone', { kind: 'bld' });
    },
    perform: (t, { kind }) => {
      // 수혈은 고위험수행: 수행하기 → 1차 인증 → 2차 인증 → 이중 확인 완료 → 수혈 시작 기록 (transfuse.js)
      if (kind === 'trf') {
        const next = trfNext();
        if (!next) return toast('혈액백의 혈액번호와 혈액제제 바코드를 먼저 스캔해 주세요.');
        // the 이중 인증 is once per 항목: a later bag of a checked 항목 starts at once
        return state.work.trf.checked[next.o.id] ? startBag(true) : startCheck('trf');
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
/** The patient's previous record of item `k` (임상관찰기록): { v, flag, time } — an item left empty last time comes from the record before.
 * `time` is the full 'MM/DD HH:MM' (날짜 포함, 2026-11-24 요청 — 시각만으로는 언제 잰 값인지 알기 어려움). */
export function prevVital(k) {
  const i = state.vitals.items.find((x) => x.k === k);
  if (!i) return null;
  if (String(i.v ?? '').trim()) return { v: i.v, flag: i.flag || flagOf(k, i.v), time: i.at || `${DEMO_DATE.slice(5).replace('-', '/')} ${state.vitals.time}` };
  const row = state.pt[state.pid].vhist.find((r) => String(r.values[k] ?? '').trim());
  return row ? { v: row.values[k], flag: flagOf(k, row.values[k]), time: row.at } : null;
}
export const prevValues = () => Object.fromEntries(state.vitals.items.map((i) => [i.k, prevVital(i.k)?.v ?? '']));

/** 사진 입력: the values read from the monitor photo fill their cells (unread items keep what was typed). */
export function fillVital(vals) {
  Object.assign(vitalValues(), vals);
}
const photoButton = () =>
  `<button class="vvoice-btn vphoto-btn" data-act="vphoto" aria-label="모니터 사진으로 활력징후 입력">${icon.camera}<span>사진 입력</span></button>`;
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
export const valueWidth = (v) => {
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

/** `extra`: more markup appended after the 이전 값 line (e.g. vitals.js's AI 인식 상태 tag).
 * `prev`: false hides the 이전 값 line (vitals.js, before its patient is known — prevLine would show the wrong patient's record). */
export function vitalCell(item, value, { extra = '', prev = true } = {}) {
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
      ${prev ? prevLine(item.k) : ''}
      ${extra}
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

/** 저장 전 확인 팝업: 입력된 값을 보여주고, 빈 칸이 있으면 함께 알려준 뒤 저장을 확인받는다 (2026-11-27 요청). */
function openVitalConfirm(filled, empty) {
  const values = vitalValues();
  // 가독성 위해 글자 키우고 수치 · 단위를 분리 (2026-11-27 요청) — .dlg.vconfirm 전용 스타일 (screens.css)
  const rows = filled
    .map(
      (i) =>
        `<div class="prn-row"><span class="k">${i.k}</span><span class="vu"><span class="v">${esc(values[i.k])}</span><span class="u">${esc(i.unit)}</span></span></div>`,
    )
    .join('');
  // 미입력 항목은 안내 문구 안에 묻히지 않게 따로 강조 표시 (2026-11-27 요청, .tube-hint 재사용)
  const emptyNote = empty.length
    ? `<p class="tube-hint">${icon.error}<span>미입력 : ${esc(empty.map((i) => i.k).join(', '))}</span></p>`
    : '';
  openDialog(
    {
      title: '활력징후 저장',
      tone: 'plain',
      cls: 'vconfirm',
      desc: '입력한 값을 저장할까요?',
      body: `${emptyNote}<div class="prn-box">${rows}</div>`,
      buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '저장', act: 'ok' }],
    },
    {
      cancel: () => closeSheet(),
      ok: () => {
        closeSheet();
        commitVitalSave();
      },
    },
  );
}

/** 측정값을 임상관찰기록에 실제로 저장 (openVitalConfirm의 '저장' 확인 이후). */
function commitVitalSave() {
  const v = state.work.vital;
  const values = vitalValues();
  const has = (k) => String(values[k] ?? '').trim();
  const filled = state.vitals.items.filter((i) => has(i.k));
  v.saved = { n: filled.length, empty: state.vitals.items.filter((i) => !has(i.k)).map((i) => i.k) };
  // the detail screen's 임상관찰기록 now shows these values (the previous record moves to its history)
  recordVitals({
    time: v.time,
    who: NURSE.label,
    items: state.vitals.items.map((i) => ({
      ...i,
      v: has(i.k) ? values[i.k] : '',
      at: `${DEMO_DATE.slice(5).replace('-', '/')} ${v.time}`,
      flag: flagOf(i.k, values[i.k]),
    })),
  });
  completeTask('vital', v.time);
  go('wdone', { kind: 'vital' });
}

register('vital', {
  bg: 'green',
  render: () => {
    const v = state.work.vital;
    const values = vitalValues();
    // a chosen patient: 환자정보 비활성 and the 입력 칸 dim until the wristband is scanned
    const locked = !v.scan.patient;
    return `
      ${header({ title: KINDS.vital.title, left: 'back', right: 'menu' })}
      <div class="screen-body scroll task-w vital-body${locked ? ' task-lock' : ''}">
        <div class="task-top">${aiButton()}${patientCard({ prn: state.orders.some((o) => o.prn), locked, confirmed: !locked })}</div>
        ${locked ? lockHint('이어서 활력징후를 입력합니다.') : ''}
        <section class="vcard">
          <div class="vcard-head">
            <span class="l"><span class="vcard-title">활력징후</span>${voiceButton()}${photoButton()}</span>
            <button class="vreset" data-act="vreset">초기화 ${icon.refresh}</button>
          </div>
          <div class="vgrid2">${state.vitals.items.map((i) => vitalCell(i, values[i.k])).join('')}</div>
          <div class="vcard-foot"><button class="vtime-btn" data-act="time-sheet" aria-label="측정 시간 변경">${icon.alarmOutline}<span>${DEMO_DATE} <b>${v.time}</b></span>${icon.chevronRight}</button><span>${NURSE.label} (${NURSE.no})</span></div>
        </section>
        ${locked ? scanPatientButton() : stickyButton('저장하기', 'save')}
      </div>`;
  },
  mount(el) {
    if (!state.work.vital.scan.patient) {
      el.querySelectorAll('.vcard input, .vcard button').forEach((b) => (b.disabled = true));
      return;
    }
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
      if (!state.work.vital.scan.patient) return toast('환자 팔찌 스캔 후 음성간호메모를 진행할 수 있습니다.');
      state.voice.origin = 'vital';
      go('voice', { step: 'record' });
    },
    'patient-detail': () => go('detail'),
    'prn-info': () => openMedDialog('prn'),
    'scan-patient': () => handleWorkScan('vital', PATIENT.barcode),
    'scan-sim-patient': () => openSim('vital'),
    'time-sheet': () => openVitalTime(),
    // 사진 입력: 환자 모니터를 찍으면 인식한 값이 입력 칸에 채워짐 (팔찌 스캔 없이, 이 환자)
    vphoto: () => startCamera({ pid: state.pid, shoot: 'fill' }),
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
    // 빈 칸이 있어도 저장 (2026-11-23): 입력한 항목만 기록, 하나도 없으면 안내.
    // 저장 전 입력값 확인 팝업 (2026-11-27 요청): 빈 칸이 있으면 안내 문구를 더해 한 번 확인받고 저장.
    save: () => {
      const values = vitalValues();
      const has = (k) => String(values[k] ?? '').trim();
      const filled = state.vitals.items.filter((i) => has(i.k));
      const empty = state.vitals.items.filter((i) => !has(i.k));
      if (!filled.length) return toast('측정값을 1개 이상 입력해 주세요.');
      openVitalConfirm(filled, empty);
    },
  },
  onBack: () => {
    confirmReset('hub');
    return true;
  },
  onScan: (code) => handleWorkScan('vital', code),
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
          : kind === 'vital' && state.work.vital.saved
            ? { img: 'check-green', title: '수행 완료', desc: vitalSavedDesc(state.work.vital.saved) }
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

const vitalSavedDesc = ({ n, empty }) =>
  `활력징후 ${n}개 항목이 EMR 임상관찰기록에\n실시간 전송되었습니다.${empty.length ? `\n미입력 : ${empty.join(', ')}` : ''}`;

/**
 * 확인 → 환자허브에서 환자를 골라 시작한 업무는 환자허브 (그때의 페이지), 업무 메뉴 · 퀵메뉴 · 스캔으로 시작한 업무는
 * 그 업무의 바코드 스캔 안내 화면.
 */
export function toWorkScan(kind) {
  resetWork();
  state.work.vital.saved = null;
  if (state.origin === 'hub') return backTo('hub');
  // 투약/채혈/수혈 통합 업무 (2026-11-27 요청): 한 건을 마치면 그 환자의 남은 업무 카드 목록으로 돌아간다.
  if (state.origin === 'care3') return backTo('care3');
  backTo(kind === 'vital' ? 'vital' : 'wtask', { kind });
  replace('wscan', { kind }, 'fade');
}

/* ---------------- 투약/채혈/수혈 통합 업무 (업무 메뉴 '투약/채혈/수혈' → 환자 팔찌 → 업무 카드별로 수행) ---------------- */
const CARE_TASKS = ['med', 'bld', 'trf'];
const careAllDone = () => CARE_TASKS.every((k) => !taskStatus(k).ok);

function careRow(k) {
  const m = MENU_ITEM[k];
  const st = taskStatus(k);
  return `
    <button class="opt task-opt${st.ok ? '' : ' off'}" data-act="${st.ok ? 'care-task' : 'care-none'}" data-k="${k}"${st.ok ? '' : ' aria-disabled="true"'}>
      <img class="ico3d${m.icon.startsWith('sc-') ? '' : ' tile'}" src="${asset3d(m.icon)}" alt="">
      <span class="lbl">${esc(m.label)}</span>
      <span class="task-st ${st.tone}">${esc(st.label)}</span>
      <span class="chev">${st.ok ? icon.chevronRight : ''}</span>
    </button>`;
}

/** 지금 환자의 처방 · 채혈관 · 혈액(번호/제제) 중 어느 라벨인지 (업무 카드 없이 바로 스캔으로 진행할 때 쓰임). */
function careOwnKind(c) {
  if (state.orders.some((o) => o.code === c)) return 'med';
  if (state.work.bld.orders.some((o) => o.code === c || o.specimen === c)) return 'bld';
  if (state.work.trf.orders.some((o) => o.code === c) || trfUnits().some((x) => x.unit === c)) return 'trf';
  return null;
}

/**
 * 환자 팔찌로 이 환자를 확인(업무 카드 중 하나를 눌러 그 업무를 시작), 또는 환자 확인 후라면
 * 처방 · 채혈관 · 혈액 바코드로 업무 카드 없이 바로 그 업무를 시작한다 (2026-11-27 요청).
 */
function handleCareScan(code) {
  const c = String(code).trim().toUpperCase();
  if (!c || c === '#FAIL') return openMedDialog('fail');
  const p = patientByCode(c);
  if (p) {
    if (state.care3Scanned && p.id === state.pid) return toast('이미 확인된 환자입니다.');
    selectPatient(p.id);
    state.care3Scanned = true;
    return rerender();
  }
  if (!state.care3Scanned) {
    // 팔찌가 아닌 라벨: 지금 환자로 보고 잠금 해제 (다른 화면들처럼 데모가 항상 진행되도록)
    selectPatient(state.pid);
    state.care3Scanned = true;
    return rerender();
  }
  const kind = careOwnKind(c);
  if (!kind) return toast('인식할 수 있는 처방·채혈관·혈액 바코드가 아닙니다.');
  if (!taskStatus(kind).ok) return openNoOrders(kind);
  if (kind === 'med') {
    state.origin = 'care3';
    state.scan = { patient: true, drug: false }; // 환자는 care3에서 이미 확인됨 — '처방 우선 스캔' 경고를 띄우지 않음
    return handleMedScan(c);
  }
  if (kind === 'bld') {
    // 채혈은 혼자서는 환자 확인이 먼저 있어야 라벨을 받으므로, 카드를 누른 것처럼 화면을 먼저 열고 이 채혈관을 바로 등록한다
    startWork('bld', state.pid);
    state.origin = 'care3';
    state.work.bld.scan.patient = true;
    return handleWorkScan('bld', c);
  }
  // trf: 환자는 care3에서 이미 확인됨 — '환자 스캔' 경고 없이 혈액 라벨만으로 목록이 바로 열림
  state.origin = 'care3';
  state.work.trf.scan.patient = true;
  return handleWorkScan(kind, c);
}

/** 업무 카드 없이 '스캔하기'를 눌렀을 때 PDA가 읽을 다음 라벨: 투약 > 채혈 > 수혈 순으로 아직 할 수 있는 업무의 대표 코드. */
function careDefaultCode() {
  if (taskStatus('med').ok) {
    const o = state.orders.find((x) => x.now && !x.prn) || state.orders[0];
    if (o) return o.code;
  }
  if (taskStatus('bld').ok) {
    const t = tubeSims()[0];
    if (t) return t.code;
  }
  if (taskStatus('trf').ok) {
    const u = trfUnits()[0];
    if (u) return u.unit;
  }
  return PATIENT.barcode;
}

/** 스캔 시뮬레이션(길게 누르기): 팔찌 + 아직 할 수 있는 업무마다 대표 라벨 하나씩. */
function careSims() {
  const items = [...patientSims()];
  if (taskStatus('med').ok) {
    const o = state.orders.find((x) => x.now && !x.prn) || state.orders[0];
    if (o) items.push({ label: `처방 바코드 · ${o.name}`, code: o.code });
  }
  if (taskStatus('bld').ok) {
    const t = tubeSims()[0];
    if (t) items.push(t);
  }
  if (taskStatus('trf').ok) {
    const b = productSim();
    if (b) items.push(b);
    const u = trfUnits()[0];
    if (u) items.push({ label: `혈액번호 · ${u.unit}`, code: u.unit });
  }
  items.push(FAIL_SIM);
  return items;
}

/**
 * '투약/채혈/수혈' 진입점. `pid` 없이(메뉴·퀵메뉴) 들어오면 팔찌 스캔부터, 끝나면 환자허브 긴급 탭으로 돌아간다.
 * `pid`로(MY환자 업무 선택 시트) 들어오면 그 환자가 미리 선택된 채(여전히 팔찌 스캔은 다시 거침) 시작하고,
 * 끝나면 환자허브(원래 있던 MY환자 탭)로 돌아간다.
 * `scanned: true`(스캔 화면에서 팔찌를 이미 읽고 들어온 경우, quick.js)면 카드 목록이 바로 열리고,
 * 업무 카드를 골라도 그 업무에서 다시 팔찌를 묻지 않는다(`carePassthrough`).
 */
export function startCare3(pid, { scanned = false } = {}) {
  if (pid) selectPatient(pid);
  state.care3Scanned = scanned;
  state.carePassthrough = scanned;
  state.origin = 'care3';
  go('care3', { pid: pid || null });
}

register('care3', {
  bg: 'screen',
  render: () => {
    const hdr = header({ title: '투약/채혈/수혈', left: 'back', right: 'menu' });
    const prn = state.orders.some((o) => o.prn);
    if (!state.care3Scanned) {
      return `${hdr}${resetBar()}
        <div class="screen-body scroll task-w task-lock">
          <div class="task-top">${aiButton()}${patientCard({ prn, locked: true })}</div>
          ${lockHint('이어서 투약·채혈·수혈 중 수행할 업무를 고릅니다.')}
          <div class="medlist wlist">
            <div class="medlist-head"><span class="l"><span class="medlist-title gtext">업무 선택</span></span></div>
            <div class="sheet-list task-list">${CARE_TASKS.map(careRow).join('')}</div>
          </div>
          ${scanPatientButton()}
        </div>`;
    }
    if (careAllDone()) {
      return `${hdr}
        <div class="screen-body center-status">
          ${patientLine()}
          <span class="spacer" style="flex-grow: 204"></span>
          ${statusBlock({ img: 'check-blue', title: '업무 완료', desc: '투약·채혈·수혈 업무가 모두 처리되었습니다.' })}
          <span class="spacer" style="flex-grow: 263"></span>
        </div>
        <div class="screen-foot">${button('확인', 'care-done')}</div>`;
    }
    return `${hdr}${resetBar()}
      <div class="screen-body scroll task-w">
        <div class="task-top">${aiButton()}${patientCard({ prn, confirmed: true })}</div>
        <div class="medlist wlist">
          <div class="medlist-head"><span class="l"><span class="medlist-title gtext">업무 선택</span></span></div>
          <div class="sheet-list task-list">${CARE_TASKS.map(careRow).join('')}</div>
        </div>
        <div class="sticky-foot">${button('스캔하기', 'scan', { long: 'scan-sim' })}</div>
      </div>`;
  },
  actions: {
    'hdr-back': () => confirmReset('hub'),
    'hdr-menu': () => confirmReset('menu'),
    'reset-scan': () => confirmReset('hub'),
    'patient-detail': () => go('detail'),
    'prn-info': () => openMedDialog('prn'),
    'scan-patient': () => handleCareScan(PATIENT.barcode),
    'scan-sim-patient': () => openScanSim([...patientSims(), FAIL_SIM], handleCareScan),
    // 업무 카드 없이 바로 스캔(처방·채혈관·혈액): 환자 확인 후에만 보이는 버튼
    scan: () => handleCareScan(careDefaultCode()),
    'scan-sim': () => openScanSim(careSims(), handleCareScan),
    'care-task': (t) => {
      const k = t.dataset.k;
      // 스캔 화면에서 이미 읽은 팔찌로 들어왔으면, 업무를 골라도 그 팔찌로 바로 스캔한 것처럼 처리(다시 묻지 않음)
      if (state.carePassthrough) {
        const code = PATIENT.barcode;
        state.origin = 'care3';
        if (k === 'med') return handleMedScan(code);
        return handleWorkScan(k, code);
      }
      if (k === 'med') {
        resetPatient();
        state.origin = 'care3';
        go('task');
        return;
      }
      // startWork()가 pid를 주면 state.origin을 'hub'로 세팅하므로, 그 다음에 'care3'로 덮어써야 한다
      startWork(k, state.pid);
      state.origin = 'care3';
    },
    'care-none': (t) => {
      const st = taskStatus(t.dataset.k);
      toast(st.tone === 'done' ? `금일 ${TASK_LABEL[t.dataset.k]}이 모두 완료되었습니다.` : `${TASK_LABEL[t.dataset.k]} 오더가 없습니다.`);
    },
    'care-done': (t, { pid } = {}) => {
      if (!pid) state.hubTab = 'urgent'; // 메뉴로 시작했으면 긴급 탭으로, MY환자로 시작했으면 있던 탭 그대로
      backTo('hub');
    },
  },
  onBack: () => {
    confirmReset('hub');
    return true;
  },
  onScan: (code) => handleCareScan(code),
});
