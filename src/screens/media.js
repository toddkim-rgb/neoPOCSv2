// 멀티미디어 (환자 상세, 2026-11-23 요청; 디자인에 없는 화면): 사진 · 동영상 · 음성기록(최대 10분)을 여러 개 모아
// 항목마다 메모를 적고 한 번에 저장합니다. 환자 상세 '멀티미디어' 카드 '+ 추가' → 멀티미디어 추가 화면:
//   사진 촬영 · 동영상 촬영 (기기 카메라) · 음성 녹음 (마이크, 10분이 되면 자동 종료) · 갤러리 (여러 개 선택)
// PDA · 브라우저의 실제 카메라 · 갤러리 · 마이크를 쓰고, 파일은 이 기기 메모리에만 둡니다(서버 전송 없음, 새로고침하면
// 사라짐). 마이크를 쓸 수 없으면 시연 녹음(시간만 기록), 버튼을 길게 누르면 시연 자료를 추가합니다.
// 저장한 자료는 환자 상세 카드에 사진 기록(주입 펌프 · 환부 · 기타)과 함께 최신순으로 보이고, 누르면 보기 · 메모 수정 · 삭제.
import { register, go, pop, rerender } from '../router.js';
import { header, button, esc, toast, openSheet, closeSheet, openDialog, patientLine, badge } from '../ui.js';
import { icon } from '../icons.js';
import { NURSE, DEMO_DATE } from '../data.js';
import { state } from '../state.js';
import { artSvg } from './photo.js';
import { scenePhoto } from './vitals.js';
import { feedback } from '../feedback.js';

export const MAX_AUDIO = 600; // 음성기록 최대 10분 (초)
const KIND = { photo: '사진', video: '동영상', audio: '음성기록' };
const pad = (n) => String(n).padStart(2, '0');
const clock = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const nowAt = () => {
  const d = new Date();
  return `${DEMO_DATE.slice(5).replace('-', '/')} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
let seq = 0;
const newId = () => `md${Date.now().toString(36)}${seq++}`;

/* ---------------- what an item looks like ---------------- */
// item: { id, kind: photo | video | audio, src: 촬영 | 녹음 | 갤러리 | 시연, url? (real file) · art? / scene? (시연 picture),
//         name, size?, dur? (seconds), memo, at?, who? }
const DEMO = {
  photo: { kind: 'photo', src: '시연', art: 'wound', name: '환부 사진' },
  video: { kind: 'video', src: '시연', scene: { c: [467, 640], z: 900 }, name: '병상 동영상', dur: 24 },
  audio: { kind: 'audio', src: '시연', name: '음성기록', dur: 48 },
  gallery: [
    { kind: 'photo', src: '시연', scene: { c: [697, 347], z: 330 }, name: '환자 모니터 사진' },
    { kind: 'photo', src: '시연', art: 'pump', name: '주입 펌프 사진' },
    { kind: 'video', src: '시연', scene: { c: [480, 930], z: 640 }, name: '인공호흡기 동영상', dur: 15 },
  ],
};

/** The picture of an item (a photo, a video's first frame, or the 음성기록 mark). `size`: demo picture size (px). */
function picture(it, size) {
  if (it.kind === 'audio') return `<span class="md-wave">${icon.mic}</span>`;
  if (it.url) return it.kind === 'video' ? `<video src="${it.url}#t=0.1" muted playsinline preload="metadata"></video>` : `<img src="${it.url}" alt="">`;
  if (it.art) return artSvg(it.art);
  return scenePhoto(size, it.scene);
}
const lengthTag = (it) => (it.kind === 'photo' || !it.dur ? '' : `<i class="md-dur">${it.kind === 'video' ? icon.play : ''}${clock(it.dur)}</i>`);
const meta = (it) => [it.src, it.dur ? clock(it.dur) : '', it.size ? kb(it.size) : ''].filter(Boolean).join(' · ');

/** A saved item as a row of the 환자 상세 '멀티미디어' card (photo.js rows sit beside it). */
export function mediaRow(m) {
  return `
    <button class="ph-row md-row" data-act="media-open" data-id="${m.id}">
      <span class="ph-thumb md-thumb ${m.kind}">${picture(m, 56)}${lengthTag(m)}</span>
      <span class="ph-body">
        <span class="ph-t">${badge(KIND[m.kind], 'media')}<b>${esc(m.name)}</b></span>
        <span class="ph-d${m.memo ? '' : ' none'}">${m.memo ? esc(m.memo) : '메모 없음'}</span>
        <small>${esc(m.at)} · ${esc(m.who)}${m.dur ? ` · ${clock(m.dur)}` : ''}</small>
      </span>
    </button>`;
}

/** The media itself, to look at or play: real files with the browser's player, 시연 자료 as a still. */
function player(it) {
  if (it.kind === 'photo') return `<div class="mv-pic">${picture(it, 334)}</div>`;
  if (it.url && it.kind === 'video') return `<video class="mv-video" src="${it.url}" controls playsinline></video>`;
  if (it.url) return `<audio class="mv-audio" src="${it.url}" controls></audio>`;
  if (it.kind === 'video') return `<div class="mv-pic demo">${picture(it, 334)}<span class="mv-demo">${icon.play}<small>시연 동영상 · ${clock(it.dur)}</small></span></div>`;
  return `<div class="mv-rec"><span class="md-wave big">${icon.mic}</span><span class="mv-bars">${'<i></i>'.repeat(24)}</span><b>${clock(it.dur)}</b><small>시연 녹음 (재생할 소리 없음)</small></div>`;
}

/* ---------------- 환자 상세: 보기 · 메모 수정 · 삭제 ---------------- */
export function openMediaViewer(id) {
  const list = state.pt[state.pid].media;
  const m = list.find((x) => x.id === id);
  if (!m) return;
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">${KIND[m.kind]}</p><span class="chip on"><span>${esc(m.at)}</span></span></div>
     <p class="sheet-hint">${esc(m.name)} · ${esc(meta(m))} · ${esc(m.who)}</p>
     <div class="mv-media ${m.kind}">${player(m)}</div>
     <p class="mv-k">메모</p>
     <textarea class="md-memo mv-memo" rows="3" placeholder="메모를 입력하세요">${esc(m.memo)}</textarea>
     <div class="sheet-btns">
       <button class="btn line" data-sheet-act="del">삭제</button>
       <button class="btn" data-sheet-act="save">메모 저장</button>
     </div>`,
    {
      save: () => {
        m.memo = document.querySelector('#sheet-layer .mv-memo').value.trim();
        closeSheet();
        rerender();
        toast('메모를 저장했습니다.');
      },
      del: () =>
        openDialog(
          {
            title: '멀티미디어 삭제',
            desc: `${KIND[m.kind]} 1건을 삭제할까요?\n삭제한 자료는 되돌릴 수 없습니다.`,
            buttons: [
              { label: '취소', act: 'cancel', line: true },
              { label: '삭제', act: 'ok' },
            ],
          },
          {
            cancel: () => closeSheet(),
            ok: () => {
              closeSheet();
              list.splice(list.indexOf(m), 1);
              if (m.url) URL.revokeObjectURL(m.url);
              rerender();
              toast(`${KIND[m.kind]}을 삭제했습니다.`);
            },
          },
        ),
    },
    { cls: 'media-view' },
  );
}

/* ---------------- 멀티미디어 추가 (모아서 메모 → 한 번에 저장) ---------------- */
let draft = [];

/** 환자 상세 '+ 추가': the patient is the one shown, so no wristband scan. */
export function openMediaAdd() {
  draft = [];
  go('media', {});
}

const addBtn = (k, ico, label, sub = '') =>
  `<button class="md-add" data-act="md-${k}" data-long="md-demo-${k}"><span class="md-ico">${ico}</span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;

function draftCard(it, i) {
  return `
    <div class="md-card" data-id="${it.id}">
      <div class="md-top">
        <span class="md-no">${i + 1}</span>
        ${badge(KIND[it.kind], 'media')}<b class="md-name">${esc(it.name)}</b>
        <button class="md-x" data-act="md-remove" data-id="${it.id}" aria-label="빼기">${icon.close}</button>
      </div>
      <div class="md-prev ${it.kind}">${player(it)}</div>
      <p class="md-meta">${esc(meta(it))}</p>
      <textarea class="md-memo" data-id="${it.id}" rows="2" placeholder="메모 (예: 드레싱 교환 전 상태, 보호자 설명 내용)">${esc(it.memo)}</textarea>
    </div>`;
}

function addItems(items, msg) {
  draft.push(...items.map((x) => ({ memo: '', ...x, id: newId() })));
  rerender();
  feedback('ok');
  toast(msg);
  requestAnimationFrame(() => document.querySelector('.scr-media .md-card:last-child')?.scrollIntoView({ block: 'nearest' }));
}

/* 기기 카메라 · 갤러리: a file input (the PDA opens its camera app or photo picker; a PC opens a file dialog) */
let input = null;
function pick(kind) {
  input?.remove();
  input = Object.assign(document.createElement('input'), {
    type: 'file',
    hidden: true,
    multiple: kind === 'gallery',
    accept: kind === 'photo' ? 'image/*' : kind === 'video' ? 'video/*' : 'image/*,video/*',
  });
  if (kind !== 'gallery') input.setAttribute('capture', 'environment');
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.remove();
    input = null;
    if (!document.querySelector('.scr-media')) return;
    const items = (await Promise.all(files.map((f) => fromFile(f, kind === 'gallery' ? '갤러리' : '촬영')))).filter(Boolean);
    if (items.length) addItems(items, `${items.length}건을 추가했습니다. 항목마다 메모를 적을 수 있습니다.`);
    else if (files.length) toast('사진 · 동영상 파일만 올릴 수 있습니다.');
  });
  input.click();
}

/** A picked file → an item (a video's length is read from its metadata). */
function fromFile(f, src) {
  const kind = f.type.startsWith('image/') ? 'photo' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : null;
  if (!kind) return Promise.resolve(null);
  const it = { kind, src, url: URL.createObjectURL(f), name: f.name || `${KIND[kind]} ${src}`, size: f.size };
  if (kind === 'photo') return Promise.resolve(it);
  return new Promise((resolve) => {
    const v = document.createElement(kind === 'video' ? 'video' : 'audio');
    const done = () => resolve({ ...it, dur: Number.isFinite(v.duration) ? Math.round(v.duration) : 0 });
    v.preload = 'metadata';
    v.onloadedmetadata = done;
    v.onerror = done;
    setTimeout(done, 3000);
    v.src = it.url;
  });
}

/* 음성 녹음: the microphone (MediaRecorder) up to 10 minutes; without one, a 시연 recording that only keeps the time */
function openRecorder() {
  let rec = null;
  let stream = null;
  let chunks = [];
  let t0 = Date.now();
  let done = false;
  let timer = null;
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">음성 녹음</p><span class="chip on"><span>최대 10분</span></span></div>
     <div class="rec-stage"><span class="rec-dot"></span><b class="rec-t" data-v="t">0:00</b><span class="rec-max">/ 10:00</span></div>
     <div class="rec-bars">${'<i></i>'.repeat(28)}</div>
     <p class="sheet-hint rec-mode" data-v="mode">마이크를 준비하고 있습니다…</p>
     <div class="sheet-btns">
       <button class="btn line" data-sheet-act="cancel">취소</button>
       <button class="btn" data-sheet-act="stop">${icon.stop}녹음 완료</button>
     </div>`,
    { cancel: () => finish(false), stop: () => finish(true), dismiss: () => finish(false) },
    { cls: 'rec' },
  );
  const sheet = document.querySelector('#sheet-layer .sheet.rec');
  const set = (k, v) => {
    const n = sheet.querySelector(`[data-v="${k}"]`);
    if (n) n.textContent = v;
  };
  (async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('no microphone');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (done) return stream.getTracks().forEach((t) => t.stop());
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(1000);
      set('mode', '녹음 중입니다. 10분이 되면 자동으로 끝납니다.');
    } catch {
      if (done) return;
      sheet.classList.add('demo');
      set('mode', '시연 녹음: 마이크를 쓸 수 없어 녹음 시간만 기록합니다.');
    }
    t0 = Date.now();
  })();
  timer = setInterval(() => {
    if (!sheet.isConnected) return finish(false); // closed some other way (뒤로가기)
    const s = (Date.now() - t0) / 1000;
    set('t', clock(Math.min(s, MAX_AUDIO)));
    if (s >= MAX_AUDIO) finish(true, true);
  }, 250);

  function finish(keep, auto = false) {
    if (done) return;
    done = true;
    clearInterval(timer);
    closeSheet();
    const secs = Math.max(1, Math.min(MAX_AUDIO, Math.round((Date.now() - t0) / 1000)));
    const add = (url) => {
      stream?.getTracks().forEach((t) => t.stop());
      if (!keep) return url && URL.revokeObjectURL(url);
      addItems(
        [{ kind: 'audio', src: url ? '녹음' : '시연', url, name: '음성기록', dur: secs }],
        auto ? '최대 10분이 되어 녹음을 마쳤습니다.' : `음성기록(${clock(secs)})을 추가했습니다.`,
      );
    };
    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => add(keep && chunks.length ? URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) : null);
      rec.stop();
    } else add(null);
  }
}

function dropDraft() {
  draft.forEach((x) => x.url && URL.revokeObjectURL(x.url));
  draft = [];
}

/** 뒤로가기: unsaved items are lost, so ask first. */
function leave() {
  if (!draft.length) return pop();
  openDialog(
    {
      title: '저장하지 않은 자료',
      desc: `저장하지 않은 자료 ${draft.length}건은 사라집니다.\n나갈까요?`,
      buttons: [
        { label: '취소', act: 'cancel', line: true },
        { label: '나가기', act: 'ok' },
      ],
    },
    { cancel: () => closeSheet(), ok: () => (closeSheet(), dropDraft(), pop()) },
  );
}

register('media', {
  bg: 'screen',
  render: ({ shot }) => {
    // ?shot=media&demo=1 shows the three 시연 자료
    if (shot && !draft.length && new URLSearchParams(location.search).get('demo') === '1') {
      draft = [DEMO.photo, DEMO.video, DEMO.audio].map((x, i) => ({ memo: i ? '' : '드레싱 교환 전 상태', ...x, id: newId() }));
    }
    return `
      ${header({ title: '멀티미디어 추가', left: 'back' })}
      <div class="screen-body scroll media-add">
        ${patientLine()}
        <div class="md-adds">
          ${addBtn('photo', icon.camera, '사진 촬영')}
          ${addBtn('video', icon.video, '동영상 촬영')}
          ${addBtn('audio', icon.mic, '음성 녹음', '최대 10분')}
          ${addBtn('gallery', icon.gallery, '갤러리', '여러 개')}
        </div>
        <p class="md-hint">${icon.error}<span>여러 자료를 모아 항목마다 메모를 적고 한 번에 저장합니다. 버튼을 길게 누르면 시연 자료를 추가합니다.</span></p>
        <div class="md-head"><span class="medlist-title gtext">올릴 자료</span>${badge(`${draft.length}건`, 'count-grad')}</div>
        ${draft.length ? `<div class="md-list">${draft.map(draftCard).join('')}</div>` : '<p class="md-empty">아직 추가한 자료가 없습니다.</p>'}
      </div>
      <div class="screen-foot">${button(draft.length ? `저장 (${draft.length}건)` : '저장', 'md-save', { cta: draft.length > 0 })}</div>`;
  },
  mount(el) {
    el.querySelectorAll('.md-memo').forEach((t) =>
      t.addEventListener('input', () => {
        const it = draft.find((x) => x.id === t.dataset.id);
        if (it) it.memo = t.value;
      }),
    );
  },
  actions: {
    'hdr-back': () => leave(),
    'md-photo': () => pick('photo'),
    'md-video': () => pick('video'),
    'md-gallery': () => pick('gallery'),
    'md-audio': () => openRecorder(),
    // 길게 누르기: 시연 자료
    'md-demo-photo': () => addItems([DEMO.photo], '시연 사진을 추가했습니다.'),
    'md-demo-video': () => addItems([DEMO.video], '시연 동영상을 추가했습니다.'),
    'md-demo-audio': () => addItems([DEMO.audio], '시연 음성기록을 추가했습니다.'),
    'md-demo-gallery': () => addItems(DEMO.gallery, `갤러리에서 시연 자료 ${DEMO.gallery.length}건을 추가했습니다.`),
    'md-remove': (t) => {
      const i = draft.findIndex((x) => x.id === t.dataset.id);
      if (i < 0) return;
      const [it] = draft.splice(i, 1);
      if (it.url) URL.revokeObjectURL(it.url);
      rerender();
    },
    'md-save': () => {
      if (!draft.length) return toast('사진 · 동영상 · 음성기록을 먼저 추가해 주세요.');
      const at = nowAt();
      const n = draft.length;
      state.pt[state.pid].media.unshift(...draft.map((x) => ({ ...x, memo: x.memo.trim(), at, who: NURSE.label })));
      draft = [];
      pop();
      toast(`멀티미디어 ${n}건을 저장했습니다.`);
    },
  },
  onBack: () => (leave(), true),
});
