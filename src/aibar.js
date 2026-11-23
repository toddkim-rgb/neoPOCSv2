// AI 커맨드바 (neo-hub-welcome-01 bottom, also on 음성간호메모 메인): text command / voice command and
// + → 음성메모 (녹음 → 환자 팔찌 스캔) · 사진 촬영 (카메라 → 촬영 → 팔찌 스캔) · 스캔 (스캔 준비 화면)
//   · 사진첨부 (갤러리 → 사진 선택 → 팔찌 스캔). None of them needs a patient to start.
// Screens spread AI_ACTIONS into their actions and call mountAiBar(el) in mount().
import { go, backTo, currentScreen } from './router.js';
import { toast } from './ui.js';
import { icon } from './icons.js';
import { MENU, MENU_ITEM } from './data.js';
import { PATIENTS, DEFAULT_PID } from './patients.js';
import { state, resetPatient, selectPatient } from './state.js';
import { startWork } from './screens/work.js';
import { openLogout, openRoomSheet } from './screens/nav.js';
import { startFreeMemo } from './screens/voice.js';
import { startCamera, startAttach } from './screens/vitals.js';

export const TODO = '프로토타입에서는 투약·채혈·수혈·활력징후를 체험할 수 있습니다.';

/** The + menu: 음성메모 · 사진 촬영 · 스캔 · 사진첨부 (also above the 음성메모 녹음 input). */
export const aiChips = () => `
    <div class="ai-chips${state.aiMore ? ' open' : ''}" aria-hidden="${!state.aiMore}">
      <button class="ai-chip" data-act="ai-voice-memo">음성메모</button>
      <button class="ai-chip" data-act="ai-monitor">사진 촬영</button>
      <button class="ai-chip" data-act="ai-scan">스캔</button>
      <button class="ai-chip" data-act="ai-attach">사진첨부</button>
    </div>`;

/** `dots`: the hub's page indicator (only the hub has pages). */
export const aiBar = ({ dots = '' } = {}) => `
  <div class="hub-foot">
    ${aiChips()}
    ${dots}
    <form class="ai-bar" autocomplete="off" onsubmit="return false">
      <div class="ai-field">
        <button type="button" class="ai-plus${state.aiMore ? ' on' : ''}" data-act="ai-more" aria-label="AI 메뉴">${icon.plus}</button>
        <input class="ai-input" type="text" placeholder="지금 필요한 업무를 알려주세요!" enterkeyhint="send" aria-label="AI 커맨드">
      </div>
      <button type="button" class="ai-go" data-act="ai-go" aria-label="음성으로 말하기">
        <span class="wave">${icon.voiceWave}</span><span class="ok">${icon.check}</span>
      </button>
    </form>
  </div>`;

const screenEl = () => document.querySelector('#screens .screen');

export function setAiMore(open) {
  state.aiMore = open;
  const el = screenEl();
  const chips = el?.querySelector('.ai-chips');
  if (!chips) return;
  chips.classList.toggle('open', open);
  chips.setAttribute('aria-hidden', String(!open));
  el.querySelector('[data-act="ai-more"]')?.classList.toggle('on', open);
}

function syncTyping(el) {
  const input = el.querySelector('.ai-input');
  const typing = input.value.trim().length > 0;
  el.querySelector('.ai-bar').classList.toggle('typing', typing);
  el.querySelector('.ai-go').setAttribute('aria-label', typing ? '보내기' : '음성으로 말하기');
}

/** Wires the input (typing ↔ ✓, Enter). `params.ai === 'typing'` shows the "텍스트 입력 시" state for screenshots. */
export function mountAiBar(el, params = {}) {
  const input = el.querySelector('.ai-input');
  if (!input) return;
  input.addEventListener('input', () => syncTyping(el));
  input.addEventListener('focus', () => setAiMore(false));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    el.querySelector('.ai-go').click();
  });
  if (params.ai === 'typing') {
    input.value = '작성 중..';
    syncTyping(el);
  }
}

/* ---------------- navigation helpers ---------------- */
/**
 * 투약하기. A chosen patient (`pid`: 긴급 카드 · MY환자 · AI 커맨드바) opens their 투약 list first, locked until the
 * wristband scan; without one (메뉴 · 퀵메뉴) the 바코드 스캔 screen comes first.
 */
export function startMed(pid) {
  selectPatient(pid || DEFAULT_PID);
  resetPatient();
  state.origin = pid ? 'hub' : 'menu'; // 완료 후 돌아갈 곳
  go(pid ? 'task' : 'scan');
}

/** Opens a menu by its key (MENU_ITEM / hub tiles): implemented flows start, the rest explain. */
export function startMenu(key, pid) {
  if (key === 'med') return startMed(pid);
  if (['bld', 'trf', 'vital'].includes(key)) return startWork(key, pid);
  toast(TODO);
}

// the hub registers how to switch its pages; other screens go back to the hub first
let hubTab = null;
export const onHubTab = (fn) => (hubTab = fn);
export function goHubTab(id) {
  if (currentScreen()?.name === 'hub') return hubTab?.(id);
  state.hubTab = id;
  backTo('hub');
}

const norm = (s) => s.replace(/\s+/g, '').replace(/(하기|해줘|보여줘|열어줘|가줘|이동)$/g, '');

/** The 업무 a patient command names (투약 · 채혈 · 수혈 · 활력징후); attributes like "혈액형" · "혈압" stay on 환자상세. */
function taskOf(q) {
  if (/투약|약주|약줄|약$/.test(q)) return 'med';
  if (/채혈|피뽑/.test(q)) return 'bld';
  if (/수혈|피주|혈액(?!형)/.test(q)) return 'trf';
  if (/활력|바이탈|vital/i.test(q)) return 'vital';
  return null;
}

/** Very small intent matcher for the prototype: patient (+업무) → that task / 상세, menu name/synonym → that menu, 설정 → 설정 화면. */
export function runCommand(raw) {
  const q = norm(raw);
  if (!q) return;
  // 1. 특정 환자 이동형: 환자명 · 등록번호 (+ 업무) — any of the six sample patients
  const p = PATIENTS.find((x) => q.includes(x.name) || q.includes(x.id));
  if (p) {
    const task = taskOf(q.replace(p.name, '').replace(p.id, ''));
    if (task) return startMenu(task, p.id);
    selectPatient(p.id);
    return go('detail');
  }
  if (/투약|약주|약줄/.test(q)) return startMed();
  if (/채혈|피뽑/.test(q)) return startWork('bld');
  if (/수혈|피주|혈액/.test(q)) return startWork('trf');
  if (/(메모|기록).*(목록|리스트|확인대기)|(목록|리스트).*메모/.test(q)) return go('vmain');
  if (/음성|간호메모|메모/.test(q)) return startFreeMemo();
  if (/첨부|앨범|갤러리/.test(q)) return startAttach();
  if (/모니터|사진|촬영|카메라/.test(q)) return startCamera();
  if (/활력|바이탈|vital|혈압|체온|맥박/i.test(q)) return startWork('vital');
  if (/스캔/.test(q)) return go('qscan');
  // 시스템/설정 제어형: 우선 화면 이동
  if (/로그아웃/.test(q)) return openLogout();
  if (/주사실/.test(q)) {
    go('navmenu');
    return openRoomSheet();
  }
  if (/설정|알림|알람|퀵메뉴|자동로그/.test(q)) return go('setting');
  if (/내환자|my환자|환자리스트|담당환자/i.test(q)) return goHubTab('my');
  if (/전체메뉴|햄버거/.test(q)) return go('navmenu');
  if (/메뉴/.test(q)) return goHubTab('menu');
  if (/긴급|허브|홈/.test(q)) return goHubTab('urgent');
  const item = Object.values(MENU_ITEM).find((i) => q.includes(norm(i.label)) || norm(i.label).includes(q));
  if (item) return startMenu(item.key);
  const tile = MENU.find(([, label]) => q.includes(norm(label)) || norm(label).includes(q));
  if (tile) return startMenu(tile[2]);
  toast('찾으시는 환자나 메뉴를 확인하지 못했어요.');
}

let listenTimer = null;
/** Voice button: a short "listening" state, then the recognised text waits in the field for ✓. */
function listen(el) {
  const bar = el.querySelector('.ai-bar');
  const input = el.querySelector('.ai-input');
  if (bar.classList.contains('listening')) return;
  bar.classList.add('listening');
  input.value = '';
  input.placeholder = '듣고 있어요…';
  clearTimeout(listenTimer);
  listenTimer = setTimeout(() => {
    if (!input.isConnected) return;
    bar.classList.remove('listening');
    input.placeholder = '지금 필요한 업무를 알려주세요!';
    input.value = '김철수 환자 투약하기';
    syncTyping(el);
  }, 1600);
}

export const AI_ACTIONS = {
  'ai-more': () => setAiMore(!state.aiMore),
  // 음성메모: 환자 없이 바로 녹음 → 완료 후 환자 팔찌 스캔 → 검토 · 저장
  'ai-voice-memo': () => (setAiMore(false), startFreeMemo()),
  // 사진 촬영: 카메라가 바로 열림 → 촬영 → 환자 팔찌 스캔 → AI 분석
  'ai-monitor': () => (setAiMore(false), startCamera()),
  // 스캔: 스캔 준비 화면 (환자 팔찌 → 업무 선택 · 처방/채혈관/혈액 → 그 업무)
  'ai-scan': () => (setAiMore(false), go('qscan')),
  // 사진첨부: 기기 갤러리가 바로 열림 → 사진 선택 → 환자 팔찌 스캔 → AI 분석
  'ai-attach': () => (setAiMore(false), startAttach()),
  'ai-go': () => {
    const el = screenEl();
    const input = el.querySelector('.ai-input');
    if (!input.value.trim()) return listen(el);
    const q = input.value;
    input.value = '';
    input.blur();
    syncTyping(el);
    runCommand(q);
  },
};

/** Back key on a screen with the AI bar: first closes the + menu. */
export function aiBack() {
  if (!state.aiMore) return false;
  setAiMore(false);
  return true;
}
