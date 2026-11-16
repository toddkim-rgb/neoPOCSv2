// 사진 촬영 · 사진첨부 → 활력징후 OCR (AI 커맨드바 +). Both start without a patient:
//   사진 촬영: camera → 촬영 → 환자 팔찌 스캔 → AI recognition → review & edit → final confirm → EMR sent
//   사진첨부:  gallery → 사진 선택 → 환자 팔찌 스캔 → (same analysis)
// On the PDA (Capacitor) the camera is the device's rear camera and the gallery is the Android photo picker; browsers
// (and a PDA that refuses the camera) use the demo bedside scene and demo album instead. The analysis itself is a
// demo: whatever was photographed, the demo monitor values are "read"; long presses pick the failure cases.
// Not in the Figma file: built from the existing components (header, cards, badges, vitals cells, sheets).
import { Capacitor } from '@capacitor/core';
import { register, go, replace, pop, rerender } from '../router.js';
import { header, button, statusBlock, badge, esc, toast, openSheet, closeSheet } from '../ui.js';
import { icon } from '../icons.js';
import { PATIENT, NURSE, patientTitle } from '../data.js';
import { state, completeTask, selectPatient } from '../state.js';
import { askPatient } from '../patientscan.js';
import sceneUrl from '../assets/img/icu-bedside.jpg';
import screenUrl from '../assets/img/monitor-screen.jpg';

/* ---------------- what the camera sees / what the OCR reads ---------------- */
// Scene: an ICU bedside (N. Kaiser, CC BY-SA 2.5, Wikimedia Commons) whose wall monitor is replaced by a sharp
// close-up of a real monitor screen (U.S. Navy, public domain), warped onto the monitor's screen in perspective.
// `box` = reading position on that screen image (1419×1067). The small awRR 11 is misread as 17 with low
// confidence and no temperature is displayed, so the demo shows both a correction and a manual entry.
const SCREEN = { w: 1419, h: 1067 };
const SCENE = { w: 934, h: 1264 };
// screen corners inside the scene (TL, TR, BR, BL) and the monitor housing that the camera frames
const QUAD = [[570, 261], [815, 245], [815, 438], [576, 437]];
const HOUSING = { x: 521, y: 191, w: 352, h: 312 };

export const OCR_FIELDS = [
  { k: 'SBP', name: '수축기 혈압', unit: 'mmHg', read: '125', conf: 97, box: [98, 842, 76, 63] },
  { k: 'DBP', name: '이완기 혈압', unit: 'mmHg', read: '81', conf: 96, box: [186, 842, 56, 62], tag: 'below' },
  { k: 'PR', name: '맥박', unit: '회/min', read: '66', conf: 99, box: [1022, 133, 112, 112] },
  { k: 'RR', name: '호흡', unit: '회/min', read: '17', conf: 72, box: [1287, 715, 87, 98] },
  { k: 'BT', name: '체온', unit: '°C', read: '', conf: 0, box: [1222, 236, 96, 96] },
  { k: 'SpO2', name: '산소포화도', unit: '%', read: '98', conf: 99, box: [1031, 281, 104, 100], tag: 'left' },
];
const LOW_CONF = 85;
const MEASURED = { date: '2026-09-17', time: '17:05' };

/* ---------------- session: camera or gallery, the patient (after the wristband), the photo ---------------- */
const isNative = Capacitor.isNativePlatform();
const cap = { mode: 'camera', pid: null, photo: null, gal: null }; // photo: data/blob URL of a real photo · gal: demo gallery photo

/** AI 커맨드바 + → 사진 촬영: the camera opens at once; the patient is scanned after the photo. */
export function startCamera() {
  Object.assign(cap, { mode: 'camera', pid: null, photo: null, gal: null });
  go('vcam', {});
}

/** AI 커맨드바 + → 사진첨부: the PDA gallery opens at once (browsers: the demo album). */
export function startAttach() {
  Object.assign(cap, { mode: 'attach', pid: null, photo: null, gal: null });
  go('vcam', { mode: 'attach' });
  if (isNative) pickFromGallery(); // still inside the tap, so Android lets the picker open
}

/** Android photo picker (Capacitor routes <input type=file> to the system gallery). */
let picker = null;
function pickFromGallery() {
  if (!picker) {
    picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
    document.body.appendChild(picker);
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (!file || !document.querySelector('.scr-vcam.attach')) return;
      if (cap.photo?.startsWith('blob:')) URL.revokeObjectURL(cap.photo);
      cap.photo = URL.createObjectURL(file);
      cap.gal = null;
      replace('vcam', { mode: 'attach', photo: 'real' }, 'fade');
    });
  }
  picker.click();
}

/* ---------------- the PDA's rear camera ---------------- */
let stream = null;
function stopLive() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}
// the camera stays on while the camera screen is shown (also across retakes), and turns off when it is left
window.addEventListener('screenchange', (e) => {
  if (e.detail.name !== 'vcam') stopLive();
});

async function startLive(el) {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
    stream =
      stream ||
      (await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      }));
    if (!el.isConnected) return;
    const v = el.querySelector('.cam-video');
    v.srcObject = stream;
    await v.play();
    el.classList.remove('starting');
    aimLive(el);
  } catch {
    if (!el.isConnected) return;
    el.classList.remove('live', 'starting');
    toast('카메라를 사용할 수 없어 시연 화면으로 표시합니다.');
    aimAtMonitor(el);
  }
}

/** The prototype has no detector: after the PDA has been held on the scene for a moment it reports a monitor. */
function aimLive(el) {
  const run = ++cam.run;
  setPhase(el, 'search');
  later(el, run, 1800, () => setPhase(el, 'detected'));
}

/** Freezes the live view into the photo that is analysed. */
function freezeFrame(el) {
  const v = el.querySelector('.cam-video');
  if (!v?.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  cap.photo = c.toDataURL('image/jpeg', 0.85);
  v.pause();
  v.insertAdjacentHTML('afterend', `<img class="cam-shot" src="${cap.photo}" alt="촬영한 사진">`);
}

const patientChip = (attach) =>
  cap.pid ? `${esc(patientTitle())} · ${PATIENT.bed}` : `환자 미확인 · ${attach ? '사진 선택' : '촬영'} 후 팔찌 스캔`;

/** Review state. `manual`: nothing could be read from the photo, every value is typed in. */
export function newOcr(manual = false) {
  return {
    manual,
    values: Object.fromEntries(OCR_FIELDS.map((f) => [f.k, manual ? '' : f.read])),
    edited: {},
    checked: {},
  };
}

/** Clinical flag used for colouring, same thresholds the detail screen shows (경고 red / 주의 orange). */
export function flagOf(k, raw) {
  const v = parseFloat(raw);
  if (Number.isNaN(v)) return null;
  switch (k) {
    case 'SBP': return v >= 180 || v < 90 ? 'danger' : v >= 140 ? 'warn' : null;
    case 'DBP': return v >= 110 ? 'danger' : v >= 90 || v < 60 ? 'warn' : null;
    case 'PR': return v > 100 || v < 50 ? 'danger' : null;
    case 'RR': return v > 24 || v < 10 ? 'warn' : null;
    case 'BT': return v >= 39 ? 'danger' : v >= 37.5 ? 'warn' : null;
    case 'SpO2': return v < 90 ? 'danger' : v < 95 ? 'warn' : null;
    default: return null;
  }
}

const readOf = (f, o) => (o.manual ? '' : f.read);
const missing = (f, o) => !readOf(f, o) && !String(o.values[f.k]).trim();
const needsCheck = (f, o) =>
  missing(f, o) || (!o.manual && f.conf < LOW_CONF && !o.edited[f.k] && !o.checked[f.k]);

/** CSS matrix3d that maps a w×h element onto the quad (projective "square to quad"). */
function rectToQuad(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const hh = (dx1 * dy3 - dx3 * dy1) / det;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${x0},${y0},0,1)`;
}
const SCREEN_MATRIX = rectToQuad(SCREEN.w, SCREEN.h, QUAD);

function ocrLayer(boxes) {
  if (boxes === 'none') return '';
  // drawn in screen-image pixels; the screen is shown ~6× smaller, so strokes and labels are thick here
  const pad = 14;
  const th = 80;
  return `
    <svg class="ocr-layer ocr-${boxes}" viewBox="0 0 ${SCREEN.w} ${SCREEN.h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="ocr-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#65bde9"/><stop offset="1" stop-color="#1878bc"/></linearGradient></defs>
      ${OCR_FIELDS.map((f, i) => {
        const [x, y, w, h] = f.box;
        const miss = !f.read;
        const label = `${f.k}${miss ? ' ?' : ''}`;
        const tw = label.length * 42 + 30;
        // label above the box, unless a neighbouring box sits there
        const [tx, ty] =
          f.tag === 'below' ? [x - pad, y + h + pad + 8] : f.tag === 'left' ? [x - pad - tw - 8, y - pad] : [x - pad, y - pad - th - 8];
        return `
        <g class="ocr-box${miss ? ' miss' : ''}" style="--i:${i}">
          <rect x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${h + pad * 2}" rx="16"
            fill="${miss ? 'rgba(254,146,57,0.16)' : 'rgba(101,189,233,0.2)'}" stroke="${miss ? '#fe9239' : 'url(#ocr-g)'}"
            stroke-width="13"${miss ? ' stroke-dasharray="30 20"' : ''}/>
          <rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="16" fill="${miss ? '#fe9239' : 'url(#ocr-g)'}"/>
          <text x="${tx + 15}" y="${ty + 60}" class="ocr-tag">${label}</text>
        </g>`;
      }).join('')}
    </svg>`;
}

/** The bedside scene with the readable monitor screen (and optional OCR boxes) in place. */
function sceneMarkup({ boxes = 'none', style = '' } = {}) {
  return `
    <div class="scene" style="width:${SCENE.w}px;height:${SCENE.h}px;${style}">
      <img class="scene-img" src="${sceneUrl}" alt="병상의 환자 모니터" draggable="false">
      <div class="mscreen" style="width:${SCREEN.w}px;height:${SCREEN.h}px;transform:${SCREEN_MATRIX}">
        <img src="${screenUrl}" alt="" draggable="false">
        ${ocrLayer(boxes)}
        <span class="mglare"></span>
      </div>
    </div>`;
}

/** Review thumbnail: the framed monitor, cropped from the same scene. */
function thumbMarkup(width = 334) {
  const k = width / HOUSING.w;
  return `
    <div class="thumb-win" style="width:${width}px;height:${Math.round(HOUSING.h * k)}px">
      ${sceneMarkup({ boxes: 'static', style: `transform:translate(${-HOUSING.x * k}px,${-HOUSING.y * k}px) scale(${k})` })}
    </div>`;
}

/* ---------------- 1. camera ---------------- */
// The app cannot know what the nurse is about to photograph, so the camera only says what it can see:
// search (no monitor in the guide) → detected (a monitor is in the guide) → analysing the photo →
// values found (review) or no monitor / unreadable (retake or enter by hand).
const CAM_MSG = {
  search: ['환자 모니터를 사각 영역 안에 맞춰 주세요', '모니터 화면 전체가 보이도록 비춰 주세요'],
  detected: ['환자 모니터가 감지되었습니다', 'PDA를 움직이지 말고 촬영 버튼을 눌러 주세요'],
  nomonitor: ['환자 모니터를 찾지 못했습니다', '모니터 화면 전체가 사각 영역에 들어오게 촬영해 주세요'],
  unreadable: ['측정값을 읽을 수 없습니다', '빛 반사·흔들림 없이 PDA를 고정하고 촬영해 주세요'],
};
const CAM_TAG = { detected: '환자 모니터 감지', nomonitor: '환자 모니터 미감지', unreadable: '측정값 인식 실패' };
/* ---------- 사진 선택 (gallery) ----------
   Browsers (and a long press on the PDA) get this stand-in for the device gallery: photos "taken on the ward", cut from
   the bedside scene at different spots, zooms, angles and light, plus a few memo / screenshot pictures.
   c = centre and z = side of the square crop (scene px) · t = light · r = tilt · blur · doc = not a photo of the ward.
   k = what the AI analysis finds in it: ok (a readable monitor) · unreadable (blurred) · nomonitor. */
const GALLERY = [
  ['오늘', [
    { k: 'ok', c: [697, 347], z: 330 }, // 환자 모니터
    { k: 'unreadable', c: [697, 350], z: 360, blur: 1 }, // 흔들린 모니터
    { k: 'nomonitor', c: [350, 520], z: 360 }, // 수액 거치대
    { k: 'ok', c: [650, 450], z: 560 }, // 모니터 + 모듈
    { k: 'nomonitor', c: [480, 930], z: 420 }, // 인공호흡기
    { k: 'nomonitor', doc: 'note' }, // 인수인계 메모
    { k: 'nomonitor', c: [740, 1130], z: 260 }, // 컵
    { k: 'ok', c: [705, 340], z: 300, r: -5 }, // 기울어진 모니터
    { k: 'ok', c: [467, 640], z: 900 }, // 병상 전체
    { k: 'nomonitor', c: [300, 600], z: 220 }, // 산소 게이지
    { k: 'nomonitor', c: [170, 1080], z: 340 }, // 베개
    { k: 'ok', c: [690, 360], z: 420, t: 'dim' }, // 야간 모니터
  ]],
  ['어제', [
    { k: 'ok', c: [700, 345], z: 380, t: 'warm' },
    { k: 'nomonitor', doc: 'list' }, // 검사 결과 화면 캡처
    { k: 'nomonitor', c: [450, 880], z: 640 },
    { k: 'nomonitor', c: [130, 130], z: 260 }, // 천장 조명
    { k: 'unreadable', c: [690, 360], z: 300, blur: 1, t: 'bright' }, // 빛 반사
    { k: 'nomonitor', c: [150, 560], z: 300 }, // 벽 장비
    { k: 'ok', c: [640, 470], z: 480, r: 4 },
    { k: 'nomonitor', c: [210, 1000], z: 420, t: 'warm' },
  ]],
  ['9월 15일', [
    { k: 'ok', c: [467, 600], z: 860, t: 'cool' },
    { k: 'ok', c: [700, 350], z: 340, t: 'cool' },
    { k: 'nomonitor', doc: 'note2' },
    { k: 'nomonitor', c: [300, 610], z: 260, t: 'cool' },
    { k: 'nomonitor', c: [740, 1100], z: 320, t: 'dim' },
    { k: 'nomonitor', c: [500, 950], z: 360, r: -3 },
  ]],
];
let gn = 0;
GALLERY.forEach(([, photos]) => photos.forEach((p) => (p.id = `g${++gn}`)));
const GALLERY_ALL = GALLERY.flatMap(([, photos]) => photos);
// ?shot=…&photo=ok|unreadable|nomonitor (older screenshots and tests) = the first three photos
const LEGACY = { ok: 'g1', unreadable: 'g2', nomonitor: 'g3' };
const photoById = (id) => GALLERY_ALL.find((p) => p.id === (LEGACY[id] || id));
const LOOK = {
  warm: 'sepia(0.28) saturate(1.15) brightness(1.03)',
  cool: 'saturate(0.85) hue-rotate(-12deg) brightness(1.05)',
  dim: 'brightness(0.7) contrast(1.05)',
  bright: 'brightness(1.15) contrast(0.92)',
};
const TILE = 101; // 4 per row on the 412px canvas
const ATTACH_MSG = {
  pick: ['첨부할 사진을 선택해 주세요', '환자 모니터 화면이 보이는 사진이어야 측정값을 인식할 수 있습니다'],
  ready: ['카메라를 준비하고 있습니다', ''],
  nomonitor: ['환자 모니터를 찾지 못했습니다', '환자 모니터 화면이 보이는 사진을 선택해 주세요'],
  unreadable: ['측정값을 읽을 수 없습니다', '흐리거나 빛이 반사된 사진입니다. 다른 사진을 선택해 주세요'],
};

/** A memo or screenshot picture (CSS-drawn, 101px design size). */
function docMarkup(kind) {
  if (kind === 'list') return `<span class="gdoc list"><b></b>${'<i></i>'.repeat(6)}</span>`;
  return `<span class="gdoc note${kind === 'note2' ? ' alt' : ''}"><b>${kind === 'note2' ? '투약 확인' : '인수인계'}</b><i></i><i></i><i class="s"></i><i></i><i class="s"></i></span>`;
}
const docBg = (ph) => (ph.doc === 'list' ? '#eef2f7' : '#cbb894');

/** A square gallery thumbnail cut from the bedside scene. `boxes`: show the OCR boxes (review screen). */
function photoThumb(ph, size = TILE, boxes = 'none') {
  if (ph.doc) return `<span class="album-thumb doc" style="width:${size}px;height:${size}px;background:${docBg(ph)}">${docMarkup(ph.doc)}</span>`;
  const k0 = size / ph.z;
  const style = `transform:translate(${size / 2 - ph.c[0] * k0}px,${size / 2 - ph.c[1] * k0}px) scale(${k0})`;
  const look = [ph.t ? `filter:${LOOK[ph.t]}` : '', ph.r ? `transform:rotate(${ph.r}deg) scale(1.12)` : ''].filter(Boolean).join(';');
  return `<span class="album-thumb${ph.blur ? ' blur' : ''}" style="width:${size}px;height:${size}px"><span class="ph-in" style="${look}">${sceneMarkup({ boxes, style })}</span></span>`;
}

/** 사진 선택: a full-screen gallery grid by date; tap a photo, then 첨부하기. */
export function openAlbum() {
  let sel = null;
  openSheet(
    `<div class="gal-head">
       <button class="icon-btn" data-sheet-act="dismiss" aria-label="닫기">${icon.close}</button>
       <p class="gal-title">사진 선택</p>
       ${badge('데모', 'count-grad')}
     </div>
     <p class="gal-hint">${icon.error}<span>환자 모니터 화면이 보이는 사진을 선택해 주세요.</span></p>
     <div class="gal-scroll scroll">${GALLERY.map(
       ([day, photos]) => `
       <div class="gal-day"><b>${day}</b><span>${photos.length}장</span></div>
       <div class="gal-grid">${photos
         .map(
           (ph) =>
             `<button class="album-item" data-sheet-act="pick" data-id="${ph.id}" data-k="${ph.k}" aria-label="${day} 사진 ${ph.id.slice(1)}">${photoThumb(ph)}<i class="gal-check">${icon.check}</i></button>`,
         )
         .join('')}</div>`,
     ).join('')}</div>
     <div class="gal-foot"><button class="btn cta" data-sheet-act="attach" disabled>첨부하기</button></div>`,
    {
      pick: (t) => {
        const sheet = t.closest('.sheet');
        const on = !t.classList.contains('sel');
        sheet.querySelectorAll('.album-item.sel').forEach((b) => b.classList.remove('sel'));
        t.classList.toggle('sel', on);
        sel = on ? t.dataset.id : null;
        const btn = sheet.querySelector('[data-sheet-act="attach"]');
        btn.disabled = !sel;
        btn.textContent = sel ? '첨부하기 (1)' : '첨부하기';
      },
      attach: () => {
        if (!sel) return;
        closeSheet();
        replace('vcam', { mode: 'attach', photo: sel }, 'fade');
      },
    },
    { cls: 'full gallery' },
  );
}

/** Shows a gallery photo full screen in the camera view, framed like its thumbnail. */
function setPhotoPose(el, ph) {
  const r = document.getElementById('stage').getBoundingClientRect().width / 412;
  const pv = el.querySelector('.cam-preview').getBoundingClientRect();
  const W = pv.width / r;
  const H = pv.height / r;
  const k = Math.max(W / ph.z, H / SCENE.h, W / SCENE.w);
  const tx = Math.min(0, Math.max(W - SCENE.w * k, W / 2 - ph.c[0] * k));
  const ty = Math.min(0, Math.max(H - SCENE.h * k, H / 2 - ph.c[1] * k));
  const scene = el.querySelector('.scene');
  scene.classList.remove('glide');
  scene.style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
  const sway = el.querySelector('.cam-sway');
  sway.style.filter = ph.t ? LOOK[ph.t] : '';
  sway.style.transform = ph.r ? `rotate(${ph.r}deg) scale(1.1)` : '';
}

const SHOT_SIM = {
  ok: '환자 모니터 촬영 (정상 인식)',
  nomonitor: '모니터가 없는 사진 (다른 곳을 촬영)',
  unreadable: '흐린 사진 (빛 반사·흔들림)',
};

let flashOn = false;
// pose: where the (simulated) camera points · hug: the focus frame follows the detected monitor
const cam = { run: 0, pose: 'search', hug: false, geo: null };

/** Guide rectangle and camera poses for the current preview size (design px). */
function camGeo(el) {
  const r = document.getElementById('stage').getBoundingClientRect().width / 412;
  const pv = el.querySelector('.cam-preview').getBoundingClientRect();
  const W = pv.width / r;
  const H = pv.height / r;
  const rel = (sel, edge) => (el.querySelector(sel).getBoundingClientRect()[edge] - pv.top) / r;
  // the guide sits in the free band between the patient chip and the hint text
  const top = rel('.cam-patient', 'bottom') + 44;
  const bottom = rel('.cam-hint', 'top') - 18;
  const ratio = (HOUSING.h + 20) / (HOUSING.w + 20);
  const gw = Math.min(W - 64, (bottom - top) / ratio);
  const gh = gw * ratio;
  const guide = { x: (W - gw) / 2, y: (top + bottom - gh) / 2, w: gw, h: gh };
  // a hand-held shot never matches the guide exactly: a little smaller and off-centre
  const k = (gw / (HOUSING.w + 20)) * 0.93;
  const cx = HOUSING.x + HOUSING.w / 2;
  const cy = HOUSING.y + HOUSING.h / 2;
  const pose = (dx, dy) => [
    Math.min(0, Math.max(W - SCENE.w * k, W / 2 + dx - cx * k)),
    // the photo ends just above the monitor: whatever is left shows as the dark top bar
    Math.max(H - SCENE.h * k, guide.y + gh / 2 + dy - cy * k),
  ];
  return { k, guide, poses: { aligned: pose(-6, 8), search: pose(70, 150), away: pose(300, -140) } };
}

function setPose(el, name, glide = false) {
  cam.pose = name;
  const [tx, ty] = cam.geo.poses[name];
  const scene = el.querySelector('.scene');
  scene.classList.toggle('glide', glide);
  scene.style.transform = `translate(${tx}px,${ty}px) scale(${cam.geo.k})`;
}

/** The bright focus window: the guide, or the detected monitor once there is one. */
function placeFocus(el) {
  const { k, poses, guide } = cam.geo;
  let r = guide;
  // only the demo scene knows where its monitor is; a real camera keeps the guide
  if (cam.hug && !el.classList.contains('live')) {
    const [tx, ty] = poses[cam.pose];
    const m = 8;
    r = { x: tx + (HOUSING.x - m) * k, y: ty + (HOUSING.y - m) * k, w: (HOUSING.w + m * 2) * k, h: (HOUSING.h + m * 2) * k };
  }
  Object.assign(el.querySelector('.focus').style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
}

function setPhase(el, phase) {
  el.dataset.phase = phase;
  if (CAM_MSG[phase]) {
    el.querySelector('.cam-hint').textContent = CAM_MSG[phase][0];
    el.querySelector('.cam-sub').textContent = CAM_MSG[phase][1];
  }
  // while analysing, the badge keeps saying what was in the guide when the photo was taken
  if (phase !== 'analyzing') {
    el.dataset.tag = phase === 'search' ? '' : phase === 'detected' ? 'ok' : 'fail';
    if (CAM_TAG[phase]) el.querySelector('.focus-tag span').textContent = CAM_TAG[phase];
    cam.hug = phase === 'detected' || phase === 'unreadable';
  }
  placeFocus(el);
}

/** Runs `fn` later unless the camera moved on (retake, new capture, screen left). */
function later(el, run, ms, fn) {
  setTimeout(() => {
    if (run === cam.run && el.isConnected) fn();
  }, ms);
}

/** Simulated aiming: the view settles on the monitor, then the detector reports it. */
function aimAtMonitor(el) {
  const run = ++cam.run;
  setPhase(el, 'search');
  later(el, run, 450, () => {
    setPose(el, 'aligned', true);
    later(el, run, 1150, () => setPhase(el, 'detected'));
  });
}

window.addEventListener('resize', () => {
  const el = document.querySelector('.scr-vcam');
  if (!el || !cam.geo) return;
  cam.geo = camGeo(el);
  setPose(el, cam.pose);
  placeFocus(el);
});

register('vcam', {
  bg: 'dark',
  render: ({ mode, photo }) => {
    const attach = mode === 'attach';
    const msg = attach && !photo ? ATTACH_MSG.pick : CAM_MSG.search;
    return `
    <div class="cam-preview">
      <video class="cam-video" playsinline muted></video>
      ${attach && photo === 'real' && cap.photo ? `<img class="cam-shot contain" src="${cap.photo}" alt="첨부한 사진">` : ''}
      ${attach && photoById(photo)?.doc ? `<div class="cam-doc" style="background:${docBg(photoById(photo))}"><span class="cam-doc-in">${docMarkup(photoById(photo).doc)}</span></div>` : ''}
      <div class="cam-sway">
        ${sceneMarkup()}
        <div class="focus">
          <i class="gc tl"></i><i class="gc tr"></i><i class="gc bl"></i><i class="gc br"></i>
          <span class="focus-tag"><b></b><span></span></span>
          <span class="scanline"></span>
        </div>
      </div>
      <span class="cam-scrim top"></span><span class="cam-scrim bottom"></span>
    </div>
    <header class="hdr cam-hdr">
      <button class="icon-btn dark" data-act="cam-close" aria-label="닫기">${icon.close}</button>
      <h1 class="hdr-title">${attach ? '사진첨부' : 'AI 카메라 촬영'}</h1>
      ${
        attach
          ? '<span class="icon-btn ghost"></span>'
          : `<button class="icon-btn dark${flashOn ? ' lit' : ''}" data-act="flash" aria-label="플래시">${flashOn ? icon.flashOn : icon.flashOff}</button>`
      }
    </header>
    <p class="cam-patient${cap.pid ? '' : ' unknown'}">${patientChip(attach)}</p>
    <div class="cam-view" aria-live="polite">
      <p class="cam-hint">${msg[0]}</p>
      <p class="cam-sub">${msg[1]}</p>
    </div>
    <div class="cam-foot">
      <div class="cam-progress" hidden><span class="bar"><i></i></span><span class="txt"></span></div>
      <div class="cam-retry" hidden>
        <button class="btn ghost" data-act="manual">직접 입력</button>
        ${attach ? '<button class="btn cta" data-act="album">다른 사진 선택</button>' : '<button class="btn cta" data-act="retake">다시 촬영</button>'}
      </div>
      ${
        attach
          ? `<button class="btn cta album-btn" data-act="album" data-long="album-demo"${photo ? ' hidden' : ''}>갤러리에서 선택</button>`
          : `<button class="shutter" data-act="shoot" data-long="shoot-sim" aria-label="촬영"><span></span></button>
             <p class="cam-tip">PDA 스캔 버튼으로도 촬영할 수 있습니다</p>`
      }
    </div>
    <div class="cam-flash"></div>`;
  },
  mount(el, params) {
    cam.geo = camGeo(el);
    cam.hug = false;
    setPose(el, 'search');
    if (params.mode === 'attach') return mountAttach(el, params);
    // ?shot=vcam renders a still state; reaching the camera by navigation always runs live
    if (params.shot === 'vcam') return shotState(el, params.phase);
    if (!isNative) return aimAtMonitor(el);
    // PDA: the real rear camera (the demo scene only if the camera cannot be used)
    el.classList.add('live', 'starting');
    el.querySelector('.cam-hint').textContent = CAM_MSG.ready[0];
    el.querySelector('.cam-sub').textContent = '';
    startLive(el);
  },
  actions: {
    'cam-close': () => pop(),
    flash: (t) => {
      flashOn = !flashOn;
      t.classList.toggle('lit', flashOn);
      t.innerHTML = flashOn ? icon.flashOn : icon.flashOff;
    },
    shoot: () => capture(),
    'shoot-sim': () => openShotSim(),
    // PDA: the device gallery · browser: the demo album (long press = demo album on the PDA, for the failure cases)
    album: () => (isNative ? pickFromGallery() : openAlbum()),
    'album-demo': () => openAlbum(),
    retake: () => retake(document.querySelector('.scr-vcam')),
    manual: () => {
      state.vocr = newOcr(true);
      replace('vreview', {}, 'fade');
    },
  },
  onScan: (code, params) => (params.mode === 'attach' ? null : capture()),
  // ignore back while the photo is being analysed
  onBack: () => document.querySelector('.scr-vcam')?.dataset.phase === 'analyzing',
});

function openShotSim() {
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">촬영 시뮬레이션</p>${badge('데모', 'count-grad')}</div>
     <p class="sheet-hint">어떤 사진이 찍히는지에 따라 달라지는 인식 결과를 미리 봅니다.</p>
     <div class="sheet-list">${Object.entries(SHOT_SIM)
       .map(([k, label]) => `<button class="opt" data-sheet-act="sim" data-kind="${k}"><span class="lbl">${esc(label)}</span><span class="chev">${icon.chevronRight}</span></button>`)
       .join('')}</div>`,
    {
      sim: (t) => {
        closeSheet();
        capture(t.dataset.kind);
      },
    },
  );
}

/**
 * Takes the photo and analyses it. The result depends on what was in the guide, not on the button:
 * no detected monitor → "not found"; a blurred frame → "unreadable"; otherwise the values are read.
 * `sim` (demo sheet) first points the camera so that the requested photo is what gets taken.
 */
function capture(sim, attached = false) {
  const el = document.querySelector('.scr-vcam');
  if (!el || el.classList.contains('captured') || el.classList.contains('starting')) return;
  const live = el.classList.contains('live');
  if (!attached && live && sim === 'nomonitor') setPhase(el, 'search');
  if (!attached && !live && sim === 'nomonitor' && cam.pose !== 'away') {
    const run = ++cam.run;
    setPhase(el, 'search');
    setPose(el, 'away', true);
    return later(el, run, 1250, () => capture('nomonitor'));
  }
  if (!attached && sim && sim !== 'nomonitor' && el.dataset.phase !== 'detected') {
    if (!live) setPose(el, 'aligned');
    setPhase(el, 'detected');
  }
  // an attached photo is analysed as it is: the result depends only on what the photo shows
  const outcome = attached ? sim : el.dataset.phase !== 'detected' ? 'nomonitor' : sim === 'unreadable' ? 'unreadable' : 'ok';
  ++cam.run; // the view no longer changes
  el.classList.add('captured');
  el.classList.toggle('blurry', outcome === 'unreadable');
  if (live) freezeFrame(el);
  if (cap.pid) return analyse(el, outcome, attached);
  // the photo is taken: whose vitals are these? → 환자 팔찌 스캔
  el.classList.add('asking');
  askPatient({
    desc: `${attached ? '첨부한' : '촬영한'} 사진을 저장할 환자의\n팔찌 바코드를 스캔하세요.`,
    onPatient: (pid) => {
      selectPatient(pid);
      cap.pid = pid;
      const chip = el.querySelector('.cam-patient');
      chip.textContent = patientChip(attached);
      chip.classList.remove('unknown');
      analyse(el, outcome, attached);
    },
    onCancel: () => (attached ? replace('vcam', { mode: 'attach' }, 'fade') : retake(el)),
  });
}

/** AI analysis of the photo (demo): progress, then review — or the failure for a photo without a readable monitor. */
function analyse(el, outcome, attached) {
  if (!el.isConnected) return;
  el.classList.remove('asking');
  const run = ++cam.run;
  setPhase(el, 'analyzing');
  const prog = el.querySelector('.cam-progress');
  prog.hidden = false;
  const bar = prog.querySelector('.bar i');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
  bar.style.animationDuration = outcome === 'ok' ? '2.3s' : '1.4s';
  const txt = prog.querySelector('.txt');
  txt.textContent = attached ? '첨부한 이미지를 확인하고 있습니다' : '촬영한 이미지를 확인하고 있습니다';
  if (outcome === 'nomonitor') return later(el, run, 1400, () => failed(el, 'nomonitor'));
  later(el, run, 600, () => (txt.textContent = '측정값을 찾고 있습니다'));
  if (outcome === 'unreadable') return later(el, run, 1800, () => failed(el, 'unreadable'));
  // recognition boxes appear one by one on the frozen frame (only the demo scene knows where its values are)
  const scene = !el.classList.contains('live') && !el.classList.contains('real');
  if (scene) later(el, run, 600, () => el.querySelector('.mscreen').insertAdjacentHTML('beforeend', ocrLayer('seq')));
  let n = 0;
  OCR_FIELDS.forEach((f, i) =>
    later(el, run, 1020 + i * 220, () => {
      if (f.read) txt.textContent = `측정값 ${++n}개 인식`;
    }),
  );
  const found = OCR_FIELDS.filter((f) => f.read).length;
  const end = 900 + OCR_FIELDS.length * 220;
  later(el, run, end + 150, () => {
    txt.textContent = `측정값 ${found}개 인식${found < OCR_FIELDS.length ? ` · 미인식 ${OCR_FIELDS.length - found}개` : ''}`;
  });
  later(el, run, end + 950, () => {
    state.vocr = newOcr();
    replace('vreview', {}, 'fade');
  });
}

function failed(el, kind) {
  el.classList.add('failed');
  setPhase(el, kind);
  if (el.classList.contains('attach')) {
    el.querySelector('.cam-hint').textContent = ATTACH_MSG[kind][0];
    el.querySelector('.cam-sub').textContent = ATTACH_MSG[kind][1];
  }
  el.querySelector('.cam-progress').hidden = true;
  el.querySelector('.cam-retry').hidden = false;
  navigator.vibrate?.([30, 60, 30]);
}

function retake(el) {
  if (!el) return;
  el.classList.remove('captured', 'failed', 'blurry', 'asking');
  el.querySelector('.mscreen .ocr-layer')?.remove();
  el.querySelector('.cam-retry').hidden = true;
  el.querySelector('.cam-progress').hidden = true;
  if (!el.classList.contains('live')) return aimAtMonitor(el);
  el.querySelector('.cam-shot')?.remove();
  cap.photo = null;
  el.querySelector('.cam-video').play().catch(() => {});
  aimLive(el);
}

/** 사진첨부: without a photo the album opens; with one, the photo is shown frozen and analysed. */
function mountAttach(el, { photo, shot }) {
  el.classList.add('attach');
  if (!photo) {
    el.dataset.phase = 'pick';
    // browsers have no PDA gallery: the demo album stands in (on the PDA startAttach opened the gallery)
    if (!shot && !isNative) setTimeout(() => el.isConnected && openAlbum(), 250);
    return;
  }
  if (photo === 'real') {
    // a photo from the PDA gallery, shown whole while it is analysed
    el.classList.add('real');
    setPhase(el, 'search');
    el.querySelector('.cam-hint').textContent = '';
    el.querySelector('.cam-sub').textContent = '';
    setTimeout(() => el.isConnected && capture('ok', true), shot ? 0 : 300);
    return;
  }
  // a photo from the 사진 선택 gallery: shown full screen, framed like its thumbnail
  const ph = photoById(photo);
  cap.photo = null;
  cap.gal = ph;
  if (ph.doc) el.classList.add('docphoto');
  else setPhotoPose(el, ph);
  setPhase(el, 'search');
  el.querySelector('.cam-hint').textContent = '';
  el.querySelector('.cam-sub').textContent = '';
  setTimeout(() => el.isConnected && capture(ph.k, true), shot ? 0 : 300);
}

/** ?shot=vcam&phase=search|detected|nomonitor|unreadable — a still state for screenshots. */
function shotState(el, phase = 'detected') {
  if (phase === 'search') return setPhase(el, 'search');
  setPose(el, phase === 'nomonitor' ? 'away' : 'aligned');
  setPhase(el, phase === 'nomonitor' ? 'search' : 'detected');
  if (phase === 'nomonitor' || phase === 'unreadable') {
    el.classList.add('captured');
    el.classList.toggle('blurry', phase === 'unreadable');
    failed(el, phase);
  }
}

/* ---------------- 2. review & edit ---------------- */
function fieldCell(f, o) {
  const v = o.values[f.k];
  const flag = flagOf(f.k, v);
  const low = needsCheck(f, o);
  const read = readOf(f, o);
  let state3;
  if (o.edited[f.k]) state3 = `<span class="vf-tag edited">${icon.edit}${read ? '수정됨' : '직접 입력'}</span>`;
  else if (missing(f, o)) state3 = `<span class="vf-tag low">${o.manual ? '입력 필요' : '미인식 · 직접 입력'}</span>`;
  else if (low) state3 = `<button class="vf-tag low" data-act="ack" data-k="${f.k}">확인 필요</button>`;
  else if (o.checked[f.k]) state3 = `<span class="vf-tag ok">${icon.check}확인됨</span>`;
  else state3 = `<span class="vf-tag ai">AI ${f.conf}%</span>`;
  const flagTag = flag ? `<span class="vflag ${flag}">${flag === 'danger' ? '경고' : '주의'}</span>` : '';
  return `
    <label class="vfield${low ? ' low' : ''}${o.edited[f.k] ? ' edited' : ''}" data-k="${f.k}">
      <span class="vf-top"><span class="vf-k">${f.k}</span><span class="vf-n">${f.name}</span>${flagTag}</span>
      <span class="vf-mid">
        <input class="vf-in ${flag || ''}" data-k="${f.k}" type="text" inputmode="decimal" value="${esc(v)}" placeholder="${read ? '' : '입력'}" aria-label="${f.name}" autocomplete="off">
        <span class="vf-u">${f.unit}</span>
      </span>
      <span class="vf-bot">${state3}</span>
    </label>`;
}

register('vreview', {
  bg: 'screen',
  render: () => {
    const o = state.vocr || (state.vocr = newOcr());
    const pending = OCR_FIELDS.filter((f) => needsCheck(f, o)).length;
    const attach = cap.mode === 'attach';
    return `
      ${header({ title: patientTitle(), left: 'back', right: 'close' })}
      <div class="screen-body scroll ocr-review">
        ${o.manual ? `
        <h2 class="vr-title gtext">활력징후 직접 입력</h2>
        <p class="vr-desc">${attach ? '첨부한' : '촬영한'} 이미지에서 측정값을 인식하지 못했습니다.<br>환자 모니터를 보고 측정값을 직접 입력해 주세요.</p>` : `
        <h2 class="vr-title ask gtext">${attach ? '모니터 사진을 첨부하신 것 같습니다.' : '환자 모니터를 촬영하신 것 같습니다.'}<br>활력징후 데이터로 입력할까요?</h2>
        <section class="ocr-card">
          <div class="ocr-card-head"><span class="ocr-card-title gtext">${attach ? '첨부 이미지' : '촬영 이미지'}</span>
            <span class="badge count-grad">인식 ${OCR_FIELDS.filter((f) => f.read).length}/${OCR_FIELDS.length}</span></div>
          <div class="ocr-thumb">${
            cap.photo ? `<img class="ocr-photo" src="${cap.photo}" alt="">` : attach && cap.gal ? `<div class="ocr-gal">${photoThumb(cap.gal, 334, 'static')}</div>` : thumbMarkup()
          }</div>
        </section>`}
        <section class="ocr-card">
          <div class="ocr-card-head"><span class="ocr-card-title gtext">측정값</span>
            <span class="ocr-meta">${MEASURED.time} · ${NURSE.label}</span></div>
          <p class="ocr-note${pending ? ' warn' : ''}">${
            pending
              ? `${icon.error}<span>${o.manual ? `입력 필요 ${pending}건 · 측정값을 모두 입력해 주세요` : `확인 필요 ${pending}건 · 수정·입력하거나, 맞으면 '확인 필요'를 눌러 주세요`}</span>`
              : `${icon.checkCircle}<span>${o.manual ? '모든 측정값을 입력했습니다' : '모든 항목을 확인했습니다'}. 값을 눌러 수정할 수 있습니다</span>`
          }</p>
          <div class="vfields">${OCR_FIELDS.map((f) => fieldCell(f, o)).join('')}</div>
        </section>
      </div>
      <div class="screen-foot two-btns">
        <button class="btn line" data-act="retake">${attach ? '다른 사진 선택' : '다시 촬영'}</button>
        ${button('확인', 'review-ok')}
      </div>`;
  },
  mount(el) {
    el.querySelectorAll('.vf-in').forEach((input) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9.]/g, '');
        const k = input.dataset.k;
        const f = OCR_FIELDS.find((x) => x.k === k);
        state.vocr.values[k] = input.value;
        state.vocr.edited[k] = input.value !== readOf(f, state.vocr);
        // update colour/flag live without re-rendering (keeps the keyboard open)
        const flag = flagOf(k, input.value);
        input.className = `vf-in ${flag || ''}`;
      });
      input.addEventListener('change', () => rerender());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
    });
  },
  actions: {
    'hdr-back': () => backToCamera(),
    'hdr-close': () => pop(),
    retake: () => backToCamera(true),
    ack: (t) => {
      state.vocr.checked[t.dataset.k] = true;
      rerender();
    },
    'review-ok': () => {
      const o = state.vocr;
      const empty = OCR_FIELDS.filter((f) => readOf(f, o) && !String(o.values[f.k]).trim());
      if (empty.length) return toast(`${empty.map((f) => f.name).join(', ')} 값을 입력해 주세요.`);
      const pending = OCR_FIELDS.filter((f) => needsCheck(f, o));
      if (pending.length) {
        toast(o.manual ? `측정값 ${pending.length}건을 입력해 주세요.` : `확인 필요 항목 ${pending.length}건을 확인해 주세요.`);
        pending.forEach((f) => {
          const cell = document.querySelector(`.vfield[data-k="${f.k}"]`);
          cell?.classList.remove('nudge');
          void cell?.offsetWidth;
          cell?.classList.add('nudge');
        });
        return;
      }
      openConfirm();
    },
  },
  onBack: () => {
    backToCamera();
    return true;
  },
});

/** 다시 촬영 → camera · 다른 사진 선택 → gallery (the patient stays: no second wristband scan). */
function backToCamera(pick = false) {
  if (cap.mode !== 'attach') return replace('vcam', {}, 'fade');
  replace('vcam', { mode: 'attach' }, 'fade');
  if (pick && isNative) pickFromGallery();
}

/* ---------------- 3. final confirm (sheet) ---------------- */
function openConfirm() {
  const o = state.vocr;
  const flags = OCR_FIELDS.map((f) => flagOf(f.k, o.values[f.k]));
  const nDanger = flags.filter((x) => x === 'danger').length;
  const nWarn = flags.filter((x) => x === 'warn').length;
  const nFixed = OCR_FIELDS.filter((f) => o.edited[f.k] && readOf(f, o)).length;
  const nTyped = OCR_FIELDS.filter((f) => o.edited[f.k] && !readOf(f, o)).length;
  const edits = [nFixed ? `AI 인식 값 수정 <b>${nFixed}건</b>` : '', nTyped ? `직접 입력 <b>${nTyped}건</b>` : ''].filter(Boolean);
  const notes = [
    edits.length ? `<p>${icon.edit}<span>${edits.join(' · ')}</span></p>` : '',
    nDanger || nWarn
      ? `<p class="alert">${icon.error}<span>${[nDanger ? `경고 ${nDanger}건` : '', nWarn ? `주의 ${nWarn}건` : ''].filter(Boolean).join(' · ')}이 포함되어 있습니다.</span></p>`
      : '',
  ].join('');
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">전송 전 최종 확인</p><span class="chip on"><span>EMR</span></span></div>
     <div class="sheet-sub"><span class="sheet-drug">${esc(patientTitle())} · ${PATIENT.bed}</span><span class="cf-when">${MEASURED.date.slice(5).replace('-', '/')} ${MEASURED.time}</span></div>
     <div class="cf-grid">${OCR_FIELDS.map((f, i) => `
       <div class="cf-cell${o.edited[f.k] ? ' edited' : ''}">
         <span class="cf-k">${f.k}</span>
         <span class="cf-v ${flags[i] || ''}">${esc(o.values[f.k])}<small>${f.unit}</small></span>
       </div>`).join('')}</div>
     <div class="cf-notes">${notes}<p>${icon.checkCircle}<span>측정자 ${NURSE.label} · 임상관찰기록에 저장됩니다.</span></p></div>
     <div class="sheet-btns">
       <button class="btn line" data-sheet-act="cancel">취소</button>
       <button class="btn" data-sheet-act="send">EMR 전송</button>
     </div>`,
    {
      cancel: () => closeSheet(),
      send: () => {
        closeSheet();
        // the detail screen's 임상관찰기록 now shows these values
        state.vitals = {
          time: MEASURED.time,
          who: NURSE.label,
          items: OCR_FIELDS.map((f) => ({
            k: f.k,
            v: o.values[f.k],
            unit: f.unit,
            at: `${MEASURED.date.slice(5).replace('-', '/')} ${MEASURED.time}`,
            flag: flagOf(f.k, o.values[f.k]),
          })),
        };
        completeTask('vital', MEASURED.time);
        replace('vdone', {}, 'fade');
      },
    },
  );
}

/* ---------------- 4. sent ---------------- */
register('vdone', {
  bg: 'screen',
  render: () => `
    ${header({ title: patientTitle() })}
    <div class="screen-body center-status">
      <span class="spacer" style="flex-grow: 186"></span>
      ${statusBlock({ img: 'check-blue', title: '활력징후 전송 완료', desc: '확인한 측정값이 EMR 임상관찰기록에\n실시간 전송되었습니다.' })}
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
