import { icon, aiBadge } from './icons.js';
import { PATIENT } from './data.js';
import { state } from './state.js';
import { feedback } from './feedback.js';

const img3d = import.meta.glob('./assets/img/3d/*.{png,svg}', { eager: true, query: '?url', import: 'default' });
export const asset3d = (name) => img3d[`./assets/img/3d/${name}.png`] || img3d[`./assets/img/3d/${name}.svg`];

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- header ---------- */
// align 'left': title at the left edge (사용자 설정 · 햄버거메뉴) · titleAct: the title is a button (환자허브 → 사용자설정)
export function header({ title, left = null, right = null, align = 'center', titleAct = '' }) {
  const btn = (kind) => {
    if (!kind) return align === 'left' ? '' : '<span class="icon-btn ghost"></span>';
    const map = { back: ['back', '뒤로'], menu: ['menu', '메뉴'], close: ['close', '닫기'] };
    const [ico, label] = map[kind];
    return `<button class="icon-btn" data-act="hdr-${kind}" aria-label="${label}">${icon[ico]}</button>`;
  };
  const t = titleAct
    ? `<h1 class="hdr-title"><button class="hdr-title-btn" data-act="${titleAct}">${esc(title)}</button></h1>`
    : `<h1 class="hdr-title">${esc(title)}</h1>`;
  return `<header class="hdr${align === 'left' ? ' left' : ''}">${btn(left)}${t}${btn(right)}</header>`;
}

/* ---------- buttons ---------- */
export const button = (label, act, { cta = false, disabled = false, long = '' } = {}) =>
  `<button class="btn${cta ? ' cta' : ''}" data-act="${act}"${long ? ` data-long="${long}"` : ''}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;

export const aiButton = (act = 'voice') =>
  `<button class="btn-ai" data-act="${act}"><span class="ai-ico">${aiBadge}</span><span>음성간호메모 진행하기</span></button>`;

/* ---------- centered status block ---------- */
export const statusBlock = ({ img, title, desc }) => `
  <div class="status">
    <div class="status-ico"><img src="${asset3d(img)}" alt=""></div>
    <h2 class="status-title gtext">${esc(title)}</h2>
    <p class="status-desc">${esc(desc)}</p>
  </div>`;

/* ---------- patient summary card ---------- */
// 주의사항: 감염 · 알러지 icons when the patient has any (planning: "1개라도 존재 시 아이콘 표기"),
// plus a PRN icon (opens the PRN 안내 popup) when the patient has PRN orders.
// `scanWarn`: the patient was matched from a prescription but their wristband is not scanned yet.
// 환자 이름 · 등록번호 sit in the patient box, not the header (요청: the hub header shows the nurse, so a name up
// there was confusing); the header shows the 업무명 instead.
const patientName = () => `<span class="pn">${esc(PATIENT.name)}</span><span class="pid">${PATIENT.id}</span>`;

/** Screens without the patient box: one line with 이름 · 등록번호 · 병상 · 상세정보. */
export const patientLine = () => `
  <div class="pline">${patientName()}<i></i><span>${PATIENT.bed}</span><i></i><span>${PATIENT.detail}</span></div>`;

// 환자허브에서 고른 환자의 업무 (투약 · 채혈 · 수혈 · 활력징후, 2026-11-23): locked = 팔찌 스캔 전, 환자정보 비활성
// (흐리게 · '환자 미확인') → confirmed = 팔찌 스캔 후, 환자정보 활성 (✓ 환자 확인)
export const patientCard = ({ prn = false, scanWarn = false, act = 'patient-detail', confirmed = false, locked = false } = {}) => `
  <div class="pcard${scanWarn ? ' warn' : ''}${confirmed ? ' ok' : ''}${locked ? ' locked' : ''}"${act ? ` data-act="${act}" role="button" aria-label="환자 상세 보기"` : ''}>
    <div class="pcard-name">${patientName()}${confirmed ? `<span class="pcard-ok">${icon.check}환자 확인</span>` : ''}${locked ? '<span class="pcard-lock">환자 미확인</span>' : ''}${act ? `<span class="pcard-go">${icon.chevronRight}</span>` : ''}</div>
    <div class="pcard-row"><span class="k">상세정보</span><span>${PATIENT.detail}</span></div>
    <div class="pcard-row"><span class="k">병상정보</span><span>${PATIENT.bed}</span></div>
    <div class="pcard-row"><span class="k">주진단명</span><span>${esc(PATIENT.dx)}</span></div>
    <div class="pcard-row last"><span class="k">주의사항</span>
      <span class="mini">
        ${PATIENT.infections.length ? `<span class="mini-badge infection">${icon.infection}</span>` : ''}
        ${PATIENT.allergies.length ? `<span class="mini-badge allergy">${icon.allergy}</span>` : ''}
        ${!PATIENT.infections.length && !PATIENT.allergies.length && !prn ? '<span class="mini-none">없음</span>' : ''}
        ${prn ? `<button class="mini-badge prn" data-act="prn-info" aria-label="PRN 처방 안내">${icon.medCross}</button>` : ''}
      </span>
    </div>
    ${
      scanWarn
        ? `<div class="scan-warn"><img src="${asset3d('warning-yellow')}" alt=""><span><b class="otext">환자 스캔</b><span>환자 스캔 작업이 이행되지않았습니다.</span></span></div>`
        : ''
    }
  </div>`;

/* ---------- badges & tags ---------- */
export const badge = (text, kind = '') => `<span class="badge${kind ? ` ${kind}` : ''}">${esc(text)}</span>`;

export function statusTag(st, { off = false, act = '', id = '' } = {}) {
  const cls = off ? ' off' : st !== 'Y' ? ' no' : '';
  const attrs = act ? ` data-act="${act}" data-id="${id}" role="button"` : '';
  return `<span class="tag${cls}"${attrs}>${icon.tagFill}<span>${esc(st)}</span></span>`;
}

/* ---------- medication list ---------- */
function timeRow(row) {
  return `<div class="trow"><span class="l"><span class="dot"></span><span class="t">${row.time} </span>${statusTag(row.st)}</span><span class="who">${esc(row.who)}</span></div>`;
}

// PRN (실시간) doses: time and status cannot be changed, so both pills stay grey.
function nowRow(o, interactive) {
  const off = !!o.prn;
  const tagAct = interactive && !off ? 'status-sheet' : '';
  const timeAct = interactive && !off ? ' data-act="time-sheet" data-id="' + o.id + '" role="button"' : '';
  return `<div class="trow now"><span class="l"><span class="alarm-pill${off ? ' off' : ''}"${timeAct}>${icon.alarmFill}<span>${o.now.time} </span></span>${statusTag(o.now.st, { off, act: tagAct, id: o.id })}</span><span class="who">${esc(o.now.who)}</span></div>`;
}

// 이번 투약에서 제외된 약: the dose row shows the reason code and 되돌리기
const exclRow = (o, interactive) =>
  `<div class="trow excl-row"><span class="l"><span class="alarm-pill off">${icon.alarmFill}<span>${o.now.time} </span></span>${statusTag(o.excl.code)}<span class="excl-why">${esc(o.excl.label)}</span></span>${
    interactive ? `<button class="excl-undo" data-act="excl-undo" data-id="${o.id}">되돌리기</button>` : ''
  }</div>`;

/** A dose of this round that can be taken out of it: swipe left (or long-press) → 삭제 · 취소 (swipe.js). */
export const canExclude = (o) => !!o.now && !o.prn && !o.excl;

function medCard(o, { interactive = false, future = false } = {}) {
  const tags = o.tags.map((t) => badge(t.t, t.kind || '')).join('');
  const warn = o.ham ? `<img class="warn" src="${asset3d('warning-red')}" alt="고위험">` : '';
  const count = o.count ? `${o.count[0]}/${o.count[1]}회` : 'PRN';
  let rows = o.hist.map(timeRow).join('');
  if (o.now && o.excl) rows += exclRow(o, interactive);
  else if (o.now) rows += nowRow(o, interactive);
  else if (future) rows += `<div class="trow future"><span class="l"><span class="dot"></span><span class="t">17:00 </span>${statusTag('Y', { off: true })}</span><span class="who"></span></div>`;
  const card = `
    <div class="med-card${o.ham ? ' alert' : ''}${o.excl ? ' excluded' : ''}">
      <div class="med-top"><span class="l">${badge(o.type)}${tags}${warn}</span>${badge(count)}</div>
      <div><p class="med-name">${esc(o.name)}</p><p class="med-date">${esc(o.date)}</p></div>
      <div class="med-rows">${rows}</div>
    </div>`;
  if (!interactive) return card;
  // the 투약 list (both scans done): every card sits in a swipe row, only this round's doses can be swiped
  if (!canExclude(o)) return `<div class="mswipe fixed">${card}</div>`;
  return `
    <div class="mswipe" data-id="${o.id}">
      <div class="mswipe-acts"><button class="mswipe-btn del" data-act="excl" data-id="${o.id}">삭제</button><button class="mswipe-btn cancel" data-act="swipe-close">취소</button></div>
      ${card}
    </div>`;
}

export function medGroups(orders) {
  const groups = [];
  for (const o of orders) {
    const g = groups.find((x) => x.id === o.group);
    if (g) g.items.push(o);
    else groups.push({ id: o.group, bar: o.bar, items: [o] });
  }
  return groups;
}

export function medList({ interactive = false, title = '약물 투약하기', chips = true, orders = state.orders } = {}) {
  const groupsOf = (list) =>
    medGroups(list)
      .map(
        (g) => `
      <div class="med">
        <span class="med-bar" style="background: var(--bar-${g.bar})"></span>
        <div class="med-cards">${g.items.map((o) => medCard(o, { interactive })).join('')}</div>
      </div>`,
      )
      .join('');
  // 이번 투약에서 제외된 약 go to the bottom of the list (흐리게, 사유 · 되돌리기)
  const active = orders.filter((o) => !o.excl);
  const excluded = orders.filter((o) => o.excl);
  const groups = active.length ? groupsOf(active) : '<p class="meds-empty">이번에 투약할 약이 없습니다.</p>';
  const exclHtml = excluded.length
    ? `<div class="excl-head"><span>이번 투약에서 제외</span>${badge(`${excluded.length}건`)}</div><div class="meds excl">${groupsOf(excluded)}</div>`
    : '';
  const plan = state.planMode === 'plan';
  const chipHtml = chips
    ? `<span class="chips">
        <button class="chip${plan ? ' on' : ''}" data-act="mode" data-mode="plan"><span>플랜</span></button>
        <button class="chip${plan ? '' : ' on'}" data-act="mode" data-mode="live"><span>실시간</span></button>
      </span>`
    : '';
  return `
    <div class="medlist">
      <div class="medlist-head">
        <span class="l"><span class="medlist-title gtext">${esc(title)}</span>${chipHtml}</span>
        ${badge(`총 ${active.length}건`, 'count-grad')}
      </div>
      <div class="meds">${groups}</div>
      ${exclHtml}
    </div>`;
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------- bottom sheet ---------- */
let sheetCtx = null;

/** `opts.cls`: extra classes on the sheet (e.g. 'full' = a full-screen panel such as the 사진 선택 gallery). */
export function openSheet(html, handlers = {}, { cls = '' } = {}) {
  closeSheet(true);
  const layer = document.getElementById('sheet-layer');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-dim" data-sheet-act="dismiss"></div><div class="sheet${cls ? ` ${cls}` : ''}" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${html}</div>`;
  layer.appendChild(wrap);
  sheetCtx = { wrap, handlers };
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  wrap.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sheet-act]');
    if (!t) return;
    const act = t.dataset.sheetAct;
    if (act === 'dismiss') {
      closeSheet();
      return handlers.dismiss?.();
    }
    handlers[act]?.(t, e);
  });
}

export function closeSheet(immediate = false) {
  if (!sheetCtx) return false;
  const { wrap } = sheetCtx;
  sheetCtx = null;
  if (immediate) return wrap.remove(), true;
  wrap.classList.remove('open');
  setTimeout(() => wrap.remove(), 260);
  return true;
}

export const sheetOpen = () => !!sheetCtx;

/* ---------- centered popup (pop-error / pop-default-2way) ---------- */
// buttons: [{ label, act, line }] — `act` is a key of `handlers`; tone 'warn' = orange title, 'info' = blue.
// fb: the 알림 feedback (주간 소리 · 야간 진동) — 'error' for 불일치 · 인식 불가 …, 'alert' otherwise, false = none
const ERROR_TITLE = /불일치|인식 불가|스캔 필요|오더 없음|진행 중|없습니다/;
export function openDialog({ title, desc = '', body = '', tone = 'warn', cls = '', buttons = [{ label: '확인', act: 'ok' }], fb }, handlers = {}) {
  closeSheet(true);
  const kind = fb ?? (ERROR_TITLE.test(title) ? 'error' : 'alert');
  if (kind) feedback(kind);
  const layer = document.getElementById('sheet-layer');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap dlg-wrap';
  wrap.innerHTML = `<div class="sheet-dim"></div>
    <div class="dlg${cls ? ` ${cls}` : ''}" role="alertdialog" aria-modal="true">
      <p class="dlg-title t-${tone}">${esc(title)}</p>
      ${desc ? `<p class="dlg-desc">${esc(desc)}</p>` : ''}
      ${body}
      <div class="dlg-btns${buttons.length > 1 ? ' two' : ''}">${buttons
        .map((b) => `<button class="btn${b.line ? ' line' : ''}" data-sheet-act="${b.act}">${esc(b.label)}</button>`)
        .join('')}</div>
    </div>`;
  layer.appendChild(wrap);
  sheetCtx = { wrap, handlers };
  if (document.documentElement.classList.contains('shot')) wrap.classList.add('open');
  else requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  wrap.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sheet-act]');
    if (!t) return;
    const fn = handlers[t.dataset.sheetAct];
    if (fn) fn(t, e);
    else closeSheet();
  });
}
