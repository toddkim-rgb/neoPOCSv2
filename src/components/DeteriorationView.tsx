import React, { useState, useMemo } from 'react';
import { Patient, DeteriorationPrediction } from '../types';
import {
  Activity,
  PhoneCall,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldAlert,
  ArrowUpDown,
  User,
  Heart,
  Thermometer,
  Wind
} from 'lucide-react';

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
  // Sort predictions by riskScore descending
  const sortedPredictions = useMemo(() => {
    return [...predictions].sort((a, b) => b.riskScore - a.riskScore);
  }, [predictions]);

  // Track selected patient ID (defaults to empty so all cards start collapsed)
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');

  const [localPreds, setLocalPreds] = useState<DeteriorationPrediction[]>(predictions);
  const [callingRrt, setCallingRrt] = useState(false);

  // Sync predictions if parent updates
  React.useEffect(() => {
    setLocalPreds(predictions);
  }, [predictions]);

  const handleCallRrt = async (patientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCallingRrt(true);
    try {
      const res = await fetch('/api/v1/prediction/rrt-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, nurseId: 'N2341' }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalPreds((prev) =>
          prev.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  rrtCalled: true,
                  rrtCalledAt: new Date().toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }
              : p
          )
        );
        onTriggerRrtCall(patientId);
      }
    } catch (err) {
      console.error('RRT call error:', err);
    } finally {
      setCallingRrt(false);
    }
  };

  // Count risk levels
  const criticalCount = localPreds.filter((p) => p.level === 'CRITICAL').length;
  const elevatedCount = localPreds.filter((p) => p.level === 'ELEVATED').length;
  const normalCount = localPreds.filter((p) => p.level === 'NORMAL').length;

  return (
    <div className="p-3 bg-slate-100 min-h-[calc(100vh-140px)] pb-28 space-y-3">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white p-3.5 rounded-2xl shadow-md border border-rose-800/80">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-rose-300">
            <Activity className="w-4 h-4 text-rose-400 animate-pulse" />
            <span>[MOD-PRED] 패혈증 · 급성악화 AI 조기 예측</span>
          </div>
          <span className="text-[10px] text-amber-300 bg-amber-950/80 border border-amber-600 px-2 py-0.5 rounded-full font-bold">
            Phase 3 SaMD AI
          </span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
          다변수 시계열 ML 알고리즘이 환자의 V/S 및 Lab 추세를 감시하여 스코어 순으로 환자를 정렬합니다.
        </p>

        {/* Risk Level Counter Pills */}
        <div className="flex items-center space-x-2 text-[11px] font-bold">
          <span className="bg-rose-900/80 text-rose-200 border border-rose-700 px-2.5 py-1 rounded-lg flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>고위험 {criticalCount}명</span>
          </span>
          <span className="bg-amber-900/80 text-amber-200 border border-amber-700 px-2.5 py-1 rounded-lg">
            주의 {elevatedCount}명
          </span>
          <span className="bg-emerald-900/80 text-emerald-200 border border-emerald-700 px-2.5 py-1 rounded-lg">
            정상 {normalCount}명
          </span>
        </div>
      </div>

      {/* Sorting Control Header */}
      <div className="flex items-center justify-between px-1 text-xs font-extrabold text-slate-700">
        <div className="flex items-center space-x-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-rose-600" />
          <span>악화 위험 스코어 순 환자 목록</span>
        </div>
        <span className="text-[11px] font-semibold text-slate-500">
          총 {localPreds.length}명 (카드 터치 시 상세 반전)
        </span>
      </div>

      {/* Patient Cards List (Sorted by Risk Score Descending) */}
      <div className="space-y-3">
        {localPreds
          .sort((a, b) => b.riskScore - a.riskScore)
          .map((pred, index) => {
            const isSelected = pred.patientId === selectedPatientId;
            const patient = patients.find((p) => p.id === pred.patientId);

            return (
              <div
                key={pred.patientId}
                style={{ perspective: '1000px' }}
                className="w-full"
              >
                <div
                  onClick={() =>
                    setSelectedPatientId(isSelected ? '' : pred.patientId)
                  }
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: isSelected ? 'rotateX(180deg)' : 'rotateX(0deg)',
                    transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                  className="relative w-full cursor-pointer rounded-2xl"
                >
                  {/* FRONT SIDE: Collapsed Card (White Theme) */}
                  <div
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                    }}
                    className={`p-3.5 rounded-2xl bg-white text-slate-800 border border-slate-200/90 shadow-xs hover:border-rose-300 hover:shadow-md transition-shadow ${
                      isSelected
                        ? 'absolute inset-0 pointer-events-none opacity-0'
                        : 'relative'
                    }`}
                  >
                    <div className="flex flex-col space-y-2.5">
                      <div className="flex items-center justify-between">
                        {/* Left: Patient Name & Room */}
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black font-mono bg-slate-100 text-slate-700 border border-slate-200">
                            #{index + 1}
                          </span>
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <h3 className="text-base font-black text-slate-900">
                                {pred.patientName}
                              </h3>
                              <span className="text-xs font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                {pred.roomBed}
                              </span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-500">
                              {patient
                                ? `${patient.gender}/${patient.age}세 · ${patient.doctor}`
                                : '입원환자'}
                            </p>
                          </div>
                        </div>

                        {/* Right: Risk Badge & Score */}
                        <div className="text-right flex flex-col items-end space-y-1">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-black shadow-2xs flex items-center space-x-1 ${
                              pred.level === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                                : pred.level === 'ELEVATED'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {pred.level === 'CRITICAL' ? (
                              <>
                                <ShieldAlert className="w-3.5 h-3.5 mr-0.5" />
                                <span>고위험</span>
                              </>
                            ) : pred.level === 'ELEVATED' ? (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5 mr-0.5" />
                                <span>주의</span>
                              </>
                            ) : (
                              <span>정상</span>
                            )}
                          </span>
                          <div className="flex items-baseline space-x-1 font-mono">
                            <span
                              className={`text-xl font-black ${
                                pred.riskScore >= 80
                                  ? 'text-rose-600'
                                  : pred.riskScore >= 50
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }`}
                            >
                              {pred.riskScore}
                            </span>
                            <span className="text-xs text-slate-500">/100점</span>
                          </div>
                        </div>
                      </div>

                      {/* Progress Meter Bar */}
                      <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden p-0.5">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pred.riskScore >= 80
                              ? 'bg-gradient-to-r from-amber-500 to-rose-600'
                              : pred.riskScore >= 50
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pred.riskScore}%` }}
                        />
                      </div>

                      {/* Vitals Snapshot */}
                      {patient && patient.vitals && (
                        <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg font-medium bg-slate-50 text-slate-600">
                          <div className="flex items-center space-x-1">
                            <Heart
                              className={`w-3.5 h-3.5 ${
                                patient.vitals.hr >= 100
                                  ? 'text-rose-500 animate-bounce'
                                  : 'text-slate-400'
                              }`}
                            />
                            <span>HR: {patient.vitals.hr}회</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Thermometer
                              className={`w-3.5 h-3.5 ${
                                patient.vitals.bt >= 38.0
                                  ? 'text-rose-500'
                                  : 'text-slate-400'
                              }`}
                            />
                            <span>BT: {patient.vitals.bt}℃</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Wind className="w-3.5 h-3.5 text-slate-400" />
                            <span>SpO2: {patient.vitals.spo2}%</span>
                          </div>
                          <div className="font-mono text-[10px] font-bold text-rose-600">
                            EWS {patient.ewsScore}점
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] text-slate-400 text-center font-bold pt-0.5">
                        ↕ 터치하여 3D 상하 반전 (AI 상세분석)
                      </div>
                    </div>
                  </div>

                  {/* BACK SIDE: Inverted Expanded Detail Card (Dark Theme - Flipped 180deg vertically with level color index) */}
                  {(() => {
                    const isCritical = pred.level === 'CRITICAL';
                    const isElevated = pred.level === 'ELEVATED';

                    const borderCls = isCritical
                      ? 'border-rose-500/80 shadow-rose-950/40'
                      : isElevated
                      ? 'border-amber-500/80 shadow-amber-950/40'
                      : 'border-emerald-500/80 shadow-emerald-950/40';

                    const badgeBg = isCritical
                      ? 'bg-rose-600 text-white'
                      : isElevated
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-emerald-600 text-white';

                    const scoreColor = isCritical
                      ? 'text-rose-400'
                      : isElevated
                      ? 'text-amber-400'
                      : 'text-emerald-400';

                    const factorHeaderColor = isCritical
                      ? 'text-rose-300'
                      : isElevated
                      ? 'text-amber-300'
                      : 'text-emerald-300';

                    const factorSparklesColor = isCritical
                      ? 'text-rose-400'
                      : isElevated
                      ? 'text-amber-400'
                      : 'text-emerald-400';

                    const factorBoxCls = isCritical
                      ? 'bg-rose-950/70 border-rose-800/90 text-rose-200'
                      : isElevated
                      ? 'bg-amber-950/70 border-amber-800/90 text-amber-200'
                      : 'bg-emerald-950/70 border-emerald-800/90 text-emerald-200';

                    const factorDotCls = isCritical
                      ? 'bg-rose-500'
                      : isElevated
                      ? 'bg-amber-500'
                      : 'bg-emerald-500';

                    const chartIconColor = isCritical
                      ? 'text-rose-400'
                      : isElevated
                      ? 'text-amber-400'
                      : 'text-emerald-400';

                    const chartValueColor = isCritical
                      ? 'text-rose-300'
                      : isElevated
                      ? 'text-amber-300'
                      : 'text-emerald-300';

                    const chartBarGrad = isCritical
                      ? 'from-rose-700 to-rose-400'
                      : isElevated
                      ? 'from-amber-700 to-amber-400'
                      : 'from-emerald-700 to-emerald-400';

                    const wbcColor = isCritical
                      ? 'text-rose-300'
                      : isElevated
                      ? 'text-amber-300'
                      : 'text-emerald-300';

                    const rrtBtnBg = isCritical
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : isElevated
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-700';

                    return (
                      <div
                        style={{
                          backfaceVisibility: 'hidden',
                          WebkitBackfaceVisibility: 'hidden',
                          transform: 'rotateX(180deg)',
                        }}
                        className={`p-4 rounded-2xl bg-slate-950 text-white border ${borderCls} shadow-2xl space-y-3.5 ${
                          isSelected
                            ? 'relative'
                            : 'absolute inset-0 pointer-events-none opacity-0 overflow-hidden'
                        }`}
                      >
                        {/* Back Header */}
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                          <div className="flex items-center space-x-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black font-mono ${badgeBg}`}>
                              #{index + 1}
                            </span>
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <h3 className="text-base font-black text-white">
                                  {pred.patientName}
                                </h3>
                                <span className="text-xs font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {pred.roomBed}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {patient ? `${patient.gender}/${patient.age}세 · ${patient.doctor}` : '입원환자'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <div className="text-right">
                              <span className={`text-lg font-black font-mono ${scoreColor}`}>
                                {pred.riskScore}점
                              </span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPatientId('');
                              }}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center space-x-1 border border-slate-700"
                            >
                              <ChevronUp className={`w-3.5 h-3.5 ${scoreColor}`} />
                              <span>접기</span>
                            </button>
                          </div>
                        </div>

                        {/* 1. AI Contributing Factors Breakdown */}
                        <div className="space-y-1.5">
                          <h4 className={`text-xs font-bold ${factorHeaderColor} flex items-center space-x-1.5`}>
                            <Sparkles className={`w-3.5 h-3.5 ${factorSparklesColor}`} />
                            <span>AI 급성악화 기여 인자 분석</span>
                          </h4>
                          <div className="space-y-1">
                            {pred.topFactors.map((factor, fIdx) => (
                              <div
                                key={fIdx}
                                className={`p-2 border text-xs rounded-xl font-medium flex items-center space-x-2 ${factorBoxCls}`}
                              >
                                <span className={`w-2 h-2 rounded-full ${factorDotCls} flex-shrink-0 animate-pulse`} />
                                <span>{factor}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 2. Heart Rate Time Series Mini Chart */}
                        <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                            <div className="flex items-center space-x-1.5">
                              <TrendingUp className={`w-3.5 h-3.5 ${chartIconColor}`} />
                              <span>심박수 (HR) 시계열 변화 추세 (bpm)</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              최근 5시간
                            </span>
                          </div>
                          <div className="flex items-end justify-between h-14 pt-1 px-3 border-b border-slate-800 pb-1">
                            {pred.hrTrend.map((val, hIdx) => (
                              <div
                                key={hIdx}
                                className="flex flex-col items-center space-y-0.5"
                              >
                                <span className={`text-[10px] font-bold font-mono ${chartValueColor}`}>
                                  {val}
                                </span>
                                <div
                                  className={`w-3.5 bg-gradient-to-t ${chartBarGrad} rounded-t-sm`}
                                  style={{ height: `${Math.max((val - 50) * 1.1, 10)}px` }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 3. Additional Clinical Metrics */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400 block mb-0.5">
                              백혈구 수치 (WBC)
                            </span>
                            <span className={`font-bold font-mono ${wbcColor}`}>
                              {pred.wbcCount ? `${pred.wbcCount.toLocaleString()} /uL` : '정상'}
                            </span>
                          </div>
                          <div className="bg-slate-900 p-2 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400 block mb-0.5">
                              RRT 추천 여부
                            </span>
                            <span
                              className={`font-bold ${
                                pred.rrtCallRecommended
                                  ? 'text-rose-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {pred.rrtCallRecommended ? '즉시 호출 권장' : '모니터링 유지'}
                            </span>
                          </div>
                        </div>

                        {/* 4. Rapid Response Team (RRT) Escalation Button */}
                        <div className="pt-1.5 border-t border-slate-800">
                          {pred.rrtCalled ? (
                            <div className="p-2.5 bg-emerald-950/80 border border-emerald-700 rounded-xl text-xs text-emerald-200 font-bold flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                <div>
                                  <div>신속대응팀(RRT) 긴급 호출 완료</div>
                                  <div className="text-[10px] text-emerald-400/80 font-normal">
                                    시각: {pred.rrtCalledAt} · 담당 당직의 전달됨
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button
                              disabled={callingRrt}
                              onClick={(e) => handleCallRrt(pred.patientId, e)}
                              className={`w-full py-2.5 ${rrtBtnBg} active:scale-[0.99] text-white rounded-xl font-bold text-xs shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer`}
                            >
                              <PhoneCall className="w-4 h-4 animate-bounce" />
                              <span>
                                신속대응팀(RRT) 즉시 호출 (Emergency Escalation)
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
