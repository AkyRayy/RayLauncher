import { describe, expect, it } from 'vitest'
import { jvmFlagsFor, listPresets, memoryForPreset } from '../src/main/perf/presets'

describe('memoryForPreset', () => {
  it('не душит слабые машины', () => {
    expect(memoryForPreset(4096, 'low')).toBe(1536)
    expect(memoryForPreset(16_384, 'low')).toBeLessThanOrEqual(2048)
  })

  it('держится четверти и половины ОЗУ в разумных границах', () => {
    expect(memoryForPreset(16_384, 'balanced')).toBe(4096)
    expect(memoryForPreset(8192, 'balanced')).toBe(2048)
    expect(memoryForPreset(65_536, 'balanced')).toBe(4096)
    expect(memoryForPreset(16_384, 'high')).toBe(8192)
    expect(memoryForPreset(131_072, 'high')).toBeLessThanOrEqual(16_384)
  })
})

describe('jvmFlagsFor', () => {
  it('отдаёт G1GC и свежие копии массивов', () => {
    for (const preset of ['low', 'balanced', 'high'] as const) {
      const flags = jvmFlagsFor(preset)
      expect(flags.some((flag) => flag.includes('UseG1GC'))).toBe(true)
      expect(jvmFlagsFor(preset)).not.toBe(flags)
    }
  })
})

describe('listPresets', () => {
  it('возвращает все три предустановки с памятью и флагами', () => {
    const presets = listPresets()
    expect(presets.map((preset) => preset.id)).toEqual(['low', 'balanced', 'high'])
    for (const preset of presets) {
      expect(preset.memoryMb).toBeGreaterThan(0)
      expect(preset.jvmArgs.length).toBeGreaterThan(0)
    }
  })
})
