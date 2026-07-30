import React, { useState, useEffect, useRef } from 'react';
import { Patient, Prescription } from '../types';
import { X, Scan, CheckCircle2, Camera, RefreshCw } from 'lucide-react';

interface BarcodeScannerModalProps {
  patients: Patient[];
  prescriptions: Prescription[];
  onClose: () => void;
  onScanPatient: (patient: Patient) => void;
  onScanMedication: (prescription: Prescription, patient: Patient) => void;
  initialPatientId?: string;
  initialScanType?: 'PATIENT' | 'MEDICATION' | 'MONITOR';
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  patients,
  prescriptions,
  onClose,
  onScanPatient,
  onScanMedication,
  initialPatientId,
  initialScanType = 'PATIENT',
}) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    initialPatientId || (patients.length > 0 ? patients[0].id : '21212457')
  );
  const [selectedRxId, setSelectedRxId] = useState<string>('rx101');
  const [scanType, setScanType] = useState<'PATIENT' | 'MEDICATION' | 'MONITOR'>(
    initialScanType as 'PATIENT' | 'MEDICATION' | 'MONITOR'
  );
  const [isSimulatingScan, setIsSimulatingScan] = useState(false);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasCamera, setHasCamera] = useState(false);

  // Attempt real camera stream if available
  useEffect(() => {
    let stream: MediaStream | null = null;
    async function initCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setHasCamera(true);
          }
        }
      } catch (e) {
        setHasCamera(false);
      }
    }
    initCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleExecuteScan = () => {
    setIsSimulatingScan(true);
    setTimeout(() => {
      setIsSimulatingScan(false);
      const patient = patients.find((p) => p.id === selectedPatientId) || patients[0];

      if (scanType === 'PATIENT') {
        setScanSuccess(`[환자식별] ${patient.name} (${patient.roomBed}) 팔찌 바코드 확인`);
        setTimeout(() => {
          onScanPatient(patient);
        }, 700);
      } else if (scanType === 'MEDICATION') {
        const rx = prescriptions.find((r) => r.id === selectedRxId) || prescriptions[0];
        setScanSuccess(`[약품식별] ${rx.drugName} (${rx.orderedDose}${rx.unit}) 검증 완료`);
        setTimeout(() => {
          onScanMedication(rx, patient);
        }, 700);
      } else {
        // Monitor OCR V/S Scan
        setScanSuccess(`[V/S 촬영] 모니터 수치 (HR 84, SpO2 98%, NIBP 128/76) 인식 완료`);
        setTimeout(() => {
          onScanPatient(patient);
        }, 800);
      }
    }, 700);
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex justify-center items-center overflow-hidden">
      <div className="w-full max-w-md h-full max-h-[100dvh] bg-black flex flex-col justify-between overflow-hidden select-none font-sans relative shadow-2xl">
        {/* Top Header Bar - Exact match with user's design */}
      <div className="relative z-30 bg-[#1e3448]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-white/10 text-white">
        <div className="w-8" />
        <div className="flex items-center space-x-2.5 font-bold text-lg md:text-xl text-white tracking-wide">
          {/* Custom Bracket Scan Icon matching image */}
          <div className="relative w-6 h-6 flex items-center justify-center">
            <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white" />
            <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-white" />
            <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-white" />
            <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white" />
            <span className="w-2.5 h-[2px] bg-white rounded-full animate-pulse" />
          </div>
          <span>스캔/촬영</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          title="닫기"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Fullscreen Camera Viewport */}
      <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Real Live Camera Stream if active */}
        {hasCamera && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
        )}

        {/* Fallback Camera Background Simulation (Matching User Image Patient Bed & Monitor) */}
        {!hasCamera && (
          <div className="absolute inset-0 z-0 bg-slate-900 flex items-center justify-center overflow-hidden">
            {/* Background hospital room blurred backdrop */}
            <div
              className="absolute inset-0 bg-cover bg-center filter brightness-[0.6] scale-105"
              style={{
                backgroundImage:
                  'url("https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80")',
              }}
            />

            {/* Medical Patient Monitor Overlay Graphic inside viewport */}
            {scanType === 'MONITOR' ? (
              <div className="relative z-10 w-72 md:w-80 bg-black/90 border-4 border-slate-700 rounded-xl p-3 shadow-2xl text-white font-mono">
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1 mb-2">
                  <span className="font-bold text-emerald-400">PATIENT MONITOR #03</span>
                  <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[9px] font-sans">
                    BEDSIDE
                  </span>
                </div>
                {/* ECG Wave & Heart Rate */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                  <div className="flex-1">
                    <span className="text-[10px] text-emerald-400 font-sans block">ECG (BPM)</span>
                    <svg className="w-28 h-6 text-emerald-400 stroke-current fill-none" viewBox="0 0 100 24">
                      <path d="M0 12 L20 12 L25 4 L30 20 L35 2 L40 18 L45 12 L100 12" strokeWidth="2" />
                    </svg>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black text-emerald-400 tracking-tighter">84</span>
                  </div>
                </div>
                {/* SpO2 */}
                <div className="flex items-center justify-between border-b border-slate-800/80 py-1.5">
                  <div>
                    <span className="text-[10px] text-cyan-400 font-sans block">SpO2 %</span>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black text-cyan-400 tracking-tighter">98</span>
                  </div>
                </div>
                {/* NIBP */}
                <div className="flex items-center justify-between pt-1.5">
                  <div>
                    <span className="text-[10px] text-amber-300 font-sans block">NIBP (mmHg)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold text-amber-300">128 / 76</span>
                    <span className="text-[10px] text-slate-400 block">(92)</span>
                  </div>
                </div>
              </div>
            ) : scanType === 'PATIENT' ? (
              /* Patient Wristband Barcode Target Graphic */
              <div className="relative z-10 bg-white/95 text-slate-900 rounded-xl p-4 shadow-2xl border-2 border-slate-300 w-64 text-center">
                <div className="text-xs font-black bg-indigo-600 text-white py-1 px-2 rounded mb-2">
                  서울병원 환자식별 팔찌
                </div>
                <div className="font-extrabold text-lg text-slate-900">{selectedPatient.name} ({selectedPatient.gender}/{selectedPatient.age})</div>
                <div className="text-xs text-slate-600 font-mono font-bold mt-0.5">등록번호: {selectedPatient.id}</div>
                {/* Barcode Graphic */}
                <div className="my-3 flex justify-center items-center space-x-1 h-12 bg-slate-100 p-1 rounded">
                  <div className="w-1 h-10 bg-slate-900" />
                  <div className="w-2 h-10 bg-slate-900" />
                  <div className="w-0.5 h-10 bg-slate-900" />
                  <div className="w-1.5 h-10 bg-slate-900" />
                  <div className="w-2 h-10 bg-slate-900" />
                  <div className="w-1 h-10 bg-slate-900" />
                  <div className="w-0.5 h-10 bg-slate-900" />
                  <div className="w-2 h-10 bg-slate-900" />
                  <div className="w-1.5 h-10 bg-slate-900" />
                  <div className="w-1 h-10 bg-slate-900" />
                </div>
                <div className="text-[10px] text-slate-500 font-mono">*{selectedPatient.id}*</div>
              </div>
            ) : (
              /* Medication Package Barcode Target Graphic */
              <div className="relative z-10 bg-slate-900/90 text-white rounded-xl p-4 shadow-2xl border border-emerald-500/50 w-64 text-center">
                <div className="text-xs font-black bg-emerald-600 text-white py-1 px-2 rounded mb-2">
                  투약 바코드 검증
                </div>
                <div className="font-extrabold text-base text-emerald-300">휴물린-R 주사 (인슐린)</div>
                <div className="text-xs text-slate-300 font-mono mt-0.5">10 IU / Subcutaneously</div>
                {/* Barcode Graphic */}
                <div className="my-3 flex justify-center items-center space-x-1 h-12 bg-white p-1 rounded">
                  <div className="w-1 h-10 bg-slate-900" />
                  <div className="w-1.5 h-10 bg-slate-900" />
                  <div className="w-0.5 h-10 bg-slate-900" />
                  <div className="w-2 h-10 bg-slate-900" />
                  <div className="w-1 h-10 bg-slate-900" />
                  <div className="w-2 h-10 bg-slate-900" />
                  <div className="w-0.5 h-10 bg-slate-900" />
                  <div className="w-1 h-10 bg-slate-900" />
                </div>
                <div className="text-[10px] text-emerald-400 font-mono">2D GS1 DataMatrix</div>
              </div>
            )}
          </div>
        )}

        {/* Reticle Target Box Corners Overlay (matching white corner brackets in user screenshot) */}
        <div className="relative z-20 w-72 md:w-80 h-64 border-2 border-transparent flex items-center justify-center">
          {/* Top-Left Corner */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg drop-shadow-md" />
          {/* Top-Right Corner */}
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg drop-shadow-md" />
          {/* Bottom-Left Corner */}
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg drop-shadow-md" />
          {/* Bottom-Right Corner */}
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg drop-shadow-md" />

          {/* Red/Cyan Scanning Laser Line */}
          <div className="absolute inset-x-2 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-pulse" />

          {/* Scanning Progress Overlay */}
          {isSimulatingScan && (
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs rounded-lg flex flex-col items-center justify-center p-4 text-white z-30 animate-fade-in">
              <Scan className="w-10 h-10 text-cyan-400 animate-spin mb-2" />
              <span className="font-extrabold text-base tracking-wide text-cyan-300">
                인공지능 비전 디코딩 중...
              </span>
              <span className="text-xs text-slate-400 mt-1">PDA 하드웨어 모듈 응답 수신 중</span>
            </div>
          )}

          {scanSuccess && (
            <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-xs rounded-lg flex flex-col items-center justify-center p-4 text-white z-30 animate-scale-up">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2 animate-bounce" />
              <span className="font-bold text-sm text-center text-emerald-200">
                {scanSuccess}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Floating Control Panel */}
      <div className="relative z-30 bg-[#142331]/90 backdrop-blur-md px-4 py-4 border-t border-white/10 space-y-3">
        {/* Mode Selector Buttons */}
        <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-1 rounded-xl text-xs font-bold border border-white/10">
          <button
            onClick={() => setScanType('PATIENT')}
            className={`py-2 px-1 rounded-lg transition-all flex flex-col items-center space-y-1 ${
              scanType === 'PATIENT'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🏷️ 환자 팔찌</span>
          </button>
          <button
            onClick={() => setScanType('MEDICATION')}
            className={`py-2 px-1 rounded-lg transition-all flex flex-col items-center space-y-1 ${
              scanType === 'MEDICATION'
                ? 'bg-emerald-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>💊 약품 바코드</span>
          </button>
          <button
            onClick={() => setScanType('MONITOR')}
            className={`py-2 px-1 rounded-lg transition-all flex flex-col items-center space-y-1 ${
              scanType === 'MONITOR'
                ? 'bg-amber-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🩺 V/S 모니터</span>
          </button>
        </div>

        {/* Selected Target Patient Selector Dropdown */}
        <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
          <span>대상 환자:</span>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="bg-slate-800 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.wardRoom} {p.name} ({p.id})
              </option>
            ))}
          </select>
        </div>

        {/* Trigger Execute Button */}
        <button
          disabled={isSimulatingScan}
          onClick={handleExecuteScan}
          className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] text-white font-extrabold text-base rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
        >
          <Camera className="w-5 h-5 text-white" />
          <span>
            {scanType === 'PATIENT'
              ? '환자 팔찌 바코드 스캔'
              : scanType === 'MEDICATION'
              ? '약품 투약 바코드 검증'
              : '모니터 V/S 촬영 & OCR 인식'}
          </span>
        </button>
      </div>
    </div>
  </div>
);
};
