import type { CrashCode, CrashFixId, CrashSuspect, CrashVerdict } from '@shared/types'

export interface CrashContext {
  exitCode?: number
}

export interface CrashAnalysis {
  code: CrashCode
  suspects: CrashSuspect[]
  fixes: CrashFixId[]
}

/**
 * Разбирает текст краш-репорта и выдаёт код вердикта + подозреваемые моды.
 * Локализованные тексты живут в рендере (i18n crash.*), здесь только факты.
 */
export function analyzeCrashReport(content: string, context: CrashContext = {}): CrashAnalysis {
  const text = content.slice(0, 200_000)
  const suspects = extractSuspects(text)

  if (/OutOfMemoryError|Out of memory|Could not reserve enough space|insufficient memory/i.test(text)) {
    return { code: 'OUT_OF_MEMORY', suspects: [], fixes: ['add-memory', 'reveal-report'] }
  }

  if (/UnsupportedClassVersionError|class file version/i.test(text)) {
    return { code: 'OLD_JAVA', suspects: [], fixes: ['reset-java', 'reveal-report'] }
  }

  if (/java\.lang\.UnsupportedOperationException:.*Java (runtime|version)|requires Java \d+/i.test(text)) {
    return { code: 'JAVA_MISMATCH', suspects: [], fixes: ['reset-java', 'reveal-report'] }
  }

  if (
    /Missing.*[Dd]ependenc|ModResolutionException|DependencyResolutionException|requires .* which is missing|mods that were not found|Mod '.*' requires/i.test(
      text
    )
  ) {
    return { code: 'MISSING_DEPENDENCY', suspects, fixes: ['reveal-report'] }
  }

  if (
    /ZipException|invalid LOC header|invalid CEN header|Zip file is empty|End of Central Directory|corrupt.*\.jar|cannot access.*\.jar/i.test(
      text
    )
  ) {
    return { code: 'BROKEN_MOD_FILE', suspects, fixes: ['reinstall-suspects', 'disable-suspects', 'reveal-report'] }
  }

  if (
    /Mixin (apply|prepare|audit).*fail|mixin.*failed|SpongePowered ASM|@Mixin target|org\.spongepowered\.asm\.mixin/i.test(
      text
    )
  ) {
    return { code: 'MOD_CONFLICT', suspects, fixes: ['disable-suspects', 'reveal-report'] }
  }

  if (/StackOverflowError/i.test(text)) {
    return { code: 'MOD_CONFLICT', suspects: suspects.length > 0 ? suspects : suspectsFromStackTop(text), fixes: ['disable-suspects', 'reveal-report'] }
  }

  if (
    /ClassNotFoundException|NoClassDefFoundError|NoSuchMethodError|NoSuchFieldError/i.test(text) &&
    suspects.length > 0
  ) {
    return { code: 'MOD_CONFLICT', suspects, fixes: ['disable-suspects', 'reveal-report'] }
  }

  if (
    /Pixel format not accelerated|GLFW error|Could not initialize GLFW|OpenGL|EXCEPTION_ACCESS_VIOLATION.*\.(dll)|nvoglv|ig9icd|atio6axx/i.test(
      text
    )
  ) {
    return { code: 'GRAPHICS_DRIVER', suspects: [], fixes: ['reveal-report'] }
  }

  if (/# A fatal error has been detected|EXCEPTION_ACCESS_VIOLATION|SIGSEGV|Internal Error/i.test(text)) {
    return { code: 'JVM_CRASH', suspects: [], fixes: ['verify-files', 'reveal-report'] }
  }

  if (
    /FileNotFoundException.*(assets|libraries|versions)|Failed to (load|download).*(version|client|library)|VERSION_NOT_FOUND|Couldn't load.*\.jar/i.test(
      text
    )
  ) {
    return { code: 'MISSING_FILES', suspects: [], fixes: ['verify-files', 'reveal-report'] }
  }

  const byExit = codeFromExit(context.exitCode)
  if (byExit) {
    return { code: byExit, suspects, fixes: byExit === 'EXIT_KILLED' ? [] : ['reveal-report'] }
  }

  return { code: 'UNKNOWN', suspects, fixes: ['reveal-report'] }
}

/** Вердикт только по коду выхода — когда краш-репорта нет. */
export function codeFromExit(exitCode: number | undefined): CrashCode | null {
  if (exitCode === undefined) return null
  const unsigned = exitCode >>> 0
  if (exitCode === 143 || exitCode === 130 || unsigned === 0xc000013a) return 'EXIT_KILLED'
  if (unsigned === 0xc0000005) return 'JVM_CRASH'
  if (unsigned === 0xc0000409) return 'GRAPHICS_DRIVER'
  return null
}

export function withReport(
  analysis: CrashAnalysis,
  report: { path?: string; text?: string; exitCode?: number }
): CrashVerdict {
  return {
    ...analysis,
    ...(report.exitCode !== undefined ? { exitCode: report.exitCode } : {}),
    ...(report.path ? { reportPath: report.path } : {}),
    ...(report.text ? { reportText: report.text } : {})
  }
}

const JAR_NAME = /([A-Za-z0-9_][A-Za-z0-9_+.~-]*\.jar)/gi
const MOD_ID = /(?:from mod|mod ["'«])\s*([a-z0-9][a-z0-9_-]{1,40})/gi
const MOD_ID_LINE = /^\s*Mod ID:\s*'?([a-z0-9_-]+)'?/gim
const FORGE_MOD = /Mod['’]?\s+([A-Za-z0-9_.-]+)['’]?\s+(?:is missing|requires|failed)/gi
const CAUSE_MOD = /\[([a-z0-9_-]{2,40})\]/gi

const NOISE = new Set(['client', 'server', 'common', 'minecraft', 'mc', 'java', 'realms', 'authlib', 'brigadier'])

function extractSuspects(text: string): CrashSuspect[] {
  const found = new Map<string, CrashSuspect>()

  const push = (title: string, fileHint: string): void => {
    const key = fileHint.toLowerCase()
    if (found.has(key) || found.size >= 5) return
    found.set(key, { title, fileHint })
  }

  for (const match of text.matchAll(MOD_ID_LINE)) {
    const id = (match[1] ?? '').toLowerCase()
    if (id && !NOISE.has(id)) push(id, id)
  }
  for (const match of text.matchAll(MOD_ID)) {
    const id = (match[1] ?? '').toLowerCase()
    if (id && !NOISE.has(id)) push(id, id)
  }
  for (const match of text.matchAll(FORGE_MOD)) {
    const id = (match[1] ?? '').toLowerCase()
    if (id && !NOISE.has(id)) push(id, id)
  }
  for (const match of text.matchAll(JAR_NAME)) {
    const jar = match[1] ?? ''
    const base = jar.toLowerCase()
    if (/(minecraft|client|libraries|natives|launchwrapper|authlib)/.test(base)) continue
    push(jar.replace(/\.jar$/i, ''), jar)
  }
  for (const match of text.matchAll(CAUSE_MOD)) {
    const id = (match[1] ?? '').toLowerCase()
    if (id && !NOISE.has(id) && !/^\d+$/.test(id)) push(id, id)
  }

  return [...found.values()]
}

function suspectsFromStackTop(text: string): CrashSuspect[] {
  // У StackOverflowError виноват обычно верхний повторяющийся фрейм: net.modid.Class.method
  const frames = [...text.matchAll(/^\s*at ([\w$.]+)\(/gim)]
    .map((match) => match[1] ?? '')
    .filter((frame) => frame.length > 0 && !frame.startsWith('java.') && !frame.startsWith('net.minecraft'))

  const counts = new Map<string, number>()
  for (const frame of frames.slice(0, 40)) {
    const top = frame.split('.').slice(0, 3).join('.')
    counts.set(top, (counts.get(top) ?? 0) + 1)
  }

  const [winner, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  if (!winner || (count ?? 0) < 3) return []
  return [{ title: winner, fileHint: winner }]
}
