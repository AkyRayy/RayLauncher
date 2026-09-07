import { useEffect, useState } from 'react'
import { useI18n, type Dictionary } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { Page } from '@renderer/components/chrome/Page'
import { ListGroup } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { Switch } from '@renderer/components/ui/Switch'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { SettingRow, Select, Slider, TextArea, TextInput } from '@renderer/components/ui/Field'
import { FolderIcon } from '@renderer/components/icons'
import { ThemeGallery } from '@renderer/features/ThemeGallery'
import { cn } from '@renderer/lib/cn'
import { formatMemory } from '@shared/util'
import { MEMORY, NETWORK } from '@shared/constants'
import { BUILTIN_BACKGROUNDS } from '@renderer/components/chrome/BackgroundLayer'
import type { AccentId, AppInfo, BackgroundId, Settings, UpdateState } from '@shared/types'

type TabId = 'general' | 'java' | 'downloads' | 'mods' | 'appearance' | 'advanced' | 'about'

const ACCENTS: AccentId[] = ['indigo', 'azure', 'teal', 'moss', 'amber', 'rose', 'plum', 'graphite']

export function SettingsPage(): React.ReactElement {
  const t = useI18n()
  const settings = useSettingsStore((state) => state.settings)
  const patch = useSettingsStore((state) => state.patch)
  const reset = useSettingsStore((state) => state.reset)
  const [tab, setTab] = useState<TabId>('general')
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void api.app.info().then(setInfo)
  }, [settings.gamesDir])

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'general', label: t.settings.tabs.general },
    { id: 'appearance', label: t.settings.tabs.appearance },
    { id: 'java', label: t.settings.tabs.java },
    { id: 'downloads', label: t.settings.tabs.downloads },
    { id: 'mods', label: t.settings.tabs.mods },
    { id: 'advanced', label: t.settings.tabs.advanced },
    { id: 'about', label: t.settings.tabs.about }
  ]

  return (
    <Page title={t.settings.title} subtitle={t.settings.subtitle}>
      <div className="mx-auto flex max-w-4xl gap-6">
        <nav aria-label={t.settings.title} className="w-40 shrink-0">
          <ul className="sticky top-0 space-y-0.5">
            {tabs.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id}
                  className={cn(
                    'flex h-[30px] w-full items-center rounded-sm px-2.5 text-left text-sm transition-colors duration-100',
                    tab === item.id
                      ? 'bg-accent font-medium text-on-accent'
                      : 'text-ink/85 hover:bg-fill'
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <ListGroup className="min-w-0 flex-1">
          {tab === 'general' && <GeneralTab settings={settings} patch={patch} />}
          {tab === 'appearance' && <AppearanceTab settings={settings} patch={patch} />}
          {tab === 'java' && <JavaTab settings={settings} patch={patch} info={info} />}
          {tab === 'downloads' && <DownloadsTab settings={settings} patch={patch} />}
          {tab === 'mods' && <ModsTab settings={settings} patch={patch} />}
          {tab === 'advanced' && <AdvancedTab settings={settings} patch={patch} reset={reset} />}
          {tab === 'about' && <AboutTab info={info} />}
        </ListGroup>
      </div>
    </Page>
  )
}

interface TabProps {
  settings: Settings
  patch: (patch: Partial<Settings>) => Promise<void>
}

function GeneralTab({ settings, patch }: TabProps): React.ReactElement {
  const t = useI18n()
  const chooseFolder = async (): Promise<void> => {
    const result = await api.system.chooseDirectory(t.settings.gamesDir)
    if (result.path) await patch({ gamesDir: result.path })
  }

  return (
    <>
      <SettingRow
        title={t.settings.language}
        control={
          <Select
            value={settings.language}
            aria-label={t.settings.language}
            onChange={(event) => void patch({ language: event.target.value as Settings['language'] })}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </Select>
        }
      />
      <SettingRow
        title={t.settings.gamesDir}
        hint={t.settings.gamesDirHint}
        control={
          <div className="flex items-center gap-2">
            <span className="max-w-[240px] truncate font-mono text-xs text-muted" title={settings.gamesDir}>
              {settings.gamesDir}
            </span>
            <Button size="sm" icon={<FolderIcon size={14} />} onClick={() => void chooseFolder()}>
              {t.settings.change}
            </Button>
          </div>
        }
      />
      <SettingRow
        title={t.settings.closeOnLaunch}
        control={
          <Switch
            checked={settings.closeLauncherOnLaunch}
            onChange={(checked) => void patch({ closeLauncherOnLaunch: checked })}
            label={t.settings.closeOnLaunch}
          />
        }
      />
      <SettingRow
        title={t.settings.minimizeToTray}
        control={
          <Switch
            checked={settings.minimizeToTray}
            onChange={(checked) => void patch({ minimizeToTray: checked })}
            label={t.settings.minimizeToTray}
          />
        }
      />
    </>
  )
}

function AppearanceTab({ settings, patch }: TabProps): React.ReactElement {
  const t = useI18n()
  return (
    <>
      <SettingRow
        title={t.settings.theme}
        control={
          <SegmentedControl
            ariaLabel={t.settings.theme}
            value={settings.theme}
            onChange={(theme) => void patch({ theme })}
            options={[
              { value: 'light', label: t.settings.themeLight },
              { value: 'dark', label: t.settings.themeDark },
              { value: 'system', label: t.settings.themeSystem }
            ]}
          />
        }
      />
      <SettingRow
        title={t.settings.accent}
        control={
          <div className="flex items-center gap-1.5">
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                type="button"
                aria-label={accent}
                aria-pressed={settings.accent === accent}
                onClick={() => void patch({ accent })}
                data-accent={accent}
                className={cn(
                  'h-[18px] w-[18px] rounded-full transition-shadow duration-100',
                  settings.accent === accent
                    ? 'shadow-[0_0_0_1.5px_var(--canvas),0_0_0_3px_var(--accent)]'
                    : 'shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.15)]'
                )}
                style={{ background: 'var(--accent)' }}
              />
            ))}
          </div>
        }
      />
      <SettingRow
        title={t.settings.background}
        hint={t.settings.backgroundHint}
        control={<BackgroundPicker settings={settings} patch={patch} />}
      />
      {settings.backgroundId !== 'none' && (
        <>
          <SettingRow
            title={t.settings.backgroundDim}
            control={
              <Slider
                label={t.settings.backgroundDim}
                value={Math.round(settings.backgroundDim * 100)}
                min={0}
                max={80}
                step={5}
                display={`${Math.round(settings.backgroundDim * 100)} %`}
                onChange={(value) => void patch({ backgroundDim: value / 100 })}
              />
            }
          />
          <SettingRow
            title={t.settings.backgroundBlur}
            control={
              <Slider
                label={t.settings.backgroundBlur}
                value={settings.backgroundBlur}
                min={0}
                max={40}
                step={2}
                display={`${settings.backgroundBlur} px`}
                onChange={(value) => void patch({ backgroundBlur: value })}
              />
            }
          />
          <SettingRow
            title={t.settings.backgroundMotion}
            hint={t.settings.backgroundMotionHint}
            control={
              <Switch
                checked={settings.backgroundMotion}
                onChange={(backgroundMotion) => void patch({ backgroundMotion })}
                label={t.settings.backgroundMotion}
              />
            }
          />
        </>
      )}
      <SettingRow
        title={t.settings.density}
        control={
          <SegmentedControl
            ariaLabel={t.settings.density}
            value={settings.density}
            onChange={(density) => void patch({ density })}
            options={[
              { value: 'comfortable', label: t.settings.densityComfortable },
              { value: 'compact', label: t.settings.densityCompact }
            ]}
          />
        }
      />
      <ThemeGallery />
    </>
  )
}

function BackgroundPicker({ settings, patch }: TabProps): React.ReactElement {
  const t = useI18n()
  const [busy, setBusy] = useState(false)

  const choose = async (): Promise<void> => {
    setBusy(true)
    try {
      const background = await api.background.choose()
      if (background) await patch({ backgroundId: 'custom', backgroundCustom: background.file })
    } finally {
      setBusy(false)
    }
  }

  const options: Array<{ id: BackgroundId; label: string; preview?: string }> = [
    { id: 'night', label: t.settings.backgroundNight, preview: BUILTIN_BACKGROUNDS.night },
    { id: 'dawn', label: t.settings.backgroundDawn, preview: BUILTIN_BACKGROUNDS.dawn },
    { id: 'studio', label: t.settings.backgroundStudio, preview: BUILTIN_BACKGROUNDS.studio },
    { id: 'none', label: t.settings.backgroundNone }
  ]

  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={settings.backgroundId === option.id}
          onClick={() => void patch({ backgroundId: option.id })}
          title={option.label}
          className={cn(
            'h-12 w-[72px] overflow-hidden rounded-md transition-shadow duration-100',
            settings.backgroundId === option.id
              ? 'shadow-[0_0_0_1.5px_var(--canvas-solid),0_0_0_3px_var(--accent)]'
              : 'shadow-[inset_0_0_0_0.5px_var(--hairline)] hover:shadow-[inset_0_0_0_1px_var(--accent)]'
          )}
        >
          {option.preview ? (
            <img src={option.preview} alt="" aria-hidden className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-fill text-2xs text-muted">
              {option.label}
            </span>
          )}
        </button>
      ))}

      <Button size="sm" disabled={busy} onClick={() => void choose()} icon={<FolderIcon size={13} />}>
        {settings.backgroundId === 'custom' ? t.settings.backgroundReplace : t.settings.backgroundOwn}
      </Button>
    </div>
  )
}

function JavaTab({ settings, patch, info }: TabProps & { info: AppInfo | null }): React.ReactElement {
  const t = useI18n()
  const total = info?.totalMemoryMb ?? 16_384
  const overCommitted = settings.defaultMemoryMb > total * MEMORY.warnRatio

  return (
    <>
      <SettingRow
        title={t.settings.defaultMemory}
        hint={t.settings.memoryHint}
        warning={overCommitted ? t.settings.memoryWarning : undefined}
        control={
          <Slider
            label={t.settings.defaultMemory}
            value={settings.defaultMemoryMb}
            min={1024}
            max={Math.min(MEMORY.maxMb, Math.max(4096, total))}
            step={512}
            display={formatMemory(settings.defaultMemoryMb)}
            onChange={(value) => void patch({ defaultMemoryMb: value })}
          />
        }
      />
      <SettingRow
        title={t.settings.jvmArgs}
        hint={t.settings.jvmArgsHint}
        control={
          <TextArea
            rows={4}
            className="w-72"
            aria-label={t.settings.jvmArgs}
            value={settings.jvmArgs.join('\n')}
            onChange={(event) =>
              void patch({
                jvmArgs: event.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
              })
            }
          />
        }
      />
    </>
  )
}

function DownloadsTab({ settings, patch }: TabProps): React.ReactElement {
  const t = useI18n()
  return (
    <>
      <SettingRow
        title={t.settings.concurrency}
        hint={t.settings.concurrencyHint}
        control={
          <Slider
            label={t.settings.concurrency}
            value={settings.concurrency}
            min={NETWORK.minConcurrency}
            max={NETWORK.maxConcurrency}
            display={`${settings.concurrency}`}
            onChange={(value) => void patch({ concurrency: value })}
          />
        }
      />
      <SettingRow
        title={t.settings.speedLimit}
        control={
          <div className="flex items-center gap-2">
            <TextInput
              type="number"
              min={0}
              step={512}
              className="w-28 text-right"
              aria-label={t.settings.speedLimit}
              value={settings.speedLimitKbps}
              onChange={(event) => void patch({ speedLimitKbps: Number(event.target.value) })}
            />
            <span className="text-xs text-muted">
              {settings.speedLimitKbps === 0 ? t.settings.speedLimitOff : 'КБ/с'}
            </span>
          </div>
        }
      />
    </>
  )
}

function ModsTab({ settings, patch }: TabProps): React.ReactElement {
  const t = useI18n()
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(settings.curseforgeKeySet)

  return (
    <>
      <SettingRow
        title={t.settings.curseforge}
        hint={t.settings.curseforgeHint}
        control={
          <Switch
            checked={settings.curseforgeEnabled}
            onChange={(checked) => void patch({ curseforgeEnabled: checked })}
            label={t.settings.curseforge}
          />
        }
      />
      {settings.curseforgeEnabled && (
        <>
          <SettingRow
            title={t.mods.curseforgeTitle}
            hint={t.mods.curseforgeBody}
            warning={saved ? undefined : t.mods.curseforgeMissing}
            control={
              <div className="flex items-center gap-2">
                <TextInput
                  type="password"
                  className="w-56"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={saved ? '••••••••••••' : '$2a$10$…'}
                  aria-label={t.mods.curseforgeTitle}
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={key.trim().length === 0}
                  onClick={() => {
                    void api.mods.setCurseforgeKey(key.trim()).then(() => {
                      setKey('')
                      setSaved(true)
                    })
                  }}
                >
                  {t.mods.curseforgeSave}
                </Button>
                {saved && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void api.mods.setCurseforgeKey('').then(() => setSaved(false))
                    }}
                  >
                    {t.mods.curseforgeClear}
                  </Button>
                )}
              </div>
            }
          />
          <SettingRow
            title={t.settings.curseforgeKey}
            hint="Ключ выдаётся в консоли разработчика CurseForge и привязан к аккаунту."
            control={
              <Button
                size="sm"
                onClick={() => void api.system.openExternal('https://console.curseforge.com')}
              >
                console.curseforge.com
              </Button>
            }
          />
        </>
      )}
    </>
  )
}

function AdvancedTab({
  settings,
  patch,
  reset
}: TabProps & { reset: () => Promise<void> }): React.ReactElement {
  const t = useI18n()
  return (
    <>
      <SettingRow
        title={t.settings.msClientId}
        hint={t.settings.msClientIdHint}
        control={
          <TextInput
            className="w-64 font-mono text-xs"
            aria-label={t.settings.msClientId}
            value={settings.msClientId}
            onChange={(event) => void patch({ msClientId: event.target.value })}
          />
        }
      />
      <SettingRow
        title={t.settings.offlineSkins}
        hint={t.settings.offlineSkinsHint}
        control={
          <Switch
            checked={settings.offlineSkins}
            onChange={(offlineSkins) => void patch({ offlineSkins })}
            label={t.settings.offlineSkins}
          />
        }
      />
      <SettingRow
        title={t.settings.updateChannel}
        control={
          <SegmentedControl
            ariaLabel={t.settings.updateChannel}
            value={settings.updateChannel}
            onChange={(updateChannel) => void patch({ updateChannel })}
            options={[
              { value: 'stable', label: t.settings.channelStable },
              { value: 'beta', label: t.settings.channelBeta }
            ]}
          />
        }
      />
      <SettingRow
        title={t.settings.telemetry}
        control={
          <Switch
            checked={settings.telemetry}
            onChange={(checked) => void patch({ telemetry: checked })}
            label={t.settings.telemetry}
          />
        }
      />
      <SettingRow
        title={t.settings.telemetryEndpoint}
        hint={t.settings.telemetryHint}
        control={
          <TextInput
            value={settings.telemetryEndpoint}
            onChange={(event) => void patch({ telemetryEndpoint: event.target.value })}
            placeholder="https://…"
            className="w-64"
          />
        }
      />
      <SettingRow
        title={t.settings.discord}
        hint={t.settings.discordHint}
        control={
          <Switch
            checked={settings.discordPresence}
            onChange={(checked) => void patch({ discordPresence: checked })}
            label={t.settings.discord}
          />
        }
      />
      <SettingRow
        title={t.settings.discordClientId}
        hint={t.settings.discordClientIdHint}
        control={
          <TextInput
            value={settings.discordClientId}
            onChange={(event) => void patch({ discordClientId: event.target.value })}
            placeholder="123456789012345678"
            className="w-64"
          />
        }
      />
      <SettingRow
        title={t.settings.watchdog}
        hint={t.settings.watchdogHint}
        control={
          <Switch
            checked={settings.watchdogEnabled}
            onChange={(checked) => void patch({ watchdogEnabled: checked })}
            label={t.settings.watchdog}
          />
        }
      />
      <SettingRow
        title={t.settings.watchdogTimeout}
        control={
          <TextInput
            type="number"
            value={settings.watchdogTimeoutMin}
            min={1}
            max={120}
            className="w-20"
            onChange={(event) => void patch({ watchdogTimeoutMin: Number(event.target.value) || 10 })}
          />
        }
      />
      <SettingRow
        title={t.settings.reset}
        hint={t.settings.resetHint}
        control={
          <Button variant="danger" size="sm" onClick={() => void reset()}>
            {t.settings.reset}
          </Button>
        }
      />
    </>
  )
}

function AboutTab({ info }: { info: AppInfo | null }): React.ReactElement {
  const t = useI18n()
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.updates.state().then(setUpdate)
    return api.on['update:state'](setUpdate)
  }, [])

  const phase = update?.phase ?? 'idle'
  const supported = update?.supported ?? false

  return (
    <>
      <SettingRow
        title={t.settings.version}
        control={<span className="text-sm text-muted">{info?.version ?? '—'}</span>}
      />
      <SettingRow
        title={t.settings.updateTitle}
        hint={updateHint(t, update)}
        warning={supported ? undefined : t.settings.updateUnsupported}
        control={
          <div className="flex items-center gap-2">
            {phase === 'downloading' && (
              <span className="text-xs tabular-nums text-muted">
                {Math.round((update?.progress ?? 0) * 100)}%
              </span>
            )}

            {phase === 'ready' ? (
              <Button size="sm" variant="primary" onClick={() => void api.updates.install()}>
                {t.settings.updateInstall}
              </Button>
            ) : phase === 'available' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void api.updates
                    .download()
                    .then(setUpdate)
                    .finally(() => setBusy(false))
                }}
              >
                {t.settings.updateDownload}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!supported || busy || phase === 'checking' || phase === 'downloading'}
                onClick={() => {
                  setBusy(true)
                  void api.updates
                    .check()
                    .then(setUpdate)
                    .finally(() => setBusy(false))
                }}
              >
                {phase === 'checking' ? t.settings.updateChecking : t.settings.updateCheck}
              </Button>
            )}
          </div>
        }
      />
      {update?.releaseNotesHtml && (
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-faint">
            {t.settings.updateNotes}
          </h3>
          <div
            className="news-body mt-1.5 text-sm text-muted"
            dangerouslySetInnerHTML={{ __html: update.releaseNotesHtml }}
          />
        </div>
      )}
      <SettingRow
        title={t.settings.platform}
        control={
          <span className="text-sm text-muted">
            {info ? `${info.platform} · ${info.arch} · Electron ${info.electron} · Node ${info.node}` : '—'}
          </span>
        }
      />
      <SettingRow
        title={t.settings.openLogs}
        control={
          <Button size="sm" icon={<FolderIcon size={14} />} onClick={() => void api.system.openFolder('logs')}>
            {t.settings.openLogs}
          </Button>
        }
      />
      <SettingRow
        title={t.settings.openData}
        control={
          <Button size="sm" icon={<FolderIcon size={14} />} onClick={() => void api.system.openFolder('userData')}>
            {t.settings.openData}
          </Button>
        }
      />
    </>
  )
}

function updateHint(t: Dictionary, update: UpdateState | null): string | undefined {
  if (!update) return undefined
  switch (update.phase) {
    case 'checking':
      return t.settings.updateChecking
    case 'available':
      return update.version ? t.settings.updateAvailable(update.version) : undefined
    case 'downloading':
      return t.settings.updateDownloading
    case 'ready':
      return t.settings.updateReady
    case 'up-to-date':
      return update.version ? t.settings.updateLatest(update.version) : undefined
    case 'error':
      return `${t.settings.updateFailed}: ${update.error ?? ''}`.trim()
    default:
      return undefined
  }
}
