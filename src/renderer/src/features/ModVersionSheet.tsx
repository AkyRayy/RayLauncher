import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { listSpring } from '@renderer/lib/motion'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Skeleton } from '@renderer/components/ui/Skeleton'
import { CheckIcon, WarningIcon } from '@renderer/components/icons'
import { useModsStore } from '@renderer/stores/mods.store'
import { formatBytes } from '@shared/util'
import type { ContentKind, ModVersionInfo, Profile } from '@shared/types'

interface InstallSummary {
  dependencies: ModVersionInfo[]
  incompatible: string[]
  missing: string[]
}

export function ModVersionSheet({
  profile,
  projectId,
  source,
  kind,
  title,
  onClose
}: {
  profile: Profile
  projectId: string
  source: 'modrinth' | 'curseforge' | 'local'
  kind: ContentKind
  title: string
  onClose: () => void
}): React.ReactElement {
  const t = useI18n()
  const install = useModsStore((state) => state.install)
  const busyId = useModsStore((state) => state.busyId)

  const [versions, setVersions] = useState<ModVersionInfo[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [planState, setPlanState] = useState<{ key: string; value: InstallSummary } | null>(null)

  useEffect(() => {
    let alive = true
    api.mods
      .versions({ source, projectId, profileId: profile.id, kind })
      .then((list) => {
        if (alive) setVersions(list)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [source, projectId, profile.id, kind])

  const selected = useMemo(() => {
    if (!versions || versions.length === 0) return null
    return versions.find((item) => item.versionId === picked) ?? versions[0] ?? null
  }, [versions, picked])

  useEffect(() => {
    if (!selected) return
    let alive = true
    const key = selected.versionId
    api.mods
      .plan({ profileId: profile.id, version: selected })
      .then((result) => {
        if (alive) setPlanState({ key, value: result })
      })
      .catch(() => {
        if (alive) {
          setPlanState({ key, value: { dependencies: [], incompatible: [], missing: [] } })
        }
      })
    return () => {
      alive = false
    }
  }, [selected, profile.id])

  const plan = planState && planState.key === selected?.versionId ? planState.value : null

  const busy = busyId === projectId
  const blocked = (plan?.incompatible.length ?? 0) > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-40 grid place-items-center bg-black/25 px-6"
      role="presentation"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={listSpring}
        role="dialog"
        aria-modal="true"
        aria-label={t.mods.versionsTitle}
        className="material-pop flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {t.mods.versionFor(profile.gameVersion, profile.loader.kind)}
          </p>
        </header>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {!versions && !failed && (
            <div className="space-y-2">
              <Skeleton className="h-12 rounded-sm" />
              <Skeleton className="h-12 rounded-sm" />
              <Skeleton className="h-12 rounded-sm" />
            </div>
          )}

          {(failed || versions?.length === 0) && (
            <EmptyState title={t.mods.noVersions} body={t.mods.noVersionsBody} />
          )}

          {versions && versions.length > 0 && (
            <ul className="space-y-1.5">
              {versions.slice(0, 30).map((version) => {
                const active = version.versionId === selected?.versionId
                return (
                  <li key={version.versionId}>
                    <button
                      type="button"
                      onClick={() => setPicked(version.versionId)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
                        active ? 'bg-fill' : 'hover:bg-fill/60'
                      )}
                      aria-pressed={active}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{version.versionNumber}</span>
                        <span className="mt-0.5 block truncate text-xs text-faint">
                          {version.fileName} · {formatBytes(version.size)}
                        </span>
                      </span>
                      <ReleaseBadge type={version.releaseType} />
                      {active && <CheckIcon size={15} className="text-accent" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {plan && plan.dependencies.length > 0 && (
            <section className="mt-4 rounded-sm bg-fill px-3 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-faint">
                {t.mods.depsTitle}
              </h3>
              <ul className="mt-1.5 space-y-0.5">
                {plan.dependencies.map((dependency) => (
                  <li key={dependency.versionId} className="text-sm text-ink">
                    {dependency.title}{' '}
                    <span className="text-faint">{dependency.versionNumber}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan && plan.missing.length > 0 && (
            <p className="mt-3 flex items-start gap-2 text-sm text-warning">
              <WarningIcon size={15} className="mt-0.5 shrink-0" />
              {t.mods.depsMissing}: {plan.missing.join(', ')}
            </p>
          )}

          {blocked && (
            <p className="mt-3 flex items-start gap-2 text-sm text-danger">
              <WarningIcon size={15} className="mt-0.5 shrink-0" />
              {t.mods.depsIncompatible}: {plan?.incompatible.join(', ')}
            </p>
          )}
        </div>

        <footer className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!selected || busy || blocked}
            onClick={() => {
              if (!selected) return
              void install(profile.id, selected).then((ok) => {
                if (ok) onClose()
              })
            }}
          >
            {busy
              ? t.mods.installing
              : plan && plan.dependencies.length > 0
                ? t.mods.installWithDeps(plan.dependencies.length)
                : t.mods.install}
          </Button>
        </footer>
      </motion.div>
    </motion.div>
  )
}

export function ReleaseBadge({
  type
}: {
  type: ModVersionInfo['releaseType']
}): React.ReactElement {
  const t = useI18n()
  const label =
    type === 'release' ? t.mods.releaseRelease : type === 'beta' ? t.mods.releaseBeta : t.mods.releaseAlpha

  return (
    <span
      className={cn(
        'shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
        type === 'release' ? 'bg-success/12 text-success' : 'bg-fill text-muted'
      )}
    >
      {label}
    </span>
  )
}
