import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { useSettingsStore } from '@renderer/stores/settings.store'
import dawn from '@renderer/assets/bg-dawn.jpg'
import night from '@renderer/assets/bg-night.jpg'
import studio from '@renderer/assets/bg-studio.jpg'
import type { BackgroundId, CustomBackground } from '@shared/types'

export const BUILTIN_BACKGROUNDS: Record<Exclude<BackgroundId, 'none' | 'custom'>, string> = {
  dawn,
  night,
  studio
}

export function BackgroundLayer(): React.ReactElement | null {
  const settings = useSettingsStore((state) => state.settings)
  const [custom, setCustom] = useState<CustomBackground | null>(null)

  useEffect(() => {
    if (settings.backgroundId !== 'custom') return undefined

    let alive = true
    void api.background.current().then((background) => {
      if (alive) setCustom(background)
    })
    return () => {
      alive = false
    }
  }, [settings.backgroundId, settings.backgroundCustom])

  if (settings.backgroundId === 'none') return null

  const custom_ = settings.backgroundId === 'custom' ? custom : null
  const source =
    settings.backgroundId === 'custom' ? (custom_?.url ?? null) : BUILTIN_BACKGROUNDS[settings.backgroundId]
  if (source === null) return null

  const motion = settings.backgroundMotion
  const filter = settings.backgroundBlur > 0 ? `blur(${settings.backgroundBlur}px)` : undefined

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0f0d0b]">
      {custom_?.kind === 'video' ? (
        <video
          src={source}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
          style={{ filter }}
        />
      ) : (
        <img
          src={source}
          alt=""
          className={motion ? 'ray-bg-drift h-full w-full object-cover' : 'h-full w-full object-cover'}
          style={{ filter }}
        />
      )}

      {motion && <div className="ray-bg-haze absolute inset-0" />}

      <div
        className="absolute inset-0"
        style={{
          background: `color-mix(in srgb, var(--canvas-solid) ${Math.round(settings.backgroundDim * 100)}%, transparent)`
        }}
      />
      <div className="ray-bg-vignette absolute inset-0" />
    </div>
  )
}
