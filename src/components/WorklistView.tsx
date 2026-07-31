import React, { useState } from 'react';
import { WorklistTask } from '../types';
import { TaskCard } from './TaskCard';


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
      {/* Task Type Filter Chips Bar */}
      <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {[
          { id: 'ALL', label: '전체', count: tasks.length },
          { id: '수혈', label: '수혈', count: tasks.filter((t) => t.taskType === '수혈').length },
          { id: '투약', label: '투약', count: tasks.filter((t) => t.taskType === '투약').length },
          { id: 'VS', label: 'VS', count: tasks.filter((t) => t.taskType === 'VS').length },
          { id: '채혈', label: '채혈', count: tasks.filter((t) => t.taskType === '채혈').length },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id as any)}
            className={`px-3.5 py-1.5 rounded-full text-xs shrink-0 transition-all cursor-pointer flex items-center space-x-1.5 ${
              categoryFilter === cat.id
                ? 'bg-amber-500 text-white shadow-xs font-extrabold'
                : 'bg-white text-slate-700 font-bold border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>{cat.label}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                categoryFilter === cat.id
                  ? 'bg-white text-amber-600'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* Sort Filter Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-1.5 text-xs font-semibold">
          {[
            { id: 'ai', label: 'AI 우선순위' },
            { id: 'time', label: '시간순' },
            { id: 'location', label: '위치순' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setSortMode(mode.id as any)}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer text-xs ${
                sortMode === mode.id
                  ? 'bg-amber-500 text-white shadow-xs font-extrabold'
                  : 'bg-white text-slate-700 font-bold border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{mode.label}</span>
            </button>
          ))}
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
