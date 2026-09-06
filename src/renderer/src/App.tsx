import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { useLaunchStore } from '@renderer/stores/launch.store'
import { useAppliedTheme } from '@renderer/lib/useAppliedTheme'
import { TitleBar } from '@renderer/components/chrome/TitleBar'
import { BackgroundLayer } from '@renderer/components/chrome/BackgroundLayer'
import { Sidebar } from '@renderer/components/chrome/Sidebar'
import { ToastHost } from '@renderer/components/ui/Toast'
import { CommandPalette } from '@renderer/components/ui/CommandPalette'
import { GameConsole } from '@renderer/features/GameConsole'
import { useUiStore } from '@renderer/stores/ui.store'
import { useAppNotifications } from '@renderer/lib/useAppNotifications'
import { WelcomePage } from '@renderer/pages/WelcomePage'
import { HomePage } from '@renderer/pages/HomePage'
import { ProfilesPage } from '@renderer/pages/ProfilesPage'
import { ModsCatalogPage } from '@renderer/pages/ModsCatalogPage'
import { ModsInstalledPage } from '@renderer/pages/ModsInstalledPage'
import { AccountsPage } from '@renderer/pages/AccountsPage'
import { DownloadsPage } from '@renderer/pages/DownloadsPage'
import { NewsPage } from '@renderer/pages/NewsPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { LogsPage } from '@renderer/pages/LogsPage'

export function App(): React.ReactElement {
  const { settings, ready, load } = useSettingsStore()
  useAppliedTheme(settings.theme, settings.accent, settings.density, settings.backgroundId)

  const hydrate = useLaunchStore((state) => state.hydrate)
  useAppNotifications()

  useEffect(() => {
    void load()
    void hydrate()
  }, [load, hydrate])

  return (
    <HashRouter>
      <BackgroundLayer />
      <div className="flex h-full flex-col overflow-hidden bg-canvas">
        <TitleBar />
        {ready ? <Shell onboarded={settings.onboarded} /> : <BootScreen />}
        <ToastHost />
        <CommandPalette />
      </div>
    </HashRouter>
  )
}

function Shell({ onboarded }: { onboarded: boolean }): React.ReactElement {
  const location = useLocation()
  const welcome = location.pathname === '/welcome'
  const consoleOpen = useUiStore((state) => state.consoleOpen)
  const setConsoleOpen = useUiStore((state) => state.setConsoleOpen)

  return (
    <div className="flex min-h-0 flex-1">
      {!welcome && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Navigate to={onboarded ? '/home' : '/welcome'} replace />} />
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/mods" element={<ModsCatalogPage />} />
            <Route path="/mods/installed" element={<ModsInstalledPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </AnimatePresence>
        {!welcome && <GameConsole open={consoleOpen} onClose={() => setConsoleOpen(false)} />}
      </div>
    </div>
  )
}

function BootScreen(): React.ReactElement {
  return <div className="flex-1 bg-canvas" />
}
