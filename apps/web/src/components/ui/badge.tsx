import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none',
  {
    variants: {
      variant: {
        default: 'border-sky-200 bg-sky-50 text-sky-700',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        destructive: 'border-rose-200 bg-rose-50 text-rose-700',
        outline: 'border-border bg-white text-foreground',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        sky: 'border-sky-200 bg-sky-50 text-sky-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        rose: 'border-rose-200 bg-rose-50 text-rose-700',
        purple: 'border-violet-200 bg-violet-50 text-violet-700',
        zinc: 'border-border bg-secondary text-muted-foreground',
        indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
}

function Badge({ className, variant, dot = false, pulse = false, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full bg-current opacity-85',
            pulse && 'animate-pulse',
          )}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
