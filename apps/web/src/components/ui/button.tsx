import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 ring-1 ring-primary/10',
        brand:
          'bg-sky-600 text-white hover:bg-sky-500 shadow-sm shadow-sky-600/25 ring-1 ring-sky-700/10',
        destructive:
          'bg-rose-600 text-white hover:bg-rose-500 shadow-sm shadow-rose-600/20 ring-1 ring-rose-700/10',
        outline:
          'border border-input bg-white text-foreground hover:bg-secondary hover:border-foreground/15 shadow-sm',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-border',
        ghost: 'hover:bg-secondary text-foreground/80 hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        soft: 'bg-sky-50 text-sky-700 hover:bg-sky-100 ring-1 ring-sky-200/60',
        success:
          'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-600/20 ring-1 ring-emerald-700/10',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-5 text-sm',
        icon: 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
