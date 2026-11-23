// Medication administration flow (SSol design): common-scan-01 → neo-med-task-01 → neo-med-check-01~03 (고위험약물
// 1차/2차 인증) → common-done-01. 환자 팔찌 → 환자정보 확인 (투약 목록은 아직 흐림 + '투약 바코드 스캔' 안내)
// → 투약 바코드 → 투약 목록 활성화 (고위험약물이면 1차 인증). A patient chosen beforehand (긴급 카드 · MY환자 ·
// AI 커맨드바) opens their list first, locked until the wristband scan.
// Errors and confirmations are popups over the current screen: common-error-01/02, neo-med-error-03, neo-med-prn-01.
// Six sample patients: a wristband selects that patient; a prescription names its own patient (처방 우선 스캔), and a
// wristband/prescription of two different patients is 환자/처방 불일치.
import { register, go, replace, backTo, rerender } from '../router.js';
import {
  header, button, aiButton, statusBlock, patientCard, patientLine, medList, badge, esc, toast, openSheet, closeSheet, openDialog, asset3d,
} from '../ui.js';
import { icon } from '../icons.js';
import { patientTitle, PATIENT, NURSE, NURSE2, TIME_SLOTS, STATUS_OPTIONS, HAM_CHECKS, TRF_CHECKS, bloodType } from '../data.js';
import { PATIENTS, patientByCode, fullName } from '../patients.js';
import {
  state, resetPatient, resetWork, newHamCheck, commitAdministration, highAlertOrders, pendingOrders, excludedOrders, selectPatient, TASK_LABEL,
  trfUnits, trfNext,
} from '../state.js';
import { closeSwipes } from '../swipe.js';
import { feedback } from '../feedback.js';
import { startBag } from './transfuse.js';

/* ---------------- scan simulation ---------------- */
export const FAIL_SIM = { label: '인식 실패 (손상된 바코드)', code: '#FAIL' };
/** One wristband per sample patient (the PDA scan button reads the selected one). */
export const patientSims = () => PATIENTS.map((p) => ({ label: `환자 바코드 · ${fullName(p)}`, code: p.barcode }));
const firstOrder = (id = state.pid) => state.pt[id].orders.find((o) => o.now && !o.prn) || state.pt[id].orders[0];
const drugSim = (id = state.pid) => ({ label: `처방 바코드 · ${firstOrder(id).name}`, code: firstOrder(id).code });
/** A real prescription of the next patient — scanning it here is 환자/처방 불일치. */
function otherDrugSim() {
  const other = PATIENTS[(PATIENTS.findIndex((p) => p.id === state.pid) + 1) % PATIENTS.length];
  return { label: `다른 환자의 처방 바코드 · ${other.name}`, code: firstOrder(other.id).code };
}

/** Which patient a prescription barcode belongs to. */
const drugOwner = (c) => PATIENTS.find((p) => state.pt[p.id].orders.some((o) => o.code === c))?.id;

/** Applies a scan to the medication flow (hardware wedge or simulated). */
export function handleMedScan(code) {
  const c = String(code).trim().toUpperCase();
  if (!c || c === '#FAIL') return openMedDialog('fail');
  const p = patientByCode(c);
  if (p) return scanPatient(p.id);
  const owner = drugOwner(c);
  if (owner) return scanDrug(owner);
  if (/^D\d+/.test(c)) return openMedDialog('mismatch');
  // Any other real barcode: fill the next missing step so the demo always moves forward.
  return state.scan.patient ? scanDrug(state.pid) : scanPatient(state.pid);
}

/** A patient's 투약 screen is open (chosen beforehand, or after the wristband). */
const onTaskScreen = () => !!document.querySelector('.scr-task');

function scanPatient(id) {
  // 처방 우선 스캔: the wristband must be the prescription's patient
  if (state.scan.drug && !state.scan.patient && id !== state.pid) return openMedDialog('mismatch');
  // a patient's 투약 screen is open: another wristband is asked about, not taken silently
  if (onTaskScreen() && id !== state.pid) return askOtherPatient(id);
  if (state.scan.patient && id === state.pid) return toast('이미 확인된 환자입니다.');
  selectPatient(id); // 바코드 스캔 화면: 다른 환자 스캔 → (안내 없이) 덮어쓰기
  if (!state.orders.some((o) => o.now)) return openNoOrders('med');
  // 팔찌 = 환자정보 확인; 투약 목록은 투약 바코드를 스캔해야 활성화 (처방을 먼저 찍었으면 바로 활성화)
  state.scan.patient = true;
  showMedTask();
}

function askOtherPatient(id) {
  const p = PATIENTS.find((x) => x.id === id);
  openDialog(
    {
      title: '환자 불일치',
      desc: `선택한 환자(${patientTitle()})와\n스캔한 팔찌(${fullName(p)})가 다릅니다.\n환자를 다시 확인해 주세요.`,
      buttons: [{ label: '다시 스캔', act: 'cancel', line: true }, { label: `${p.name}(으)로 변경`, act: 'ok' }],
    },
    {
      cancel: () => closeSheet(),
      ok: () => {
        closeSheet();
        selectPatient(id);
        if (!state.orders.some((o) => o.now)) return openNoOrders('med');
        state.scan = { patient: true, drug: false };
        showMedTask();
      },
    },
  );
}

function scanDrug(owner) {
  if ((state.scan.patient || onTaskScreen()) && owner !== state.pid) return openMedDialog('mismatch');
  selectPatient(owner); // the prescription names its patient
  if (state.scan.drug) return toast('이미 확인된 처방입니다.');
  state.scan.drug = true; // 환자 확인 후면 투약 목록 활성화, 처방 먼저면 팔찌 스캔 경고
  showMedTask();
}

function showMedTask() {
  const onTask = document.querySelector('.scr-task');
  if (onTask) rerender();
  else replace('task', {}, 'fade');
  // 고위험약물 스캔 시 - 즉시 활성화: once patient and prescription are both confirmed
  if (state.scan.patient && state.scan.drug && hamPending()) {
    state.ham = newHamCheck();
    startCheck('med');
  }
}

const hamPending = () => highAlertOrders().length > 0 && !state.ham?.done;

/* ---------------- popups ---------------- */
const PRN_GUIDE = [
  ['통증조절', '타이레놀, NSAIDs, 진통제'],
  ['발열조절', '해열진통제, 해열주사'],
  ['소화조절', '진토제, 제산제'],
  ['수면불안', '수면유도제, 항불안제'],
  ['혈압혈당', '혈압강하제, 속효성 인슐린'],
];

/**
 * common-error-01 · neo-med-error-03 · neo-med-prn-01 · common-error-02 (reset) · neo-med/trf-check-02 (second)
 * opts.then: where 'reset' lands ('hub' | 'menu') · opts.check: which double check 'second' belongs to ('med' | 'trf')
 */
export function openMedDialog(kind, { then = 'hub', check = 'med' } = {}) {
  const ok = { ok: () => closeSheet() };
  if (kind === 'fail') {
    return openDialog({ title: '바코드 인식 불가', desc: '바코드를 인식하지 못했습니다.\n문제가 지속될 경우 관리자에게 문의해 주세요.' }, ok);
  }
  if (kind === 'mismatch') {
    return openDialog({ title: '환자/처방 불일치', desc: '환자와 처방이 일치하지 않습니다.\n환자 및 처방 바코드를 다시 확인해 주세요.' }, ok);
  }
  if (kind === 'prn') {
    const rows = PRN_GUIDE.map(([k, v]) => `<div class="prn-row"><span class="k">${k}</span><span>${v}</span></div>`).join('');
    return openDialog(
      { title: 'PRN 처방', tone: 'info', cls: 'prn', desc: '특정 증상, 이상 수치 발생 시 처방합니다.\n중복/과다 투여에 주의해주세요.', body: `<div class="prn-box">${rows}</div>` },
      ok,
    );
  }
  if (kind === 'second') {
    const c = CHECK[check];
    return openDialog(
      { ...c.pop, buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '확인', act: 'ok' }] },
      {
        // 취소 → 목록 (수행하기 비활성화)
        cancel: () => (closeSheet(), backTo(c.back)),
        // the PDA would now wait for the 2nd nurse's RFID badge; 확인 stands in for that tag on the prototype
        ok: () => (closeSheet(), secondNurseTagged(check)),
      },
    );
  }
  // reset: 뒤로가기 / 메뉴 during 투약 → 환자정보 초기화
  return openDialog(
    {
      title: '환자정보 초기화',
      desc: '이전 단계로 돌아가면 환자정보가 초기화됩니다.\n계속 진행하시겠습니까?',
      buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '확인', act: 'ok' }],
    },
    {
      cancel: () => closeSheet(),
      ok: () => {
        closeSheet();
        resetPatient();
        resetWork();
        state.hubTab = 'urgent';
        backTo('hub');
        // 햄버거 아이콘 → 햄버거메뉴
        if (then === 'menu') go('navmenu');
      },
    },
  );
}

export const confirmReset = (then) => openMedDialog('reset', { then });

/**
 * The scanned patient has nothing to do in this menu: no order at all, or today's work is already done.
 * `menu` = med | bld | trf.
 */
export function openNoOrders(menu) {
  const label = TASK_LABEL[menu];
  const s = state.pt[state.pid];
  const done = s.done[menu] || (menu === 'med' && s.orders.length);
  openDialog(
    {
      title: done ? `${label} 완료` : '수행할 오더 없음',
      desc: done
        ? `${PATIENT.name} 환자의 금일 ${label}이 모두 완료되었습니다.\n환자 및 업무를 다시 확인해 주세요.`
        : `${PATIENT.name} 환자에게 ${label} 오더가 없습니다.\n환자 및 업무를 다시 확인해 주세요.`,
    },
    { ok: () => closeSheet() },
  );
}

/** Long-press on a scan button: pick the barcode the PDA would read. `items` = [{ label, code }]. */
export function openScanSim(items, onPick) {
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">스캔 시뮬레이션</p>${badge('데모', 'count-grad')}</div>
     <p class="sheet-hint">PDA 스캐너가 없을 때 아래 바코드로 스캔을 대신합니다.</p>
     <div class="sheet-list sim-list">${items
       .map((it, i) => `<button class="opt" data-sheet-act="sim" data-i="${i}"><span class="lbl">${esc(it.label)}</span><span class="chev">${icon.chevronRight}</span></button>`)
       .join('')}</div>`,
    {
      sim: (t) => {
        closeSheet();
        feedback('scan'); // the simulated barcode is read like the laser's
        onPick(items[+t.dataset.i].code);
      },
    },
  );
}

/* ---------------- 투약하기 · 바코드 스캔 ---------------- */
register('scan', {
  bg: 'screen',
  render: () => `
    ${header({ title: '투약하기', left: 'back', right: 'menu' })}
    <div class="screen-body center-status">
      <span class="spacer" style="flex-grow: 206"></span>
      ${statusBlock({ img: 'scan', title: '바코드 스캔', desc: '환자 또는 처방 정보의 RFID 바코드를\nPDA 레이저로 스캔하세요.' })}
      <span class="spacer" style="flex-grow: 261"></span>
    </div>
    <div class="screen-foot">${button('스캔하기', 'scan', { long: 'scan-sim' })}</div>`,
  actions: {
    // 뒤로가기 → 환자허브, after the 환자정보 초기화 popup
    'hdr-back': () => confirmReset('hub'),
    'hdr-menu': () => confirmReset('menu'),
    // the selected patient's wristband (긴급 처리 업무 · MY환자 에서 고른 환자, 메뉴에서 시작하면 김철수)
    scan: () => handleMedScan(PATIENT.barcode),
    'scan-sim': () => openScanSim([...patientSims(), drugSim(), FAIL_SIM], handleMedScan),
  },
  onBack: () => {
    confirmReset('hub');
    return true;
  },
  onScan: handleMedScan,
});

/* ---------------- 투약 업무 (task) ---------------- */
const hasPrn = () => state.orders.some((o) => o.prn);

register('task', {
  bg: 'screen',
  render: () => {
    const { patient, drug } = state.scan;
    const hdr = header({ title: '투약하기', left: 'back', right: 'menu' });
    if (!patient && !drug) {
      // a chosen patient: their 투약 list first, locked until the wristband is scanned
      return `${hdr}
        <div class="screen-body scroll task-d task-lock">
          <div class="task-top">${aiButton()}${patientCard({ prn: hasPrn(), locked: true })}</div>
          <p class="tube-hint lock-hint">${icon.error}<span>환자 팔찌를 스캔하면 환자정보가 활성화됩니다. 이어서 투약 바코드를 스캔하면 투약 목록이 활성화됩니다.</span></p>
          ${medList()}
          <div class="sticky-foot">${button('환자 팔찌 스캔', 'scan-patient', { long: 'scan-sim-lock' })}</div>
        </div>`;
    }
    if (patient && !drug) {
      // 환자 확인 완료: the 투약 list stays dim until a 투약 바코드 is scanned
      return `${hdr}
        <div class="screen-body scroll task-d task-lock task-drug">
          <div class="task-top">${aiButton()}${patientCard({ prn: hasPrn(), confirmed: true })}</div>
          <div class="drug-scan">
            <img src="${asset3d('scan')}" alt="">
            <div><p class="drug-scan-t gtext">투약 바코드 스캔</p><p class="drug-scan-d">투약할 약의 바코드를 PDA 레이저로 스캔하세요.<br>스캔하면 투약 목록이 활성화됩니다.</p></div>
          </div>
          ${medList()}
          <div class="sticky-foot">${button('투약 바코드 스캔', 'scan-drug', { long: 'scan-sim-drug' })}</div>
        </div>`;
    }
    if (drug && !patient) {
      // the prescription already names the patient; the wristband scan is still missing
      return `${hdr}
        <div class="screen-body scroll task-d">
          <div class="task-top">${aiButton()}${patientCard({ prn: hasPrn(), scanWarn: true })}</div>
          ${medList()}
          <div class="sticky-foot">${button('환자정보 스캔하기', 'scan-patient')}</div>
        </div>`;
    }
    return `${hdr}
      <div class="screen-body scroll task-b">
        <div class="task-top">${aiButton()}${patientCard({ prn: hasPrn(), confirmed: true })}</div>
        ${medList({ interactive: true })}
        <div class="sticky-foot${hamPending() ? ' ham-pending' : ''}">${button('투약수행', 'administer', { cta: true })}</div>
      </div>`;
  },
  actions: {
    'hdr-back': () => confirmReset('hub'),
    'hdr-menu': () => confirmReset('menu'),
    voice: () => {
      if (!state.scan.patient) return toast('환자 팔찌 스캔 후 음성간호메모를 진행할 수 있습니다.');
      state.voice.origin = 'task';
      go('voice', { step: 'record' });
    },
    'prn-info': () => openMedDialog('prn'),
    'patient-detail': () => go('detail'),
    'scan-sim-lock': () => openScanSim([...patientSims(), drugSim(), otherDrugSim(), FAIL_SIM], handleMedScan),
    // 투약 바코드: the PDA scan button reads this patient's next 투약; long-press picks one (불일치 · 인식 실패 포함)
    'scan-drug': () => handleMedScan(firstOrder().code),
    'scan-sim-drug': () => openScanSim([drugSim(), otherDrugSim(), FAIL_SIM], handleMedScan),
    'scan-patient': () => handleMedScan(PATIENT.barcode),
    mode: (t) => {
      state.planMode = t.dataset.mode;
      rerender();
    },
    'time-sheet': (t) => openTimeSheet(t.dataset.id),
    'status-sheet': (t) => openStatusSheet(t.dataset.id),
    // 투약 리스트: 카드 왼쪽 스와이프 (또는 길게 누르기) → 삭제 · 취소
    excl: (t) => openExcludeSheet(t.dataset.id),
    'swipe-close': () => closeSwipes(),
    'excl-undo': (t) => undoExclude(t.dataset.id),
    administer: () => {
      const excl = excludedOrders().length;
      if (!pendingOrders().length) {
        if (!excl) return toast('투약할 처방이 없습니다.');
        return recordExclusionsOnly(excl);
      }
      // 2차 인증 미완료 시 → 고위험약물 인증 다시 활성화
      if (hamPending()) {
        toast('고위험약물 이중 인증을 먼저 완료해 주세요.');
        return startCheck('med');
      }
      commitAdministration();
      go('done');
      if (excl) toast(`제외한 ${excl}건은 미투약 사유로 기록되었습니다.`);
    },
  },
  onBack: () => {
    confirmReset('hub');
    return true;
  },
  onScan: handleMedScan,
});

/* ---------------- bottom sheets: 투약 시간 변경 / 투약 수행 변경 ---------------- */
const sheetDrug = (o) => `
  <div class="sheet-sub"><span class="sheet-drug">${esc(o.name)}</span><span class="badges">${badge(o.type)}${o.tags
    .filter((t) => t.kind)
    .map((t) => badge(t.t, t.kind))
    .join('')}</span></div>`;

const modeChip = () => `<span class="chip on"><span>${state.planMode === 'plan' ? '플랜' : '실시간'}</span></span>`;

function openTimeSheet(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o?.now || o.prn) return;
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">투약 시간 변경</p>${modeChip()}</div>
     ${sheetDrug(o)}
     <div class="sheet-list">${TIME_SLOTS.map(
       (t) => `<button class="opt${t === o.now.time ? ' sel' : ''}" data-sheet-act="pick" data-v="${t}"><span class="ico">${icon.alarmOutline}</span><span class="lbl">${t}</span><span class="chev">${icon.chevronRight}</span></button>`,
     ).join('')}</div>`,
    {
      pick: (t) => {
        o.now.time = t.dataset.v;
        markSelected(t);
        setTimeout(() => (closeSheet(), rerender()), 160);
      },
    },
  );
}

function openStatusSheet(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o?.now || o.prn) return;
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">투약 수행 변경</p>${modeChip()}</div>
     ${sheetDrug(o)}
     <div class="sheet-list">${STATUS_OPTIONS.map(
       (s) => `<button class="opt${s.code === o.now.st ? ` sel${s.code === 'Y' ? '' : ' red'}` : ''}" data-sheet-act="pick" data-v="${s.code}"><span class="ico">${icon.tagOutline}</span><span class="lbl">${s.label}</span><span class="chev">${icon.chevronRight}</span></button>`,
     ).join('')}</div>`,
    {
      pick: (t) => {
        o.now.st = t.dataset.v;
        // design: the current status stays dark while a non-투약 choice lights up red
        if (t.dataset.v === 'Y') markSelected(t);
        else t.classList.add('sel', 'red');
        setTimeout(() => (closeSheet(), rerender()), 220);
      },
    },
  );
}

/* ---------------- 투약 리스트 삭제 (요청): 이번 투약에서 제외 + 사유 ---------------- */
// The order itself is the doctor's, so nothing is erased: the dose leaves this round and is recorded as 미투약 with
// the reason's code when 투약수행 is pressed (R-거부 · N-금식 · H-보류 · NO-미투약). 되돌리기 puts it back.
const EXCL_REASONS = [
  { code: 'R', label: '환자 거부' },
  { code: 'N', label: '금식' },
  { code: 'NO', label: '환자 부재 (검사 · 수술)' },
  { code: 'H', label: '처방 보류 (의사 지시)' },
  { code: 'NO', label: '기타' },
];

function openExcludeSheet(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o?.now || o.prn) return;
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">투약 삭제</p></div>
     ${sheetDrug(o)}
     <p class="sheet-hint">이번 투약에서 제외합니다. 사유를 선택해 주세요.<br>투약수행 시 EMR에 미투약 사유로 기록됩니다.</p>
     <div class="sheet-list">${EXCL_REASONS.map(
       (r, i) => `<button class="opt" data-sheet-act="pick" data-i="${i}"><span class="ico">${icon.tagOutline}</span><span class="lbl">${r.code}-${esc(r.label)}</span><span class="chev">${icon.chevronRight}</span></button>`,
     ).join('')}</div>`,
    {
      pick: (t) => {
        const wasHam = hamPending();
        o.excl = { ...EXCL_REASONS[+t.dataset.i] };
        t.classList.add('sel', 'red');
        setTimeout(() => {
          closeSheet();
          rerender();
          toast(
            wasHam && !hamPending()
              ? '고위험약물이 제외되어 이중 인증 없이 투약할 수 있습니다.'
              : `이번 투약에서 제외했습니다. (${o.excl.code}-${o.excl.label})`,
          );
        }, 220);
      },
      dismiss: () => closeSwipes(),
    },
  );
}

function undoExclude(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o?.excl) return;
  o.excl = null;
  rerender();
  toast(o.ham && hamPending() ? '되돌렸습니다. 고위험약물 이중 인증이 다시 필요합니다.' : '투약 목록으로 되돌렸습니다.');
}

/** Every dose of this round was taken out: record them as 미투약 without a 투약. */
function recordExclusionsOnly(n) {
  openDialog(
    {
      title: '투약할 약이 없습니다',
      tone: 'info',
      desc: `모든 약이 이번 투약에서 제외되었습니다.
제외한 ${n}건을 미투약 사유로 EMR에 기록할까요?`,
      buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '기록', act: 'ok' }],
    },
    {
      cancel: () => closeSheet(),
      ok: () => {
        closeSheet();
        commitAdministration();
        toScan();
        toast(`제외한 ${n}건이 미투약 사유로 기록되었습니다.`);
      },
    },
  );
}

function markSelected(btn, red = false) {
  btn.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.remove('sel', 'red'));
  btn.classList.add('sel');
  if (red) btn.classList.add('red');
}

/* ---------------- 고위험 이중확인: neo-med-check-01~03 (약물) · neo-trf-check-01~03 (수혈) ---------------- */
const HAM_AT = { first: '2026-09-17 18:32', second: '2026-09-17 18:38' }; // demo clock
const nurseTag = (n) => `${n.label} ${n.no}`;
/** 수혈 이중 확인 is once per 항목, at its first bag: the next bag confirmed by its two barcodes (screenshots: the focused order's first bag). */
function trfBag() {
  const next = trfNext();
  if (next) return next;
  const o = state.work.trf.orders.find((x) => x.focus) || state.work.trf.orders[0];
  return { unit: o.units[0], o };
}

const CHECK = {
  med: {
    get: () => state.ham,
    set: (h) => (state.ham = h),
    checks: HAM_CHECKS,
    titles: { first: '고위험약물 1차 인증', second: '고위험약물 2차 인증' },
    desc: '환자 안전을 위해 간호사 2인 이상이\n환자/약품 정보를 확인해야 투약이 가능합니다.',
    head: '고위험 약물 이중 확인',
    item: () => {
      const o = highAlertOrders()[0] || state.orders.find((x) => x.ham);
      return {
        badge: o.tags.find((t) => t.kind === 'nar') ? badge('마약', 'nar') : '',
        html: `<p class="ham-drug">${esc(o.name)}</p><p class="med-date">${esc(o.date)}</p>`,
      };
    },
    bothOnSecond: false,
    pop: { title: '고위험약물 2차 인증', desc: '고위험약물 2차 담당자 확인을 시작합니다.\n사용자의 RFID 바코드를 스캔하세요.' },
    done: { title: '고위험약물 이중점검 완료', desc: '고위험약물 이중 인증이 완료되었습니다.\nEMR 정보에 투약 로그가 기록되었습니다.' },
    back: 'task',
  },
  trf: {
    // one double check per 항목 (수혈 오더): a check made for another 항목 does not count
    get: () => {
      const h = state.work.trf.ham;
      return h && (!h.oid || h.oid === trfBag().o.id) ? h : null;
    },
    set: (h) => (state.work.trf.ham = Object.assign(h, { oid: trfBag().o.id, unit: trfBag().unit })),
    checks: TRF_CHECKS,
    titles: { first: '수혈하기 1차 인증', second: '수혈하기 2차 인증' },
    desc: '환자 안전을 위해 간호사 2인 이상이\n환자/처방 정보를 확인해야 수혈이 가능합니다.',
    head: '고위험수행 이중 확인',
    item: () => {
      const { unit, o } = trfBag();
      const all = trfUnits();
      const seq = all.findIndex(({ unit: u }) => u === unit) + 1;
      return {
        badge: '',
        html: `<p class="ham-drug">${esc(o.name)}</p>
          <p class="ham-sub">혈액번호 : ${unit}${all.length > 1 ? `<i></i>${seq}/${all.length} 단위` : ''}</p>
          <p class="med-date"><b class="abo">혈액형 : ${bloodType(o)}</b>발행처 : ${o.issuer}<i></i>발행시간 : ${o.issued}</p>`,
      };
    },
    bothOnSecond: true, // neo-trf-check 2차 shows the confirmed 1차 담당자 above the 2차
    pop: { title: '고위험수행 이중 확인', desc: '고위험수행 2차 담당자 확인을 시작합니다.\n사용자의 RFID 바코드를 스캔하세요.' },
    done: { title: '고위험수행 이중 확인', desc: '고위험수행 이중 인증이 완료되었습니다.\nEMR 정보에 로그가 기록되었습니다.' },
    back: 'wtask',
  },
};

/** Starts (or resumes) a double check; `kind` = 'med' | 'trf'. */
export function startCheck(kind) {
  const c = CHECK[kind];
  if (!c.get()) c.set(newHamCheck(c.checks.length));
  go('ham', { step: c.get().at1 ? 'second' : 'first', kind });
}

function hamCard({ c, step, ham }) {
  const it = c.item();
  const head = `<div class="ham-card-head"><span>${c.head}</span>${it.badge}</div>${it.html}`;
  if (step === 'done') {
    const who = (k, n, at) => `
      <div class="ham-who"><span class="k">${k}</span><span class="at">${at}</span><span class="v">${esc(nurseTag(n))}</span></div>`;
    return `<div class="ham-card">${head}${who('1차 담당자', NURSE, ham.at1 || HAM_AT.first)}${who('2차 담당자', NURSE2, ham.at2 || HAM_AT.second)}</div>`;
  }
  const checks = step === 'first' ? ham.checks1 : ham.checks2;
  const nurseRow = (k, n, filled) => `<div class="ham-nurse${filled ? ' filled' : ''}"><span class="k">${k}</span><span class="v">${esc(nurseTag(n))}</span></div>`;
  const nurses =
    step === 'first'
      ? nurseRow('1차 담당자', NURSE)
      : `${c.bothOnSecond ? nurseRow('1차 담당자', NURSE, true) : ''}${nurseRow('2차 담당자', NURSE2)}`;
  const n = checks.filter(Boolean).length;
  const all = n === checks.length;
  return `
    <div class="ham-card">${head}
      <div class="ham-checks-head">
        <span class="ham-count">확인 항목 <b>${n}</b> / ${checks.length}</span>
        <button class="ham-all${all ? ' on' : ''}" data-act="check-all" aria-pressed="${all}"><span class="cb">${icon.check}</span><span>전체 확인</span></button>
      </div>
      <div class="ham-checks">${c.checks
        .map((t, i) => `<button class="ham-check${checks[i] ? ' on' : ''}" data-act="check" data-i="${i}"><span class="cb">${icon.check}</span><span>${esc(t)}</span></button>`)
        .join('')}</div>
      ${nurses}
    </div>`;
}

/** The 2nd nurse's RFID badge was read: open 2차 인증. */
function secondNurseTagged(kind = 'med') {
  const c = CHECK[kind];
  const ham = c.get() || c.set(newHamCheck(c.checks.length));
  ham.second = NURSE2.label;
  toast(`${NURSE2.label} RFID 태그가 확인되었습니다.`);
  replace('ham', { step: 'second', kind }, 'enter');
}

register('ham', {
  bg: 'screen',
  render: ({ step, kind = 'med' }) => {
    const c = CHECK[kind];
    const ham = c.get() || c.set(newHamCheck(c.checks.length));
    const hdr = header({ title: kind === 'trf' ? '수혈하기' : '투약하기', right: 'close' });
    if (step === 'done') {
      return `${hdr}
        <div class="screen-body scroll ham-done">
          <span class="spacer" style="flex-grow: 90"></span>
          ${statusBlock({ img: 'check-blue', title: c.done.title, desc: c.done.desc })}
          ${hamCard({ c, step, ham })}
          <span class="spacer" style="flex-grow: 94"></span>
        </div>
        <div class="screen-foot">${button('확인', 'next')}</div>`;
    }
    return `${hdr}
      <div class="screen-body scroll ham-step">
        <div class="ham-hero">
          <img src="${asset3d('warning-red')}" alt="">
          <h2 class="status-title gtext">${c.titles[step]}</h2>
          <p class="status-desc">${esc(c.desc)}</p>
        </div>
        ${patientCard({ act: '', prn: kind === 'trf' || hasPrn() })}
        ${hamCard({ c, step, ham })}
      </div>
      <div class="screen-foot">${button('확인', 'next')}</div>`;
  },
  actions: {
    'hdr-close': (t, { kind = 'med' }) => backTo(CHECK[kind].back),
    next: (t, { step, kind = 'med' }) => {
      const c = CHECK[kind];
      const ham = c.get();
      if (step === 'done') {
        ham.done = true;
        // 수혈: 이중 확인 완료 → 수혈 시작 기록 → '수혈 시작' 완료 화면, 투약: back to the list
        if (kind === 'trf') {
          state.work.trf.checked[ham.oid || trfBag().o.id] = true; // its later bags: 혈액번호 only
          return startBag();
        }
        return backTo(c.back);
      }
      const checks = step === 'first' ? ham.checks1 : ham.checks2;
      if (!checks.every(Boolean)) return nudgeChecks();
      if (step === 'first') {
        ham.at1 = HAM_AT.first;
        return openMedDialog('second', { check: kind });
      }
      ham.at2 = HAM_AT.second;
      replace('ham', { step: 'done', kind }, 'fade');
    },
    check: (t, { step, kind = 'med' }) => {
      const ham = CHECK[kind].get();
      const arr = step === 'first' ? ham.checks1 : ham.checks2;
      arr[+t.dataset.i] = !arr[+t.dataset.i];
      rerender();
    },
    // 전체 확인: checks every item at once (all checked → clears them)
    'check-all': (t, { step, kind = 'med' }) => {
      const ham = CHECK[kind].get();
      const arr = step === 'first' ? ham.checks1 : ham.checks2;
      arr.fill(!arr.every(Boolean));
      rerender();
    },
  },
  onBack: ({ kind = 'med' }) => {
    backTo(CHECK[kind].back);
    return true;
  },
  // neo-med/trf-check-02 is waiting for the 2nd nurse's RFID badge
  onScan: (code, { step, kind = 'med' }) => {
    if (step !== 'first') return;
    const ham = CHECK[kind].get();
    if (!ham.checks1.every(Boolean) || !ham.at1) return toast('1차 확인 항목을 먼저 모두 체크해 주세요.');
    secondNurseTagged(kind);
  },
});

function nudgeChecks() {
  toast('확인 항목을 모두 체크해 주세요.');
  document.querySelectorAll('.ham-check:not(.on)').forEach((el) => {
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
  });
}

/* ---------------- 투약 수행 완료 ---------------- */
register('done', {
  bg: 'screen',
  render: () => `
    ${header({ title: '투약하기' })}
    <div class="screen-body center-status">
      ${patientLine()}
      <span class="spacer" style="flex-grow: 204"></span>
      ${statusBlock({ img: 'check-blue', title: '수행 완료', desc: '환자 및 처방 바코드 교차 검증 후\nEMR 시스템에 실시간 전송되었습니다.' })}
      <span class="spacer" style="flex-grow: 263"></span>
    </div>
    <div class="screen-foot">${button('확인', 'ok')}</div>`,
  actions: {
    ok: () => toScan(),
  },
  onBack: () => {
    toScan();
    return true;
  },
});

/**
 * 확인 → 환자허브에서 환자를 골라 시작했으면 환자허브, 업무 메뉴로 시작했으면 투약하기 바코드 스캔 안내 화면
 * (the administered doses stay in the history).
 */
function toScan() {
  resetPatient();
  if (state.origin === 'hub') return backTo('hub');
  backTo('task');
  replace('scan', {}, 'fade');
}

