import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  INITIAL_PATIENTS,
  INITIAL_PRESCRIPTIONS,
  INITIAL_TASKS,
  INITIAL_HANDOVERS,
  INITIAL_PREDICTIONS,
  INITIAL_NURSE_INFO,
} from './src/mockData.js';

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client server-side
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is missing. AI fallback mechanisms will be used.');
  }
  return new GoogleGenAI({
    apiKey: apiKey || 'dummy-key-for-init',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// In-memory DB state
let patients = [...INITIAL_PATIENTS];
let prescriptions = [...INITIAL_PRESCRIPTIONS];
let tasks = [...INITIAL_TASKS];
let handovers = [...INITIAL_HANDOVERS];
let predictions = [...INITIAL_PREDICTIONS];

// --- API ENDPOINTS ---

// 1. Get Nurse Info & Patients
app.get('/api/v1/nurse/profile', (req, res) => {
  res.json({ success: true, data: INITIAL_NURSE_INFO });
});

app.get('/api/v1/patients', (req, res) => {
  res.json({ success: true, data: patients });
});

app.get('/api/v1/patients/:id', (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }
  res.json({ success: true, data: patient });
});

// 2. MOD-HAM: High Alert Medication Check API
app.post('/api/v1/medication/ham-check', async (req, res) => {
  const { patientId, drugCode, orderedDose, orderedRate, route } = req.body;
  
  const prescription = prescriptions.find((p) => p.drugCode === drugCode || p.patientId === patientId);
  const patient = patients.find((p) => p.id === patientId);

  const isHam = drugCode.startsWith('HAM-') || (prescription && prescription.isHam) || false;
  let anomalyMessage = null;

  if (isHam && process.env.GEMINI_API_KEY) {
    try {
      const ai = getAiClient();
      const prompt = `
당신은 병원 투약 안전 AI 보조시스템입니다.
환자정보: ${patient?.name} (${patient?.age}세, ${patient?.gender}, 체중 68kg추정, EWS ${patient?.ewsScore}점)
약품정보: 코드 ${drugCode}, 용량 ${orderedDose}, 속도 ${orderedRate || 'N/A'}, 투여경로 ${route}

이 약물이 고위험약물(HAM)일 때, 환자의 연령, 체중, 신기능, 주의사항을 고려할 때 용량/투여속도 상한선 초과나 이상치 경고가 필요한지 1~2문장으로 한국어로 간결하게 진단해주세요.
JSON 형식으로 답변하세요:
{"hasAnomaly": true/false, "message": "경고 메시지"}
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hasAnomaly: { type: Type.BOOLEAN },
              message: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.hasAnomaly) {
        anomalyMessage = parsed.message;
      }
    } catch (err) {
      console.error('HAM AI Check Error:', err);
      anomalyMessage = '체중(68kg) 및 신기능 기준 표준 용량 범위 재확인 필요 (시스템 룰)';
    }
  } else if (isHam) {
    anomalyMessage = prescription?.anomalyMessage || '고위험 약물 투약 전 2차 간호사 이중확인(Double Check) 필수';
  }

  res.json({
    success: true,
    data: {
      isHam,
      hamCategory: prescription?.hamCategory || 'INSULIN',
      anomaly: anomalyMessage ? { doseAnomaly: true, message: anomalyMessage } : null,
      requireDoubleCheck: isHam,
    },
  });
});

// 3. MOD-HAM: Double Check 2nd Nurse Blind Verification API
app.post('/api/v1/medication/double-check', (req, res) => {
  const { prescriptionId, firstNurseId, secondNurseId, verifiedDose, isSoloOverride, overrideReason } = req.body;

  if (!isSoloOverride && firstNurseId === secondNurseId) {
    return res.status(403).json({
      success: false,
      message: '1차 간호사와 2차 간호사는 동일인일 수 없습니다. 독립된 2차 간호사의 ID로 인증하세요.',
    });
  }

  const rx = prescriptions.find((p) => p.id === prescriptionId);
  if (rx) {
    if (isSoloOverride) {
      rx.status = 'OVERRIDDEN';
      rx.doubleCheckStatus = 'SOLO_OVERRIDE';
    } else {
      const match = Math.abs((rx.orderedDose || 0) - (Number(verifiedDose) || 0)) < 0.01;
      if (!match) {
        return res.status(409).json({
          success: false,
          message: `2차 투약 입력 용량(${verifiedDose})이 처방 용량(${rx.orderedDose})과 불일치합니다.`,
        });
      }
      rx.status = 'VERIFIED';
      rx.firstVerifier = firstNurseId;
      rx.secondVerifier = secondNurseId;
      rx.doubleCheckStatus = 'MATCH';
    }
  }

  res.json({
    success: true,
    data: {
      match: true,
      proceedAllowed: true,
      verifiedAt: new Date().toISOString(),
    },
  });
});

// 4. MOD-DDI: DDI & Allergy Cross-check API
app.post('/api/v1/medication/interaction-check', async (req, res) => {
  const { patientId, drugCode, drugName } = req.body;
  const patient = patients.find((p) => p.id === patientId);

  const alerts: any[] = [];

  // Check known hardcoded allergy rules matching screenshot #2 (Aspirin vs NSAID allergy)
  if (patientId === '21212457') {
    if (drugName.includes('아스피린') || drugName.includes('이부프로펜') || drugName.includes('NSAID')) {
      alerts.push({
        type: 'ALLERGY',
        severityCd: 'CONTRAINDICATED',
        withDrug: '아스피린 (Aspirin)',
        evidence: '2022년 위장관 중증 출혈 이력 등록됨. NSAIDs 계열 전체 투약 절대 금기!',
        action: 'HARD_STOP',
      });
    }
    if (drugName.includes('헤파린') || drugName.includes('Heparin')) {
      alerts.push({
        type: 'DDI',
        severityCd: 'SIGNIFICANT',
        withDrug: '와파린 (Warfarin)',
        evidence: '최근 INR 3.2 상태에서 헤파린 continuous 병용 시 출혈 위험 급증. 모니터링 필수!',
        action: 'WARN',
      });
    }
  }

  // AI evaluation if Gemini available
  if (alerts.length === 0 && process.env.GEMINI_API_KEY) {
    try {
      const ai = getAiClient();
      const prompt = `
환자 정보: ${patient?.name}, 알레르기/ADR 이력: ${JSON.stringify(patient?.cautionAlerts || [])}
새로 투약하려는 약물: ${drugName} (${drugCode})

알레르기 교차 반응이나 중증 약물 상호작용(DDI)이 있는지 분석하세요.
JSON 반환:
{
  "alerts": [
    {
      "type": "ALLERGY" 또는 "DDI",
      "severityCd": "CONTRAINDICATED" 또는 "SIGNIFICANT" 또는 "MINOR",
      "withDrug": "상대 약물명",
      "evidence": "원인 및 임상 근거 요약",
      "action": "HARD_STOP" 또는 "WARN" 또는 "SUPPRESS"
    }
  ]
}
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.alerts && Array.isArray(parsed.alerts)) {
        alerts.push(...parsed.alerts);
      }
    } catch (err) {
      console.error('DDI AI Check error:', err);
    }
  }

  res.json({
    success: true,
    data: {
      alerts,
      dataCompleteness: 'FULL',
    },
  });
});

// 5. MOD-VOICE: Voice to Structured Record API
app.post('/api/v1/voice/structure', async (req, res) => {
  const { transcript, context, patientId } = req.body;

  let fields = [
    { fieldCd: 'SYMPTOM', fieldLabel: '주호소 / 증상', value: '수술 부위 둔통 및 미열 호소', needsReview: false },
    { fieldCd: 'BP', fieldLabel: '혈압 (BP)', value: '138/88 mmHg', needsReview: true },
    { fieldCd: 'HR', fieldLabel: '심박수 (HR)', value: '102 bpm', needsReview: true },
    { fieldCd: 'MED_REACTION', fieldLabel: '투약 반응 / 특이사항', value: '휴물린-R 10IU IV 주입 후 혈당 측정 예정', needsReview: true },
  ];

  if (transcript && process.env.GEMINI_API_KEY) {
    try {
      const ai = getAiClient();
      const prompt = `
다음 간호사의 음성 녹음 텍스트를 분석하여 표준 간호 기록 항목으로 구조화하세요.
음성 텍스트: "${transcript}"
맥락: ${context || '간호메모 및 활력징후'}

중요: 약품명, 숫자, 용량, 바이탈 수치 항목은 간호사 수동 검토가 필요하도록 "needsReview": true 로 설정하세요.

JSON 배열 구조:
[
  { "fieldCd": "항목코드", "fieldLabel": "표시 라벨", "value": "추출된 값", "needsReview": true/false }
]
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
      const parsed = JSON.parse(response.text || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        fields = parsed;
      }
    } catch (err) {
      console.error('Voice structuring error:', err);
    }
  }

  res.json({
    success: true,
    data: {
      transcript: transcript || '환자 김철수님 수술부위 통증 호소하여 혈압 138에 88, 심박수 102회 측정되었고 휴물린 10단위 주입 진행함',
      fields,
    },
  });
});

// 5-B. MOD-VS: Vital Signs Voice Parsing API
app.post('/api/v1/vitals/voice-parse', async (req, res) => {
  const { transcript } = req.body;

  let parsedValues = {
    bpSys: 128,
    bpDia: 82,
    hr: 76,
    rr: 16,
    bt: 36.8,
    spo2: 98,
  };

  if (transcript && process.env.GEMINI_API_KEY) {
    try {
      const ai = getAiClient();
      const prompt = `
간호사의 활력징후 음성 텍스트를 분석하여 숫자 수치로 파싱하세요.
음성: "${transcript}"

JSON 반환:
{
  "bpSys": 수축기혈압숫자(예: 128),
  "bpDia": 이완기혈압숫자(예: 82),
  "hr": 심박수숫자(예: 76),
  "rr": 호흡수숫자(예: 16),
  "bt": 체온숫자(예: 36.8),
  "spo2": 산소포화도숫자(예: 98)
}
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
      const parsed = JSON.parse(response.text || '{}');
      if (parsed.bpSys) parsedValues.bpSys = Number(parsed.bpSys);
      if (parsed.bpDia) parsedValues.bpDia = Number(parsed.bpDia);
      if (parsed.hr) parsedValues.hr = Number(parsed.hr);
      if (parsed.rr) parsedValues.rr = Number(parsed.rr);
      if (parsed.bt) parsedValues.bt = Number(parsed.bt);
      if (parsed.spo2) parsedValues.spo2 = Number(parsed.spo2);
    } catch (err) {
      console.error('Vital voice parse error:', err);
    }
  }

  res.json({
    success: true,
    data: parsedValues,
  });
});

// 5-C. MOD-VS: Save Vital Signs Record API
app.post('/api/v1/vitals/save', (req, res) => {
  const { patientId, bpSys, bpDia, hr, rr, bt, spo2, ewsScore, method } = req.body;
  const p = patients.find((pat) => pat.id === patientId);
  if (p) {
    p.vitals = {
      bp: `${bpSys}/${bpDia}`,
      hr,
      rr,
      bt,
      spo2,
    };
    p.ewsScore = ewsScore;
    if (ewsScore >= 5) p.status = '긴급';
    else if (ewsScore >= 3) p.status = '지연';
    else p.status = '정상';
  }

  res.json({
    success: true,
    data: {
      savedAt: new Date().toISOString(),
      patientId,
      updatedEws: ewsScore,
      method,
    },
  });
});

// 6. MOD-WL: AI Worklist Prioritization API
app.post('/api/v1/worklist/prioritize', async (req, res) => {
  const { sortMode } = req.body;

  let sortedTasks = [...tasks];

  if (sortMode === 'time') {
    sortedTasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  } else if (sortMode === 'location') {
    sortedTasks.sort((a, b) => a.wardRoom.localeCompare(b.wardRoom));
  } else {
    // Default AI priority order
    sortedTasks.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  res.json({
    success: true,
    data: {
      sortedTasks,
    },
  });
});

// 7. MOD-SBAR: AI Handover Summary Generation API
app.post('/api/v1/handover/generate', async (req, res) => {
  const { patientId, shiftFrom, shiftTo } = req.body;
  const patient = patients.find((p) => p.id === patientId) || patients[0];

  let sbar = {
    situation: [
      { id: 's1', text: `${patient.roomBed} ${patient.name}(${patient.gender}/${patient.age}) 환자, ${patient.hdPod} EWS ${patient.ewsScore}점`, sourceRef: `EMR:Admission#${patient.id}`, category: 'S' },
      { id: 's2', text: `현재 V/S ${patient.vitals?.bp}, HR ${patient.vitals?.hr}bpm, BT ${patient.vitals?.bt}℃`, sourceRef: 'CLMA:VITAL#Latest', category: 'S' },
    ],
    background: [
      { id: 's3', text: `진단/이력: 와파린 복용 중 (INR 3.2), 아스피린/NSAIDs 중증 알레르기 이력`, sourceRef: 'EMR:Allergy#102', category: 'B' },
    ],
    assessment: [
      { id: 's4', text: `고위험 약물 휴물린-R 10IU IV 주입 중 (2차 독립 이중확인 completed)`, sourceRef: 'CLMA:HAM_CHECK#881', category: 'A' },
      { id: 's5', text: `체온 상승 및 출혈 경향성 모니터링 중`, sourceRef: 'CLMA:OBSERVATION#01', category: 'A' },
    ],
    recommendation: [
      { id: 's6', text: `12:00 STAT BST 혈당 측정 및 INR / CBC 결과 확인 필요`, sourceRef: 'EMR:Order#901', category: 'R' },
      { id: 's7', text: `BT > 38.5℃ 지속 시 아세트아미노펜 투여 고려 (NSAIDs 금기)`, sourceRef: 'EMR:Protocol#02', category: 'R' },
    ],
  };

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getAiClient();
      const prompt = `
간호 교대 인계(SBAR) 요약을 생성하세요.
환자: ${patient.name} (${patient.gender}/${patient.age}, ${patient.roomBed}, EWS ${patient.ewsScore}점)
바이탈: ${JSON.stringify(patient.vitals)}
주의사항: ${JSON.stringify(patient.cautionAlerts)}

SBAR 4가지 항목(Situation, Background, Assessment, Recommendation)으로 한국어 간호 인계 요약을 작성하세요.
각 문장마다 근거 출처 코드 (예: "CLMA:VITAL#4819", "EMR:Diagnosis#102")를 포함하세요.

JSON 반환 구조:
{
  "situation": [ { "id": "s1", "text": "내용", "sourceRef": "출처코드", "category": "S" } ],
  "background": [ { "id": "b1", "text": "내용", "sourceRef": "출처코드", "category": "B" } ],
  "assessment": [ { "id": "a1", "text": "내용", "sourceRef": "출처코드", "category": "A" } ],
  "recommendation": [ { "id": "r1", "text": "내용", "sourceRef": "출처코드", "category": "R" } ]
}
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.situation && parsed.background && parsed.assessment && parsed.recommendation) {
        sbar = parsed;
      }
    } catch (err) {
      console.error('SBAR generation error:', err);
    }
  }

  res.json({
    success: true,
    data: {
      patientId: patient.id,
      patientName: patient.name,
      shiftFrom: shiftFrom || 'Day (07:00)',
      shiftTo: shiftTo || 'Evening (15:00)',
      sbar,
    },
  });
});

// 8. MOD-PRED: Deterioration / Sepsis Prediction API
app.post('/api/v1/prediction/risk-score', (req, res) => {
  const { patientId } = req.body;
  const pred = predictions.find((p) => p.patientId === patientId) || predictions[0];
  res.json({
    success: true,
    data: pred,
  });
});

app.post('/api/v1/prediction/rrt-call', (req, res) => {
  const { patientId, nurseId } = req.body;
  const pred = predictions.find((p) => p.patientId === patientId);
  if (pred) {
    pred.rrtCalled = true;
    pred.rrtCalledAt = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }

  res.json({
    success: true,
    data: {
      rrtCallId: `RRT-${Date.now()}`,
      notifiedTo: '신속대응팀(RRT) & 당직의(김전문)',
      calledAt: new Date().toISOString(),
    },
  });
});

// Start Express and Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CLMA Nursing PDA Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
