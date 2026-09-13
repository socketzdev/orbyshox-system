import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  UtensilsCrossed,
  Scissors,
  ShoppingCart,
  Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── 1. Avatar Root com Variantes Coss UI / Shadcn ───────────────────────────
const avatarVariants = cva(
  'relative flex shrink-0 overflow-hidden select-none transition-all duration-200',
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-[10px]',
        sm: 'h-8 w-8 text-xs',
        md: 'h-10 w-10 text-xs',
        lg: 'h-12 w-12 text-sm',
        xl: 'h-14 w-14 text-base font-semibold',
      },
      shape: {
        circle: 'rounded-full',
        squircle: 'rounded-2xl',
      },
    },
    defaultVariants: {
      size: 'md',
      shape: 'circle',
    },
  },
);

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ className, size, shape, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(avatarVariants({ size, shape }), className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

// ─── 2. Avatar Image ─────────────────────────────────────────────────────────
const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full object-cover', className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

// ─── 3. Avatar Fallback Estilizado ───────────────────────────────────────────
const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center font-bold tracking-tight bg-zinc-100 text-zinc-700 select-none',
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

// ─── 4. Avatar Indicator (Status Badge no Padrão Coss UI) ────────────────────
export interface AvatarIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: 'online' | 'active' | 'busy' | 'away' | 'offline' | 'danger';
  position?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left';
  pulse?: boolean;
}

const statusColorMap = {
  online: 'bg-emerald-500',
  active: 'bg-emerald-500',
  busy: 'bg-amber-500',
  away: 'bg-amber-500',
  offline: 'bg-zinc-400',
  danger: 'bg-rose-500',
};

const positionMap = {
  'bottom-right': 'bottom-0 right-0 translate-x-1/4 translate-y-1/4',
  'top-right': 'top-0 right-0 translate-x-1/4 -translate-y-1/4',
  'bottom-left': 'bottom-0 left-0 -translate-x-1/4 translate-y-1/4',
  'top-left': 'top-0 left-0 -translate-x-1/4 -translate-y-1/4',
};

export const AvatarIndicator: React.FC<AvatarIndicatorProps> = ({
  status = 'online',
  position = 'bottom-right',
  pulse = false,
  className,
  ...props
}) => {
  return (
    <span
      className={cn(
        'absolute z-10 block rounded-full ring-2 ring-white dark:ring-zinc-900 shadow-2xs',
        'h-2.5 w-2.5',
        statusColorMap[status],
        positionMap[position],
        className,
      )}
      {...props}
    >
      {pulse && (
        <span
          className={cn(
            'absolute inset-0 rounded-full animate-ping opacity-75',
            statusColorMap[status],
          )}
        />
      )}
    </span>
  );
};

// ─── 5. Avatar Badge (Ícone de Nicho / Marca no Canto) ───────────────────────
export interface AvatarBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  position?: 'bottom-right' | 'top-right';
}

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  position = 'bottom-right',
  className,
  children,
  ...props
}) => {
  return (
    <span
      className={cn(
        'absolute z-10 flex items-center justify-center rounded-full bg-white text-zinc-700 ring-2 ring-white dark:ring-zinc-900 shadow-xs',
        'h-4 w-4 p-0.5',
        position === 'bottom-right' ? 'bottom-0 right-0 translate-x-1/4 translate-y-1/4' : 'top-0 right-0 translate-x-1/4 -translate-y-1/4',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
};

// ─── 6. Avatar Group (Padrão Coss UI / Origin UI) ────────────────────────────
export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  max?: number;
  totalCount?: number;
  children: React.ReactNode;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  max = 4,
  totalCount,
  children,
  className,
  ...props
}) => {
  const childArray = React.Children.toArray(children);
  const visibleAvatars = childArray.slice(0, max);
  const remainingCount = totalCount ? totalCount - visibleAvatars.length : childArray.length - visibleAvatars.length;

  return (
    <div className={cn('flex items-center -space-x-2.5', className)} {...props}>
      {visibleAvatars.map((child, index) => (
        <div
          key={index}
          className="relative transition-transform duration-200 hover:z-20 hover:scale-110 ring-2 ring-white dark:ring-zinc-900 rounded-full"
        >
          {child}
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="relative z-10 flex h-9 min-w-9 items-center justify-center rounded-full bg-zinc-100 px-2 text-xs font-bold text-zinc-700 ring-2 ring-white dark:ring-zinc-900 shadow-2xs hover:bg-zinc-200 transition-colors">
          +{remainingCount}
        </div>
      )}
    </div>
  );
};

// ─── 7. TenantAvatar Especializado para o Ecossistema SaaS ───────────────────
export interface TenantAvatarProps {
  name: string;
  src?: string;
  niche?: 'RESTAURANT' | 'BARBERSHOP' | 'SUPERMARKET' | string;
  status?: 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED' | string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'squircle';
  showStatus?: boolean;
  showNicheBadge?: boolean;
  className?: string;
}

// Helper para obter iniciais elegantes (2 letras)
export const getInitials = (name: string): string => {
  if (!name) return 'SA';
  const clean = name.trim().replace(/[^\w\sÀ-ÿ]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
};

// Paletas refinadas de gradiente e borda por nicho no estilo Coss UI
const nicheStyles: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    icon: React.ReactNode;
  }
> = {
  RESTAURANT: {
    bg: 'bg-gradient-to-br from-amber-100 via-orange-50 to-amber-200/80',
    text: 'text-amber-900',
    border: 'border-amber-300/60 shadow-[0_2px_8px_rgba(245,158,11,0.12)]',
    icon: <UtensilsCrossed className="w-2.5 h-2.5 text-amber-700" />,
  },
  BARBERSHOP: {
    bg: 'bg-gradient-to-br from-slate-800 via-zinc-900 to-slate-950',
    text: 'text-zinc-100',
    border: 'border-zinc-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.15)]',
    icon: <Scissors className="w-2.5 h-2.5 text-slate-200" />,
  },
  SUPERMARKET: {
    bg: 'bg-gradient-to-br from-emerald-100 via-teal-50 to-emerald-200/80',
    text: 'text-emerald-900',
    border: 'border-emerald-300/60 shadow-[0_2px_8px_rgba(16,185,129,0.12)]',
    icon: <ShoppingCart className="w-2.5 h-2.5 text-emerald-700" />,
  },
  DEFAULT: {
    bg: 'bg-gradient-to-br from-indigo-100 via-sky-50 to-indigo-200/80',
    text: 'text-indigo-950',
    border: 'border-indigo-300/60 shadow-[0_2px_8px_rgba(99,102,241,0.12)]',
    icon: <Store className="w-2.5 h-2.5 text-indigo-700" />,
  },
};

export const TenantAvatar: React.FC<TenantAvatarProps> = ({
  name,
  src,
  niche = 'DEFAULT',
  status = 'ACTIVE',
  size = 'md',
  shape = 'squircle',
  showStatus = true,
  showNicheBadge = false,
  className,
}) => {
  const initials = getInitials(name);
  const nicheKey = nicheStyles[niche] ? niche : 'DEFAULT';
  const style = nicheStyles[nicheKey];

  const statusType =
    status === 'ACTIVE'
      ? 'active'
      : status === 'TRIAL'
      ? 'away'
      : status === 'PAST_DUE'
      ? 'busy'
      : 'offline';

  return (
    <div className={cn('relative inline-flex shrink-0 select-none', className)}>
      <Avatar
        size={size}
        shape={shape}
        className={cn(
          'border shadow-2xs',
          style.border,
          shape === 'squircle' ? 'rounded-2xl' : 'rounded-full',
        )}
      >
        {src && <AvatarImage src={src} alt={name} className="object-cover" />}
        <AvatarFallback
          className={cn(
            style.bg,
            style.text,
            shape === 'squircle' ? 'rounded-2xl' : 'rounded-full',
            'font-bold tracking-tight',
          )}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Indicador de Status Coss UI */}
      {showStatus && (
        <AvatarIndicator
          status={statusType}
          pulse={status === 'ACTIVE'}
          position="bottom-right"
          className={shape === 'squircle' ? 'translate-x-1 translate-y-1 ring-2 ring-white' : undefined}
        />
      )}

      {/* Badge de Nicho no Canto Superior */}
      {showNicheBadge && (
        <AvatarBadge
          position="top-right"
          className="bg-white border border-zinc-200/80 shadow-2xs"
        >
          {style.icon}
        </AvatarBadge>
      )}
    </div>
  );
};

export { Avatar, AvatarImage, AvatarFallback };
