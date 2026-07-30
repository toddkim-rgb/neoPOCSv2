import React, { useState } from 'react';
import { Prescription, Patient } from '../types';
import { ShieldAlert, CheckCircle2, UserCheck, AlertTriangle, X, Lock, Send } from 'lucide-react';

interface HamDoubleCheckModalProps {
  patient: Patient;
  prescription: Prescription;
  onClose: () => void;
  onCompleteSuccess: () => void;
}

export const HamDoubleCheckModal: React.FC<HamDoubleCheckModalProps> = ({
  patient,
  prescription,
  onClose,
  onCompleteSuccess,
}) => {
  const [step, setStep] = useState<'ANOMALY_REVIEW' | 'SECOND_NURSE_BLIND' | 'SOLO_OVERRIDE' | 'COMPLETE'>('ANOMALY_REVIEW');
  const [secondNurseId, setSecondNurseId] = useState('N3302');
  const [secondNurseName, setSecondNurseName] = useState('박미경 N');
  const [secondInputDose, setSecondInputDose] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Handle 2nd nurse verification submission
  const handleVerify2ndNurse = async () => {
    setErrorMessage(null);
    if (!secondNurseId || !secondInputDose) {
      setErrorMessage('2차 간호사 사번과 용량을 입력해주세요.');
      return;
    }

    if (secondNurseId === 'N2341') {
      setErrorMessage('1차 간호사와 동일한 ID로 2차 인증을 진행할 수 없습니다. (독립성 보장)');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/medication/double-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prescriptionId: prescription.id,
          firstNurseId: 'N2341',
          secondNurseId,
          verifiedDose: parseFloat(secondInputDose),
          isSoloOverride: false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.message || '2차 인증 실패: 용량 불일치 또는 사번 오류');
      } else {
        setStep('COMPLETE');
      }
    } catch (err) {
      setErrorMessage('서버 연동 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Solo/Night shift escape path
  const handleSoloOverride = async () => {
    if (!overrideReason.trim()) {
      setErrorMessage('야간/1인 근무 예외 진행 사유를 입력하세요.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/medication/double-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prescriptionId: prescription.id,
          firstNurseId: 'N2341',
          isSoloOverride: true,
          overrideReason,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStep('COMPLETE');
      }
    } catch (err) {
      setErrorMessage('예외 사유 기록 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-scale-up">
        {/* Modal Header */}
        <div className="bg-rose-700 text-white p-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-6 h-6 text-yellow-300" />
            <div>
              <h3 className="font-bold text-base tracking-tight">[MOD-HAM] 고위험 약물 이중확인</h3>
              <p className="text-[11px] text-rose-100">High-Alert Medication 2-Gate Blind Double Check</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Drug & Patient Summary Banner */}
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs">
            <div className="flex justify-between font-bold text-rose-900 border-b border-rose-200 pb-1 mb-1.5">
              <span>{patient.name} ({patient.roomBed})</span>
              <span className="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">
                HAM {prescription.hamCategory || 'INSULIN'}
              </span>
            </div>
            <div className="font-semibold text-slate-800 text-sm">{prescription.drugName}</div>
            <div className="text-slate-600 mt-0.5 flex space-x-3">
              <span>처방용량: <strong>{prescription.orderedDose} {prescription.unit}</strong></span>
              <span>투여경로: <strong>{prescription.route}</strong></span>
            </div>
          </div>

          {errorMessage && (
            <div className="bg-rose-100 border border-rose-300 text-rose-800 text-xs p-2.5 rounded-lg flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: AI Anomaly Review */}
          {step === 'ANOMALY_REVIEW' && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs">
                <div className="flex items-center space-x-1.5 font-bold text-amber-900 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>AI 용량/투여속도 이상치 진단결과</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  {prescription.anomalyMessage || '환자의 체중(68kg) 및 신기능(CrCl 45mL/min) 대비 상한 용량에 근접합니다. 투약 전 2차 간호사의 블라인드 이중확인을 거쳐야 합니다.'}
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="text-slate-500 font-semibold">1차 작성자 (인증됨)</div>
                <div className="text-slate-800 font-bold">이수진 N (사번: N2341 / 책임간호사)</div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  onClick={() => setStep('SOLO_OVERRIDE')}
                  className="w-1/3 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  야간/1인 예외
                </button>
                <button
                  onClick={() => setStep('SECOND_NURSE_BLIND')}
                  className="w-2/3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md flex items-center justify-center space-x-1"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>2차 간호사 독립 인증 시작</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: 2nd Nurse Blind Verification */}
          {step === 'SECOND_NURSE_BLIND' && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs">
                <div className="flex items-center space-x-1 text-blue-900 font-bold mb-1">
                  <Lock className="w-4 h-4 text-blue-600" />
                  <span>독립 블라인드 이중확인 (Gate 2)</span>
                </div>
                <p className="text-slate-600">
                  1차 작성자의 입력값은 가려져 있습니다. 2차 검증 간호사가 처방전 상의 정확한 용량을 직접 입력하세요.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">2차 검증 간호사 사번 / 이름</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={secondNurseId}
                      onChange={(e) => setSecondNurseId(e.target.value)}
                      placeholder="사번 입력 (예: N3302)"
                      className="w-1/2 p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                    />
                    <input
                      type="text"
                      value={secondNurseName}
                      onChange={(e) => setSecondNurseName(e.target.value)}
                      placeholder="이름 (예: 박미경 N)"
                      className="w-1/2 p-2 border border-slate-300 rounded-lg text-xs font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    독립 확인 투약 용량 ({prescription.unit})
                  </label>
                  <input
                    type="number"
                    value={secondInputDose}
                    onChange={(e) => setSecondInputDose(e.target.value)}
                    placeholder={`처방 확인 용량 입력 (예: ${prescription.orderedDose})`}
                    className="w-full p-2.5 border-2 border-indigo-400 rounded-lg text-sm font-bold text-indigo-900"
                  />
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  onClick={() => setStep('ANOMALY_REVIEW')}
                  className="w-1/3 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold"
                >
                  이전
                </button>
                <button
                  disabled={isLoading}
                  onClick={handleVerify2ndNurse}
                  className="w-2/3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md flex items-center justify-center space-x-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>2차 서명 및 일치 대조</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Solo/Night Shift Escape Override Path */}
          {step === 'SOLO_OVERRIDE' && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs">
                <div className="font-bold text-amber-900 mb-1">야간/1인 근무 예외 진행 사유 입력</div>
                <p className="text-slate-600">
                  2차 간호사 현장 부재 시 사유를 기록하고 진행합니다. 본 이력은 수간호사 및 책임자에게 즉시 푸시 알림됩니다.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">진행 사유 선택/입력</label>
                <select
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold mb-2"
                >
                  <option value="">사유를 선택하세요</option>
                  <option value="야간 1인 간호사 단독 전담 근무">야간 1인 간호사 단독 전담 근무</option>
                  <option value="응급 투약 상황 (시간 임박)">응급 투약 상황 (시간 임박)</option>
                  <option value="2차 동료 간호사 격리실 처치 중">2차 동료 간호사 격리실 처치 중</option>
                </select>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="상세 사유 추가 입력..."
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  onClick={() => setStep('ANOMALY_REVIEW')}
                  className="w-1/3 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold"
                >
                  취소
                </button>
                <button
                  disabled={isLoading}
                  onClick={handleSoloOverride}
                  className="w-2/3 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md flex items-center justify-center space-x-1"
                >
                  <Send className="w-4 h-4" />
                  <span>사유 기록 + 책임자 알림 진행</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Complete */}
          {step === 'COMPLETE' && (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">HAM 고위험약물 이중확인 완료!</h4>
              <p className="text-xs text-slate-600 max-w-xs mx-auto">
                1차(이수진 N) / 2차({secondNurseName || '예외 기록'}) 서명 및 투약 감사 로그가 양측 기록되었습니다.
              </p>
              <button
                onClick={() => {
                  onCompleteSuccess();
                  onClose();
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700"
              >
                투약 확정 완료
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
