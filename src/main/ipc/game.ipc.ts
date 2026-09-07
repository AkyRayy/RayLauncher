import { BrowserWindow, shell } from 'electron'
import { MEMORY } from '@shared/constants'
import { RayError } from '@shared/errors'
import { clamp } from '@shared/util'
import type { GameState } from '@shared/types'
import { handle } from './registry'
import { createGuestAccount } from '../auth/offline'
import { getActiveAccount } from '../auth/accountManager'
import { ensureFreshAccount } from '../auth/tokenRefresher'
import { currentGameState, isRunning, killGame, launchGame, onGameState, stopGame } from '../minecraft/launcher'
import { getSettings, patchSettings } from '../store/settings.store'
import { logger } from '../logger'

export const QUICK_PROFILE_ID = 'quick'

export function registerGameIpc(): void {
  onGameState((state) => {
    if (state.phase === 'stopped' || state.phase === 'crashed') restoreLauncherWindow()
  })

  handle('game:launch', async ({ versionId, nickname, accountId, memoryMaxMb }): Promise<GameState> => {
    if (isRunning(QUICK_PROFILE_ID)) {
      throw new RayError('GAME_ALREADY_RUNNING', 'Игра уже запущена')
    }

    const settings = getSettings()
    const maxMb = clamp(memoryMaxMb ?? settings.defaultMemoryMb, MEMORY.minMb, MEMORY.maxMb)

    patchSettings({ guestNickname: nickname, lastVersionId: versionId })

    const stored = accountId ? await ensureFreshAccount(accountId) : await getActiveAccount()
    const account = stored ? await ensureFreshAccount(stored.id) : createGuestAccount(nickname)

    const state = await launchGame({
      profileId: QUICK_PROFILE_ID,
      versionId,
      account,
      memoryMinMb: Math.max(MEMORY.minMb, Math.floor(maxMb / 2)),
      memoryMaxMb: maxMb
    })

    if (settings.closeLauncherOnLaunch) hideLauncherUntilExit()
    return state
  })

  handle('game:stop', ({ profileId }) => {
    stopGame(profileId)
  })

  handle('game:kill', ({ profileId }) => {
    killGame(profileId)
  })

  handle('game:state', () => currentGameState())

  handle('game:revealCrash', () => {
    const path = currentGameState()?.crashReportPath
    if (!path) return
    shell.showItemInFolder(path)
  })
}

function hideLauncherUntilExit(): void {
  for (const window of BrowserWindow.getAllWindows()) window.hide()
  logger.info('Окно лаунчера скрыто на время игры')
}

function restoreLauncherWindow(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isVisible()) window.show()
  }
}
