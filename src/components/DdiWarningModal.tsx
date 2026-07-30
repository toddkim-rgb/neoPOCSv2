import React, { useState } from 'react';
import { Patient } from '../types';
import { AlertOctagon, AlertTriangle, ShieldCheck, X, FileText } from 'lucide-react';

interface DdiWarningModalProps {
  patient: Patient;
  drugName: string;
  alerts: Array<{
    type: string;
    severityCd: 'CONTRAINDICATED' | 'SIGNIFICANT' | 'MINOR';
    withDrug: string;
    evidence: string;
    action: 'HARD_STOP' | 'WARN' | 'SUPPRESS';
  }>;
  onClose: () => void;
  onProceedWithOverride: () => void;
}

export const DdiWarningModal: React.FC<DdiWarningModalProps> = ({
  patient,
  drugName,
  alerts,
  onClose,
  onProceedWithOverride,
}) => {
  const [overrideReason, setOverrideReason] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isHardStop = alerts.some((a) => a.action === 'HARD_STOP' || a.severityCd === 'CONTRAINDICATED');

  const handleOverrideSubmit = () => {
    if (!overrideReason.trim()) {
      setErrorMsg('중증 금기 투약 오버라이드 사유를 입력하세요.');
      return;
    }
    onProceedWithOverride();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-scale-up">
        {/* Header */}
        <div
          className={`p-3.5 text-white flex items-center justify-between ${
            isHardStop ? 'bg-rose-700' : 'bg-amber-600'
          }`}
        >
          <div className="flex items-center space-x-2">
            <AlertOctagon className="w-6 h-6 text-white animate-pulse" />
            <div>
              <h3 className="font-bold text-base">
                {isHardStop ? '[MOD-DDI] 투약 금기 (Hard Stop)' : '[MOD-DDI] 약물상호작용 주의'}
              </h3>
              <p className="text-[11px] opacity-90">Drug Interaction & Allergy Safety Check</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:opacity-80">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Drug & Patient Summary */}
          <div className="bg-slate-100 p-2.5 rounded-xl text-xs space-y-1 border border-slate-200">
            <div className="flex justify-between font-bold text-slate-800">
              <span>환자: {patient.name} ({patient.roomBed})</span>
              <span className="text-slate-500">ID: {patient.id}</span>
            </div>
            <div className="font-bold text-blue-900 text-sm">시도 투약: {drugName}</div>
          </div>

          {/* Alerts List */}
          <div className="space-y-2.5">
            {alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  alert.severityCd === 'CONTRAINDICATED'
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center space-x-1">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>
                      {alert.type === 'ALLERGY' ? '알레르기 금기 충돌' : '약물상호작용 (DDI)'}
                    </span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      alert.severityCd === 'CONTRAINDICATED'
                        ? 'bg-rose-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {alert.severityCd}
                  </span>
                </div>
                <div className="font-bold text-sm text-slate-900">충돌 대상: {alert.withDrug}</div>
                <p className="leading-relaxed font-medium text-slate-800">{alert.evidence}</p>
              </div>
            ))}
          </div>

          {/* Hard Stop Form */}
          {isHardStop && !showForm && (
            <div className="bg-rose-100 p-3 rounded-xl border border-rose-300 text-xs text-rose-900 font-medium">
              ⚠️ 본 투약건은 환자의 중증 알레르기/금기 사항과 직결되어 투약이 기본 차단됩니다.
            </div>
          )}

          {showForm && (
            <div className="space-y-2 pt-1">
              <label className="block text-xs font-bold text-slate-800">
                금기 투약 진행 사유 (주치의 확인 및 사유 필수)
              </label>
              {errorMsg && <div className="text-xs text-rose-600 font-bold">{errorMsg}</div>}
              <select
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold"
              >
                <option value="">사유 선택...</option>
                <option value="주치의(김전문) 직접 유선 승인 및 모니터링 하 수행">
                  주치의(김전문) 직접 유선 승인 및 모니터링 하 수행
                </option>
                <option value="대체 약제 부재로 인한 불가피한 소량 투여">대체 약제 부재로 인한 불가피한 소량 투여</option>
                <option value="응급 처치 목적 (환자 동의)">응급 처치 목적 (환자 동의)</option>
              </select>
              <textarea
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="추가 사유 기재..."
                className="w-full p-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-2 pt-2">
            <button
              onClick={onClose}
              className="w-1/2 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100"
            >
              투약 중단 (취소)
            </button>

            {isHardStop ? (
              !showForm ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-1/2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-1"
                >
                  <FileText className="w-4 h-4" />
                  <span>예외 사유 작성 진행</span>
                </button>
              ) : (
                <button
                  onClick={handleOverrideSubmit}
                  className="w-1/2 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md flex items-center justify-center space-x-1"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>사유 기록 후 강제 진행</span>
                </button>
              )
            ) : (
              <button
                onClick={onProceedWithOverride}
                className="w-1/2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md flex items-center justify-center space-x-1"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>주의 확인 후 진행</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
