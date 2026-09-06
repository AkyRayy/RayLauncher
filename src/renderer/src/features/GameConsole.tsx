import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { useLaunchStore } from '@renderer/stores/launch.store'
import { Button } from '@renderer/components/ui/Button'
import { WarningIcon } from '@renderer/components/icons'
import type { LogLine, LogLevel } from '@shared/types'

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-faint',
  info: 'text-muted',
  warn: 'text-warning',
  error: 'text-danger'
}

export function GameConsole({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement {
  const t = useI18n()
  const log = useLaunchStore((state) => state.log)
  const game = useLaunchStore((state) => state.game)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ block: 'end' })
  }, [log, open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/25"
            aria-hidden
          />
          <motion.section
            role="dialog"
            aria-label={t.launch.console}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 460, damping: 44 }}
            className="material-pop absolute inset-x-4 bottom-4 z-50 flex h-[62%] flex-col overflow-hidden rounded-xl"
          >
            <header className="flex h-11 shrink-0 items-center justify-between px-4 hairline-b">
              <div>
                <h2 className="text-sm font-semibold text-ink">{t.launch.console}</h2>
                <p className="text-xs text-faint">{t.launch.consoleHint}</p>
              </div>
              <div className="flex items-center gap-2">
                {game?.crashReportPath && (
                  <Button size="sm" icon={<WarningIcon size={13} />} onClick={() => void api.game.revealCrash()}>
                    {t.launch.crashReport}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(log.map(formatLine).join('\n'))}
                  disabled={log.length === 0}
                >
                  {t.launch.copyLog}
                </Button>
                <Button size="sm" variant="primary" onClick={onClose}>
                  {t.launch.close}
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-xs leading-5">
              {log.length === 0 ? (
                <p className="text-faint">{t.launch.consoleEmpty}</p>
              ) : (
                log.map((line, index) => (
                  <div key={`${line.time}-${index}`} className="flex gap-3">
                    <span className="shrink-0 text-faint tabular-nums">{formatTime(line.time)}</span>
                    <span className={cn('whitespace-pre-wrap break-all', LEVEL_COLOR[line.level])}>
                      {line.text}
                    </span>
                  </div>
                ))
              )}
              <div ref={bottom} />
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}

function formatTime(time: number): string {
  return new Date(time).toLocaleTimeString('ru-RU', { hour12: false })
}

function formatLine(line: LogLine): string {
  return `[${formatTime(line.time)}] [${line.level.toUpperCase()}] ${line.text}`
}
