import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { Skeleton } from '@renderer/components/ui/Skeleton'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { useActiveProfile } from '@renderer/stores/profiles.store'
import { FolderIcon, WarningIcon } from '@renderer/components/icons'
import { formatMemory } from '@shared/util'
import type { AppInfo, JavaRuntimeInfo } from '@shared/types'

export function StatusCards({
  info,
  runtimes
}: {
  info: AppInfo | null
  runtimes: JavaRuntimeInfo[] | null
}): React.ReactElement {
  const t = useI18n()
  const profile = useActiveProfile()
  const defaultMemory = useSettingsStore((state) => state.settings.defaultMemoryMb)

  const heapMb = profile?.memory.maxMb ?? defaultMemory
  const totalMb = info?.totalMemoryMb ?? 0
  const share = totalMb > 0 ? Math.min(heapMb / totalMb, 1) : 0
  const installedJava = (runtimes ?? []).filter((item) => item.installed && item.majorVersion > 0)
  const newest = installedJava.sort((left, right) => right.majorVersion - left.majorVersion)[0]

  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
      <article className="rounded-lg bg-surface p-4 shadow-soft">
        <h3 className="text-sm font-semibold text-ink">{t.home.memory}</h3>
        {info ? (
          <>
            <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-fill" role="presentation">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted tabular-nums">
              {formatMemory(heapMb)} / {formatMemory(totalMb)} · {t.home.javaHeap}
            </p>
          </>
        ) : (
          <Skeleton className="mt-3 h-8" />
        )}
      </article>

      <article className="rounded-lg bg-surface p-4 shadow-soft">
        <h3 className="text-sm font-semibold text-ink">{t.versions.javaTitle}</h3>
        {runtimes ? (
          <p className={cn('mt-3 text-sm', newest ? 'text-ink' : 'text-muted')}>
            {newest ? `Java ${newest.majorVersion}` : t.home.javaWillDownload}
          </p>
        ) : (
          <Skeleton className="mt-3 h-8" />
        )}
        {newest && <p className="mt-1 truncate font-mono text-xs text-faint">{newest.component}</p>}
      </article>

      <article className="rounded-lg bg-surface p-4 shadow-soft">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{t.home.gamesFolder}</h3>
          <button
            type="button"
            aria-label={t.home.openFolder}
            title={t.home.openFolder}
            onClick={() => void api.system.openFolder('games')}
            className="shrink-0 rounded-sm p-1 text-faint transition-colors duration-100 hover:bg-fill hover:text-ink"
          >
            <FolderIcon size={15} />
          </button>
        </div>
        {info ? (
          <p className="mt-3 truncate font-mono text-xs text-muted" title={info.gamesDir}>
            {info.gamesDir}
          </p>
        ) : (
          <Skeleton className="mt-3 h-8" />
        )}
        {info?.oneDriveWarning === true && (
          <p className="mt-2 flex items-start gap-1.5 text-2xs text-warning">
            <WarningIcon size={12} />
            {t.home.oneDrive}
          </p>
        )}
      </article>
    </div>
  )
}
