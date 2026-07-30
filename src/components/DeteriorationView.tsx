import React, { useState } from 'react';
import { Patient, DeteriorationPrediction } from '../types';
import { AlertCircle, Activity, PhoneCall, CheckCircle2, TrendingUp, ShieldAlert, Sparkles } from 'lucide-react';

interface DeteriorationViewProps {
  patients: Patient[];
  predictions: DeteriorationPrediction[];
  onTriggerRrtCall: (patientId: string) => void;
}

export const DeteriorationView: React.FC<DeteriorationViewProps> = ({
  patients,
  predictions,
  onTriggerRrtCall,
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>('21212457'); // 김철수
  const [localPreds, setLocalPreds] = useState<DeteriorationPrediction[]>(predictions);
  const [callingRrt, setCallingRrt] = useState(false);

  const currentPred = localPreds.find((p) => p.patientId === selectedPatientId) || localPreds[0];
  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  const handleCallRrt = async () => {
    setCallingRrt(true);
    try {
      const res = await fetch('/api/v1/prediction/rrt-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: selectedPatientId, nurseId: 'N2341' }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalPreds((prev) =>
          prev.map((p) =>
            p.patientId === selectedPatientId
              ? {
                  ...p,
                  rrtCalled: true,
                  rrtCalledAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
                }
              : p
          )
        );
        onTriggerRrtCall(selectedPatientId);
      }
    } catch (err) {
      console.error('RRT call error:', err);
    } finally {
      setCallingRrt(false);
    }
  };

  return (
    <div className="p-3 bg-slate-100 min-h-[calc(100vh-140px)] pb-24 space-y-3">
      {/* Module Title Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-rose-950 text-white p-3.5 rounded-2xl shadow-md border border-rose-800">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-rose-300">
            <Activity className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>[MOD-PRED] 패혈증 · 급성악화 AI 조기 예측</span>
          </div>
          <span className="text-[10px] text-amber-300 bg-amber-950/80 border border-amber-600 px-2 py-0.5 rounded-full font-bold">
            Phase 3 SaMD AI
          </span>
        </div>
        <p className="text-xs text-slate-200 leading-relaxed">
          연속 V/S 바이탈 추세와 Lab 패턴을 다변수 시계열 ML로 감시하여 급성 악화 수시간 전 조기 경고를 제공합니다.
        </p>
      </div>

      {/* Patient Picker */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">모니터링 환자:</span>
        <select
          value={selectedPatientId}
          onChange={(e) => setSelectedPatientId(e.target.value)}
          className="p-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
        >
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.roomBed})
            </option>
          ))}
        </select>
      </div>

      {/* Risk Score Meter Gauge Card */}
      {currentPred && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-base font-black text-slate-900">{currentPred.patientName} 환자 악화 위험도</h3>
              <p className="text-xs text-slate-500">{currentPred.roomBed} · NEWS2/EWS 연동</p>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-black shadow-xs ${
                currentPred.level === 'CRITICAL'
                  ? 'bg-rose-600 text-white animate-pulse'
                  : currentPred.level === 'ELEVATED'
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {currentPred.level === 'CRITICAL'
                ? '🚨 고위험 (CRITICAL)'
                : currentPred.level === 'ELEVATED'
                ? '⚠️ 주의 (ELEVATED)'
                : '✅ 정상 (NORMAL)'}
            </span>
          </div>

          {/* Meter Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-extrabold text-slate-700">
              <span>급성 악화 / 패혈증 조기 스코어</span>
              <span className="text-rose-600 text-base font-black font-mono">{currentPred.riskScore}점 / 100</span>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  currentPred.riskScore >= 80
                    ? 'bg-gradient-to-r from-amber-500 to-rose-600'
                    : currentPred.riskScore >= 50
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${currentPred.riskScore}%` }}
              />
            </div>
          </div>

          {/* Vital Trend Mini Chart */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="font-bold text-slate-800 flex items-center space-x-1">
              <TrendingUp className="w-4 h-4 text-rose-600" />
              <span>심박수 (HR) 시계열 추세 (bpm)</span>
            </div>
            <div className="flex items-end justify-between h-14 pt-2 px-2 border-b border-slate-200 pb-1">
              {currentPred.hrTrend.map((val, idx) => (
                <div key={idx} className="flex flex-col items-center space-y-1">
                  <span className="text-[10px] font-bold text-rose-700">{val}</span>
                  <div
                    className="w-4 bg-rose-500/80 rounded-t-sm"
                    style={{ height: `${(val - 60) * 1.2}px` }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Contributing Factors Breakdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-1">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>AI 위험 기여 인자 분석</span>
            </h4>
            <div className="space-y-1.5">
              {currentPred.topFactors.map((factor, idx) => (
                <div
                  key={idx}
                  className="p-2 bg-rose-50 border border-rose-200 text-rose-900 text-xs rounded-lg font-medium flex items-center space-x-2"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-600 flex-shrink-0" />
                  <span>{factor}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rapid Response Team (RRT) Call Action */}
          <div className="pt-2 border-t border-slate-100">
            {currentPred.rrtCalled ? (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-bold flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div>
                    <div>신속대응팀(RRT) 호출 발송 완료</div>
                    <div className="text-[10px] text-emerald-700 font-normal">
                      시각: {currentPred.rrtCalledAt} · 당직의(김전문) 수신됨
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button
                disabled={callingRrt}
                onClick={handleCallRrt}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white rounded-xl font-bold text-xs shadow-lg flex items-center justify-center space-x-2 transition-all"
              >
                <PhoneCall className="w-4 h-4 animate-bounce" />
                <span>신속대응팀(RRT) 즉시 호출 (Emergency Escalation)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
