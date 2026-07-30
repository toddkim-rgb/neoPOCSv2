import React, { useState, useEffect } from 'react';
import { Patient, VitalSignRecord, VitalMeasurementMethod, BleDeviceStatus } from '../types';
import {
  Activity,
  Bluetooth,
  Mic,
  Edit3,
  X,
  CheckCircle2,
  Sparkles,
  Wifi,
  Battery,
  AlertTriangle,
  RefreshCw,
  Heart,
  Thermometer,
  Wind,
  Droplet,
  ChevronRight,
  Volume2,
  Save,
  Sliders,
} from 'lucide-react';

interface VitalSignsModalProps {
  patients: Patient[];
  selectedPatientId?: string;
  onClose: () => void;
  onSaveVital: (record: VitalSignRecord) => void;
}

export const VitalSignsModal: React.FC<VitalSignsModalProps> = ({
  patients,
  selectedPatientId: initialPatientId,
  onClose,
  onSaveVital,
}) => {
  const [patientId, setPatientId] = useState<string>(initialPatientId || patients[0]?.id || '21212457');
  const [activeMethod, setActiveMethod] = useState<VitalMeasurementMethod>('BLE');

  // Vital Parameters State
  const [bpSys, setBpSys] = useState<number>(128);
  const [bpDia, setBpDia] = useState<number>(82);
  const [hr, setHr] = useState<number>(76);
  const [rr, setRr] = useState<number>(16);
  const [bt, setBt] = useState<number>(36.8);
  const [spo2, setSpo2] = useState<number>(98);
  const [notes, setNotes] = useState<string>('');

  // BLE State
  const [isBleScanning, setIsBleScanning] = useState<boolean>(false);
  const [bleDevices, setBleDevices] = useState<BleDeviceStatus[]>([
    { id: 'ble-bp-01', name: 'NIBP-7000 (혈압계)', type: 'NIBP', connected: true, batteryLevel: 92, rssi: -58, lastVal: '128/82 mmHg' },
    { id: 'ble-bt-02', name: 'BT-200 (무선 체온계)', type: 'THERMO', connected: true, batteryLevel: 85, rssi: -62, lastVal: '36.8 ℃' },
    { id: 'ble-ox-03', name: 'SpO2-Pulse (산소포화도)', type: 'SPO2_PULSE', connected: true, batteryLevel: 78, rssi: -65, lastVal: '98% / 76bpm' },
  ]);

  // STT Voice State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>(
    '혈압 128에 82, 맥박 76회, 체온 36.8도, 산소포화도 98프로, 호흡수 16회 측정됨'
  );
  const [isParsingVoice, setIsParsingVoice] = useState<boolean>(false);

  // Current Patient
  const patient = patients.find((p) => p.id === patientId) || patients[0];

  // Calculate EWS Score dynamically
  const calculateEws = (sys: number, pulse: number, resp: number, temp: number, ox: number): number => {
    let score = 0;
    // Systolic BP
    if (sys <= 90 || sys >= 180) score += 3;
    else if (sys <= 100 || sys >= 140) score += 1;

    // Heart Rate
    if (pulse <= 40 || pulse >= 130) score += 3;
    else if (pulse <= 50 || pulse >= 100) score += 1;

    // Resp Rate
    if (resp <= 8 || resp >= 25) score += 3;
    else if (resp <= 11 || resp >= 21) score += 1;

    // Body Temp
    if (temp <= 35.0 || temp >= 39.1) score += 3;
    else if (temp <= 36.0 || temp >= 38.0) score += 1;

    // SpO2
    if (ox <= 91) score += 3;
    else if (ox <= 93) score += 2;
    else if (ox <= 95) score += 1;

    return score;
  };

  const ewsScore = calculateEws(bpSys, hr, rr, bt, spo2);

  // Trigger BLE Scan & Auto Sync
  const handleBleAutoSync = () => {
    setIsBleScanning(true);
    setTimeout(() => {
      // Simulate slight randomized variation from medical sensors
      const newSys = 120 + Math.floor(Math.random() * 15);
      const newDia = 75 + Math.floor(Math.random() * 10);
      const newHr = 72 + Math.floor(Math.random() * 12);
      const newBt = Number((36.5 + Math.random() * 0.6).toFixed(1));
      const newSpo2 = 97 + Math.floor(Math.random() * 3);
      const newRr = 15 + Math.floor(Math.random() * 3);

      setBpSys(newSys);
      setBpDia(newDia);
      setHr(newHr);
      setBt(newBt);
      setSpo2(newSpo2);
      setRr(newRr);

      setBleDevices((prev) =>
        prev.map((d) => {
          if (d.type === 'NIBP') return { ...d, lastVal: `${newSys}/${newDia} mmHg` };
          if (d.type === 'THERMO') return { ...d, lastVal: `${newBt} ℃` };
          if (d.type === 'SPO2_PULSE') return { ...d, lastVal: `${newSpo2}% / ${newHr}bpm` };
          return d;
        })
      );

      setIsBleScanning(false);
    }, 1200);
  };

  // Voice STT Parse trigger via Gemini API
  const handleVoiceParse = async () => {
    setIsParsingVoice(true);
    try {
      const res = await fetch('/api/v1/vitals/voice-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: voiceTranscript }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.bpSys) setBpSys(data.data.bpSys);
        if (data.data.bpDia) setBpDia(data.data.bpDia);
        if (data.data.hr) setHr(data.data.hr);
        if (data.data.rr) setRr(data.data.rr);
        if (data.data.bt) setBt(data.data.bt);
        if (data.data.spo2) setSpo2(data.data.spo2);
      }
    } catch (err) {
      console.error('Voice parse error:', err);
    } finally {
      setIsParsingVoice(false);
    }
  };

  // Final Commit Save
  const handleSave = async () => {
    const record: VitalSignRecord = {
      id: `VS-${Date.now()}`,
      patientId: patient.id,
      measuredAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      method: activeMethod,
      bpSys,
      bpDia,
      hr,
      rr,
      bt,
      spo2,
      ewsScore,
      notes,
      voiceTranscript: activeMethod === 'VOICE' ? voiceTranscript : undefined,
    };

    try {
      await fetch('/api/v1/vitals/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch (e) {
      console.error(e);
    }

    onSaveVital(record);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 select-none overflow-y-auto">
      <div className="bg-slate-900 text-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-3.5 bg-slate-800 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-sky-400 animate-pulse" />
            <h2 className="font-bold text-base text-slate-100">VS (활력징후) 측정 & 기록</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Patient Selection Bar */}
        <div className="bg-slate-800/60 p-3 border-b border-slate-700 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">대상 환자 선택</span>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="bg-slate-900 text-white border border-slate-700 rounded-lg p-1.5 font-bold text-xs"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.roomBed}] {p.name} ({p.gender}/{p.age}세)
                </option>
              ))}
            </select>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-bold">계산된 NEWS2/EWS</span>
            <span
              className={`inline-block px-2.5 py-0.5 rounded-md font-extrabold text-xs mt-0.5 ${
                ewsScore >= 5
                  ? 'bg-rose-600 text-white animate-pulse'
                  : ewsScore >= 3
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {ewsScore}점 ({ewsScore >= 5 ? '고위험' : ewsScore >= 3 ? '주의' : '정상'})
            </span>
          </div>
        </div>

        {/* 3 Recording Method Tabs */}
        <div className="grid grid-cols-3 bg-slate-950 p-1 border-b border-slate-800 text-xs font-bold">
          <button
            onClick={() => setActiveMethod('BLE')}
            className={`py-2.5 rounded-xl flex items-center justify-center space-x-1 transition-all ${
              activeMethod === 'BLE'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bluetooth className="w-4 h-4 text-sky-300" />
            <span>BLE 자동측정</span>
          </button>

          <button
            onClick={() => setActiveMethod('MANUAL')}
            className={`py-2.5 rounded-xl flex items-center justify-center space-x-1 transition-all ${
              activeMethod === 'MANUAL'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Edit3 className="w-4 h-4 text-indigo-300" />
            <span>수동 입력</span>
          </button>

          <button
            onClick={() => setActiveMethod('VOICE')}
            className={`py-2.5 rounded-xl flex items-center justify-center space-x-1 transition-all ${
              activeMethod === 'VOICE'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="w-4 h-4 text-purple-300" />
            <span>음성 입력 (STT)</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-3.5 space-y-4 overflow-y-auto flex-1 bg-slate-900">
          {/* METHOD 1: BLE AUTOMATIC MEASUREMENT */}
          {activeMethod === 'BLE' && (
            <div className="space-y-3.5">
              {/* BLE Banner */}
              <div className="bg-gradient-to-r from-blue-950 to-slate-900 border border-blue-700 p-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bluetooth className="w-5 h-5 text-blue-400 animate-pulse" />
                  <div>
                    <span className="text-xs font-bold text-blue-200 block">무선 생체센서 BLE 네트워크</span>
                    <span className="text-[10px] text-slate-400">의료기기 ISO 11073 표준 연동 중</span>
                  </div>
                </div>
                <button
                  onClick={handleBleAutoSync}
                  disabled={isBleScanning}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-lg shadow-sm flex items-center space-x-1 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isBleScanning ? 'animate-spin' : ''}`} />
                  <span>{isBleScanning ? '측정 수신중...' : '자동 수치 불러오기'}</span>
                </button>
              </div>

              {/* Connected BLE Devices Status Cards */}
              <div className="space-y-2">
                {bleDevices.map((dev) => (
                  <div
                    key={dev.id}
                    className="bg-slate-800/80 border border-slate-700 p-2.5 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-950 border border-blue-600/50 flex items-center justify-center text-blue-400">
                        {dev.type === 'NIBP' && <Heart className="w-4 h-4 text-rose-400" />}
                        {dev.type === 'THERMO' && <Thermometer className="w-4 h-4 text-amber-400" />}
                        {dev.type === 'SPO2_PULSE' && <Droplet className="w-4 h-4 text-sky-400" />}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-100">{dev.name}</div>
                        <div className="text-[10px] text-emerald-400 font-semibold flex items-center space-x-2">
                          <span className="flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            <span>연결됨</span>
                          </span>
                          <span className="text-slate-400">| 배터리 {dev.batteryLevel}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono font-extrabold text-sm text-sky-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700">
                      {dev.lastVal}
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Sensor Values Display */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-[10px] font-bold flex items-center space-x-1">
                    <Heart className="w-3.5 h-3.5 text-rose-400" />
                    <span>혈압 (NIBP)</span>
                  </div>
                  <div className="font-mono font-black text-lg text-white mt-1">
                    {bpSys} / {bpDia} <span className="text-xs font-normal text-slate-400">mmHg</span>
                  </div>
                </div>

                <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-[10px] font-bold flex items-center space-x-1">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    <span>심박수 (HR)</span>
                  </div>
                  <div className="font-mono font-black text-lg text-white mt-1">
                    {hr} <span className="text-xs font-normal text-slate-400">bpm</span>
                  </div>
                </div>

                <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-[10px] font-bold flex items-center space-x-1">
                    <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                    <span>체온 (BT)</span>
                  </div>
                  <div className="font-mono font-black text-lg text-white mt-1">
                    {bt} <span className="text-xs font-normal text-slate-400">℃</span>
                  </div>
                </div>

                <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-[10px] font-bold flex items-center space-x-1">
                    <Droplet className="w-3.5 h-3.5 text-sky-400" />
                    <span>산소포화도 (SpO2)</span>
                  </div>
                  <div className="font-mono font-black text-lg text-white mt-1">
                    {spo2} <span className="text-xs font-normal text-slate-400">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* METHOD 2: MANUAL INPUT */}
          {activeMethod === 'MANUAL' && (
            <div className="space-y-3">
              {/* Blood Pressure Input */}
              <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span className="flex items-center space-x-1">
                    <Heart className="w-4 h-4 text-rose-400" />
                    <span>혈압 (수축기 / 이완기) [mmHg]</span>
                  </span>
                  <span className="text-[10px] text-slate-400">정상 범위: 120/80</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">수축기 (Sys)</span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setBpSys(Math.max(60, bpSys - 5))}
                        className="w-8 h-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-sm"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={bpSys}
                        onChange={(e) => setBpSys(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-1.5 font-mono text-center font-bold text-base text-sky-300"
                      />
                      <button
                        onClick={() => setBpSys(Math.min(220, bpSys + 5))}
                        className="w-8 h-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">이완기 (Dia)</span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setBpDia(Math.max(40, bpDia - 5))}
                        className="w-8 h-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-sm"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={bpDia}
                        onChange={(e) => setBpDia(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-1.5 font-mono text-center font-bold text-base text-sky-300"
                      />
                      <button
                        onClick={() => setBpDia(Math.min(140, bpDia + 5))}
                        className="w-8 h-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Heart Rate & Resp Rate Input */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 space-y-1">
                  <span className="text-[11px] font-bold text-slate-300 block">심박수 (HR - bpm)</span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setHr(Math.max(30, hr - 2))}
                      className="w-7 h-7 bg-slate-700 text-white rounded font-bold text-xs"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={hr}
                      onChange={(e) => setHr(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-600 rounded p-1 font-mono text-center font-bold text-sm text-amber-300"
                    />
                    <button
                      onClick={() => setHr(Math.min(200, hr + 2))}
                      className="w-7 h-7 bg-slate-700 text-white rounded font-bold text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 space-y-1">
                  <span className="text-[11px] font-bold text-slate-300 block">호흡수 (RR - rpm)</span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setRr(Math.max(5, rr - 1))}
                      className="w-7 h-7 bg-slate-700 text-white rounded font-bold text-xs"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={rr}
                      onChange={(e) => setRr(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-600 rounded p-1 font-mono text-center font-bold text-sm text-indigo-300"
                    />
                    <button
                      onClick={() => setRr(Math.min(50, rr + 1))}
                      className="w-7 h-7 bg-slate-700 text-white rounded font-bold text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Body Temp & SpO2 Input */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 space-y-1">
                  <span className="text-[11px] font-bold text-slate-300 block">체온 (BT - ℃)</span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setBt(Number((bt - 0.2).toFixed(1)))}
                      className="w-7 h-7 bg-slate-700 text-white rounded font-bold text-xs"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.1"
                      value={bt}
                      onChange={(e) => setBt(Number(e.target.value))}
                      className={`w-full bg-slate-900 border rounded p-1 font-mono text-center font-bold text-sm ${
                        bt >= 38.0 ? 'border-rose-500 text-rose-400' : 'border-slate-600 text-emerald-300'
                      }`}
                    />
                    <button
                      onClick={() => setBt(Number((bt + 0.2).toFixed(1)))}
                      className="w-7 h-7 bg-slate-700 text-white rounded font-bold text-xs"
                    >
                      +
                    </button>
                  </div>
                  {bt >= 38.0 && <span className="text-[10px] text-rose-400 font-bold block">🚨 고열 경고</span>}
                </div>

                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 space-y-1">
                  <span className="text-[11px] font-bold text-slate-300 block">산소포화도 (SpO2 - %)</span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setSpo2(Math.max(70, spo2 - 1))}
                      className="w-7 h-7 bg-slate-700 text-white rounded font-bold text-xs"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={spo2}
                      onChange={(e) => setSpo2(Number(e.target.value))}
                      className={`w-full bg-slate-900 border rounded p-1 font-mono text-center font-bold text-sm ${
                        spo2 < 95 ? 'border-amber-500 text-amber-300' : 'border-slate-600 text-sky-300'
                      }`}
                    />
                    <button
                      onClick={() => setSpo2(Math.min(100, spo2 + 1))}
                      className="w-7 h-7 bg-slate-700 text-white rounded font-bold text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* METHOD 3: VOICE INPUT (STT) */}
          {activeMethod === 'VOICE' && (
            <div className="space-y-3">
              {/* Voice PTT Mic Button */}
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-purple-800/50 flex flex-col items-center justify-center space-y-3 text-center">
                <button
                  onClick={() => setIsRecording(!isRecording)}
                  className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                    isRecording
                      ? 'bg-rose-600 text-white animate-pulse ring-8 ring-rose-300'
                      : 'bg-purple-600 hover:bg-purple-500 text-white active:scale-95'
                  }`}
                >
                  <Mic className="w-8 h-8" />
                </button>
                <div className="text-xs font-bold text-slate-200">
                  {isRecording ? '🎙️ 음성 인식 중... (다시 누르면 완료)' : 'Push-To-Talk 활력징후 말하기'}
                </div>
                <div className="text-[10px] text-slate-400">
                  예: "혈압 128에 82, 심박수 76회, 체온 36.8도, 산소 98프로"
                </div>
              </div>

              {/* Transcript Textarea & Gemini Parser */}
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span className="flex items-center space-x-1">
                    <Volume2 className="w-4 h-4 text-purple-400" />
                    <span>인식된 STT 음성 텍스트</span>
                  </span>
                  <button
                    onClick={handleVoiceParse}
                    disabled={isParsingVoice}
                    className="text-amber-400 hover:underline flex items-center space-x-1 text-xs font-bold"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isParsingVoice ? '구조화 중...' : 'AI 수치 추출'}</span>
                  </button>
                </div>

                <textarea
                  rows={2}
                  value={voiceTranscript}
                  onChange={(e) => setVoiceTranscript(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-medium text-slate-100 leading-relaxed"
                />
              </div>

              {/* Extracted Values Display Card */}
              <div className="bg-slate-950 p-3 rounded-xl border border-purple-900 space-y-2 text-xs">
                <div className="font-bold text-purple-300 flex items-center justify-between border-b border-purple-950 pb-1.5">
                  <span className="flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>AI 파싱 완료 항목</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800">
                    검토 완료
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    혈압: <span className="font-bold font-mono text-white">{bpSys}/{bpDia} mmHg</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    심박수: <span className="font-bold font-mono text-white">{hr} bpm</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    체온: <span className="font-bold font-mono text-white">{bt} ℃</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    산소포화도: <span className="font-bold font-mono text-white">{spo2} %</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Optional Nurse Note */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400">간호 관찰 메모 (선택사항)</label>
            <input
              type="text"
              placeholder="예: 수술 부위 통증 완화, 오한 호전됨"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-2 text-xs font-medium"
            />
          </div>

          {/* Action Confirm Button */}
          <button
            onClick={handleSave}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 text-xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>[{activeMethod}] 활력징후 측정 수치 EMR 확정 저장</span>
          </button>
        </div>
      </div>
    </div>
  );
};
