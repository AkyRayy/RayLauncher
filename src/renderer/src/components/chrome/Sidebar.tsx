import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@renderer/lib/cn'
import { useI18n } from '@renderer/i18n'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { useActiveDownloadsCount } from '@renderer/stores/downloads.store'
import { useActiveAccount } from '@renderer/stores/accounts.store'
import {
  CatalogIcon,
  ChevronIcon,
  DownloadIcon,
  InstalledIcon,
  LogsIcon,
  NewsIcon,
  PlayIcon,
  ProfilesIcon,
  SettingsIcon
} from '@renderer/components/icons'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  badge?: number
  end?: boolean
}

export function Sidebar(): React.ReactElement {
  const t = useI18n()
  const location = useLocation()
  const collapsed = useSettingsStore((state) => state.settings.sidebarCollapsed)
  const patch = useSettingsStore((state) => state.patch)
  const downloading = useActiveDownloadsCount()

  const primary: NavItem[] = [
    { to: '/home', label: t.nav.home, icon: <PlayIcon size={15} /> },
    { to: '/profiles', label: t.nav.profiles, icon: <ProfilesIcon size={15} /> },
    { to: '/mods', label: t.nav.mods, icon: <CatalogIcon size={15} />, end: true },
    { to: '/news', label: t.nav.news, icon: <NewsIcon size={15} /> },
    { to: '/settings', label: t.nav.settings, icon: <SettingsIcon size={15} /> }
  ]

  const utility: NavItem[] = [
    { to: '/downloads', label: t.nav.downloads, icon: <DownloadIcon size={15} />, badge: downloading },
    { to: '/logs', label: t.nav.logs, icon: <LogsIcon size={15} /> }
  ]

  const modsOpen = location.pathname.startsWith('/mods')

  return (
    <nav
      aria-label={t.app.name}
      className={cn(
        'material-sidebar relative flex shrink-0 flex-col hairline-r transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-[228px]'
      )}
      style={{ transitionTimingFunction: 'var(--ease-ray)' }}
    >
      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        <ul className="space-y-0.5">
          {primary.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} collapsed={collapsed} />
              {item.to === '/mods' && modsOpen && !collapsed && (
                <SubLink to="/mods/installed" label={t.nav.installed} icon={<InstalledIcon size={14} />} />
              )}
            </li>
          ))}
        </ul>

        <ul className="mt-3 space-y-0.5 border-t border-hairline pt-3">
          {utility.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} collapsed={collapsed} muted />
            </li>
          ))}
        </ul>
      </div>

      <AccountChip collapsed={collapsed} />

      <button
        type="button"
        onClick={() => void patch({ sidebarCollapsed: !collapsed })}
        aria-label={collapsed ? t.nav.expand : t.nav.collapse}
        title={collapsed ? t.nav.expand : t.nav.collapse}
        className="flex h-9 items-center gap-2 px-4 text-xs text-faint transition-colors duration-100 hover:text-ink hairline-t"
      >
        <motion.span animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
          <ChevronIcon size={13} />
        </motion.span>
        {!collapsed && <span>{t.nav.collapse}</span>}
      </button>
    </nav>
  )
}

function SidebarLink({
  item,
  collapsed,
  muted
}: {
  item: NavItem
  collapsed: boolean
  muted?: boolean
}): React.ReactElement {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-2.5 rounded-sm px-2 text-sm transition-colors duration-100',
          isActive ? 'text-on-accent' : cn(muted ? 'text-muted' : 'text-ink/85', 'hover:bg-fill'),
          collapsed && 'justify-center px-0'
        )
      }
      style={{ height: 'var(--sidebar-row)' }}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              transition={{ type: 'spring', stiffness: 520, damping: 42 }}
              className="absolute inset-0 rounded-sm bg-accent"
            />
          )}
          <span className={cn('relative z-10 shrink-0', !isActive && 'text-accent')}>{item.icon}</span>
          {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
          {!collapsed && item.badge !== undefined && item.badge > 0 && (
            <span
              className={cn(
                'relative z-10 ml-auto rounded-full px-1.5 text-2xs font-semibold tabular-nums',
                isActive ? 'bg-white/25 text-on-accent' : 'bg-accent text-on-accent'
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function SubLink({
  to,
  label,
  icon
}: {
  to: string
  label: string
  icon: React.ReactNode
}): React.ReactElement {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'ml-[26px] mt-0.5 flex h-7 items-center gap-2 rounded-sm px-2 text-xs transition-colors duration-100',
          isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-fill hover:text-ink'
        )
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function AccountChip({ collapsed }: { collapsed: boolean }): React.ReactElement {
  const t = useI18n()
  const account = useActiveAccount()
  const nickname = useSettingsStore((state) => state.settings.guestNickname)
  const name = account?.username ?? nickname
  const kind =
    account === null
      ? t.launch.guest
      : account.kind === 'guest'
        ? t.accounts.kindGuest
        : account.kind === 'microsoft'
          ? t.accounts.kindMicrosoft
          : t.accounts.kindYggdrasil

  return (
    <NavLink
      to="/accounts"
      title={collapsed ? name : undefined}
      className={({ isActive }) =>
        cn(
          'mx-2.5 mb-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-100',
          isActive ? 'bg-fill' : 'hover:bg-fill',
          collapsed && 'justify-center px-0'
        )
      }
    >
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-sm font-semibold text-accent"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm text-ink">{name}</span>
          <span className="block truncate text-2xs text-faint">{kind}</span>
        </span>
      )}
    </NavLink>
  )
}
