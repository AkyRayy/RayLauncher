import { totalmem } from 'node:os'
import { shell } from 'electron'
import { MEMORY } from '@shared/constants'
import { clamp } from '@shared/util'
import type { CrashFixId, CrashFixResult, CrashSuspect, CrashVerdict } from '@shared/types'
import { handle } from './registry'
import { emitEvent } from '../core/events'
import { logger } from '../logger'
import { findProfile, requireProfile, updateProfile } from '../db/profiles.repo'
import { listMods } from '../db/mods.repo'
import { currentGameState, getVerdict } from '../minecraft/launcher'
import { sendCrashReport } from '../minecraft/telemetry'
import { installProfile } from '../profiles/profileService'
import { listProfiles } from '../db/profiles.repo'
import { reinstallMod, toggleMod } from '../mods/modManager'

export function registerCrashIpc(): void {
  handle('crash:verdict', ({ profileId }): CrashVerdict | null => {
    const verdict = getVerdict(profileId)
    if (!verdict) return null

    const target = profileId ?? currentGameState()?.profileId
    if (!target) return verdict
    return { ...verdict, suspects: matchSuspects(target, verdict.suspects) }
  })

  handle('crash:applyFix', async ({ profileId, fixId }): Promise<CrashFixResult> => {
    const target = profileId ?? currentGameState()?.profileId
    if (!target) return { applied: false, message: 'Нет данных о последнем запуске' }
    return applyFix(target, fixId)
  })

  handle('crash:sendReport', async ({ profileId }) => {
    const verdict = getVerdict(profileId)
    return sendCrashReport(verdict, profileId ?? currentGameState()?.profileId)
  })
}

/** Привязывает подозреваемые файлы к установленным модам профиля. */
export function matchSuspects(profileId: string, suspects: readonly CrashSuspect[]): CrashSuspect[] {
  let mods
  try {
    mods = listMods(profileId)
  } catch {
    return [...suspects]
  }

  return suspects.map((suspect) => {
    const hint = suspect.fileHint.toLowerCase()
    const found = mods.find(
      (mod) =>
        mod.fileName.toLowerCase().includes(hint) ||
        hint.includes(mod.slug.toLowerCase()) ||
        (mod.slug.length > 0 && hint === mod.slug.toLowerCase()) ||
        mod.projectId.toLowerCase() === hint ||
        mod.title.toLowerCase() === hint
    )
    return found ? { ...suspect, modId: found.id, title: found.title } : suspect
  })
}

async function applyFix(profileId: string, fixId: CrashFixId): Promise<CrashFixResult> {
  const profile = findProfile(profileId)
  if (!profile) {
    return { applied: false, message: 'Быстрая игра без профиля: создайте сборку, чтобы применить исправление' }
  }

  switch (fixId) {
    case 'add-memory': {
      const capMb = Math.min(
        MEMORY.maxMb,
        Math.floor((totalmem() / (1024 * 1024)) * MEMORY.warnRatio)
      )
      const nextMb = clamp(profile.memory.maxMb + 2048, MEMORY.minMb, capMb)
      if (nextMb <= profile.memory.maxMb) {
        return { applied: false, message: `Память уже на пределе (${profile.memory.maxMb} МБ)` }
      }
      updateProfile(profileId, {
        memory: { auto: false, minMb: Math.floor(nextMb / 2), maxMb: nextMb }
      })
      emitEvent('profiles:changed', listProfiles())
      logger.info(`Краш-фикс: память профиля «${profile.name}» → ${nextMb} МБ`)
      return { applied: true, message: `Память увеличена до ${nextMb} МБ` }
    }

    case 'disable-suspects': {
      const verdict = getVerdict(profileId)
      const suspects = matchSuspects(profileId, verdict?.suspects ?? [])
      const ids = suspects.map((suspect) => suspect.modId).filter((id): id is string => !!id)
      if (ids.length === 0) return { applied: false, message: 'Подозреваемые моды не опознаны' }

      for (const id of ids) {
        await toggleMod(id, false)
      }
      emitEvent('mods:changed', { profileId, mods: listMods(profileId) })
      logger.info(`Краш-фикс: отключены моды ${ids.length}`)
      return { applied: true, message: `Отключено модов: ${ids.length}` }
    }

    case 'reinstall-suspects': {
      const verdict = getVerdict(profileId)
      const suspects = matchSuspects(profileId, verdict?.suspects ?? [])
      const ids = suspects.map((suspect) => suspect.modId).filter((id): id is string => !!id)
      if (ids.length === 0) return { applied: false, message: 'Подозреваемые моды не опознаны' }

      let done = 0
      for (const id of ids) {
        try {
          await reinstallMod(id)
          done += 1
        } catch (error) {
          logger.warn(`Не переустановился ${id}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      emitEvent('mods:changed', { profileId, mods: listMods(profileId) })
      return done > 0
        ? { applied: true, message: `Переустановлено модов: ${done}` }
        : { applied: false, message: 'Не удалось переустановить моды' }
    }

    case 'reset-java': {
      requireProfile(profileId)
      updateProfile(profileId, { java: { mode: 'auto' } })
      emitEvent('profiles:changed', listProfiles())
      logger.info(`Краш-фикс: Java профиля «${profile.name}» возвращена на авто`)
      return { applied: true, message: 'Java возвращена на автоматический выбор' }
    }

    case 'verify-files': {
      const result = await installProfile(profileId, true)
      emitEvent('profiles:changed', listProfiles())
      logger.info(`Краш-фикс: файлы ${result.versionId} проверены`)
      return { applied: true, message: 'Файлы игры проверены и починены' }
    }

    case 'reveal-report': {
      const verdict = getVerdict(profileId)
      if (!verdict?.reportPath) return { applied: false, message: 'Файл отчёта не найден' }
      shell.showItemInFolder(verdict.reportPath)
      return { applied: true, message: 'Отчёт показан в проводнике' }
    }
  }
}
