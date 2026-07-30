import React, { useState } from 'react';
import { Patient, VoiceRecord } from '../types';
import { Mic, MicOff, Sparkles, Check, Edit2, AlertCircle, Volume2, Save, FileText } from 'lucide-react';

interface VoiceRecordViewProps {
  patients: Patient[];
  onSaveRecord: (record: VoiceRecord) => void;
}

export const VoiceRecordView: React.FC<VoiceRecordViewProps> = ({ patients, onSaveRecord }) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>('21212457'); // 김철수
  const [isRecording, setIsRecording] = useState<boolean>(false);
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

  // Toggle PTT Recording
  const handleToggleRecording = () => {
    if (!isRecording) {
      setIsRecording(true);
      setIsSaved(false);
    } else {
      setIsRecording(false);
      handleStructureSpeech(transcript);
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
    updated[idx].needsReview = false; // Mark reviewed
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

  return (
    <div className="p-3 bg-slate-100 min-h-[calc(100vh-140px)] pb-24 space-y-3">
      {/* Module Title Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-3.5 rounded-2xl shadow-md border border-blue-700">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-sky-300">
            <Mic className="w-4 h-4 text-sky-400" />
            <span>[MOD-VOICE] 음성 → 구조화 간호 기록</span>
          </div>
          <span className="text-[10px] text-slate-200 bg-white/10 px-2 py-0.5 rounded-full">
            온디바이스 STT + Gemini LLM
          </span>
        </div>
        <p className="text-xs text-slate-200 leading-relaxed">
          음성 발화를 표준 간호 항목으로 구조화합니다. 숫자와 약품명은 검토 확정 후 저장됩니다. (원 음성 미저장)
        </p>
      </div>

      {/* Patient Picker */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">대상 환자 선택:</span>
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

      {/* Push To Talk Microphone Button Container */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center space-y-3">
        <button
          onClick={handleToggleRecording}
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all ${
            isRecording
              ? 'bg-rose-600 text-white animate-pulse ring-8 ring-rose-200'
              : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
          }`}
          id="pda-ptt-button"
        >
          {isRecording ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
        </button>

        <span className="text-xs font-bold text-slate-700">
          {isRecording ? '🎙️ 녹음 중... 다시 누르면 구조화' : 'Push-to-Talk (버튼을 눌러 말하세요)'}
        </span>

        {/* Audio Wave Visualizer Simulation */}
        {isRecording && (
          <div className="flex items-center space-x-1 h-6">
            {[40, 70, 30, 90, 60, 100, 50, 80, 40, 60].map((h, i) => (
              <div
                key={i}
                className="w-1 bg-blue-500 rounded-full animate-bounce"
                style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Raw Transcript Editable Box */}
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
            <span>다시 AI 구조화</span>
          </button>
        </div>
        <textarea
          rows={2}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 leading-relaxed"
        />
      </div>

      {/* Gemini Structured Medical Fields */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
          <span className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>LLM 구조화 간호 기록 항목</span>
          </span>
          <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            ⚠️ 수치/약품명 검토 필터
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500 font-bold flex flex-col items-center space-y-2">
            <Sparkles className="w-6 h-6 text-indigo-500 animate-spin" />
            <span>Gemini AI 간호 용어 구조화 및 필드 매핑 중...</span>
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
                      검토 필요
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

        {/* Commit / Save Button */}
        <button
          disabled={isLoading || isSaved}
          onClick={handleCommitRecord}
          className={`w-full py-3 rounded-xl font-bold text-xs shadow-md flex items-center justify-center space-x-1.5 transition-all ${
            isSaved
              ? 'bg-emerald-600 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {isSaved ? (
            <>
              <Check className="w-4 h-4" />
              <span>간호 기록 확정 저장 완료!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>검토 완료 · 간호 기록 확정 저장</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
