import { useSettingsStore } from '@renderer/stores/settings.store'
import type { ErrorCode } from '@shared/errors'
import { en } from './en'
import { ru, type Dictionary } from './ru'

const dictionaries: Record<'ru' | 'en', Dictionary> = { ru, en }

export function dictionaryFor(language: 'ru' | 'en'): Dictionary {
  return dictionaries[language]
}

export function useI18n(): Dictionary {
  return useSettingsStore((state) => dictionaries[state.settings.language])
}

export function useErrorText(): (code: ErrorCode) => string {
  const t = useI18n()
  return (code) => t.errors[code]
}

export type { Dictionary }
