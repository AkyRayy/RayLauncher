import { shell } from 'electron'
import { RELEASES } from '@shared/constants'
import type { NewsFeed } from '@shared/types'
import { handle } from './registry'
import { fetchNews } from '../news/news'
import { checkForUpdates, downloadUpdate, quitAndInstall, updateState } from '../updater/updater'
import { logger } from '../logger'

export function registerNewsIpc(): void {
  handle('news:list', async ({ refresh }): Promise<NewsFeed> => {
    try {
      return await fetchNews(refresh === true)
    } catch (error) {
      logger.warn(`Лента новостей не загрузилась: ${error instanceof Error ? error.message : String(error)}`)
      return { items: [], fetchedAt: Date.now(), fromCache: true }
    }
  })

  handle('news:openReleases', async () => {
    await shell.openExternal(RELEASES.page)
  })
}

export function registerUpdatesIpc(): void {
  handle('updates:state', () => updateState())
  handle('updates:check', () => checkForUpdates(false))
  handle('updates:download', () => downloadUpdate())
  handle('updates:install', () => {
    quitAndInstall()
  })
}
