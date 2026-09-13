import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErpEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const ErpEmptyState: React.FC<ErpEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`py-16 px-4 flex flex-col items-center justify-center text-center ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-zinc-100/80 border border-zinc-200/60 flex items-center justify-center text-zinc-400 mb-3 shadow-xs">
        <Icon className="w-7 h-7 stroke-[1.5]" />
      </div>
      <h3 className="text-sm font-bold text-zinc-900 mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 max-w-sm mb-4 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button
          size="sm"
          onClick={onAction}
          className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl h-8 px-3.5 shadow-sm"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
