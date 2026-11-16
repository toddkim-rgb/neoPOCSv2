// PDA barcode/RFID input. Point Mobile (and most Android PDAs) can output scans as keyboard events
// ("Keyboard wedge"): characters arrive very quickly followed by Enter. A burst like that, typed
// while no text field is focused, is treated as one scan. Native broadcast intents can be
// forwarded the same way by dispatching a `pdascan` CustomEvent with the code in `detail`.

const MAX_GAP_MS = 60; // humans type slower than this; scanners are faster
const MIN_LEN = 3;

export function attachScanner(onScan) {
  let buf = '';
  let last = 0;

  window.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    const now = performance.now();
    if (now - last > MAX_GAP_MS * 4) buf = '';
    last = now;
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (buf.length >= MIN_LEN) {
        e.preventDefault();
        onScan(buf);
      }
      buf = '';
      return;
    }
    if (e.key.length === 1) buf += e.key;
  });

  window.addEventListener('pdascan', (e) => onScan(String(e.detail ?? '')));
}
