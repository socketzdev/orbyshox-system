import React from 'react';
import { Search, X } from 'lucide-react';

interface JapaneseSearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const JapaneseSearchBar: React.FC<JapaneseSearchBarProps> = ({
  searchQuery,
  setSearchQuery,
}) => {
  return (
    <div className="px-5 py-2">
      <div className="relative flex items-center">
        <div className="absolute left-4 pointer-events-none text-[#8E8E93]">
          <Search className="w-4 h-4" />
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Buscar pratos, sushis, combos..."
          className="w-full h-11 pl-11 pr-10 rounded-full bg-[#1A1A1A] border border-[#262626] text-sm text-[#F5F5F0] placeholder-[#8E8E93] focus:outline-none focus:border-[#FA5D46] focus:ring-1 focus:ring-[#FA5D46] transition font-medium"
        />

        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 w-5 h-5 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93] hover:text-white transition"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
