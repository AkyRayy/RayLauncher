import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { listSpring } from '@renderer/lib/motion'

interface EmptyStateProps {
  title: string
  body: string
  icon?: ReactNode
  action?: ReactNode
  note?: string
}

export function EmptyState({ title, body, icon, action, note }: EmptyStateProps): React.ReactElement {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listSpring}
      className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center"
    >
      {icon && <div className="mb-4 text-faint [&_svg]:h-11 [&_svg]:w-11">{icon}</div>}
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{body}</p>
      {note && <span className="mt-3 text-xs text-faint">{note}</span>}
      {action && <div className="mt-5">{action}</div>}
    </motion.section>
  )
}
