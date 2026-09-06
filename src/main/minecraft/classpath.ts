import { win32 as path } from 'node:path'

export const CLASSPATH_SEPARATOR = ';'

export function dedupeEntries(entries: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const entry of entries) {
    if (entry.length === 0) continue
    const normalized = path.normalize(entry).toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(path.normalize(entry))
  }

  return result
}

export function buildClasspath(entries: readonly string[]): string {
  return dedupeEntries(entries).join(CLASSPATH_SEPARATOR)
}

export const MAX_COMMAND_LINE = 32_767

export function commandLineLength(executable: string, args: readonly string[]): number {
  return executable.length + args.reduce((sum, arg) => sum + arg.length + 1, 0)
}
