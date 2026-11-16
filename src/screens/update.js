// 앱 업데이트 (시연용, not in the Figma file): 시작 시 버전 확인 → 필수(강제) / 선택 업데이트 팝업 → 업데이트 화면
// (내려받기 · 설치 · 다시 시작), the 사용자설정 '앱 정보' section and the 버전 이력 screen (현재 버전 → 특정 버전으로 업데이트 · 변경).
import { register, go, pop, reset, rerender } from '../router.js';
import { header, esc, toast, openDialog, closeSheet } from '../ui.js';
import { icon } from '../icons.js';
import { VERSIONS, LATEST, MIN_SUPPORTED, cmpVer, installed, install, updateState, versionOf } from '../versions.js';

const notesBox = (v) =>
  `<div class="upd-box"><p class="upd-box-t">v${v} 변경 사항</p><ul>${versionOf(v)
    .notes.map((n) => `<li>${esc(n)}</li>`)
    .join('')}</ul></div>`;

let laterThisRun = false; // 선택 업데이트 '나중에' — asked again on the next app start

/** App start (초기화면): 필수 업데이트 blocks the app, 선택 업데이트 can wait. Returns true while the app is blocked. */
export function checkOnStart() {
  const st = updateState();
  if (st === 'force') return openUpdatePrompt(true), true;
  if (st === 'optional' && !laterThisRun) openUpdatePrompt(false);
  return false;
}

/** 필수(강제) · 선택 업데이트 popup. */
export function openUpdatePrompt(force) {
  const cur = installed();
  openDialog(
    force
      ? {
          title: '필수 업데이트',
          cls: 'upd',
          desc: `현재 버전(v${cur})은 더 이상 지원되지 않습니다.\n최신 버전으로 업데이트해야 사용할 수 있습니다.`,
          body: notesBox(LATEST),
          buttons: [{ label: '업데이트', act: 'ok' }],
        }
      : {
          title: '새 버전 업데이트',
          tone: 'info',
          cls: 'upd',
          desc: `새 버전(v${LATEST})이 있습니다.\n지금 업데이트할까요?`,
          body: notesBox(LATEST),
          buttons: [{ label: '나중에', act: 'later', line: true }, { label: '업데이트', act: 'ok' }],
        },
    {
      later: () => {
        laterThisRun = true;
        closeSheet();
      },
      ok: () => {
        closeSheet();
        startUpdate(LATEST);
      },
    },
  );
}

export function startUpdate(to) {
  go('update', { to, from: installed() });
}

/* ---------------- 업데이트 화면: 내려받기 → 설치 → 다시 시작 ---------------- */
register('update', {
  bg: 'splash',
  render: ({ to, from }) => {
    const back = cmpVer(to, from) < 0;
    return `
      <div class="screen-body upd-body">
        <span class="spacer" style="flex-grow: 120"></span>
        <div class="upd-ico">${icon.refresh}</div>
        <h2 class="status-title gtext">${back ? '버전 변경' : '앱 업데이트'}</h2>
        <p class="upd-ver">v${from}<span>${icon.chevronRight}</span><b>v${to}</b></p>
        <div class="upd-bar"><i data-v="bar"></i></div>
        <p class="upd-st" data-v="st">${back ? '이전 버전을' : '업데이트 파일을'} 내려받고 있습니다 · 0%</p>
        ${notesBox(to)}
        <span class="spacer" style="flex-grow: 160"></span>
      </div>`;
  },
  mount(el, { to, from, shot }) {
    const back = cmpVer(to, from) < 0;
    const bar = el.querySelector('[data-v="bar"]');
    const st = el.querySelector('[data-v="st"]');
    const label = back ? '이전 버전을' : '업데이트 파일을';
    if (shot) {
      bar.style.width = '64%';
      st.textContent = `${label} 내려받고 있습니다 · 64%`;
      return;
    }
    const t0 = performance.now();
    const DL = 2600;
    const step = () => {
      if (!el.isConnected) return;
      const p = Math.min(1, (performance.now() - t0) / DL);
      bar.style.width = `${Math.round(p * 100)}%`;
      if (p < 1) {
        st.textContent = `${label} 내려받고 있습니다 · ${Math.round(p * 100)}%`;
        return requestAnimationFrame(step);
      }
      st.textContent = '설치하고 있습니다';
      el.classList.add('installing');
      setTimeout(() => {
        if (!el.isConnected) return;
        st.textContent = `v${to} ${back ? '변경' : '업데이트'} 완료 · 앱을 다시 시작합니다`;
        el.classList.add('done');
        setTimeout(() => {
          install(to);
          reset('splash', {}, 'fade');
          toast(`v${to}(으)로 ${back ? '변경' : '업데이트'}되었습니다.`);
        }, 900);
      }, 1100);
    };
    requestAnimationFrame(step);
  },
  // the update cannot be interrupted
  onBack: () => true,
});

/* ---------------- 사용자설정: 앱 정보 → 현재 버전 → 버전 이력 화면 ---------------- */
const STATE_BADGE = {
  latest: ['최신 버전', 'ok'],
  optional: ['업데이트 가능', 'new'],
  force: ['필수 업데이트', 'force'],
};

const openVers = new Set(); // 버전 이력: versions whose details are shown ('>' → open)

/** 사용자설정 '앱 정보': 현재 버전 (누르면 버전 이력) · 최신 · 최소 지원 · 업데이트 확인. */
export function appInfoSection() {
  const cur = installed();
  const [label, tone] = STATE_BADGE[updateState(cur)];
  return `
    <p class="set-label">앱 정보</p>
    <div class="set-card app-info">
      <button class="app-row link" data-act="open-versions"><span>현재 버전</span><span class="v"><b>v${cur}</b><span class="app-badge ${tone}">${label}</span><span class="chev">${icon.chevronRight}</span></span></button>
      <div class="app-row"><span>최신 버전</span><span class="v">v${LATEST}</span></div>
      <div class="app-row"><span>최소 지원 버전</span><span class="v">v${MIN_SUPPORTED}</span></div>
      <button class="app-row link" data-act="check-update"><span>업데이트 확인</span><span class="chev">${icon.chevronRight}</span></button>
    </div>`;
}

function versionCard(x, cur) {
  const isCur = x.v === cur;
  const tags = [
    isCur ? '<span class="ver-tag cur">현재</span>' : '',
    x.v === LATEST ? '<span class="ver-tag new">최신</span>' : '',
    cmpVer(x.v, MIN_SUPPORTED) < 0 ? '<span class="ver-tag end">지원 종료</span>' : '',
  ].join('');
  const act = isCur
    ? '<p class="ver-using">사용 중인 버전</p>'
    : `<button class="ver-btn${cmpVer(x.v, cur) < 0 ? ' back' : ''}" data-act="pick-version" data-v="${x.v}">${
        cmpVer(x.v, cur) > 0 ? '이 버전으로 업데이트' : '이 버전으로 변경'
      }</button>`;
  const open = openVers.has(x.v);
  return `
    <div class="set-card ver-card${isCur ? ' cur' : ''}${open ? ' open' : ''}">
      <button class="ver-head" data-act="ver-toggle" data-v="${x.v}" aria-expanded="${open}">
        <b>v${x.v}</b>${tags}<span class="ver-date">${x.date}</span><span class="ver-chev">${icon.chevronRight}</span>
      </button>
      ${open ? `<ul class="ver-notes">${x.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>${act}` : ''}
    </div>`;
}

/* 버전 이력: every version folded behind '>', the current one opened on entry; a past version can be changed to */
register('versions', {
  bg: 'gray',
  render: () => {
    const cur = installed();
    return `
      ${header({ title: '버전 이력', left: 'back' })}
      <div class="screen-body scroll setting vers">
        <p class="set-note ver-guide">버전을 누르면 변경 사항이 보입니다.<br>이전 버전은 '이 버전으로 변경'을 눌러 그 버전으로 이동할 수 있습니다.</p>
        <div class="ver-list">${VERSIONS.map((x) => versionCard(x, cur)).join('')}</div>
      </div>`;
  },
  actions: {
    'hdr-back': () => pop(),
    // '>' shows that version's changes and its update / change button
    'ver-toggle': (t) => {
      const v = t.dataset.v;
      if (openVers.has(v)) openVers.delete(v);
      else openVers.add(v);
      rerender();
    },
    'pick-version': (t) => pickVersion(t.dataset.v),
  },
});

function pickVersion(to) {
  const cur = installed();
  const up = cmpVer(to, cur) > 0;
  const below = cmpVer(to, MIN_SUPPORTED) < 0;
  openDialog(
    up
      ? {
          title: '버전 업데이트',
          tone: 'info',
          desc: `v${cur} → v${to}(으)로 업데이트합니다.\n업데이트 후 앱이 다시 시작됩니다.`,
          buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '업데이트', act: 'ok' }],
        }
      : {
          title: '이전 버전으로 변경',
          desc: `v${cur} → v${to}(으)로 되돌립니다.\n${
            below
              ? `최소 지원 버전(v${MIN_SUPPORTED})보다 낮아\n다시 시작하면 필수 업데이트가 필요합니다.`
              : `v${to} 이후에 추가된 기능은 사용할 수 없습니다.`
          }`,
          buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '변경', act: 'ok' }],
        },
    {
      cancel: () => closeSheet(),
      ok: () => {
        closeSheet();
        startUpdate(to);
      },
    },
  );
}

/** Actions the 사용자설정 screen spreads in. */
export const APP_INFO_ACTIONS = {
  // 현재 버전 → 버전 이력 (the current version opened)
  'open-versions': () => {
    openVers.clear();
    openVers.add(installed());
    go('versions');
  },
  'check-update': () => {
    const st = updateState();
    if (st === 'latest') return toast(`최신 버전(v${LATEST})을 사용하고 있습니다.`);
    openUpdatePrompt(st === 'force');
  },
};
