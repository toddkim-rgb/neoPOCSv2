// 음성간호메모 메인 (00: 환자별 확인대기 목록) → 환자별 메모 (01 수행별 · 02 병상 라운딩) — SSol design, phase 3.
// Reviewing a memo ("AI가 요약한 콘텐츠를 검토했습니다.") turns 확인대기 into 확인완료.
import { register, go, pop, rerender } from '../router.js';
import { header, asset3d, esc, toast, patientCard } from '../ui.js';
import { icon, sparkles } from '../icons.js';
import { NURSE, TRANSCRIPT, patientTitle } from '../data.js';
import { PATIENTS, fullName } from '../patients.js';
import { state, selectPatient } from '../state.js';
import { aiBar, mountAiBar, AI_ACTIONS, aiBack } from '../aibar.js';
import { openMedDialog } from './med.js';
import { scriptBubbles } from './voice.js';

const meta = (a, b) => `<span class="meta">${esc(a)}<i class="sep">|</i>${esc(b)}</span>`;
const chip = (text, tone) => `<span class="gchip ${tone}"><span>${esc(text)}</span></span>`;
const sortAt = (m) => m.at.replace(/\D/g, '');

/** One row per patient who has memos (이름순), computed from their memos. */
function memoPatients() {
  return PATIENTS.filter((p) => state.pt[p.id].memos.length)
    .map((p) => {
      const ms = state.pt[p.id].memos;
      const latest = [...ms].sort((a, b) => sortAt(b).localeCompare(sortAt(a)))[0];
      return { id: p.id, name: fullName(p), sex: p.sex, at: latest.at, total: ms.length, pending: ms.filter((m) => !m.reviewed).length };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

register('vmain', {
  bg: 'screen',
  render: (params) => {
    const rows = memoPatients();
    const pending = rows.reduce((n, r) => n + r.pending, 0);
    return `
      ${header({ title: '음성간호메모', right: 'menu' })}
      <div class="screen-body scroll hub-body vmain">
        <div class="hub-hello">
          <span class="hub-spark">${sparkles('vm-spark', '#C9A6FF', '#8B5CF6')}</span>
          <p class="hub-headline">확인대기 <span class="ptext">음성간호메모</span>가<br><span class="ptext">${pending}건</span> 있습니다.</p>
        </div>
        <div class="mylist memo-rows">${rows
          .map(
            (r) => `
          <button class="myrow" data-act="open-memos" data-pid="${r.id}">
            <img class="myrow-ava" src="${asset3d(r.sex === 'f' ? 'avatar-female' : 'avatar-male')}" alt="">
            <span class="myrow-body"><span class="myrow-name">${esc(r.name)}</span>${meta(r.at, `총 ${r.total}건`)}</span>
            ${r.pending ? chip('확인대기', 'purple') : ''}
          </button>`,
          )
          .join('')}</div>
      </div>
      ${aiBar()}`;
  },
  mount: (el, params) => mountAiBar(el, params),
  actions: {
    ...AI_ACTIONS,
    'hdr-menu': () => go('navmenu'),
    'open-memos': (t) => {
      selectPatient(t.dataset.pid);
      go('vpatient');
    },
  },
  onBack: () => aiBack(),
});

/* ---------------- 환자별 음성간호메모 ---------------- */
const openScripts = new Set();

function memoCard(m) {
  const lines = m.script || TRANSCRIPT;
  const open = openScripts.has(m.id);
  return `
    <section class="memo-card">
      <div class="memo-head">
        <span class="l"><i class="gdot" style="background:${m.color}"></i><b>${esc(m.type)}</b><span class="at">${esc(m.at)}</span></span>
        ${m.reviewed ? chip('확인완료', 'green') : chip('확인대기', 'purple')}
      </div>
      <div class="memo-items">${m.items.map((i) => `<p class="mi-t">${esc(i.title)}</p><p class="mi-d">${esc(i.desc)}</p>`).join('')}</div>
      <div class="memo-script${open ? ' open' : ''}">
        <button class="memo-toggle" data-act="script" data-id="${m.id}" aria-expanded="${open}"><span>시간별 대화 스크립트 (${lines.length}턴)</span><span class="chev">${open ? icon.arrowUp : icon.arrowDown}</span></button>
        ${open ? `<div class="chat">${scriptBubbles(lines)}</div>` : ''}
      </div>
      <div class="memo-foot">
        <button class="memo-check${m.reviewed ? ' on' : ''}" data-act="review" data-id="${m.id}" role="checkbox" aria-checked="${m.reviewed}"><span class="cb">${icon.check}</span><span>AI가 요약한 콘텐츠를 검토했습니다.</span></button>
        <span class="who">${esc(m.who || NURSE.label)}</span>
      </div>
    </section>`;
}

register('vpatient', {
  bg: 'screen',
  render: (params) => {
    if (params.tab) state.memoTab = params.tab;
    const tab = state.memoTab;
    const list = state.memos.filter((m) => m.kind === tab);
    return `
      ${header({ title: patientTitle(), left: 'back', right: 'menu' })}
      <div class="screen-body scroll vpatient">
        ${patientCard({ prn: state.orders.some((o) => o.prn) })}
        <div class="sort-row memo-tabs" role="tablist">
          <button class="sort-chip${tab === 'perform' ? ' on' : ''}" data-act="tab" data-t="perform" role="tab" aria-selected="${tab === 'perform'}">수행별</button>
          <button class="sort-chip${tab === 'round' ? ' on' : ''}" data-act="tab" data-t="round" role="tab" aria-selected="${tab === 'round'}">병상 라운딩</button>
        </div>
        ${list.length ? list.map(memoCard).join('') : '<p class="memo-empty">음성간호메모가 없습니다.</p>'}
      </div>`;
  },
  actions: {
    'hdr-back': () => pop(),
    'hdr-menu': () => go('navmenu'),
    'patient-detail': () => go('detail'),
    'prn-info': () => openMedDialog('prn'),
    tab: (t, params) => {
      state.memoTab = t.dataset.t;
      params.tab = t.dataset.t;
      rerender();
    },
    script: (t) => {
      const id = t.dataset.id;
      if (openScripts.has(id)) openScripts.delete(id);
      else openScripts.add(id);
      rerender();
    },
    review: (t) => {
      const m = state.memos.find((x) => x.id === t.dataset.id);
      m.reviewed = !m.reviewed;
      rerender();
      if (m.reviewed) toast('AI 요약 검토를 완료했습니다.');
    },
  },
});
