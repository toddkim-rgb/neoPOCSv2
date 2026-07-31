import React, { useState, useEffect } from 'react';
import { Patient, WorklistTask } from '../types';
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  ShieldAlert,
  Scan,
  Droplet,
  Barcode,
  Camera,
  Check,
  UserCheck,
  Info,
  Send,
  ArrowLeft,
} from 'lucide-react';

interface BloodSamplingViewProps {
  patient: Patient;
  task?: WorklistTask;
  onBack: () => void;
  onOpenScanner?: () => void;
  onCompleteSampling: (taskId?: string) => void;
}

export const BloodSamplingView: React.FC<BloodSamplingViewProps> = ({
  patient,
  task,
  onBack,
  onOpenScanner,
  onCompleteSampling,
}) => {
  // 5-step workflow state
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 2 State: Patient Wristband Barcode Scan
  const [isWristbandScanned, setIsWristbandScanned] = useState<boolean>(
    patient.isVerified ?? true
  );
  const [isScanningWristband, setIsScanningWristband] = useState<boolean>(false);

  // Step 3 State: Caution Alerts Checks
  const [cautionChecks, setCautionChecks] = useState({
    siteCheck: false, // 좌측 상지 채혈 금지 (우측 상지 채혈 확인)
    bleedingCheck: false, // 항응고제 복용 - 지혈 5분 압박 확인
    npoCheck: false, // 금식(NPO) 상태 확인
  });

  // Step 4 State: Tube Barcode Scans
  const [tubes, setTubes] = useState([
    {
      id: 'tube-1',
      name: 'EDTA Tube (보라색 Cap)',
      testType: 'Routine CBC, HbA1c, Diff count',
      code: 'TUBE-CBC-21212890-01',
      volume: '3.0 mL',
      color: 'bg-purple-600',
      badgeBg: 'bg-purple-100 text-purple-800 border-purple-300',
      scanned: false,
    },
    {
      id: 'tube-2',
      name: 'SST Gel Tube (노란색 Cap)',
      testType: 'LFT, Renal, Electrolyte, CRP',
      code: 'TUBE-SST-21212890-02',
      volume: '5.0 mL',
      color: 'bg-amber-500',
      badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
      scanned: false,
    },
    {
      id: 'tube-3',
      name: 'Sodium Citrate Tube (파란색 Cap)',
      testType: 'Coagulation PT/aPTT, Fibrinogen',
      code: 'TUBE-CIT-21212890-03',
      volume: '2.7 mL',
      color: 'bg-sky-500',
      badgeBg: 'bg-sky-100 text-sky-800 border-sky-300',
      scanned: false,
    },
  ]);
  const [isScanningTubes, setIsScanningTubes] = useState<boolean>(false);

  // Step 5 State: Sampling Execution & Logging
  const [samplingSite, setSamplingSite] = useState<string>('우측 정중정맥 (R. Median Cubital)');
  const [isMixed, setIsMixed] = useState<boolean>(true);
  const [executionTime, setExecutionTime] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  useEffect(() => {
    const now = new Date();
    const formatted = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(
      now.getDate()
    ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setExecutionTime(formatted);
  }, []);

  const allCautionsChecked = Object.values(cautionChecks).every(Boolean);
  const allTubesScanned = tubes.every((t) => t.scanned);

  // Scan patient wristband simulation
  const handleScanWristband = () => {
    if (onOpenScanner) {
      onOpenScanner();
    }
    setIsScanningWristband(true);
    setTimeout(() => {
      setIsScanningWristband(false);
      setIsWristbandScanned(true);
      patient.isVerified = true;
    }, 600);
  };

  // Scan single tube barcode
  const handleScanTube = (id: string) => {
    if (onOpenScanner) {
      onOpenScanner();
    }
    setTubes((prev) =>
      prev.map((t) => (t.id === id ? { ...t, scanned: true } : t))
    );
  };

  // Scan all tubes at once
  const handleScanAllTubes = () => {
    if (onOpenScanner) {
      onOpenScanner();
    }
    setIsScanningTubes(true);
    setTimeout(() => {
      setIsScanningTubes(false);
      setTubes((prev) => prev.map((t) => ({ ...t, scanned: true })));
    }, 700);
  };

  // Final Complete Handler
  const handleFinishSampling = () => {
    setIsCompleted(true);
    setTimeout(() => {
      onCompleteSampling(task?.id);
    }, 800);
  };

  const stepsList = [
    { num: 1, name: '채혈오더' },
    { num: 2, name: '팔찌촬영' },
    { num: 3, name: '주의확인' },
    { num: 4, name: '채혈관스캔' },
    { num: 5, name: '채혈시작' },
  ];

  return (
    <div className="p-3 bg-slate-100 min-h-[calc(100vh-140px)] pb-28 space-y-3 select-none animate-fade-in">
      {/* View Header with Back button */}
      <div className="bg-gradient-to-r from-red-800 via-rose-800 to-slate-900 text-white p-3.5 rounded-2xl shadow-md border border-rose-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={onBack}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Droplet className="w-5 h-5 text-rose-300 animate-pulse" />
            <h1 className="text-base font-black tracking-tight">
              임상 채혈 메인 워크플로우
            </h1>
          </div>
          <span className="text-[10px] bg-rose-950/80 text-rose-200 border border-rose-600 px-2.5 py-0.5 rounded-full font-bold">
            실시간 환자식별 연동
          </span>
        </div>

        {/* Stepper Progress Bar */}
        <div className="grid grid-cols-5 gap-1 pt-1">
          {stepsList.map((st) => {
            const isActive = currentStep === st.num;
            const isPast = currentStep > st.num;
            return (
              <div key={st.num} className="flex flex-col items-center">
                <div
                  className={`w-full h-1.5 rounded-full transition-all ${
                    isPast
                      ? 'bg-emerald-400'
                      : isActive
                      ? 'bg-yellow-300'
                      : 'bg-white/20'
                  }`}
                />
                <span
                  className={`text-[10px] mt-1 font-bold whitespace-nowrap ${
                    isActive
                      ? 'text-yellow-300'
                      : isPast
                      ? 'text-emerald-300'
                      : 'text-rose-200/70'
                  }`}
                >
                  {st.num}. {st.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>



      {/* WORKFLOW MAIN CONTENT AREA (Non-popup, embedded in main workspace) */}
      <div className="space-y-3">
        {/* STEP 1: 채혈 오더 확인 */}
        {currentStep === 1 && (
          <div className="space-y-3 animate-fade-in">
            {/* Order Info Card */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800">
                  📋 검사 처방 오더 (Lab Order)
                </span>
                <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full border border-rose-200">
                  응급 채혈 (STAT)
                </span>
              </div>

              <div className="text-xs space-y-2">
                <div className="flex justify-between text-slate-600">
                  <span>처방의사:</span>
                  <span className="font-bold text-slate-900">{patient.doctor}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>처방일시:</span>
                  <span className="font-mono text-slate-900 font-bold">2026.07.30 10:15</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>검토 목적:</span>
                  <span className="font-bold text-slate-900">POD:1 정기 검사 및 LFT/CBC F/U</span>
                </div>
              </div>

              {/* Required Tubes Breakdown */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="text-xs font-bold text-slate-700 block">
                  🧪 소요 채혈용기 ({tubes.length}개)
                </span>
                {tubes.map((tb) => (
                  <div
                    key={tb.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <span className={`w-3 h-8 rounded-full ${tb.color}`} />
                      <div>
                        <div className="font-bold text-slate-900">{tb.name}</div>
                        <div className="text-[10px] text-slate-500">{tb.testType}</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 text-[11px]">
                      {tb.volume}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setCurrentStep(2)}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white rounded-2xl font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <span>다음: 2단계 환자팔찌 촬영</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: 환자팔찌 촬영 / 스캔 */}
        {currentStep === 2 && (
          <div className="space-y-3 animate-fade-in">
            {/* Simulated Camera Viewfinder */}
            <div className="bg-slate-950 p-4 rounded-2xl border-2 border-slate-800 flex flex-col items-center justify-center relative overflow-hidden min-h-[200px]">
              {/* Viewfinder Corners */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-rose-500" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-rose-500" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-rose-500" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-rose-500" />

              {isWristbandScanned ? (
                <div className="text-center space-y-2 text-white animate-fade-in">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="text-base font-black text-emerald-300">
                    환자팔찌 인식 완료! (상단 환자정보 연동)
                  </div>
                  <div className="text-xs text-slate-300 font-mono bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700 inline-block">
                    {patient.name} ({patient.id}) · {patient.roomBed}
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-3 text-white">
                  <Barcode className="w-14 h-14 text-rose-400 mx-auto animate-pulse" />
                  <div className="text-xs text-slate-300">
                    환자의 손목 팔찌 바코드를 촬영하세요
                  </div>
                  <button
                    disabled={isScanningWristband}
                    onClick={handleScanWristband}
                    className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 flex items-center space-x-2 mx-auto cursor-pointer"
                  >
                    <Scan className="w-4 h-4" />
                    <span>{isScanningWristband ? '인식 중...' : '환자팔찌 촬영/스캔'}</span>
                  </button>
                </div>
              )}
            </div>



            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => setCurrentStep(1)}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-bold text-xs"
              >
                이전
              </button>
              <button
                disabled={!isWristbandScanned}
                onClick={() => setCurrentStep(3)}
                className={`flex-[2] py-3.5 rounded-2xl font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all ${
                  isWristbandScanned
                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>다음: 3단계 환자 주의정보 확인</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: 환자 주의정보 확인 */}
        {currentStep === 3 && (
          <div className="space-y-3 animate-fade-in">
            {/* Patient Caution Checklist */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center justify-between">
                <span>⚠️ 채혈 특이 주의사항 체크</span>
                <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-bold">
                  3개 필수 확인
                </span>
              </div>

              {/* Caution Item 1 */}
              <label
                onClick={() =>
                  setCautionChecks((prev) => ({ ...prev, siteCheck: !prev.siteCheck }))
                }
                className={`p-3 rounded-xl border text-xs cursor-pointer flex items-start space-x-3 transition-all ${
                  cautionChecks.siteCheck
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-rose-50/70 border-rose-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={cautionChecks.siteCheck}
                  onChange={() => {}}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                    <span className="text-rose-600">🚫 좌측 상지 채혈 금지</span>
                    <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">
                      A-V Shunt
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    좌측 팔 동정맥루 이력. **우측 상지(Right Arm)**에서만 채혈 진행하세요.
                  </div>
                </div>
              </label>

              {/* Caution Item 2 */}
              <label
                onClick={() =>
                  setCautionChecks((prev) => ({
                    ...prev,
                    bleedingCheck: !prev.bleedingCheck,
                  }))
                }
                className={`p-3 rounded-xl border text-xs cursor-pointer flex items-start space-x-3 transition-all ${
                  cautionChecks.bleedingCheck
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={cautionChecks.bleedingCheck}
                  onChange={() => {}}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                    <span className="text-amber-700">🩸 출혈 경향 주의 (와파린)</span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                      INR 3.2
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    와파린 복용 중. 채혈 후 **최소 5분 이상 직접 압박 지혈**하세요.
                  </div>
                </div>
              </label>

              {/* Caution Item 3 */}
              <label
                onClick={() =>
                  setCautionChecks((prev) => ({ ...prev, npoCheck: !prev.npoCheck }))
                }
                className={`p-3 rounded-xl border text-xs cursor-pointer flex items-start space-x-3 transition-all ${
                  cautionChecks.npoCheck
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={cautionChecks.npoCheck}
                  onChange={() => {}}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    🍽️ NPO (금식) 상태 및 수분 섭취 확인
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    자정 이후 금식 유지 상태를 확인했습니다.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => setCurrentStep(2)}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-bold text-xs"
              >
                이전
              </button>
              <button
                disabled={!allCautionsChecked}
                onClick={() => setCurrentStep(4)}
                className={`flex-[2] py-3.5 rounded-2xl font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all ${
                  allCautionsChecked
                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>다음: 4단계 채혈관 바코드 촬영</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: 상단 환자정보 유지 상태에서 채혈관 바코드 촬영 */}
        {currentStep === 4 && (
          <div className="space-y-3 animate-fade-in">
            {/* Tubes Matching List */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800">
                  🧪 채혈관 바코드 매칭 (Tube Verification)
                </span>
                <button
                  onClick={handleScanAllTubes}
                  disabled={isScanningTubes || allTubesScanned}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg font-bold shadow-2xs flex items-center space-x-1 cursor-pointer"
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>{isScanningTubes ? '전체 촬영 중...' : '전체 일괄 촬영'}</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {tubes.map((tube) => (
                  <div
                    key={tube.id}
                    className={`p-3 rounded-2xl border text-xs space-y-2 transition-all ${
                      tube.scanned
                        ? 'bg-emerald-50/80 border-emerald-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`w-3.5 h-9 rounded-full ${tube.color}`} />
                        <div>
                          <div className="font-bold text-slate-900">{tube.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {tube.code}
                          </div>
                        </div>
                      </div>

                      {tube.scanned ? (
                        <span className="bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center space-x-1 shadow-2xs">
                          <Check className="w-3.5 h-3.5" />
                          <span>촬영 완료</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleScanTube(tube.id)}
                          className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>바코드 촬영</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 text-slate-600">
                      <span>검사명: <span className="font-bold text-slate-800">{tube.testType}</span></span>
                      <span className="font-mono">{tube.volume}</span>
                    </div>
                  </div>
                ))}
              </div>

              {allTubesScanned && (
                <div className="p-3 bg-emerald-100/80 border border-emerald-300 rounded-xl text-emerald-900 font-bold text-xs flex items-center space-x-2 animate-fade-in">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>모든 채혈관 바코드가 상단 환자 정보({patient.name})와 100% 매칭되었습니다!</span>
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => setCurrentStep(3)}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-bold text-xs"
              >
                이전
              </button>
              <button
                disabled={!allTubesScanned}
                onClick={() => setCurrentStep(5)}
                className={`flex-[2] py-3.5 rounded-2xl font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all ${
                  allTubesScanned
                    ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>다음: 5단계 채혈 시작 및 기록</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: 채혈 시작 및 수행 완료 기록 */}
        {currentStep === 5 && (
          <div className="space-y-3 animate-fade-in">
            {/* Execution Summary Details */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800">
                  ✍️ 채혈 실행 기록 (Execution Log)
                </span>
                <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {executionTime}
                </span>
              </div>

              {/* Site Choice */}
              <div className="space-y-1 text-xs">
                <label className="font-bold text-slate-700 block">
                  채혈 천자 부위 (Site):
                </label>
                <select
                  value={samplingSite}
                  onChange={(e) => setSamplingSite(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 text-xs"
                >
                  <option value="우측 정중정맥 (R. Median Cubital)">
                    우측 정중정맥 (R. Median Cubital) - 권장
                  </option>
                  <option value="우측 요골정맥 (R. Radial Vein)">
                    우측 요골정맥 (R. Radial Vein)
                  </option>
                  <option value="우측 두부정맥 (R. Cephalic Vein)">
                    우측 두부정맥 (R. Cephalic Vein)
                  </option>
                </select>
                <p className="text-[10px] text-rose-600 font-semibold pt-0.5">
                  * 주의: 좌측 상지 채혈 금지 규칙 적용됨
                </p>
              </div>

              {/* Anti-coagulant mixing confirmation */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>항응고제 채혈관 転倒 믹싱 (8-10회)</span>
                  <input
                    type="checkbox"
                    checked={isMixed}
                    onChange={(e) => setIsMixed(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                </div>
                <div className="text-[11px] text-slate-600">
                  EDTA/Citrate 관을 완만하게 8~10회 흔들어 혈액 응고를 방지했습니다.
                </div>
              </div>

              {/* Performer Nurse */}
              <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100">
                <span className="text-slate-600 font-semibold">채혈 담당간호사:</span>
                <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                  이수진 N (N2341)
                </span>
              </div>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => setCurrentStep(4)}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-bold text-xs"
              >
                이전
              </button>
              <button
                disabled={isCompleted}
                onClick={handleFinishSampling}
                className="flex-[2] py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-xs shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    <span>채혈 완료 기록 중...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>채혈 시작 및 완료 기록 저장</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
