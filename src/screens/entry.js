// Splash (neo-splash-load-01), ID login (neo-auth-input-01), biometric login (neo-auth-bio-01)
import { register, go, replace, reset, rerender } from '../router.js';
import { button } from '../ui.js';
import { icon, sparkles } from '../icons.js';
import { state, resetDemo } from '../state.js';

const logo = () => `
  <div class="logo">
    <span class="logo-spark">${sparkles('lg-spark', '#65BDE9', '#1878BC')}</span>
    <p class="logo-neo">neo</p>
    <p class="logo-pocs">POCS</p>
    <p class="logo-sub">Point of care solution <b>V2</b></p>
  </div>
  <p class="softbowl">SOFTBOWL</p>`;

const enterHub = () => {
  state.loginError = false;
  state.hubTab = 'urgent';
  state.aiMore = false;
  resetDemo();
  reset('hub');
};

register('splash', {
  bg: 'splash',
  render: () => `
    <div class="screen-body entry">
      ${logo()}
      <p class="entry-msg"><span class="gtext">RFID 및 바코드</span> 스캔으로<br>사용자 로그인을 진행하세요.</p>
    </div>
    <div class="screen-foot entry-foot two">
      ${button('아이디로 로그인', 'login-id')}
      ${button('생체인식으로 로그인', 'login-bio')}
    </div>`,
  actions: {
    'login-id': () => go('login-id'),
    'login-bio': () => go('login-bio'),
  },
  // RFID badge / employee barcode logs straight in
  onScan: enterHub,
});

register('login-id', {
  bg: 'splash',
  render: () => `
    <div class="screen-body entry">
      ${logo()}
      <form class="login-form" autocomplete="off" onsubmit="return false">
        <label class="field"><input id="emp" type="text" inputmode="text" placeholder="사번을 입력하세요" enterkeyhint="next"><button type="button" class="clear" data-act="clear" data-for="emp" aria-label="지우기">${icon.cancel}</button></label>
        <label class="field"><input id="pw" type="password" placeholder="비밀번호를 입력하세요" enterkeyhint="go"><button type="button" class="clear" data-act="clear" data-for="pw" aria-label="지우기">${icon.cancel}</button></label>
        <p class="login-error${state.loginError ? ' show' : ''}">아이디와 비밀번호가 일치하지 않습니다.</p>
      </form>
    </div>
    <div class="screen-foot entry-foot">
      ${button('로그인', 'login')}
      <button class="entry-link" data-act="to-bio">생체인식으로 로그인</button>
    </div>`,
  mount(el) {
    el.querySelector('#emp').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el.querySelector('#pw').focus();
    });
    el.querySelector('#pw').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.querySelector('[data-act="login"]').click();
    });
  },
  actions: {
    clear: (t) => {
      const input = document.getElementById(t.dataset.for);
      input.value = '';
      input.focus();
    },
    login: () => {
      const emp = document.getElementById('emp').value.trim();
      const pw = document.getElementById('pw').value;
      // Prototype rule: any employee number with a password logs in; empty fields show the design's error.
      if (!emp || !pw) {
        state.loginError = true;
        const keep = { emp, pw };
        rerender();
        document.getElementById('emp').value = keep.emp;
        document.getElementById('pw').value = keep.pw;
        return;
      }
      document.activeElement?.blur();
      enterHub();
    },
    'to-bio': () => replace('login-bio', {}, 'fade'),
  },
  onScan: enterHub,
});

register('login-bio', {
  bg: 'splash',
  render: () => `
    <div class="screen-body entry">
      ${logo()}
    </div>
    <div class="screen-foot entry-foot">
      ${button('로그인', 'login')}
      <button class="entry-link" data-act="to-id">아이디로 로그인</button>
    </div>`,
  actions: {
    login: enterHub,
    'to-id': () => replace('login-id', {}, 'fade'),
  },
  onScan: enterHub,
});

