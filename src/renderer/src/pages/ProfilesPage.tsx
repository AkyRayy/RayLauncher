import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { Page } from '@renderer/components/chrome/Page'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Switch } from '@renderer/components/ui/Switch'
import {
  CheckIcon,
  FolderIcon,
  PlayIcon,
  PackageIcon,
  PlusIcon,
  ProfilesIcon,
  SettingsIcon,
  WarningIcon
} from '@renderer/components/icons'
import { ProfileWizardHost, labelOf } from '@renderer/features/ProfileWizard'
import { ProfileSettingsSheet } from '@renderer/features/ProfileSettingsSheet'
import { api } from '@renderer/lib/api'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { useLaunchStore } from '@renderer/stores/launch.store'
import { useProfileStats, useStatsStore } from '@renderer/stores/stats.store'
import { TemplatePicker } from '@renderer/features/TemplatePicker'
import { cn } from '@renderer/lib/cn'
import { formatDateTime, useLocale } from '@renderer/lib/format'
import { listSpring } from '@renderer/lib/motion'
import { formatMemory } from '@shared/util'
import type { Profile } from '@shared/types'

export function ProfilesPage(): React.ReactElement {
  const t = useI18n()
  const profiles = useProfilesStore((state) => state.profiles)
  const ready = useProfilesStore((state) => state.ready)
  const error = useProfilesStore((state) => state.error)
  const busyId = useProfilesStore((state) => state.busyId)
  const hydrate = useProfilesStore((state) => state.hydrate)
  const clearError = useProfilesStore((state) => state.clearError)
  const activeId = useSettingsStore((state) => state.settings.activeProfileId)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Profile | null>(null)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<string | null>(null)

  const hydrateStats = useStatsStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate()
    void hydrateStats()
  }, [hydrate, hydrateStats])

  return (
    <Page
      title={t.profiles.title}
      subtitle={t.profiles.subtitle}
      actions={
        <div className="flex items-center gap-2">
          <Button
            icon={<PackageIcon size={14} />}
            disabled={importing}
            onClick={() => {
              setImporting(true)
              void api.mods
                .importPack()
                .then((result) => {
                  if (result) setImported(t.mods.importDone(result.name, result.modsInstalled))
                  return hydrate()
                })
                .finally(() => setImporting(false))
            }}
          >
            {t.mods.importPack}
          </Button>
          <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setWizardOpen(true)}>
            {t.profiles.create}
          </Button>
        </div>
      }
    >
      {error && (
        <div
          role="alert"
          className="mx-auto mb-4 flex max-w-4xl items-start gap-2.5 rounded-md bg-surface px-4 py-3 shadow-soft"
        >
          <WarningIcon size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-sm text-ink">{error.message}</p>
          <Button size="sm" variant="ghost" onClick={clearError}>
            {t.profiles.cancel}
          </Button>
        </div>
      )}

      {imported && (
        <p className="mx-auto mb-4 max-w-4xl text-sm text-muted" role="status">
          {imported}
        </p>
      )}

      <div className="mx-auto max-w-4xl">
        <TemplatePicker />
        {profiles.length === 0 && ready ? (
          <EmptyState
            icon={<ProfilesIcon size={26} />}
            title={t.profiles.emptyTitle}
            body={t.profiles.emptyBody}
            action={
              <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setWizardOpen(true)}>
                {t.profiles.create}
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                active={profile.id === activeId}
                busy={busyId === profile.id}
                onEdit={() => setEditing(profile.id)}
                onRemove={() => setRemoving(profile)}
              />
            ))}
          </ul>
        )}
      </div>

      <ProfileWizardHost open={wizardOpen} onClose={() => setWizardOpen(false)} />
      {editing && <ProfileSettingsSheet profileId={editing} onClose={() => setEditing(null)} />}
      {removing && <RemoveDialog profile={removing} onClose={() => setRemoving(null)} />}
    </Page>
  )
}

function ProfileCard({
  profile,
  active,
  busy,
  onEdit,
  onRemove
}: {
  profile: Profile
  active: boolean
  busy: boolean
  onEdit: () => void
  onRemove: () => void
}): React.ReactElement {
  const t = useI18n()
  const locale = useLocale()
  const setActive = useProfilesStore((state) => state.setActive)
  const install = useProfilesStore((state) => state.install)
  const duplicate = useProfilesStore((state) => state.duplicate)
  const openFolder = useProfilesStore((state) => state.openFolder)
  const launchProfile = useLaunchStore((state) => state.launchProfile)

  const installed = profile.resolvedVersionId !== undefined || profile.loader.kind === 'vanilla'
  const loaderText =
    profile.loader.kind === 'vanilla'
      ? t.profiles.vanillaHint
      : `${labelOf(profile.loader.kind)} ${profile.loader.version ?? ''}`.trim()

  return (
    <motion.li layout transition={listSpring}>
      <Card className={cn('flex h-full flex-col gap-3 p-4', active && 'ring-1 ring-accent/45')}>
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{profile.name}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">
              {profile.gameVersion} · {loaderText}
            </p>
          </div>
          {active && (
            <span className="flex shrink-0 items-center gap-1 rounded-sm bg-accent/12 px-1.5 py-0.5 text-[11px] font-medium text-accent">
              <CheckIcon size={11} />
              {t.profiles.active}
            </span>
          )}
        </header>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
          <div>
            <dt className="text-faint">{t.profiles.memory}</dt>
            <dd className="text-ink">
              {profile.memory.auto ? t.profiles.memoryAuto : formatMemory(profile.memory.maxMb)}
            </dd>
          </div>
          <div>
            <dt className="text-faint">{t.launch.version}</dt>
            <dd className={installed ? 'text-ink' : 'text-warning'}>
              {installed ? t.profiles.installed : t.profiles.notInstalled}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-faint">
          {profile.lastPlayed
            ? t.profiles.lastPlayed(formatDateTime(profile.lastPlayed, locale))
            : t.profiles.never}
        </p>

        <ProfileStatsLine profileId={profile.id} />

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <Button
            size="sm"
            variant="primary"
            icon={<PlayIcon size={13} />}
            onClick={() => {
              void setActive(profile.id)
              void launchProfile(profile.id)
            }}
          >
            {t.profiles.play}
          </Button>
          {!active && (
            <Button size="sm" variant="secondary" onClick={() => void setActive(profile.id)}>
              {t.profiles.makeActive}
            </Button>
          )}
          {!installed && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void install(profile.id)}>
              {busy ? t.profiles.installing : t.profiles.install}
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<SettingsIcon size={13} />} onClick={onEdit}>
            {t.profiles.settings}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<FolderIcon size={13} />}
            onClick={() => void openFolder(profile.id)}
          >
            {t.profiles.openFolder}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void duplicate(profile.id)}>
            {t.profiles.duplicate}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            {t.profiles.remove}
          </Button>
        </div>
      </Card>
    </motion.li>
  )
}

function ProfileStatsLine({ profileId }: { profileId: string }): React.ReactElement {
  const t = useI18n()
  const stats = useProfileStats(profileId)

  if (!stats || stats.launches === 0) {
    return <p className="text-xs text-faint">{t.profiles.neverPlayed}</p>
  }

  const parts = [
    t.profiles.launches(stats.launches),
    t.profiles.playtime(formatPlaytime(stats.playtimeMs))
  ]
  if (stats.crashes > 0) parts.push(t.profiles.crashes(stats.crashes))
  return <p className="text-xs text-faint">{parts.join(' · ')}</p>
}

function formatPlaytime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function RemoveDialog({
  profile,
  onClose
}: {
  profile: Profile
  onClose: () => void
}): React.ReactElement {
  const t = useI18n()
  const remove = useProfilesStore((state) => state.remove)
  const [deleteFiles, setDeleteFiles] = useState(false)

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
        aria-label={t.profiles.removeTitle(profile.name)}
        className="material-pop w-full max-w-sm rounded-lg p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink">{t.profiles.removeTitle(profile.name)}</h2>
        <p className="mt-1 text-sm text-muted">{t.profiles.removeBody}</p>

        <label className="mt-4 flex items-center justify-between gap-4 rounded-sm bg-fill px-3 py-2">
          <span className="text-sm text-ink">{t.profiles.removeFiles}</span>
          <Switch checked={deleteFiles} onChange={setDeleteFiles} label={t.profiles.removeFiles} />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.profiles.cancel}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              void remove(profile.id, deleteFiles)
              onClose()
            }}
          >
            {t.profiles.removeConfirm}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
