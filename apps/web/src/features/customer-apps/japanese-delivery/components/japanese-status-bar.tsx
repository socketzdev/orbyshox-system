import React from 'react';
import { Wifi } from 'lucide-react';

export const JapaneseStatusBar: React.FC = () => {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-2 select-none text-white">
      {/* Time */}
      <span className="text-[14px] font-semibold tracking-tight text-[#F5F5F0]">12:38</span>

      {/* Dynamic Island pill */}
      <div className="h-4 w-24 bg-black rounded-full border border-white/5 flex items-center justify-center">
        <div className="h-2 w-2 rounded-full bg-[#1F1F1F] mr-1.5" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#161616]" />
      </div>

      {/* Right icons: Signal, Wifi, Battery */}
      <div className="flex items-center gap-1.5 text-[#F5F5F0]">
        {/* Signal bars */}
        <div className="flex items-end gap-[1.5px] h-3">
          <div className="w-[3px] h-1.5 bg-current rounded-[0.5px]" />
          <div className="w-[3px] h-2 bg-current rounded-[0.5px]" />
          <div className="w-[3px] h-2.5 bg-current rounded-[0.5px]" />
          <div className="w-[3px] h-3 bg-current rounded-[0.5px]" />
        </div>

        {/* Wifi */}
        <Wifi className="w-3.5 h-3.5 ml-0.5" />

        {/* Battery */}
        <div className="flex items-center ml-0.5">
          <div className="w-5 h-2.5 border border-current rounded-[3px] p-[1.5px] flex items-center">
            <div className="w-full h-full bg-current rounded-[1.5px]" />
          </div>
          <div className="w-[1.5px] h-1 bg-current rounded-r-[1px]" />
        </div>
      </div>
    </div>
  );
};
