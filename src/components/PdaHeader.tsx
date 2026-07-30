import React from 'react';
import { Mic, Bell, Menu, Wifi, Battery, ChevronLeft, Camera, RotateCcw } from 'lucide-react';

interface PdaHeaderProps {
  activeTab: 'patients' | 'worklist' | 'voice' | 'sbar' | 'pred';
  setActiveTab: (tab: 'patients' | 'worklist' | 'voice' | 'sbar' | 'pred') => void;
  selectedPatientName?: string | null;
  onBackToPatients?: () => void;
  onOpenVoiceModal?: () => void;
}

export const PdaHeader: React.FC<PdaHeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedPatientName,
  onBackToPatients,
  onOpenVoiceModal,
}) => {
  const currentTime = '10:45 AM';

  return (
    <div className="bg-[#1E293B] text-white shadow-md sticky top-0 z-30 select-none">
      {/* Top OS Status Bar */}
      <div className="flex items-center justify-between px-4 py-1 text-xs text-slate-300 bg-[#0F172A]">
        <span className="font-semibold">{currentTime}</span>
        <span className="font-medium text-slate-200">이수진 N 3A</span>
        <div className="flex items-center space-x-2">
          <Wifi className="w-3.5 h-3.5 text-slate-200" />
          <div className="flex items-center space-x-0.5 border border-slate-400 rounded-sm px-1 py-0.2 text-[10px]">
            <Battery className="w-3.5 h-3.5" />
            <span>87%</span>
          </div>
        </div>
      </div>

      {/* Main App Title / Header Bar */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#1E2E4A] border-b border-slate-700">
        <div className="flex items-center space-x-2">
          {selectedPatientName && (
            <button
              onClick={onBackToPatients}
              className="p-1 rounded-full hover:bg-slate-700 text-slate-200 transition-colors"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-baseline space-x-2">
              <h1 className="text-lg font-bold text-white tracking-tight">이수진 N</h1>
              <span className="text-xs text-slate-300 font-medium">N2341 / 책임간호사</span>
            </div>
            {selectedPatientName && (
              <div className="flex items-center space-x-1.5 text-xs text-amber-400 font-semibold mt-0.5">
                <span>▶ 선택 환자: {selectedPatientName}</span>
                <button
                  onClick={onBackToPatients}
                  className="p-0.5 hover:bg-slate-700/80 rounded text-slate-300 hover:text-white transition-colors"
                  title="스캔 환자 초기화"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Quick Icons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setActiveTab('voice');
              if (onOpenVoiceModal) onOpenVoiceModal();
            }}
            className={`p-1.5 rounded-full transition-all ${
              activeTab === 'voice'
                ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                : 'hover:bg-slate-700 text-slate-300'
            }`}
            title="음성 기록 (Push-to-Talk)"
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('pred')}
            className={`p-1.5 rounded-full transition-all relative ${
              activeTab === 'pred'
                ? 'bg-amber-600 text-white ring-2 ring-amber-300'
                : 'hover:bg-slate-700 text-slate-300'
            }`}
            title="알림 & 급성악화 예측"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
              1
            </span>
          </button>
          <button
            onClick={() => setActiveTab('sbar')}
            className={`p-1.5 rounded-full hover:bg-slate-700 text-slate-300 transition-colors ${
              activeTab === 'sbar' ? 'text-amber-400 font-bold' : ''
            }`}
            title="SBAR 교대 인계"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Module Navigation Tabs */}
      <div className="grid grid-cols-5 bg-[#0F172A] border-b border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('patients')}
          className={`py-2.5 text-center transition-colors border-b-2 ${
            activeTab === 'patients'
              ? 'border-blue-500 text-blue-400 bg-slate-800/80 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          환자리스트
        </button>
        <button
          onClick={() => setActiveTab('worklist')}
          className={`py-2.5 text-center transition-colors border-b-2 ${
            activeTab === 'worklist'
              ? 'border-blue-500 text-blue-400 bg-slate-800/80 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          업무리스트
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          className={`py-2.5 text-center transition-colors border-b-2 ${
            activeTab === 'voice'
              ? 'border-blue-500 text-blue-400 bg-slate-800/80 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          음성기록
        </button>
        <button
          onClick={() => setActiveTab('sbar')}
          className={`py-2.5 text-center transition-colors border-b-2 ${
            activeTab === 'sbar'
              ? 'border-blue-500 text-blue-400 bg-slate-800/80 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          SBAR인계
        </button>
        <button
          onClick={() => setActiveTab('pred')}
          className={`py-2.5 text-center transition-colors border-b-2 ${
            activeTab === 'pred'
              ? 'border-amber-500 text-amber-400 bg-slate-800/80 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          악화예측
        </button>
      </div>
    </div>
  );
};
