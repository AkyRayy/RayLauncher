import { useEffect, useState } from 'react'
import { useI18n } from '@renderer/i18n'
import { Button } from '@renderer/components/ui/Button'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { usePerfStore } from '@renderer/stores/perf.store'
import type { PerfPresetId } from '@shared/types'

export function PerfSection({ profileId }: { profileId: string }): React.ReactElement {
  const t = useI18n()
  const load = usePerfStore((state) => state.load)
  const apply = usePerfStore((state) => state.apply)
  const applying = usePerfStore((state) => state.applying)
  const boost = usePerfStore((state) => state.boost)
  const boosting = usePerfStore((state) => state.boosting)
  const lastBoost = usePerfStore((state) => state.lastBoost)
  const [preset, setPreset] = useState<PerfPresetId>('balanced')
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="mt-5 border-t border-hairline pt-4">
      <h3 className="text-sm font-semibold text-ink">{t.perf.title}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SegmentedControl
          ariaLabel={t.perf.preset}
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'low', label: t.perf.low },
            { value: 'balanced', label: t.perf.balanced },
            { value: 'high', label: t.perf.powerful }
          ]}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={applying}
          onClick={() => {
            setApplied(false)
            void apply(profileId, preset).then((ok) => setApplied(ok))
          }}
        >
          {applying ? t.perf.applying : t.perf.apply}
        </Button>
        {applied && <span className="text-xs text-success">{t.perf.applied}</span>}
      </div>

      <div className="mt-3 rounded-md bg-fill px-3 py-2.5">
        <p className="text-sm font-medium text-ink">{t.perf.boostTitle}</p>
        <p className="mt-0.5 text-xs text-muted">{t.perf.boostBody}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={boosting} onClick={() => void boost(profileId)}>
            {boosting ? t.perf.boosting : t.perf.boost}
          </Button>
          {lastBoost && (
            <span className="text-xs text-muted">
              {lastBoost.installed.length > 0
                ? t.perf.boostDone(lastBoost.installed.join(', '))
                : t.perf.boostNone}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
