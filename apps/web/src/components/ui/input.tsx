import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50/70 px-3.5 py-2 text-xs font-medium text-zinc-900 shadow-2xs transition-all file:border-0 file:bg-transparent file:text-xs file:font-semibold file:text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus-visible:outline-none focus-visible:border-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
