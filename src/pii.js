// 개인정보 자동 가림: patient names · 등록번호 and staff names · 사번 are masked after N seconds without a touch or a scan
// (사용자설정 '개인정보 자동 가림', 기본 10초 · 끄기). Touching the screen shows them again and restarts the count.
//   names: middle hidden (김철수 → 김*수, 남궁민수 → 남**수, 김수 → 김*) · numbers: last 4 hidden (21212457 → 2121****)
// Every screen, sheet, popup and toast is covered: a MutationObserver wraps those words as
// <span class="pii" data-m="김*수"><span class="pii-r">김철수</span></span>; html.pii-masked hides the original and shows
// data-m in its place (::after), so the text content itself never changes.
// The 고위험 1차·2차 인증 screens (scr-ham) are never masked: the nurses compare 성명 · 등록번호 · 담당자 there.
import { PATIENTS } from './patients.js';
import { NURSE, NURSE2 } from './data.js';
import { state } from './state.js';

export const maskName = (n) => (n.length <= 1 ? n : n.length === 2 ? `${n[0]}*` : `${n[0]}${'*'.repeat(n.length - 2)}${n.at(-1)}`);
export const maskNo = (s) => (s.length <= 4 ? '*'.repeat(s.length) : `${s.slice(0, -4)}****`);

const MASKED = new Map([
  ...PATIENTS.flatMap((p) => [
    [p.name, maskName(p.name)],
    [p.id, maskNo(p.id)],
    [p.barcode, maskNo(p.barcode)],
  ]),
  ...[NURSE, NURSE2].flatMap((n) => [
    [n.name, maskName(n.name)],
    [n.no, maskNo(n.no)],
  ]),
]);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// longest first: P21212457 before 21212457
const TOKENS = new RegExp([...MASKED.keys()].sort((a, b) => b.length - a.length).map(escRe).join('|'), 'g');
const SKIP = '.pii, .scr-ham, [contenteditable], script, style, textarea';

function wrapText(node) {
  const text = node.data;
  TOKENS.lastIndex = 0;
  if (!TOKENS.test(text)) return;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const frag = document.createDocumentFragment();
  let last = 0;
  TOKENS.lastIndex = 0;
  for (const m of text.matchAll(TOKENS)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const s = document.createElement('span');
    s.className = 'pii';
    s.dataset.m = MASKED.get(m[0]);
    const r = document.createElement('span');
    r.className = 'pii-r';
    r.textContent = m[0];
    s.append(r);
    frag.append(s);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  node.replaceWith(frag);
}

function wrapTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return wrapText(root);
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest?.(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(wrapText);
}

/* ---------------- idle timer ---------------- */
const html = document.documentElement;
let timer = null;
let enabled = true;

/** Seconds without a touch before masking (0 = off). */
const seconds = () => state.settings.piiSec ?? 10;

export function wake() {
  html.classList.remove('pii-masked');
  clearTimeout(timer);
  if (enabled && seconds() > 0) timer = setTimeout(() => html.classList.add('pii-masked'), seconds() * 1000);
}

/**
 * Starts masking for the app. `still`: screenshot mode (?shot) — no timer; `masked` shows the masked state at once.
 */
export function startPii({ still = false, masked = false } = {}) {
  const stage = document.getElementById('stage');
  wrapTree(stage);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') wrapText(m.target);
      else m.addedNodes.forEach(wrapTree);
    }
  }).observe(stage, { childList: true, subtree: true, characterData: true });
  if (still) {
    enabled = false;
    html.classList.toggle('pii-masked', masked);
    return;
  }
  // a touch or a scan (the PDA scanner types keys) means the nurse is using the PDA
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { capture: true, passive: true }));
  wake();
}
