import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { listSpring } from '@renderer/lib/motion'
import { useLaunchStore } from '@renderer/stores/launch.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import { Button } from '@renderer/components/ui/Button'
import { PackageIcon, PlayIcon, PlusIcon } from '@renderer/components/icons'
import type { LoaderKind, Profile } from '@shared/types'

const LOADER_LABEL: Record<LoaderKind, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt'
}

export function InstallationsCard(): React.ReactElement {
  const t = useI18n()
  const navigate = useNavigate()
  const profiles = useProfilesStore((state) => state.profiles)
  const activeId = useSettingsStore((state) => state.settings.activeProfileId)

  return (
    <section className="flex min-h-[200px] flex-col rounded-lg bg-surface shadow-soft">
      <header className="flex items-center justify-between px-4 py-3 hairline-b">
        <h2 className="text-sm font-semibold text-ink">{t.home.buildsGroup}</h2>
        <button
          type="button"
          onClick={() => navigate('/profiles')}
          className="text-xs text-accent hover:underline"
        >
          {t.home.allBuilds}
        </button>
      </header>

      {profiles.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-3 px-4 py-5">
          <p className="text-sm text-muted">{t.home.noProfileBody}</p>
          <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => navigate('/profiles')}>
            {t.home.createProfile}
          </Button>
        </div>
      ) : (
        <>
          <ul className="inset-list py-1">
            {profiles.slice(0, 4).map((profile) => (
              <motion.li key={profile.id} layout transition={listSpring}>
                <Row profile={profile} active={profile.id === activeId} />
              </motion.li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigate('/profiles')}
            className="mt-auto flex h-11 items-center gap-2 px-4 text-sm text-muted transition-colors duration-100 hover:bg-fill hover:text-ink hairline-t"
          >
            <PlusIcon size={14} />
            {t.home.createProfile}
          </button>
        </>
      )}
    </section>
  )
}

function Row({ profile, active }: { profile: Profile; active: boolean }): React.ReactElement {
  const t = useI18n()
  const patch = useSettingsStore((state) => state.patch)
  const launchProfile = useLaunchStore((state) => state.launchProfile)
  const busy = useLaunchStore((state) => state.busy)

  return (
    <div className="group flex h-[52px] items-center gap-3 px-3">
      <button
        type="button"
        onClick={() => void patch({ activeProfileId: profile.id })}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm px-1 py-1 text-left"
      >
        <span
          aria-hidden
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            active ? 'bg-accent text-on-accent' : 'bg-fill text-faint'
          )}
        >
          <PackageIcon size={16} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-ink">{profile.name}</span>
          <span className="block truncate text-xs text-faint">
            {profile.gameVersion} · {LOADER_LABEL[profile.loader.kind]}
          </span>
        </span>
      </button>

      <Button
        size="sm"
        icon={<PlayIcon size={13} />}
        disabled={busy}
        onClick={() => void launchProfile(profile.id)}
      >
        {t.launch.play}
      </Button>
    </div>
  )
}
