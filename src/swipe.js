// 투약 리스트 스와이프 (요청, not in the Figma file): pushing a `.mswipe` card to the left shows '삭제' · '취소'
// behind it. A long-press on the card opens it too (장갑을 끼면 스와이프가 어려워서). Only one row is open at a time;
// a touch anywhere else, or a tap on the open card, closes it. Rows marked `.fixed` do not move.
const OPEN_W = 128; // design px: two 64px buttons
const LONG_MS = 550;

let stage = null;
let g = null; // the current gesture
let swallow = false; // the click that ends a swipe / long-press must not also tap the card

const ratio = () => stage.getBoundingClientRect().width / stage.offsetWidth || 1;

export function closeSwipes(except = null) {
  document.querySelectorAll('.mswipe.open').forEach((x) => x !== except && x.classList.remove('open'));
}

function openSwipe(sw) {
  closeSwipes(sw);
  sw.classList.add('open');
}

function cancelLong() {
  if (g) clearTimeout(g.timer);
}

function down(e) {
  swallow = false;
  if (e.button !== 0) return;
  const sw = e.target.closest('.mswipe');
  closeSwipes(sw); // a touch anywhere else closes the open row
  if (!sw || sw.classList.contains('fixed') || e.target.closest('.mswipe-acts')) return;
  const card = sw.querySelector('.med-card');
  const open = sw.classList.contains('open');
  g = { sw, card, id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), base: open ? -OPEN_W : 0, dx: open ? -OPEN_W : 0, axis: null, long: false };
  // long-press: open the row in place
  g.timer = setTimeout(() => {
    if (!g || g.axis) return;
    g.long = true;
    navigator.vibrate?.(20);
    openSwipe(sw);
  }, LONG_MS);
}

function move(e) {
  if (!g || e.pointerId !== g.id) return;
  const r = ratio();
  const mx = (e.clientX - g.x) / r;
  const my = (e.clientY - g.y) / r;
  if (!g.axis) {
    if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
    cancelLong();
    g.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    if (g.axis === 'x') {
      g.card.setPointerCapture?.(e.pointerId);
      g.sw.classList.add('dragging');
    }
  }
  if (g.axis !== 'x') return;
  let x = g.base + mx;
  if (x > 0) x *= 0.25; // rubber-band past both ends
  else if (x < -OPEN_W) x = -OPEN_W + (x + OPEN_W) * 0.3;
  g.dx = x;
  g.card.style.transform = `translateX(${x}px)`;
}

function up() {
  if (!g) return;
  cancelLong();
  const { sw, card, axis, base, long } = g;
  if (axis === 'x') {
    sw.classList.remove('dragging');
    card.style.transform = '';
    const v = (g.dx - base) / Math.max(1, performance.now() - g.t); // design px per ms
    let open = g.dx < -OPEN_W / 2;
    if (v < -0.4) open = true;
    else if (v > 0.4) open = false;
    if (open) openSwipe(sw);
    else sw.classList.remove('open');
    swallow = true;
  } else if (long) {
    swallow = true;
  } else if (!axis && base) {
    // a tap on the open card closes it
    sw.classList.remove('open');
    swallow = true;
  }
  g = null;
}

function cancel() {
  if (!g) return;
  cancelLong();
  g.sw.classList.remove('dragging');
  g.card.style.transform = '';
  g = null;
}

export function initSwipe() {
  stage = document.getElementById('stage');
  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', cancel);
  stage.addEventListener(
    'click',
    (e) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}
