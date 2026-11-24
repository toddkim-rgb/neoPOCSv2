// 사진 촬영 · 사진첨부 → 용도별 기록 (요청 2026-11-23). The app cannot know what will be photographed: the nurse picks
// 환자 · 장비 · 기타 on the '사진' sheet (camera chips switch it), the camera says what it detects, and every review
// screen can switch to another use ('다른 용도로 기록'):
//   환자 모니터 → 활력징후 (vitals.js vreview) · 주입 펌프 → 주입 정보 + 처방 속도 비교 (vpump)
//   환부 · 환자 상태 → 부위 · 유형 · 크기(직접 측정) · 이전 사진 비교 (vwound) · 기타 → 태그 · 메모로 간호기록 첨부 (vother)
// 자(눈금)로 크기를 추정하던 기능은 촬영 거리·각도에 따라 부정확해 뺐습니다 (2026-11-23 요청).
// 환자 팔찌 스캔은 기록/저장/첨부 버튼을 누를 때 합니다 (2026-11-24 요청, vitals.js의 patientKnown/withPatient와 같은
// 패턴): 그 전까지는 patientLine과 그 환자의 이전 기록(이전 사진 비교 · 처방 비교)을 보여주지 않습니다.
// Records are kept per patient (state.pt[pid].photos) and listed on 환자 상세 '사진 기록'.
// Not in the Figma file: built from the existing cards, chips, check rows and status blocks.
import { register, replace, pop, rerender } from '../router.js';
import { header, button, esc, toast, openSheet, closeSheet, patientLine, badge, statusBlock } from '../ui.js';
import { icon } from '../icons.js';
import { NURSE, DEMO_DATE } from '../data.js';
import { state } from '../state.js';
import { backToCamera, switchPurpose, patientKnown, withPatient } from './vitals.js';
import pumpUrl from '../assets/img/pump-photo.jpg';
import woundUrl from '../assets/img/wound-photo.jpg';
import woundPrevUrl from '../assets/img/wound-prev.jpg';

/* ---------------- demo pictures (what the browser's camera "sees") ----------------
   360×480 pictures. Their backgrounds run far past the frame: the camera view (overflow visible) shows the subject
   smaller than the screen, thumbnails clip to the frame. */
const svgOpen = (label) =>
  `<svg class="art" viewBox="0 0 360 480" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">`;

// Sample photos from the user (2026-11-23), each sharp in the middle of a 1350×2000 px frame whose surroundings are
// its own edges stretched and blurred (2.5 px per unit; the viewBox is the central 900×1200 px), so the camera view
// around the subject is filled too:
//   주입 펌프 (MCM 500, 100 mL/h) · 욕창 (천골, 자를 대고 찍은 사진) · 같은 욕창의 이전 사진 (09/15: 다른 각도, 더 붉음)
const photoArt = (url, label) => `${svgOpen(label)}
  <image href="${url}" x="-90" y="-160" width="540" height="800" preserveAspectRatio="none"/>
</svg>`;
const PUMP = photoArt(pumpUrl, '주입 펌프');
const WOUND = photoArt(woundUrl, '환부');
const WOUND_PREV = photoArt(woundPrevUrl, '환부 (이전 사진)');

// a consent form on a desk
const DOC = `${svgOpen('서류')}
  <rect x="-1500" y="-1500" width="3360" height="3480" fill="#8a6f55"/>
  <g transform="rotate(-3 180 220)">
    <rect x="66" y="56" width="228" height="320" fill="#fbfaf5" stroke="#d8d4c6"/>
    <text x="180" y="98" text-anchor="middle" font-size="17" font-weight="700" fill="#2f3440">수술 · 시술 동의서</text>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="90" y="${122 + i * 22}" width="${i % 3 === 2 ? 120 : 180}" height="6" rx="3" fill="#d7dbe2"/>`).join('')}
    <path d="M100 330c14-18 22 8 34-6s18-12 26 4 14-6 22-2" stroke="#2a3f7a" stroke-width="2" fill="none"/>
    <circle cx="250" cy="328" r="17" fill="none" stroke="#d0453b" stroke-width="2.5"/>
    <text x="250" y="333" text-anchor="middle" font-size="13" font-weight="700" fill="#d0453b">인</text>
  </g>
</svg>`;

/** Demo picture of `kind`: pump · wound · wound-prev · doc. */
export function artSvg(kind) {
  if (kind === 'pump') return PUMP;
  if (kind === 'wound') return WOUND;
  if (kind === 'wound-prev') return WOUND_PREV;
  if (kind === 'doc') return DOC;
  return '';
}

/* ---------------- 용도 선택 ---------------- */
export const PURPOSES = [
  { k: 'monitor', label: '환자 모니터', desc: '활력징후로 기록' },
  { k: 'pump', label: '주입 펌프', desc: '주입 정보 · 처방 속도 비교' },
  { k: 'wound', label: '환부 · 환자 상태', desc: '부위 · 유형 · 이전 사진 비교' },
  { k: 'other', label: '기타', desc: '서류 · 라벨 · 식사량 등 간호기록 첨부' },
];
export const PURPOSE_LABEL = Object.fromEntries(PURPOSES.map((p) => [p.k, p.label]));

/**
 * '무엇을 촬영하셨나요?' — where the photo goes. `onPick(k)` · `retake`: label of a last 'take again' row.
 */
export function openPurposeSheet({ title = '무엇을 촬영하셨나요?', hint, current = null, onPick, retake = null }) {
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">${title}</p></div>
     <p class="sheet-hint">${hint || '사진을 어디에 기록할지 골라 주세요.'}</p>
     <div class="sheet-list purpose-list">${PURPOSES.map(
       (p) =>
         `<button class="opt purpose${p.k === current ? ' sel' : ''}" data-sheet-act="pick" data-k="${p.k}"><span class="lbl">${p.label}<small>${p.desc}</small></span><span class="chev">${icon.chevronRight}</span></button>`,
     ).join('')}${
       retake ? `<button class="opt purpose retake" data-sheet-act="pick" data-k="retake"><span class="lbl">${retake}</span><span class="chev">${icon.chevronRight}</span></button>` : ''
     }</div>`,
    {
      pick: (t) => {
        closeSheet();
        onPick(t.dataset.k);
      },
    },
  );
}

/* ---------------- shared bits of the review screens ---------------- */
/** The photo being recorded; ?shot=vpump|vwound|vother (no camera before it) gets the demo picture of that kind. */
function current(kind) {
  if (!state.vphoto) {
    const art = kind === 'other' ? 'doc' : kind;
    state.vphoto = { kind, attach: false, shows: art, media: `<div class="art-box">${artSvg(art)}</div>`, art, photo: null };
  }
  return state.vphoto;
}
const pad = (n) => String(n).padStart(2, '0');
const nowAt = () => {
  const d = new Date();
  return `${DEMO_DATE.slice(5).replace('-', '/')} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const otherUse = () => `<button class="ph-other" data-act="other-use">다른 용도로 기록 ${icon.chevronRight}</button>`;
const mediaCard = (v, tag) => `
  <section class="ocr-card">
    <div class="ocr-card-head"><span class="ocr-card-title gtext">${v.attach ? '첨부 이미지' : '촬영 이미지'}</span>${tag || ''}</div>
    <div class="ocr-thumb ph-media">${v.media}</div>
  </section>
  ${otherUse()}`;
const chips = (list, cur, act, multi = false) =>
  `<div class="ph-chips">${list
    .map((x) => `<button class="sort-chip${(multi ? cur.includes(x) : cur === x) ? ' on' : ''}" data-act="${act}" data-v="${esc(x)}">${esc(x)}</button>`)
    .join('')}</div>`;

function nudge(sel) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.classList.remove('nudge');
  void el.offsetWidth;
  el.classList.add('nudge');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function save(rec) {
  state.pt[state.pid].photos.unshift({ id: `ph${Date.now()}`, at: nowAt(), who: NURSE.label, art: state.vphoto.art, photo: state.vphoto.photo, ...rec });
  replace('vsaved', { kind: rec.kind }, 'fade');
}

const reviewActions = (kind) => ({
  'hdr-back': () => backToCamera(),
  'hdr-close': () => pop(),
  retake: () => backToCamera(true),
  'other-use': () => openPurposeSheet({ current: kind, hint: '같은 사진을 다른 용도로 기록합니다.', onPick: (k) => switchPurpose(k) }),
});

/* ---------------- 주입 펌프: 표시값 + 처방 속도 비교 ---------------- */
// the patient's running IV order (demo): the pump in the picture runs N/S 0.9% at 100 mL/h
const IV = {
  21212457: { name: '0.9% 생리식염수 1,000 mL', rate: 80 },
  20733345: { name: '0.9% 생리식염수 1,000 mL', rate: 120 },
  21033456: { name: '0.9% 생리식염수 1,000 mL', rate: 60 },
  20655321: { name: '0.9% 생리식염수 1,000 mL', rate: 80 },
  20876654: { name: '0.9% 생리식염수 1,000 mL', rate: 100 },
  20812233: { name: '0.9% 생리식염수 1,000 mL', rate: 100 },
};
// what the pump photo shows: Infusion 100 mL/h · Volume 47 mL · Time Left 00:28. A pump screen does not name the
// drug, so 약물 · 수액 comes from the patient's 수액 처방.
const PUMP_FIELDS = [
  { k: 'drug', name: '약물 · 수액', unit: '', order: true, text: true },
  { k: 'rate', name: '주입 속도', unit: 'mL/h', read: '100', conf: 99 },
  { k: 'vtbi', name: '남은 양', unit: 'mL', read: '47', conf: 97 },
  { k: 'left', name: '남은 시간', unit: '', read: '00:28', conf: 95, text: true },
];
const AI_FIELDS = PUMP_FIELDS.filter((x) => !x.order);

function pumpForm() {
  const v = state.vphoto;
  if (!v.pump) {
    // a photo that is not of a pump (chosen via '다른 용도로'): nothing is read. The 약물·수액 field comes from the
    // patient's IV order, so it stays empty until the patient is known (filled in on render, see below).
    const read = v.shows === 'pump';
    v.pump = { read, ack: false, values: Object.fromEntries(PUMP_FIELDS.map((f) => [f.k, f.order ? '' : read ? f.read : ''])) };
  }
  return v.pump;
}

register('vpump', {
  bg: 'screen',
  render: () => {
    const v = current('pump');
    const f = pumpForm();
    const known = patientKnown();
    const order = known ? IV[state.pid] || IV[21212457] : null;
    if (order && !f.values.drug) f.values.drug = order.name;
    const rate = Number(f.values.rate);
    const has = String(f.values.rate).trim() !== '';
    const match = known && has && rate === order.rate;
    const diff = known && has ? rate - order.rate : 0;
    return `
      ${header({ title: '주입 펌프', left: 'back', right: 'close' })}
      <div class="screen-body scroll ocr-review ph-review">
        ${known ? patientLine() : ''}
        <h2 class="vr-title ask gtext">${
          f.read ? `${v.attach ? '주입 펌프 사진을 첨부하신 것 같습니다.' : '주입 펌프를 촬영하신 것 같습니다.'}<br>주입 정보를 기록할까요?` : '주입 펌프 정보를<br>직접 입력해 주세요.'
        }</h2>
        ${mediaCard(v, f.read ? badge(`인식 ${AI_FIELDS.length}/${AI_FIELDS.length}`, 'count-grad') : '')}
        <section class="ocr-card">
          <div class="ocr-card-head"><span class="ocr-card-title gtext">펌프 표시값</span><span class="ocr-meta">${nowAt().slice(6)} · ${NURSE.label}</span></div>
          <div class="pf-list">${PUMP_FIELDS.map(
            (x) => `
            <label class="pf-row" data-k="${x.k}">
              <span class="pf-k">${x.name}</span>
              <input class="pf-in${x.text ? ' text' : ''}" data-k="${x.k}" type="text" ${x.text ? '' : 'inputmode="decimal"'} value="${esc(f.values[x.k])}" placeholder="${x.order && !known ? '환자 확인 후 자동 입력' : '입력'}" autocomplete="off">
              <span class="pf-u">${x.unit}</span>
              ${x.order ? '<span class="vf-tag ok">처방</span>' : `<span class="vf-tag ${f.read ? 'ai' : 'low'}">${f.read ? `AI ${x.conf}%` : '직접 입력'}</span>`}
            </label>`,
          ).join('')}</div>
        </section>
        <section class="ocr-card pf-order ${!known || !has ? '' : match ? 'ok' : 'warn'}">
          <div class="ocr-card-head"><span class="ocr-card-title gtext">처방 비교</span>${known && has ? badge(match ? '일치' : '불일치', match ? 'count-grad' : 'nar') : ''}</div>
          ${
            !known
              ? '<p class="pf-msg">환자 확인 후 처방과 비교합니다.</p>'
              : `<div class="pf-cmp">
            <div><span class="k">처방</span><b>${esc(order.name)}</b><b class="r">${order.rate} mL/h</b></div>
            <div><span class="k">펌프</span><b>${esc(f.values.drug || '-')}</b><b class="r${has && !match ? ' bad' : ''}">${has ? `${rate} mL/h` : '-'}</b></div>
          </div>
          ${
            !has
              ? '<p class="pf-msg">주입 속도를 입력하면 처방과 비교합니다.</p>'
              : match
                ? `<p class="pf-msg ok">${icon.checkCircle}<span>주입 속도가 처방과 같습니다.</span></p>`
                : `<p class="pf-msg warn">${icon.error}<span>주입 속도가 처방(${order.rate} mL/h)과 다릅니다 (${diff > 0 ? '+' : ''}${diff} mL/h). 펌프 설정을 확인해 주세요.</span></p>
                   <button class="ham-check${f.ack ? ' on' : ''}" data-act="pump-ack"><span class="cb">${icon.check}</span><span>펌프 설정을 확인했습니다 (재설정 · 담당의 확인)</span></button>`
          }`
          }
        </section>
      </div>
      <div class="screen-foot two-btns">
        <button class="btn line" data-act="retake">${v.attach ? '다른 사진 선택' : '다시 촬영'}</button>
        ${button('기록', 'pump-save', { cta: true })}
      </div>`;
  },
  mount(el) {
    el.querySelectorAll('.pf-in').forEach((input) => {
      input.addEventListener('input', () => {
        if (!input.classList.contains('text')) input.value = input.value.replace(/[^0-9.]/g, '');
        pumpForm().values[input.dataset.k] = input.value;
      });
      input.addEventListener('change', () => rerender());
      input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    });
  },
  actions: {
    ...reviewActions('pump'),
    'pump-ack': () => {
      const f = pumpForm();
      f.ack = !f.ack;
      rerender();
    },
    'pump-save': () => {
      const f = pumpForm();
      // 약물·수액 is filled from the patient's IV order once the wristband is scanned, below
      const empty = PUMP_FIELDS.filter((x) => x.k !== 'drug' && !String(f.values[x.k]).trim());
      if (empty.length) {
        toast(`${empty.map((x) => x.name).join(', ')} 값을 입력해 주세요.`);
        return nudge(`.pf-row[data-k="${empty[0].k}"]`);
      }
      withPatient('주입 정보를 기록할 환자의\n팔찌 바코드를 스캔하세요.', () => {
        const order = IV[state.pid] || IV[21212457];
        if (!f.values.drug) f.values.drug = order.name;
        rerender(); // shows the 처방 비교 now that the patient is known
        const match = Number(f.values.rate) === order.rate;
        if (!match && !f.ack) {
          toast('처방과 다른 주입 속도입니다. 펌프 설정 확인에 체크해 주세요.');
          return nudge('.pf-order .ham-check');
        }
        save({
          kind: 'pump',
          title: f.values.drug,
          detail: `${f.values.rate} mL/h · 남은 ${f.values.vtbi} mL · ${f.values.left} 남음`,
          flag: match ? null : `처방 ${order.rate} mL/h와 불일치 · 펌프 설정 확인`,
        });
      });
    },
  },
  onBack: () => (backToCamera(), true),
});

/* ---------------- 환부 · 환자 상태 ---------------- */
const SITES = ['머리·얼굴', '목', '가슴', '복부', '등', '천골·엉덩이', '팔(좌)', '팔(우)', '다리(좌)', '다리(우)', '발뒤꿈치', '기타'];
const TYPES = ['욕창', '수술 부위', '정맥주사 부위', '피부 발적·발진', '외상·찰과상', '기타'];
const STAGES = ['1단계', '2단계', '3단계', '4단계', '미분류', '심부조직손상'];

function woundForm() {
  const v = state.vphoto;
  // 크기는 간호사가 직접 잰 값만 (선택): no estimate from the photo
  if (!v.wound) v.wound = { site: null, type: null, stage: null, w: '', h: '', memo: '' };
  return v.wound;
}
const area = (r) => (parseFloat(r.w) || 0) * (parseFloat(r.h) || 0);

register('vwound', {
  bg: 'screen',
  render: () => {
    const v = current('wound');
    const f = woundForm();
    // the previous-photo comparison needs the patient, which isn't known until save (환자 팔찌 스캔)
    const prev = patientKnown() && f.site && state.pt[state.pid].photos.find((p) => p.kind === 'wound' && p.site === f.site);
    const trend = prev && area(f) && area(prev) ? (area(f) < area(prev) * 0.95 ? '크기 감소' : area(f) > area(prev) * 1.05 ? '크기 증가' : '변화 없음') : '';
    return `
      ${header({ title: '환자 상태 사진', left: 'back', right: 'close' })}
      <div class="screen-body scroll ocr-review ph-review">
        ${patientKnown() ? patientLine() : ''}
        <h2 class="vr-title ask gtext">${
          v.shows === 'wound' ? '환부 사진으로 보입니다.<br>상처 기록으로 저장할까요?' : '환자 상태 사진을<br>기록합니다.'
        }</h2>
        ${mediaCard(v)}
        <section class="ocr-card ph-form">
          <p class="ph-k" data-f="site">부위</p>
          ${chips(SITES, f.site, 'w-site')}
          <p class="ph-k" data-f="type">유형</p>
          ${chips(TYPES, f.type, 'w-type')}
          ${f.type === '욕창' ? `<p class="ph-k" data-f="stage">욕창 단계</p>${chips(STAGES, f.stage, 'w-stage')}` : ''}
          <p class="ph-k">크기 <small>직접 측정</small></p>
          <div class="ph-size">
            <input class="ph-num" data-f="w" type="text" inputmode="decimal" value="${esc(f.w)}" placeholder="가로" aria-label="가로 cm" autocomplete="off">
            <span class="ph-x">×</span>
            <input class="ph-num" data-f="h" type="text" inputmode="decimal" value="${esc(f.h)}" placeholder="세로" aria-label="세로 cm" autocomplete="off">
            <span class="pf-u">cm</span>
          </div>
          <p class="ph-k">메모</p>
          <textarea class="ph-memo" data-f="memo" rows="2" placeholder="삼출물 · 냄새 · 드레싱 등">${esc(f.memo)}</textarea>
        </section>
        ${
          prev
            ? `<section class="ocr-card ph-prev">
                <div class="ocr-card-head"><span class="ocr-card-title gtext">이전 사진과 비교</span>${trend ? badge(trend, trend === '크기 감소' ? 'count-grad' : 'nar') : ''}</div>
                <div class="ph-pair">
                  <figure><div class="ph-mini">${prev.art ? artSvg(prev.art) : ''}</div><figcaption>이전 ${esc(prev.at)}<br>${esc(prev.w)} × ${esc(prev.h)} cm${prev.stage ? ` · ${esc(prev.stage)}` : ''}</figcaption></figure>
                  <figure><div class="ph-mini">${v.art ? artSvg(v.art) : v.photo ? `<img src="${v.photo}" alt="">` : v.media}</div><figcaption>이번<br>${f.w || '-'} × ${f.h || '-'} cm${f.stage ? ` · ${esc(f.stage)}` : ''}</figcaption></figure>
                </div>
              </section>`
            : ''
        }
      </div>
      <div class="screen-foot two-btns">
        <button class="btn line" data-act="retake">${v.attach ? '다른 사진 선택' : '다시 촬영'}</button>
        ${button('저장', 'wound-save', { cta: true })}
      </div>`;
  },
  mount(el) {
    el.querySelector('.ph-memo')?.addEventListener('input', (e) => (woundForm().memo = e.target.value));
    el.querySelectorAll('.ph-num').forEach((input) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9.]/g, '');
        woundForm()[input.dataset.f] = input.value;
      });
      // the size comparison with the previous photo follows the typed size
      input.addEventListener('change', () => rerender());
      input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    });
  },
  actions: {
    ...reviewActions('wound'),
    'w-site': (t) => ((woundForm().site = t.dataset.v), rerender()),
    'w-type': (t) => {
      const f = woundForm();
      f.type = t.dataset.v;
      if (f.type !== '욕창') f.stage = null;
      rerender();
    },
    'w-stage': (t) => ((woundForm().stage = t.dataset.v), rerender()),
    'wound-save': () => {
      const f = woundForm();
      // 환자 사진은 필수 항목 없음 (2026-11-23 요청): 고르지 않은 항목은 비워 둔 채 저장
      const kindTitle = f.type ? `${f.type}${f.stage ? ` ${f.stage}` : ''}` : '';
      withPatient('환자 상태 사진을 저장할 환자의\n팔찌 바코드를 스캔하세요.', () => {
        // a previous photo of the same site only shows up once the patient is known (환자 팔찌 스캔) — let the
        // nurse see that comparison once before committing
        const prev = f.site && state.pt[state.pid].photos.find((p) => p.kind === 'wound' && p.site === f.site);
        if (prev && !f.prevShown) {
          f.prevShown = true;
          rerender();
          toast('이전 사진과 비교했습니다. 맞으면 저장을 다시 눌러 주세요.');
          return nudge('.ph-prev');
        }
        save({
          kind: 'wound',
          title: [f.site, kindTitle].filter(Boolean).join(' · ') || '환자 상태 사진',
          detail: [f.w && f.h ? `${f.w} × ${f.h} cm` : '', f.memo].filter(Boolean).join(' · '),
          site: f.site,
          type: f.type,
          stage: f.stage,
          w: f.w,
          h: f.h,
        });
      });
    },
  },
  onBack: () => (backToCamera(), true),
});

/* ---------------- 기타: 태그 · 메모 ---------------- */
const TAGS = ['서류·동의서', '약 라벨·지참약', '식사량', '배액·소변', '장비·환경', '기타'];

function otherForm() {
  const v = state.vphoto;
  if (!v.other) v.other = { tags: v.shows === 'doc' ? ['서류·동의서'] : [], memo: '' };
  return v.other;
}

register('vother', {
  bg: 'screen',
  render: () => {
    const v = current('other');
    const f = otherForm();
    return `
      ${header({ title: '사진 첨부', left: 'back', right: 'close' })}
      <div class="screen-body scroll ocr-review ph-review">
        ${patientKnown() ? patientLine() : ''}
        <h2 class="vr-title ask gtext">${v.shows === 'doc' ? '서류를 촬영하신 것 같습니다.<br>간호기록에 첨부할까요?' : '사진을 간호기록에<br>첨부합니다.'}</h2>
        ${mediaCard(v)}
        <section class="ocr-card ph-form">
          <p class="ph-k" data-f="tags">태그 <em>1개 이상</em></p>
          ${chips(TAGS, f.tags, 'o-tag', true)}
          <p class="ph-k">메모</p>
          <textarea class="ph-memo" rows="2" placeholder="무엇을 왜 찍었는지 적어 주세요">${esc(f.memo)}</textarea>
        </section>
      </div>
      <div class="screen-foot two-btns">
        <button class="btn line" data-act="retake">${v.attach ? '다른 사진 선택' : '다시 촬영'}</button>
        ${button('첨부', 'other-save', { cta: true })}
      </div>`;
  },
  mount(el) {
    el.querySelector('.ph-memo')?.addEventListener('input', (e) => (otherForm().memo = e.target.value));
  },
  actions: {
    ...reviewActions('other'),
    'o-tag': (t) => {
      const f = otherForm();
      const x = t.dataset.v;
      f.tags = f.tags.includes(x) ? f.tags.filter((y) => y !== x) : [...f.tags, x];
      rerender();
    },
    'other-save': () => {
      const f = otherForm();
      if (!f.tags.length) {
        toast('태그를 하나 이상 선택해 주세요.');
        return nudge('.ph-k[data-f="tags"]');
      }
      withPatient('사진을 첨부할 환자의\n팔찌 바코드를 스캔하세요.', () => save({ kind: 'other', title: f.tags.join(' · '), detail: f.memo, tags: [...f.tags] }));
    },
  },
  onBack: () => (backToCamera(), true),
});

/* ---------------- 저장 완료 ---------------- */
const SAVED = {
  pump: ['주입 정보 기록 완료', '펌프 표시값과 처방 비교 결과가\n간호기록에 저장되었습니다.'],
  wound: ['환부 사진 저장 완료', '부위 · 유형 · 크기와 사진이\n상처 기록에 저장되었습니다.'],
  other: ['사진 첨부 완료', '사진과 태그가 간호기록에\n첨부되었습니다.'],
};
register('vsaved', {
  bg: 'screen',
  render: ({ kind }) => `
    ${header({ title: { pump: '주입 펌프', wound: '환자 상태 사진', other: '사진 첨부' }[kind] })}
    <div class="screen-body center-status">
      ${patientLine()}
      <span class="spacer" style="flex-grow: 186"></span>
      ${statusBlock({ img: 'check-blue', title: SAVED[kind][0], desc: SAVED[kind][1] })}
      <span class="spacer" style="flex-grow: 241"></span>
    </div>
    <div class="screen-foot two-btns">
      <button class="btn line" data-act="to-detail">환자 상세 보기</button>
      ${button('확인', 'finish')}
    </div>`,
  actions: {
    finish: () => pop(),
    'to-detail': () => replace('detail', {}, 'fade'),
  },
});

/* ---------------- 환자 상세 '사진 기록' ---------------- */
const KIND_LABEL = { pump: '주입 펌프', wound: '환부', other: '첨부' };
export function photoRows(list) {
  if (!list.length) return '<p class="ph-empty">사진 기록이 없습니다.</p>';
  return list.map(photoRow).join('');
}

/** One 사진 기록 (주입 펌프 · 환부 · 기타) row. */
export function photoRow(p) {
  return `
      <div class="ph-row">
        <span class="ph-thumb">${p.photo ? `<img src="${p.photo}" alt="">` : p.art ? artSvg(p.art) : icon.edit}</span>
        <span class="ph-body">
          <span class="ph-t">${badge(KIND_LABEL[p.kind] || p.kind, p.kind === 'wound' ? 'nar' : '')}<b>${esc(p.title)}</b></span>
          ${p.detail ? `<span class="ph-d">${esc(p.detail)}</span>` : ''}
          ${p.flag ? `<span class="ph-flag">${icon.error}${esc(p.flag)}</span>` : ''}
          <small>${esc(p.at)} · ${esc(p.who)}</small>
        </span>
      </div>`;
}
