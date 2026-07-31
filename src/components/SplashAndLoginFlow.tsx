import React, { useState, useEffect } from 'react';
import { Wifi, Battery, Radio, CreditCard, User, KeyRound, Fingerprint, ScanFace, CheckCircle2, RefreshCw } from 'lucide-react';

interface LoginFlowProps {
  onLoginSuccess: (userInfo: { name: string; id: string }) => void;
}

export const SplashAndLoginFlow: React.FC<LoginFlowProps> = ({ onLoginSuccess }) => {
  const [stage, setStage] = useState<'splash' | 'login'>('splash');
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('네트워크 접속 및 환경 설정 확인 중...');
  
  // Login State
  const [loginTab, setLoginTab] = useState<'rfid' | 'id' | 'bio'>('rfid');
  const [currentTime, setCurrentTime] = useState<string>(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const [employeeId, setEmployeeId] = useState<string>('N2341');
  const [password, setPassword] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Splash timer simulation
  useEffect(() => {
    if (stage === 'splash') {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => setStage('login'), 300);
            return 100;
          }
          if (prev === 30) {
            setStatusText('앱 버전 ver 2.1.24 무결성 검증 중...');
          } else if (prev === 70) {
            setStatusText('병원 포털 EMR 서버 연동 확인 완료');
          }
          return prev + 5;
        });
      }, 80);

      return () => clearInterval(interval);
    }
  }, [stage]);

  const handleRfidTag = () => {
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      onLoginSuccess({ name: '이수진 N', id: 'N2341' });
    }, 800);
  };

  const handleIdLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      onLoginSuccess({ name: '이수진 N', id: employeeId || 'N2341' });
    }, 800);
  };

  const handleBioLogin = () => {
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      onLoginSuccess({ name: '이수진 N', id: 'N2341' });
    }, 800);
  };

  return (
    <div className="w-full flex-1 min-h-screen bg-gradient-to-br from-cyan-50 via-sky-100 to-indigo-100 text-slate-800 font-sans flex flex-col justify-between relative overflow-hidden select-none">
      {/* Background Decorative Polygon Waves */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-cyan-200/50 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-20 w-96 h-96 bg-purple-200/50 rounded-full blur-3xl" />
        <svg className="w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="0,0 100,0 100,40 0,70" fill="url(#grad1)" />
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Top Status Bar Mockup */}
      <div className="w-full px-5 py-2.5 flex items-center justify-between text-slate-700 text-xs font-semibold z-10">
        <span>{currentTime}</span>
        <div className="flex items-center space-x-2">
          <Wifi className="w-4 h-4" />
          <div className="flex items-center space-x-1">
            <Battery className="w-4 h-4" />
            <span className="text-[11px] font-bold">89%</span>
          </div>
        </div>
      </div>

      {/* STAGE 1: Splash / Loading Screen */}
      {stage === 'splash' && (
        <div className="flex-1 flex flex-col justify-between items-center py-12 px-6 z-10 animate-fade-in">
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
            {/* Logo Graphic matching design */}
            <div className="space-y-1">
              <div className="text-5xl font-black tracking-tight text-slate-800 flex items-baseline justify-center">
                <span className="text-slate-600 font-medium text-3xl mr-1">neo</span>
                <span className="text-slate-600 text-6xl tracking-tight font-extrabold">POCS</span>
                <span className="text-slate-700 text-2xl font-bold ml-1">v2</span>
              </div>
              <p className="text-slate-600 text-xl font-medium tracking-tight">
                Point of care solution
              </p>
            </div>
          </div>

          {/* Bottom Progress Bar & Version Info */}
          <div className="w-full max-w-xs space-y-3 text-center">
            <span className="text-xs font-medium text-slate-500 block">
              ver 2.1.24
            </span>
            <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-slate-700 h-full rounded-full transition-all duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 font-medium h-4">
              {statusText}
            </p>

            <div className="pt-8 text-xs font-black tracking-widest text-slate-400">
              SOFTBOWL
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: Login Screen */}
      {stage === 'login' && (
        <div className="flex-1 flex flex-col justify-between items-center px-4 py-4 z-10 animate-fade-in">
          {/* Top Login Method Tabs */}
          <div className="w-full max-w-sm bg-white/90 backdrop-blur-md rounded-xl p-1 shadow-sm border border-white/60 grid grid-cols-3 gap-1">
            <button
              onClick={() => setLoginTab('rfid')}
              className={`py-2.5 rounded-lg font-extrabold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                loginTab === 'rfid'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>RFID</span>
            </button>
            <button
              onClick={() => setLoginTab('id')}
              className={`py-2.5 rounded-lg font-extrabold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                loginTab === 'id'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
              }`}
            >
              <User className="w-4 h-4" />
              <span>사번</span>
            </button>
            <button
              onClick={() => setLoginTab('bio')}
              className={`py-2.5 rounded-lg font-extrabold text-xs flex items-center justify-center space-x-1.5 transition-all ${
                loginTab === 'bio'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
              }`}
            >
              <Fingerprint className="w-4 h-4" />
              <span>생체</span>
            </button>
          </div>

          {/* TAB 1: RFID Login */}
          {loginTab === 'rfid' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 my-auto px-4 w-full max-w-xs animate-scale-up">
              <button
                onClick={handleRfidTag}
                disabled={isLoggingIn}
                className="group relative w-52 h-52 rounded-full bg-cyan-100/60 border border-white/80 shadow-inner flex flex-col items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <div className="absolute inset-2 rounded-full border border-sky-200/80 animate-ping opacity-40 pointer-events-none" />
                <div className="w-36 h-36 rounded-2xl bg-white/80 border border-slate-300/80 flex flex-col items-center justify-center p-3 shadow-md group-hover:border-slate-500 transition-colors">
                  <div className="w-16 h-12 border-2 border-slate-700 rounded-lg relative flex items-center justify-center mb-1">
                    <Radio className="w-7 h-7 text-slate-700 animate-pulse" />
                  </div>
                  <span className="font-black text-slate-800 text-base tracking-wider mt-1">
                    RFID
                  </span>
                </div>
              </button>

              <div className="space-y-1.5">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                  사원증을 태그하세요
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  PDA 뒷면 NFC영역 카드를 가까이
                </p>
              </div>

              {isLoggingIn && (
                <div className="flex items-center space-x-2 text-slate-700 font-extrabold text-xs bg-white/80 px-4 py-2 rounded-full shadow-xs border border-white">
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                  <span>사원증 RFID 검증 중...</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Employee ID & PW Login */}
          {loginTab === 'id' && (
            <form
              onSubmit={handleIdLogin}
              className="flex-1 flex flex-col items-center justify-center w-full max-w-xs space-y-4 my-auto animate-scale-up"
            >
              <div className="w-full text-center mb-2 space-y-1">
                <h3 className="text-xl font-extrabold text-slate-800">
                  사번 및 비밀번호 로그인
                </h3>
                <p className="text-xs text-slate-500">
                  병원 원내 계정 정보를 입력하세요.
                </p>
              </div>

              <div className="w-full space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    사원번호
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white/90 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700 shadow-2xs"
                      placeholder="사번 입력"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    비밀번호
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white/90 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700 shadow-2xs"
                      placeholder="비밀번호 입력"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 mt-2"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>로그인 인증 중...</span>
                  </>
                ) : (
                  <span>로그인</span>
                )}
              </button>
            </form>
          )}

          {/* TAB 3: Biometric Login */}
          {loginTab === 'bio' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 my-auto px-4 w-full max-w-xs animate-scale-up">
              <button
                onClick={handleBioLogin}
                disabled={isLoggingIn}
                className="group relative w-48 h-48 rounded-full bg-indigo-100/60 border border-white/80 shadow-inner flex flex-col items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <div className="flex justify-center space-x-2 mb-2">
                  <Fingerprint className="w-12 h-12 text-indigo-700 animate-pulse" />
                  <ScanFace className="w-12 h-12 text-indigo-700" />
                </div>
                <span className="text-xs font-extrabold text-indigo-900 bg-white/80 px-3 py-1 rounded-full border border-white">
                  터치하여 인증
                </span>
              </button>

              <div className="space-y-1">
                <h3 className="text-xl font-extrabold text-slate-800">
                  생체 인식 로그인
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  지문 또는 Face ID로 빠르게 로그인하세요.
                </p>
              </div>

              {isLoggingIn && (
                <div className="flex items-center space-x-2 text-indigo-900 font-extrabold text-xs bg-white/80 px-4 py-2 rounded-full shadow-xs border border-white">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-700" />
                  <span>생체 데이터 일치 확인 중...</span>
                </div>
              )}
            </div>
          )}

          {/* Bottom Version */}
          <div className="text-[11px] font-semibold text-slate-400 py-2">
            ver 2.1.24 · SOFTBOWL
          </div>
        </div>
      )}
    </div>
  );
};
