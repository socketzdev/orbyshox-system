import React, { useState } from 'react';

interface MrrBarChartProps {
  data: { month: string; mrr: number }[];
  isLoading?: boolean;
}

function getShortMonth(monthStr: string) {
  if (!monthStr) return '';
  const cleaned = monthStr.replace(/\./g, '').trim();
  const firstWord = cleaned.split(' ')[0] || '';
  if (firstWord.length <= 3) return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1, 3).toLowerCase();
}

export const MrrBarChart: React.FC<MrrBarChartProps> = ({ data, isLoading }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (isLoading || !data || data.length === 0) {
    return (
      <div className="h-64 w-full flex items-end gap-3 pt-10 px-2 animate-pulse overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-zinc-200/70 rounded-t-2xl"
            style={{ height: `${25 + (i % 3) * 30}%` }}
          />
        ))}
      </div>
    );
  }

  const maxMrr = Math.max(...data.map((d) => d.mrr), 1);
  const activeIndex = data.length - 1; // Last element is the current month

  return (
    <div className="w-full pt-8 pb-2 overflow-hidden">
      {/* Visual Bars Container */}
      <div className="h-56 flex items-end justify-between gap-1.5 sm:gap-2.5 md:gap-3 px-1 sm:px-2 w-full">
        {data.map((item, idx) => {
          const heightPercent = Math.max(16, Math.round((item.mrr / maxMrr) * 100));
          const isActive = hoveredIndex === null ? idx === activeIndex : hoveredIndex === idx;

          return (
            <div
              key={item.month}
              className="flex-1 min-w-0 flex flex-col items-center justify-end h-full relative group cursor-pointer"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Floating Pill Tooltip above the active/hovered bar */}
              {isActive && (
                <div
                  className={`absolute -top-9 z-20 pointer-events-none transition-all ${
                    idx === 0
                      ? 'left-0'
                      : idx === data.length - 1
                      ? 'right-0'
                      : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <div className="bg-zinc-950 text-white text-[11px] font-bold px-2.5 py-1 rounded-xl shadow-lg border border-zinc-800 flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>R$ {(item.mrr / 1000).toFixed(1)}k</span>
                  </div>
                </div>
              )}

              {/* The Rounded Bar */}
              <div
                className={`w-full max-w-[38px] sm:max-w-[44px] rounded-t-xl sm:rounded-t-2xl transition-all duration-300 ease-out ${
                  isActive
                    ? 'bg-gradient-to-t from-emerald-500/90 to-emerald-400 shadow-[0_8px_20px_rgba(16,185,129,0.25)]'
                    : 'bg-zinc-200/70 hover:bg-zinc-300/80'
                }`}
                style={{ height: `${heightPercent}%` }}
              />

              {/* Month Label */}
              <span
                title={item.month}
                className={`mt-2.5 text-[10.5px] sm:text-xs font-semibold transition-colors text-center block w-full truncate ${
                  isActive ? 'text-zinc-950 font-bold' : 'text-zinc-400 group-hover:text-zinc-600'
                }`}
              >
                {getShortMonth(item.month)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
