import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  pending?: boolean
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md border font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-disabled-background disabled:bg-disabled-background disabled:text-disabled-foreground disabled:shadow-none'

const variants: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
  secondary:
    'border-border-control bg-surface text-content-primary hover:bg-primary-subtle active:bg-primary-subtle-hover',
  ghost:
    'border-transparent bg-transparent text-primary shadow-none hover:bg-primary-subtle active:bg-primary-subtle-hover',
  danger:
    'border-transparent bg-error text-white hover:bg-error-hover active:bg-error-active',
  inverse:
    'border-transparent bg-inverse-background text-inverse-foreground hover:bg-primary-subtle active:bg-primary-subtle-hover',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-xs',
  md: 'min-h-11 px-4 py-2 text-sm',
  lg: 'min-h-12 px-5 py-2.5 text-base',
  icon: 'min-h-11 min-w-11 p-2.5 text-sm',
}

// This companion recipe is intentionally colocated with Button so native links
// can share the exact visual contract without duplicating variant maps.
// eslint-disable-next-line react-refresh/only-export-components
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}) {
  return [base, variants[variant], sizes[size], className].filter(Boolean).join(' ')
}

export function Button({
  variant = 'primary',
  size = 'md',
  pending = false,
  disabled,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
      className={buttonClassName({ variant, size, className })}
    />
  )
}
