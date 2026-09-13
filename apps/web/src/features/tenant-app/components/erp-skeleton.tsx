import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const KpiCardSkeleton: React.FC = () => (
  <div className="bg-white border border-zinc-200/80 shadow-sm rounded-2xl p-5 space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-24 rounded-md" />
      <Skeleton className="h-8 w-8 rounded-xl" />
    </div>
    <div className="space-y-2">
      <Skeleton className="h-7 w-32 rounded-lg" />
      <Skeleton className="h-3.5 w-44 rounded-md" />
    </div>
  </div>
);

export const ProductCardSkeleton: React.FC = () => (
  <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-8 rounded" />
      <Skeleton className="h-4 w-14 rounded-md" />
    </div>
    <div className="space-y-1.5">
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-3/4 rounded" />
    </div>
    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
      <Skeleton className="h-4 w-16 rounded" />
      <Skeleton className="h-6 w-6 rounded-lg" />
    </div>
  </div>
);

export const TableRowSkeleton: React.FC<{ columns?: number }> = ({ columns = 5 }) => (
  <tr className="border-b border-zinc-100 animate-pulse">
    {Array.from({ length: columns }).map((_, idx) => (
      <td key={idx} className="py-4 px-3">
        <Skeleton className={`h-4 rounded ${idx === 0 ? 'w-36' : 'w-20'}`} />
      </td>
    ))}
  </tr>
);
