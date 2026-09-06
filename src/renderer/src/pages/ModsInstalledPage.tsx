import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { listSpring } from '@renderer/lib/motion'
import { Page } from '@renderer/components/chrome/Page'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Switch } from '@renderer/components/ui/Switch'
import { Select } from '@renderer/components/ui/Field'
import {
  CatalogIcon,
  FolderIcon,
  InstalledIcon,
  PackageIcon,
  RefreshIcon,
  TrashIcon,
  WarningIcon
} from '@renderer/components/icons'
import { useModsStore } from '@renderer/stores/mods.store'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { formatBytes } from '@shared/util'
import type { ModEntry, ModUpdateInfo, Profile } from '@shared/types'

export function ModsInstalledPage(): React.ReactElement {
  const t = useI18n()
  const navigate = useNavigate()

  const profiles = useProfilesStore((state) => state.profiles)
  const hydrate = useProfilesStore((state) => state.hydrate)
  const activeId = useSettingsStore((state) => state.settings.activeProfileId)

  const mods = useModsStore((state) => state.mods)
  const updates = useModsStore((state) => state.updates)
  const error = useModsStore((state) => state.error)
  const scanning = useModsStore((state) => state.scanning)
  const checking = useModsStore((state) => state.checkingUpdates)
  const loadMods = useModsStore((state) => state.loadMods)
  const scan = useModsStore((state) => state.scan)
  const checkUpdates = useModsStore((state) => state.checkUpdates)
  const applyAllUpdates = useModsStore((state) => state.applyAllUpdates)
  const openFolder = useModsStore((state) => state.openFolder)
  const clearError = useModsStore((state) => state.clearError)

  const [profileId, setProfileId] = useState(activeId)
  const [notice, setNotice] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ModEntry | null>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const moddable = useMemo(
    () => profiles.filter((profile) => profile.loader.kind !== 'vanilla'),
    [profiles]
  )

  const profile: Profile | null = useMemo(() => {
    const chosen = moddable.find((item) => item.id === profileId)
    return chosen ?? moddable[0] ?? null
  }, [moddable, profileId])

  useEffect(() => {
    if (!profile) return
    void loadMods(profile.id)
  }, [profile, loadMods])

  const sorted = useMemo(
    () => [...mods].sort((a, b) => a.title.localeCompare(b.title, 'ru')),
    [mods]
  )

  if (!profile) {
    return (
      <Page title={t.mods.installedTitle} subtitle={t.mods.installedSubtitle}>
        <EmptyState
          icon={<InstalledIcon size={26} />}
          title={t.mods.noProfileTitle}
          body={t.mods.noProfileBody}
          action={
            <Button variant="secondary" onClick={() => navigate('/profiles')}>
              {t.nav.profiles}
            </Button>
          }
        />
      </Page>
    )
  }

  const updatesFor = new Map(updates.map((item) => [item.modId, item]))

  return (
    <Page
      title={t.mods.installedTitle}
      subtitle={t.mods.forProfile(profile.name)}
      actions={
        moddable.length > 1 ? (
          <Select
            aria-label={t.nav.profiles}
            value={profile.id}
            onChange={(event) => setProfileId(event.target.value)}
          >
            {moddable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        ) : undefined
      }
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={<RefreshIcon size={14} />}
            disabled={checking}
            onClick={() => {
              setNotice(null)
              void checkUpdates(profile.id).then(() => {
                const count = useModsStore.getState().updates.length
                setNotice(count === 0 ? t.mods.updatesNone : t.mods.updatesFound(count))
              })
            }}
          >
            {checking ? t.mods.checking : t.mods.checkUpdates}
          </Button>

          {updates.length > 0 && (
            <Button
              size="sm"
              variant="primary"
              disabled={checking}
              onClick={() => {
                void applyAllUpdates(profile.id).then(() => void loadMods(profile.id))
              }}
            >
              {t.mods.updateAll}
            </Button>
          )}

          <Button
            size="sm"
            disabled={scanning}
            onClick={() => {
              setNotice(null)
              void scan(profile.id).then((count) => {
                setNotice(count === 0 ? t.mods.scanEmpty : t.mods.scanFound(count))
                void loadMods(profile.id)
              })
            }}
          >
            {scanning ? t.mods.scanning : t.mods.scan}
          </Button>

          <Button size="sm" icon={<FolderIcon size={14} />} onClick={() => void openFolder(profile.id)}>
            {t.mods.openFolder}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            icon={<CatalogIcon size={14} />}
            onClick={() => navigate('/mods')}
          >
            {t.mods.openCatalog}
          </Button>
        </div>

        {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2.5 rounded-md bg-surface px-4 py-3 shadow-soft"
          >
            <WarningIcon size={16} className="mt-0.5 shrink-0 text-warning" />
            <p className="min-w-0 flex-1 text-sm text-ink">{error.message}</p>
            <Button size="sm" variant="ghost" onClick={clearError}>
              {t.common.cancel}
            </Button>
          </div>
        )}

        <section className="mt-5">
          {sorted.length === 0 ? (
            <EmptyState
              icon={<InstalledIcon size={26} />}
              title={t.mods.installedEmptyTitle}
              body={t.mods.installedEmptyBody}
              action={
                <Button variant="primary" onClick={() => navigate('/mods')}>
                  {t.mods.openCatalog}
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {sorted.map((mod) => (
                <InstalledCard
                  key={mod.id}
                  mod={mod}
                  update={updatesFor.get(mod.id) ?? null}
                  onRemove={() => setRemoving(mod)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {removing && <RemoveModDialog mod={removing} onClose={() => setRemoving(null)} />}
    </Page>
  )
}

function InstalledCard({
  mod,
  update,
  onRemove
}: {
  mod: ModEntry
  update: ModUpdateInfo | null
  onRemove: () => void
}): React.ReactElement {
  const t = useI18n()
  const toggle = useModsStore((state) => state.toggle)
  const applyUpdate = useModsStore((state) => state.applyUpdate)
  const busyId = useModsStore((state) => state.busyId)
  const busy = busyId === mod.id

  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={listSpring}>
      <Card className="flex items-center gap-4 p-4">
        {mod.iconUrl ? (
          <img
            src={mod.iconUrl}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-md bg-fill object-cover"
          />
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-fill text-faint">
            <PackageIcon size={18} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink">{mod.title}</h3>
          <p className="mt-0.5 truncate text-xs text-faint">
            {mod.fileName}
            {mod.size > 0 && ` · ${formatBytes(mod.size)}`}
            {mod.source === 'local' && ` · ${t.mods.localSource}`}
          </p>
          {update && (
            <p className="mt-1 text-xs text-accent">{t.mods.updateTo(update.next.versionNumber)}</p>
          )}
        </div>

        {update && (
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => void applyUpdate(update)}
          >
            {t.mods.update}
          </Button>
        )}

        <Switch
          checked={mod.enabled}
          onChange={(value) => void toggle(mod.id, value)}
          label={mod.enabled ? t.mods.disable : t.mods.enable}
        />

        <Button
          size="sm"
          variant="ghost"
          icon={<TrashIcon size={14} />}
          aria-label={t.mods.remove}
          disabled={busy}
          onClick={onRemove}
        >
          {t.mods.remove}
        </Button>
      </Card>
    </motion.li>
  )
}

function RemoveModDialog({ mod, onClose }: { mod: ModEntry; onClose: () => void }): React.ReactElement {
  const t = useI18n()
  const remove = useModsStore((state) => state.remove)

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
        aria-label={t.mods.removeTitle(mod.title)}
        className="material-pop w-full max-w-sm rounded-lg p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink">{t.mods.removeTitle(mod.title)}</h2>
        <p className="mt-1 text-sm text-muted">{t.mods.removeBody}</p>

        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              void remove(mod.id)
              onClose()
            }}
          >
            {t.mods.remove}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
