import React, { useState, useEffect } from 'react';
import { Patient, WorklistTask } from '../types';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  Scan,
  Clock,
  AlertTriangle,
  FileCheck2,
  HeartPulse,
  Droplet,
  ArrowLeft,
  CreditCard,
  KeyRound,
  Fingerprint,
  Lock,
  RefreshCw,
  Radio,
  ScanFace,
  Sparkles,
} from 'lucide-react';

interface TransfusionWorkflowModalProps {
  patient: Patient;
  task?: WorklistTask;
  onClose: () => void;
  onCompleteTransfusion: (taskId?: string) => void;
}

export const TransfusionWorkflowModal: React.FC<TransfusionWorkflowModalProps> = ({
  patient,
  task,
  onClose,
  onCompleteTransfusion,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1 State: Blood Bag Verification
  const [bloodBagInfo] = useState({
    productName: '농축적혈구 (Packed RBC)',
    volume: '320 mL / 1 Unit',
    bloodBagNo: '03-26-104829',
    bloodTypeBag: 'AB+',
    crossMatchResult: '적합 (Compatible)',
    expiryDate: '2026-08-15 23:59',
    irradiation: '조사 필 (Irradiated)',
  });
  const [isVisualInspected, setIsVisualInspected] = useState<boolean>(false);

  // Step 2 State: Dual Nurse Sign-off & Auth
  const [firstNurse] = useState('이수진 N (담당간호사 - N2341)');
  const [secondNurse, setSecondNurse] = useState('김영희 N (확인간호사 - N1892)');
  const [dualCheckItems, setDualCheckItems] = useState({
    patientIdentity: false,
    bloodTypeMatch: false,
    bagNumberMatch: false,
    crossMatchMatch: false,
    expirationMatch: false,
  });

  // Dual Nurse Authentication State
  const [showNurseAuth, setShowNurseAuth] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'rfid' | 'idpw' | 'bio'>('rfid');
  const [nurseIdInput, setNurseIdInput] = useState<string>('N1892');
  const [nursePwInput, setNursePwInput] = useState<string>('');
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Step 3 State: Barcode Tagging
  const [scannedPatient, setScannedPatient] = useState<boolean>(false);
  const [scannedBloodBag, setScannedBloodBag] = useState<boolean>(false);

  // Step 4 State: Pre-transfusion Vitals
  const [vitals, setVitals] = useState({
    bpSys: patient.vitals?.bp.split('/')[0] || '120',
    bpDia: patient.vitals?.bp.split('/')[1] || '78',
    hr: patient.vitals?.hr || 82,
    bt: patient.vitals?.bt || 36.7,
    rr: patient.vitals?.rr || 18,
    spo2: patient.vitals?.spo2 || 98,
  });

  // Step 5 State: Transfusion In Progress & Timer
  const [infusionRate] = useState<number>(15); // gtt/min
  const [startTime, setStartTime] = useState<string | null>(null);
  const [isTransfusionStarted, setIsTransfusionStarted] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isTransfusionStarted) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isTransfusionStarted]);

  const formatElapsed = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}시간 ${pad(mins)}분 ${pad(secs)}초`;
    }
    return `${pad(mins)}분 ${pad(secs)}초 (${pad(mins)}:${pad(secs)})`;
  };

  const allDualChecked = Object.values(dualCheckItems).every(Boolean);

  const toggleDualCheck = (key: keyof typeof dualCheckItems) => {
    setDualCheckItems((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      if (Object.values(updated).every(Boolean)) {
        setShowNurseAuth(true);
      } else {
        setShowNurseAuth(false);
      }
      return updated;
    });
  };

  const handleAuthenticateNurse = () => {
    setIsAuthenticating(true);
    setTimeout(() => {
      setIsAuthenticating(false);
      setCurrentStep(3); // STEP 3 바코드 태깅 단계로 이동
    }, 700);
  };

  const handleStartTransfusion = () => {
    const now = new Date();
    const formattedTime = now.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setStartTime(formattedTime);
    setIsTransfusionStarted(true);
  };

  const handleFinishWorkflow = () => {
    onCompleteTransfusion(task?.id);
  };

  return (
    <div className="w-full bg-slate-50 min-h-full flex flex-col justify-between text-slate-800 font-sans relative">
      {/* Light Header Bar */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-slate-200 shadow-2xs sticky top-0 z-10">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={onClose}
            className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
            title="업무 목록으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg">
            <Droplet className="w-5 h-5 fill-current animate-pulse" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm text-slate-900 flex items-center space-x-1.5">
              <span>안전 수혈 5단계 워크플로우</span>
              <span className="bg-rose-100 text-rose-700 border border-rose-200 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                HAM
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              {patient.name} ({patient.gender}/{patient.age}세) · {patient.roomBed}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 5-Step Process Progress Indicator Bar */}
      <div className="bg-white px-3 py-2 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold shadow-2xs">
        {[
          { step: 1, label: '제제확인' },
          { step: 2, label: '2인동시확인' },
          { step: 3, label: '바코드태깅' },
          { step: 4, label: '수혈전V/S' },
          { step: 5, label: '수혈개시' },
        ].map((item) => (
          <div
            key={item.step}
            onClick={() => {
              setCurrentStep(item.step);
            }}
            className={`flex-1 text-center py-1.5 rounded-lg transition-all cursor-pointer mx-0.5 ${
              currentStep === item.step
                ? 'bg-rose-600 text-white font-black shadow-xs'
                : currentStep > item.step
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold'
                : 'bg-slate-100 text-slate-400 border border-slate-200 font-medium'
            }`}
          >
            {currentStep > item.step ? '✓ ' : `${item.step}. `}
            {item.label}
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* STEP 1: Blood Bag Verification */}
        {currentStep === 1 && (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl flex items-center space-x-3 text-rose-950">
              <ShieldCheck className="w-7 h-7 text-rose-600 shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm text-rose-900">
                  STEP 1. 처방 및 혈액 제제 확인
                </h3>
                <p className="text-[11px] text-rose-700 font-medium">
                  출고된 혈액 제제 표지 라벨과 EMR 처방 정보를 대조 점검합니다.
                </p>
              </div>
            </div>

            {/* Patient Blood Type vs Bag Blood Type Comparison Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
              <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                혈액형 일치 검증
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-center">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-medium mb-0.5">
                    환자 혈액형 (EMR)
                  </span>
                  <span className="text-xl font-black text-amber-600">
                    {patient.bloodType}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-medium mb-0.5">
                    혈액팩 라벨 ABO/Rh
                  </span>
                  <span className="text-xl font-black text-rose-600">
                    {bloodBagInfo.bloodTypeBag}
                  </span>
                </div>
              </div>
              {patient.bloodType === bloodBagInfo.bloodTypeBag && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-2.5 rounded-xl text-center font-bold flex items-center justify-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>환자 - 혈액팩 ABO/Rh 동종 혈액 일치함</span>
                </div>
              )}
            </div>

            {/* Blood Bag Spec Details */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-xs">
              <h4 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-2">
                혈액 제제 수령 정보
              </h4>
              <div className="grid grid-cols-2 gap-y-2.5 text-[11px]">
                <div>
                  <span className="text-slate-400 block font-medium">제제명</span>
                  <span className="font-bold text-slate-900">{bloodBagInfo.productName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">용량</span>
                  <span className="font-bold text-slate-900">{bloodBagInfo.volume}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">혈액번호</span>
                  <span className="font-bold text-slate-900 font-mono bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block">
                    {bloodBagInfo.bloodBagNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">교차시험 적합성</span>
                  <span className="font-bold text-emerald-600">
                    {bloodBagInfo.crossMatchResult}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">유효기간</span>
                  <span className="font-bold text-slate-700">{bloodBagInfo.expiryDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">방사선 조사</span>
                  <span className="font-bold text-purple-700">
                    {bloodBagInfo.irradiation}
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Inspection Checkbox */}
            <div
              onClick={() => {
                const nextVal = !isVisualInspected;
                setIsVisualInspected(nextVal);
                if (nextVal) {
                  setCurrentStep(2);
                }
              }}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center space-x-3 shadow-xs ${
                isVisualInspected
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center font-bold border ${
                  isVisualInspected
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {isVisualInspected && '✓'}
              </div>
              <div className="flex-1">
                <span className="font-bold text-xs text-slate-900 block">
                  혈액팩 외관 상태 최종 확인
                </span>
                <span className="text-[11px] text-slate-500">
                  응집물, 기포, 변색, 용기 파손 여부가 없음을 확인하였습니다.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Dual Nurse Sign-off & Authentication */}
        {currentStep === 2 && (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-indigo-50 border border-indigo-200 p-3.5 rounded-xl flex items-center space-x-3 text-indigo-950">
              <UserCheck className="w-7 h-7 text-indigo-600 shrink-0" />
              <div>
                <h3 className="font-bold text-[19px] leading-[28px] text-indigo-900" style={{ fontWeight: 'bold', fontSize: '19px', lineHeight: '28px' }}>
                  STEP 2. 간호사 2인 동시 이중점검 (Dual Sign-off)
                </h3>
                <p className="text-[11px] text-indigo-700 font-medium">
                  의료법 및 수혈 안전 지침에 따라 간호사 2인이 상호 구두 및 시각 검증을 수행합니다.
                </p>
              </div>
            </div>

            {/* 2 Nurses List */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">1차 검증자 (담당):</span>
                <span className="font-bold text-indigo-900 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                  {firstNurse}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">2차 검증자 (동료):</span>
                <select
                  value={secondNurse}
                  onChange={(e) => setSecondNurse(e.target.value)}
                  className="bg-white text-indigo-900 font-bold px-2 py-1 rounded border border-slate-300 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="김영희 N (확인간호사 - N1892)">
                    김영희 N (N1892)
                  </option>
                  <option value="박민지 N (확인간호사 - N2014)">
                    박민지 N (N2014)
                  </option>
                  <option value="정지원 N (책임간호사 - N1102)">
                    정지원 N (N1102)
                  </option>
                </select>
              </div>
            </div>

            {/* Checklist Items */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 shadow-xs pt-0 mt-2" style={{ paddingTop: '0px', marginTop: '8px' }}>
              <h4 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-2">
                2인 공동 이중점검 항목
              </h4>
              {[
                {
                  key: 'patientIdentity',
                  label: `환자 성명(${patient.name}), 등록번호(${patient.id}) 일치`,
                },
                {
                  key: 'bloodTypeMatch',
                  label: `환자 ABO/Rh(${patient.bloodType}) vs 혈액팩(${bloodBagInfo.bloodTypeBag}) 일치`,
                },
                {
                  key: 'bagNumberMatch',
                  label: `혈액제제 라벨 번호 (${bloodBagInfo.bloodBagNo}) 일치`,
                },
                {
                  key: 'crossMatchMatch',
                  label: `교차시험 결과 (${bloodBagInfo.crossMatchResult}) 대조 확인`,
                },
                {
                  key: 'expirationMatch',
                  label: `혈액제제 유효기간 (${bloodBagInfo.expiryDate}) 이내 확인`,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  onClick={() =>
                    toggleDualCheck(item.key as keyof typeof dualCheckItems)
                  }
                  className="flex items-center space-x-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-indigo-300 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={
                      dualCheckItems[item.key as keyof typeof dualCheckItems]
                    }
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* 2nd Nurse Authentication Pop-up Modal */}
            {showNurseAuth && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-0 animate-scale-up">
                  {/* Modal Header */}
                  <div className="bg-indigo-900 text-white p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-indigo-800 text-indigo-200 rounded-xl">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-white flex items-center space-x-1.5">
                          <span>간호사 2인 본인인증 & 전자서명</span>
                          <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                        </h4>
                        <p className="text-[11px] text-indigo-200 font-medium">
                          수혈 안전 2인 이중점검 Dual Sign-off
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowNurseAuth(false)}
                      className="p-1 text-indigo-300 hover:text-white rounded-lg hover:bg-indigo-800 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                    {/* 1st Nurse Info Box */}
                    <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                          1차
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-700 font-extrabold block">
                            1차 확인 간호사 (담당간호사)
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {firstNurse}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded-full flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>서명 완료</span>
                      </span>
                    </div>

                    {/* 2nd Nurse Selection & Info Box */}
                    <div className="bg-indigo-50/70 border border-indigo-200 p-3 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-indigo-800 font-extrabold block">
                          2차 확인 간호사 (동료간호사)
                        </span>
                        <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100 px-1.5 py-0.2 rounded">
                          인증 대기중
                        </span>
                      </div>
                      <select
                        value={secondNurse}
                        onChange={(e) => setSecondNurse(e.target.value)}
                        className="w-full bg-white text-indigo-950 font-extrabold p-2 rounded-lg border border-indigo-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                      >
                        <option value="김영희 N (확인간호사 - N1892)">
                          김영희 N (확인간호사 - N1892)
                        </option>
                        <option value="박민지 N (확인간호사 - N2014)">
                          박민지 N (확인간호사 - N2014)
                        </option>
                        <option value="정지원 N (책임간호사 - N1102)">
                          정지원 N (책임간호사 - N1102)
                        </option>
                      </select>
                    </div>

                    {/* Authentication Method Tabs */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-slate-700 block">
                        본인 인증 수단 선택 (기본: RFID 태깅)
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl text-center text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setAuthMode('rfid')}
                          className={`py-2 rounded-lg flex items-center justify-center space-x-1 transition-all ${
                            authMode === 'rfid'
                              ? 'bg-indigo-600 text-white shadow-xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>RFID 태깅</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode('idpw')}
                          className={`py-2 rounded-lg flex items-center justify-center space-x-1 transition-all ${
                            authMode === 'idpw'
                              ? 'bg-indigo-600 text-white shadow-xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>ID/PW</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode('bio')}
                          className={`py-2 rounded-lg flex items-center justify-center space-x-1 transition-all ${
                            authMode === 'bio'
                              ? 'bg-indigo-600 text-white shadow-xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Fingerprint className="w-3.5 h-3.5" />
                          <span>생체인증</span>
                        </button>
                      </div>
                    </div>

                    {/* Tab Content 1: RFID Tagging (Default) */}
                    {authMode === 'rfid' && (
                      <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-center space-y-3">
                        <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                          <div className="absolute inset-0 bg-indigo-400/20 rounded-full animate-ping" />
                          <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md relative z-10">
                            <Radio className="w-7 h-7 animate-pulse" />
                          </div>
                        </div>
                        <div>
                          <h5 className="font-extrabold text-xs text-indigo-950">
                            PDA 사원증 리더기 태깅 대기 중
                          </h5>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            확인간호사의 RFID 사원증 카드를 PDA 상단 센서에 접촉해 주세요.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Tab Content 2: ID / PW Login */}
                    {authMode === 'idpw' && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">
                            확인간호사 사원번호 (ID)
                          </label>
                          <input
                            type="text"
                            value={nurseIdInput}
                            onChange={(e) => setNurseIdInput(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="사원번호 입력"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">
                            비밀번호 (PW)
                          </label>
                          <input
                            type="password"
                            value={nursePwInput}
                            onChange={(e) => setNursePwInput(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                    )}

                    {/* Tab Content 3: Biometric Auth */}
                    {authMode === 'bio' && (
                      <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-center space-y-3">
                        <div className="flex justify-center space-x-3">
                          <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center border border-indigo-200">
                            <Fingerprint className="w-6 h-6 animate-pulse" />
                          </div>
                          <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center border border-indigo-200">
                            <ScanFace className="w-6 h-6" />
                          </div>
                        </div>
                        <div>
                          <h5 className="font-extrabold text-xs text-indigo-950">
                            생체 인식 (지문 / Face ID) 대기
                          </h5>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            PDA 전면 카메라에 얼굴을 비추거나 지문 인식 센서에 터치하세요.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowNurseAuth(false)}
                      className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={isAuthenticating}
                      onClick={handleAuthenticateNurse}
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                    >
                      {isAuthenticating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>인증 및 승인 처리 중...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>2차 확인 서명 완료 및 다음 단계</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Barcode Tagging */}
        {currentStep === 3 && (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-sky-50 border border-sky-200 p-3.5 rounded-xl flex items-center space-x-3 text-sky-950">
              <Scan className="w-7 h-7 text-sky-600 shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm text-sky-900">
                  STEP 3. 바코드 태깅 이중 매칭
                </h3>
                <p className="text-[11px] text-sky-700 font-medium">
                  PDA 스캐너로 환자 팔찌 바코드와 혈액팩 바코드를 각각 인식합니다.
                </p>
              </div>
            </div>

            {/* Patient Wristband Scan Box */}
            <div
              className={`p-4 rounded-xl border transition-all flex items-center justify-between shadow-xs ${
                scannedPatient
                  ? 'bg-emerald-50 border-emerald-300 text-slate-900'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-lg">
                  🏷️
                </div>
                <div>
                  <span className="text-xs font-bold block text-slate-900">
                    1. 환자 식별 팔찌 스캔
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {scannedPatient
                      ? `${patient.name} (${patient.id}) 매칭 완료`
                      : '환자 팔찌 바코드 태깅 대기 중'}
                  </span>
                </div>
              </div>

              {!scannedPatient ? (
                <button
                  onClick={() => {
                    setScannedPatient(true);
                    if (scannedBloodBag) {
                      setTimeout(() => setCurrentStep(4), 600);
                    }
                  }}
                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-lg shadow-xs"
                >
                  스캔 실행
                </button>
              ) : (
                <span className="text-emerald-600 font-extrabold text-xs flex items-center space-x-1 bg-emerald-100 px-2.5 py-1 rounded-md">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>완료</span>
                </span>
              )}
            </div>

            {/* Blood Bag Barcode Scan Box */}
            <div
              className={`p-4 rounded-xl border transition-all flex items-center justify-between shadow-xs ${
                scannedBloodBag
                  ? 'bg-emerald-50 border-emerald-300 text-slate-900'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700 font-bold text-lg">
                  🩸
                </div>
                <div>
                  <span className="text-xs font-bold block text-slate-900">
                    2. 혈액팩 라벨 스캔
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {scannedBloodBag
                      ? `혈액번호 ${bloodBagInfo.bloodBagNo} 일치`
                      : '혈액제제 2D 바코드 태깅 대기 중'}
                  </span>
                </div>
              </div>

              {!scannedBloodBag ? (
                <button
                  onClick={() => {
                    setScannedBloodBag(true);
                    if (!scannedPatient) {
                      setScannedPatient(true);
                    }
                    setTimeout(() => setCurrentStep(4), 600);
                  }}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs"
                >
                  스캔 실행
                </button>
              ) : (
                <span className="text-emerald-600 font-extrabold text-xs flex items-center space-x-1 bg-emerald-100 px-2.5 py-1 rounded-md">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>완료</span>
                </span>
              )}
            </div>

            {scannedPatient && scannedBloodBag && (
              <div className="bg-emerald-50 border-2 border-emerald-400 p-3.5 rounded-xl text-center text-emerald-950 font-extrabold space-y-1 animate-scale-up">
                <div className="flex items-center justify-center space-x-1.5 text-base text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>[5-Rights & Dual Match] 바코드 검증 성공</span>
                </div>
                <p className="text-[11px] font-medium text-emerald-800">
                  환자 및 수혈용 제제 일치성이 스마트 서버에서 최종 승인되었습니다.
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Pre-Transfusion Vitals */}
        {currentStep === 4 && (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex items-center space-x-3 text-amber-950">
              <HeartPulse className="w-7 h-7 text-amber-600 shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm text-amber-900">
                  STEP 4. 수혈 직전 Vital Signs 측정
                </h3>
                <p className="text-[11px] text-amber-700 font-medium">
                  수혈 시작 전 기저 활력징후(Baseline V/S)를 측정하여 부작용과 비교합니다.
                </p>
              </div>
            </div>

            {/* Vitals Form Inputs */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    혈압 (SBP / DBP)
                  </label>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      value={vitals.bpSys}
                      onChange={(e) =>
                        setVitals({ ...vitals, bpSys: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-center font-bold text-slate-900 text-xs focus:ring-1 focus:ring-rose-500"
                    />
                    <span className="text-slate-400 font-bold">/</span>
                    <input
                      type="number"
                      value={vitals.bpDia}
                      onChange={(e) =>
                        setVitals({ ...vitals, bpDia: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-center font-bold text-slate-900 text-xs focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    체온 (BT - ℃)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={vitals.bt}
                    onChange={(e) =>
                      setVitals({ ...vitals, bt: parseFloat(e.target.value) || 36.5 })
                    }
                    className={`w-full border rounded-lg p-2 text-center font-bold text-xs ${
                      vitals.bt >= 37.5
                        ? 'border-rose-400 text-rose-700 bg-rose-50'
                        : 'border-slate-300 bg-slate-50 text-emerald-700'
                    }`}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    심박수 (HR - bpm)
                  </label>
                  <input
                    type="number"
                    value={vitals.hr}
                    onChange={(e) =>
                      setVitals({ ...vitals, hr: parseInt(e.target.value) || 75 })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-center font-bold text-slate-900 text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    호흡수 (RR /min)
                  </label>
                  <input
                    type="number"
                    value={vitals.rr}
                    onChange={(e) =>
                      setVitals({ ...vitals, rr: parseInt(e.target.value) || 18 })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-center font-bold text-slate-900 text-xs"
                  />
                </div>
              </div>

              {/* BT High Alert Notice */}
              {vitals.bt >= 37.5 ? (
                <div className="bg-rose-50 border border-rose-300 p-3 rounded-lg flex items-center space-x-2 text-rose-900">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span className="text-[11px] font-bold">
                    경고: 수혈 전 체온이 37.5℃ 이상입니다. 담당의 보고 후 수혈 진행 여부를 재확인하세요.
                  </span>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-emerald-800 text-[11px] text-center font-bold">
                  ✓ 수혈 전 기저 활력징후 정상 범위 (발열 무)
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: Transfusion Active & 15min Reaction Monitoring */}
        {currentStep === 5 && (
          <div className="space-y-3.5 animate-fade-in text-center">
            {/* Header Banner */}
            <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl flex items-center space-x-3 text-rose-950 text-left">
              <Droplet className="w-7 h-7 text-rose-600 shrink-0 fill-current" />
              <div>
                <h3 className="font-extrabold text-sm text-rose-900">
                  STEP 5. 수혈 개시 및 부작용 관찰
                </h3>
                <p className="text-[11px] text-rose-700 font-medium">
                  최종 검증 완료된 수혈 제제를 환자 라인에 연결하고 수혈을 개시합니다.
                </p>
              </div>
            </div>

            {!isTransfusionStarted ? (
              /* Pre-Start Readiness Card */
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-left shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="font-extrabold text-xs text-slate-800 flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>수혈 준비 및 5-Rights 검증 완료</span>
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
                    준비 완료
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium block">수혈 제제</span>
                    <span className="font-extrabold text-slate-900">{bloodBagInfo.productName}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-medium block">혈액형 / 용량</span>
                    <span className="font-extrabold text-rose-700">{bloodBagInfo.bloodTypeBag} ({bloodBagInfo.volume})</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                  <span className="text-[10px] text-slate-500 font-medium block">기저 활력징후 (Baseline V/S)</span>
                  <span className="font-bold text-slate-800 font-mono">
                    BP {vitals.bpSys}/{vitals.bpDia} mmHg · BT {vitals.bt}℃ · HR {vitals.hr} bpm
                  </span>
                </div>

                <button
                  onClick={handleStartTransfusion}
                  className="w-full py-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black text-sm rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center space-x-2 mt-2"
                >
                  <Droplet className="w-5 h-5 fill-current animate-bounce" />
                  <span>수혈 시작 (Start Transfusion)</span>
                </button>
              </div>
            ) : (
              /* Transfusion Active Screen with Dripping Blood Animation & Timer */
              <div className="space-y-3">
                <style>{`
                  @keyframes bloodDrip {
                    0% { transform: translateY(0) scale(1); opacity: 1; }
                    70% { transform: translateY(30px) scale(0.85); opacity: 0.9; }
                    100% { transform: translateY(40px) scale(0.3); opacity: 0; }
                  }
                  .animate-drip-1 { animation: bloodDrip 1.2s infinite ease-in; }
                  .animate-drip-2 { animation: bloodDrip 1.2s infinite ease-in 0.4s; }
                  .animate-drip-3 { animation: bloodDrip 1.2s infinite ease-in 0.8s; }
                `}</style>

                <div className="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-white rounded-2xl p-4 shadow-xl space-y-4 border border-rose-900/50 relative overflow-hidden">
                  {/* Animated Blood Bag Graphic */}
                  <div className="flex flex-col items-center justify-center space-y-2 py-1">
                    <div className="relative">
                      {/* Bag Hanger Notch */}
                      <div className="w-8 h-2.5 bg-slate-700 rounded-t-md mx-auto border-b border-slate-600" />

                      {/* Blood Bag Body */}
                      <div className="w-36 bg-gradient-to-b from-rose-700 via-red-700 to-rose-900 border-2 border-rose-500/80 rounded-b-3xl rounded-t-lg p-2.5 shadow-2xl text-center space-y-1 relative">
                        <div className="absolute top-1.5 left-2 right-2 h-1 bg-rose-400/30 rounded-full animate-pulse" />
                        <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-mono font-normal block w-fit mx-auto" style={{ fontWeight: 'normal', fontSize: '12px' }}>
                          {bloodBagInfo.bloodBagNo}
                        </span>
                        <h4 className="font-normal text-sm text-white tracking-wide" style={{ fontWeight: 'normal', fontSize: '14px' }}>
                          {bloodBagInfo.productName}
                        </h4>
                        <div className="inline-block bg-white text-rose-900 text-[11px] font-black px-2 py-0.2 rounded-md shadow-xs">
                          혈액형 {bloodBagInfo.bloodTypeBag}
                        </div>
                      </div>

                      {/* IV Drip Chamber & Tube with Dripping Blood Droplets */}
                      <div className="flex flex-col items-center">
                        <div className="w-3.5 h-1.5 bg-slate-700" />
                        <div className="w-7 h-12 bg-slate-800/90 border border-slate-500/60 rounded-lg relative flex flex-col items-center justify-between p-1 backdrop-blur-xs">
                          <div className="w-2 h-1.5 bg-rose-600 rounded-b-xs" />
                          
                          {/* Animated Dripping Blood Drops */}
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-full h-8 overflow-hidden pointer-events-none flex justify-center">
                            <Droplet className="w-3 h-3 text-rose-500 fill-current absolute top-0 animate-drip-1" />
                            <Droplet className="w-3 h-3 text-rose-500 fill-current absolute top-0 animate-drip-2" />
                            <Droplet className="w-3 h-3 text-rose-500 fill-current absolute top-0 animate-drip-3" />
                          </div>

                          <div className="w-full h-2.5 bg-rose-700/80 rounded-b-md animate-pulse" />
                        </div>
                        <div className="w-1.5 h-5 bg-rose-600/70 animate-pulse rounded-full" />
                      </div>
                    </div>

                    <div className="text-center space-y-0.5">
                      <span className="inline-flex items-center space-x-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 px-3 py-0.5 rounded-full text-xs font-bold animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span>수혈 주입 진행 중 (Transfusion Active)</span>
                      </span>
                      <p className="text-[11px] text-slate-300 font-medium">
                        주입 속도: <strong className="text-rose-400 font-bold">{infusionRate} gtt/min</strong> (약 15분간 서서히)
                      </p>
                    </div>
                  </div>

                  {/* Elapsed Time Counter (하단 수혈 경과 시간 카운트) */}
                  <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-left shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs">
                        <Clock className="w-4 h-4 animate-spin" />
                        <span>수혈 경과 시간 (Elapsed Time)</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded font-mono font-bold">
                        ● 실시간 측정 중
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-xs text-slate-400 font-medium">수혈 경과 시간:</span>
                      <span className="text-2xl font-black font-mono text-rose-400 tracking-wider">
                        {formatElapsed(elapsedSeconds)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800/80 text-slate-400">
                      <div>
                        시작시각: <span className="font-mono text-slate-200 font-bold">{startTime}</span>
                      </div>
                      <div>
                        15분 점검 알림: <span className="text-indigo-300 font-bold">자동 등록됨</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 15-min Auto Reminder Scheduled */}
                <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex items-center space-x-3 text-left">
                  <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div>
                    <span className="font-bold text-xs text-indigo-950 block">
                      ⏰ 15분 후 수혈 부작용 점검 알림 자동 등록됨
                    </span>
                    <span className="text-[10.5px] text-indigo-700">
                      PDA 업무 리스트에 15분 후 V/S 및 부작용 점검 Task가 자동 생성되었습니다.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Actions Button Row */}
      <div className="bg-white p-3.5 border-t border-slate-200 flex items-center justify-between sticky bottom-0 z-10">
        {currentStep > 1 && currentStep < 5 ? (
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>이전</span>
          </button>
        ) : (
          <div />
        )}

        {currentStep === 1 && (
          <button
            disabled={!isVisualInspected}
            onClick={() => setCurrentStep(2)}
            className={`ml-auto px-5 py-3 rounded-xl font-extrabold text-xs text-white flex items-center space-x-1 shadow-sm transition-all ${
              isVisualInspected
                ? 'bg-rose-600 hover:bg-rose-700 active:scale-[0.98]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>2인 이중점검 단계로</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {currentStep === 2 && (
          <button
            disabled={!allDualChecked}
            onClick={() => {
              if (showNurseAuth) {
                handleAuthenticateNurse();
              } else {
                setShowNurseAuth(true);
              }
            }}
            className={`ml-auto px-5 py-3 rounded-xl font-extrabold text-xs text-white flex items-center space-x-1 shadow-sm transition-all ${
              allDualChecked
                ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>{showNurseAuth ? '2차 확인간호사 서명 승인' : '간호사 본인 인증 진행'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {currentStep === 3 && (
          <button
            disabled={!scannedPatient || !scannedBloodBag}
            onClick={() => setCurrentStep(4)}
            className={`ml-auto px-5 py-3 rounded-xl font-extrabold text-xs text-white flex items-center space-x-1 shadow-sm transition-all ${
              scannedPatient && scannedBloodBag
                ? 'bg-sky-600 hover:bg-sky-700 active:scale-[0.98]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>수혈 전 V/S 측정단계로</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {currentStep === 4 && (
          <button
            onClick={() => setCurrentStep(5)}
            className="ml-auto px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center space-x-1.5"
          >
            <span>수혈전 V/S 입력 완료 (수혈개시 화면 전개)</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {currentStep === 5 && (
          <button
            disabled={!isTransfusionStarted}
            onClick={handleFinishWorkflow}
            className={`w-full py-3.5 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 ${
              isTransfusionStarted
                ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            <FileCheck2 className="w-5 h-5" />
            <span>수혈 기록지 완료 및 EMR 전송</span>
          </button>
        )}
      </div>
    </div>
  );
};
