import React from 'react';
import { WorklistTask, TaskType } from '../types';
import { Pin, CheckCircle2, Clock, Sparkles } from 'lucide-react';

interface TaskCardProps {
  task: WorklistTask;
  onExecute?: (task: WorklistTask) => void;
  onComplete?: (taskId: string) => void;
  onTogglePin?: (taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onExecute,
  onComplete,
  onTogglePin,
}) => {
  // Config per task type matching user's image exactly
  const getTaskStyle = (type: TaskType) => {
    switch (type) {
      case '투약':
        return {
          leftGradient: 'bg-gradient-to-b from-[#7fe848] via-[#3bd06a] to-[#10b981]',
          borderColor: 'border-[#3bd06a]',
          label: '투약',
          icon: (
            <svg className="w-9 h-9 text-white stroke-current fill-none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* Capsule 1 */}
              <rect x="3" y="10" width="11" height="5" rx="2.5" transform="rotate(-45 8.5 12.5)" />
              <line x1="6.5" y1="10.5" x2="10.5" y2="14.5" />
              {/* Capsule 2 */}
              <rect x="10" y="3" width="11" height="5" rx="2.5" transform="rotate(-45 15.5 5.5)" />
              <line x1="13.5" y1="3.5" x2="17.5" y2="7.5" />
            </svg>
          ),
        };
      case 'VS':
        return {
          leftGradient: 'bg-gradient-to-b from-[#38bdf8] via-[#0284c7] to-[#1d4ed8]',
          borderColor: 'border-[#0284c7]',
          label: 'VS',
          icon: (
            <svg className="w-9 h-9 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />
              <path d="M8.5 12h2l1 -2l1.5 4l1.5 -2h2" />
              <path d="M6 16v4m-2 -2h4" />
            </svg>
          ),
        };
      case '채혈':
        return {
          leftGradient: 'bg-gradient-to-b from-[#e879f9] via-[#c084fc] to-[#a855f7]',
          borderColor: 'border-[#c084fc]',
          label: '채혈',
          icon: (
            <svg className="w-9 h-9 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* Syringe */}
              <path d="M3 19l4-4" />
              <path d="M5 13l6-6" />
              <path d="M8 10l3 3" />
              <path d="M10 6l3 3" />
              <path d="M13 3l3 3" />
              <path d="M1.5 21l2.5-2.5" />
              {/* Blood Tube */}
              <rect x="16" y="7" width="5" height="13" rx="2.5" />
              <line x1="16" y1="11" x2="21" y2="11" />
              <line x1="16" y1="14" x2="21" y2="14" />
            </svg>
          ),
        };
      case '수혈':
      default:
        return {
          leftGradient: 'bg-gradient-to-b from-[#fb923c] via-[#f97316] to-[#ef4444]',
          borderColor: 'border-[#f97316]',
          label: '수혈',
          icon: (
            <svg className="w-9 h-9 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* IV Bag */}
              <rect x="3" y="4" width="7" height="11" rx="1.5" />
              <line x1="5" y1="2" x2="8" y2="2" />
              <line x1="6.5" y1="2" x2="6.5" y2="4" />
              <path d="M6.5 15v3c0 2 2.5 2 2.5 3.5" />
              {/* Heart */}
              <path
                d="M14 13.5c1-1.5 3-1.5 4 0s.5 3-2 4.5l-2 2-2-2c-2.5-1.5-3-3-2-4.5s3-1.5 4 0z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          ),
        };
    }
  };

  const config = getTaskStyle(task.taskType);

  // Extract dose/details if present in title
  const extractDetails = () => {
    if (task.taskType === '투약') {
      if (task.title.includes('20mg')) return { name: 'OMEPRAZOL', dose: '20mg' };
      if (task.title.includes('인슐린')) return { name: '휴물린-R 주사 (인슐린)', dose: '10 IU' };
      return { name: task.title, dose: '' };
    }
    if (task.taskType === 'VS') {
      return { name: '활력징후 측정', dose: '' };
    }
    if (task.taskType === '채혈') {
      return { name: 'Routine CBC & LFT 채혈', dose: 'SST / EDTA' };
    }
    if (task.taskType === '수혈') {
      return { name: 'Packed RBC 수혈', dose: '1 Unit' };
    }
    return { name: task.title, dose: '' };
  };

  const details = extractDetails();

  return (
    <div
      onClick={() => onExecute && onExecute(task)}
      className={`bg-white rounded-2xl shadow-md border-2 ${config.borderColor} overflow-hidden flex flex-col md:flex-row transition-all relative group cursor-pointer hover:shadow-lg hover:border-indigo-500 active:scale-[0.995]`}
    >
      <div className="flex flex-1">
        {/* Left Vertical Gradient Badge Block */}
        <div
          className={`${config.leftGradient} w-20 md:w-24 shrink-0 flex flex-col items-center justify-center p-2 text-white font-bold tracking-wide border-r border-white/20`}
        >
          {config.icon}
          <span className="mt-1 font-bold text-[18px] md:text-[20px] tracking-wide drop-shadow-xs">
            {config.label}
          </span>
        </div>

        {/* Right White Main Card Body */}
        <div className="p-3.5 flex-1 flex flex-col justify-between bg-white text-slate-900">
          {/* Header Row: Ward/Patient + Title & Dose */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[14px]">
                  {task.wardRoom}
                </span>
                <span className="font-bold text-slate-900 text-[20px] tracking-tight">{task.patientName}</span>
                {task.isHam && (
                  <span className="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-xs">
                    HAM
                  </span>
                )}
              </div>

              {onTogglePin && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(task.id);
                  }}
                  className={`p-1 rounded-full transition-colors ${
                    task.isPinned ? 'text-indigo-600 bg-indigo-50' : 'text-slate-300 hover:text-slate-500'
                  }`}
                  title={task.isPinned ? '상단 고정 해제' : '상단 고정'}
                >
                  <Pin className="w-4 h-4 fill-current" />
                </button>
              )}
            </div>

            {/* Title & Dose */}
            <div className="flex items-baseline justify-between mt-1">
              <h3 className="font-bold text-[18px] text-slate-900 tracking-tight leading-snug">
                {details.name}
              </h3>
              {details.dose && (
                <span className="font-bold text-[17px] text-slate-900 font-mono ml-2">
                  {details.dose}
                </span>
              )}
            </div>
          </div>

          {/* AI Reasons Tags */}
          {task.reasons && task.reasons.length > 0 && (
            <div className="mt-2 pt-[5px] flex flex-wrap gap-1">
              {task.reasons.map((reason, idx) => (
                <span
                  key={idx}
                  className="mr-2 bg-indigo-50 text-indigo-900 border border-indigo-200/80 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center space-x-1"
                >
                  <span className="text-amber-500 font-black">#</span>
                  <span>{reason}</span>
                </span>
              ))}
            </div>
          )}

          {/* Bottom Row: Date/Time + Status Badge + Actions */}
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{task.dueAt || '2026/06/25 09:00'}</span>

              {task.status === 'urgent' && (
                <span className="bg-rose-600 text-white font-extrabold text-[11px] px-2 py-0.5 rounded-full shadow-xs animate-pulse">
                  긴급
                </span>
              )}
              {task.status === 'delayed' && (
                <span className="bg-amber-500 text-white font-extrabold text-[11px] px-2 py-0.5 rounded-full shadow-xs">
                  지연
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-1.5">
              {onExecute && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExecute(task);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center space-x-1"
                >
                  <span>팔찌 스캔</span>
                </button>
              )}
              {onComplete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onComplete(task.id);
                  }}
                  className="p-1.5 bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700 rounded-lg transition-all"
                  title="완료 처리"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
