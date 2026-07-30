export type TaskStatus = 'urgent' | 'delayed' | 'normal' | 'completed';
export type TaskType = '투약' | 'VS' | '채혈' | '수혈';
export type VitalMeasurementMethod = 'BLE' | 'MANUAL' | 'VOICE';

export interface VitalSignRecord {
  id: string;
  patientId: string;
  measuredAt: string;
  method: VitalMeasurementMethod;
  bpSys: number;
  bpDia: number;
  hr: number;
  rr: number;
  bt: number;
  spo2: number;
  ewsScore: number;
  bleDeviceId?: string;
  voiceTranscript?: string;
  notes?: string;
}

export interface BleDeviceStatus {
  id: string;
  name: string;
  type: 'NIBP' | 'THERMO' | 'SPO2_PULSE';
  connected: boolean;
  batteryLevel: number;
  rssi: number;
  lastVal?: string;
}

export interface CautionAlert {
  id: string;
  type: 'ADR' | 'ALLERGY' | 'INFECTION';
  title: string;
  subtitle: string;
  detail: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  icon: string;
}

export interface Patient {
  id: string; // e.g., '21212457'
  name: string; // e.g., '김철수'
  gender: '남' | '여';
  age: number;
  bloodType: string; // e.g., 'B+'
  hdPod: string; // e.g., 'HD:5 / POD:4'
  ward: string; // e.g., '32병동'
  roomBed: string; // e.g., '302/01'
  birthDate: string; // e.g., '095/02/03'
  doctor: string; // e.g., '내과/김전문/주박사'
  isVerified: boolean;
  status: '긴급' | '지연' | '정상';
  isStarred?: boolean;
  cautionAlerts: CautionAlert[];
  vitals?: {
    bp: string;
    hr: number;
    rr: number;
    bt: number;
    spo2: number;
  };
  ewsScore: number;
}

export interface Prescription {
  id: string;
  patientId: string;
  drugCode: string; // e.g., 'INS-001'
  drugName: string; // e.g., '휴물린-N 주사 (인슐린)'
  orderedDose: number;
  unit: string; // e.g., 'IU', 'mg', 'mL/hr'
  orderedRate?: number;
  route: string; // e.g., 'SC', 'IV', 'PO'
  dueAt: string;
  isHam: boolean;
  hamCategory?: 'INSULIN' | 'HEPARIN' | 'KCL' | 'OPIOID' | 'CHEMO';
  anomalyMessage?: string;
  status: 'ORDERED' | 'PREPARED' | 'VERIFIED' | 'ADMINISTERED' | 'OVERRIDDEN';
  firstVerifier?: string;
  secondVerifier?: string;
  doubleCheckStatus?: 'PENDING' | 'MATCH' | 'MISMATCH' | 'SOLO_OVERRIDE';
}

export interface WorklistTask {
  id: string;
  patientId: string;
  patientName: string;
  wardRoom: string; // e.g., '32병동 302/01'
  taskType: TaskType;
  title: string;
  dueAt: string;
  status: TaskStatus;
  priorityScore: number; // 0 ~ 100
  reasons: string[]; // e.g., ['투약 마감 임박', '고위험약물(HAM)']
  isPinned?: boolean;
  isHam?: boolean;
}

export interface VoiceStructuredField {
  fieldCd: string;
  fieldLabel: string;
  value: string;
  needsReview: boolean;
}

export interface VoiceRecord {
  id: string;
  patientId: string;
  context: 'MED_NOTE' | 'VITAL' | 'OBSERVATION';
  rawText: string;
  structuredFields: VoiceStructuredField[];
  editedByUser: boolean;
  createdAt: string;
}

export interface SbarItem {
  id: string;
  text: string;
  sourceRef: string; // Grounding reference e.g., 'CLMA:VITAL#4819' or 'EMR:Diagnosis#2019'
  category: 'S' | 'B' | 'A' | 'R';
}

export interface SbarHandover {
  id: string;
  patientId: string;
  patientName: string;
  shiftFrom: string;
  shiftTo: string;
  nurseName: string;
  situation: SbarItem[];
  background: SbarItem[];
  assessment: SbarItem[];
  recommendation: SbarItem[];
  signedBy?: string;
  signedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  status: 'DRAFT' | 'SIGNED' | 'RECEIVED';
}

export interface DeteriorationPrediction {
  patientId: string;
  patientName: string;
  roomBed: string;
  riskScore: number; // 0~100
  level: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
  topFactors: string[];
  hrTrend: number[]; // chart data
  rrTrend: number[];
  wbcCount: number;
  rrtCallRecommended: boolean;
  rrtCalled: boolean;
  rrtCalledAt?: string;
}
