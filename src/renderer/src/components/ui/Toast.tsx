import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { useToastsStore, type ToastTone } from '@renderer/stores/toasts.store'
import { CheckIcon, WarningIcon, WinCloseIcon } from '@renderer/components/icons'

const TONE_ICON: Record<ToastTone, React.ReactElement | null> = {
  info: null,
  success: <CheckIcon size={15} className="text-success" />,
  warning: <WarningIcon size={15} className="text-warning" />,
  danger: <WarningIcon size={15} className="text-danger" />
}

export function ToastHost(): React.ReactElement {
  const t = useI18n()
  const toasts = useToastsStore((state) => state.toasts)
  const dismiss = useToastsStore((state) => state.dismiss)

  return (
    <div
      aria-live="polite"
      aria-relevant="additions text"
      className="pointer-events-none fixed bottom-[86px] right-5 z-50 flex w-80 flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.output
            key={item.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="material-pop pointer-events-auto block rounded-md p-3.5"
          >
            <div className="flex items-start gap-2.5">
              {TONE_ICON[item.tone] && <span className="mt-0.5 shrink-0">{TONE_ICON[item.tone]}</span>}

              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium text-ink', item.tone === 'danger' && 'text-danger')}>
                  {item.title}
                </p>
                {item.body && <p className="mt-0.5 text-xs leading-5 text-muted">{item.body}</p>}

                {item.action && (
                  <button
                    type="button"
                    className="mt-2 rounded-sm text-xs font-medium text-accent transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    onClick={() => {
                      item.action?.run()
                      dismiss(item.id)
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
              </div>

              <button
                type="button"
                aria-label={t.window.close}
                className="-mr-1 -mt-1 rounded-sm p-1 text-faint transition-colors hover:bg-fill hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
                onClick={() => dismiss(item.id)}
              >
                <WinCloseIcon width={9} height={9} />
              </button>
            </div>
          </motion.output>
        ))}
      </AnimatePresence>
    </div>
  )
}
