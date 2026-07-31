import React, { useState, useEffect } from 'react';
import { Patient, VoiceRecord } from '../types';
import { Mic, MicOff, Sparkles, Check, Volume2, Save, Square, ArrowRight, RotateCcw } from 'lucide-react';

interface VoiceRecordViewProps {
  patients: Patient[];
  onSaveRecord: (record: VoiceRecord) => void;
}

export const VoiceRecordView: React.FC<VoiceRecordViewProps> = ({ patients, onSaveRecord }) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>('21212457'); // 김철수
  const [isRecording, setIsRecording] = useState<boolean>(true); // Default to recording screen matching screenshot
  const [recordSeconds, setRecordSeconds] = useState<number>(8); // Matches 00:08 in reference image
  const [activeViewMode, setActiveViewMode] = useState<'recording' | 'structured'>('recording');

  const [now, setNow] = useState<Date>(new Date());
  const [transcript, setTranscript] = useState<string>(
    '환자 김철수님 수술부위 통증 호소하여 혈압 138에 88, 심박수 102회 측정되었고 휴물린 10단위 Continuous 주입 반응 확인 함'
  );
  const [structuredFields, setStructuredFields] = useState<any[]>([
    { fieldCd: 'SYMPTOM', fieldLabel: '주호소 / 증상', value: '수술 부위 둔통 호소', needsReview: false },
    { fieldCd: 'BP', fieldLabel: '혈압 (BP)', value: '138/88 mmHg', needsReview: true },
    { fieldCd: 'HR', fieldLabel: '심박수 (HR)', value: '102 bpm', needsReview: true },
    { fieldCd: 'MED_ACTION', fieldLabel: '투약 처치 / 반응', value: '휴물린-R 10IU Continuous 주입 및 혈당 감시', needsReview: true },
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Sync real-time clock for 수행 일시
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Timer interval for recording duration
  useEffect(() => {
    let recTimer: any = null;
    if (isRecording) {
      recTimer = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(recTimer);
  }, [isRecording]);

  const formattedTimer = React.useMemo(() => {
    const m = Math.floor(recordSeconds / 60);
    const s = recordSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [recordSeconds]);

  const formattedDateTime = React.useMemo(() => {
    const y = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${y}/${mm}/${d}  ${hh}:${min}:${ss}`;
  }, [now]);

  // Toggle RECORD button
  const handleToggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setActiveViewMode('structured');
      handleStructureSpeech(transcript);
    } else {
      setIsRecording(true);
      setRecordSeconds(0);
      setIsSaved(false);
      setActiveViewMode('recording');
    }
  };

  // Trigger AI Structuring API
  const handleStructureSpeech = async (textToStructure: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/voice/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: textToStructure,
          context: 'MED_NOTE',
          patientId: selectedPatientId,
        }),
      });

      const data = await res.json();
      if (data.success && data.data.fields) {
        setStructuredFields(data.data.fields);
      }
    } catch (err) {
      console.error('Voice structuring error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (idx: number, newValue: string) => {
    const updated = [...structuredFields];
    updated[idx].value = newValue;
    updated[idx].needsReview = false;
    setStructuredFields(updated);
  };

  const handleCommitRecord = () => {
    const record: VoiceRecord = {
      id: `VOICE-${Date.now()}`,
      patientId: selectedPatientId,
      context: 'MED_NOTE',
      rawText: transcript,
      structuredFields,
      editedByUser: true,
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    };
    onSaveRecord(record);
    setIsSaved(true);
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  // Static/Animated Waveform Bars definition matching the reference screenshot exactly
  const barsData = [
    { height: 25, color: '#38BDF8' },
    { height: 35, color: '#38BDF8' },
    { height: 48, color: '#38BDF8' },
    { height: 75, color: '#0EA5E9' },
    { height: 110, color: '#0EA5E9' },
    { height: 85, color: '#0EA5E9' },
    { height: 40, color: '#0284C7' },
    { height: 30, color: '#0284C7' },
    { height: 50, color: '#06B6D4' },
    { height: 95, color: '#06B6D4' },
    { height: 125, color: '#06B6D4' },
    { height: 70, color: '#06B6D4' },
    { height: 45, color: '#10B981' },
    { height: 60, color: '#10B981' },
    { height: 80, color: '#10B981' },
    { height: 35, color: '#10B981' },
    { height: 25, color: '#10B981' },
    { height: 40, color: '#10B981' },
    { height: 90, color: '#10B981' },
    { height: 140, color: '#10B981' }, // Peak center
    { height: 70, color: '#10B981' },
    { height: 105, color: '#10B981' },
    { height: 120, color: '#10B981' },
    { height: 65, color: '#06B6D4' },
    { height: 30, color: '#06B6D4' },
    { height: 45, color: '#06B6D4' },
    { height: 100, color: '#06B6D4' },
    { height: 115, color: '#06B6D4' },
    { height: 50, color: '#0284C7' },
    { height: 30, color: '#0284C7' },
    { height: 85, color: '#0284C7' },
    { height: 130, color: '#38BDF8' },
    { height: 110, color: '#38BDF8' },
    { height: 60, color: '#38BDF8' },
    { height: 40, color: '#38BDF8' },
    { height: 20, color: '#38BDF8' },
  ];

  return (
    <div className="bg-[#F8FAFC] min-h-[calc(100vh-130px)] pb-24 flex flex-col justify-between select-none">
      {/* View Switcher Bar (Hidden header for patient selection & mode toggle) */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5 font-bold text-slate-800">
          <span>환자:</span>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="p-1 bg-slate-100 border border-slate-300 rounded font-bold text-xs"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.roomBed})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveViewMode('recording')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
              activeViewMode === 'recording'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🎙️ 녹음 화면
          </button>
          <button
            onClick={() => setActiveViewMode('structured')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
              activeViewMode === 'structured'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 AI 구조화 결과
          </button>
        </div>
      </div>

      {activeViewMode === 'recording' ? (
        /* SCREEN MATCHING ATTACHED REFERENCE IMAGE EXACTLY */
        <div className="flex-1 flex flex-col items-center justify-between p-6 py-8">
          {/* Top Title */}
          <div className="text-center pt-2">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">
              {isRecording ? '음성 녹음 중...' : '음성 녹음 일시 정지'}
            </h2>
          </div>

          {/* Center Circular Waveform Display */}
          <div className="my-auto flex flex-col items-center justify-center">
            <div className="w-72 h-72 rounded-full bg-slate-100/90 border-4 border-slate-200/60 shadow-inner flex items-center justify-center relative overflow-hidden">
              {/* Horizontal Center Axis Line */}
              <div className="absolute inset-x-6 h-[1.5px] bg-cyan-400/80 top-1/2 -translate-y-1/2 z-0" />

              {/* Turquoise / Sky Blue Waveform Spectrum Bars */}
              <div className="relative z-10 flex items-center justify-center space-x-[2.5px] h-40 px-4">
                {barsData.map((bar, idx) => {
                  // Add subtle dynamic animation if recording
                  const dynamicScale = isRecording
                    ? Math.sin(recordSeconds + idx * 0.4) * 0.25 + 0.95
                    : 1;
                  const finalHeight = Math.max(8, bar.height * dynamicScale);

                  return (
                    <div
                      key={idx}
                      className="w-[3px] rounded-full transition-all duration-300"
                      style={{
                        height: `${finalHeight}px`,
                        backgroundColor: bar.color,
                        opacity: 0.9,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* RECORD Badge Button Container matching Screenshot */}
            <div
              onClick={handleToggleRecording}
              className="mt-8 bg-rose-100/90 hover:bg-rose-200 active:scale-95 transition-all cursor-pointer border border-rose-200 rounded-2xl px-12 py-3.5 flex flex-col items-center justify-center shadow-xs"
            >
              <div className="flex items-center space-x-2 text-red-600 font-extrabold text-xs tracking-wider">
                <Square className="w-3.5 h-3.5 fill-red-600 text-red-600" />
                <span>RECORD</span>
              </div>
              <div className="text-2xl font-black text-red-600 font-mono tracking-tight mt-0.5">
                {formattedTimer}
              </div>
            </div>
          </div>

          {/* Bottom Execution Time */}
          <div className="text-slate-800 font-semibold text-sm tracking-wide pt-4 text-center font-mono">
            수행 일시 : &nbsp;{formattedDateTime}
          </div>
        </div>
      ) : (
        /* AI STRUCTURED MEDICAL RECORD REVIEW SCREEN */
        <div className="p-3.5 space-y-3">
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-3.5 rounded-2xl shadow-md border border-blue-700">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-sky-300">
                <Mic className="w-4 h-4 text-sky-400" />
                <span>[MOD-VOICE] AI 음성 구조화 간호 기록</span>
              </div>
              <span className="text-[10px] text-slate-200 bg-white/10 px-2 py-0.5 rounded-full">
                Gemini LLM
              </span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              음성 발화를 표준 간호 항목으로 매핑했습니다. 수치와 용어를 확인 후 간호 기록에 확정 저장하세요.
            </p>
          </div>

          {/* STT Text Area */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center space-x-1">
                <Volume2 className="w-4 h-4 text-blue-600" />
                <span>STT 인식 음성 텍스트</span>
              </span>
              <button
                onClick={() => handleStructureSpeech(transcript)}
                disabled={isLoading}
                className="text-blue-600 hover:underline flex items-center space-x-1 font-bold text-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>재분석</span>
              </button>
            </div>
            <textarea
              rows={2}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 leading-relaxed"
            />
          </div>

          {/* Structured Fields */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
              <span className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>구조화 항목 ({selectedPatient.name} 환자)</span>
              </span>
              <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                검토 후 확정
              </span>
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-xs text-slate-500 font-bold flex flex-col items-center space-y-2">
                <Sparkles className="w-6 h-6 text-indigo-500 animate-spin" />
                <span>Gemini AI 간호 용어 구조화 중...</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {structuredFields.map((field, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl border text-xs space-y-1 transition-all ${
                      field.needsReview
                        ? 'bg-amber-50/70 border-amber-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-slate-700 font-bold">
                      <span>{field.fieldLabel}</span>
                      {field.needsReview && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-200 px-1.5 py-0.2 rounded">
                          검토
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={field.value}
                      onChange={(e) => handleFieldChange(idx, e.target.value)}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => setActiveViewMode('recording')}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center space-x-1"
              >
                <RotateCcw className="w-4 h-4" />
                <span>다시 녹음하기</span>
              </button>
              <button
                disabled={isLoading || isSaved}
                onClick={handleCommitRecord}
                className={`flex-1 py-3 rounded-xl font-bold text-xs shadow-md flex items-center justify-center space-x-1.5 transition-all ${
                  isSaved
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {isSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>저장 완료</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>간호기록 확정</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

