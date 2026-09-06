import { useSettingsStore } from '@renderer/stores/settings.store'

export function localeFor(language: 'ru' | 'en'): string {
  return language === 'ru' ? 'ru-RU' : 'en-US'
}

export function useLocale(): string {
  return localeFor(useSettingsStore((state) => state.settings.language))
}

export function formatDate(value: number | string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}

export function formatDateTime(value: number | string, locale: string): string {
  return new Date(value).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
