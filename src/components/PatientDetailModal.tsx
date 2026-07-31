import React, { useState } from 'react';
import { Patient, Prescription, WorklistTask } from '../types';
import { ChevronLeft, Mic, Camera, Menu, RotateCcw, AlertTriangle, Pill, ShieldAlert, CheckSquare, Square, Star, Activity, Syringe, Droplets, HeartPulse } from 'lucide-react';
import { getPatientBadges } from '../utils/patientTaskUtils';

interface PatientDetailModalProps {
  patient: Patient;
  hasHamRx?: boolean;
  prescriptions?: Prescription[];
  tasks?: WorklistTask[];
  onClose: () => void;
  onProceedToMedication: (patient: Patient) => void;
  onProceedToVitals?: (patient: Patient) => void;
  onProceedToBloodSampling?: (patient: Patient) => void;
  onProceedToTransfusion?: (patient: Patient) => void;
  onResetPatient?: () => void;
  onOpenScanner?: () => void;
}

export const PatientDetailModal: React.FC<PatientDetailModalProps> = ({
  patient,
  hasHamRx = false,
  prescriptions = [],
  tasks = [],
  onClose,
  onProceedToMedication,
  onProceedToVitals,
  onProceedToBloodSampling,
  onProceedToTransfusion,
  onResetPatient,
  onOpenScanner,
}) => {
  const [isChecked, setIsChecked] = useState<boolean>(true);

  // Compute patient tasks/badges using standard utility
  const { hasMedication, hasVs, hasBlood, hasTransfusion } = getPatientBadges(
    patient,
    prescriptions,
    tasks
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-center items-start overflow-y-auto">
      <div className="bg-white w-full max-w-md min-h-screen flex flex-col shadow-2xl animate-fade-in">
        {/* Top Teal Gradient Header matching Screenshot #2 */}
        <div className="bg-gradient-to-b from-[#0284C7] to-[#0D9488] text-white p-3.5 rounded-b-2xl shadow-lg relative">
          {/* Top Bar Icons */}
          <div className="flex items-center justify-between text-white mb-2">
            <button onClick={onClose} className="flex items-center space-x-1 font-bold text-base hover:opacity-80">
              <ChevronLeft className="w-6 h-6" />
              <span>환자정보</span>
            </button>
            <div className="flex items-center space-x-3">
              <Mic className="w-5 h-5 cursor-pointer hover:opacity-80" />
              <Camera
                onClick={onOpenScanner}
                className="w-5 h-5 cursor-pointer hover:opacity-80 hover:scale-110 transition-transform"
                title="팔찌/약품 바코드 촬영"
              />
              <Menu className="w-5 h-5 cursor-pointer hover:opacity-80" />
            </div>
          </div>

          {/* Location & Status Pills */}
          <div className="flex items-center space-x-2 text-xs font-semibold text-sky-100 mb-1">
            <span className="bg-white/20 px-2 py-0.5 rounded text-[11px] font-bold">입원</span>
            <span>{patient.hdPod || 'HD:5 / POD:4'}</span>
            <span className="ml-auto">{patient.ward} {patient.roomBed}</span>
          </div>

          {/* Main Patient Name Block */}
          <div className="flex items-start justify-between mt-1">
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-2xl font-normal text-yellow-300 tracking-tight" style={{ fontWeight: 'normal' }}>{patient.name}</h2>
                <span className="text-xs font-normal text-white" style={{ fontWeight: 'normal' }}>{patient.gender}/{patient.age}세/{patient.bloodType}</span>
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                {patient.isVerified ? (
                  <span className="bg-yellow-300 text-slate-900 text-xs font-black px-2 py-0.5 rounded-full shadow-xs shrink-0">
                    환자 확인 됨
                  </span>
                ) : (
                  <span className="bg-rose-500 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-xs shrink-0">
                    팔찌 미인식
                  </span>
                )}
              </div>
            </div>

            {/* Reset Button */}
            <button
              onClick={() => {
                if (onResetPatient) {
                  onResetPatient();
                } else {
                  onClose();
                }
              }}
              className="bg-blue-800/60 hover:bg-blue-800/80 active:scale-95 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg flex flex-col items-center justify-center space-y-0.5 border border-white/20 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>환자 초기화</span>
            </button>
          </div>

          {/* Patient Reg No & Info Line */}
          <div className="mt-2 text-[11px] text-sky-100 font-mono flex items-center space-x-3 border-t border-white/10 pt-2">
            <span>{patient.id}</span>
            <span>{patient.birthDate}</span>
            <span>{patient.doctor}</span>
          </div>

          {/* 3 Caution Icon Badges Row matching Screenshot #2 */}
          <div className="flex items-center space-x-2 mt-3">
            <div className="bg-yellow-300 text-slate-900 p-2 rounded-lg flex items-center justify-center">
              <Pill className="w-5 h-5" />
            </div>
            <div className="bg-yellow-300 text-slate-900 p-2 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="bg-yellow-300 text-slate-900 p-2 rounded-lg flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Caution Title matching Screenshot #2 */}
        <div className="p-4 flex-1">
          <div className="flex items-center justify-center space-x-2 my-2 text-slate-800">
            <span className="w-7 h-7 rounded-full bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 font-bold text-lg shadow-xs">
              !
            </span>
            <h3 className="text-lg font-bold tracking-tight">환자 주의정보 확인</h3>
          </div>

          <hr className="border-slate-200 my-3" />

          {/* Alert Cards Container matching Screenshot #2 */}
          <div className="space-y-3">
            {/* 1. 약물 이상반응 (ADR) Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex overflow-hidden">
              <div className="bg-lime-400 text-slate-900 w-20 flex flex-col items-center justify-center p-2 font-bold text-xs text-center leading-tight border-r border-lime-500">
                <Pill className="w-6 h-6 mb-1 text-slate-900" />
                <span>약물반응</span>
              </div>
              <div className="p-3 flex-1 text-xs">
                <h4 className="font-bold text-slate-900 text-sm mb-1">약물 이상반응(ADR)</h4>
                <p className="text-slate-800 font-medium">와파린 — 출혈 경향 모니터링 필요</p>
                <p className="text-slate-500 mt-0.5">INR 목표 2.0-3.0 · 최근 INR 3.2</p>
              </div>
            </div>

            {/* 2. 알러지 경고 Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex overflow-hidden">
              <div className="bg-cyan-400 text-slate-900 w-20 flex flex-col items-center justify-center p-2 font-bold text-xs text-center leading-tight border-r border-cyan-500">
                <AlertTriangle className="w-6 h-6 mb-1 text-slate-900" />
                <span>알러지</span>
              </div>
              <div className="p-3 flex-1 text-xs">
                <h4 className="font-bold text-slate-900 text-sm mb-1">알러지 경고</h4>
                <p className="text-slate-800 font-medium">아스피린 — 위장관 출혈 이력 (2022)</p>
                <p className="text-slate-500 mt-0.5">NSAIDs 계열 전체 투약 금지</p>
              </div>
            </div>

            {/* 3. 비말 및 공기 주의 Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex overflow-hidden">
              <div className="bg-pink-500 text-white w-20 flex flex-col items-center justify-center p-2 font-bold text-xs text-center leading-tight border-r border-pink-600">
                <ShieldAlert className="w-6 h-6 mb-1 text-white" />
                <span>교차감염</span>
              </div>
              <div className="p-3 flex-1 text-xs">
                <h4 className="font-bold text-slate-900 text-sm mb-1">비말 및 공기 주의</h4>
                <p className="text-slate-800 font-medium leading-relaxed">
                  전실에서 N95 마스크(또는 밀착형 호흡보호구)를 밀착 검사(Fit test) 후 착용
                </p>
              </div>
            </div>
          </div>

          <div className="my-8 border-b border-slate-200" />

          {/* Confirmation Checkbox matching Screenshot #2 */}
          <div
            onClick={() => setIsChecked(!isChecked)}
            className="flex items-center justify-center space-x-2 cursor-pointer select-none py-2"
          >
            {isChecked ? (
              <CheckSquare className="w-6 h-6 text-blue-600 fill-blue-100" />
            ) : (
              <Square className="w-6 h-6 text-slate-400" />
            )}
            <span className="text-sm font-bold text-slate-800">위 주의정보를 확인하였습니다</span>
          </div>

          {/* Action Task Selection Bar */}
          <div className="mt-4 space-y-2.5">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between mb-1">
                <span className="flex items-center space-x-1">
                  <span className="text-emerald-600 font-extrabold">✓ 환자식별 확인:</span>
                  <span className="text-slate-900 font-black">{patient.name}님</span>
                </span>
                <span className="text-[11px] text-slate-500">{patient.roomBed}</span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium">
                수행할 업무(뱃지)를 선택하면 해당 업무 검증 화면으로 이동합니다:
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {hasMedication && (
                <button
                  disabled={!isChecked}
                  onClick={() => onProceedToMedication(patient)}
                  className={`p-3 rounded-xl font-bold text-xs flex items-center space-x-2.5 shadow-md transition-all text-left cursor-pointer ${
                    isChecked
                      ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Syringe className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="text-sm font-extrabold">투약 수행</div>
                    <div className="text-[10px] opacity-90 font-normal">
                      {hasHamRx ? '5 Rights & HAM 고위험약물 이중확인' : '5 Rights 약품 투약 검증'}
                    </div>
                  </div>
                </button>
              )}

              {hasVs && (
                <button
                  disabled={!isChecked}
                  onClick={() => {
                    if (onProceedToVitals) onProceedToVitals(patient);
                  }}
                  className={`p-3 rounded-xl font-bold text-xs flex items-center space-x-2.5 shadow-md transition-all text-left cursor-pointer ${
                    isChecked
                      ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Activity className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="text-sm font-extrabold">VS 측정 (생체징후)</div>
                    <div className="text-[10px] opacity-90 font-normal">혈압 / 체온 / 맥박 / SpO2 측정</div>
                  </div>
                </button>
              )}

              {hasBlood && (
                <button
                  disabled={!isChecked}
                  onClick={() => {
                    if (onProceedToBloodSampling) onProceedToBloodSampling(patient);
                  }}
                  className={`p-3 rounded-xl font-bold text-xs flex items-center space-x-2.5 shadow-md transition-all text-left cursor-pointer ${
                    isChecked
                      ? 'bg-pink-600 hover:bg-pink-700 active:scale-95 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Droplets className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="text-sm font-extrabold">채혈 수행</div>
                    <div className="text-[10px] opacity-90 font-normal">채혈 용기 라벨 & 바코드 스캔</div>
                  </div>
                </button>
              )}

              {hasTransfusion && (
                <button
                  disabled={!isChecked}
                  onClick={() => {
                    if (onProceedToTransfusion) onProceedToTransfusion(patient);
                  }}
                  className={`p-3 rounded-xl font-bold text-xs flex items-center space-x-2.5 shadow-md transition-all text-left cursor-pointer ${
                    isChecked
                      ? 'bg-rose-600 hover:bg-rose-700 active:scale-95 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <HeartPulse className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="text-sm font-extrabold">수혈 수행</div>
                    <div className="text-[10px] opacity-90 font-normal">혈액제제 확인 & 2인 이중교대</div>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
