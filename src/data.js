// Mock data for the prototype. Names are unified across every screen:
// logged-in (1st) nurse 이수진, second-check nurse 김수아. The six sample patients live in patients.js;
// `PATIENT` below is the *selected* patient (state.selectPatient copies a profile into it) and starts as 김철수.

export const NURSE = { name: '이수진', role: '책임간호사', label: '이수진 간호사', no: 'N20240182' };
export const NURSE2 = { name: '김수아', label: '김수아 간호사', no: 'N23240183' };
export const NURSES = [NURSE.label, NURSE2.label];

export const PATIENT = {
  name: '김철수',
  id: '21212457',
  detail: 'M/55/AB+',
  bed: '061-06-02',
  dx: '위암(Stomach cancer)',
  body: '174.5cm / 68.2kg',
  surgery: '위아전절제술 후 3일차 (POD#3)',
  dept: 'GS(외과)',
  doctor: '박준호 교수',
  admitted: '2026-08-30',
  allergies: ['Penicillin', 'Aspirin', 'Iodinated contrast', 'Sulfonamide'],
  infections: ['VRE', 'MRSA'],
  barcode: 'P21212457',
};

export const patientTitle = () => `${PATIENT.name}(${PATIENT.id})`;
const KIM = PATIENT.name; // 김철수's own records keep his name whoever is selected later

// Medication orders. `group` keeps bundled (묶음처방) orders on one coloured bar.
// `hist` rows are already given; `now` is the dose being administered at the current slot.
export function createOrders() {
  return [
    {
      id: 'o1', group: 'g1', bar: 'routine', type: '일반처방', tags: [{ t: '기타' }],
      count: [1, 2], name: '노보래피드플렉스펜주300IU/3ml/pen', date: '041 / 2026-09-17 17:00',
      hist: [{ time: '09:00', st: 'Y', who: NURSE.label }],
      now: { time: '17:00', st: 'Y', who: NURSE.label }, code: 'D1001',
    },
    {
      id: 'o2', group: 'g2', bar: 'bundle', type: '묶음처방', tags: [{ t: '마약', kind: 'nar' }], ham: true,
      count: [2, 3], name: '대한 디-만니톨주사액(20%) 100ml', date: '041 / 2026-09-17 17:00',
      hist: [{ time: '09:00', st: 'Y', who: NURSE.label }, { time: '13:00', st: 'NO', who: NURSE2.label }],
      now: { time: '17:00', st: 'Y', who: NURSE.label }, code: 'D1002',
    },
    {
      id: 'o3', group: 'g2', bar: 'bundle', type: '묶음처방', tags: [{ t: '고가약', kind: 'cost' }],
      count: [2, 3], name: '황산마그네슘주사액10% 20ml', date: '041 / 2026-09-17 17:00',
      hist: [{ time: '09:00', st: 'Y', who: NURSE.label }, { time: '13:00', st: 'Y', who: NURSE2.label }],
      now: { time: '17:00', st: 'Y', who: NURSE.label }, code: 'D1003',
    },
    {
      id: 'o4', group: 'g3', bar: 'discharge', type: '퇴원약처방', tags: [{ t: '기타' }], prn: true,
      count: null, name: '노보래피드플렉스펜주300IU/3ml/pen', date: '041 / 2026-09-17 17:00',
      hist: [],
      now: { time: '실시간', st: 'Y', who: NURSE.label }, code: 'D1004',
    },
    {
      id: 'o5', group: 'g4', bar: 'procedure', type: '처치시처방', tags: [{ t: '기타' }], prn: true,
      count: null, name: '노보래피드플렉스펜주300IU/3ml/pen', date: '041 / 2026-09-17 17:00',
      hist: [],
      now: { time: '실시간', st: 'Y', who: NURSE.label }, code: 'D1005',
    },
  ];
}

export const TIME_SLOTS = ['09:00', '13:00', '17:00', '21:00'];

export const STATUS_OPTIONS = [
  { code: 'Y', label: 'Y-투약' },
  { code: 'NO', label: 'NO-미투약' },
  { code: 'S', label: 'S-시작' },
  { code: 'F', label: 'F-종료' },
  { code: 'H', label: 'H-보류' },
  { code: 'R', label: 'R-거부' },
  { code: 'N', label: 'N-금식' },
  { code: 'C', label: 'C-변경' },
];

export const HAM_CHECKS = ['환자 성명, 등록번호 일치', '환자 상세 및 혈액 일치', '처방/약물명 일치', '용량 및 상세정보 일치', '약물 처방 및 투약 플랜 일치'];

/* ---------- 채혈하기 (neo-bld-task-01) ---------- */
export function createBloodDraws() {
  return [
    {
      id: 'b1', name: 'LR-D, Glu, Lipid', specimen: '1711150000002', detail: 'SST 10ml',
      issuer: '041', issued: '2026-09-17 17:00', now: { time: '17:24', who: NURSE.label }, code: 'B1001',
    },
    {
      id: 'b2', name: 'CBC, PT/aPTT', specimen: '1711150000003', detail: 'EDTA 3ml',
      issuer: '041', issued: '2026-09-17 17:00', now: { time: '17:24', who: NURSE.label }, code: 'B1002',
    },
  ];
}

/* ---------- 수혈하기 (neo-trf-task-01) — every blood product is 고위험수행 ----------
   volume (ml) = one unit (bag), shown on its 혈액팩 card · minutes = its planned infusion time (종료 시각은 기록하지 않음). */
/** 혈액형 + Rh of a 수혈 오더 ('AB' + '+' → 'AB+'). */
export const bloodType = (o) => `${o.abo}${o.rh || ''}`;

export function createTransfusions() {
  return [
    {
      id: 't1', name: 'Leduction Filtered White Cell', comp: 'WBC', units: ['0918039240'], abo: 'AB', rh: '+', volume: 250, minutes: 90,
      issuer: '041', issued: '2026-09-17 17:00', now: { time: '17:24', st: 'Y', who: NURSE.label }, code: 'T1001',
    },
    {
      id: 't2', name: 'Leduction Filtered Red Cell', comp: 'RBC',
      units: ['0918039241', '0918039242', '0918039243', '0918039244', '0918039245', '0918039246', '0918039247'], abo: 'AB', rh: '+', volume: 300, minutes: 120,
      issuer: '041', issued: '2026-09-17 17:00', now: { time: '17:24', st: 'Y', who: NURSE.label }, code: 'T1002', focus: true,
    },
  ];
}

export const TRF_CHECKS = ['환자 성명, 등록번호 일치', '환자 상세 및 혈액형 일치', '처방/약물명 일치', '용량 및 상세정보 일치'];

export const TRF_STATUS = [
  { code: 'Y', label: 'Y-수혈 시작' },
  { code: 'E', label: 'E-종료' },
];

/* ---------- 활력징후 (neo-vital-task-01) ---------- */
export const DEMO_DATE = '2026-09-17';
export const VITAL_STEP = { SBP: 1, DBP: 1, PR: 1, RR: 1, BT: 0.1, SpO2: 1 };

/* ---------- 전체 메뉴 24종 (햄버거메뉴 · 사용자설정 · 퀵메뉴) ----------
   group colours follow the design legend: 파랑 수행 · 주황 조회 · 초록 측정 · 마젠타(보라) 기록 · 노랑 물류 · 민트 행정.
   `go` = a flow the prototype implements, `icon` = 3D tile for the hub quick menu, `alarm` = 경과 알림 label. */
export const MENU_GROUPS = [
  {
    key: 'perform', label: '수행관리', color: '#44a0d6',
    items: [
      { key: 'med', label: '투약하기', go: 'med', icon: 'sc-pill', alarm: '오더 경과 알림' },
      { key: 'bld', label: '채혈하기', go: 'bld', icon: 'sc-syringe', alarm: '오더 경과 알림' },
      { key: 'trf', label: '수혈하기', go: 'trf', icon: 'blood', alarm: '오더 경과 알림' },
      { key: 'nar', label: '마약/항정 인수인계', icon: 'narcotic' },
      { key: 'chemo', label: '주사항암재확인', icon: 'chemo' },
    ],
  },
  {
    key: 'inquiry', label: '조회관리', color: '#e7954d',
    items: [
      { key: 'expiry', label: '약품유효기간', icon: 'hourglass' },
      { key: 'own', label: '지참약확인', icon: 'own-meds' },
      { key: 'arrival', label: '혈액도착확인', icon: 'blood-arrival' },
      { key: 'diet', label: '식이관리', icon: 'diet' },
    ],
  },
  {
    key: 'measure', label: '측정관리', color: '#79c97d',
    items: [
      { key: 'vital', label: '활력징후', go: 'vital', icon: 'sc-vital', alarm: '측정 후 경과 알림' },
      { key: 'body', label: '신체계측', icon: 'body-measure' },
      { key: 'preop', label: '수술전확인', icon: 'pre-op' },
      { key: 'mother', label: '산모아기확인', short: '산모아기', icon: 'sc-mother' },
    ],
  },
  {
    key: 'record', label: '기록관리', color: '#a16bff',
    items: [
      { key: 'photo', label: '사진전송', icon: 'photo' },
      { key: 'care', label: '간호처치', icon: 'nursing-care' },
      { key: 'msg', label: '메신저', icon: 'messenger' },
      { key: 'consent', label: '동의서', icon: 'consent' },
    ],
  },
  {
    key: 'logistics', label: '물류관리', color: '#eec567',
    items: [
      { key: 'pharm', label: '약제물품', icon: 'pharmacy-delivery' },
      { key: 'asset', label: '고정자산', icon: 'asset-register' },
      { key: 'move', label: '환자이송', icon: 'transfer' },
    ],
  },
  {
    key: 'admin', label: '행정관리', color: '#65d7ea',
    items: [
      { key: 'pcheck', label: '환자확인', icon: 'patient-check-45' },
      { key: 'sinfo', label: '물품정보', icon: 'supply-info' },
      { key: 'susage', label: '물품사용량', icon: 'supply-usage' },
      { key: 'order2', label: '2차오더', icon: 'second-order' },
    ],
  },
];
export const MENU_ITEM = Object.fromEntries(
  MENU_GROUPS.flatMap((g) => g.items.map((i) => [i.key, { ...i, group: g.key, groupLabel: g.label, color: g.color }])),
);
export const DEFAULT_QUICK = ['med', 'bld', 'vital', 'mother']; // 퀵메뉴 기본값 (최대 4건)

export const ROOMS = ['항암주사실', '일반주사실', '일반주사실2', '소아주사실', '임상1주사실', '임상2주사실', '면역(성인)', '면역(소아)'];
export const DEPT = '내분비내과';

// 김철수's memos: 수행별 (per task) and 병상 라운딩. `reviewed` = "AI가 요약한 콘텐츠를 검토했습니다."
export function createMemos() {
  return [
    {
      id: 'm1', kind: 'perform', type: '투약하기', color: '#44a0d6', at: '2026.09.04 17:30', reviewed: false,
      items: [{ title: '13:00 진통제 투여 완료', desc: '통증 점수 3에서 1로 감소 확인, 특이 반응 없음' }],
      script: [
        { who: NURSE.label, time: '17:28', nurse: true, text: '환자분, 1시에 맞으신 진통제 이후로 통증은 좀 어떠세요? 0에서 10 중에 몇 점 정도일까요?' },
        { who: KIM, time: '17:29', text: '아까는 3점 정도였는데 지금은 1점 정도예요. 많이 편해졌어요.' },
        { who: NURSE.label, time: '17:30', nurse: true, text: '네, 어지럽거나 속이 불편한 건 없으시죠? 불편하시면 바로 말씀해 주세요.' },
      ],
    },
    {
      id: 'm2', kind: 'perform', type: '투약하기', color: '#44a0d6', at: '2026.09.04 13:00', reviewed: true,
      items: [
        { title: '체위 변경 시 수술부위 당김 호소', desc: '왼쪽으로 돌아누울 때 수술부위가 약간 당김' },
        { title: '진통제 투여 보류', desc: '통증이 참을 만한 수준이라 진통제는 맞지 않아도 될 것 같다고 표현함, 진통제 투여 보류하고 30분뒤에 확인하기로 함' },
      ],
      script: null, // = TRANSCRIPT
    },
    {
      id: 'm3', kind: 'round', type: '병상 라운딩', color: '#99a4b4', at: '2026.09.04 13:00', reviewed: true,
      items: [{ title: '환자 기립 시 경미한 통증', desc: '수술부위 통증은 완화됨을 표현 했으나 기립 시 경미한 통증 호소, 침상 난간 거치 및 낙상 예방 교육 시행함' }],
      script: [
        { who: NURSE.label, time: '12:56', nurse: true, text: '라운딩 왔습니다. 오늘 수술 부위 통증은 어떠세요?' },
        { who: KIM, time: '12:57', text: '누워 있을 때는 괜찮은데, 일어날 때 조금 아파요.' },
        { who: NURSE.label, time: '12:58', nurse: true, text: '일어나실 때는 침대 난간을 잡고 천천히 일어나세요. 어지러우시면 바로 앉으시고요.' },
        { who: KIM, time: '12:59', text: '네, 천천히 일어나 볼게요.' },
        { who: NURSE.label, time: '13:00', nurse: true, text: '침상 난간 올려 두었습니다. 화장실 가실 때는 호출벨 눌러 주세요.' },
      ],
    },
  ];
}

// 투약/채혈/수혈 통합 (2026-11-27 요청): 업무 플로우가 같아 메뉴 하나로 묶고, 환자의 남은 업무를 카드별로 수행한다 (work.js care3).
export const MENU = [
  ['pill-45', '투약/채혈/수혈', 'care3'], ['hourglass', '약품유효기간'],
  ['blood-arrival', '혈액 도착 확인'], ['own-meds', '지참약 확인'], ['vital-45', '활력 징후', 'vital'], ['narcotic', '마약/항정'],
  ['pre-op', '수술 전 확인'], ['body-measure', '신체 계측'], ['photo', '사진 전송'], ['nursing-care', '간호 처치 시행'],
  ['messenger', '메신저'], ['mother-baby', '산모 아기 확인'], ['transfer', '환자이송'], ['chemo', '주사항암제'],
  ['diet', '식이관리'], ['consent', '동의서 조회'], ['patient-check-45', '환자확인'], ['second-order', '2차오더'],
  ['supply-usage', '물품사용량'], ['pharmacy-delivery', '약제물품배송'], ['supply-info', '물품정보조회'], ['asset-register', '고정자산등록'],
];

// AI voice nursing record (the logged-in nurse talking with the patient)
export const TRANSCRIPT = [
  { who: NURSE.label, time: '16:48', nurse: true, text: '환자분, 점심 투약전에 불편한 점 없으신지 확인 차 방문했습니다. 자세 바꾸거나 할 때 불편한 점 있으세요?' },
  { who: KIM, time: '16:48', text: '안녕하세요, 왼쪽으로 돌아 누울 때 수술 자리가 조금 당깁니다. 참을 수 있을 정도에요. 진통제는 아직 안맞아도 될 것 같아요' },
  { who: NURSE.label, time: '16:48', nurse: true, text: '네, 무리하게 힘주지 마시고 베개 하나 복부 쪽에 살짝 받쳐드릴게요. 수액 줄도 정렬해 드렸습니다.' },
  { who: KIM, time: '16:48', text: '베개 대니까 수술 부위가 훨씬 편하네요. 고맙습니다.' },
];

export const AI_SUMMARY = [
  { title: '체위 변경 시 수술 부위 당김 호소 (경미)', desc: '왼쪽으로 돌아누울 때 수술 부위가 약간 당김' },
  { title: '진통제 투여 보류 (환자 의사)', desc: '통증이 참을 만한 수준이라 진통제는 아직 맞지 않아도 될 것 같다고 표현함, 진통제 투여 보류 하고 30분뒤에 확인하기로 함' },
  { title: '체위 보조 및 수액 라인 정렬 시행', desc: '복부 쪽에 베개를 받쳐 자세를 보조하고 수액 줄을 정렬함' },
];

export const VITALS = [
  { k: 'SBP', v: '118', unit: 'mmHg', at: '09/17 15:30' },
  { k: 'DBP', v: '76', unit: 'mmHg', at: '09/17 15:30' },
  { k: 'PR', v: '188', unit: '회/min', at: '09/17 15:30', flag: 'danger' },
  { k: 'RR', v: '20', unit: '회/min', at: '09/17 15:30' },
  { k: 'BT', v: '38.6', unit: '°C', at: '09/17 15:30', flag: 'warn' },
  { k: 'SpO2', v: '97', unit: '%', at: '09/17 15:30' },
];
