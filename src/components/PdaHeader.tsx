import React from 'react';
import { Mic, Bell, Menu, Wifi, Battery, ChevronLeft, Camera, RotateCcw, Pill, AlertTriangle, ShieldAlert, Star } from 'lucide-react';
import { Patient } from '../types';

interface PdaHeaderProps {
  activeTab: 'patients' | 'worklist' | 'voice' | 'sbar' | 'pred';
  setActiveTab: (tab: 'patients' | 'worklist' | 'voice' | 'sbar' | 'pred') => void;
  identifiedPatient?: Patient | null;
  currentTaskName?: string;
  onResetPatient?: () => void;
  onOpenVoiceModal?: () => void;
  onOpenScanner?: () => void;
  nurseName?: string;
  onLogout?: () => void;
}

export const PdaHeader: React.FC<PdaHeaderProps> = ({
  activeTab,
  setActiveTab,
  identifiedPatient,
  currentTaskName = '채혈',
  onResetPatient,
  onOpenVoiceModal,
  onOpenScanner,
  nurseName = '이수진 N',
  onLogout,
}) => {
  const [currentTime, setCurrentTime] = React.useState<string>(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-[#1E293B] text-white shadow-md sticky top-0 z-30 select-none">
      {/* Top OS Status Bar */}
      <div className="flex items-center justify-between px-3.5 py-1 text-xs text-slate-200 bg-[#0F172A]">
        <span className="font-semibold font-mono">{currentTime}</span>
        <button
          onClick={onLogout}
          title="로그아웃 / Splash 스크린"
          className="font-bold text-slate-100 hover:text-cyan-300 transition-colors flex items-center space-x-1"
        >
          <span>{nurseName} 3A</span>
          <RotateCcw className="w-3 h-3 text-slate-400" />
        </button>
        <div className="flex items-center space-x-2">
          <Wifi className="w-3.5 h-3.5 text-slate-200" />
          <div className="flex items-center space-x-0.5 border border-slate-400 rounded-sm px-1 py-0.2 text-[10px]">
            <Battery className="w-3.5 h-3.5" />
            <span className="font-mono">87%</span>
          </div>
        </div>
      </div>

      {/* HEADER SECTION: Patient Identified Header vs Default User (Nurse) Header */}
      {identifiedPatient ? (
        /* RECOGNIZED PATIENT HEADER CARD matching design screenshot */
        <div className="bg-gradient-to-b from-[#0284C7] to-[#0D9488] text-white p-3.5 shadow-lg relative border-b border-teal-700/50">
          {/* Top Sub Header Row */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={onResetPatient}
              className="flex items-center space-x-1 font-bold text-white hover:text-yellow-200 transition-colors text-sm"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.8]" />
              <span className="text-base font-black tracking-tight">{currentTaskName}</span>
            </button>
            <div className="flex items-center space-x-2 text-white">
              <button
                onClick={() => {
                  setActiveTab('voice');
                  if (onOpenVoiceModal) onOpenVoiceModal();
                }}
                className="p-1 hover:bg-white/20 rounded-full transition-all"
                title="음성기록"
              >
                <Mic className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  if (onOpenScanner) onOpenScanner();
                }}
                className="p-1 hover:bg-white/20 rounded-full transition-all"
                title="바코드 스캐너"
              >
                <Camera className="w-5 h-5" />
              </button>
              <button
                onClick={() => setActiveTab('sbar')}
                className="p-1 hover:bg-white/20 rounded-full transition-all"
                title="메뉴 / SBAR"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Location & Status Pills */}
          <div className="flex items-center space-x-2 text-xs font-semibold text-sky-100 mb-1">
            <span className="bg-white/20 px-2 py-0.5 rounded text-[11px] font-bold">입원</span>
            <span>{identifiedPatient.hdPod || 'HD:5 / POD:4'}</span>
            <span className="ml-auto">{identifiedPatient.ward || '32병동'} {identifiedPatient.roomBed || '302/01'}</span>
          </div>

          {/* Main Patient Name Block */}
          <div className="flex items-start justify-between mt-1">
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-2xl font-normal text-yellow-300 tracking-tight" style={{ fontWeight: 'normal' }}>
                  {identifiedPatient.name}
                </h2>
                <span className="text-xs font-normal text-white" style={{ fontWeight: 'normal' }}>
                  {identifiedPatient.gender}/{identifiedPatient.age}세/{identifiedPatient.bloodType}
                </span>
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                {identifiedPatient.isVerified ? (
                  <span className="bg-yellow-300 text-slate-900 text-xs font-black px-2 py-0.5 rounded-full shadow-xs shrink-0">
                    환자 확인 됨
                  </span>
                ) : (
                  <button
                    onClick={onOpenScanner}
                    className="bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-xs cursor-pointer inline-flex items-center space-x-1 transition-all shrink-0"
                    title="팔찌 스캔하여 환자 확인"
                  >
                    <span>팔찌 미인식</span>
                  </button>
                )}
              </div>
            </div>

            {/* Reset Button */}
            <button
              onClick={onResetPatient}
              className="bg-blue-800/60 hover:bg-blue-800/80 active:scale-95 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg flex flex-col items-center justify-center space-y-0.5 border border-white/20 transition-all cursor-pointer"
              title="환자 초기화"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>환자 초기화</span>
            </button>
          </div>

          {/* Patient Reg No & Info Line */}
          <div className="mt-2 text-[11px] text-sky-100 font-mono flex items-center space-x-3 border-t border-white/10 pt-2">
            <span>{identifiedPatient.id}</span>
            <span>{identifiedPatient.birthDate || '095/02/03'}</span>
            <span className="font-sans text-sky-50">{identifiedPatient.doctor || '내과/김전문/주박사'}</span>
          </div>

          {/* 3 Caution Icon Badges Row matching Patient Caution Info Page */}
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
      ) : (
        /* DEFAULT USER (NURSE) HEADER */
        <div className="flex items-center justify-between px-3 py-2.5 bg-[#1E2E4A] border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <div>
              <div className="flex items-baseline space-x-2">
                <h1 className="text-lg font-bold text-white tracking-tight">{nurseName}</h1>
                <span className="text-xs text-slate-300 font-medium">N2341 / 책임간호사</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                32병동 (3A) · 근무스케줄: Day
              </div>
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
      )}

      {/* Main Module Navigation Tabs - Hidden when a specific patient/task is determined */}
      {!identifiedPatient && (
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
      )}
    </div>
  );
};

