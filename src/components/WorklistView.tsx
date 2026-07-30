import React, { useState } from 'react';
import { WorklistTask } from '../types';
import { TaskCard } from './TaskCard';
import { ArrowUpDown, Clock, MapPin, Sparkles } from 'lucide-react';

interface WorklistViewProps {
  tasks: WorklistTask[];
  onTogglePin: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onExecuteTask: (task: WorklistTask) => void;
}

export const WorklistView: React.FC<WorklistViewProps> = ({
  tasks,
  onTogglePin,
  onCompleteTask,
  onExecuteTask,
}) => {
  const [sortMode, setSortMode] = useState<'ai' | 'time' | 'location'>('ai');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | '수혈' | '투약' | 'VS' | '채혈'>('ALL');

  // Filter & sort tasks
  const filteredTasks = tasks.filter((t) => {
    if (categoryFilter === 'ALL') return true;
    return t.taskType === categoryFilter;
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    if (sortMode === 'time') {
      return a.dueAt.localeCompare(b.dueAt);
    }
    if (sortMode === 'location') {
      return a.wardRoom.localeCompare(b.wardRoom);
    }
    return b.priorityScore - a.priorityScore; // AI priority score
  });

  return (
    <div className="p-3 bg-slate-100 min-h-[calc(100vh-140px)] pb-24 space-y-3">
      {/* Top Banner & AI Explanation */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-3.5 rounded-2xl shadow-md border border-indigo-800">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-300">
            <Sparkles className="w-4 h-4 animate-pulse text-amber-400" />
            <span>[MOD-WL] AI 동적 우선순위 스코어링</span>
          </div>
          <span className="text-[10px] text-slate-300 bg-white/10 px-2 py-0.5 rounded-full">
            온디바이스 룰+ML Engine
          </span>
        </div>
        <p className="text-xs text-slate-200 leading-relaxed">
          시간 임박도, HAM약물 위험성, EWS 환자위급도, 교대 마감 누락 위험을 종합하여 자동 정렬합니다.
        </p>
      </div>

      {/* Task Type Filter Chips Bar */}
      <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {[
          { id: 'ALL', label: '전체' },
          { id: '수혈', label: '🩸 수혈' },
          { id: '투약', label: '💊 투약' },
          { id: 'VS', label: '🩺 VS' },
          { id: '채혈', label: '🧪 채혈' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id as any)}
            className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 transition-all ${
              categoryFilter === cat.id
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Sort Filter Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-1.5 text-xs font-semibold">
          <button
            onClick={() => setSortMode('ai')}
            className={`px-3 py-1.5 rounded-full flex items-center space-x-1 transition-all ${
              sortMode === 'ai'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'bg-white text-slate-700 border border-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>AI 우선순위</span>
          </button>
          <button
            onClick={() => setSortMode('time')}
            className={`px-3 py-1.5 rounded-full flex items-center space-x-1 transition-all ${
              sortMode === 'time'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'bg-white text-slate-700 border border-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>시간순</span>
          </button>
          <button
            onClick={() => setSortMode('location')}
            className={`px-3 py-1.5 rounded-full flex items-center space-x-1 transition-all ${
              sortMode === 'location'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'bg-white text-slate-700 border border-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>위치순</span>
          </button>
        </div>

        <span className="text-xs text-slate-500 font-medium">{sortedTasks.length}건 미완료</span>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {sortedTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onExecute={onExecuteTask}
            onComplete={onCompleteTask}
            onTogglePin={onTogglePin}
          />
        ))}
      </div>
    </div>
  );
};
