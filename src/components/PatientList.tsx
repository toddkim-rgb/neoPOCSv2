import React, { useState } from 'react';
import { Patient } from '../types';
import { Star, GripVertical } from 'lucide-react';

interface PatientListProps {
  patients: Patient[];
  onSelectPatient: (patient: Patient) => void;
  onToggleStar: (patientId: string) => void;
  onOpenVitals?: (patientId: string) => void;
}

export const PatientList: React.FC<PatientListProps> = ({
  patients,
  onSelectPatient,
  onToggleStar,
  onOpenVitals,
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
      {/* Top Filter Chips Bar */}
      <div className="flex items-center justify-between mb-3 px-1 overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-1.5 shrink-0">
          {(
            [
              { id: '관심순', label: '⭐ 관심순' },
              { id: '긴급순', label: '긴급순' },
              { id: '이름순', label: '이름순' },
              { id: '위치순', label: '위치순' },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              onClick={() => setFilterMode(chip.id)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center space-x-1 ${
                filterMode === chip.id
                  ? 'bg-amber-500 text-white shadow-xs font-black'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{chip.label}</span>
              {chip.id === '관심순' && starredCount > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    filterMode === '관심순' ? 'bg-white text-amber-600' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {starredCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 font-medium shrink-0 ml-2">{patients.length}명</span>
      </div>

      {/* Patient Card Items List matching Screenshot #1 */}
      <div className="space-y-2.5">
        {sortedPatients.map((patient) => {
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
                  <div className="flex items-center space-x-1.5">
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
                  </div>

                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                    {patient.ward} <span className="text-slate-700 font-semibold">{patient.roomBed}</span>
                  </div>
                </div>
              </div>

              {/* Action Tags Pills on the Right matching Screenshot #1 */}
              <div className="flex items-center space-x-1">
                {patient.name === '김철수' && (
                  <>
                    <span className="px-2.5 py-1 rounded-full border border-emerald-500 text-emerald-700 bg-emerald-50 text-xs font-bold shadow-xs">
                      투약
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenVitals) onOpenVitals(patient.id);
                      }}
                      className="px-2 py-1 rounded-full border border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-bold shadow-xs transition-colors"
                    >
                      VS
                    </button>
                  </>
                )}
                {patient.name === '이영애' && (
                  <span className="px-2.5 py-1 rounded-full border border-pink-500 text-pink-700 bg-pink-50 text-xs font-bold shadow-xs">
                    채혈
                  </span>
                )}
                {patient.name === '한수환' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenVitals) onOpenVitals(patient.id);
                    }}
                    className="px-2.5 py-1 rounded-full border border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-bold shadow-xs transition-colors"
                  >
                    VS
                  </button>
                )}
                {patient.name === '박영철' && (
                  <span className="px-2.5 py-1 rounded-full border border-rose-500 text-rose-700 bg-rose-50 text-xs font-bold shadow-xs">
                    수혈
                  </span>
                )}
                {patient.name === '박수근' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenVitals) onOpenVitals(patient.id);
                    }}
                    className="px-2.5 py-1 rounded-full border border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-bold shadow-xs transition-colors"
                  >
                    VS
                  </button>
                )}
                {patient.name === '김영수' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenVitals) onOpenVitals(patient.id);
                    }}
                    className="px-2.5 py-1 rounded-full border border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-bold shadow-xs transition-colors"
                  >
                    VS
                  </button>
                )}
                {patient.name === '김희영' && (
                  <span className="px-2.5 py-1 rounded-full border border-emerald-500 text-emerald-700 bg-emerald-50 text-xs font-bold shadow-xs">
                    투약
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
