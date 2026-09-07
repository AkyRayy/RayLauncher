import { describe, expect, it } from 'vitest'
import { analyzeCrashReport, codeFromExit, withReport } from '../src/main/minecraft/crashAnalyzer'

describe('analyzeCrashReport', () => {
  it('узнаёт нехватку памяти и советует добавить её', () => {
    const result = analyzeCrashReport('Description: Ticking entity\njava.lang.OutOfMemoryError: Java heap space\n')
    expect(result.code).toBe('OUT_OF_MEMORY')
    expect(result.fixes).toContain('add-memory')
  })

  it('отличает старую Java от неподходящей', () => {
    const old = analyzeCrashReport('java.lang.UnsupportedClassVersionError: class file version 65.0\n')
    expect(old.code).toBe('OLD_JAVA')
    expect(old.fixes).toContain('reset-java')

    const mismatch = analyzeCrashReport("Minecraft requires Java 21, but you run Java 17\n")
    expect(mismatch.code).toBe('JAVA_MISMATCH')
  })

  it('находит битую банку и предлагает переустановку', () => {
    const result = analyzeCrashReport(
      'Caused by: java.util.zip.ZipException: invalid LOC header (bad signature)\n\tat broken-mod-1.2.jar\n'
    )
    expect(result.code).toBe('BROKEN_MOD_FILE')
    expect(result.fixes[0]).toBe('reinstall-suspects')
    expect(result.suspects.some((suspect) => suspect.fileHint.includes('broken-mod-1.2.jar'))).toBe(true)
  })

  it('видит конфликты миксинов', () => {
    const result = analyzeCrashReport(
      'org.spongepowered.asm.mixin.transformer.throwables.MixinApplyError: Mixin apply failed\n\tat sodium-0.5.jar\n'
    )
    expect(result.code).toBe('MOD_CONFLICT')
    expect(result.fixes).toContain('disable-suspects')
  })

  it('узнаёт падение драйвера и JVM', () => {
    expect(analyzeCrashReport('Pixel format not accelerated\n').code).toBe('GRAPHICS_DRIVER')
    expect(analyzeCrashReport('# A fatal error has been detected\n# SIGSEGV\n').code).toBe('JVM_CRASH')
  })

  it('падает на код выхода, когда репорт пустой', () => {
    expect(analyzeCrashReport('непонятно что', { exitCode: 143 }).code).toBe('EXIT_KILLED')
    expect(analyzeCrashReport('непонятно что', {}).code).toBe('UNKNOWN')
  })
})

describe('codeFromExit', () => {
  it('маппит сигналы и NTSTATUS', () => {
    expect(codeFromExit(143)).toBe('EXIT_KILLED')
    expect(codeFromExit(130)).toBe('EXIT_KILLED')
    expect(codeFromExit(0xc0000005)).toBe('JVM_CRASH')
    expect(codeFromExit(0xc0000409)).toBe('GRAPHICS_DRIVER')
    expect(codeFromExit(1)).toBeNull()
    expect(codeFromExit(undefined)).toBeNull()
  })
})

describe('withReport', () => {
  it('приклеивает путь и выход без лишних полей', () => {
    const verdict = withReport(
      { code: 'UNKNOWN', suspects: [], fixes: ['reveal-report'] },
      { path: '/tmp/crash.txt', exitCode: 1 }
    )
    expect(verdict.reportPath).toBe('/tmp/crash.txt')
    expect(verdict.exitCode).toBe(1)
    expect('reportText' in verdict).toBe(false)
  })
})
