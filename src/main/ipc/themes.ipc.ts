import { handle } from './registry'
import { applyTheme, deleteTheme, exportTheme, importTheme, listThemes } from '../themes/themes'

export function registerThemesIpc(): void {
  handle('themes:list', () => listThemes())
  handle('themes:apply', ({ id }) => applyTheme(id))
  handle('themes:import', () => importTheme())
  handle('themes:export', ({ id }) => exportTheme(id))
  handle('themes:delete', ({ id }) => deleteTheme(id))
}
