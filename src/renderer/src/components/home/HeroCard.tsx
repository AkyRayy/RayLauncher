import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { formatDateTime, useLocale } from '@renderer/lib/format'
import { useLaunchStore } from '@renderer/stores/launch.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { useVersionsStore } from '@renderer/stores/versions.store'
import { useActiveProfile, useProfilesStore } from '@renderer/stores/profiles.store'
import { useUiStore } from '@renderer/stores/ui.store'
import { Button } from '@renderer/components/ui/Button'
import { ProgressRing } from '@renderer/components/ui/ProgressRing'
import { VersionPicker } from '@renderer/features/VersionPicker'
import { HeroArt } from '@renderer/components/home/HeroArt'
import { CheckIcon, ChevronIcon, LogsIcon, PlayIcon, StopIcon, WarningIcon } from '@renderer/components/icons'
import { formatBytes, formatMemory } from '@shared/util'
import { LIMITS } from '@shared/constants'
import type { LoaderKind, NewsItem } from '@shared/types'

const LOADER_LABEL: Record<LoaderKind, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt'
}

export function HeroCard({ news }: { news: readonly NewsItem[] }): React.ReactElement {
  const t = useI18n()
  const locale = useLocale()
  const navigate = useNavigate()
  const { game, stage, busy, error, launch, launchProfile, stop } = useLaunchStore()
  const profile = useActiveProfile()
  const profiles = useProfilesStore((state) => state.profiles)
  const hydrateProfiles = useProfilesStore((state) => state.hydrate)
  const settings = useSettingsStore((state) => state.settings)
  const patch = useSettingsStore((state) => state.patch)
  const catalog = useVersionsStore((state) => state.catalog)
  const toggleConsole = useUiStore((state) => state.toggleConsole)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    void hydrateProfiles()
  }, [hydrateProfiles])

  const versionId = profile?.gameVersion ?? settings.lastVersionId
  const installed = catalog?.versions.find((item) => item.id === versionId)?.installed === true
  const nicknameOk = LIMITS.nicknamePattern.test(settings.guestNickname)
  const running = game?.phase === 'running' || game?.phase === 'launching'
  const canLaunch = versionId.length > 0 && (profile !== null || nicknameOk) && !busy && !running
  const failed = error !== null || game?.phase === 'crashed'

  const title = profile?.name ?? t.home.heroQuickTitle
  const loader = LOADER_LABEL[profile?.loader.kind ?? 'vanilla']
  const description = profile
    ? profile.loader.kind === 'vanilla'
      ? t.home.heroVanilla
      : t.home.heroModded
    : t.home.heroQuick

  const meta = profile
    ? [
        `${t.home.lastPlayed}: ${profile.lastPlayed === undefined || profile.lastPlayed <= 0 ? t.home.never : formatDateTime(profile.lastPlayed, locale)}`,
        formatMemory(profile.memory.maxMb),
        installed ? t.home.filesReady : t.home.filesMissing
      ]
    : [`${t.launch.guest}: ${settings.guestNickname}`, installed ? t.home.filesReady : t.home.filesMissing]

  return (
    <section className="relative z-10 shrink-0 rounded-xl bg-surface shadow-card">
      <HeroArt versionId={versionId} news={news} sourceLabel={t.home.artSource} />

      <div className="relative">
        <div className="relative z-10 flex min-h-[300px] max-w-[min(640px,72%)] flex-col justify-between gap-7 p-7">
          <header>
            <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-faint">
              {t.home.heroOverline}
            </p>
            <h1 className="mt-2 truncate text-2xl font-bold text-ink">{title}</h1>
            <p className="mt-1 text-sm text-muted">
              {versionId.length > 0
                ? `${t.launch.version} ${versionId} · ${loader}`
                : t.launch.versionNotChosen}
            </p>
            <p className="mt-3 max-w-[52ch] text-sm text-muted">{description}</p>
          </header>

          <div>
            <div className="flex flex-wrap items-center gap-3">
              {running ? (
                <>
                  <Button
                    variant="secondary"
                    icon={<StopIcon size={16} />}
                    className="h-11 min-w-[164px] rounded-md px-6 text-base font-semibold"
                    onClick={() => void stop()}
                  >
                    {t.launch.stop}
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<LogsIcon size={15} />}
                    className="h-11 rounded-md px-4"
                    onClick={toggleConsole}
                  >
                    {t.launch.console}
                  </Button>
                </>
              ) : stage ? (
                <div className="flex h-11 items-center gap-3 rounded-md bg-fill px-4">
                  <ProgressRing value={stage.progress} size={30} strokeWidth={3} label={stage.label} />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{stage.label}</div>
                    <div className="text-2xs text-muted tabular-nums">
                      {formatBytes(stage.bytesDone)} / {formatBytes(stage.bytesTotal)}
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  variant="primary"
                  icon={<PlayIcon size={16} />}
                  disabled={!canLaunch}
                  className="h-11 min-w-[164px] rounded-md px-6 text-base font-semibold"
                  onClick={() =>
                    void (profile ? launchProfile(profile.id) : launch(versionId, settings.guestNickname))
                  }
                >
                  {t.launch.play}
                </Button>
              )}

              <TargetPicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                label={
                  profile
                    ? `${profile.name} · ${profile.gameVersion}`
                    : versionId.length > 0
                      ? `${t.launch.guest} · ${versionId}`
                      : t.launch.versionNotChosen
                }
              >
                <div className="max-h-[min(420px,52vh)] overflow-y-auto p-3">
                  {profiles.length > 0 && (
                    <section className="mb-4">
                      <h3 className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-[0.05em] text-faint">
                        {t.home.buildsGroup}
                      </h3>
                      <ul>
                        {profiles.slice(0, 8).map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => {
                                void patch({ activeProfileId: item.id })
                                setPickerOpen(false)
                              }}
                              className="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-fill"
                            >
                              <span
                                className={cn(
                                  'shrink-0',
                                  profile?.id === item.id ? 'text-accent' : 'text-transparent'
                                )}
                              >
                                <CheckIcon size={14} />
                              </span>
                              <span className="min-w-0 flex-1 truncate">{item.name}</span>
                              <span className="shrink-0 text-xs text-faint">{item.gameVersion}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section>
                    <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
                      <h3 className="text-2xs font-semibold uppercase tracking-[0.05em] text-faint">
                        {t.home.quickGroup}
                      </h3>
                      {profile !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            void patch({ activeProfileId: '' })
                            setPickerOpen(false)
                          }}
                          className="text-xs text-accent hover:underline"
                        >
                          {t.home.useGuest}
                        </button>
                      )}
                    </div>
                    <VersionPicker />
                  </section>
                </div>
              </TargetPicker>
            </div>

            <p
              className={cn(
                'mt-3 flex items-center gap-1.5 text-xs',
                failed ? 'text-danger' : 'text-faint'
              )}
            >
              {failed && <WarningIcon size={12} />}
              {error ? t.errors[error.code] : game?.phase === 'crashed' ? t.launch.crashed : meta.join(' · ')}
            </p>

            {profiles.length === 0 && (
              <button
                type="button"
                onClick={() => navigate('/profiles')}
                className="mt-2 text-xs text-accent hover:underline"
              >
                {t.home.createProfile}
              </button>
            )}
          </div>
        </div>

      </div>
    </section>
  )
}

function TargetPicker({
  open,
  onOpenChange,
  label,
  children
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  children: React.ReactNode
}): React.ReactElement {
  const t = useI18n()
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event: MouseEvent): void => {
      if (!holder.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={holder} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!open)}
        className="control-face flex h-11 max-w-[280px] items-center gap-2 rounded-md px-3.5 text-sm text-ink"
      >
        <span className="min-w-0 truncate">{label}</span>
        <motion.span
          animate={{ rotate: open ? -90 : 90 }}
          transition={{ duration: 0.16 }}
          className="shrink-0 text-faint"
        >
          <ChevronIcon size={13} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={t.home.selectTarget}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="material-pop absolute top-[52px] left-0 z-30 w-[min(520px,72vw)] overflow-hidden rounded-lg"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
