import React from 'react';
import { JAPANESE_CATEGORIES } from '../japanese-data';

interface JapaneseCategoriesProps {
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
}

export const JapaneseCategories: React.FC<JapaneseCategoriesProps> = ({
  selectedCategory,
  setSelectedCategory,
}) => {
  return (
    <div className="py-2">
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5">
        {JAPANESE_CATEGORIES.map(cat => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 h-9 px-4 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-1.5 active:scale-95 ${
                isActive
                  ? 'bg-[#FA5D46] text-white shadow-md shadow-[#FA5D46]/25'
                  : 'bg-[#1A1A1A] border border-[#262626] text-[#8E8E93] hover:text-white hover:border-[#333333]'
              }`}
            >
              <span className="text-[13px]">{cat.emoji}</span>
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
