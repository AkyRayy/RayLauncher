import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { useLocale } from '@renderer/lib/format'
import { listSpring } from '@renderer/lib/motion'
import { filterVersions, useVersionsStore } from '@renderer/stores/versions.store'
import { useLaunchStore } from '@renderer/stores/launch.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { Button } from '@renderer/components/ui/Button'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { TextInput } from '@renderer/components/ui/Field'
import { Skeleton } from '@renderer/components/ui/Skeleton'
import { ProgressRing } from '@renderer/components/ui/ProgressRing'
import { CheckIcon, SearchIcon, WarningIcon } from '@renderer/components/icons'
import type { VersionSummary } from '@shared/types'

export function VersionPicker(): React.ReactElement {
  const t = useI18n()
  const { catalog, loading, error, installing, load, install, cancel } = useVersionsStore()
  const stage = useLaunchStore((state) => state.stage)
  const selectedId = useSettingsStore((state) => state.settings.lastVersionId)
  const patch = useSettingsStore((state) => state.patch)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'release' | 'snapshot' | 'all'>('release')

  useEffect(() => {
    if (!catalog) void load()
  }, [catalog, load])

  const versions = useMemo(
    () => (catalog ? filterVersions(catalog.versions, query, type).slice(0, 60) : []),
    [catalog, query, type]
  )

  return (
    <section aria-label={t.versions.title}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint">
            <SearchIcon size={14} />
          </span>
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.versions.search}
            aria-label={t.versions.search}
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>

        <SegmentedControl
          size="sm"
          ariaLabel={t.versions.filter}
          value={type}
          onChange={setType}
          options={[
            { value: 'release', label: t.versions.releases },
            { value: 'snapshot', label: t.versions.snapshots },
            { value: 'all', label: t.versions.all }
          ]}
        />

        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          {catalog && (
            <span>
              {t.versions.latest}: <span className="text-ink">{catalog.latestRelease}</span>
              {catalog.fromCache && ` · ${t.versions.offline}`}
            </span>
          )}
          <Button size="sm" onClick={() => void load(true)} disabled={loading}>
            {t.versions.refresh}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-sm bg-fill p-3 text-xs text-danger">
          <WarningIcon size={14} />
          {t.errors[error.code]}
        </p>
      )}

      <div className="inset-list max-h-[320px] overflow-y-auto rounded-lg bg-surface shadow-soft">
        {loading && !catalog ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {versions.map((version) => (
                <motion.li
                  key={version.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={listSpring}
                >
                  <VersionRow
                    version={version}
                    selected={selectedId === version.id}
                    onSelect={() => void patch({ lastVersionId: version.id })}
                    busy={installing === version.id}
                    progress={stage?.versionId === version.id ? stage.progress : 0}
                    stageLabel={stage?.versionId === version.id ? stage.label : ''}
                    disabled={installing !== null && installing !== version.id}
                    onInstall={() => {
                      void patch({ lastVersionId: version.id })
                      void install(version.id)
                    }}
                    onCancel={() => void cancel(version.id)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  )
}

function VersionRow({
  version,
  selected,
  onSelect,
  busy,
  progress,
  stageLabel,
  disabled,
  onInstall,
  onCancel
}: {
  version: VersionSummary
  selected: boolean
  onSelect: () => void
  busy: boolean
  progress: number
  stageLabel: string
  disabled: boolean
  onInstall: () => void
  onCancel: () => void
}): React.ReactElement {
  const t = useI18n()
  const locale = useLocale()
  const date = new Date(version.releaseTime).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })

  return (
    <div className={cn('flex h-12 items-center gap-2 px-2', selected && 'bg-accent-soft')}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm px-1.5 py-1 text-left"
      >
        <span className={cn('shrink-0', selected ? 'text-accent' : 'text-transparent')} aria-hidden>
          <CheckIcon size={15} />
        </span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm text-ink">{version.id}</span>
            {version.type !== 'release' && (
              <span className="rounded-xs bg-fill px-1.5 text-xs text-faint">
                {t.versions.snapshotBadge}
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted">
            {busy && stageLabel
              ? stageLabel
              : `${date}${version.installed ? ` · ${t.versions.installed}` : ''}`}
          </span>
        </span>
      </button>

      {busy ? (
        <div className="flex items-center gap-2 text-accent">
          <ProgressRing value={progress} size={26} strokeWidth={2.5} label={stageLabel} />
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant={version.installed ? 'secondary' : 'primary'}
          disabled={disabled}
          onClick={onInstall}
        >
          {version.installed ? t.versions.reinstall : t.versions.install}
        </Button>
      )}
    </div>
  )
}
