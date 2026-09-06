import { cn } from '@renderer/lib/cn'

export function Skeleton({ className }: { className?: string }): React.ReactElement {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-sunken', className)}
      role="presentation"
    />
  )
}
