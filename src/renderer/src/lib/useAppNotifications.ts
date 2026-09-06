import { useEffect } from 'react'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { useToastsStore } from '@renderer/stores/toasts.store'

export function useAppNotifications(): void {
  const t = useI18n()
  const push = useToastsStore((state) => state.push)

  useEffect(() => {
    const seenFailures = new Set<string>()

    const offGame = api.on['game:state']((state) => {
      if (state.phase !== 'crashed') return
      push({
        tone: 'danger',
        title: t.toasts.gameCrashed,
        body: t.toasts.gameCrashedBody,
        ...(state.crashReportPath
          ? { action: { label: t.launch.crashReport, run: () => void api.game.revealCrash() } }
          : {})
      })
    })

    const offDownload = api.on['download:progress']((task) => {
      if (task.state !== 'error' || seenFailures.has(task.id)) return
      seenFailures.add(task.id)
      push({
        tone: 'warning',
        title: t.toasts.downloadFailed,
        body: `${task.label}${task.error ? ` — ${task.error}` : ''}`,
        action: { label: t.common.retry, run: () => void api.downloads.retry(task.id) }
      })
    })

    const offUpdate = api.on['update:state']((state) => {
      if (state.phase !== 'ready' || !state.version) return
      push({
        tone: 'info',
        title: t.toasts.updateReady,
        body: t.toasts.updateReadyBody(state.version),
        timeoutMs: 0,
        action: { label: t.toasts.updateRestart, run: () => void api.updates.install() }
      })
    })

    return () => {
      offGame()
      offDownload()
      offUpdate()
    }
  }, [t, push])
}
