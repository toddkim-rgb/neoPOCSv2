import { PATIENT, HAM_CHECKS, NURSE, MENU_GROUPS, DEFAULT_QUICK } from './data.js';
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
  };
}

/* ---------------- per-patient state (오더 · 업무 · 임상관찰기록 · 음성간호메모) ---------------- */
function newWork(p) {
  return {
    bld: { scan: { patient: false, drug: false }, orders: p.blood(), planMode: 'plan', tubes: [] }, // tubes: confirmed 채혈관 ids
    trf: { scan: { patient: false, drug: false }, orders: p.trf(), planMode: 'plan', ham: null },
    vital: { planMode: 'plan', time: '17:00', values: null },
  };
}

function newPatientState(p) {
  return {
    orders: p.orders(),
    work: newWork(p),
    vitals: { time: p.vitals.time, who: p.vitals.who, items: p.vitals.items.map((v) => ({ ...v })) },
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
  resetWork(); // leave the previous patient's scans clean
  state.pid = id;
  Object.assign(PATIENT, profileOf(p));
  resetPatient();
  resetWork();
  return true;
}

/** Clears the scanned patient/prescription of 채혈 · 수혈 · 활력징후 (keeps their orders). */
export function resetWork() {
  for (const k of ['bld', 'trf']) {
    state.work[k].scan = { patient: false, drug: false };
    state.work[k].planMode = 'plan';
  }
  state.work.trf.ham = null;
  state.work.trf.run = null; // 수혈 진행 (transfuse.js)
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

/** Clears the selected patient/prescription (뒤로가기 · 메뉴 전환). */
export function resetPatient() {
  state.scan = { patient: false, drug: false };
  state.ham = null;
  state.planMode = 'plan';
}

/** Records the current-slot doses as administered after 투약 수행. */
export function commitAdministration() {
  let given = null;
  for (const o of state.orders) {
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

export const highAlertOrders = () => state.orders.filter((o) => o.ham && o.now);
export const pendingOrders = () => state.orders.filter((o) => o.now && !o.prn);

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
    return { ok: true, label: menu === 'bld' ? `대기 ${n}관` : `대기 ${n}건`, tone: 'wait' };
  }
  if (s.done.vital) return { ok: true, label: `완료 ${s.done.vital}`, tone: 'done' };
  return { ok: true, label: `${s.work.vital.time} 예정`, tone: 'wait' };
}

/** 긴급 처리 업무 = cards whose menu alarm is on (사용자설정) and whose task is not finished yet. */
export const urgentItems = () => URGENT.filter((u) => state.settings.alarms[u.menu]?.on && !state.pt[u.pid].done[u.menu]);

/** Restores the demo to its initial data (called on every login). */
export function resetDemo() {
  state.pt = newPatients();
  state.voice = { notes: [], draft: '', origin: 'task' };
  state.scriptOpen = { review: false, detail: [true, false] };
  state.vocr = null;
  state.memoTab = 'perform';
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
