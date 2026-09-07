import { handle } from './registry'
import { emitEvent } from '../core/events'
import { listMods } from '../db/mods.repo'
import { listProfiles } from '../db/profiles.repo'
import { applyPreset, installBoost, listPresets } from '../perf/presets'

export function registerPerfIpc(): void {
  handle('perf:presets', () => listPresets())

  handle('perf:apply', ({ profileId, preset }) => {
    const profile = applyPreset(profileId, preset)
    emitEvent('profiles:changed', listProfiles())
    return profile
  })

  handle('perf:boost', async ({ profileId }) => {
    const result = await installBoost(profileId)
    emitEvent('mods:changed', { profileId, mods: listMods(profileId) })
    return result
  })
}
