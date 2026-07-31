import React, { useState, useEffect } from 'react';
import { SplashAndLoginFlow } from './components/SplashAndLoginFlow';
import { PdaHeader } from './components/PdaHeader';
import { PdaFooter } from './components/PdaFooter';
import { PatientList } from './components/PatientList';
import { PatientDetailModal } from './components/PatientDetailModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { HamDoubleCheckModal } from './components/HamDoubleCheckModal';
import { DdiWarningModal } from './components/DdiWarningModal';
import { VitalSignsModal } from './components/VitalSignsModal';
import { TransfusionWorkflowModal } from './components/TransfusionWorkflowModal';
import { BloodSamplingView } from './components/BloodSamplingView';
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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userInfo, setUserInfo] = useState<{ name: string; id: string }>({ name: '이수진 N', id: 'N2341' });
  const [activeTab, setActiveTab] = useState<'patients' | 'worklist' | 'voice' | 'sbar' | 'pred'>('patients');
  
  // Data state with LocalStorage persistence
  const [patients, setPatients] = useState<Patient[]>(() => {
    const saved = localStorage.getItem('pda_patients_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_PATIENTS;
  });

  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => {
    const saved = localStorage.getItem('pda_prescriptions_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_PRESCRIPTIONS;
  });

  const [tasks, setTasks] = useState<WorklistTask[]>(() => {
    const saved = localStorage.getItem('pda_tasks_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_TASKS;
  });

  const [handovers, setHandovers] = useState<SbarHandover[]>(INITIAL_HANDOVERS);
  const [predictions, setPredictions] = useState<DeteriorationPrediction[]>(INITIAL_PREDICTIONS);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('pda_patients_v2', JSON.stringify(patients));
  }, [patients]);

  useEffect(() => {
    localStorage.setItem('pda_prescriptions_v2', JSON.stringify(prescriptions));
  }, [prescriptions]);

  useEffect(() => {
    localStorage.setItem('pda_tasks_v2', JSON.stringify(tasks));
  }, [tasks]);

  // Generate Random Patient
  const handleAddRandomPatient = () => {
    const familyNames = ['강', '윤', '송', '최', '백', '임', '조', '황', '류', '손', '문', '신', '권'];
    const firstNames = ['태우', '서아', '재현', '지은', '승민', '하나', '경호', '은지', '성진', '예진', '동현', '서연', '민준'];
    const doctors = [
      '내과/김전문의', '외과/이교수', '정형외과/박의사', '소화기내과/정교수',
      '신장내과/윤박사', '순환기내과/최교수', '신경외과/강전문의'
    ];
    const wards = ['32병동', '33병동', '51병동'];
    const bloodTypes = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-'];
    const statuses: ('정상' | '지연' | '긴급')[] = ['정상', '지연', '긴급'];

    const name = familyNames[Math.floor(Math.random() * familyNames.length)] +
                 firstNames[Math.floor(Math.random() * firstNames.length)];
    const id = '212' + Math.floor(10000 + Math.random() * 90000).toString();
    const roomBed = `30${Math.floor(Math.random() * 8) + 1}/0${Math.floor(Math.random() * 4) + 1}`;
    const age = Math.floor(Math.random() * 55) + 25;
    const gender: '남' | '여' = Math.random() > 0.5 ? '남' : '여';
    const birthYear = 2026 - age;
    const birthMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const birthDay = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    const birthDate = `${birthYear}/${birthMonth}/${birthDay}`;
    const isHam = Math.random() < 0.35; // 35% chance of HAM drug order

    const wardName = wards[Math.floor(Math.random() * wards.length)];
    const wardRoom = `${wardName} ${roomBed}`;

    // Task Options
    const taskOptions: ('투약' | 'VS' | '채혈' | '수혈')[] = ['투약', 'VS', '채혈', '수혈'];
    const chosenTaskType = taskOptions[Math.floor(Math.random() * taskOptions.length)];

    const newPatient: Patient = {
      id,
      name,
      gender,
      age,
      bloodType: bloodTypes[Math.floor(Math.random() * bloodTypes.length)],
      hdPod: `HD:${Math.floor(Math.random() * 5) + 1} / POD:${Math.floor(Math.random() * 4)}`,
      ward: wardName,
      roomBed,
      birthDate,
      doctor: doctors[Math.floor(Math.random() * doctors.length)],
      isVerified: true,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      isStarred: true,
      ewsScore: Math.floor(Math.random() * 4),
      vitals: {
        bp: `${110 + Math.floor(Math.random() * 30)}/${70 + Math.floor(Math.random() * 20)}`,
        hr: 65 + Math.floor(Math.random() * 30),
        rr: 14 + Math.floor(Math.random() * 8),
        bt: +(36.2 + Math.random() * 1.2).toFixed(1),
        spo2: 95 + Math.floor(Math.random() * 5),
      },
      cautionAlerts: [],
    };

    const newTasks: WorklistTask[] = [];

    if (chosenTaskType === '투약') {
      if (isHam) {
        const newRx: Prescription = {
          id: `rx-${Date.now()}`,
          patientId: id,
          drugCode: 'HAM-INS-02',
          drugName: '휴물린-R 주사 (고위험 인슐린)',
          orderedDose: 8,
          unit: 'IU',
          orderedRate: 2,
          route: 'IV Continuous',
          dueAt: '11:00 AM',
          isHam: true,
          hamCategory: 'INSULIN',
          anomalyMessage: '용량 및 체중 기준 2차 독립 이중확인 대상',
          status: 'ORDERED',
        };
        setPrescriptions((prev) => [newRx, ...prev]);

        newTasks.push({
          id: `task-${Date.now()}-1`,
          patientId: id,
          patientName: name,
          wardRoom,
          taskType: '투약',
          title: '고위험 인슐린 (휴물린-R) continuous 주입 점검 및 투약',
          dueAt: '11:00 AM (응급)',
          status: 'urgent',
          priorityScore: 95,
          reasons: ['고위험약물(HAM)', '2차 이중확인'],
          isHam: true,
          isPinned: true,
        });
      } else {
        const newRx: Prescription = {
          id: `rx-${Date.now()}`,
          patientId: id,
          drugCode: 'MED-REG-01',
          drugName: '아세트아미노펜 정 500mg',
          orderedDose: 500,
          unit: 'mg',
          route: 'PO',
          dueAt: '12:00 PM',
          isHam: false,
          status: 'ORDERED',
        };
        setPrescriptions((prev) => [newRx, ...prev]);

        newTasks.push({
          id: `task-${Date.now()}-1`,
          patientId: id,
          patientName: name,
          wardRoom,
          taskType: '투약',
          title: '정기 경구약 (아세트아미노펜) 투약',
          dueAt: '12:00 PM',
          status: 'normal',
          priorityScore: 50,
          reasons: ['정기 투약'],
        });
      }
    } else if (chosenTaskType === 'VS') {
      newTasks.push({
        id: `task-${Date.now()}-1`,
        patientId: id,
        patientName: name,
        wardRoom,
        taskType: 'VS',
        title: 'q4h Vital Signs 및 생체징후 정기 측정',
        dueAt: '11:30 AM',
        status: 'normal',
        priorityScore: 55,
        reasons: ['정기 생체징후 측정'],
      });
    } else if (chosenTaskType === '채혈') {
      newTasks.push({
        id: `task-${Date.now()}-1`,
        patientId: id,
        patientName: name,
        wardRoom,
        taskType: '채혈',
        title: 'Routine CBC, LFT, Electrolyte 응급 채혈',
        dueAt: '11:00 AM',
        status: 'urgent',
        priorityScore: 85,
        reasons: ['응급 채혈 지시'],
      });
    } else if (chosenTaskType === '수혈') {
      const newRx: Prescription = {
        id: `rx-${Date.now()}`,
        patientId: id,
        drugCode: 'HAM-BLD-02',
        drugName: '농축적혈구 (Packed RBC) 1Unit',
        orderedDose: 1,
        unit: 'Bag',
        orderedRate: 120,
        route: 'IV',
        dueAt: '11:15 AM',
        isHam: true,
        hamCategory: 'CHEMO',
        status: 'ORDERED',
      };
      setPrescriptions((prev) => [newRx, ...prev]);

      newTasks.push({
        id: `task-${Date.now()}-1`,
        patientId: id,
        patientName: name,
        wardRoom,
        taskType: '수혈',
        title: '농축적혈구 (pRBC) 수혈 이중확인 및 시작',
        dueAt: '11:15 AM',
        status: 'urgent',
        priorityScore: 90,
        reasons: ['고위험 혈액제제 수혈'],
        isHam: true,
      });
    }

    // Add secondary VS task 50% of the time if primary task wasn't VS
    if (chosenTaskType !== 'VS' && Math.random() < 0.5) {
      newTasks.push({
        id: `task-${Date.now()}-2`,
        patientId: id,
        patientName: name,
        wardRoom,
        taskType: 'VS',
        title: 'q4h Vital Signs 측정',
        dueAt: '12:00 PM',
        status: 'normal',
        priorityScore: 40,
        reasons: ['정기 측정'],
      });
    }

    setTasks((prev) => [...newTasks, ...prev]);
    setPatients((prev) => [newPatient, ...prev]);
    showToast(`🎲 임의 환자 [${name}]님 카드 및 업무리스트 연동 생성 완료!`);
  };

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
  const [activeBloodSamplingView, setActiveBloodSamplingView] = useState<{
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
    if (task.taskType === '채혈') {
      setActiveBloodSamplingView({ patient, task });
      return;
    }
    setScannerPatientId(patient.id);
    setIsScannerOpen(true);
  };

  // Handle scanned patient
  const handleScanPatient = (patient: Patient) => {
    setIsScannerOpen(false);
    const updatedPatient = { ...patient, isVerified: true };
    setPatients((prev) =>
      prev.map((p) => (p.id === patient.id ? updatedPatient : p))
    );
    setSelectedPatient(updatedPatient);
    setActiveBloodSamplingView((prev) => (prev ? { ...prev, patient: updatedPatient } : null));
    setActiveTransfusionModal((prev) => (prev ? { ...prev, patient: updatedPatient } : null));
    setActiveHamRx((prev) => (prev ? { ...prev, patient: updatedPatient } : null));
    showToast(`환자 바코드 인식 완료: ${patient.name}님 (환자 확인 됨)`);
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

    // Complete matching VS task
    setTasks((prev) => prev.filter((t) => !(t.patientId === record.patientId && t.taskType === 'VS')));

    showToast(`[${record.method} 기록] 활력징후(V/S) 측정이 성공적으로 저장되었습니다.`);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 flex justify-center text-slate-900 font-sans antialiased">
        {/* Industrial PDA Device Frame Shell */}
        <div className="w-full max-w-md bg-slate-100 min-h-screen flex flex-col relative shadow-2xl overflow-hidden">
          <SplashAndLoginFlow
            onLoginSuccess={(info) => {
              setUserInfo(info);
              setIsLoggedIn(true);
              showToast(`${info.name}님 반가워요! neo POCS v2 서비스가 시작되었습니다.`);
            }}
          />
        </div>
      </div>
    );
  }

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
          identifiedPatient={
            activeBloodSamplingView?.patient ||
            activeTransfusionModal?.patient ||
            activeHamRx?.patient ||
            selectedPatient ||
            null
          }
          currentTaskName={
            activeBloodSamplingView ? '채혈' :
            activeTransfusionModal ? '수혈' :
            activeHamRx ? '고위험약물' :
            '채혈'
          }
          onResetPatient={() => {
            setSelectedPatient(null);
            setActiveBloodSamplingView(null);
            setActiveTransfusionModal(null);
            setActiveHamRx(null);
            showToast('환자 선택이 초기화되었습니다.');
          }}
          onOpenVoiceModal={() => setActiveTab('voice')}
          onOpenScanner={() => setIsScannerOpen(true)}
          nurseName={userInfo.name}
          onLogout={() => {
            setIsLoggedIn(false);
            showToast('로그아웃 되었습니다.');
          }}
        />

        {/* Views Router */}
        <main className="flex-1 flex flex-col min-h-0 bg-slate-100">
          {activeBloodSamplingView ? (
            <BloodSamplingView
              patient={activeBloodSamplingView.patient}
              task={activeBloodSamplingView.task}
              onBack={() => setActiveBloodSamplingView(null)}
              onOpenScanner={() => {
                setScannerPatientId(activeBloodSamplingView.patient.id);
                setIsScannerOpen(true);
              }}
              onCompleteSampling={(taskId) => {
                if (taskId) {
                  handleCompleteTask(taskId);
                }
                setActiveBloodSamplingView(null);
                showToast('채혈 프로세스가 메인 업무영역에서 성공적으로 완료 및 이송 등록되었습니다.');
              }}
            />
          ) : activeTransfusionModal ? (
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
                  prescriptions={prescriptions}
                  tasks={tasks}
                  onSelectPatient={(patient) => {
                    setSelectedPatient(patient);
                    setScannerPatientId(patient.id);
                    setIsScannerOpen(true);
                  }}
                  onToggleStar={handleToggleStar}
                  onOpenVitals={(patientId) => setVitalsModalPatientId(patientId)}
                  onOpenBloodSampling={(patient) => setActiveBloodSamplingView({ patient })}
                  onOpenTransfusion={(patient) => setActiveTransfusionModal({ patient })}
                  onAddRandomPatient={handleAddRandomPatient}
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
            hasHamRx={prescriptions.some((r) => r.patientId === selectedPatient.id && r.isHam)}
            prescriptions={prescriptions}
            tasks={tasks}
            onClose={() => {
              setSelectedPatient(null);
            }}
            onOpenScanner={() => setIsScannerOpen(true)}
            onResetPatient={() => {
              setSelectedPatient(null);
              setActiveTab('patients');
              showToast('스캔된 환자 정보가 초기화되고 초기 화면으로 이동했습니다.');
            }}
            onProceedToMedication={(patient) => {
              setSelectedPatient(null);
              // Check if patient has HAM prescription
              const hamRx = prescriptions.find((r) => r.patientId === patient.id && r.isHam);
              if (hamRx) {
                setActiveHamRx({ rx: hamRx, patient });
              } else {
                setTasks((prev) => prev.filter((t) => !(t.patientId === patient.id && t.taskType === '투약')));
                setPrescriptions((prev) =>
                  prev.map((r) => (r.patientId === patient.id ? { ...r, status: 'ADMINISTERED' } : r))
                );
                showToast(`[5 Rights 투약 확인] ${patient.name} 환자 주의사항 및 5-Rights 검증 완료`);
              }
            }}
            onProceedToVitals={(patient) => {
              setSelectedPatient(null);
              setVitalsModalPatientId(patient.id);
            }}
            onProceedToBloodSampling={(patient) => {
              setSelectedPatient(null);
              setActiveBloodSamplingView({ patient });
            }}
            onProceedToTransfusion={(patient) => {
              setSelectedPatient(null);
              setActiveTransfusionModal({ patient });
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
              const patientId = activeHamRx.patient.id;
              const rxId = activeHamRx.rx.id;
              setTasks((prev) => prev.filter((t) => !(t.patientId === patientId && t.taskType === '투약')));
              setPrescriptions((prev) =>
                prev.map((r) => (r.id === rxId ? { ...r, status: 'ADMINISTERED' } : r))
              );
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

        {/* Transfusion Workflow Modal */}
        {activeTransfusionModal && (
          <TransfusionWorkflowModal
            patient={activeTransfusionModal.patient}
            task={activeTransfusionModal.task}
            onClose={() => setActiveTransfusionModal(null)}
            onCompleteTransfusion={(taskId) => {
              if (taskId) {
                handleCompleteTask(taskId);
              }
              setActiveTransfusionModal(null);
              showToast('수혈 이중확인 및 시작 등록이 완료되었습니다.');
            }}
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
