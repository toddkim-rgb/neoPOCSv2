import React, { useState } from 'react';
import { Patient, Prescription, WorklistTask } from '../types';
import { Star, GripVertical, UserPlus } from 'lucide-react';
import { getPatientBadges } from '../utils/patientTaskUtils';

interface PatientListProps {
  patients: Patient[];
  prescriptions?: Prescription[];
  tasks?: WorklistTask[];
  onSelectPatient: (patient: Patient) => void;
  onToggleStar: (patientId: string) => void;
  onOpenVitals?: (patientId: string) => void;
  onOpenBloodSampling?: (patient: Patient) => void;
  onOpenTransfusion?: (patient: Patient) => void;
  onAddRandomPatient?: () => void;
}

export const PatientList: React.FC<PatientListProps> = ({
  patients,
  prescriptions = [],
  tasks = [],
  onSelectPatient,
  onToggleStar,
  onOpenVitals,
  onOpenBloodSampling,
  onOpenTransfusion,
  onAddRandomPatient,
}) => {
  const [filterMode, setFilterMode] = useState<'관심순' | '긴급순' | '이름순' | '위치순'>('관심순');

  // Sort patients according to filter
  const sortedPatients = [...patients].sort((a, b) => {
    if (filterMode === '관심순') {
      if (a.isStarred && !b.isStarred) return -1;
      if (!a.isStarred && b.isStarred) return 1;
      const order = { 긴급: 1, 지연: 2, 정상: 3 };
      return (order[a.status] || 9) - (order[b.status] || 9);
    }
    if (filterMode === '긴급순') {
      const order = { 긴급: 1, 지연: 2, 정상: 3 };
      return (order[a.status] || 9) - (order[b.status] || 9);
    }
    if (filterMode === '이름순') {
      return a.name.localeCompare(b.name, 'ko');
    }
    if (filterMode === '위치순') {
      return a.roomBed.localeCompare(b.roomBed);
    }
    return 0;
  });

  const starredCount = patients.filter((p) => p.isStarred).length;

  return (
    <div className="p-3 bg-slate-100 min-h-[calc(100vh-140px)] pb-24">
      {/* Patient Count & Random Card Generator Banner */}
      <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-extrabold text-slate-800">환자 리스트</span>
          <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-full border border-indigo-200">
            총 {patients.length}명
          </span>
        </div>
        {onAddRandomPatient && (
          <button
            onClick={onAddRandomPatient}
            className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>임의 환자 카드 생성</span>
          </button>
        )}
      </div>

      {/* Top Filter Chips Bar */}
      <div className="flex items-center justify-between mb-3 px-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-1.5 shrink-0">
          {(
            [
              { id: '관심순', label: '관심순' },
              { id: '긴급순', label: '긴급순' },
              { id: '이름순', label: '이름순' },
              { id: '위치순', label: '위치순' },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              onClick={() => setFilterMode(chip.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs transition-all flex items-center space-x-1.5 cursor-pointer ${
                filterMode === chip.id
                  ? 'bg-amber-500 text-white shadow-xs font-extrabold'
                  : 'bg-white text-slate-700 font-bold border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{chip.label}</span>
              {chip.id === '관심순' && starredCount > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                    filterMode === '관심순' ? 'bg-white text-amber-600' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {starredCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Patient Card Items List matching Screenshot #1 */}
      <div className="space-y-2.5">
        {sortedPatients.map((patient) => {
          const { hasHam, hasMedication, hasVs, hasBlood, hasTransfusion } = getPatientBadges(
            patient,
            prescriptions,
            tasks
          );

          return (
            <div
              key={patient.id}
              onClick={() => onSelectPatient(patient)}
              className="bg-white rounded-xl p-3 shadow-sm border border-slate-200 flex items-center justify-between hover:border-blue-300 hover:shadow-md transition-all cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center space-x-2.5">
                {/* Drag Grip Handle */}
                <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />

                <div>
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                    <span className="text-base font-bold text-slate-900 tracking-tight">
                      {patient.name}
                    </span>
                    {/* Star Pin */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(patient.id);
                      }}
                      className="p-0.5 text-amber-400 hover:text-amber-500 transition-colors"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          patient.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>

                    {/* Status Badge */}
                    {patient.status === '긴급' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500 text-white shadow-xs">
                        긴급
                      </span>
                    )}
                    {patient.status === '지연' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 text-white shadow-xs">
                        지연
                      </span>
                    )}

                    {/* HAM Badge shown ONLY for patients with High Alert Medication */}
                    {hasHam && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white shadow-xs">
                        HAM
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                    {patient.ward} <span className="text-slate-700 font-semibold">{patient.roomBed}</span>
                  </div>
                </div>
              </div>

              {/* Action Tags Pills on the Right */}
              <div className="flex items-center space-x-1 flex-wrap justify-end gap-y-1">
                {hasMedication && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPatient(patient);
                    }}
                    className="px-2.5 py-1 rounded-full border border-emerald-500 text-emerald-700 bg-emerald-50 text-xs font-bold shadow-xs hover:bg-emerald-100 transition-colors"
                  >
                    투약
                  </button>
                )}

                {hasBlood && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenBloodSampling) onOpenBloodSampling(patient);
                      else onSelectPatient(patient);
                    }}
                    className="px-2.5 py-1 rounded-full border border-pink-500 text-pink-700 bg-pink-50 text-xs font-bold shadow-xs hover:bg-pink-100 transition-colors"
                  >
                    채혈
                  </button>
                )}

                {hasTransfusion && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenTransfusion) onOpenTransfusion(patient);
                      else onSelectPatient(patient);
                    }}
                    className="px-2.5 py-1 rounded-full border border-rose-500 text-rose-700 bg-rose-50 text-xs font-bold shadow-xs hover:bg-rose-100 transition-colors"
                  >
                    수혈
                  </button>
                )}

                {hasVs && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenVitals) onOpenVitals(patient.id);
                    }}
                    className="px-2 py-1 rounded-full border border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-bold shadow-xs transition-colors"
                  >
                    VS
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
