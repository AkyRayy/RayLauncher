import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { listSpring } from '@renderer/lib/motion'
import { Button } from '@renderer/components/ui/Button'
import { WarningIcon } from '@renderer/components/icons'
import { useCrashStore } from '@renderer/stores/crash.store'
import { useLaunchStore } from '@renderer/stores/launch.store'

export function CrashDialog(): React.ReactElement | null {
  const t = useI18n()
  const game = useLaunchStore((state) => state.game)
  const verdict = useCrashStore((state) => state.verdict)
  const open = useCrashStore((state) => state.open)
  const busyFix = useCrashStore((state) => state.busyFix)
  const sending = useCrashStore((state) => state.sending)
  const sent = useCrashStore((state) => state.sent)
  const lastResult = useCrashStore((state) => state.lastResult)
  const load = useCrashStore((state) => state.load)
  const setOpen = useCrashStore((state) => state.setOpen)
  const applyFix = useCrashStore((state) => state.applyFix)
  const sendReport = useCrashStore((state) => state.sendReport)
  const clear = useCrashStore((state) => state.clear)

  const prevPhase = useRef(game?.phase)

  useEffect(() => {
    const phase = game?.phase
    const prev = prevPhase.current
    prevPhase.current = phase

    if (phase === 'crashed' && prev !== 'crashed') {
      const profileId = game?.profileId
      void load(profileId).then(() => setOpen(true))
    }
    if ((phase === 'running' || phase === 'launching') && prev !== phase) {
      clear()
    }
  }, [game?.phase, game?.profileId, load, setOpen, clear])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 grid place-items-center bg-black/25 px-6"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={listSpring}
            role="dialog"
            aria-modal="true"
            aria-label={t.crash.title}
            className="material-pop max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-ink">{t.crash.title}</h2>
            <p className="mt-1 text-sm text-muted">{t.crash.subtitle}</p>

            {!verdict ? (
              <p className="mt-4 text-sm text-muted">{t.crash.noVerdict}</p>
            ) : (
              <>
                <div className="mt-4 rounded-md bg-fill px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <WarningIcon size={15} className="text-warning" />
                    {(t.crash.codes as Record<string, string>)[verdict.code] ?? verdict.code}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {(t.crash.codes as Record<string, string>)[`${verdict.code}_BODY`] ?? t.crash.unknown}
                  </p>
                </div>

                {verdict.suspects.length > 0 && (
                  <section className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                      {t.crash.suspects}
                    </h3>
                    <ul className="mt-1.5 space-y-1">
                      {verdict.suspects.map((suspect) => (
                        <li key={suspect.fileHint} className="truncate font-mono text-xs text-muted">
                          {suspect.title} · {suspect.fileHint}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                    {t.crash.fixes}
                  </h3>
                  <div className="mt-2 flex flex-col gap-2">
                    {verdict.fixes.map((fixId) => (
                      <Button
                        key={fixId}
                        size="sm"
                        variant="secondary"
                        full
                        disabled={busyFix !== null}
                        onClick={() => void applyFix(game?.profileId, fixId)}
                        className="justify-start"
                      >
                        {busyFix === fixId ? t.common.loading : t.crash.fixLabels[fixId]}
                      </Button>
                    ))}
                  </div>
                </section>

                {lastResult && (
                  <p className={cn('mt-3 text-sm', lastResult.applied ? 'text-success' : 'text-warning')}>
                    {lastResult.message}
                  </p>
                )}

                <div className="mt-4 border-t border-hairline pt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={sending || sent}
                    onClick={() => void sendReport(game?.profileId)}
                  >
                    {sent ? t.crash.sent : sending ? t.crash.sending : t.crash.sendReport}
                  </Button>
                  <p className="mt-1 text-xs text-faint">{t.crash.sendHint}</p>
                </div>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2">
              {verdict?.reportPath && (
                <Button size="sm" variant="ghost" onClick={() => void api.game.revealCrash()}>
                  {t.crash.showReport}
                </Button>
              )}
              <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
                {t.common.ok}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
