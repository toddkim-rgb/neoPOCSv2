// AI 음성간호메모: record (common-voice-01) → review/edit/save (common-voice-02) → done (common-voice-03).
// The review card keeps the AI 요약 and the 시간별 대화 스크립트 together; both are editable, and editing the
// script enables "대화내용 다시 요약하기". Saving adds the memo to the 음성간호메모 list (memos.js).
// 음성메모 from the AI 커맨드바 (+) starts without a patient (`free`): record → review → 저장 시 환자 팔찌 스캔 → done.
// The 녹음 input's + opens the same menu as the AI 커맨드바 (음성메모 · 사진 촬영 · 스캔 · 사진첨부); leaving drops the recording.
import { register, go, replace, pop, rerender } from '../router.js';
import { header, button, statusBlock, esc, toast, openDialog, closeSheet, patientLine } from '../ui.js';
import { icon, sparkles } from '../icons.js';
import { patientTitle, PATIENT, NURSE, DEMO_DATE } from '../data.js';

// what the simulated recording plays back and the AI summarises: the selected patient's conversation, or for a
// memo started without a patient the recording kept in state.voice.recorded (its speaker is just '환자')
const source = (free) => (free && state.voice.recorded) || PATIENT.ai;
const talk = (free) => source(free).transcript;
const aiSummary = (free) => source(free).summary;
const UNKNOWN = '환자';

/** AI 커맨드바 + → 음성메모: records first; the patient is asked for (wristband) on 저장, after review. */
export function startFreeMemo() {
  const p = patientById(DEFAULT_PID);
  state.voice = {
    notes: [],
    draft: '',
    origin: 'hub',
    recorded: { summary: p.ai.summary, transcript: p.ai.transcript.map((l) => (l.nurse ? l : { ...l, who: UNKNOWN })) },
  };
  go('voice', { step: 'record', free: 1 });
}
import { state, selectPatient } from '../state.js';
import { patientById, DEFAULT_PID } from '../patients.js';
import { askPatient } from '../patientscan.js';
import { aiChips, setAiMore, aiBack } from '../aibar.js';
import { openPhotoSheet } from './vitals.js';

let revealTimer = null;

const wave = () => `
  <div class="wave" aria-label="녹음 중">${[10, 18, 12, 28, 16, 22, 10, 20, 14, 8]
    .map((h, i) => `<i style="--h:${h}px; --d:${(i % 5) * 0.12}s"></i>`)
    .join('')}</div>`;

/** opts.editable: each line can be corrected in place (review screen). */
export function scriptBubbles(lines, { editable = false } = {}) {
  const ed = (i) => (editable ? ` contenteditable="true" spellcheck="false" data-line="${i}"` : '');
  return lines
    .map((l, i) =>
      l.nurse
        ? `<div class="chat-line me"><p class="chat-who">${esc(l.who)} <span>${l.time}</span></p><p class="bubble"${ed(i)}>${esc(l.text)}</p></div>`
        : `<div class="chat-line"><p class="chat-who">${esc(l.who)} <span>${l.time}</span></p><p class="plain"${ed(i)}>${esc(l.text)}</p></div>`,
    )
    .join('');
}

/** Review copy of the AI result: what the nurse edits before saving.
 * A 음성메모 (`free`) reaches review before its patient is known (the wristband is scanned on 저장),
 * so the speaker stays "환자" here and is only resolved to a name once that scan happens (see `save`). */
function review(free) {
  const v = state.voice;
  if (!v.sum) {
    v.sum = aiSummary(free).map((x) => ({ ...x }));
    v.script = talk(free).map((x) => ({ ...x, who: !free && x.who === UNKNOWN ? PATIENT.name : x.who }));
    v.scriptEdited = false;
  }
  return v;
}

const MEMO_TYPE = {
  task: ['perform', '투약하기', '#44a0d6'],
  bld: ['perform', '채혈하기', '#44a0d6'],
  trf: ['perform', '수혈하기', '#44a0d6'],
  vital: ['perform', '활력징후', '#79c97d'],
  detail: ['round', '병상 라운딩', '#99a4b4'],
  hub: ['round', '병상 라운딩', '#99a4b4'],
};

export function summaryBox() {
  return `<div class="ai-sum">${aiSummary().map((s) => `<p class="ai-sum-t">${s.title}</p><p class="ai-sum-d">${esc(s.desc)}</p>`).join('')}</div>`;
}

register('voice', {
  bg: 'screen',
  render: ({ step, shown, free }) => {
    if (step === 'done') {
      return `
        ${header({ title: '음성간호메모' })}
        <div class="screen-body center-status">
          ${patientLine()}
          <span class="spacer" style="flex-grow: 186"></span>
          ${statusBlock({ img: 'check-blue', title: 'AI 음성간호메모 완료', desc: '음성간호메모가 EMR에 정상적으로 저장되었습니다.\n환자상세정보에서 조회가 가능합니다.' })}
          <span class="spacer" style="flex-grow: 241"></span>
        </div>
        ${
          free
            ? `<div class="screen-foot two-btns"><button class="btn line" data-act="to-memos">음성간호메모 목록</button>${button('확인', 'finish')}</div>`
            : `<div class="screen-foot">${button('확인', 'finish')}</div>`
        }`;
    }
    if (step === 'review') {
      const open = state.scriptOpen.review;
      const v = review(free);
      const sum = v.sum
        .map(
          (x, i) =>
            `<p class="ai-sum-t" contenteditable="true" spellcheck="false" data-sum="${i}" data-f="title">${esc(x.title)}</p><p class="ai-sum-d" contenteditable="true" spellcheck="false" data-sum="${i}" data-f="desc">${esc(x.desc)}</p>`,
        )
        .join('');
      return `
        ${header({ title: '음성간호메모', right: 'close' })}
        <div class="screen-body scroll voice-review">
          ${free ? '' : patientLine()}
          <h2 class="vr-title gtext">음성간호메모</h2>
          <p class="vr-desc">대화 요약 내용을 확인하고 수정합니다.<br>음성간호메모는 환자 상세에서 확인 가능합니다.</p>
          <div class="ai-card vr-card">
            <div class="ai-card-head"><span class="ai-label"><span class="ai-spark">${sparkles('vr-spark', '#B07CFF', '#5B2BC7')}</span>AI 음성간호메모 요약</span><span class="ai-who">${NURSE.label}</span></div>
            <div class="ai-sum vr-sum${v.sumActive ? ' active' : ''}">${sum}</div>
            <div class="vr-script${open ? ' open' : ''}">
              <button class="script-toggle" data-act="toggle-script" aria-expanded="${open}"><span>시간별 대화 스크립트 (${v.script.length}턴)</span><span class="chev">${open ? icon.arrowUp : icon.arrowDown}</span></button>
              ${
                open
                  ? `<div class="chat vr-chat">${scriptBubbles(v.script, { editable: true })}</div>
                     <button class="resum" data-act="resummarize"${v.scriptEdited ? '' : ' disabled'}>대화내용 다시 요약하기 ${icon.refresh}</button>`
                  : ''
              }
            </div>
          </div>
          <div class="sticky-foot">${button('저장', 'save')}</div>
        </div>`;
    }
    const lines = talk(free).slice(0, shown ?? talk(free).length);
    const notes = state.voice.notes;
    return `
      ${header({ title: free ? '음성메모' : '음성간호메모', right: 'close' })}
      <div class="screen-body scroll voice-rec">
        ${free ? '' : patientLine()}
        <div class="transcript">
          ${lines.map((l) => `<div class="tl"><p class="tl-who">${esc(l.who)} ${l.time}</p><p class="tl-text">${esc(l.text)}</p></div>`).join('')}
          ${notes.map((n) => `<div class="tl note"><p class="tl-who">${esc(NURSE.label)} · 수기 기록</p><p class="tl-text">${esc(n)}</p></div>`).join('')}
        </div>
      </div>
      <div class="voice-foot">
        ${aiChips()}
        ${wave()}
        <form class="vinput${state.voice.draft ? ' typing' : ''}" data-form="note" onsubmit="return false">
          <button type="button" class="vplus${state.aiMore ? ' on' : ''}" data-act="ai-more" aria-label="AI 메뉴">${icon.add}</button>
          <input id="note" type="text" placeholder="간호기록 작성하기" value="${esc(state.voice.draft)}" enterkeyhint="send" autocomplete="off">
          <button type="button" class="vsend" data-act="${state.voice.draft ? 'send-note' : 'finish-record'}" aria-label="${state.voice.draft ? '전송' : '녹음 완료'}">${state.voice.draft ? icon.send : icon.check}</button>
        </form>
      </div>`;
  },
  mount(el, params, isRerender) {
    if (params.step === 'review') {
      const v = review(params.free);
      // summary edits are kept as typed; script edits also unlock "대화내용 다시 요약하기"
      el.querySelectorAll('[data-sum]').forEach((n) =>
        n.addEventListener('input', () => {
          v.sum[+n.dataset.sum][n.dataset.f] = n.textContent;
          v.sumActive = true;
          el.querySelector('.vr-sum').classList.add('active');
        }),
      );
      el.querySelectorAll('[data-line]').forEach((n) =>
        n.addEventListener('input', () => {
          v.script[+n.dataset.line].text = n.textContent;
          v.scriptEdited = true;
          el.querySelector('.resum').disabled = false;
        }),
      );
    }
    if (params.step === 'record') {
      // a new recording starts with an empty note field and the + menu closed
      if (!isRerender && params.shown === undefined && !params.free) Object.assign(state.voice, { notes: [], draft: '' });
      if (!isRerender) setAiMore(false);
      const input = el.querySelector('#note');
      input.addEventListener('focus', () => setAiMore(false));
      input.addEventListener('input', () => {
        const had = !!state.voice.draft;
        state.voice.draft = input.value;
        if (had !== !!input.value) {
          const form = el.querySelector('.vinput');
          const btn = el.querySelector('.vsend');
          form.classList.toggle('typing', !!input.value);
          btn.dataset.act = input.value ? 'send-note' : 'finish-record';
          btn.innerHTML = input.value ? icon.send : icon.check;
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') el.querySelector('.vsend').click();
      });
      // simulate live transcription: reveal the conversation line by line
      if (!isRerender && params.shown === undefined && !document.documentElement.classList.contains('shot')) {
        params.shown = 0;
        rerender();
      }
      clearTimeout(revealTimer);
      if (params.shown !== undefined && params.shown < talk(params.free).length) {
        revealTimer = setTimeout(() => {
          if (!document.querySelector('.scr-voice .voice-rec')) return;
          params.shown += 1;
          rerender();
          const sc = document.querySelector('.voice-rec');
          if (sc) sc.scrollTop = sc.scrollHeight;
        }, params.shown === 0 ? 500 : 1300);
      }
    }
  },
  actions: {
    'hdr-close': () => {
      clearTimeout(revealTimer);
      pop();
    },
    'send-note': () => {
      const v = state.voice.draft.trim();
      if (!v) return;
      state.voice.notes.push(v);
      state.voice.draft = '';
      rerender();
      const sc = document.querySelector('.voice-rec');
      if (sc) sc.scrollTop = sc.scrollHeight;
    },
    'finish-record': (t, { free }) => {
      clearTimeout(revealTimer);
      toReview(free);
    },
    resummarize: (t, { free }) => {
      const v = review(free);
      t.disabled = true;
      t.classList.add('busy');
      t.innerHTML = `요약하고 있습니다 ${icon.refresh}`;
      setTimeout(() => {
        if (!t.isConnected) return;
        v.scriptEdited = false;
        v.sumActive = true;
        rerender();
        document.querySelector('.vr-sum')?.classList.add('flash');
        toast('수정한 대화 내용으로 다시 요약했습니다.');
      }, 1200);
    },
    'toggle-script': () => {
      state.scriptOpen.review = !state.scriptOpen.review;
      rerender();
    },
    save: (t, { free }) => {
      const v = review(free);
      if (free) {
        // a 음성메모 only learns whose record it is here, on 저장 (환자 팔찌 스캔)
        askPatient({
          desc: '음성메모를 저장할 환자의\n팔찌 바코드를 스캔하세요.',
          onPatient: (pid) => {
            selectPatient(pid);
            v.script = v.script.map((x) => (x.who === UNKNOWN ? { ...x, who: PATIENT.name } : x));
            commitSave(v, free);
          },
        });
        return;
      }
      commitSave(v, free);
    },
    finish: () => pop(),
    // + menu (same as the AI 커맨드바): the recording is not kept, so ask first
    'ai-more': () => setAiMore(!state.aiMore),
    'ai-voice-memo': () => leaveRecording(startFreeMemo),
    'ai-photo': () => leaveRecording(openPhotoSheet),
    'ai-scan': () => leaveRecording(() => go('qscan')),
    // 음성메모 (AI 커맨드바) → 음성간호메모 메인 목록
    'to-memos': () => replace('vmain', {}, 'fade'),
  },
  onBack: () => {
    if (aiBack()) return true; // first closes the + menu
    clearTimeout(revealTimer);
    return false;
  },
});

/** + menu while recording: the memo is not saved, so confirm, close the recording, then open the chosen screen. */
function leaveRecording(next) {
  setAiMore(false);
  openDialog(
    {
      title: '음성메모 녹음 중',
      desc: '녹음 중인 메모는 저장되지 않습니다.\n다른 화면으로 이동할까요?',
      buttons: [{ label: '취소', act: 'cancel', line: true }, { label: '이동', act: 'ok' }],
    },
    {
      cancel: () => closeSheet(),
      ok: () => {
        closeSheet();
        clearTimeout(revealTimer);
        pop();
        next();
      },
    },
  );
}

/** The nurse has just reviewed it, so it is saved as 확인완료 (`fresh`: also listed first on 환자상세). */
function commitSave(v, free) {
  const [kind, type, color] = MEMO_TYPE[state.voice.origin] || MEMO_TYPE.task;
  const d = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  state.memos.unshift({
    id: `m${Date.now()}`, kind, type, color, at: `${DEMO_DATE.replace(/-/g, '.')} ${hm}`, reviewed: true, fresh: true,
    items: v.sum.map((x) => ({ ...x })), script: v.script.map((x) => ({ ...x })),
  });
  state.memoTab = kind;
  replace('voice', { step: 'done', ...(free ? { free: 1 } : {}) }, 'fade');
}

function toReview(free = false) {
  Object.assign(state.voice, { sum: null, script: null, scriptEdited: false, sumActive: false });
  state.scriptOpen.review = false;
  replace('voice', { step: 'review', ...(free ? { free: 1 } : {}) }, 'fade');
}
