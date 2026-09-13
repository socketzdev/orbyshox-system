import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const PageLoader: React.FC<{ label?: string; className?: string }> = ({
  label = 'Carregando...',
  className,
}) => (
  <div className={cn('w-full py-16 flex flex-col items-center justify-center space-y-3', className)}>
    <Loader2 className="w-5 h-5 text-zinc-700 animate-spin" />
    <span className="text-[11px] font-mono text-zinc-500 tracking-wider">{label}</span>
  </div>
);
