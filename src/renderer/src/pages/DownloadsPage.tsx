import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { listSpring } from '@renderer/lib/motion'
import { cn } from '@renderer/lib/cn'
import { totalSpeed, useDownloadsStore } from '@renderer/stores/downloads.store'
import { Page } from '@renderer/components/chrome/Page'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { DownloadIcon, FolderIcon } from '@renderer/components/icons'
import { formatBytes, formatSpeed } from '@shared/util'
import type { DownloadTask } from '@shared/types'

const STATE_ORDER: Record<DownloadTask['state'], number> = {
  running: 0,
  queued: 1,
  paused: 2,
  error: 3,
  done: 4
}

export function DownloadsPage(): React.ReactElement {
  const t = useI18n()
  const tasks = useDownloadsStore((state) => state.tasks)
  const load = useDownloadsStore((state) => state.load)
  const clearFinished = useDownloadsStore((state) => state.clearFinished)

  useEffect(() => {
    void load()
  }, [load])

  const list = useMemo(
    () =>
      [...tasks.values()].sort(
        (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.label.localeCompare(b.label, 'ru')
      ),
    [tasks]
  )

  const speed = totalSpeed(tasks.values())
  const active = list.filter((task) => task.state === 'running' || task.state === 'queued').length

  return (
    <Page
      title={t.downloads.title}
      subtitle={t.downloads.subtitle}
      actions={
        list.length > 0 ? (
          <Button size="sm" onClick={() => void clearFinished()}>
            {t.downloads.clear}
          </Button>
        ) : undefined
      }
    >
      {list.length === 0 ? (
        <EmptyState
          icon={<DownloadIcon size={26} />}
          title={t.downloads.emptyTitle}
          body={t.downloads.emptyBody}
        />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-8 rounded-lg bg-surface px-4 py-3 shadow-soft">
            <Metric label={t.downloads.total} value={formatSpeed(speed)} />
            <Metric label={t.downloads.active} value={`${active}`} />
            <Metric
              label={t.downloads.states.done}
              value={`${list.filter((task) => task.state === 'done').length}`}
            />
            <Metric
              label={t.downloads.states.error}
              value={`${list.filter((task) => task.state === 'error').length}`}
            />
          </div>

          <ul className="inset-list overflow-hidden rounded-lg bg-surface shadow-soft">
            <AnimatePresence initial={false}>
              {list.map((task) => (
                <motion.li
                  key={task.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={listSpring}
                >
                  <DownloadRow task={task} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </Page>
  )
}

function Metric({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div className="text-xs text-faint">{label}</div>
      <div className="font-mono text-sm text-ink">{value}</div>
    </div>
  )
}

function DownloadRow({ task }: { task: DownloadTask }): React.ReactElement {
  const t = useI18n()
  const percent = task.size > 0 ? Math.min(100, Math.round((task.received / task.size) * 100)) : 0

  return (
    <div className="flex h-14 items-center gap-4 px-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm text-ink">{task.label}</span>
          <span className="shrink-0 text-xs text-faint">{t.downloads.kinds[task.kind]}</span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <div className="h-[3px] w-40 overflow-hidden rounded-full bg-fill">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-200',
                task.state === 'error' ? 'bg-danger' : 'bg-accent'
              )}
              style={{ width: `${task.state === 'done' ? 100 : percent}%` }}
            />
          </div>
          <span className="text-xs text-muted">
            {task.state === 'error'
              ? (task.error ?? t.downloads.states.error)
              : `${formatBytes(task.received)} / ${formatBytes(task.size)}`}
            {task.state === 'running' && task.speedBps ? ` · ${formatSpeed(task.speedBps)}` : ''}
          </span>
        </div>
      </div>

      <span className="w-24 shrink-0 text-right text-xs text-muted">{t.downloads.states[task.state]}</span>

      <div className="flex w-40 shrink-0 justify-end gap-1">
        {task.state === 'running' && (
          <Button size="sm" variant="ghost" onClick={() => void api.downloads.pause(task.id)}>
            {t.downloads.pause}
          </Button>
        )}
        {task.state === 'paused' && (
          <Button size="sm" variant="ghost" onClick={() => void api.downloads.resume(task.id)}>
            {t.downloads.resume}
          </Button>
        )}
        {task.state === 'error' && (
          <Button size="sm" variant="ghost" onClick={() => void api.downloads.retry(task.id)}>
            {t.downloads.retry}
          </Button>
        )}
        {(task.state === 'running' || task.state === 'queued' || task.state === 'paused') && (
          <Button size="sm" variant="ghost" onClick={() => void api.downloads.cancel(task.id)}>
            {t.downloads.cancel}
          </Button>
        )}
        {task.state === 'done' && (
          <Button
            size="sm"
            variant="ghost"
            icon={<FolderIcon size={14} />}
            aria-label={t.downloads.reveal}
            onClick={() => void api.downloads.reveal(task.id)}
          >
            {t.downloads.reveal}
          </Button>
        )}
      </div>
    </div>
  )
}
