// 환자 팔찌 스캔 확인: 음성메모 · 사진 촬영 · 사진첨부 start without a patient (AI 커맨드바 +).
// When the recording / photo is done, this popup asks for the wristband of the patient it belongs to.
// The PDA scanner (main.js) and the popup's 스캔하기 button both answer it; a long press on 스캔하기
// picks one of the six sample wristbands (demo).
import { openDialog, openSheet, closeSheet, asset3d, toast, esc, badge } from './ui.js';
import { feedback } from './feedback.js';
import { icon } from './icons.js';
import { PATIENTS, DEFAULT_PID, patientByCode, patientById, fullName } from './patients.js';

let pending = null; // { desc, onPatient(pid), onCancel() }

/** Opens the popup; `onPatient(pid)` runs once a wristband is read. */
export function askPatient(opts) {
  pending = opts;
  showPrompt();
}

export const patientPending = () => !!pending;

function showPrompt() {
  if (!pending) return;
  openDialog(
    {
      title: '환자 팔찌 스캔',
      tone: 'info',
      cls: 'pscan',
      desc: pending.desc,
      body: `<img class="pscan-ico" src="${asset3d('scan')}" alt="">`,
      buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '스캔하기', act: 'scan' }],
    },
    {
      cancel: () => cancelPatientScan(),
      // the PDA scan button reads the demo patient's wristband (김철수)
      scan: () => takePatientScan(patientById(DEFAULT_PID).barcode),
    },
  );
  const btn = document.querySelector('.dlg.pscan [data-sheet-act="scan"]');
  let timer = null;
  btn?.addEventListener('pointerdown', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      feedback('long');
      swallowNextClick();
      openPatientSim();
    }, 550);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn?.addEventListener(ev, () => clearTimeout(timer)));
}

/** After a long press the release must not also count as a tap on whatever opens underneath. */
function swallowNextClick() {
  const stop = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 500);
}

function openPatientSim() {
  const items = [...PATIENTS.map((p) => ({ label: `환자 바코드 · ${fullName(p)}`, code: p.barcode })), { label: '인식 실패 (손상된 바코드)', code: '#FAIL' }];
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">스캔 시뮬레이션</p>${badge('데모', 'count-grad')}</div>
     <p class="sheet-hint">PDA 스캐너가 없을 때 아래 팔찌 바코드로 스캔을 대신합니다.</p>
     <div class="sheet-list sim-list">${items
       .map((it, i) => `<button class="opt" data-sheet-act="sim" data-i="${i}"><span class="lbl">${esc(it.label)}</span><span class="chev">${icon.chevronRight}</span></button>`)
       .join('')}</div>`,
    {
      sim: (t) => takePatientScan(items[+t.dataset.i].code),
      dismiss: () => showPrompt(), // back to the question
    },
  );
}

/** A scan while the popup waits: returns true when it was consumed here. */
export function takePatientScan(code) {
  if (!pending) return false;
  const c = String(code).trim().toUpperCase();
  let p = patientByCode(c);
  if (!p) {
    const bad = !c || c === '#FAIL';
    // a prescription / 채혈관 / 혈액 label is not a wristband; any other label stands for the demo patient
    if (bad || /^[DBT]\d/.test(c)) {
      toast(bad ? '바코드를 인식하지 못했습니다. 다시 스캔해 주세요.' : '환자 팔찌 바코드를 스캔해 주세요.');
      if (!document.querySelector('.dlg.pscan')) showPrompt();
      return true;
    }
    p = patientById(DEFAULT_PID);
  }
  const { onPatient } = pending;
  pending = null;
  closeSheet(true);
  toast(`${fullName(p)} 환자가 확인되었습니다.`);
  onPatient(p.id);
  return true;
}

/** 취소 / 뒤로가기: drops the question. */
export function cancelPatientScan() {
  const p = pending;
  pending = null;
  closeSheet();
  p?.onCancel?.();
}
