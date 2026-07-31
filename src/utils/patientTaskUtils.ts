import { Patient, Prescription, WorklistTask } from '../types';

export interface PatientBadges {
  hasHam: boolean;
  hasMedication: boolean;
  hasVs: boolean;
  hasBlood: boolean;
  hasTransfusion: boolean;
}

export function getPatientBadges(
  patient: Patient,
  prescriptions: Prescription[] = [],
  tasks: WorklistTask[] = []
): PatientBadges {
  const patientRxs = prescriptions.filter((r) => r.patientId === patient.id && r.status !== 'ADMINISTERED');
  const patientTasks = tasks.filter((t) => t.patientId === patient.id);

  const hasHam = patientRxs.some((r) => r.isHam) || patientTasks.some((t) => t.isHam);
  const hasMedication = patientTasks.some((t) => t.taskType === '투약') || patientRxs.some((r) => !r.drugName.includes('적혈구'));
  const hasVs = patientTasks.some((t) => t.taskType === 'VS');
  const hasBlood = patientTasks.some((t) => t.taskType === '채혈');
  const hasTransfusion = patientTasks.some((t) => t.taskType === '수혈') || patientRxs.some((r) => r.drugName.includes('적혈구'));

  return {
    hasHam,
    hasMedication,
    hasVs,
    hasBlood,
    hasTransfusion,
  };
}
