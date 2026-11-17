// 사용자설정 (neo-nav-setting-01) · 퀵메뉴슬롯 1/2Depth (neo-nav-slot-01) · 로그아웃 (common-logout)
// · 햄버거메뉴 (neo-nav-menu-01) · 주사실 설정 (neo-nav-room-01) — SSol design, phase 3.
import { register, go, pop, reset, backTo, rerender } from '../router.js';
import { header, asset3d, esc, toast, openSheet, closeSheet, openDialog } from '../ui.js';
import { icon } from '../icons.js';
import { NURSE, DEPT, MENU_GROUPS, MENU_ITEM, ROOMS } from '../data.js';
import { PATIENTS } from '../patients.js';
import { state, resetUser, urgentItems } from '../state.js';
import { startMenu } from '../aibar.js';
import { installed } from '../versions.js';
import { appInfoSection, APP_INFO_ACTIONS } from './update.js';
import { wake } from '../pii.js';
import { isNight, syncNight } from '../night.js';

const ALARM_MIN = [10, 20, 30];
const LOGOUT_MIN = [10, 20, 30, 60];
const PII_SEC = [0, 5, 10, 30, 60]; // 개인정보 자동 가림 (0 = 끄기)
// 야간모드 시작 · 종료: 30분 단위, 하루를 돌아감
const stepTime = (t, d) => {
  const [h, m] = t.split(':').map(Number);
  const v = (((h * 60 + m + d * 30) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const timeStepper = (t, act, off) => `
  <span class="stp${off ? ' off' : ''}">
    <button class="vstep" data-act="${act}" data-d="-1" aria-label="30분 앞으로"${off ? ' disabled' : ''}>−</button>
    <span class="stp-v night-t">${t}</span>
    <button class="vstep" data-act="${act}" data-d="1" aria-label="30분 뒤로"${off ? ' disabled' : ''}>+</button>
  </span>`;

/** 야간모드: 자동 전환 · 시작 · 종료 · 지금 바꾸기 */
function nightSection() {
  const n = state.settings.night;
  const now = document.documentElement.classList.contains('night'); // the mode on screen
  return `
      <p class="set-label">야간모드</p>
      <div class="set-card night-card">
        <div class="set-row first"><span>야간모드 자동 전환</span>${toggle(n.auto, 'night-auto', '')}</div>
        <div class="set-row sub"><span>시작</span>${timeStepper(n.start, 'night-start', !n.auto)}</div>
        <div class="set-row sub"><span>종료</span>${timeStepper(n.end, 'night-end', !n.auto)}</div>
        <div class="set-row now"><span class="night-now-l">${icon.moon}<span>지금 <b>${now ? '야간' : '주간'}모드</b>${n.manual != null ? ' (직접 바꿈)' : ''}</span></span>
          <button class="night-now" data-act="night-now">${now ? '주간모드로 바꾸기' : '야간모드 켜기'}</button></div>
      </div>
      <p class="set-note">야간에는 화면이 어두워지고, 알림·조작음 대신 진동으로 알립니다. 직접 바꾼 모드는 다음 자동 전환 시각까지 유지됩니다.</p>`;
}
const urgentCount = () => urgentItems().length;
const memoPending = () => Object.values(state.pt).reduce((n, s) => n + s.memos.filter((m) => !m.reviewed).length, 0);

const toggle = (on, act, data) =>
  `<button class="tgl${on ? ' on' : ''}" data-act="${act}" ${data} role="switch" aria-checked="${on}"><i></i></button>`;
const stepper = (value, act, data) => `
  <span class="stp">
    <button class="vstep" data-act="${act}" data-d="-1" ${data} aria-label="줄이기">−</button>
    <span class="stp-v">${value}분</span>
    <button class="vstep" data-act="${act}" data-d="1" ${data} aria-label="늘리기">+</button>
  </span>`;
const stepIn = (list, cur, d) => list[Math.min(list.length - 1, Math.max(0, list.indexOf(cur) + d))];

/* ---------------- 사용자설정 ---------------- */
function alarmGroup(g) {
  const open = !!state.settings.open[g.key];
  const head = `
    <button class="set-ghead" data-act="toggle-group" data-g="${g.key}" aria-expanded="${open}">
      <i class="gdot" style="background:${g.color}"></i><span>${g.label}</span>
      <span class="chev">${open ? icon.arrowDown : icon.chevronRight}</span>
    </button>`;
  if (!open) return `<div class="set-card">${head}</div>`;
  const rows = g.items
    .map((i) => {
      const a = state.settings.alarms[i.key];
      const sub = a.on && i.alarm ? `<div class="set-row sub"><span>${i.alarm}</span>${stepper(a.min, 'alarm-min', `data-k="${i.key}"`)}</div>` : '';
      return `<div class="set-row"><span>${esc(i.label)}</span>${toggle(a.on, 'alarm', `data-k="${i.key}"`)}</div>${sub}`;
    })
    .join('');
  return `<div class="set-card">${head}${rows}</div>`;
}

function slot(i) {
  const m = MENU_ITEM[state.settings.quick[i]];
  return `
    <button class="set-slot${m ? '' : ' empty'}" data-act="slot" data-i="${i}">
      <span class="num">${i + 1}</span>
      <span class="nm"><i class="gdot" style="background:${m ? m.color : '#f0f1f3'}"></i>${m ? esc(m.label) : '퀵 메뉴'}</span>
    </button>`;
}

register('setting', {
  bg: 'gray',
  render: () => `
    ${header({ title: '사용자 설정', right: 'close', align: 'left' })}
    <div class="screen-body scroll setting">
      <div class="set-user">
        <p class="set-hello">안녕하세요, ${NURSE.name}님(${NURSE.no})</p>
        <p class="set-meta">직책 : ${NURSE.role}<i></i>진료과 : ${DEPT}</p>
      </div>
      <div class="set-stats">
        <button class="set-stat" data-act="to-tab" data-tab="urgent"><span>긴급처리업무</span><b class="gtext">${urgentCount()}건</b></button>
        <button class="set-stat" data-act="to-tab" data-tab="my"><span>MY환자</span><b class="gtext">${PATIENTS.length}명</b></button>
      </div>
      <p class="set-label">메뉴별 알림 설정</p>
      <div class="set-groups">${MENU_GROUPS.map(alarmGroup).join('')}</div>
      <p class="set-label">퀵 메뉴 설정</p>
      <div class="set-slots">${[0, 1, 2, 3].map(slot).join('')}</div>
      <p class="set-label">기타 설정</p>
      <div class="set-card set-row solo"><span>고위험수행 2차인증</span>${toggle(state.settings.ham2, 'ham2', '')}</div>
      <div class="set-card set-row solo"><span>자동 로그아웃</span>${stepper(state.settings.autoLogout, 'auto-min', '')}</div>
      <div class="set-card set-row solo"><span>개인정보 자동 가림</span>
        <span class="stp">
          <button class="vstep" data-act="pii-sec" data-d="-1" aria-label="줄이기">−</button>
          <span class="stp-v">${state.settings.piiSec ? `${state.settings.piiSec}초` : '끄기'}</span>
          <button class="vstep" data-act="pii-sec" data-d="1" aria-label="늘리기">+</button>
        </span>
      </div>
      <p class="set-note">조작이 없으면 환자 이름·등록번호와 의료진 이름·사번을 가립니다 (김*수 · 2121****). 화면을 누르면 다시 보입니다.</p>
      ${nightSection()}
      ${appInfoSection()}
      <button class="set-logout" data-act="logout">로그아웃 ${icon.logout}</button>
    </div>`,
  actions: {
    'hdr-close': () => pop(),
    'to-tab': (t) => {
      state.hubTab = t.dataset.tab;
      backTo('hub');
    },
    'toggle-group': (t) => {
      const g = t.dataset.g;
      state.settings.open[g] = !state.settings.open[g];
      rerender();
    },
    alarm: (t) => {
      const a = state.settings.alarms[t.dataset.k];
      a.on = !a.on;
      rerender();
    },
    'alarm-min': (t) => {
      const a = state.settings.alarms[t.dataset.k];
      a.min = stepIn(ALARM_MIN, a.min, Number(t.dataset.d));
      rerender();
    },
    // 지원 여부 미정 (designer note): the switch is shown and remembered, the flows still always ask for 2차 인증
    ham2: () => {
      state.settings.ham2 = !state.settings.ham2;
      rerender();
      if (!state.settings.ham2) toast('고위험수행 2차인증 해제는 지원 여부가 정해지지 않아, 프로토타입에서는 표시만 바뀝니다.');
    },
    'auto-min': (t) => {
      state.settings.autoLogout = stepIn(LOGOUT_MIN, state.settings.autoLogout, Number(t.dataset.d));
      rerender();
    },
    // 야간모드
    'night-auto': () => {
      const n = state.settings.night;
      n.auto = !n.auto;
      n.manual = null;
      syncNight();
      rerender();
    },
    'night-start': (t) => {
      const n = state.settings.night;
      n.start = stepTime(n.start, Number(t.dataset.d));
      n.manual = null;
      syncNight();
      rerender();
    },
    'night-end': (t) => {
      const n = state.settings.night;
      n.end = stepTime(n.end, Number(t.dataset.d));
      n.manual = null;
      syncNight();
      rerender();
    },
    'night-now': () => {
      const n = state.settings.night;
      n.manual = !document.documentElement.classList.contains('night');
      syncNight();
      rerender();
    },
    'pii-sec': (t) => {
      state.settings.piiSec = stepIn(PII_SEC, state.settings.piiSec, Number(t.dataset.d));
      rerender();
      wake(); // the count restarts with the new time
    },
    slot: (t) => openSlotSheet(+t.dataset.i),
    logout: () => openLogout(),
    ...APP_INFO_ACTIONS,
    // ?shot=setting&sheet=slot1|slot2
    'sheet-slot1': () => openSlotSheet(0),
    'sheet-slot2': () => openSlotSheet(0, 'perform'),
  },
});

/* ---------------- 퀵 슬롯 선택: 1Depth 그룹 → 2Depth 메뉴 ---------------- */
function openSlotSheet(i, group = null) {
  const cur = MENU_ITEM[state.settings.quick[i]];
  const head = `<div class="sheet-head"><p class="sheet-title">${i + 1}번 퀵 슬롯 선택</p><span class="sheet-cur">현재 : ${
    cur ? `${cur.groupLabel}-${esc(cur.label)}` : '없음'
  }</span></div>`;
  const opt = (sel, act, v, label) =>
    `<button class="opt${sel ? ' sel' : ''}" data-sheet-act="${act}" data-v="${v}"><span class="lbl">${esc(label)}</span><span class="chev">${icon.chevronRight}</span></button>`;
  if (!group) {
    return openSheet(
      `${head}<div class="sheet-list slot-list">${MENU_GROUPS.map((g) => opt(cur?.group === g.key, 'group', g.key, g.label)).join('')}</div>`,
      { group: (t) => openSlotSheet(i, t.dataset.v) },
    );
  }
  const g = MENU_GROUPS.find((x) => x.key === group);
  openSheet(`${head}<div class="sheet-list slot-list">${g.items.map((m) => opt(cur?.key === m.key, 'pick', m.key, m.label)).join('')}</div>`, {
    pick: (t) => {
      const q = state.settings.quick;
      const k = t.dataset.v;
      const j = q.indexOf(k);
      if (j >= 0 && j !== i) q[j] = q[i]; // already in another slot → swap
      q[i] = k;
      t.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.remove('sel'));
      t.classList.add('sel');
      setTimeout(() => {
        closeSheet();
        rerender();
        toast(`${i + 1}번 퀵 메뉴를 '${MENU_ITEM[k].label}'(으)로 설정했습니다.`);
      }, 160);
    },
  });
}

/* ---------------- 로그아웃 ---------------- */
export function openLogout() {
  openDialog(
    {
      title: '로그아웃 안내',
      tone: 'plain',
      desc: '사용자 정보를 초기화 합니다.\n로그아웃을 계속 진행할까요?',
      buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '로그아웃', act: 'ok' }],
    },
    {
      cancel: () => closeSheet(),
      ok: () => {
        closeSheet();
        resetUser();
        syncNight(); // 로그아웃: 야간모드 설정도 기본값으로
        reset('splash', {}, 'fade');
      },
    },
  );
}

/* ---------------- 햄버거메뉴 ---------------- */
register('navmenu', {
  bg: 'gray',
  render: () => `
    ${header({ title: `${NURSE.name}(${NURSE.role})`, right: 'close', align: 'left', titleAct: 'open-setting' })}
    <div class="screen-body scroll navmenu">
      <div class="nav-tiles">
        <button class="nav-tile" data-act="home"><img src="${asset3d('nav-home')}" alt=""><span>홈(환자 허브)</span></button>
        <button class="nav-tile" data-act="room"><img src="${asset3d('nav-room')}" alt=""><span>주사실 설정${state.room ? `<small>${esc(state.room)}</small>` : ''}</span></button>
        <button class="nav-tile wide" data-act="memos"><img src="${asset3d('voice-memo')}" alt=""><span>음성간호메모<small>확인대기 ${memoPending()}건</small></span></button>
      </div>
      <p class="set-label">전체 메뉴</p>
      <div class="nav-list">${MENU_GROUPS.map(
        (g) => `
        <p class="nav-g">${g.label}</p>
        ${g.items
          .map((m) => `<button class="nav-item" data-act="menu" data-k="${m.key}"><i class="gdot" style="background:${g.color}"></i>${esc(m.label)}</button>`)
          .join('')}`,
      ).join('')}</div>
      <p class="nav-ver">앱 버전 : v${installed()}</p>
    </div>`,
  actions: {
    'hdr-close': () => pop(),
    'open-setting': () => go('setting'),
    home: () => {
      state.hubTab = 'urgent';
      backTo('hub');
    },
    room: () => openRoomSheet(),
    // 음성간호메모 메인 (환자별 확인대기 목록) — the AI 커맨드바 음성메모 now records right away
    memos: () => go('vmain'),
    menu: (t) => startMenu(t.dataset.k),
    'sheet-room': () => openRoomSheet(),
  },
});

/* ---------------- 주사실 설정 ---------------- */
export function openRoomSheet() {
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">주사실 설정</p><span class="sheet-cur">현재 : ${esc(state.room || '없음')}</span></div>
     <div class="sheet-list room-list">${ROOMS.map(
       (r) => `<button class="opt${r === state.room ? ' sel' : ''}" data-sheet-act="pick" data-v="${r}"><span class="lbl">${r}</span><span class="chev">${icon.chevronRight}</span></button>`,
     ).join('')}</div>`,
    {
      pick: (t) => {
        state.room = t.dataset.v;
        t.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.remove('sel'));
        t.classList.add('sel');
        setTimeout(() => {
          closeSheet();
          if (document.querySelector('.scr-navmenu')) rerender();
          toast(`주사실을 '${state.room}'(으)로 설정했습니다.`);
        }, 160);
      },
    },
  );
}
