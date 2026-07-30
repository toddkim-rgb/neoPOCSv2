import React, { useState, useEffect } from 'react';
import { PdaHeader } from './components/PdaHeader';
import { PdaFooter } from './components/PdaFooter';
import { PatientList } from './components/PatientList';
import { PatientDetailModal } from './components/PatientDetailModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { HamDoubleCheckModal } from './components/HamDoubleCheckModal';
import { DdiWarningModal } from './components/DdiWarningModal';
import { VitalSignsModal } from './components/VitalSignsModal';
import { TransfusionWorkflowModal } from './components/TransfusionWorkflowModal';
import { WorklistView } from './components/WorklistView';
import { VoiceRecordView } from './components/VoiceRecordView';
import { SbarHandoverView } from './components/SbarHandoverView';
import { DeteriorationView } from './components/DeteriorationView';

import {
  Patient,
  Prescription,
  WorklistTask,
  VoiceRecord,
  SbarHandover,
  DeteriorationPrediction,
  VitalSignRecord,
} from './types';

import {
  INITIAL_PATIENTS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_TASKS,
  INITIAL_HANDOVERS,
  INITIAL_PREDICTIONS,
} from './mockData';

export default function App() {
  const [activeTab, setActiveTab] = useState<'patients' | 'worklist' | 'voice' | 'sbar' | 'pred'>('patients');
  
  // Data state
  const [patients, setPatients] = useState<Patient[]>(INITIAL_PATIENTS);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(INITIAL_PRESCRIPTIONS);
  const [tasks, setTasks] = useState<WorklistTask[]>(INITIAL_TASKS);
  const [handovers, setHandovers] = useState<SbarHandover[]>(INITIAL_HANDOVERS);
  const [predictions, setPredictions] = useState<DeteriorationPrediction[]>(INITIAL_PREDICTIONS);

  // Modals
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [vitalsModalPatientId, setVitalsModalPatientId] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [activeHamRx, setActiveHamRx] = useState<{ rx: Prescription; patient: Patient } | null>(null);
  const [activeDdiConflict, setActiveDdiConflict] = useState<{
    patient: Patient;
    drugName: string;
    alerts: any[];
  } | null>(null);
  const [activeTransfusionModal, setActiveTransfusionModal] = useState<{
    patient: Patient;
    task?: WorklistTask;
  } | null>(null);

  // Success toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Star / Pin patient
  const handleToggleStar = (patientId: string) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === patientId ? { ...p, isStarred: !p.isStarred } : p))
    );
  };

  // Task Pin / Complete / Execute
  const handleToggleTaskPin = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, isPinned: !t.isPinned } : t))
    );
  };

  const [scannerPatientId, setScannerPatientId] = useState<string | null>(null);

  const handleCompleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    showToast('업무가 성공적으로 완료 처리되었습니다.');
  };

  const handleExecuteTask = (task: WorklistTask) => {
    const patient = patients.find((p) => p.id === task.patientId) || patients[0];
    if (task.taskType === '수혈') {
      setActiveTransfusionModal({ patient, task });
      return;
    }
    setScannerPatientId(patient.id);
    setIsScannerOpen(true);
  };

  // Handle scanned patient
  const handleScanPatient = (patient: Patient) => {
    setIsScannerOpen(false);
    setSelectedPatient(patient);
    showToast(`환자 바코드 인식 완료: ${patient.name}님 (${patient.roomBed})`);
  };

  // Handle scanned medication (5-Rights, DDI Check, HAM Check)
  const handleScanMedication = async (rx: Prescription, patient: Patient) => {
    setIsScannerOpen(false);

    // DDI & Allergy Check via API
    try {
      const res = await fetch('/api/v1/medication/interaction-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          drugCode: rx.drugCode,
          drugName: rx.drugName,
        }),
      });
      const data = await res.json();

      if (data.success && data.data.alerts && data.data.alerts.length > 0) {
        setActiveDdiConflict({
          patient,
          drugName: rx.drugName,
          alerts: data.data.alerts,
        });
        return;
      }
    } catch (err) {
      console.error('DDI check error:', err);
    }

    // HAM Check if no DDI hard stop
    if (rx.isHam) {
      setActiveHamRx({ rx, patient });
    } else {
      showToast(`[5 Rights 통과] ${rx.drugName} 정상 검증되었습니다.`);
    }
  };

  // Handover Sign
  const handleSignHandover = (handoverId: string, signedBy: string, receivedBy: string) => {
    setHandovers((prev) =>
      prev.map((h) =>
        h.id === handoverId
          ? { ...h, status: 'SIGNED', signedBy, receivedBy, signedAt: new Date().toISOString() }
          : h
      )
    );
    showToast('SBAR 교대 인계서 전자서명 전송 완료');
  };

  // RRT Call Trigger
  const handleTriggerRrtCall = (patientId: string) => {
    showToast('🚨 신속대응팀(RRT) 및 당직의 emergency 호출이 전송되었습니다.');
  };

  // Vital Signs save handler
  const handleSaveVital = (record: VitalSignRecord) => {
    setPatients((prev) =>
      prev.map((p) => {
        if (p.id === record.patientId) {
          return {
            ...p,
            vitals: {
              bp: `${record.bpSys}/${record.bpDia}`,
              hr: record.hr,
              rr: record.rr,
              bt: record.bt,
              spo2: record.spo2,
            },
            ewsScore: record.ewsScore,
            status: record.ewsScore >= 5 ? '긴급' : record.ewsScore >= 3 ? '지연' : '정상',
          };
        }
        return p;
      })
    );

    // Complete matching VS task if present
    setTasks((prev) => prev.filter((t) => !(t.patientId === record.patientId && t.taskType === 'VS')));

    showToast(`[${record.method} 기록] 활력징후(V/S) 측정이 성공적으로 저장되었습니다.`);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex justify-center text-slate-900 font-sans antialiased">
      {/* Industrial PDA Device Frame Shell */}
      <div className="w-full max-w-md bg-slate-100 min-h-screen flex flex-col relative shadow-2xl overflow-x-hidden">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl border border-slate-700 animate-bounce">
            {toastMessage}
          </div>
        )}

        {/* Industrial PDA Header */}
        <PdaHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedPatientName={selectedPatient?.name}
          onBackToPatients={() => setSelectedPatient(null)}
          onOpenVoiceModal={() => setActiveTab('voice')}
        />

        {/* Views Router */}
        <main className="flex-1 flex flex-col min-h-0 bg-slate-100">
          {activeTransfusionModal ? (
            <TransfusionWorkflowModal
              patient={activeTransfusionModal.patient}
              task={activeTransfusionModal.task}
              onClose={() => setActiveTransfusionModal(null)}
              onCompleteTransfusion={(taskId) => {
                setActiveTransfusionModal(null);
                if (taskId) {
                  handleCompleteTask(taskId);
                } else {
                  showToast('수혈 업무 5단계가 성공적으로 완료 및 전송되었습니다.');
                }
              }}
            />
          ) : (
            <>
              {activeTab === 'patients' && (
                <PatientList
                  patients={patients}
                  onSelectPatient={(patient) => setSelectedPatient(patient)}
                  onToggleStar={handleToggleStar}
                  onOpenVitals={(patientId) => setVitalsModalPatientId(patientId)}
                />
              )}

              {activeTab === 'worklist' && (
                <WorklistView
                  tasks={tasks}
                  onTogglePin={handleToggleTaskPin}
                  onCompleteTask={handleCompleteTask}
                  onExecuteTask={handleExecuteTask}
                />
              )}

              {activeTab === 'voice' && (
                <VoiceRecordView
                  patients={patients}
                  onSaveRecord={(record) => {
                    showToast('음성 구조화 간호 기록 확정 저장 완료');
                  }}
                />
              )}

              {activeTab === 'sbar' && (
                <SbarHandoverView
                  patients={patients}
                  handovers={handovers}
                  onSignHandover={handleSignHandover}
                />
              )}

              {activeTab === 'pred' && (
                <DeteriorationView
                  patients={patients}
                  predictions={predictions}
                  onTriggerRrtCall={handleTriggerRrtCall}
                />
              )}
            </>
          )}
        </main>

        {/* Patient Detail Modal matching Screenshot #2 */}
        {selectedPatient && (
          <PatientDetailModal
            patient={selectedPatient}
            onClose={() => {
              setSelectedPatient(null);
            }}
            onResetPatient={() => {
              setSelectedPatient(null);
              setActiveTab('patients');
              showToast('스캔된 환자 정보가 초기화되고 초기 화면으로 이동했습니다.');
            }}
            onProceedToMedication={(patient) => {
              setSelectedPatient(null);
              // Check if patient has any active prescription
              const rx = prescriptions.find((r) => r.patientId === patient.id) || prescriptions[0];
              if (rx.isHam) {
                setActiveHamRx({ rx, patient });
              } else {
                showToast(`[5 Rights 투약 확인] ${patient.name} 환자 주의사항 확인 완료`);
              }
            }}
          />
        )}

        {/* MOD-HAM Double Check Modal */}
        {activeHamRx && (
          <HamDoubleCheckModal
            patient={activeHamRx.patient}
            prescription={activeHamRx.rx}
            onClose={() => setActiveHamRx(null)}
            onCompleteSuccess={() => {
              setActiveHamRx(null);
              showToast('HAM 고위험약물 이중확인 및 투약 완료');
            }}
          />
        )}

        {/* MOD-DDI Warning Modal */}
        {activeDdiConflict && (
          <DdiWarningModal
            patient={activeDdiConflict.patient}
            drugName={activeDdiConflict.drugName}
            alerts={activeDdiConflict.alerts}
            onClose={() => setActiveDdiConflict(null)}
            onProceedWithOverride={() => {
              const patient = activeDdiConflict.patient;
              const rx = prescriptions.find((r) => r.patientId === patient.id) || prescriptions[0];
              setActiveDdiConflict(null);
              if (rx.isHam) {
                setActiveHamRx({ rx, patient });
              } else {
                showToast('DDI/알레르기 예외 사유 기록 후 진행되었습니다.');
              }
            }}
          />
        )}

        {/* Vital Signs Measurement Modal */}
        {vitalsModalPatientId && (
          <VitalSignsModal
            patients={patients}
            selectedPatientId={vitalsModalPatientId}
            onClose={() => setVitalsModalPatientId(null)}
            onSaveVital={handleSaveVital}
          />
        )}

        {/* Barcode Scanner Trigger Modal */}
        {isScannerOpen && (
          <BarcodeScannerModal
            patients={patients}
            prescriptions={prescriptions}
            initialPatientId={scannerPatientId || undefined}
            initialScanType="PATIENT"
            onClose={() => {
              setIsScannerOpen(false);
              setScannerPatientId(null);
            }}
            onScanPatient={(patient) => {
              setScannerPatientId(null);
              handleScanPatient(patient);
            }}
            onScanMedication={(prescription, patient) => {
              setScannerPatientId(null);
              handleScanMedication(prescription, patient);
            }}
          />
        )}

        {/* Bottom Persistent Barcode Scanner Trigger Footer */}
        <PdaFooter onOpenScanner={() => setIsScannerOpen(true)} />
      </div>
    </div>
  );
}
