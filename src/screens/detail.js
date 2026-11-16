// 환자 상세 (neo-med-detail-01): demographics, care info, allergy/infection, vitals, AI records, today's plan.
// Shows the selected patient (PATIENT); AI 음성간호메모 = memos saved in this session first, then the patient's EMR history.
import { register, go, pop, rerender } from '../router.js';
import { confirmReset } from './med.js';
import { header, aiButton, badge, esc, medGroups, patientLine } from '../ui.js';
import { icon, sparkles } from '../icons.js';
import { patientTitle, PATIENT, NURSE } from '../data.js';
import { state, vitalRow } from '../state.js';
import { flagOf } from './vitals.js';
import { scriptBubbles } from './voice.js';

const infoCard = (title, rows) => `
  <section class="dcard">
    <h3 class="dcard-title">${title}</h3>
    ${rows.map(([k, v]) => `<div class="drow"><span class="k">${k}</span><span>${esc(v)}</span></div>`).join('')}
  </section>`;

// one measurement = one time: it is shown once in the card head, so the cells are shorter (same fonts).
// A cell keeps its own time only if it differs from the rest.
const vitalCell = (v, head) => `
  <div class="vcell">
    <div class="vcell-top"><span class="vk">${v.k}</span>${v.flag ? `<span class="vflag ${v.flag}">${v.flag === 'danger' ? '경고' : '주의'}</span>` : ''}</div>
    <div class="vcell-mid"><span class="vv ${v.flag || ''}">${v.v}</span><span class="vu">${v.unit}</span></div>
    ${v.at && v.at !== head ? `<p class="vat">${v.at}</p>` : ''}
  </div>`;
/** 측정 일시 (MM/DD HH:MM) of the latest record. */
const measuredAt = () => state.vitals.items[0]?.at || state.vitals.time;

/* 임상관찰기록 상세보기: every measurement, newest first — MM/DD HH:MM + the six values (주의 · 경고 coloured) */
const VH_KEYS = [
  ['SBP', 'mmHg'],
  ['DBP', 'mmHg'],
  ['PR', '회/min'],
  ['RR', '회/min'],
  ['BT', '°C'],
  ['SpO2', '%'],
];
function vitalHistoryTable() {
  const rows = [vitalRow(state.vitals), ...state.pt[state.pid].vhist];
  const cell = (k, v) => `<span class="vh-v ${flagOf(k, v) || ''}">${esc(v ?? '-')}</span>`;
  return `
    <div class="vhist" role="table" aria-label="임상관찰기록 이전 측정">
      <div class="vh-row vh-head" role="row"><span class="vh-at">측정 일시</span>${VH_KEYS.map(([k, u]) => `<span>${k}<small>${u}</small></span>`).join('')}</div>
      ${rows
        .map(
          (r, i) =>
            `<div class="vh-row${i === 0 ? ' latest' : ''}" role="row"><span class="vh-at">${r.at}${i === 0 ? '<em>최종</em>' : ''}</span>${VH_KEYS.map(([k]) => cell(k, r.values[k])).join('')}</div>`,
        )
        .join('')}
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

register('detail', {
  bg: 'screen',
  render: () => {
    const ai = aiEntries();
    return `
    ${header({ title: '환자 상세', left: 'back', right: 'menu' })}
    <div class="screen-body scroll detail">
      ${patientLine()}
      ${aiButton()}
      ${infoCard('환자상세', [['상세정보', PATIENT.detail], ['병상정보', PATIENT.bed], ['체격정보', PATIENT.body]])}
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
        ${state.vhistOpen ? vitalHistoryTable() : `<div class="vgrid">${state.vitals.items.map((v) => vitalCell(v, measuredAt())).join('')}</div>`}
        <button class="vhist-toggle" data-act="vitals-more" aria-expanded="${state.vhistOpen}">${
          state.vhistOpen ? '최종 측정만 보기' : `상세보기 · 이전 측정 ${state.pt[state.pid].vhist.length}건`
        }<span class="chev">${state.vhistOpen ? icon.arrowUp : icon.arrowDown}</span></button>
      </section>
      <section class="dcard ai-records">
        <div class="dcard-head"><h3 class="ai-label"><span class="ai-spark">${sparkles('dt-spark', '#B07CFF', '#5B2BC7')}</span>AI 음성간호메모</h3><span class="ai-count">총 ${ai.count}건</span></div>
        ${ai.list.map(aiEntry).join('')}
      </section>
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
    // 임상관찰기록: 기본 = 최종 측정 · 상세보기 = 이전 측정까지 (MM/DD HH:MM + VS)
    'vitals-more': () => {
      state.vhistOpen = !state.vhistOpen;
      rerender();
    },
    toggle: (t) => {
      const i = +t.dataset.i;
      state.scriptOpen.detail[i] = !state.scriptOpen.detail[i];
      rerender();
    },
  },
});
