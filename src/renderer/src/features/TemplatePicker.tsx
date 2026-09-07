import { useEffect, useState } from 'react'
import { useI18n } from '@renderer/i18n'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import type { LoaderKind } from '@shared/types'

const LOADER_LABEL: Record<LoaderKind, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt'
}

export function TemplatePicker({ onCreated }: { onCreated?: (profileId: string) => void }): React.ReactElement {
  const t = useI18n()
  const templates = useProfilesStore((state) => state.templates)
  const loadTemplates = useProfilesStore((state) => state.loadTemplates)
  const createFromTemplate = useProfilesStore((state) => state.createFromTemplate)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  if (templates.length === 0) return <></>

  return (
    <section className="mb-5">
      <h2 className="text-sm font-semibold text-ink">{t.templates.title}</h2>
      <p className="mt-0.5 text-xs text-muted">{t.templates.subtitle}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {templates.map((template) => (
          <Card key={template.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {t.templates.names[template.id] ?? template.id}
              </p>
              <p className="text-xs text-faint">{LOADER_LABEL[template.loader]}</p>
            </div>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setBusy(template.id)
                void createFromTemplate(template.id).then((profile) => {
                  setBusy(null)
                  if (profile) onCreated?.(profile.id)
                })
              }}
            >
              {busy === template.id ? t.templates.creating : t.templates.use}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  )
}
