import { useRef, useState, type ReactNode, type UIEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { pageTransition, pageVariants } from '@renderer/lib/motion'

export function Page({
  title,
  subtitle,
  actions,
  children,
  scroll = true
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  scroll?: boolean
}): React.ReactElement {
  const [condensed, setCondensed] = useState(false)
  const raf = useRef(0)

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const top = event.currentTarget.scrollTop
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => setCondensed(top > 24))
  }

  return (
    <motion.main
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      <AnimatePresence>
        {condensed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="material-bar pointer-events-none absolute inset-x-0 top-0 z-20 flex h-10 items-center justify-center hairline-b"
          >
            <span className="text-sm font-semibold text-ink">{title}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        onScroll={scroll ? onScroll : undefined}
        className={
          scroll
            ? 'min-h-0 flex-1 overflow-y-auto px-8 pb-10'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden px-8 pb-10'
        }
      >
        <header className="flex items-end justify-between gap-6 pb-5 pt-7">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>

        {scroll ? children : <div className="flex min-h-0 flex-1 flex-col">{children}</div>}
      </div>
    </motion.main>
  )
}
