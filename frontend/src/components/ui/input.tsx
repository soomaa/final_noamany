import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-[10px] border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors',
        'dark:bg-[rgba(255,255,255,.04)] dark:border-[rgba(255,255,255,.09)] dark:text-[#D4CBCD] dark:shadow-none',
        'placeholder:text-muted-foreground dark:placeholder:text-[#8E8486]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
        'dark:focus-visible:border-[rgba(111,183,230,.5)] dark:focus-visible:ring-[rgba(111,183,230,.2)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
