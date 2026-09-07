import { useEffect } from 'react'
import { useI18n } from '@renderer/i18n'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { CheckIcon, ExternalIcon, PlusIcon, TrashIcon } from '@renderer/components/icons'
import { useThemesStore } from '@renderer/stores/themes.store'
import { useSettingsStore } from '@renderer/stores/settings.store'

export function ThemeGallery(): React.ReactElement {
  const t = useI18n()
  const packs = useThemesStore((state) => state.packs)
  const busyId = useThemesStore((state) => state.busyId)
  const hydrate = useThemesStore((state) => state.hydrate)
  const apply = useThemesStore((state) => state.apply)
  const importPack = useThemesStore((state) => state.importPack)
  const exportPack = useThemesStore((state) => state.exportPack)
  const remove = useThemesStore((state) => state.remove)
  const activePackId = useSettingsStore((state) => state.settings.themePackId)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-ink">{t.themes.title}</div>
          <p className="mt-0.5 max-w-md text-xs text-muted">{t.themes.subtitle}</p>
        </div>
        <Button
          size="sm"
          icon={<PlusIcon size={14} />}
          disabled={busyId !== null}
          onClick={() => void importPack()}
        >
          {t.themes.import}
        </Button>
      </div>

      {packs.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t.themes.empty}</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {packs.map((pack) => {
            const active = pack.id === activePackId
            return (
              <li key={pack.id}>
                <Card className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                      {active && <CheckIcon size={13} className="shrink-0 text-success" />}
                      {pack.name}
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      {pack.builtin ? t.themes.builtin : t.themes.custom}
                      {pack.author ? ` · ${pack.author}` : ''} · {pack.theme} · {pack.accent}
                    </p>
                  </div>
                  {!active && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId !== null}
                      onClick={() => void apply(pack.id)}
                    >
                      {t.themes.apply}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ExternalIcon size={13} />}
                    aria-label={t.themes.export}
                    title={t.themes.export}
                    disabled={busyId !== null}
                    onClick={() => void exportPack(pack.id)}
                  >
                    {''}
                  </Button>
                  {!pack.builtin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<TrashIcon size={13} />}
                      aria-label={t.themes.remove}
                      title={t.themes.remove}
                      disabled={busyId !== null}
                      onClick={() => void remove(pack.id)}
                    >
                      {''}
                    </Button>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
