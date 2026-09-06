import { motion } from 'framer-motion'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
  > {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  full?: boolean
}

const base =
  'no-drag inline-flex select-none items-center justify-center gap-1.5 font-medium ' +
  'transition-[background-color,box-shadow,color] duration-100 ' +
  'disabled:pointer-events-none disabled:opacity-40'

const variants: Record<Variant, string> = {
  primary: 'control-accent text-on-accent',
  secondary: 'control-face text-ink',
  ghost: 'text-muted hover:bg-fill hover:text-ink',
  danger: 'bg-danger text-white shadow-soft hover:brightness-110'
}

const sizes: Record<Size, string> = {
  sm: 'h-[26px] rounded-sm px-2.5 text-xs',
  md: 'h-[30px] rounded-[7px] px-3 text-sm',
  lg: 'h-9 rounded-md px-4 text-sm'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  full,
  className,
  children,
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.08 }}
      className={cn(base, variants[variant], sizes[size], full && 'w-full', className)}
      {...props}
    >
      {icon}
      {children}
    </motion.button>
  )
}
