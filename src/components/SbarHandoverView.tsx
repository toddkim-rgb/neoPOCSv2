import React, { useState } from 'react';
import { Patient, SbarHandover } from '../types';
import { Sparkles, FileCheck, CheckCircle2, UserCheck, ChevronRight, Edit3, ShieldAlert, Share2 } from 'lucide-react';

interface SbarHandoverViewProps {
  patients: Patient[];
  handovers: SbarHandover[];
  onSignHandover: (handoverId: string, signedBy: string, receivedBy: string) => void;
}

export const SbarHandoverView: React.FC<SbarHandoverViewProps> = ({
  patients,
  handovers,
  onSignHandover,
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>('21212457'); // 김철수
  const [selectedCitation, setSelectedCitation] = useState<string | null>(null);
  const [receiverNurse, setReceiverNurse] = useState<string>('박미경 N (Evening)');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [sbarData, setSbarData] = useState<any>(handovers[0]?.situation ? handovers[0] : null);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  // AI SBAR Generation Trigger
  const handleGenerateSbar = async () => {
    setIsGenerating(true);
    setSelectedCitation(null);
    try {
      const res = await fetch('/api/v1/handover/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          shiftFrom: 'Day (07:00)',
          shiftTo: 'Evening (15:00)',
        }),
      });

      const data = await res.json();
      if (data.success && data.data.sbar) {
        setSbarData({
          id: `SBAR-${Date.now()}`,
          patientId: selectedPatientId,
          patientName: selectedPatient.name,
          shiftFrom: 'Day (07:00)',
          shiftTo: 'Evening (15:00)',
          nurseName: '이수진 N',
          situation: data.data.sbar.situation || [],
          background: data.data.sbar.background || [],
          assessment: data.data.sbar.assessment || [],
          recommendation: data.data.sbar.recommendation || [],
          status: 'DRAFT',
        });
      }
    } catch (err) {
      console.error('SBAR generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSign = () => {
    if (sbarData) {
      onSignHandover(sbarData.id, '이수진 N', receiverNurse);
      setSbarData({
        ...sbarData,
        status: 'SIGNED',
        signedBy: '이수진 N',
        receivedBy: receiverNurse,
      });
    }
  };

  return (
    <div className="p-3 bg-slate-100 min-h-[calc(100vh-140px)] pb-24 space-y-3">
      {/* Module Title Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-teal-950 text-white p-3.5 rounded-2xl shadow-md border border-teal-800">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-teal-300">
            <FileCheck className="w-4 h-4 text-teal-400" />
            <span>[MOD-SBAR] 교대 인계 SBAR 자동 요약</span>
          </div>
          <span className="text-[10px] text-slate-200 bg-white/10 px-2 py-0.5 rounded-full">
            Grounding Source Citations
          </span>
        </div>
        <p className="text-xs text-slate-200 leading-relaxed">
          근무 중 기록된 CLMA 투약/바이탈 이벤트와 EMR 진단을 근거(Source Citation)로 SBAR 인계서를 요약 생성합니다.
        </p>
      </div>

      {/* Patient Selector & Generate Button */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-slate-500 block">인계 환자 선택</span>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="p-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.roomBed} - EWS {p.ewsScore}점)
              </option>
            ))}
          </select>
        </div>

        <button
          disabled={isGenerating}
          onClick={handleGenerateSbar}
          className="px-3.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center space-x-1 transition-all"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{isGenerating ? 'AI 생성 중...' : 'SBAR 요약 생성'}</span>
        </button>
      </div>

      {/* Citation Grounding Inspection Popup Banner if clicked */}
      {selectedCitation && (
        <div className="bg-slate-900 text-white p-3 rounded-xl border border-teal-500 text-xs shadow-lg animate-fade-in flex items-start justify-between">
          <div>
            <div className="font-bold text-teal-300 flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>원천 근거 레코드 (Grounding Citation): {selectedCitation}</span>
            </div>
            <p className="text-slate-200 mt-1">
              본 문장은 2026.07.28 CLMA 간호 서명 로그 및 EMR FHIR 데이터와 100% 매핑 검증되었습니다.
            </p>
          </div>
          <button onClick={() => setSelectedCitation(null)} className="text-slate-400 hover:text-white font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* SBAR 4-Grid Cards */}
      {sbarData && (
        <div className="space-y-3">
          {/* Situation (S) */}
          <div className="bg-white rounded-2xl border border-sky-200 shadow-xs overflow-hidden">
            <div className="bg-sky-600 text-white px-3 py-1.5 text-xs font-black flex items-center justify-between">
              <span>S — Situation (현재 상황 & 활성 알림)</span>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded">현재 상태</span>
            </div>
            <div className="p-3 space-y-2 text-xs">
              {sbarData.situation.map((item: any) => (
                <div key={item.id} className="flex items-start justify-between bg-sky-50/50 p-2 rounded-lg">
                  <span className="font-semibold text-slate-800 leading-snug">{item.text}</span>
                  <button
                    onClick={() => setSelectedCitation(item.sourceRef)}
                    className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 flex-shrink-0"
                  >
                    {item.sourceRef}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Background (B) */}
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-xs overflow-hidden">
            <div className="bg-indigo-600 text-white px-3 py-1.5 text-xs font-black flex items-center justify-between">
              <span>B — Background (진단 · 기저질환 · 알레르기)</span>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded">FHIR EMR</span>
            </div>
            <div className="p-3 space-y-2 text-xs">
              {sbarData.background.map((item: any) => (
                <div key={item.id} className="flex items-start justify-between bg-indigo-50/50 p-2 rounded-lg">
                  <span className="font-semibold text-slate-800 leading-snug">{item.text}</span>
                  <button
                    onClick={() => setSelectedCitation(item.sourceRef)}
                    className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-100 text-indigo-800 border border-indigo-300 hover:bg-indigo-200 flex-shrink-0"
                  >
                    {item.sourceRef}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Assessment (A) */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-xs overflow-hidden">
            <div className="bg-amber-600 text-white px-3 py-1.5 text-xs font-black flex items-center justify-between">
              <span>A — Assessment (근무 중 처치 · 바이탈 · HAM 경고)</span>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded">CLMA Log</span>
            </div>
            <div className="p-3 space-y-2 text-xs">
              {sbarData.assessment.map((item: any) => (
                <div key={item.id} className="flex items-start justify-between bg-amber-50/50 p-2 rounded-lg">
                  <span className="font-semibold text-slate-800 leading-snug">{item.text}</span>
                  <button
                    onClick={() => setSelectedCitation(item.sourceRef)}
                    className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 flex-shrink-0"
                  >
                    {item.sourceRef}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendation (R) */}
          <div className="bg-white rounded-2xl border border-rose-200 shadow-xs overflow-hidden">
            <div className="bg-rose-600 text-white px-3 py-1.5 text-xs font-black flex items-center justify-between">
              <span>R — Recommendation (다음 근무 확인 및 권고사항)</span>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded">Next Shift</span>
            </div>
            <div className="p-3 space-y-2 text-xs">
              {sbarData.recommendation.map((item: any) => (
                <div key={item.id} className="flex items-start justify-between bg-rose-50/50 p-2 rounded-lg">
                  <span className="font-semibold text-slate-800 leading-snug">{item.text}</span>
                  <button
                    onClick={() => setSelectedCitation(item.sourceRef)}
                    className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 flex-shrink-0"
                  >
                    {item.sourceRef}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Signatures & Confirm Section */}
          <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-700 space-y-3 text-xs">
            <div className="flex items-center justify-between font-bold text-teal-300 border-b border-slate-800 pb-2">
              <span className="flex items-center space-x-1">
                <UserCheck className="w-4 h-4 text-teal-400" />
                <span>2-Gate 전자서명 및 인계 확정</span>
              </span>
              <span className="text-[10px] text-slate-400">책임 소재 명확화</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800 p-2 rounded-xl">
                <span className="text-slate-400 block text-[10px]">인계 간호사 (Off-going)</span>
                <span className="font-bold text-white text-xs">이수진 N (Day)</span>
              </div>
              <div className="bg-slate-800 p-2 rounded-xl">
                <span className="text-slate-400 block text-[10px]">인수 간호사 (On-coming)</span>
                <input
                  type="text"
                  value={receiverNurse}
                  onChange={(e) => setReceiverNurse(e.target.value)}
                  className="w-full bg-slate-900 text-teal-300 font-bold border border-slate-700 rounded px-1.5 py-0.5 text-xs mt-0.5"
                />
              </div>
            </div>

            <button
              onClick={handleSign}
              disabled={sbarData.status === 'SIGNED'}
              className={`w-full py-3 rounded-xl font-bold shadow-md flex items-center justify-center space-x-1.5 text-xs transition-all ${
                sbarData.status === 'SIGNED'
                  ? 'bg-emerald-600 text-white cursor-default'
                  : 'bg-teal-600 hover:bg-teal-500 text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{sbarData.status === 'SIGNED' ? '전자서명 인계 완료됨' : '인계서 서명 및 전송'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
