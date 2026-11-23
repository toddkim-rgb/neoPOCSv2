// Home hub (neo-hub-welcome-01): three swipeable pages MY환자 ← 환자허브 (default) → 메뉴,
// page dots and the AI 커맨드바 at the bottom (+ → 음성메모 · 사진 촬영 · 스캔 · 사진첨부, text or voice command).
// 긴급 처리 업무 card → that patient's task (환자정보 비활성 → 팔찌 스캔) · MY환자 row → 업무 선택 시트 (투약/채혈/수혈/활력 ·
// 환자상세). 수혈 15분 체크 (알람 '나중에' 포함) also waits here as a card until it is recorded.
import { register, go } from '../router.js';
import { header, asset3d, esc, toast, openSheet, closeSheet } from '../ui.js';
import { icon, sparkles } from '../icons.js';
import { NURSE, MENU, MENU_ITEM } from '../data.js';
import { PATIENTS, patientById, fullName } from '../patients.js';
import { state, urgentItems, taskStatus, selectPatient, TASK_LABEL, trfDue } from '../state.js';
import { aiBar, mountAiBar, AI_ACTIONS, aiBack, startMenu, onHubTab, TODO } from '../aibar.js';
import { openCheck } from './transfuse.js';

const TABS = ['my', 'urgent', 'menu'];
const PAGE_W = 412; // design px
const tabIndex = (id) => Math.max(0, TABS.indexOf(id));

const meta = (m) => `<span class="meta">${esc(m[0])}<i class="sep">|</i>${esc(m[1])}</span>`;
const chip = (text, tone) => `<span class="gchip ${tone}"><span>${esc(text)}</span></span>`;

/* ---------------- 환자허브: 긴급처리업무 + 퀵메뉴 ---------------- */
const UC_TASK = { med: '투약', bld: '채혈', vital: 'V/S', trf: '수혈' }; // 업무명 under the card icon

/** 수혈 15분 체크 to do: first in 긴급 처리 업무 (the alarm's '나중에' leaves it here). */
function checkCard({ pid, unit, run }) {
  const p = patientById(pid);
  return `
        <button class="ucard due" data-act="trf-check" data-pid="${pid}" data-unit="${unit}">
          <span class="ucard-task"><img class="ucard-ico" src="${asset3d('uc-blood')}" alt=""><span class="ucard-tname">수혈</span></span>
          <span class="ucard-body">
            <span class="ucard-name">${esc(fullName(p))}</span>
            ${meta([p.bed, `혈액번호 ${unit}`])}
            <span class="ucard-dx">수혈 시작 ${run.at} · 15분 체크 ${run.chkAt}</span>
          </span>
          ${chip('15분 체크 필요', 'orange')}
        </button>`;
}

function urgentTab() {
  const items = urgentItems();
  const checks = trfDue();
  const quick = state.settings.quick.map((k) => MENU_ITEM[k]).filter(Boolean);
  return `
    <div class="hub-hello">
      <span class="hub-spark">${sparkles('hub-spark-u')}</span><span class="night-badge">${icon.moon}야간모드</span>
      <p class="hub-headline"><span class="gtext">긴급 처리 업무</span>가<br><span class="gtext">${items.length + checks.length}건</span> 기다리고 있습니다.</p>
    </div>
    <div class="ucards">
      ${checks.map(checkCard).join('')}
      ${items
        .map((u) => {
          const p = patientById(u.pid);
          return `
        <button class="ucard" data-act="urgent" data-go="${u.menu}" data-pid="${p.id}">
          <span class="ucard-task"><img class="ucard-ico" src="${asset3d(u.icon)}" alt=""><span class="ucard-tname">${UC_TASK[u.menu]}</span></span>
          <span class="ucard-body">
            <span class="ucard-name">${esc(fullName(p))}</span>
            ${meta([p.bed, p.detail])}
            <span class="ucard-dx">${esc(p.dx)}</span>
          </span>
          ${chip(u.chip(state.settings.alarms[u.menu].min), u.tone)}
        </button>`;
        })
        .join('')}
    </div>
    <div class="shortcuts">
      ${quick
        .map(
          (m) => `
        <button class="shortcut" data-act="start" data-go="${m.key}">
          <img class="${m.icon.startsWith('sc-') ? '' : 'tile'}" src="${asset3d(m.icon)}" alt="">
          <span>${esc(m.short || m.label)}</span>
        </button>`,
        )
        .join('')}
    </div>`;
}

/* ---------------- MY환자: 이름 / 위치 / 업무 정렬 ---------------- */
// one row per sample patient; the chip is their 마지막 처리 업무 (updated when a task is finished)
const myPatients = () =>
  PATIENTS.map((p) => ({ id: p.id, name: fullName(p), meta: [p.bed, p.detail], sex: p.sex, ...state.pt[p.id].last }));

const SORTS = [
  ['name', '이름'],
  ['ward', '위치'],
  ['task', '업무'],
];

function sortedPatients() {
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  const cmp = {
    name: byName,
    ward: (a, b) => a.meta[0].localeCompare(b.meta[0]) || byName(a, b), // 병상 코드 = 병동-병실-병상
    task: (a, b) => a.task - b.task || byName(a, b),
  }[state.mySort.key];
  return myPatients().sort(cmp);
}

const sortRow = () =>
  `<div class="sort-row" role="group" aria-label="정렬">${SORTS.map(
    ([id, label]) =>
      `<button class="sort-chip${id === state.mySort.key ? ' on' : ''}" data-act="sort" data-sort="${id}" aria-pressed="${id === state.mySort.key}">${label}</button>`,
  ).join('')}</div>`;

const myRows = () =>
  sortedPatients()
    .map(
      (p) => `
        <button class="myrow" data-key="${esc(p.name)}" data-act="my-patient" data-pid="${p.id}">
          <img class="myrow-ava" src="${asset3d(p.sex === 'f' ? 'avatar-female' : 'avatar-male')}" alt="">
          <span class="myrow-body"><span class="myrow-name">${esc(p.name)}</span>${meta(p.meta)}</span>
          ${chip(p.chip, p.tone)}
        </button>`,
    )
    .join('');

function myTab() {
  return `
    <div class="hub-hello">
      <span class="hub-spark">${sparkles('hub-spark-m')}</span>
      <p class="hub-headline">나의 환자리스트는<br><span class="gtext">${PATIENTS.length}명</span> 입니다.</p>
    </div>
    ${sortRow()}
    <div class="mylist">${myRows()}</div>`;
}

/** Re-sorts the list in place and slides each row from its old slot to the new one. */
function applySort(id) {
  if (state.mySort.key === id) return;
  state.mySort = { key: id, dir: 1 };
  const page = document.querySelector('.scr-hub .tab-my');
  if (!page) return;
  const list = page.querySelector('.mylist');
  const before = new Map([...list.children].map((r) => [r.dataset.key, r.getBoundingClientRect().top]));
  page.querySelector('.sort-row').outerHTML = sortRow();
  list.innerHTML = myRows();
  const r = stageRatio();
  for (const row of list.children) {
    const dy = (before.get(row.dataset.key) - row.getBoundingClientRect().top) / r;
    if (!dy) continue;
    row.style.transition = 'none';
    row.style.transform = `translateY(${dy}px)`;
    void row.offsetWidth;
    row.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)';
    row.style.transform = '';
  }
}

/* ---------------- MY환자 → 업무 선택 시트 ---------------- */
const TASKS = ['med', 'bld', 'trf', 'vital'];

/**
 * The patient's 투약 · 채혈 · 수혈 · 활력징후 with what is left today, plus 환자상세 보기.
 * `onTask(kind)`: what a picked task does (default: that task's 바코드 스캔; 스캔 passes the already-read wristband on).
 */
export function openTaskSheet(pid, { onTask = (k) => startMenu(k, pid) } = {}) {
  const p = patientById(pid);
  const last = state.pt[pid].last;
  const row = (k) => {
    const m = MENU_ITEM[k];
    const st = taskStatus(k, pid);
    return `
      <button class="opt task-opt${st.ok ? '' : ' off'}" data-sheet-act="${st.ok ? 'task' : 'none'}" data-k="${k}"${st.ok ? '' : ' aria-disabled="true"'}>
        <img class="ico3d${m.icon.startsWith('sc-') ? '' : ' tile'}" src="${asset3d(m.icon)}" alt="">
        <span class="lbl">${esc(m.label)}</span>
        <span class="task-st ${st.tone}">${esc(st.label)}</span>
        <span class="chev">${st.ok ? icon.chevronRight : ''}</span>
      </button>`;
  };
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">${esc(fullName(p))}</p>${chip(last.chip, last.tone)}</div>
     <div class="sheet-sub task-sub">${meta([p.bed, p.detail])}<span class="task-dx">${esc(p.dx)}</span></div>
     <div class="sheet-list task-list">${TASKS.map(row).join('')}</div>
     <button class="opt task-detail" data-sheet-act="detail"><span class="ico">${icon.person}</span><span class="lbl">환자상세 보기</span><span class="chev">${icon.chevronRight}</span></button>`,
    {
      task: (t) => {
        closeSheet();
        onTask(t.dataset.k);
      },
      none: (t) => {
        const st = taskStatus(t.dataset.k, pid);
        toast(st.tone === 'done' ? `금일 ${TASK_LABEL[t.dataset.k]}이 모두 완료되었습니다.` : `${p.name} 환자의 ${TASK_LABEL[t.dataset.k]} 오더가 없습니다.`);
      },
      detail: () => {
        closeSheet();
        selectPatient(pid);
        go('detail');
      },
    },
  );
}

/* ---------------- 메뉴 24종 ---------------- */
function menuTab() {
  return `
    <div class="menu-grid">
      ${MENU.map(
        ([ico, label, goTo]) => `
        <button class="menu-tile" data-act="${goTo ? 'start' : 'todo'}" data-go="${goTo || ''}">
          <img src="${asset3d(ico)}" alt=""><span>${esc(label)}</span>
        </button>`,
      ).join('')}
    </div>`;
}

/* ---------------- paging: dots + horizontal swipe ---------------- */
const stageRatio = () => document.getElementById('stage').getBoundingClientRect().width / PAGE_W;

function goTab(id) {
  state.hubTab = id;
  const el = document.querySelector('.scr-hub');
  if (!el) return;
  el.querySelector('.hub-track').style.transform = `translate3d(${-tabIndex(id) * PAGE_W}px, 0, 0)`;
  el.querySelectorAll('.hub-dots i').forEach((d, i) => d.classList.toggle('on', TABS[i] === id));
}

function attachSwipe(el) {
  const pager = el.querySelector('.hub-pager');
  const track = el.querySelector('.hub-track');
  let g = null; // current gesture
  let swallowClick = false;

  pager.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    g = { x: e.clientX, y: e.clientY, t: performance.now(), i: tabIndex(state.hubTab), dx: 0, axis: null };
    swallowClick = false;
  });
  pager.addEventListener('pointermove', (e) => {
    if (!g) return;
    const r = stageRatio();
    const mx = (e.clientX - g.x) / r;
    const my = (e.clientY - g.y) / r;
    if (!g.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      g.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (g.axis === 'x') {
        pager.setPointerCapture(e.pointerId);
        track.classList.add('dragging');
        swallowClick = true;
      }
    }
    if (g.axis !== 'x') return;
    // rubber-band at the first/last page
    const atEdge = (g.i === 0 && mx > 0) || (g.i === TABS.length - 1 && mx < 0);
    g.dx = atEdge ? mx * 0.3 : mx;
    track.style.transform = `translate3d(${-g.i * PAGE_W + g.dx}px, 0, 0)`;
  });
  const end = () => {
    if (!g) return;
    if (g.axis === 'x') {
      track.classList.remove('dragging');
      const v = g.dx / Math.max(1, performance.now() - g.t); // design px per ms
      let i = g.i;
      if (g.dx < -PAGE_W * 0.18 || v < -0.35) i = Math.min(TABS.length - 1, i + 1);
      else if (g.dx > PAGE_W * 0.18 || v > 0.35) i = Math.max(0, i - 1);
      goTab(TABS[i]);
    }
    g = null;
  };
  pager.addEventListener('pointerup', end);
  pager.addEventListener('pointercancel', end);
  // a swipe must not also count as a tap on the card under the finger
  pager.addEventListener(
    'click',
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}

register('hub', {
  bg: 'screen',
  render: () => {
    const x = -tabIndex(state.hubTab) * PAGE_W;
    return `
      ${header({ title: `${NURSE.name}(${NURSE.role})`, right: 'menu', titleAct: 'open-setting' })}
      <div class="hub-pager">
        <div class="hub-track" style="transform: translate3d(${x}px, 0, 0)">
          <div class="screen-body scroll hub-body tab-my">${myTab()}</div>
          <div class="screen-body scroll hub-body tab-urgent">${urgentTab()}</div>
          <div class="screen-body scroll hub-body tab-menu">${menuTab()}</div>
        </div>
      </div>
      ${aiBar({ dots: `<div class="hub-dots" aria-hidden="true">${TABS.map((t) => `<i class="${t === state.hubTab ? 'on' : ''}"></i>`).join('')}</div>` })}`;
  },
  mount(el, params = {}) {
    attachSwipe(el);
    mountAiBar(el, params);
    onHubTab(goTab);
  },
  actions: {
    ...AI_ACTIONS,
    sort: (t) => applySort(t.dataset.sort),
    // 사용자명 클릭 → 사용자설정 · 햄버거 아이콘 → 햄버거메뉴
    'open-setting': () => go('setting'),
    'hdr-menu': () => go('navmenu'),
    start: (t) => startMenu(t.dataset.go),
    // 긴급 처리 업무 → that task's 바코드 스캔 for the card's patient (the wristband is still scanned)
    urgent: (t) => startMenu(t.dataset.go, t.dataset.pid),
    // 수혈 15분 체크 → 체크 화면 (활력징후 · 이상반응)
    'trf-check': (t) => openCheck(t.dataset.pid, t.dataset.unit),
    'my-patient': (t) => openTaskSheet(t.dataset.pid),
    todo: () => toast(TODO),
  },
  onBack: () => {
    if (aiBack()) return true;
    if (state.hubTab !== 'urgent') {
      goTab('urgent');
      return true;
    }
    return false;
  },
});

/** A 15분 체크 alarm fired while the hub is shown: 긴급 처리 업무 gets its card at once. */
export function refreshHub() {
  const page = document.querySelector('.scr-hub .tab-urgent');
  if (page) page.innerHTML = urgentTab();
}
