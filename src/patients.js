// 샘플 환자 6명 — 프로필 + 환자별 업무 (투약 · 채혈 · 수혈 · 활력징후) + 임상관찰기록 + 음성간호메모.
// 김철수 keeps the design data from data.js; the other five are fictional cases built around their 진단.
// Barcodes are unique per patient: 팔찌 P+등록번호 · 처방 D?001… · 채혈관 B?001… · 혈액 T?001… (? = patient no.)
import {
  PATIENT, NURSE, NURSE2, createOrders, createBloodDraws, createTransfusions, createMemos, VITALS, TRANSCRIPT, AI_SUMMARY,
} from './data.js';

const N1 = NURSE.label;
const N2 = NURSE2.label;
const DATE = '041 / 2026-09-17 17:00';
const ISSUED = '2026-09-17 17:00';
const UNITS = { SBP: 'mmHg', DBP: 'mmHg', PR: '회/min', RR: '회/min', BT: '°C', SpO2: '%' };
const LABEL = {
  routine: '일반처방', bundle: '묶음처방', discharge: '퇴원약처방', procedure: '처치시처방',
};

/** 투약 오더: `given` = slots already administered today, `prn` = 필요시 (실시간) 처방. */
function med(id, { bar = 'routine', group = id, name, code, count = null, given = [], tags = [{ t: '기타' }], ham = false, prn = false }) {
  const o = {
    id, group, bar, type: LABEL[bar], tags, count, name, date: DATE, code,
    hist: given.map(([time, who = N1, st = 'Y']) => ({ time, st, who })),
    now: prn ? { time: '실시간', st: 'Y', who: N1 } : count && count[0] >= count[1] ? null : { time: '17:00', st: 'Y', who: N1 },
  };
  if (ham) o.ham = true;
  if (prn) o.prn = true;
  return o;
}
const tube = (id, name, specimen, detail, code) => ({ id, name, specimen, detail, issuer: '041', issued: ISSUED, now: { time: '17:24', who: N1 }, code });
// 수혈 혈액: one bag per unit — Red Cell 300ml over 2 hours
// comp: 혈액 제제 종류 (RBC · WBC · FFP · PLT) · abo + rh: 혈액형 (A, +) — shown on each 혈액팩 card
const product = (id, name, units, abo, code, comp = 'RBC') => ({
  id, name, comp, units, abo: abo.replace(/[+-]$/, ''), rh: abo.endsWith('-') ? '-' : '+', volume: 300, minutes: 120, issuer: '041', issued: ISSUED, now: { time: '17:24', st: 'Y', who: N1 }, code, focus: true,
});
const vitals = (time, who, v, flags = {}) => ({
  time, who,
  items: Object.entries(v).map(([k, val]) => ({ k, v: String(val), unit: UNITS[k], at: `09/17 ${time}`, ...(flags[k] ? { flag: flags[k] } : {}) })),
});
const talk = (lines) => lines.map(([nurse, who, time, text]) => (nurse ? { who: N1, time, nurse: true, text } : { who, time, text }));
const memo = (id, kind, type, color, at, reviewed, items, script) => ({ id, kind, type, color, at, reviewed, items, script });
const C = { med: '#44a0d6', bld: '#44a0d6', trf: '#44a0d6', vital: '#79c97d', round: '#99a4b4' };

export const PATIENTS = [
  {
    ...structuredClone(PATIENT), sex: 'm',
    my: { chip: '투약완료', tone: 'blue', task: 0 },
    orders: createOrders, blood: createBloodDraws, trf: createTransfusions,
    vitals: { time: '15:30', who: N1, items: VITALS },
    memos: createMemos,
    // 사진 기록: the wound photographed two days ago (the 환부 record screen compares a new photo with it)
    photos: () => [
      {
        id: 'ph0', kind: 'wound', at: '09/15 10:20', who: N1, art: 'wound-prev',
        title: '천골·엉덩이 · 욕창 2단계', detail: '3.8 × 2.6 cm · 장액성 삼출물 소량',
        site: '천골·엉덩이', type: '욕창', stage: '2단계', w: '3.8', h: '2.6',
      },
    ],
    // 환자상세 AI 음성간호메모 (design: two entries, 총 4건) — also what a new recording plays back
    ai: { at: '26/09/14 17:00', count: 4, repeat: 2, summary: AI_SUMMARY, transcript: TRANSCRIPT },
  },
  {
    name: '강태우', id: '20733345', detail: 'M/50/O+', bed: '033-05-01', sex: 'm',
    dx: '2형 당뇨병성 케톤산증(DKA)', body: '178.0cm / 82.4kg', surgery: '-', dept: 'EN(내분비내과)', doctor: '이정민 교수',
    admitted: '2026-09-14', allergies: ['Cefaclor'], infections: [], barcode: 'P20733345',
    my: { chip: '투약완료', tone: 'blue', task: 0 },
    orders: () => [
      med('o1', { name: '인슐린리스프로퀵펜주 300IU/3ml/pen', code: 'D2001', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
      med('o2', { bar: 'bundle', group: 'g2', name: '0.9% 염화나트륨주사액 1000ml', code: 'D2002', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
      med('o3', { bar: 'bundle', group: 'g2', name: '염화칼륨주사액 40mEq/20ml', code: 'D2003', count: [2, 3], given: [['09:00'], ['13:00', N2]], ham: true }),
      med('o4', { bar: 'procedure', name: '50% 포도당주사액 20ml', code: 'D2004', prn: true }),
    ],
    blood: () => [tube('b1', 'Glu, Electrolyte, BUN/Cr', '1711150000012', 'SST 5ml', 'B2001')],
    trf: () => [],
    vitals: vitals('13:00', N2, { SBP: 132, DBP: 84, PR: 96, RR: 18, BT: 36.8, SpO2: 98 }),
    memos: () => [],
    ai: {
      at: '26/09/17 16:42', count: 1,
      summary: [
        { title: '저혈당 증상 없음', desc: '식은땀·손떨림 없음, 점심 식사 2/3 섭취함' },
        { title: '인슐린 자가주사 교육 시행', desc: '주사 부위 순환 및 투여 시간 교육, 저녁 투약 시 직접 시행 예정' },
      ],
      transcript: talk([
        [1, '', '16:40', '강태우님, 점심 드시고 나서 식은땀이 나거나 손이 떨리지는 않으셨어요?'],
        [0, '강태우', '16:41', '아니요, 괜찮았어요. 점심은 3분의 2 정도 먹었습니다.'],
        [1, '', '16:41', '좋습니다. 저녁부터는 인슐린 펜을 직접 놓아 보실 거예요. 배꼽 주변은 피해서 돌아가며 맞으시면 됩니다.'],
        [0, '강태우', '16:42', '네, 한번 해볼게요. 옆에서 봐 주세요.'],
      ]),
    },
  },
  {
    name: '문가은', id: '21033456', detail: 'F/53/O+', bed: '012-07-02', sex: 'f',
    dx: '갑상선암(Thyroid cancer)', body: '158.2cm / 54.6kg', surgery: '갑상선 전절제술 후 1일차 (POD#1)', dept: 'GS(외과)', doctor: '최유진 교수',
    admitted: '2026-08-31', allergies: ['Codeine'], infections: [], barcode: 'P21033456',
    my: { chip: '채혈완료', tone: 'orange', task: 1 },
    orders: () => [
      med('o1', { name: '글루콘산칼슘주사액 10% 10ml', code: 'D3001', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
      med('o2', { name: '레보티록신나트륨정 0.1mg', code: 'D3002', count: [1, 1], given: [['09:00']] }),
      med('o3', { name: '아세트아미노펜주 1g/100ml', code: 'D3003', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
      med('o4', { bar: 'procedure', name: '메토클로프라미드주 10mg/2ml', code: 'D3004', prn: true }),
    ],
    blood: () => [
      tube('b1', 'Ca, Mg, P', '1711150000021', 'SST 5ml', 'B3001'),
      tube('b2', 'iPTH', '1711150000022', 'EDTA 3ml', 'B3002'),
    ],
    trf: () => [],
    vitals: vitals('13:00', N2, { SBP: 118, DBP: 72, PR: 78, RR: 16, BT: 36.9, SpO2: 99 }),
    memos: () => [
      memo('m1', 'perform', '채혈하기', C.bld, '2026.09.02 10:30', false,
        [{ title: '입 주변·손끝 저림 호소', desc: '저칼슘혈증 의심 증상으로 담당의 보고, Ca 추가 채혈 시행함' }],
        talk([
          [1, '', '10:28', '문가은님, 채혈 전에 불편한 곳 있으세요?'],
          [0, '문가은', '10:29', '아침부터 입 주변이랑 손끝이 좀 저려요.'],
          [1, '', '10:30', '수술 후에 칼슘이 떨어지면 그럴 수 있어요. 담당 선생님께 바로 알리고 칼슘 수치도 같이 확인할게요.'],
        ])),
    ],
    ai: {
      at: '26/09/17 16:52', count: 1,
      summary: [
        { title: '저칼슘혈증 증상 재확인', desc: '입 주변 저림은 감소, 손끝 저림은 약하게 남아 있음' },
        { title: '칼슘 정맥주사 부위 관찰', desc: '주입 부위 통증·발적 없음, Ca 결과 확인 후 담당의 보고 예정' },
      ],
      transcript: talk([
        [1, '', '16:50', '문가은님, 칼슘 주사 맞고 나서 저린 느낌은 좀 어떠세요?'],
        [0, '문가은', '16:51', '입 주변은 많이 괜찮아졌어요. 손끝은 아직 조금 저려요.'],
        [1, '', '16:51', '주사 맞은 팔은 아프거나 화끈거리지 않으세요?'],
        [0, '문가은', '16:52', '아니요, 괜찮아요.'],
      ]),
    },
  },
  {
    name: '서동건', id: '20655321', detail: 'M/71/B+', bed: '014-05-04', sex: 'm',
    dx: '지역사회획득 폐렴(Pneumonia)', body: '168.0cm / 61.3kg', surgery: '-', dept: 'PU(호흡기내과)', doctor: '한상우 교수',
    admitted: '2026-08-29', allergies: ['Sulfonamide'], infections: ['CRE'], barcode: 'P20655321',
    my: { chip: 'VS완료', tone: 'green', task: 3 },
    orders: () => [
      med('o1', { name: '피페라실린·타조박탐주 4.5g', code: 'D4001', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
      med('o2', { name: '아지트로마이신주 500mg', code: 'D4002', count: [0, 1] }),
      med('o3', { name: '암브록솔주 15mg/2ml', code: 'D4003', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
      med('o4', { bar: 'procedure', name: '아세트아미노펜주 1g/100ml', code: 'D4004', prn: true }),
    ],
    blood: () => [
      tube('b1', 'Blood culture #1 (호기성)', '1711150000031', 'BACTEC 호기성 10ml', 'B4001'),
      tube('b2', 'Blood culture #2 (혐기성)', '1711150000032', 'BACTEC 혐기성 10ml', 'B4002'),
    ],
    trf: () => [],
    vitals: vitals('16:30', N1, { SBP: 128, DBP: 76, PR: 98, RR: 22, BT: 38.1, SpO2: 94 }, { BT: 'warn', SpO2: 'warn' }),
    memos: () => [
      memo('m1', 'perform', '활력징후', C.vital, '2026.09.02 10:30', false,
        [{ title: '발열 지속 및 가래 증가', desc: 'BT 38.1℃, 노란 가래 증가 호소, 해열제 투여 1시간 뒤 재측정 예정' }],
        talk([
          [1, '', '10:27', '서동건님, 열이 아직 있으시네요. 가래는 어떠세요?'],
          [0, '서동건', '10:28', '어제보다 가래가 많아졌어요. 색이 노래요.'],
          [1, '', '10:30', '해열제 놓아 드리고 한 시간 뒤에 열 다시 재 볼게요. 물 자주 드세요.'],
        ])),
      memo('m2', 'round', '병상 라운딩', C.round, '2026.09.01 21:00', true,
        [{ title: '야간 기침으로 수면 방해', desc: '상체 거상 자세 유지 및 가습 제공, 수면 상태 재확인 예정' }],
        talk([
          [1, '', '20:58', '주무시기 전에 불편한 건 없으세요?'],
          [0, '서동건', '20:59', '누우면 기침이 나서 잠을 잘 못 자겠어요.'],
          [1, '', '21:00', '침대 머리를 올려 드릴게요. 가습기도 켜 두겠습니다.'],
        ])),
    ],
    ai: {
      at: '26/09/17 16:33', count: 2,
      summary: [
        { title: '오한 호소, 호흡곤란 감소', desc: '으슬으슬한 느낌 호소, 숨찬 느낌은 어제보다 감소' },
        { title: '객담 배출 교육', desc: '심호흡 후 기침하는 방법 교육, 노란 객담 관찰' },
      ],
      transcript: talk([
        [1, '', '16:31', '서동건님, 열이 좀 있으시네요. 춥거나 숨이 차지는 않으세요?'],
        [0, '서동건', '16:32', '좀 으슬으슬해요. 숨찬 건 어제보다는 나아요.'],
        [1, '', '16:32', '숨을 크게 들이마셨다가 기침해서 가래를 뱉어 보세요. 해열제도 준비해 드릴게요.'],
        [0, '서동건', '16:33', '가래가 노랗게 나와요.'],
      ]),
    },
  },
  {
    name: '안소율', id: '20876654', detail: 'F/82/B+', bed: '026-10-01', sex: 'f',
    dx: '십이지장궤양 출혈 (Duodenal ulcer bleeding)', body: '152.0cm / 47.8kg', surgery: '내시경적 지혈술 후 2일차', dept: 'GI(소화기내과)', doctor: '윤재석 교수',
    admitted: '2026-08-30', allergies: ['NSAIDs'], infections: [], barcode: 'P20876654',
    my: { chip: '수혈완료', tone: 'orange', task: 2 },
    orders: () => [
      med('o1', { name: '판토프라졸나트륨주 40mg', code: 'D5001', count: [1, 2], given: [['09:00']] }),
      med('o2', { bar: 'bundle', group: 'g2', name: '하트만액 1000ml', code: 'D5002', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
      med('o3', { bar: 'bundle', group: 'g2', name: '트라넥삼산주 500mg/5ml', code: 'D5003', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
    ],
    blood: () => [tube('b1', 'CBC (Hb 추적)', '1711150000041', 'EDTA 3ml', 'B5001')],
    trf: () => [product('t1', 'Leduction Filtered Red Cell', ['0918039301'], 'B+', 'T5001')],
    // 긴급 처리 업무: 이상치 재확인 필요 (저혈압 · 빈맥)
    vitals: vitals('16:00', N2, { SBP: 88, DBP: 54, PR: 118, RR: 22, BT: 36.6, SpO2: 95 }, { SBP: 'danger', DBP: 'warn', PR: 'danger' }),
    memos: () => [
      memo('m1', 'perform', '수혈하기', C.trf, '2026.09.01 13:00', true,
        [{ title: '수혈 중 이상반응 없음', desc: '수혈 시작 15분 후 활력징후 확인, 발열·오한·두드러기 없음' }],
        talk([
          [1, '', '12:58', '안소율님, 피 들어가는 동안 춥거나 가렵지는 않으세요?'],
          [0, '안소율', '12:59', '괜찮아요. 아무렇지도 않아요.'],
          [1, '', '13:00', '이상하면 바로 호출벨 눌러 주세요. 15분마다 확인하러 올게요.'],
        ])),
      memo('m2', 'round', '병상 라운딩', C.round, '2026.09.01 09:30', true,
        [{ title: '흑색변 1회', desc: '오전 흑색변 1회 확인, 담당의 보고 및 금식 유지' }],
        talk([
          [1, '', '09:28', '아침에 화장실 다녀오셨어요? 변 색깔은 어떠셨어요?'],
          [0, '안소율', '09:29', '까맣게 한 번 봤어요.'],
          [1, '', '09:30', '담당 선생님께 알릴게요. 오늘도 식사는 하지 마시고 기다려 주세요.'],
        ])),
    ],
    ai: {
      at: '26/09/17 16:07', count: 2,
      summary: [
        { title: '기립 시 어지럼증 호소', desc: '앉았다 일어날 때 어지러움 호소, 낙상 예방 교육 및 침상 안정' },
        { title: '흑색변·복통 없음', desc: '오후 흑색변 없음, 복통 호소 없음' },
      ],
      transcript: talk([
        [1, '', '16:05', '안소율님, 어지럽거나 속이 메스껍지는 않으세요?'],
        [0, '안소율', '16:06', '앉았다 일어나면 어질어질해요.'],
        [1, '', '16:06', '혈압이 조금 낮아요. 혼자 일어나지 마시고 꼭 호출벨 눌러 주세요. 변 색깔은 어떠셨어요?'],
        [0, '안소율', '16:07', '오후에는 화장실 안 갔어요. 배는 안 아파요.'],
      ]),
    },
  },
  {
    name: '정민호', id: '20812233', detail: 'M/62/A+', bed: '045-03-01', sex: 'm',
    dx: '직장암(Rectal cancer)', body: '171.3cm / 70.1kg', surgery: '복강경 저위전방절제술 후 1일차 (POD#1)', dept: 'CRS(대장항문외과)', doctor: '오민석 교수',
    admitted: '2026-09-14', allergies: ['Iodinated contrast'], infections: ['VRE'], barcode: 'P20812233',
    my: { chip: '채혈완료', tone: 'blue', task: 1 },
    orders: () => [
      med('o1', { name: '세파졸린나트륨주 1g', code: 'D6001', count: [2, 3], given: [['09:00'], ['13:00', N2]] }),
      med('o2', { name: '모르핀황산염주 10mg/1ml', code: 'D6002', count: [2, 3], given: [['09:00'], ['13:00', N2]], tags: [{ t: '마약', kind: 'nar' }], ham: true }),
      med('o3', { bar: 'procedure', name: '온단세트론주 4mg/2ml', code: 'D6003', prn: true }),
    ],
    blood: () => [tube('b1', 'CBC', '1711150000051', 'EDTA 3ml', 'B6001')],
    // 긴급 처리 업무: 수혈 오더 30분 경과
    trf: () => [product('t1', 'Leduction Filtered Red Cell', ['0918039311', '0918039312'], 'A+', 'T6001')],
    vitals: vitals('13:00', N2, { SBP: 112, DBP: 70, PR: 92, RR: 18, BT: 37.6, SpO2: 97 }, { BT: 'warn' }),
    memos: () => [],
    ai: {
      at: '26/09/17 16:22', count: 1,
      summary: [
        { title: '수술 부위 통증 NRS 4점', desc: '움직일 때 통증 증가, 진통제 투여 후 재평가 예정' },
        { title: '수혈 전 이상 증상 없음', desc: '어지러움·호흡곤란 없음, 수혈 진행 설명함' },
      ],
      transcript: talk([
        [1, '', '16:20', '정민호님, 수술 부위 통증은 0에서 10 중에 몇 점 정도세요?'],
        [0, '정민호', '16:21', '가만히 있으면 4점 정도인데 움직이면 더 아파요.'],
        [1, '', '16:21', '진통제 시간 맞춰 드릴게요. 피가 조금 부족해서 오늘 수혈도 진행할 거예요. 어지럽거나 숨차진 않으세요?'],
        [0, '정민호', '16:22', '네, 그런 건 없어요.'],
      ]),
    },
  },
];

export const DEFAULT_PID = PATIENTS[0].id; // 김철수 — 시연 기본 환자 (메뉴에서 시작한 스캔)
export const patientById = (id) => PATIENTS.find((p) => p.id === id);
export const patientByCode = (code) => PATIENTS.find((p) => code === p.barcode || code === p.id);
export const fullName = (p) => `${p.name}(${p.id})`;

/** The fields screens read through `PATIENT` (data.js) for the selected patient. */
export function profileOf(p) {
  const { my, orders, blood, trf, vitals: v, memos, ...profile } = p;
  return profile;
}

// 긴급 처리 업무: one card per menu alarm (사용자설정 → 메뉴별 알림 설정). `chip(min)` builds the label from the alarm's 경과 시간.
// 6명 샘플 환자 모두 한 장씩 (2026-11-27 요청).
// `elapsed`(경과, 분) · `dueIn`(임박까지 남은 분): 긴급 처리 업무 정렬 기준 (2026-11-27 요청) — 경과가 큰 카드 우선,
// 같으면 임박(dueIn)이 작은 카드 우선. 정렬에만 쓰이고 화면의 chip 문구(알람 설정 분)는 그대로 둔다.
export const URGENT = [
  { menu: 'med', pid: '21212457', icon: 'uc-pill', chip: (m) => `투약 오더 ${m}분 경과`, tone: 'blue', elapsed: 52 },
  { menu: 'med', pid: '20733345', icon: 'uc-pill', chip: (m) => `투약 오더 ${m}분 경과`, tone: 'blue', elapsed: 41 },
  { menu: 'med', pid: '21033456', icon: 'uc-pill', chip: (m) => `투약 오더 ${m}분 경과`, tone: 'blue', elapsed: 33 },
  { menu: 'vital', pid: '20655321', icon: 'uc-vital', chip: () => '이상치 재확인 필요', tone: 'green', elapsed: 24, dueIn: 10 },
  { menu: 'vital', pid: '20876654', icon: 'uc-vital', chip: () => '이상치 재확인 필요', tone: 'green', elapsed: 16, dueIn: 15 },
  { menu: 'trf', pid: '20812233', icon: 'uc-blood', chip: (m) => `수혈 오더 ${m}분 경과`, tone: 'blue', elapsed: 9 },
];
