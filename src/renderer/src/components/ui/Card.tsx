import type { HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('rounded-lg bg-surface shadow-soft', className)} {...props} />
}

export function ListGroup({
  title,
  footnote,
  className,
  children
}: {
  title?: string
  footnote?: string
  className?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className={className}>
      {title && (
        <h2 className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
          {title}
        </h2>
      )}
      <div className="inset-list overflow-hidden rounded-lg bg-surface shadow-soft">{children}</div>
      {footnote && <p className="mt-1.5 px-3 text-xs text-faint">{footnote}</p>}
    </section>
  )
}
