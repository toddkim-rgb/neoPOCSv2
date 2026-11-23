// 스캔 (AI 커맨드바 + → 스캔): a scan-ready screen for any barcode (기획: 퀵 스캔 > 환자 OR 처방 > 수행업무).
//   환자 팔찌 → that patient's 업무 선택 시트; the chosen task opens with the wristband already confirmed
//   처방 → 투약하기 · 혈액 제제 → 수혈하기 (처방 우선: the list asks for the wristband)
//   채혈관 → 채혈하기 (patient first, so it asks for the wristband)
import { register, go, pop, replace } from '../router.js';
import { header, button, statusBlock } from '../ui.js';
import { PATIENTS, DEFAULT_PID, patientByCode, patientById } from '../patients.js';
import { state, resetPatient, resetWork, selectPatient } from '../state.js';
import { handleMedScan, openMedDialog, openScanSim, patientSims, FAIL_SIM } from './med.js';
import { handleWorkScan } from './work.js';
import { openTaskSheet } from './hub.js';

/** Which work a non-wristband barcode belongs to: { kind: med | bld | trf, pid }. */
function labelOwner(c) {
  for (const p of PATIENTS) {
    const s = state.pt[p.id];
    if (s.orders.some((o) => o.code === c)) return { kind: 'med', pid: p.id };
    if (s.work.bld.orders.some((o) => o.code === c || o.specimen === c)) return { kind: 'bld', pid: p.id };
    if (s.work.trf.orders.some((o) => o.code === c || o.units.includes(c))) return { kind: 'trf', pid: p.id };
  }
  return null;
}

/** A task picked from the sheet after a wristband scan: the wristband counts, so the task opens on the list. */
function startScanned(kind, pid) {
  const code = patientById(pid).barcode;
  resetPatient();
  resetWork();
  if (kind === 'med') return handleMedScan(code);
  return handleWorkScan(kind, code); // 채혈 · 수혈 → 목록, 활력징후 → 측정 화면
}

export function quickScan(code) {
  const c = String(code).trim().toUpperCase();
  if (!c || c === '#FAIL') return openMedDialog('fail');
  resetPatient();
  resetWork();
  state.origin = 'menu'; // 스캔으로 시작한 업무: 완료 후 그 업무의 바코드 스캔 화면
  const p = patientByCode(c);
  const label = p ? null : labelOwner(c);
  if (p || !label) {
    // a wristband (any other label stands for the selected patient, so the demo always moves on)
    const pid = p?.id || state.pid;
    selectPatient(pid);
    return openTaskSheet(pid, { onTask: (kind) => startScanned(kind, pid) });
  }
  if (label.kind === 'med') return handleMedScan(c);
  if (label.kind === 'trf') return handleWorkScan('trf', c);
  // 채혈관: 채혈하기 starts with the wristband → its scan screen, with the '환자 스캔 필요' popup
  selectPatient(label.pid);
  replace('wscan', { kind: 'bld' }, 'fade');
  handleWorkScan('bld', c);
}

function quickSims() {
  const at = (id) => state.pt[id];
  const kim = DEFAULT_PID;
  return [
    ...patientSims(),
    { label: `처방 바코드 · 김철수 · ${at(kim).orders[0].name}`, code: at(kim).orders[0].code },
    { label: `채혈관 · 문가은 · ${at('21033456').work.bld.orders[0].name}`, code: at('21033456').work.bld.orders[0].code },
    { label: `혈액 제제 · 정민호 · ${at('20812233').work.trf.orders[0].name}`, code: at('20812233').work.trf.orders[0].code },
    FAIL_SIM,
  ];
}

register('qscan', {
  bg: 'screen',
  render: () => `
    ${header({ title: '스캔', left: 'back', right: 'menu' })}
    <div class="screen-body center-status">
      <span class="spacer" style="flex-grow: 206"></span>
      ${statusBlock({ img: 'scan', title: '바코드 스캔', desc: '환자 팔찌 또는 처방·채혈관·혈액 바코드를\nPDA 레이저로 스캔하세요.' })}
      <span class="spacer" style="flex-grow: 261"></span>
    </div>
    <div class="screen-foot">${button('스캔하기', 'scan', { long: 'scan-sim' })}</div>`,
  actions: {
    'hdr-back': () => pop(),
    'hdr-menu': () => go('navmenu'),
    // the PDA scan button reads the demo patient's wristband (long press: any sample barcode)
    scan: () => quickScan(patientById(DEFAULT_PID).barcode),
    'scan-sim': () => openScanSim(quickSims(), quickScan),
  },
  onScan: (code) => quickScan(code),
});
