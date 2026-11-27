// 사용자설정 (neo-nav-setting-01) · 퀵메뉴슬롯 1/2Depth (neo-nav-slot-01) · 로그아웃 (common-logout)
// · 햄버거메뉴 (neo-nav-menu-01) · 주사실 설정 (neo-nav-room-01) — SSol design, phase 3.
import { register, go, pop, reset, backTo, rerender } from '../router.js';
import { header, asset3d, esc, toast, openSheet, closeSheet, openDialog } from '../ui.js';
import { icon } from '../icons.js';
import { NURSE, MENU_GROUPS, MENU_ITEM, ROOMS } from '../data.js';
import { PATIENTS } from '../patients.js';
import { state, resetUser, urgentItems } from '../state.js';
import { startMenu } from '../aibar.js';
import { installed } from '../versions.js';
import { appInfoSection, APP_INFO_ACTIONS } from './update.js';
import { wake } from '../pii.js';
import { isNight, applyNight } from '../night.js';

const ALARM_MIN = [10, 20, 30];
const LOGOUT_MIN = [10, 20, 30, 60];
const PII_SEC = [0, 5, 10, 30, 60]; // 개인정보 자동 가림 (0 = 끄기)
/** 야간모드: on / off (요청: 시간 설정 없이 스위치만) */
function nightSection() {
  const on = isNight();
  return `
      <p class="set-label">야간모드</p>
      <div class="set-card set-row solo night-row"><span class="night-now-l">${icon.moon}<span>야간모드</span></span>${toggle(on, 'night-toggle', '')}</div>
      <p class="set-note">켜면 화면이 어두워지고, 알림·조작음 대신 진동으로 알립니다.</p>`;
}
// 투약/채혈/수혈 통합 (2026-11-27 요청): 전체 메뉴 목록에서만 보이는 교체 — MENU_GROUPS 자체(메뉴별 알림 설정 · 퀵메뉴 설정에 쓰임)는 그대로 둔다.
const CARE3_ITEM = { key: 'care3', label: '투약/채혈/수혈' };
const navItems = (g) => (g.key === 'perform' ? [CARE3_ITEM, ...g.items.filter((m) => !['med', 'bld', 'trf'].includes(m.key))] : g.items);

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
      <span class="chev${open ? ' open' : ''}">${icon.arrowDown}</span>
    </button>`;
  if (!open) return `<div class="set-card">${head}</div>`;
  const rows = g.items
    .map((i) => {
      const a = state.settings.alarms[i.key];
      const sub = a.on && i.alarm ? `<div class="set-row sub"><span>${i.alarm}</span>${stepper(a.min, 'alarm-min', `data-k="${i.key}"`)}</div>` : '';
      return `<div class="set-row"><span>${esc(i.label)}</span>${toggle(a.on, 'alarm', `data-k="${i.key}"`)}</div>${sub}`;
    })
    .join('');
  return `<div class="set-card open">${head}<div class="set-gbody" style="background:${g.color}14">${rows}</div></div>`;
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
        <p class="set-meta">근무위치 : ${esc(state.room || '미설정')}</p>
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
    'auto-min': (t) => {
      state.settings.autoLogout = stepIn(LOGOUT_MIN, state.settings.autoLogout, Number(t.dataset.d));
      rerender();
    },
    // 야간모드 on / off
    'night-toggle': () => {
      state.settings.night.on = !state.settings.night.on;
      applyNight();
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
        applyNight(); // 로그아웃: 야간모드도 기본값(끔)으로
        reset('splash', {}, 'fade');
      },
    },
  );
}

/* ---------------- 햄버거메뉴 ---------------- */
register('navmenu', {
  bg: 'gray',
  render: () => `
    ${header({ title: `${NURSE.name}(${esc(state.room || '근무위치 미설정')})`, right: 'close', align: 'left', titleAct: 'open-setting' })}
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
        ${navItems(g)
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
