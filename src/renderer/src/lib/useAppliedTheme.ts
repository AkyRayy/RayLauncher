import { useEffect, useRef } from 'react'
import type { AccentId, BackgroundId, Density, ThemeMode } from '@shared/types'
import { useThemesStore } from '@renderer/stores/themes.store'

export function useAppliedTheme(
  theme: ThemeMode,
  accent: AccentId,
  density: Density,
  background: BackgroundId,
  themePackId: string,
  customCssVars: Record<string, string>
): void {
  const packs = useThemesStore((state) => state.packs)
  const hydrate = useThemesStore((state) => state.hydrate)
  const appliedVars = useRef<string[]>([])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = (): void => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      const root = document.documentElement
      root.dataset.theme = resolved
      root.dataset.accent = accent
      root.dataset.density = density
      root.dataset.bg = background === 'none' ? 'off' : 'on'
      root.style.colorScheme = resolved

      for (const key of appliedVars.current) root.style.removeProperty(key)
      const packVars = packs.find((pack) => pack.id === themePackId)?.cssVars ?? {}
      const vars = { ...packVars, ...customCssVars }
      for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
      appliedVars.current = Object.keys(vars)
    }

    apply()
    if (theme !== 'system') return undefined
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, accent, density, background, themePackId, customCssVars, packs])
}
