import { PATIENT, HAM_CHECKS, NURSE, NURSE2, MENU_GROUPS, DEFAULT_QUICK } from './data.js';
import { PATIENTS, DEFAULT_PID, URGENT, patientById, profileOf } from './patients.js';

/** 사용자설정 defaults (design: 투약·수혈 알림 on 30분, 퀵메뉴 투약/채혈/활력/산모아기, 2차인증 on, 자동 로그아웃 30분). */
export function defaultSettings() {
  const on = { med: true, trf: true, vital: true };
  return {
    alarms: Object.fromEntries(MENU_GROUPS.flatMap((g) => g.items.map((i) => [i.key, { on: !!on[i.key], min: 30 }]))),
    open: { perform: true }, // 메뉴별 알림 설정: expanded groups
    quick: [...DEFAULT_QUICK],
    ham2: true, // 고위험수행 2차인증 (지원 여부 미정 — 표시만)
    autoLogout: 30,
    piiSec: 10, // 개인정보 자동 가림: seconds without a touch (0 = 끄기) — pii.js
  };
}

/* ---------------- per-patient state (오더 · 업무 · 임상관찰기록 · 음성간호메모) ---------------- */
function newWork(p) {
  return {
    bld: { scan: { patient: false, drug: false }, orders: p.blood(), tubes: [] }, // tubes: confirmed 채혈관 ids
    // 수혈: a blood bag = 혈액번호 + 혈액제제 barcodes. bags: 혈액번호 → 'ok' (both scanned) · 'done' · 'stop';
    // pend: the bag half-scanned ({ unit } or { code }); ham · run: the bag being double-checked / transfused; log: 수혈 기록;
    // checked: 수혈 오더 (항목) whose 이중 인증 is done — its later bags need only their 혈액번호, no new check
    trf: { scan: { patient: false, drug: false }, orders: p.trf(), bags: {}, pend: null, ham: null, run: null, log: [], speed: 60, result: null, checked: {} },
    vital: { plan: '17:00', time: '17:00', values: null }, // plan: 예정 시각 (업무 선택 시트) · time: 측정 시간 (화면을 열 때 현재 시각)
  };
}

/* 임상관찰기록 이전 측정 (환자 상세 '상세보기'): demo records before the patient's latest one, a little different each time */
const HIST_HOURS = [4, 8, 12, 20];
const HIST_DELTA = { SBP: [4, -3, 6, -2], DBP: [2, -1, 3, 0], PR: [-5, 3, -8, 2], RR: [0, 2, -2, 1], BT: [-0.3, 0.2, -0.5, 0.1], SpO2: [1, -1, 0, 1] };
const pad2 = (n) => String(n).padStart(2, '0');
function vitalHistory(v) {
  const [md, hm] = (v.items[0]?.at || `09/17 ${v.time}`).split(' ');
  const [mo, d] = md.split('/').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const base = new Date(2026, mo - 1, d, h, mi).getTime();
  return HIST_HOURS.map((hrs, n) => {
    const t = new Date(base - hrs * 3600e3);
    const values = Object.fromEntries(
      v.items.map((i) => {
        const x = parseFloat(i.v) + (HIST_DELTA[i.k]?.[n] || 0);
        return [i.k, i.k === 'BT' ? x.toFixed(1) : String(Math.round(i.k === 'SpO2' ? Math.min(100, x) : x))];
      }),
    );
    return { at: `${pad2(t.getMonth() + 1)}/${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`, who: n % 2 ? NURSE2.label : NURSE.label, values };
  });
}

/** One 임상관찰기록 record as a row: { at: 'MM/DD HH:MM', who, values: { SBP: '118', … } }. */
export const vitalRow = (v) => ({ at: v.items[0]?.at || v.time, who: v.who, values: Object.fromEntries(v.items.map((i) => [i.k, i.v])) });

/** A new measurement becomes the latest 임상관찰기록; the previous latest moves to the history (newest first). */
export function recordVitals(rec) {
  const s = state.pt[state.pid];
  s.vhist.unshift(vitalRow(s.vitals));
  s.vitals = rec;
}

function newPatientState(p) {
  return {
    orders: p.orders(),
    work: newWork(p),
    vitals: { time: p.vitals.time, who: p.vitals.who, items: p.vitals.items.map((v) => ({ ...v })) },
    vhist: vitalHistory(p.vitals), // 이전 측정 (newest first)
    memos: p.memos(),
    last: { ...p.my }, // MY환자 칩: 마지막 처리 업무
    done: {}, // menu → 완료 시각: that task is finished today (긴급 처리 업무 해소 · 업무 선택 시트 '완료')
  };
}
const newPatients = () => Object.fromEntries(PATIENTS.map((p) => [p.id, newPatientState(p)]));

export const state = {
  hubTab: 'urgent',
  mySort: { key: 'name', dir: 1 }, // MY환자 정렬: name(이름) | ward(위치) | task(업무)
  aiMore: false, // AI 커맨드바 + 메뉴 (음성메모 · 사진 촬영 · 스캔 · 사진첨부)
  loginError: false,
  pid: DEFAULT_PID, // 선택된 환자 = PATIENT (data.js)
  pt: newPatients(), // 환자별 상태
  scan: { patient: false, drug: false }, // 투약하기 스캔 단계
  planMode: 'plan', // '플랜' | '실시간'
  ham: null,
  voice: { notes: [], draft: '', origin: 'task' },
  scriptOpen: { review: false, detail: [true, false] },
  vocr: null, // current 활력징후 OCR session
  settings: defaultSettings(), // 사용자설정 — kept across logins, cleared by 로그아웃
  room: null, // 주사실 설정
  memoTab: 'perform', // 수행별 | 병상 라운딩
  vhistOpen: false, // 환자 상세 · 임상관찰기록 '상세보기'
};

// orders · work (채혈·수혈·활력징후) · vitals (임상관찰기록) · memos always belong to the selected patient
for (const k of ['orders', 'work', 'vitals', 'memos']) {
  Object.defineProperty(state, k, {
    enumerable: true,
    get: () => state.pt[state.pid][k],
    set: (v) => {
      state.pt[state.pid][k] = v;
    },
  });
}

/** Makes `id` the selected patient: PATIENT shows their profile, state.orders/work/… their data. */
export function selectPatient(id, { force = false } = {}) {
  const p = patientById(id);
  if (!p || (state.pid === id && !force)) return false;
  resetPatient(); // leave the previous patient's scans (and 투약 제외) clean
  resetWork();
  state.pid = id;
  Object.assign(PATIENT, profileOf(p));
  resetPatient();
  resetWork();
  return true;
}

/** Clears the scanned patient/prescription of 채혈 · 수혈 · 활력징후 (keeps their orders). */
export function resetWork() {
  for (const k of ['bld', 'trf']) state.work[k].scan = { patient: false, drug: false };
  const t = state.work.trf;
  t.ham = null;
  t.run = null; // 수혈 진행 (transfuse.js)
  t.pend = null;
  // a bag confirmed by its two barcodes must be scanned again next time; 수혈 완료 · 중단 stay recorded
  for (const [u, st] of Object.entries(t.bags)) if (st === 'ok') delete t.bags[u];
  state.work.bld.tubes = [];
  state.work.vital.values = null;
}

/** 고위험 이중확인 (약물 · 수혈): 1차 = logged-in nurse, 2차 = whoever tags their RFID badge. */
export function newHamCheck(n = HAM_CHECKS.length) {
  return {
    first: NURSE.label,
    second: null,
    checks1: Array(n).fill(false),
    checks2: Array(n).fill(false),
    at1: null, // 1차 확인 시각
    at2: null, // 2차 확인 시각
    done: false,
  };
}

/** Clears the selected patient/prescription (뒤로가기 · 메뉴 전환) and this round's 투약 제외. */
export function resetPatient() {
  state.orders.forEach((o) => (o.excl = null));
  state.scan = { patient: false, drug: false };
  state.ham = null;
  state.planMode = 'plan';
}

/**
 * Records the current-slot doses as administered after 투약 수행.
 * A dose taken out of this round (투약 리스트 스와이프 → 삭제) is recorded as 미투약 with its reason code (R · N · H · NO).
 */
export function commitAdministration() {
  let given = null;
  for (const o of state.orders) {
    if (o.excl && o.now) {
      o.hist.push({ time: o.now.time, st: o.excl.code, who: o.now.who });
      o.now = null;
      o.excl = null;
      continue;
    }
    if (o.prn || !o.now || o.now.st === 'done') continue;
    o.hist.push({ time: o.now.time, st: o.now.st, who: o.now.who });
    if (o.count) o.count = [Math.min(o.count[0] + 1, o.count[1]), o.count[1]];
    given = o.now.time;
    o.now = null;
  }
  if (given) completeTask('med', given);
  state.scan = { patient: true, drug: false };
  state.ham = null;
}

// a dose taken out of this round (o.excl) is neither given nor needs the 고위험 이중 인증
export const highAlertOrders = () => state.orders.filter((o) => o.ham && o.now && !o.excl);
export const pendingOrders = () => state.orders.filter((o) => o.now && !o.prn && !o.excl);
export const excludedOrders = () => state.orders.filter((o) => o.now && o.excl);

/* ---------------- 업무 현황 (MY환자 업무 선택 · 긴급 처리 업무) ---------------- */
export const TASK_LABEL = { med: '투약', bld: '채혈', trf: '수혈', vital: '활력징후' };
const LAST = { med: ['투약완료', 'blue', 0], bld: ['채혈완료', 'orange', 1], trf: ['수혈완료', 'orange', 2], vital: ['VS완료', 'green', 3] };

/**
 * A task finished for the selected patient: MY환자 chip → 마지막 처리 업무, its 긴급 처리 업무 card goes away.
 * `chip` overrides the chip text (수혈 긴급 종료 → '수혈중단').
 */
export function completeTask(menu, time, chip) {
  const s = state.pt[state.pid];
  s.done[menu] = time;
  const [label, tone, task] = LAST[menu];
  s.last = { chip: chip || label, tone, task };
}

/**
 * What `menu` looks like for a patient: { ok: can be started, label, tone: 'wait' | 'done' | 'none' }.
 * 투약 stays open after the 17:00 doses while PRN 처방 remain; 채혈·수혈 close once done; 활력징후 is always open.
 */
export function taskStatus(menu, id = state.pid) {
  const s = state.pt[id];
  if (menu === 'med') {
    if (!s.orders.length) return { ok: false, label: '오더 없음', tone: 'none' };
    const pending = s.orders.filter((o) => o.now && !o.prn).length;
    if (pending) return { ok: true, label: `대기 ${pending}건`, tone: 'wait' };
    const prn = s.orders.some((o) => o.prn);
    return { ok: prn, label: s.done.med ? `완료 ${s.done.med}` : '완료', tone: 'done', prn };
  }
  if (menu === 'bld' || menu === 'trf') {
    const n = s.work[menu].orders.length;
    if (!n) return { ok: false, label: '오더 없음', tone: 'none' };
    if (s.done[menu]) return { ok: false, label: `완료 ${s.done[menu]}`, tone: 'done' };
    if (menu === 'trf') {
      // some bags already given: 진행 2/8 (단위)
      const units = trfUnits(id);
      const given = units.filter(({ unit }) => GIVEN.includes(s.work.trf.bags[unit])).length;
      if (given) return { ok: true, label: `진행 ${given}/${units.length}`, tone: 'wait' };
    }
    return { ok: true, label: menu === 'bld' ? `대기 ${n}관` : `대기 ${n}건`, tone: 'wait' };
  }
  if (s.done.vital) return { ok: true, label: `완료 ${s.done.vital}`, tone: 'done' };
  return { ok: true, label: `${s.work.vital.plan} 예정`, tone: 'wait' };
}

/* ---------------- 수혈: 혈액백 (혈액번호 + 혈액제제) ---------------- */
const GIVEN = ['done', 'stop'];
/** Every blood bag of the patient's 수혈 오더: { unit (혈액번호), o (the order, whose code = 혈액제제 barcode) }. */
export const trfUnits = (id = state.pid) => state.pt[id].work.trf.orders.flatMap((o) => o.units.map((unit) => ({ unit, o })));
/** 대기 · 제제 스캔 (혈액번호 only so far) · 확인 · 수혈 완료 · 중단 */
export function unitStatus(unit, w = state.work.trf) {
  if (w.bags[unit]) return w.bags[unit];
  return w.pend?.unit === unit ? 'half' : 'wait';
}
/** The next bag confirmed by both barcodes (수행하기 → 이중 인증 → 수혈 진행). */
export const trfNext = () => trfUnits().find(({ unit }) => state.work.trf.bags[unit] === 'ok') || null;
/** Bags not given yet (대기 · 확인). */
export const trfLeft = () => trfUnits().filter(({ unit }) => !GIVEN.includes(state.work.trf.bags[unit]));

/** 긴급 처리 업무 = cards whose menu alarm is on (사용자설정) and whose task is not finished yet. */
export const urgentItems = () => URGENT.filter((u) => state.settings.alarms[u.menu]?.on && !state.pt[u.pid].done[u.menu]);

/** Restores the demo to its initial data (called on every login). */
export function resetDemo() {
  state.pt = newPatients();
  state.voice = { notes: [], draft: '', origin: 'task' };
  state.scriptOpen = { review: false, detail: [true, false] };
  state.vocr = null;
  state.memoTab = 'perform';
  state.vhistOpen = false;
  selectPatient(DEFAULT_PID, { force: true });
}

/** 로그아웃: 사용자 정보를 초기화 합니다. */
export function resetUser() {
  state.settings = defaultSettings();
  state.room = null;
  state.aiMore = false;
  state.mySort = { key: 'name', dir: 1 };
  resetDemo();
}

selectPatient(DEFAULT_PID, { force: true });
