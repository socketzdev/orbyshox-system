import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

// ─── 1. Coss UI Label ────────────────────────────────────────────────────────
export interface CossLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const CossLabel = React.forwardRef<HTMLLabelElement, CossLabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-xs font-semibold text-zinc-700 dark:text-zinc-300 select-none flex items-center gap-1',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {required && <span className="text-rose-500 font-bold">*</span>}
    </label>
  ),
);
CossLabel.displayName = 'CossLabel';

// ─── 2. Coss UI Input ────────────────────────────────────────────────────────
export interface CossInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const CossInput = React.forwardRef<HTMLInputElement, CossInputProps>(
  ({ className, hasError, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border bg-white dark:bg-zinc-900 px-3.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 shadow-2xs transition-all duration-150',
        'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 focus:border-zinc-900 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900/10 dark:focus:ring-zinc-400/20',
        'disabled:cursor-not-allowed disabled:bg-zinc-50 dark:disabled:bg-zinc-800/60 disabled:text-zinc-400',
        hasError && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10',
        className,
      )}
      {...props}
    />
  ),
);
CossInput.displayName = 'CossInput';

// ─── 3. Coss UI Input Group (com Prefix / Suffix Addon) ──────────────────────
export interface CossInputGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  prefixAddon?: React.ReactNode;
  suffixAddon?: React.ReactNode;
  hasError?: boolean;
}

export const CossInputGroup = React.forwardRef<HTMLDivElement, CossInputGroupProps>(
  ({ className, prefixAddon, suffixAddon, hasError, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center h-11 w-full rounded-xl border bg-white dark:bg-zinc-900 shadow-2xs transition-all duration-150 overflow-hidden',
        'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 focus-within:border-zinc-900 dark:focus-within:border-zinc-400 focus-within:ring-1 focus-within:ring-zinc-900/10 dark:focus-within:ring-zinc-400/20',
        hasError && 'border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-500/10',
        className,
      )}
      {...props}
    >
      {prefixAddon && (
        <div className="flex items-center px-3.5 h-full bg-zinc-50/90 border-r border-zinc-200/80 text-zinc-500 font-mono text-xs select-none shrink-0">
          {prefixAddon}
        </div>
      )}
      <div className="flex-1 h-full flex items-center min-w-0">
        {children}
      </div>
      {suffixAddon && (
        <div className="flex items-center pr-2 shrink-0">
          {suffixAddon}
        </div>
      )}
    </div>
  ),
);
CossInputGroup.displayName = 'CossInputGroup';

// ─── 4. Coss UI Textarea ─────────────────────────────────────────────────────
export interface CossTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const CossTextarea = React.forwardRef<HTMLTextAreaElement, CossTextareaProps>(
  ({ className, hasError, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-xl border bg-white p-3.5 text-xs font-medium text-zinc-900 placeholder:text-zinc-400 shadow-2xs transition-all duration-150 resize-y min-h-[90px]',
        'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 focus:border-zinc-900 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900/10 dark:focus:ring-zinc-400/20',
        'disabled:cursor-not-allowed disabled:bg-zinc-50 dark:disabled:bg-zinc-800/60 disabled:text-zinc-400',
        hasError && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10',
        className,
      )}
      {...props}
    />
  ),
);
CossTextarea.displayName = 'CossTextarea';

// ─── 5. Coss UI Switch ───────────────────────────────────────────────────────
export const CossSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-zinc-900 data-[state=unchecked]:bg-zinc-200',
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
      )}
    />
  </SwitchPrimitives.Root>
));
CossSwitch.displayName = 'CossSwitch';

// ─── 6. Coss UI Badge ────────────────────────────────────────────────────────
export interface CossBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'neutral' | 'success' | 'outline' | 'warning' | 'danger' | 'info';
}

export const CossBadge: React.FC<CossBadgeProps> = ({
  variant = 'default',
  className,
  children,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100',
    neutral: 'bg-zinc-100 text-zinc-700 border-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900',
    outline: 'bg-white text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900',
    danger: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900',
    info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold tracking-tight border select-none',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

// ─── 7. Coss UI Panel / Card ─────────────────────────────────────────────────
export const CossPanel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xs transition-all duration-200',
      className,
    )}
    {...props}
  />
));
CossPanel.displayName = 'CossPanel';

// ─── 8. Coss UI Table ────────────────────────────────────────────────────────
export const CossTable = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table ref={ref} className={cn('w-full text-left text-xs text-zinc-900 dark:text-zinc-100 border-collapse bg-white dark:bg-zinc-900', className)} {...props} />
    </div>
  )
);
CossTable.displayName = 'CossTable';

export const CossTableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('bg-zinc-50/90 dark:bg-zinc-800/60 border-b border-zinc-200/80 dark:border-zinc-800 text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none', className)} {...props} />
  )
);
CossTableHeader.displayName = 'CossTableHeader';

export const CossTableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900', className)} {...props} />
  )
);
CossTableBody.displayName = 'CossTableBody';

export const CossTableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('transition-colors duration-150 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 group', className)} {...props} />
  )
);
CossTableRow.displayName = 'CossTableRow';

export const CossTableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('py-3.5 px-4 font-bold text-zinc-400 dark:text-zinc-500 align-middle whitespace-nowrap', className)} {...props} />
  )
);
CossTableHead.displayName = 'CossTableHead';

export const CossTableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('py-3.5 px-4 align-middle text-zinc-800 dark:text-zinc-200', className)} {...props} />
  )
);
CossTableCell.displayName = 'CossTableCell';

// ─── 9. Coss UI Empty State ──────────────────────────────────────────────────
export interface CossEmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}
export const CossEmpty: React.FC<CossEmptyProps> = ({ icon, title, description, action, className, ...props }) => (
  <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)} {...props}>
    {icon && (
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 flex items-center justify-center mb-3 border border-zinc-200/80 dark:border-zinc-700">
        {icon}
      </div>
    )}
    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
    {description && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
CossEmpty.displayName = 'CossEmpty';

// ─── 10. Coss UI Spinner ─────────────────────────────────────────────────────
export const CossSpinner: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      'inline-block w-4 h-4 border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin',
      className,
    )}
  />
);
CossSpinner.displayName = 'CossSpinner';

