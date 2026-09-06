import { useEffect } from 'react'
import type { AccentId, BackgroundId, Density, ThemeMode } from '@shared/types'

export function useAppliedTheme(
  theme: ThemeMode,
  accent: AccentId,
  density: Density,
  background: BackgroundId
): void {
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
    }

    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, accent, density, background])
}
