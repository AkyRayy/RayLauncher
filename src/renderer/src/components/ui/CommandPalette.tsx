import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { fuzzyFilter, highlightParts } from '@shared/fuzzy'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import { useLaunchStore } from '@renderer/stores/launch.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import {
  AccountIcon,
  CatalogIcon,
  DownloadIcon,
  FolderIcon,
  HomeIcon,
  InstalledIcon,
  LogsIcon,
  NewsIcon,
  PlayIcon,
  ProfilesIcon,
  SettingsIcon
} from '@renderer/components/icons'

interface Command {
  id: string
  title: string
  hint: string
  icon: React.ReactElement
  keywords: string
  run: () => void
}

export function CommandPalette(): React.ReactElement {
  const t = useI18n()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const profiles = useProfilesStore((state) => state.profiles)
  const hydrateProfiles = useProfilesStore((state) => state.hydrate)
  const launchProfile = useLaunchStore((state) => state.launchProfile)
  const theme = useSettingsStore((state) => state.settings.theme)
  const patch = useSettingsStore((state) => state.patch)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(0)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((previous) => !previous)
        void hydrateProfiles()
        return
      }
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hydrateProfiles])

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path)
      close()
    }

    const navigation: Command[] = [
      { id: 'nav-home', title: t.nav.home, hint: t.palette.sectionNav, icon: <HomeIcon size={16} />, keywords: 'home главная', run: go('/home') },
      { id: 'nav-profiles', title: t.nav.profiles, hint: t.palette.sectionNav, icon: <ProfilesIcon size={16} />, keywords: 'profiles профили сборки', run: go('/profiles') },
      { id: 'nav-mods', title: t.nav.mods, hint: t.palette.sectionNav, icon: <CatalogIcon size={16} />, keywords: 'mods моды каталог modrinth', run: go('/mods') },
      { id: 'nav-installed', title: t.nav.installed, hint: t.palette.sectionNav, icon: <InstalledIcon size={16} />, keywords: 'installed установленные', run: go('/mods/installed') },
      { id: 'nav-accounts', title: t.nav.accounts, hint: t.palette.sectionNav, icon: <AccountIcon size={16} />, keywords: 'accounts аккаунты вход', run: go('/accounts') },
      { id: 'nav-downloads', title: t.nav.downloads, hint: t.palette.sectionNav, icon: <DownloadIcon size={16} />, keywords: 'downloads загрузки', run: go('/downloads') },
      { id: 'nav-news', title: t.nav.news, hint: t.palette.sectionNav, icon: <NewsIcon size={16} />, keywords: 'news новости', run: go('/news') },
      { id: 'nav-settings', title: t.nav.settings, hint: t.palette.sectionNav, icon: <SettingsIcon size={16} />, keywords: 'settings настройки', run: go('/settings') },
      { id: 'nav-logs', title: t.nav.logs, hint: t.palette.sectionNav, icon: <LogsIcon size={16} />, keywords: 'logs логи журнал', run: go('/logs') }
    ]

    const launches: Command[] = profiles.slice(0, 8).map((profile) => ({
      id: `launch-${profile.id}`,
      title: t.palette.launchProfile(profile.name),
      hint: `${profile.gameVersion} · ${profile.loader.kind}`,
      icon: <PlayIcon size={16} />,
      keywords: `play запуск играть ${profile.name} ${profile.gameVersion}`,
      run: () => {
        void launchProfile(profile.id)
        close()
      }
    }))

    const actions: Command[] = [
      {
        id: 'action-theme',
        title: theme === 'dark' ? t.palette.themeLight : t.palette.themeDark,
        hint: t.palette.sectionAction,
        icon: <SettingsIcon size={16} />,
        keywords: 'theme тема светлая тёмная оформление',
        run: () => {
          void patch({ theme: theme === 'dark' ? 'light' : 'dark' })
          close()
        }
      },
      {
        id: 'action-games-folder',
        title: t.palette.openGames,
        hint: t.palette.sectionAction,
        icon: <FolderIcon size={16} />,
        keywords: 'folder папка игры games',
        run: () => {
          void api.system.openFolder('games')
          close()
        }
      },
      {
        id: 'action-logs-folder',
        title: t.palette.openLogs,
        hint: t.palette.sectionAction,
        icon: <FolderIcon size={16} />,
        keywords: 'folder папка логи logs',
        run: () => {
          void api.system.openFolder('logs')
          close()
        }
      }
    ]

    return [...launches, ...navigation, ...actions]
  }, [t, profiles, theme, navigate, close, launchProfile, patch])

  const results = useMemo(() => {
    if (query.trim().length === 0) return commands.slice(0, 8).map((item) => ({ item, indices: [] as number[] }))
    return fuzzyFilter(query, commands, (command) => `${command.title} ${command.keywords}`)
      .slice(0, 8)
      .map((ranked) => ({
        item: ranked.item,
        indices: ranked.indices.filter((index) => index < ranked.item.title.length)
      }))
  }, [commands, query])

  const active = Math.min(cursor, Math.max(0, results.length - 1))

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((previous) => (results.length === 0 ? 0 : (previous + 1) % results.length))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((previous) => (results.length === 0 ? 0 : (previous - 1 + results.length) % results.length))
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      results[active]?.item.run()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-6 pt-[15vh]"
          role="presentation"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            role="dialog"
            aria-modal="true"
            aria-label={t.palette.title}
            className="material-pop w-full max-w-lg overflow-hidden rounded-lg"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <div className="hairline-b px-4">
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setCursor(0)
                }}
                placeholder={t.palette.placeholder}
                aria-label={t.palette.title}
                className="h-12 w-full bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
              />
            </div>

            {results.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t.palette.empty}</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto p-1.5">
                {results.map((result, index) => (
                  <li key={result.item.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => result.item.run()}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-colors',
                        index === active ? 'bg-fill' : 'hover:bg-fill/60'
                      )}
                    >
                      <span className="shrink-0 text-muted">{result.item.icon}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {highlightParts(result.item.title, result.indices).map((part, partIndex) => (
                          <span
                            key={`${part.text}-${partIndex}`}
                            className={part.hit ? 'font-semibold text-accent' : undefined}
                          >
                            {part.text}
                          </span>
                        ))}
                      </span>
                      <span className="shrink-0 text-xs text-faint">{result.item.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <footer className="hairline-t flex items-center gap-4 px-4 py-2 text-[11px] text-faint">
              <span>{t.palette.hintMove}</span>
              <span>{t.palette.hintRun}</span>
              <span>{t.palette.hintClose}</span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
