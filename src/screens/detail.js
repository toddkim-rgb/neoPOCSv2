// 환자 상세 (neo-med-detail-01): demographics, care info, allergy/infection, vitals, AI records, today's plan.
// Shows the selected patient (PATIENT); AI 음성간호메모 = memos saved in this session first, then the patient's EMR history.
// 멀티미디어 (2026-11-23): the AI camera's 사진 기록 (주입 펌프 · 환부 · 기타) and the 사진 · 동영상 · 음성기록 added
// with '+ 추가' (media.js, this patient: no wristband scan), newest first; a tapped item opens with its memo.
// 임상관찰기록 (2026-11-23): 최종 측정 6칸; '직전 기록 보기' shows the same 6 cells with each item's previous
// measurement within 24 hours (the small history table was removed: too small to read on the PDA).
import { register, go, pop, rerender } from '../router.js';
import { confirmReset } from './med.js';
import { header, aiButton, badge, esc, medGroups, patientName } from '../ui.js';
import { icon, sparkles } from '../icons.js';
import { patientTitle, PATIENT, NURSE } from '../data.js';
import { state } from '../state.js';
import { flagOf } from './vitals.js';
import { photoRow } from './photo.js';
import { mediaRow, openMediaList, openMediaViewer } from './media.js';
import { scriptBubbles } from './voice.js';

const infoCard = (title, rows) => `
  <section class="dcard">
    <h3 class="dcard-title">${title}</h3>
    ${rows.map(([k, v]) => `<div class="drow"><span class="k">${k}</span><span>${esc(v)}</span></div>`).join('')}
  </section>`;

// 환자 기본정보 + 환자상세를 한 카드로 (2026-11-27 요청: 상세정보 · 병상정보가 두 군데 중복 출력되던 것을 합침)
const basicCard = () => `
  <section class="dcard">
    <h3 class="dcard-title">${patientName()}</h3>
    <div class="drow"><span class="k">병상정보</span><span>${PATIENT.bed}</span></div>
    <div class="drow"><span class="k">상세정보</span><span>${PATIENT.detail}</span></div>
    <div class="drow"><span class="k">체격정보</span><span>${PATIENT.body}</span></div>
  </section>`;

// one measurement = one time: it is shown once in the card head, so the cells are shorter (same fonts).
// A cell keeps its own time only if it differs from the rest.
const vitalCell = (v, head, empty = '미측정') => `
  <div class="vcell">
    <div class="vcell-top"><span class="vk">${v.k}</span>${v.flag ? `<span class="vflag ${v.flag}">${v.flag === 'danger' ? '경고' : '주의'}</span>` : ''}</div>
    <div class="vcell-mid">${
      String(v.v ?? '').trim() ? `<span class="vv ${v.flag || ''}">${v.v}</span><span class="vu">${v.unit}</span>` : `<span class="vv none">${empty}</span>`
    }</div>
    ${v.at && v.at !== head ? `<p class="vat">${v.at}</p>` : ''}
  </div>`;
/** 측정 일시 (MM/DD HH:MM) of the latest record. */
const measuredAt = () => state.vitals.items[0]?.at || state.vitals.time;

/**
 * 활력징후 트렌드 (환자 상세 '트렌드 보기', 2026-11-27 요청): '직전 기록'(24시간 전 값만) 대신 지난 3일 그래프.
 * 라이브러리 없이 손으로 그리는 작은 꺾은선(SVG) — state.pt[pid].vhist(과거 3일, 오래된 순 아님: 최신이 앞)를 뒤집고
 * 맨 끝에 지금 값을 더해 '오래된 → 최신' 순서로 만든다.
 */
function trendSeries(k) {
  const hist = [...state.pt[state.pid].vhist].reverse();
  const pts = hist.map((r) => ({ at: r.at, v: parseFloat(r.values[k]) })).filter((p) => Number.isFinite(p.v));
  const now = state.vitals.items.find((i) => i.k === k);
  if (now && String(now.v ?? '').trim()) pts.push({ at: now.at || measuredAt(), v: parseFloat(now.v) });
  return pts;
}
function sparkline(pts, w = 96, h = 34) {
  if (pts.length < 2) return `<svg viewBox="0 0 ${w} ${h}" class="trend-svg" aria-hidden="true"></svg>`;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const stepX = w / (pts.length - 1);
  const y = (v) => h - 5 - ((v - min) / span) * (h - 9);
  const coords = vals.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`);
  const [lx, ly] = coords[coords.length - 1].split(',');
  return `
    <svg viewBox="0 0 ${w} ${h}" class="trend-svg" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${coords.join(' ')}" fill="none" />
      <circle cx="${lx}" cy="${ly}" r="2.4" />
    </svg>`;
}
function trendCard() {
  const cells = state.vitals.items
    .map((i) => {
      const pts = trendSeries(i.k);
      const last = pts[pts.length - 1];
      const flag = last ? flagOf(i.k, String(last.v)) : '';
      const range = pts.length ? `${Math.min(...pts.map((p) => p.v))}–${Math.max(...pts.map((p) => p.v))} ${i.unit}` : '데이터 없음';
      return `
      <div class="vcell trend-cell">
        <div class="vcell-top"><span class="vk">${i.k}</span>${flag ? `<span class="vflag ${flag}">${flag === 'danger' ? '경고' : '주의'}</span>` : ''}</div>
        ${sparkline(pts)}
        <p class="trend-range">${esc(range)}</p>
      </div>`;
    })
    .join('');
  return `
    <div class="vprev trend">
      <div class="vprev-head"><span class="vprev-title">활력징후 트렌드</span><small>최근 3일</small></div>
      <div class="vgrid prev">${cells}</div>
    </div>`;
}

const aiEntry = (e, i) => {
  const open = state.scriptOpen.detail[i];
  return `
    <div class="ai-entry">
      <div class="ai-entry-head"><span>${NURSE.label}</span><span class="ai-time">${icon.alarmOutline}${e.at}</span></div>
      <div class="ai-sum numbered${i === 0 ? ' active' : ''}">${e.summary
        .map((s, n) => `<p class="ai-sum-t">${n + 1}. ${esc(s.title)}</p><p class="ai-sum-d">${esc(s.desc)}</p>`)
        .join('')}</div>
      <button class="script-toggle" data-act="toggle" data-i="${i}"><span>시간별 대화 스크립트 (${e.transcript.length}턴)</span><span class="chev">${open ? icon.arrowUp : icon.arrowDown}</span></button>
      ${open ? `<div class="chat">${scriptBubbles(e.transcript)}</div>` : ''}
    </div>`;
};

/** Up to two entries: memos saved in this session ('2026.09.17 17:05' → '26/09/17 17:05'), then the EMR history. */
function aiEntries() {
  const fresh = state.memos
    .filter((m) => m.fresh)
    .map((m) => ({ at: m.at.slice(2).replace(/\./g, '/'), summary: m.items, transcript: m.script }));
  const ai = PATIENT.ai;
  const history = Array.from({ length: ai.repeat || 1 }, () => ai);
  return { list: [...fresh, ...history].slice(0, 2), count: ai.count + fresh.length };
}

const pills = (items) =>
  items.length ? items.map((a) => `<span class="pill">${esc(a)}</span>`).join('') : '<span class="pill none">없음</span>';

function planCard() {
  const orders = state.orders.filter((o) => !o.prn);
  const rows = (o) => {
    const hist = o.hist
      .map(
        (r) =>
          `<div class="trow"><span class="l"><span class="dot"></span><span class="t">${r.time} </span><span class="tag${r.st === 'Y' ? '' : ' no'}">${icon.tagFill}<span>${r.st}</span></span></span><span class="who">${esc(r.who)}</span></div>`,
      )
      .join('');
    const next = o.now
      ? `<div class="trow future"><span class="l"><span class="dot"></span><span class="t">${o.now.time} </span><span class="tag off">${icon.tagFill}<span>Y</span></span></span><span class="who"></span></div>`
      : '';
    return hist + next;
  };
  const card = (o) => `
    <div class="med-card">
      <div class="med-top"><span class="l">${badge(o.type)}${o.tags.map((t) => badge(t.t, t.kind || '')).join('')}</span>${badge(`${o.count[0]}/${o.count[1]}회`)}</div>
      <p class="med-name">${esc(o.name)}</p>
      <div class="med-rows">${rows(o)}</div>
    </div>`;
  return `
    <div class="medlist plan">
      <div class="medlist-head"><span class="l"><span class="medlist-title gtext">금일 투약 플랜</span></span>${badge(`총 ${orders.length}건`, 'count-grad')}</div>
      <div class="meds">${medGroups(orders)
        .map((g) => `<div class="med"><span class="med-bar" style="background: var(--bar-${g.bar})"></span><div class="med-cards">${g.items.map(card).join('')}</div></div>`)
        .join('')}</div>
    </div>`;
}

/**
 * 멀티미디어: 사진 기록 (AI 카메라) + 사진 · 동영상 · 음성기록, newest first ('MM/DD HH:MM' sorts as text).
 * 2026-11-27 요청: 여기엔 더 이상 '+ 추가'가 없고(추가는 새 멀티미디어 상세화면에서), 카드 머리를 누르면 그 상세화면으로 이동.
 */
function mediaCard() {
  const s = state.pt[state.pid];
  const rows = [...s.media.map((m) => [m.at, mediaRow(m)]), ...s.photos.map((p) => [p.at, photoRow(p)])].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return `
      <section class="dcard photo-records">
        <button class="dcard-head" data-act="media-list"><h3 class="dcard-title">멀티미디어</h3><span class="ai-count">총 ${rows.length}건</span><span class="chev">${icon.chevronRight}</span></button>
        <div class="ph-list">${rows.length ? rows.map((r) => r[1]).join('') : '<p class="ph-empty">사진 · 동영상 · 음성기록이 없습니다.</p>'}</div>
      </section>`;
}

register('detail', {
  bg: 'screen',
  render: () => {
    const ai = aiEntries();
    return `
    ${header({ title: '환자 상세', left: 'back', right: 'menu' })}
    <div class="screen-body scroll detail">
      ${basicCard()}
      ${aiButton()}
      ${infoCard('진료상세', [['주진단명', PATIENT.dx], ['시술명', PATIENT.surgery], ['진료과', PATIENT.dept], ['담당의', PATIENT.doctor], ['입원일시', PATIENT.admitted]])}
      <section class="dcard allergy">
        <h3 class="dcard-title">${icon.allergy}<span>약물이상반응</span><small>(Allergy)</small></h3>
        <div class="pills">${pills(PATIENT.allergies)}</div>
      </section>
      <section class="dcard infection">
        <h3 class="dcard-title">${icon.infection}<span>감염정보</span><small>(Infection)</small></h3>
        <div class="pills">${pills(PATIENT.infections)}</div>
      </section>
      <section class="dcard vitals">
        <div class="dcard-head"><h3 class="dcard-title">임상관찰기록</h3><span class="dcard-meta vmeta">${icon.alarmOutline}<b>${measuredAt()}</b><i></i>${state.vitals.who}</span></div>
        <div class="vgrid">${state.vitals.items.map((v) => vitalCell(v, measuredAt())).join('')}</div>
        ${state.vhistOpen ? trendCard() : ''}
        <button class="vhist-toggle" data-act="vitals-more" aria-expanded="${state.vhistOpen}">${
          state.vhistOpen ? '트렌드 접기' : '트렌드 보기'
        }<span class="chev">${state.vhistOpen ? icon.arrowUp : icon.arrowDown}</span></button>
      </section>
      <section class="dcard ai-records">
        <div class="dcard-head"><h3 class="ai-label"><span class="ai-spark">${sparkles('dt-spark', '#B07CFF', '#5B2BC7')}</span>AI 음성간호메모</h3><span class="ai-count">총 ${ai.count}건</span></div>
        ${ai.list.map(aiEntry).join('')}
      </section>
      ${mediaCard()}
      ${planCard()}
    </div>`;
  },
  actions: {
    'hdr-back': () => pop(),
    'hdr-menu': () => confirmReset('menu'),
    voice: () => {
      state.voice.origin = 'detail';
      go('voice', { step: 'record' });
    },
    // 임상관찰기록: 기본 = 최종 측정 · 직전 기록 보기 = 항목별 이전 측정 (24시간 이내)
    'vitals-more': () => {
      state.vhistOpen = !state.vhistOpen;
      rerender();
    },
    // 멀티미디어: 카드 머리 → 상세화면(mlist, 전체 목록 + 추가) · 항목 보기 / 메모 수정 / 삭제는 그대로 여기서도 가능
    'media-list': () => openMediaList(),
    'media-open': (t) => openMediaViewer(t.dataset.id),
    toggle: (t) => {
      const i = +t.dataset.i;
      state.scriptOpen.detail[i] = !state.scriptOpen.detail[i];
      rerender();
    },
  },
});
