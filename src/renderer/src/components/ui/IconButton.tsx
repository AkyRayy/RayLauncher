import { motion } from 'framer-motion'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

interface IconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
  > {
  label: string
  icon: ReactNode
  active?: boolean
}

export function IconButton({
  label,
  icon,
  active,
  className,
  ...props
}: IconButtonProps): React.ReactElement {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.08 }}
      className={cn(
        'no-drag inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors duration-100',
        active ? 'bg-fill text-accent' : 'text-muted hover:bg-fill hover:text-ink',
        className
      )}
      {...props}
    >
      {icon}
    </motion.button>
  )
}
