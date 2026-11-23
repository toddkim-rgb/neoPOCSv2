// 사진 촬영 · 사진첨부 → 활력징후 OCR (AI 커맨드바 +). Both start without a patient:
//   사진 촬영: camera → 촬영 → 환자 팔찌 스캔 → AI recognition → review & edit → final confirm → EMR sent
//   사진첨부:  gallery → 사진 선택 → 환자 팔찌 스캔 → (same analysis)
// On the PDA (Capacitor) the camera is the device's rear camera and the gallery is the Android photo picker; browsers
// (and a PDA that refuses the camera) use the demo bedside scene and demo album instead. The analysis itself is a
// demo: whatever was photographed, the demo monitor values are "read"; long presses pick the failure cases.
// Not in the Figma file: built from the existing components (header, cards, badges, vitals cells, sheets).
// 사진 촬영 용도 (2026-11-23): the app does not know what will be photographed. AI 커맨드바 + → '사진' sheet: 사진 촬영
// (환자 · 장비 · 기타) or 갤러리. The camera opens in that 촬영 모드 (no chips on the camera: the mode was chosen on
// the sheet, 2026-11-23), and it says what it detects (환자 모니터 · 주입 펌프 · 환부 · 서류); after the photo
// (and the wristband, unless the patient was chosen first) it goes to the matching record screen — vitals here,
// 주입 펌프 · 환부 · 기타 첨부 in photo.js — and an unrecognised subject asks '무엇을 촬영하셨나요?'.
// Browsers cannot see real objects: '시연' picks what the demo camera is pointed at.
// 활력징후 '사진 입력' (2026-11-23): the same camera in 'fill' mode — 환자 모니터만 찾고, 인식한 값을 활력징후 입력 칸에
// 채운 뒤 그 화면으로 돌아갑니다 (용도 선택 · 팔찌 스캔 없음).
import { Capacitor } from '@capacitor/core';
import { register, go, replace, pop, rerender } from '../router.js';
import { header, button, statusBlock, badge, esc, toast, openSheet, closeSheet, patientLine } from '../ui.js';
import { icon } from '../icons.js';
import { PATIENT, NURSE, patientTitle } from '../data.js';
import { state, completeTask, selectPatient, recordVitals } from '../state.js';
import { askPatient } from '../patientscan.js';
import { voiceButton, openVoiceInput, flashVoiced } from '../vvoice.js';
import { feedback } from '../feedback.js';
import { prevLine, prevValues, prevVital, fillVital } from './work.js';
import { artSvg, openPurposeSheet } from './photo.js';
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
// photo: data/blob URL of a real photo · gal: demo gallery photo · shoot: 촬영 모드 · target: what the (demo) camera is
// pointed at · shows: what the taken photo shows
const cap = { mode: 'camera', pid: null, photo: null, gal: null, shoot: 'auto', target: 'monitor', shows: null };

/* 촬영 모드 (picked on the '사진' sheet): 환자 (환부 · 환자 상태) and 기타 record whatever is photographed; 장비 detects
   환자 모니터 · 주입 펌프. 'auto' (every known subject) is only used for attached gallery photos. */
// 시연: what the demo camera is pointed at when the camera opens in a 촬영 모드
const MODE_TARGET = { wound: 'wound', device: 'monitor', other: 'doc' };
const DETECTS = {
  auto: ['monitor', 'blur', 'pump', 'wound', 'doc'],
  device: ['monitor', 'blur', 'pump'],
  wound: ['wound'],
  other: [],
  fill: ['monitor', 'blur'], // 활력징후 사진 입력: 환자 모니터만
};
const isFill = () => cap.shoot === 'fill';
const detectable = (shoot, target) => DETECTS[shoot].includes(target);
// what a detected subject is recorded as
const KIND_OF = { monitor: 'monitor', blur: 'monitor', pump: 'pump', wound: 'wound', doc: 'other' };
// 시연: what the demo camera is pointed at
const TARGETS = {
  monitor: ['환자 모니터', '환자 모니터'],
  blur: ['흐린 모니터', '흐린 모니터 (빛 반사 · 흔들림)'],
  pump: ['주입 펌프', '주입 펌프 (수액 100 mL/h)'],
  wound: ['환부', '환부 (욕창)'],
  doc: ['서류', '서류 (동의서)'],
  none: ['다른 곳', '다른 곳 (알아볼 대상 없음)'],
};
const ART = ['pump', 'wound', 'doc']; // subjects drawn as pictures (photo.js artSvg) instead of the bedside scene
// where the subject sits in its 360×480 picture (the focus frame locks onto it)
const ART_BOX = { pump: [31, 159, 240, 173], wound: [88, 158, 193, 158], doc: [58, 48, 244, 336] };

/**
 * AI 커맨드바 + → 사진 촬영: the camera opens at once; the patient is scanned after the photo.
 * From 환자 상세 '사진 촬영' the patient is already chosen (`pid`), so the wristband scan is skipped.
 * 활력징후 '사진 입력': `shoot: 'fill'` with the patient of the 활력징후 screen.
 */
export function startCamera({ pid = null, shoot = 'device' } = {}) {
  Object.assign(cap, { mode: 'camera', pid: null, photo: null, gal: null, shoot, target: MODE_TARGET[shoot] || 'monitor', shows: null });
  if (pid) {
    selectPatient(pid);
    cap.pid = pid;
  }
  state.vphoto = null;
  go('vcam', {});
}

/**
 * AI 커맨드바 + → 사진: 사진 촬영 (환자 · 장비 · 기타 — the camera opens in that 촬영 모드) or 갤러리 선택.
 * The patient is scanned after the photo, as before.
 */
export function openPhotoSheet() {
  const opt = (act, k, ico, label, desc) =>
    `<button class="opt photo-opt" data-sheet-act="${act}" data-k="${k}"><span class="po-ico">${ico}</span><span class="lbl">${label}<small>${desc}</small></span><span class="chev">${icon.chevronRight}</span></button>`;
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">사진</p></div>
     <p class="sheet-hint">촬영할 대상을 고르거나 갤러리에서 사진을 선택하세요. 촬영 후 환자 팔찌를 스캔합니다.</p>
     <p class="ps-sec">사진 촬영</p>
     <div class="sheet-list">
       ${opt('shoot', 'wound', icon.camera, '환자', '환부 · 욕창 · 피부 상태')}
       ${opt('shoot', 'device', icon.camera, '장비', '환자 모니터(활력징후) · 주입 펌프')}
       ${opt('shoot', 'other', icon.camera, '기타', '서류 · 약 라벨 · 식사량 등')}
     </div>
     <p class="ps-sec">갤러리</p>
     <div class="sheet-list">${opt('gallery', '', icon.gallery, '갤러리에서 선택', '찍어 둔 사진을 첨부')}</div>`,
    {
      shoot: (t) => {
        closeSheet(true);
        startCamera({ shoot: t.dataset.k });
      },
      // still inside the tap, so the PDA gallery may open
      gallery: () => {
        closeSheet(true);
        startAttach();
      },
    },
    { cls: 'photo-sheet' },
  );
}

/** 사진 → 갤러리에서 선택: the PDA gallery opens at once (browsers: the demo album). */
export function startAttach() {
  Object.assign(cap, { mode: 'attach', pid: null, photo: null, gal: null, shoot: 'auto', target: 'monitor', shows: null });
  state.vphoto = null;
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
    aim(el);
  }
}

/** The prototype has no detector: after the PDA has been held still for a moment it reports the 시연 subject. */
function aimLive(el) {
  const run = ++cam.run;
  setPhase(el, 'search');
  later(el, run, 1800, () => detectable(cap.shoot, cap.target) && setPhase(el, 'detected'));
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
  ready: ['카메라를 준비하고 있습니다', ''],
  nomonitor: ['환자 모니터를 찾지 못했습니다', '모니터 화면 전체가 사각 영역에 들어오게 촬영해 주세요'],
  unreadable: ['측정값을 읽을 수 없습니다', '빛 반사·흔들림 없이 PDA를 고정하고 촬영해 주세요'],
  unknown: ['무엇을 촬영했는지 알아보지 못했습니다', '기록할 용도를 골라 주세요'],
};
// searching: per 촬영 모드 · detected: per subject
const SEARCH_MSG = {
  auto: ['촬영할 대상을 사각 영역 안에 맞춰 주세요', '환자 모니터 · 주입 펌프 · 환부 · 서류를 알아봅니다'],
  device: ['장비 화면을 사각 영역 안에 맞춰 주세요', '환자 모니터 · 주입 펌프 화면 전체가 보이도록 비춰 주세요'],
  wound: ['환부 · 환자 상태를 사각 영역 안에 맞춰 주세요', '밝은 곳에서 흔들리지 않게 촬영해 주세요'],
  other: ['기록할 대상을 촬영해 주세요', '촬영 후 태그와 메모를 붙여 간호기록에 첨부합니다'],
  fill: ['환자 모니터를 사각 영역 안에 맞춰 주세요', '인식한 측정값을 활력징후 입력 칸에 채웁니다'],
};
const FOUND_MSG = {
  monitor: ['환자 모니터가 감지되었습니다', 'PDA를 움직이지 말고 촬영 버튼을 눌러 주세요'],
  pump: ['주입 펌프가 감지되었습니다', '펌프 화면이 잘 보이게 촬영해 주세요'],
  wound: ['환부가 감지되었습니다', '환부 전체가 보이도록 촬영해 주세요'],
  doc: ['서류가 감지되었습니다', '서류 전체가 보이도록 촬영해 주세요'],
};
FOUND_MSG.blur = FOUND_MSG.monitor;
const DETECT_TAG = { monitor: '환자 모니터 감지', blur: '환자 모니터 감지', pump: '주입 펌프 감지', wound: '환부 감지', doc: '서류 감지' };
const CAM_TAG = { nomonitor: '환자 모니터 미감지', unreadable: '측정값 인식 실패', unknown: '용도 확인 필요' };
/* ---------- 사진 선택 (gallery) ----------
   Browsers (and a long press on the PDA) get this stand-in for the device gallery: photos "taken on the ward", cut from
   the bedside scene at different spots, zooms, angles and light, plus a few memo / screenshot pictures.
   c = centre and z = side of the square crop (scene px) · t = light · r = tilt · blur · doc = a memo / screenshot ·
   art = a picture from photo.js (주입 펌프 · 환부).
   k = what the AI analysis finds in it: ok (a readable monitor) · unreadable (blurred) · nomonitor (nothing it knows) ·
   pump · wound · doc. */
const GALLERY = [
  ['오늘', [
    { k: 'ok', c: [697, 347], z: 330 }, // 환자 모니터
    { k: 'unreadable', c: [697, 350], z: 360, blur: 1 }, // 흔들린 모니터
    { k: 'nomonitor', c: [350, 520], z: 360 }, // 수액 거치대
    { k: 'pump', art: 'pump' }, // 주입 펌프
    { k: 'wound', art: 'wound' }, // 환부 (자와 함께)
    { k: 'ok', c: [650, 450], z: 560 }, // 모니터 + 모듈
    { k: 'nomonitor', c: [480, 930], z: 420 }, // 인공호흡기
    { k: 'doc', doc: 'note' }, // 인수인계 메모
    { k: 'nomonitor', c: [740, 1130], z: 260 }, // 컵
    { k: 'ok', c: [705, 340], z: 300, r: -5 }, // 기울어진 모니터
    { k: 'ok', c: [467, 640], z: 900 }, // 병상 전체
    { k: 'nomonitor', c: [300, 600], z: 220 }, // 산소 게이지
    { k: 'nomonitor', c: [170, 1080], z: 340 }, // 베개
    { k: 'ok', c: [690, 360], z: 420, t: 'dim' }, // 야간 모니터
  ]],
  ['어제', [
    { k: 'ok', c: [700, 345], z: 380, t: 'warm' },
    { k: 'doc', art: 'doc' }, // 동의서
    { k: 'doc', doc: 'list' }, // 검사 결과 화면 캡처
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
    { k: 'wound', art: 'wound-prev' }, // 같은 환부, 이틀 전
    { k: 'doc', doc: 'note2' },
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
// what a gallery photo shows, in camera terms
const TARGET_OF = { ok: 'monitor', unreadable: 'blur', nomonitor: 'none', pump: 'pump', wound: 'wound', doc: 'doc' };
const ATTACH_MSG = {
  pick: ['첨부할 사진을 선택해 주세요', '환자 모니터 · 주입 펌프 · 환부 · 서류 사진을 알아봅니다'],
  ready: ['카메라를 준비하고 있습니다', ''],
  unknown: ['사진의 대상을 알아보지 못했습니다', '기록할 용도를 골라 주세요'],
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
  if (ph.art) return `<span class="album-thumb art" style="width:${size}px;height:${size}px">${artSvg(ph.art)}</span>`;
  if (ph.doc) return `<span class="album-thumb doc" style="width:${size}px;height:${size}px;background:${docBg(ph)}">${docMarkup(ph.doc)}</span>`;
  const k0 = size / ph.z;
  const style = `transform:translate(${size / 2 - ph.c[0] * k0}px,${size / 2 - ph.c[1] * k0}px) scale(${k0})`;
  const look = [ph.t ? `filter:${LOOK[ph.t]}` : '', ph.r ? `transform:rotate(${ph.r}deg) scale(1.12)` : ''].filter(Boolean).join(';');
  return `<span class="album-thumb${ph.blur ? ' blur' : ''}" style="width:${size}px;height:${size}px"><span class="ph-in" style="${look}">${sceneMarkup({ boxes, style })}</span></span>`;
}

/** A real photo cut from the bedside scene (멀티미디어 시연 자료): `c` = centre, `z` = side of the square crop. */
export const scenePhoto = (size, { c = [697, 347], z = 330 } = {}) => photoThumb({ c, z }, size);

/** 사진 선택: a full-screen gallery grid by date; tap a photo, then 첨부하기. */
export function openAlbum() {
  let sel = null;
  openSheet(
    `<div class="gal-head">
       <button class="icon-btn" data-sheet-act="dismiss" aria-label="닫기">${icon.close}</button>
       <p class="gal-title">사진 선택</p>
       ${badge('데모', 'count-grad')}
     </div>
     <p class="gal-hint">${icon.error}<span>환자 모니터 · 주입 펌프 · 환부 · 서류를 알아보고, 나머지는 용도를 물어봅니다.</span></p>
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

/**
 * Shows a picture subject (pump · wound · doc) in the camera view. Aiming: the subject sits in the guide, a little
 * off-centre like a hand-held shot · `cover`: a gallery photo, shown whole screen.
 */
function placeArt(el, kind, cover = false) {
  const box = el.querySelector('.cam-alt');
  const base = String(kind).split('-')[0]; // wound-prev: the same wound, an older photo
  if (!ART.includes(base)) {
    el.classList.remove('altscene');
    box.innerHTML = '';
    cam.art = null;
    return;
  }
  el.classList.add('altscene');
  if (box.dataset.kind !== kind) {
    box.innerHTML = artSvg(kind);
    box.dataset.kind = kind;
  }
  let k, tx, ty;
  if (cover) {
    const r = document.getElementById('stage').getBoundingClientRect().width / 412;
    const pv = el.querySelector('.cam-preview').getBoundingClientRect();
    k = Math.max(pv.width / r / 360, pv.height / r / 480);
    tx = (pv.width / r - 360 * k) / 2;
    ty = (pv.height / r - 480 * k) / 2;
  } else {
    const g = cam.geo.guide;
    const [x, y, w, h] = ART_BOX[base];
    k = Math.min(g.w / w, g.h / h) * 0.92;
    tx = g.x + g.w / 2 - (x + w / 2) * k - 5;
    ty = g.y + g.h / 2 - (y + h / 2) * k + 7;
  }
  box.querySelector('svg').style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
  cam.art = { kind: base, k, tx, ty };
}

let flashOn = false;
// pose: where the (simulated) camera points · hug: the focus frame follows the detected subject · art: picture subject
const cam = { run: 0, pose: 'search', hug: false, geo: null, art: null };

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
  // only the demo scene knows where its subject is; a real camera keeps the guide
  if (cam.hug && !el.classList.contains('live')) {
    const m = 8;
    if (cam.art) {
      const { kind, k: ka, tx, ty } = cam.art;
      const [x, y, w, h] = ART_BOX[kind];
      r = { x: tx + (x - m) * ka, y: ty + (y - m) * ka, w: (w + m * 2) * ka, h: (h + m * 2) * ka };
    } else {
      const [tx, ty] = poses[cam.pose];
      r = { x: tx + (HOUSING.x - m) * k, y: ty + (HOUSING.y - m) * k, w: (HOUSING.w + m * 2) * k, h: (HOUSING.h + m * 2) * k };
    }
  }
  Object.assign(el.querySelector('.focus').style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
}

function setPhase(el, phase) {
  el.dataset.phase = phase;
  const msg = phase === 'search' ? SEARCH_MSG[cap.shoot] : phase === 'detected' ? FOUND_MSG[cap.target] : CAM_MSG[phase];
  if (msg) {
    el.querySelector('.cam-hint').textContent = msg[0];
    el.querySelector('.cam-sub').textContent = msg[1];
  }
  // while analysing, the badge keeps saying what was in the guide when the photo was taken
  if (phase !== 'analyzing') {
    el.dataset.tag = phase === 'search' ? '' : phase === 'detected' ? 'ok' : 'fail';
    const tag = phase === 'detected' ? DETECT_TAG[cap.target] : CAM_TAG[phase];
    if (tag) el.querySelector('.focus-tag span').textContent = tag;
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

/**
 * Simulated aiming at the 시연 subject: the view settles on it, then the detector reports it if the 촬영 모드
 * looks for it (기타 looks for nothing; 다른 곳 has nothing to find).
 */
function aim(el) {
  if (el.classList.contains('live')) return aimLive(el);
  const run = ++cam.run;
  const t = cap.target;
  placeArt(el, t);
  setPose(el, 'search');
  setPhase(el, 'search');
  later(el, run, 450, () => {
    if (t === 'none') return setPose(el, 'away', true);
    if (!ART.includes(t)) setPose(el, 'aligned', true);
    later(el, run, 1150, () => detectable(cap.shoot, t) && setPhase(el, 'detected'));
  });
}

/** Writes the 시연 subject without re-rendering the camera. */
function syncControls(el) {
  const demo = el.querySelector('.cam-demo b');
  if (demo) demo.textContent = TARGETS[cap.target][0];
}

/** 시연: what the demo camera is pointed at (long press on the shutter: point and shoot at once). */
function openTargetSheet(shoot = false) {
  openSheet(
    `<div class="sheet-head"><p class="sheet-title">${shoot ? '촬영 시뮬레이션' : '카메라가 비추는 대상'}</p>${badge('시연', 'count-grad')}</div>
     <p class="sheet-hint">브라우저 시연에서는 카메라가 실제 사물을 볼 수 없어, 비추는 대상을 골라 인식 결과를 확인합니다.</p>
     <div class="sheet-list">${Object.entries(TARGETS)
       .map(
         ([k, [, label]]) =>
           `<button class="opt${k === cap.target ? ' sel' : ''}" data-sheet-act="target" data-k="${k}"><span class="lbl">${esc(label)}</span><span class="chev">${icon.chevronRight}</span></button>`,
       )
       .join('')}</div>`,
    {
      target: (t) => {
        closeSheet();
        const el = document.querySelector('.scr-vcam');
        if (!el || el.classList.contains('captured')) return;
        cap.target = t.dataset.k;
        syncControls(el);
        if (shoot) return shootAt(el);
        aim(el);
      },
    },
  );
}

/** 촬영 시뮬레이션: points the camera at the 시연 subject at once, then takes the photo. */
function shootAt(el) {
  const t = cap.target;
  const run = ++cam.run;
  if (!el.classList.contains('live')) {
    placeArt(el, t);
    setPose(el, t === 'none' ? 'away' : ART.includes(t) ? 'search' : 'aligned', t === 'none');
  }
  setPhase(el, detectable(cap.shoot, t) ? 'detected' : 'search');
  if (t === 'none' && !el.classList.contains('live')) return later(el, run, 1250, () => capture());
  capture();
}

window.addEventListener('resize', () => {
  const el = document.querySelector('.scr-vcam');
  if (!el || !cam.geo) return;
  cam.geo = camGeo(el);
  setPose(el, cam.pose);
  if (cam.art) placeArt(el, cam.art.kind, el.classList.contains('attach'));
  placeFocus(el);
});

register('vcam', {
  bg: 'dark',
  render: ({ mode, photo }) => {
    const attach = mode === 'attach';
    const msg = attach && !photo ? ATTACH_MSG.pick : SEARCH_MSG[cap.shoot];
    return `
    <div class="cam-preview">
      <video class="cam-video" playsinline muted></video>
      ${attach && photo === 'real' && cap.photo ? `<img class="cam-shot contain" src="${cap.photo}" alt="첨부한 사진">` : ''}
      ${attach && photoById(photo)?.doc ? `<div class="cam-doc" style="background:${docBg(photoById(photo))}"><span class="cam-doc-in">${docMarkup(photoById(photo).doc)}</span></div>` : ''}
      <div class="cam-sway">
        ${sceneMarkup()}
        <div class="cam-alt"></div>
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
      <h1 class="hdr-title">${attach ? '사진첨부' : isFill() ? '활력징후 사진 입력' : '사진 촬영'}</h1>
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
        <button class="btn ghost" data-act="purpose" hidden>용도 선택</button>
        ${attach ? '<button class="btn cta" data-act="album">다른 사진 선택</button>' : '<button class="btn cta" data-act="retake">다시 촬영</button>'}
      </div>
      ${
        attach
          ? `<button class="btn cta album-btn" data-act="album" data-long="album-demo"${photo ? ' hidden' : ''}>갤러리에서 선택</button>`
          : `<div class="cam-shoot-row">
               <button class="cam-demo" data-act="cam-target" aria-label="시연: 카메라가 비추는 대상"><small>시연</small><b>${TARGETS[cap.target][0]}</b>${icon.arrowDown}</button>
               <button class="shutter" data-act="shoot" data-long="shoot-sim" aria-label="촬영"><span></span></button>
               <span></span>
             </div>
             <p class="cam-tip">PDA 스캔 버튼으로도 촬영할 수 있습니다</p>`
      }
    </div>
    <div class="cam-flash"></div>`;
  },
  mount(el, params) {
    cam.geo = camGeo(el);
    cam.hug = false;
    setPose(el, 'search');
    cam.art = null;
    if (params.mode === 'attach') return mountAttach(el, params);
    // ?shot=vcam renders a still state; reaching the camera by navigation always runs live
    if (params.shot === 'vcam') return shotState(el, params);
    if (!isNative) return aim(el);
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
    'shoot-sim': () => openTargetSheet(true),
    'cam-target': () => openTargetSheet(),
    purpose: () => choosePurpose(document.querySelector('.scr-vcam')),
    // PDA: the device gallery · browser: the demo album (long press = demo album on the PDA, for the failure cases)
    album: () => (isNative ? pickFromGallery() : openAlbum()),
    'album-demo': () => openAlbum(),
    retake: () => retake(document.querySelector('.scr-vcam')),
    manual: () => {
      if (isFill()) return pop(); // 직접 입력: 활력징후 입력 칸으로
      state.vocr = newOcr(true);
      replace('vreview', {}, 'fade');
    },
  },
  onScan: (code, params) => (params.mode === 'attach' ? null : capture()),
  // ignore back while the photo is being analysed
  onBack: () => document.querySelector('.scr-vcam')?.dataset.phase === 'analyzing',
});

/**
 * Takes the photo. Where it goes depends on the 촬영 모드 and on what was detected in the guide, not on the button:
 * 환부 · 기타 모드 → that record · a detected subject → its record (monitor → vitals analysis) · nothing detected →
 * '무엇을 촬영하셨나요?'. An attached photo (`attachedShows`) is judged only by what it shows.
 * The patient comes first: the wristband is scanned after the photo unless the patient was chosen beforehand.
 */
function capture(attachedShows = null) {
  const el = document.querySelector('.scr-vcam');
  if (!el || el.classList.contains('captured') || el.classList.contains('starting')) return;
  const attached = !!attachedShows;
  const live = el.classList.contains('live');
  const shows = attached ? attachedShows : cap.target;
  const found = attached ? (detectable('auto', shows) ? shows : null) : el.dataset.phase === 'detected' ? cap.target : null;
  const kind = !attached && (cap.shoot === 'wound' || cap.shoot === 'other') ? cap.shoot : found ? KIND_OF[found] : null;
  cap.shows = shows;
  ++cam.run; // the view no longer changes
  el.classList.add('captured');
  el.classList.toggle('blurry', shows === 'blur');
  if (live) freezeFrame(el);
  // 활력징후 사진 입력: only a monitor is read (the patient is the 활력징후 screen's)
  if (isFill()) return analyse(el, shows === 'monitor' ? 'ok' : shows === 'blur' ? 'unreadable' : 'nomonitor', false);
  state.vphoto = {
    kind,
    attach: attached,
    shows,
    media: photoMedia(),
    art: cap.gal?.art || (ART.includes(shows) ? shows : null),
    photo: cap.photo,
  };
  const next = () => (kind ? route(el, kind) : choosePurpose(el));
  if (cap.pid) return next();
  // the photo is taken: whose record is it? → 환자 팔찌 스캔
  el.classList.add('asking');
  askPatient({
    desc: `${attached ? '첨부한' : '촬영한'} 사진을 저장할 환자의\n팔찌 바코드를 스캔하세요.`,
    onPatient: (pid) => {
      selectPatient(pid);
      cap.pid = pid;
      const chip = el.querySelector('.cam-patient');
      chip.textContent = patientChip(attached);
      chip.classList.remove('unknown');
      next();
    },
    onCancel: () => (attached ? replace('vcam', { mode: 'attach' }, 'fade') : retake(el)),
  });
}

/** The photo as the record screens show it. */
function photoMedia() {
  if (cap.photo) return `<img class="ocr-photo" src="${cap.photo}" alt="">`;
  if (cap.mode === 'attach' && cap.gal) return `<div class="ocr-gal">${photoThumb(cap.gal, 334)}</div>`;
  if (ART.includes(cap.shows)) return `<div class="art-box">${artSvg(cap.shows)}</div>`;
  if (cap.shows === 'none') return `<div class="ocr-gal">${photoThumb({ c: [350, 560], z: 470 }, 334)}</div>`;
  return `<div class="${cap.shows === 'blur' ? 'thumb-blur' : ''}">${thumbMarkup()}</div>`;
}

/** Nothing recognisable (or the 장비 모드 found no device): the nurse says what the photo is for. */
function choosePurpose(el) {
  if (!el?.isConnected) return;
  el.classList.remove('asking');
  el.classList.add('failed', 'unknown');
  setPhase(el, 'unknown');
  if (cap.mode === 'attach') {
    el.querySelector('.cam-hint').textContent = ATTACH_MSG.unknown[0];
    el.querySelector('.cam-sub').textContent = ATTACH_MSG.unknown[1];
  }
  el.querySelector('.cam-progress').hidden = true;
  // if the sheet is closed without a choice, these stay: 용도 선택 · 다시 촬영
  el.querySelector('.cam-retry').hidden = false;
  el.querySelector('.cam-retry [data-act="manual"]').hidden = true;
  el.querySelector('.cam-retry [data-act="purpose"]').hidden = false;
  const attach = cap.mode === 'attach';
  openPurposeSheet({
    hint: `${attach ? '첨부한 사진' : '촬영한 사진'}에서 알아볼 대상을 찾지 못했습니다. 어디에 기록할지 골라 주세요.`,
    retake: attach ? '다른 사진 선택' : '다시 촬영',
    onPick: (k) => {
      if (k === 'retake') return attach ? (isNative ? pickFromGallery() : openAlbum()) : retake(el);
      el.classList.remove('failed', 'unknown');
      el.querySelector('.cam-retry').hidden = true;
      state.vphoto.kind = k;
      route(el, k);
    },
  });
}

/** monitor → the vitals analysis · pump · wound · other → a short look at the photo, then the record screen. */
function route(el, kind) {
  if (!el.isConnected) return;
  el.classList.remove('asking');
  const attached = cap.mode === 'attach';
  if (kind === 'monitor') return analyse(el, cap.shows === 'monitor' ? 'ok' : cap.shows === 'blur' ? 'unreadable' : 'nomonitor', attached);
  const run = ++cam.run;
  setPhase(el, 'analyzing');
  const txt = startProgress(el, '1.3s');
  txt.textContent = attached ? '첨부한 이미지를 확인하고 있습니다' : '촬영한 이미지를 확인하고 있습니다';
  const reading = { pump: ['pump', '펌프 표시값을 읽고 있습니다'] }[kind];
  if (reading && reading[0] === cap.shows) later(el, run, 550, () => (txt.textContent = reading[1]));
  later(el, run, 1400, () => openRecord(kind));
}

const RECORD_SCREEN = { pump: 'vpump', wound: 'vwound', other: 'vother' };
function openRecord(kind) {
  state.vphoto.kind = kind;
  replace(RECORD_SCREEN[kind], {}, 'fade');
}

/** '다른 용도로 기록' on a record screen: the same photo (and patient) goes to another record. */
export function switchPurpose(kind) {
  state.vphoto.kind = kind;
  if (kind !== 'monitor') return replace(RECORD_SCREEN[kind], {}, 'fade');
  // only a readable monitor gives values; anything else is typed in
  state.vocr = newOcr(cap.shows !== 'monitor');
  replace('vreview', {}, 'fade');
}

function startProgress(el, dur) {
  const prog = el.querySelector('.cam-progress');
  prog.hidden = false;
  const bar = prog.querySelector('.bar i');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
  bar.style.animationDuration = dur;
  return prog.querySelector('.txt');
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
    if (isFill()) return fillFromPhoto();
    state.vocr = newOcr();
    replace('vreview', {}, 'fade');
  });
}

/** 활력징후 사진 입력: the read values fill their cells on the 활력징후 screen (unread ones keep what was typed). */
function fillFromPhoto() {
  const read = OCR_FIELDS.filter((f) => f.read);
  fillVital(Object.fromEntries(read.map((f) => [f.k, f.read])));
  pop();
  const low = read.filter((f) => f.conf < LOW_CONF).map((f) => f.k);
  const miss = OCR_FIELDS.filter((f) => !f.read).map((f) => f.k);
  flashVoiced(
    '.vt-cell',
    read.map((f) => f.k),
    `모니터에서 ${read.length}개 항목을 인식했습니다.${low.length ? ` ${low.join(', ')} 값을 확인해 주세요.` : ''}${miss.length ? ` (미인식 ${miss.join(', ')})` : ''}`,
  );
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
  el.querySelector('.cam-retry [data-act="manual"]').hidden = false;
  el.querySelector('.cam-retry [data-act="purpose"]').hidden = true;
  feedback('ok'); // 환자 모니터 감지
}

function retake(el) {
  if (!el) return;
  closeSheet();
  el.classList.remove('captured', 'failed', 'blurry', 'asking', 'unknown');
  el.querySelector('.mscreen .ocr-layer')?.remove();
  el.querySelector('.cam-retry').hidden = true;
  el.querySelector('.cam-progress').hidden = true;
  state.vphoto = null;
  if (!el.classList.contains('live')) return aim(el);
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
    setTimeout(() => el.isConnected && capture('monitor'), shot ? 0 : 300);
    return;
  }
  // a photo from the 사진 선택 gallery: shown full screen, framed like its thumbnail
  const ph = photoById(photo);
  cap.photo = null;
  cap.gal = ph;
  if (ph.doc) el.classList.add('docphoto');
  else if (ph.art) placeArt(el, ph.art, true);
  else setPhotoPose(el, ph);
  setPhase(el, 'search');
  el.querySelector('.cam-hint').textContent = '';
  el.querySelector('.cam-sub').textContent = '';
  setTimeout(() => el.isConnected && capture(TARGET_OF[ph.k]), shot ? 0 : 300);
}

/**
 * ?shot=vcam&phase=search|detected|nomonitor|unreadable|unknown[&target=monitor|blur|pump|wound|doc|none]
 * [&shoot=auto|device|wound|other] — a still state for screenshots.
 */
function shotState(el, { phase = 'detected', target, shoot }) {
  if (shoot && DETECTS[shoot]) cap.shoot = shoot;
  if (target && TARGETS[target]) cap.target = target;
  syncControls(el);
  placeArt(el, cap.target);
  if (phase === 'search') return setPhase(el, 'search');
  if (phase === 'unknown') {
    setPose(el, cap.target === 'none' ? 'away' : 'aligned');
    setPhase(el, 'search');
    return capture();
  }
  setPose(el, phase === 'nomonitor' ? 'away' : 'aligned');
  setPhase(el, phase === 'nomonitor' || !detectable(cap.shoot, cap.target) ? 'search' : 'detected');
  if (phase === 'nomonitor' || phase === 'unreadable') {
    el.classList.add('captured');
    el.classList.toggle('blurry', phase === 'unreadable');
    failed(el, phase);
  }
}

/* ---------------- 2. review & edit ---------------- */
// the photo can still go to another record (주입 펌프 · 환부 · 기타)
const otherUse = () => (state.vphoto ? `<button class="ph-other" data-act="other-use">다른 용도로 기록 ${icon.chevronRight}</button>` : '');

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
      ${prevLine(f.k).replace('vt-prev', 'vt-prev vf-prev')}
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
      ${header({ title: '활력징후', left: 'back', right: 'close' })}
      <div class="screen-body scroll ocr-review">
        ${patientLine()}
        ${o.manual ? `
        <h2 class="vr-title gtext">활력징후 직접 입력</h2>
        <p class="vr-desc">${attach ? '첨부한' : '촬영한'} 이미지에서 측정값을 인식하지 못했습니다.<br>환자 모니터를 보고 측정값을 직접 입력해 주세요.</p>
        ${otherUse()}` : `
        <h2 class="vr-title ask gtext">${attach ? '모니터 사진을 첨부하신 것 같습니다.' : '환자 모니터를 촬영하신 것 같습니다.'}<br>활력징후 데이터로 입력할까요?</h2>
        <section class="ocr-card">
          <div class="ocr-card-head"><span class="ocr-card-title gtext">${attach ? '첨부 이미지' : '촬영 이미지'}</span>
            <span class="badge count-grad">인식 ${OCR_FIELDS.filter((f) => f.read).length}/${OCR_FIELDS.length}</span></div>
          <div class="ocr-thumb">${
            cap.photo ? `<img class="ocr-photo" src="${cap.photo}" alt="">` : attach && cap.gal ? `<div class="ocr-gal">${photoThumb(cap.gal, 334, 'static')}</div>` : thumbMarkup()
          }</div>
        </section>
        ${otherUse()}`}
        <section class="ocr-card">
          <div class="ocr-card-head"><span class="ocr-card-l"><span class="ocr-card-title gtext">측정값</span>${voiceButton()}</span>
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
      // an empty field (미인식 · 직접 입력): tapping it fills the previous value, selected
      input.addEventListener('focus', () => {
        const k = input.dataset.k;
        const p = prevVital(k);
        if (!input.value && p) {
          const f = OCR_FIELDS.find((x) => x.k === k);
          state.vocr.values[k] = p.v;
          state.vocr.edited[k] = p.v !== readOf(f, state.vocr);
          input.value = p.v;
          input.className = `vf-in ${flagOf(k, p.v) || ''}`;
        }
        input.select();
        input.dataset.focused = '1';
      });
      // the click that focused the cell must not undo the selection on mouseup
      input.addEventListener('mouseup', (e) => {
        if (!input.dataset.focused) return;
        delete input.dataset.focused;
        e.preventDefault();
      });
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
    'other-use': () =>
      openPurposeSheet({ current: 'monitor', hint: '같은 사진을 다른 용도로 기록합니다.', onPick: (k) => k !== 'monitor' && switchPurpose(k) }),
    ack: (t) => {
      state.vocr.checked[t.dataset.k] = true;
      rerender();
    },
    // 음성 입력: a spoken value replaces the AI reading (수정됨 / 직접 입력); the same value confirms it (확인됨)
    vvoice: () =>
      openVoiceInput({
        prev: prevValues(),
        onApply: (vals) => {
          const o = state.vocr;
          for (const [k, v] of Object.entries(vals)) {
            const f = OCR_FIELDS.find((x) => x.k === k);
            if (!f) continue;
            o.values[k] = v;
            o.edited[k] = v !== readOf(f, o);
            if (!o.edited[k]) o.checked[k] = true;
          }
          rerender();
          flashVoiced('.vfield', Object.keys(vals));
        },
      }),
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
export function backToCamera(pick = false) {
  state.vphoto = null;
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
        recordVitals({
          time: MEASURED.time,
          who: NURSE.label,
          items: OCR_FIELDS.map((f) => ({
            k: f.k,
            v: o.values[f.k],
            unit: f.unit,
            at: `${MEASURED.date.slice(5).replace('-', '/')} ${MEASURED.time}`,
            flag: flagOf(f.k, o.values[f.k]),
          })),
        });
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
    ${header({ title: '활력징후' })}
    <div class="screen-body center-status">
      ${patientLine()}
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
