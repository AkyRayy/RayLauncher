import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { useI18n } from '@renderer/i18n'
import { RayLogo } from '@renderer/components/icons'

export function TitleBar(): React.ReactElement {
  const t = useI18n()
  const [maximized, setMaximized] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    void api.window.state().then((state) => setMaximized(state.maximized))
    return api.on['window:state']((state) => setMaximized(state.maximized))
  }, [])

  return (
    <header className="material-bar relative z-30 flex h-[38px] shrink-0 items-center hairline-b">
      <div
        className="no-drag flex h-full w-[86px] shrink-0 items-center gap-2 pl-4"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <TrafficLight
          kind="close"
          label={t.window.close}
          hovered={hovered}
          onClick={() => void api.window.close()}
        />
        <TrafficLight
          kind="minimize"
          label={t.window.minimize}
          hovered={hovered}
          onClick={() => void api.window.minimize()}
        />
        <TrafficLight
          kind="zoom"
          label={maximized ? t.window.restore : t.window.maximize}
          hovered={hovered}
          maximized={maximized}
          onClick={() =>
            void api.window.toggleMaximize().then((state) => setMaximized(state.maximized))
          }
        />
      </div>

      <div className="drag-region flex h-full min-w-0 flex-1 items-center justify-center">
        <span className="pointer-events-none">
          <RayLogo size={17} />
        </span>
      </div>

      <div className="drag-region h-full w-[86px] shrink-0" />
    </header>
  )
}

const LIGHTS = {
  close: { idle: '#ff5f57', ring: 'rgb(0 0 0 / 0.12)', glyph: '#7d0104' },
  minimize: { idle: '#febc2e', ring: 'rgb(0 0 0 / 0.1)', glyph: '#8a5000' },
  zoom: { idle: '#28c840', ring: 'rgb(0 0 0 / 0.1)', glyph: '#0a5217' }
} as const

function TrafficLight({
  kind,
  label,
  hovered,
  maximized,
  onClick
}: {
  kind: keyof typeof LIGHTS
  label: string
  hovered: boolean
  maximized?: boolean
  onClick: () => void
}): React.ReactElement {
  const light = LIGHTS[kind]

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="no-drag group flex h-3 w-3 items-center justify-center rounded-full transition-[filter] duration-100 active:brightness-75"
      style={{ background: light.idle, boxShadow: `inset 0 0 0 0.5px ${light.ring}` }}
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        aria-hidden
        style={{ opacity: hovered ? 1 : 0, transition: 'opacity 120ms var(--ease-ray)' }}
        stroke={light.glyph}
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      >
        {kind === 'close' && <path d="M2.2 2.2 5.8 5.8M5.8 2.2 2.2 5.8" />}
        {kind === 'minimize' && <path d="M2 4h4" />}
        {kind === 'zoom' &&
          (maximized ? (
            <path d="M2.4 5.6h3.2v-3.2z M5.6 2.4H2.4v3.2z" fill={light.glyph} stroke="none" />
          ) : (
            <path d="M2.3 5.7V2.3h3.4z M5.7 2.3v3.4H2.3z" fill={light.glyph} stroke="none" />
          ))}
      </svg>
    </button>
  )
}
