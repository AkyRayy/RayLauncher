import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { Button } from '@renderer/components/ui/Button'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { FolderIcon, RayMark } from '@renderer/components/icons'
import { pageTransition, pageVariants } from '@renderer/lib/motion'

export function WelcomePage(): React.ReactElement {
  const t = useI18n()
  const navigate = useNavigate()
  const settings = useSettingsStore((state) => state.settings)
  const patch = useSettingsStore((state) => state.patch)

  const finish = async (): Promise<void> => {
    await patch({ onboarded: true })
    void navigate('/home', { replace: true })
  }

  const chooseFolder = async (): Promise<void> => {
    const result = await api.system.chooseDirectory(t.welcome.stepFolder)
    if (result.path) await patch({ gamesDir: result.path })
  }

  return (
    <motion.main
      variants={pageVariants}
      initial="initial"
      animate="animate"
      transition={pageTransition}
      className="flex flex-1 items-center justify-center px-8"
    >
      <div className="w-full max-w-md">
        <span className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-surface shadow-card">
          <RayMark size={34} />
        </span>

        <h1 className="text-2xl text-ink">{t.welcome.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.welcome.subtitle}</p>

        <div className="mt-8 space-y-5">
          <Step label={t.welcome.stepLanguage}>
            <SegmentedControl
              ariaLabel={t.welcome.stepLanguage}
              value={settings.language}
              onChange={(language) => void patch({ language })}
              options={[
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' }
              ]}
            />
          </Step>

          <Step label={t.welcome.stepTheme}>
            <SegmentedControl
              ariaLabel={t.welcome.stepTheme}
              value={settings.theme}
              onChange={(theme) => void patch({ theme })}
              options={[
                { value: 'light', label: t.settings.themeLight },
                { value: 'dark', label: t.settings.themeDark },
                { value: 'system', label: t.settings.themeSystem }
              ]}
            />
          </Step>

          <Step label={t.welcome.stepFolder}>
            <div className="flex w-full items-center justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-xs text-muted" title={settings.gamesDir}>
                {settings.gamesDir}
              </span>
              <Button size="sm" icon={<FolderIcon size={14} />} onClick={() => void chooseFolder()}>
                {t.settings.change}
              </Button>
            </div>
          </Step>
        </div>

        <div className="mt-10 flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={() => void finish()}>
            {t.welcome.start}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => void finish()}>
            {t.welcome.skip}
          </Button>
        </div>
      </div>
    </motion.main>
  )
}

function Step({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-6 pb-5">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </div>
  )
}
