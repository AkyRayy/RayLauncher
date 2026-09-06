import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { Button } from '@renderer/components/ui/Button'
import { Select, TextInput } from '@renderer/components/ui/Field'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { Switch } from '@renderer/components/ui/Switch'
import { Slider } from '@renderer/components/ui/Field'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import { useVersionsStore } from '@renderer/stores/versions.store'
import { listSpring } from '@renderer/lib/motion'
import { formatMemory } from '@shared/util'
import { MEMORY } from '@shared/constants'
import type { LoaderKind } from '@shared/types'

type LoaderVersion = { id: string; stable: boolean; recommended?: boolean }

const LOADERS: LoaderKind[] = ['vanilla', 'fabric', 'neoforge', 'forge', 'quilt']

export function ProfileWizard({ onClose }: { onClose: () => void }): React.ReactElement {
  const t = useI18n()
  const catalog = useVersionsStore((state) => state.catalog)
  const loadCatalog = useVersionsStore((state) => state.load)
  const create = useProfilesStore((state) => state.create)
  const fetchLoaderVersions = useProfilesStore((state) => state.fetchLoaderVersions)
  const loadingLoader = useProfilesStore((state) => state.loadingLoader)

  const [name, setName] = useState('')
  const [pickedVersion, setPickedVersion] = useState('')
  const [loader, setLoader] = useState<LoaderKind>('vanilla')
  const [pickedLoaderVersion, setPickedLoaderVersion] = useState('')
  const [loaded, setLoaded] = useState<{ key: string; list: LoaderVersion[] }>({ key: '', list: [] })
  const [autoMemory, setAutoMemory] = useState(true)
  const [maxMb, setMaxMb] = useState(4096)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const releases = useMemo(
    () => (catalog?.versions ?? []).filter((version) => version.type === 'release').slice(0, 120),
    [catalog]
  )

  const gameVersion = pickedVersion.length > 0 ? pickedVersion : (catalog?.latestRelease ?? '')
  const loaderKey = `${loader}:${gameVersion}`

  useEffect(() => {
    if (loader === 'vanilla' || gameVersion.length === 0) return

    let cancelled = false
    void fetchLoaderVersions(loader, gameVersion).then((list) => {
      if (!cancelled) setLoaded({ key: `${loader}:${gameVersion}`, list })
    })

    return () => {
      cancelled = true
    }
  }, [loader, gameVersion, fetchLoaderVersions])

  const versions = loaded.key === loaderKey ? loaded.list : []
  const loaderVersion =
    versions.find((item) => item.id === pickedLoaderVersion)?.id ??
    versions.find((item) => item.recommended)?.id ??
    versions[0]?.id ??
    ''

  const nameValid = name.trim().length > 0
  const loaderReady = loader === 'vanilla' || loaderVersion.length > 0
  const canSave = nameValid && gameVersion.length > 0 && loaderReady && !saving

  const submit = async (): Promise<void> => {
    setSaving(true)
    const created = await create({
      name: name.trim(),
      gameVersion,
      loader: loader === 'vanilla' ? { kind: 'vanilla' } : { kind: loader, version: loaderVersion },
      memory: autoMemory
        ? { auto: true, minMb: 2048, maxMb: 4096 }
        : { auto: false, minMb: Math.max(MEMORY.minMb, Math.floor(maxMb / 2)), maxMb }
    })
    setSaving(false)
    if (created) onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 grid place-items-center bg-black/25 px-6"
      role="presentation"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={listSpring}
        role="dialog"
        aria-modal="true"
        aria-label={t.profiles.createTitle}
        className="material-pop w-full max-w-lg rounded-lg p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">{t.profiles.createTitle}</h2>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSave) void submit()
          }}
        >
          <Row label={t.profiles.name}>
            <TextInput
              autoFocus
              value={name}
              maxLength={60}
              placeholder={t.profiles.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
              className="w-full"
            />
          </Row>

          <Row label={t.profiles.gameVersion}>
            <Select
              value={gameVersion}
              onChange={(event) => setPickedVersion(event.target.value)}
              className="w-full"
            >
              {releases.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.id}
                  {version.installed ? ' · установлена' : ''}
                </option>
              ))}
            </Select>
          </Row>

          <Row label={t.profiles.loader}>
            <div className="space-y-2">
              <SegmentedControl
                size="sm"
                value={loader}
                ariaLabel={t.profiles.loader}
                onChange={setLoader}
                options={LOADERS.map((kind) => ({
                  value: kind,
                  label: kind === 'vanilla' ? 'Ванильная' : labelOf(kind)
                }))}
              />
              {loader === 'vanilla' && <p className="text-xs text-faint">{t.profiles.vanillaHint}</p>}
            </div>
          </Row>

          {loader !== 'vanilla' && (
            <Row label={t.profiles.loaderVersion}>
              {loadingLoader ? (
                <p className="text-xs text-muted">{t.profiles.loaderLoading}</p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-warning">{t.profiles.loaderEmpty}</p>
              ) : (
                <Select
                  value={loaderVersion}
                  onChange={(event) => setPickedLoaderVersion(event.target.value)}
                  className="w-full"
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.id}
                      {version.recommended ? ' · рекомендуется' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Row>
          )}

          <Row label={t.profiles.memory}>
            <div className="space-y-2">
              <Switch
                checked={autoMemory}
                onChange={setAutoMemory}
                label={t.profiles.memoryAuto}
              />
              {!autoMemory && (
                <Slider
                  value={maxMb}
                  min={MEMORY.minMb}
                  max={16_384}
                  step={512}
                  label={t.profiles.memory}
                  display={formatMemory(maxMb)}
                  onChange={setMaxMb}
                />
              )}
            </div>
          </Row>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.profiles.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={!canSave}>
              {t.profiles.create}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="grid grid-cols-[128px_minmax(0,1fr)] items-start gap-4">
      <span className="pt-1 text-sm text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function labelOf(kind: LoaderKind): string {
  const labels: Record<LoaderKind, string> = {
    vanilla: 'Ванильная',
    fabric: 'Fabric',
    quilt: 'Quilt',
    forge: 'Forge',
    neoforge: 'NeoForge'
  }
  return labels[kind]
}

export function ProfileWizardHost({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.ReactElement {
  return <AnimatePresence>{open && <ProfileWizard onClose={onClose} />}</AnimatePresence>
}
