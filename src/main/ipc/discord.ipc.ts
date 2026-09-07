import { handle } from './registry'
import { discordStatus } from '../discord/presence'

export function registerDiscordIpc(): void {
  handle('discord:status', () => discordStatus())
}
