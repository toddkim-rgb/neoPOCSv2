// 앱 버전 · 업데이트 (시연용). The build's version is package.json's; the *installed* version is what this viewer last
// updated or rolled back to (kept in the browser), so 업데이트 · 특정 버전으로 변경 · 강제 업데이트 can be shown on the
// shared web URL without real app-store installs. A viewer who never changed it always runs the latest build.
import { version as BUILD } from '../package.json';

/** 버전 이력, newest first (dates and contents from the released builds). */
export const VERSIONS = [
  {
    v: '0.5.0',
    date: '2026-11-17',
    notes: [
      '야간모드: 어두운 화면, 알림·조작은 소리 대신 진동 (사용자설정 on/off)',
      '투약: 환자 팔찌 → 투약 바코드 스캔 → 투약 목록 활성화',
      '사용자설정 고위험수행 2차인증 항목 삭제',
      '상단은 업무명, 환자 이름·등록번호는 환자정보 박스로 이동',
      '환자 상세 임상관찰기록 상세보기 (이전 측정 기록) · 측정 시간 한 곳에 표시',
      '활력징후 입력 칸을 누르면 직전 값',
      'PDA · Android 설치용 APK (v0.5.0)',
    ],
  },
  {
    v: '0.4.0',
    date: '2026-11-16',
    notes: [
      'Figma SSol 디자인으로 전면 개편 (환자허브 · AI 커맨드바 · 투약 · 채혈 · 수혈 · 활력징후 · 사용자설정 · 햄버거메뉴 · 음성간호메모)',
      '샘플 환자 6명의 업무 수행 (긴급 처리 업무 · MY환자 업무 선택)',
      '수혈 진행: 수혈 시작 · 예상 종료 · 15분 중간 체크 · 긴급 종료 · 단위별 기록',
      'AI 커맨드바 + (음성메모 · 사진 촬영 · 스캔 · 사진첨부), 앱 버전 · 버전 이력 · 업데이트',
      '개인정보 자동 가림 (조작이 없으면 환자 · 의료진 이름과 번호를 가림)',
      '투약 삭제(이번 투약에서 제외) · 수혈 혈액백 바코드 2개 확인 · 활력징후 음성 입력 · 이전 값 표시',
    ],
  },
  {
    v: '0.3.0',
    date: '2026-10-14',
    notes: ['사진촬영 → 활력징후 AI 인식 (AI 카메라 촬영 · 측정값 확인 · EMR 전송)', 'PDA 설치용 릴리스 서명 APK'],
  },
  {
    v: '0.2.0',
    date: '2026-10-13',
    notes: ['PDA(Point Mobile MF52e) 설치용 APK', 'PDA 바코드 스캐너 연동 · 기기 화면 크기 맞춤'],
  },
  {
    v: '0.1.0',
    date: '2026-10-13',
    notes: ['첫 프로토타입: 로그인 · 홈 허브 · 투약하기 (환자 · 처방 스캔, 고위험약물 이중확인) · 음성간호메모 · 환자상세'],
  },
];

export const LATEST = BUILD;
/** 최소 지원 버전: an installed version below it must update before the app can be used (강제 업데이트). */
export const MIN_SUPPORTED = '0.3.0';

/** Semantic-version compare: < 0 when a is older than b. */
export function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

const KEY = 'neo-pocs.installed-version';
let session = null; // used when the browser refuses storage (private window): the change lasts until a reload

/** The version this viewer is "running". */
export function installed() {
  let v = session;
  try {
    v = localStorage.getItem(KEY) ?? session;
  } catch {
    /* storage blocked */
  }
  return v && VERSIONS.some((x) => x.v === v) && cmpVer(v, LATEST) < 0 ? v : LATEST;
}

/** 업데이트 · 버전 변경 완료. Back on the latest build nothing is kept, so a later deploy is picked up as usual. */
export function install(v) {
  const latest = cmpVer(v, LATEST) >= 0;
  session = latest ? null : v;
  try {
    if (latest) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked: `session` keeps it */
  }
}

/** 'force' (below 최소 지원 버전) · 'optional' (a newer version exists) · 'latest'. */
export function updateState(v = installed()) {
  if (cmpVer(v, MIN_SUPPORTED) < 0) return 'force';
  if (cmpVer(v, LATEST) < 0) return 'optional';
  return 'latest';
}

export const versionOf = (v) => VERSIONS.find((x) => x.v === v);
