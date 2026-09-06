import { describe, expect, it } from 'vitest'
import { extractCrashReason } from '../src/main/minecraft/crashReport'

const REPORT = `---- Minecraft Crash Report ----
// Who set us up the TNT?

Time: 2026-09-06 12:33:01
Description: Rendering overlay

java.lang.NullPointerException: Cannot invoke "net.minecraft.client.Options.fov()" because "this.options" is null
\tat net.minecraft.client.renderer.GameRenderer.render(GameRenderer.java:1046)
`

describe('extractCrashReason', () => {
  it('склеивает описание и первую строку исключения', () => {
    const reason = extractCrashReason(REPORT)
    expect(reason.startsWith('Rendering overlay: java.lang.NullPointerException')).toBe(true)
  })

  it('обходится одним описанием, если исключения нет', () => {
    expect(extractCrashReason('Description: Initializing game\n')).toBe('Initializing game')
  })

  it('понимает отчёт виртуальной машины', () => {
    const reason = extractCrashReason('#\n# A fatal error has been detected\n# SIGSEGV\n')
    expect(reason).toContain('Сбой виртуальной машины Java')
  })

  it('не притворяется, что знает причину, когда её нет', () => {
    expect(extractCrashReason('пустой файл')).toBe(
      'Игра завершилась с ошибкой, причина в отчёте не указана'
    )
  })

  it('обрезает слишком длинную строку исключения', () => {
    const long = `Description: Ticking entity\n\njava.lang.IllegalStateException: ${'x'.repeat(400)}\n`
    expect(extractCrashReason(long).length).toBeLessThan(260)
  })
})
