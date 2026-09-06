import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { Button } from '@renderer/components/ui/Button'
import { Select, Slider, TextArea, TextInput } from '@renderer/components/ui/Field'
import { Switch } from '@renderer/components/ui/Switch'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import { useAccountsStore } from '@renderer/stores/accounts.store'
import { listSpring } from '@renderer/lib/motion'
import { formatMemory } from '@shared/util'
import { MEMORY } from '@shared/constants'
import type { Profile } from '@shared/types'

export function ProfileSettingsSheet({
  profileId,
  onClose
}: {
  profileId: string
  onClose: () => void
}): React.ReactElement | null {
  const t = useI18n()
  const profile = useProfilesStore((state) => state.profiles.find((item) => item.id === profileId))
  const update = useProfilesStore((state) => state.update)
  const accounts = useAccountsStore((state) => state.accounts)
  const hydrateAccounts = useAccountsStore((state) => state.hydrate)

  useEffect(() => {
    void hydrateAccounts()
  }, [hydrateAccounts])

  if (!profile) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-40 flex justify-end bg-black/20"
      role="presentation"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={listSpring}
        role="dialog"
        aria-modal="true"
        aria-label={`${t.profiles.settings}: ${profile.name}`}
        className="material-pop flex h-full w-full max-w-md flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 hairline-b">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{profile.name}</h2>
            <p className="truncate text-xs text-muted">
              {profile.gameVersion} · {profile.loader.kind}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t.launch.close}
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Section title={t.profiles.name}>
            <TextInput
              value={profile.name}
              maxLength={60}
              onChange={(event) => void update(profile.id, { name: event.target.value })}
              className="w-full"
            />
          </Section>

          <MemorySection profile={profile} />

          <Section title={t.profiles.accountTitle}>
            <Select
              value={profile.accountId ?? ''}
              onChange={(event) =>
                void update(profile.id, { accountId: event.target.value || undefined })
              }
              className="w-full"
            >
              <option value="">{t.profiles.accountDefault}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.username}
                </option>
              ))}
            </Select>
          </Section>

          <JavaSection profile={profile} />
          <WindowSection profile={profile} />

          <Section title={t.profiles.argsTitle} hint={t.profiles.argsHint}>
            <label className="block">
              <span className="mb-1 block text-xs text-faint">{t.profiles.jvmArgs}</span>
              <TextArea
                rows={3}
                value={profile.jvmArgs.join('\n')}
                onChange={(event) => void update(profile.id, { jvmArgs: toLines(event.target.value) })}
                className="w-full"
                spellCheck={false}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-faint">{t.profiles.gameArgs}</span>
              <TextArea
                rows={2}
                value={profile.gameArgs.join('\n')}
                onChange={(event) => void update(profile.id, { gameArgs: toLines(event.target.value) })}
                className="w-full"
                spellCheck={false}
              />
            </label>
          </Section>

          <Section title={t.settings.offlineSkins}>
            <Switch
              checked={profile.offlineSkins}
              onChange={(offlineSkins) => void update(profile.id, { offlineSkins })}
              label={t.settings.offlineSkins}
            />
          </Section>
        </div>
      </motion.aside>
    </motion.div>
  )
}

function MemorySection({ profile }: { profile: Profile }): React.ReactElement {
  const t = useI18n()
  const update = useProfilesStore((state) => state.update)
  const [maxMb, setMaxMb] = useState(profile.memory.maxMb)

  return (
    <Section title={t.profiles.memory}>
      <div className="space-y-2">
        <Switch
          checked={profile.memory.auto}
          onChange={(auto) => void update(profile.id, { memory: { ...profile.memory, auto } })}
          label={t.profiles.memoryAuto}
        />
        {!profile.memory.auto && (
          <Slider
            value={maxMb}
            min={MEMORY.minMb}
            max={16_384}
            step={512}
            label={t.profiles.memory}
            display={formatMemory(maxMb)}
            onChange={(value) => {
              setMaxMb(value)
              void update(profile.id, {
                memory: {
                  auto: false,
                  maxMb: value,
                  minMb: Math.max(MEMORY.minMb, Math.floor(value / 2))
                }
              })
            }}
          />
        )}
      </div>
    </Section>
  )
}

function JavaSection({ profile }: { profile: Profile }): React.ReactElement {
  const t = useI18n()
  const update = useProfilesStore((state) => state.update)

  return (
    <Section title={t.profiles.javaTitle}>
      <SegmentedControl
        size="sm"
        value={profile.java.mode}
        ariaLabel={t.profiles.javaTitle}
        options={[
          { value: 'auto', label: t.profiles.javaAuto },
          { value: 'custom', label: t.profiles.javaCustom }
        ]}
        onChange={(mode) => void update(profile.id, { java: { ...profile.java, mode } })}
      />
      {profile.java.mode === 'custom' && (
        <label className="mt-2 block">
          <span className="mb-1 block text-xs text-faint">{t.profiles.javaPath}</span>
          <TextInput
            value={profile.java.customPath ?? ''}
            placeholder="C:\\Program Files\\Java\\jdk-21\\bin\\java.exe"
            onChange={(event) =>
              void update(profile.id, { java: { ...profile.java, customPath: event.target.value } })
            }
            className="w-full font-mono text-xs"
            spellCheck={false}
          />
        </label>
      )}
    </Section>
  )
}

function WindowSection({ profile }: { profile: Profile }): React.ReactElement {
  const t = useI18n()
  const update = useProfilesStore((state) => state.update)
  const window = profile.window ?? { width: 1280, height: 720, fullscreen: false }

  return (
    <Section title={t.profiles.windowTitle}>
      <div className="flex items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-faint">{t.profiles.windowWidth}</span>
          <TextInput
            type="number"
            value={window.width}
            min={320}
            max={7680}
            className="w-24"
            onChange={(event) =>
              void update(profile.id, { window: { ...window, width: Number(event.target.value) } })
            }
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-faint">{t.profiles.windowHeight}</span>
          <TextInput
            type="number"
            value={window.height}
            min={240}
            max={4320}
            className="w-24"
            onChange={(event) =>
              void update(profile.id, { window: { ...window, height: Number(event.target.value) } })
            }
          />
        </label>
        <div className="pb-1">
          <Switch
            checked={window.fullscreen}
            onChange={(fullscreen) => void update(profile.id, { window: { ...window, fullscreen } })}
            label={t.profiles.fullscreen}
          />
        </div>
      </div>
    </Section>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-faint">{title}</h3>
      {children}
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </section>
  )
}

function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}
