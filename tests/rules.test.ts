import { describe, expect, it } from 'vitest'
import {
  currentRuleContext,
  evaluateRules,
  matchesFeatures,
  matchesOs,
  nativesClassifier,
  type Rule,
  type RuleContext
} from '@main/minecraft/rules'

const windows: RuleContext = {
  osName: 'windows',
  osVersion: '10.0.26100',
  osArch: 'x86_64',
  features: {}
}

const windowsArm: RuleContext = { ...windows, osArch: 'arm64' }
const linux: RuleContext = { ...windows, osName: 'linux', osVersion: '6.8.0' }
const osx: RuleContext = { ...windows, osName: 'osx', osVersion: '15.3' }

describe('evaluateRules', () => {
  it('без правил разрешает библиотеку', () => {
    expect(evaluateRules(undefined, windows)).toBe(true)
    expect(evaluateRules([], windows)).toBe(true)
  })

  it('allow без условий разрешает', () => {
    expect(evaluateRules([{ action: 'allow' }], windows)).toBe(true)
  })

  it('allow только для osx запрещает на windows', () => {
    const rules: Rule[] = [{ action: 'allow', os: { name: 'osx' } }]
    expect(evaluateRules(rules, osx)).toBe(true)
    expect(evaluateRules(rules, windows)).toBe(false)
  })

  it('allow всем + disallow для osx — классическая пара LWJGL', () => {
    const rules: Rule[] = [{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }]
    expect(evaluateRules(rules, windows)).toBe(true)
    expect(evaluateRules(rules, linux)).toBe(true)
    expect(evaluateRules(rules, osx)).toBe(false)
  })

  it('последнее подошедшее правило побеждает', () => {
    const rules: Rule[] = [
      { action: 'disallow', os: { name: 'windows' } },
      { action: 'allow', os: { name: 'windows' } }
    ]
    expect(evaluateRules(rules, windows)).toBe(true)
  })

  it('учитывает архитектуру', () => {
    const rules: Rule[] = [{ action: 'allow', os: { name: 'windows', arch: 'x86' } }]
    expect(evaluateRules(rules, windows)).toBe(false)
    expect(evaluateRules(rules, { ...windows, osArch: 'x86' })).toBe(true)
  })

  it('различает windows x86_64 и arm64', () => {
    const rules: Rule[] = [{ action: 'allow', os: { name: 'windows', arch: 'arm64' } }]
    expect(evaluateRules(rules, windowsArm)).toBe(true)
    expect(evaluateRules(rules, windows)).toBe(false)
  })

  it('сопоставляет версию ОС регулярным выражением', () => {
    const rules: Rule[] = [{ action: 'allow', os: { name: 'windows', version: '^10\\.' } }]
    expect(evaluateRules(rules, windows)).toBe(true)
    expect(evaluateRules(rules, { ...windows, osVersion: '6.1.7601' })).toBe(false)
  })

  it('не падает на битой регулярке в чужих метаданных', () => {
    const rules: Rule[] = [{ action: 'allow', os: { name: 'windows', version: '^10\\.(' } }]
    expect(evaluateRules(rules, windows)).toBe(false)
  })

  it('фича has_custom_resolution выключена по умолчанию', () => {
    const rules: Rule[] = [{ action: 'allow', features: { has_custom_resolution: true } }]
    expect(evaluateRules(rules, windows)).toBe(false)
    expect(evaluateRules(rules, { ...windows, features: { has_custom_resolution: true } })).toBe(true)
  })

  it('фича is_demo_user: явный false совпадает с отсутствием фичи', () => {
    const rules: Rule[] = [{ action: 'allow', features: { is_demo_user: false } }]
    expect(evaluateRules(rules, windows)).toBe(true)
  })

  it('комбинирует os и features', () => {
    const rules: Rule[] = [
      { action: 'allow', os: { name: 'windows' }, features: { is_quick_play_multiplayer: true } }
    ]
    expect(evaluateRules(rules, windows)).toBe(false)
    expect(
      evaluateRules(rules, { ...windows, features: { is_quick_play_multiplayer: true } })
    ).toBe(true)
  })

  it('несколько фич требуют совпадения всех', () => {
    const rules: Rule[] = [
      { action: 'allow', features: { is_demo_user: true, has_custom_resolution: true } }
    ]
    expect(evaluateRules(rules, { ...windows, features: { is_demo_user: true } })).toBe(false)
    expect(
      evaluateRules(rules, { ...windows, features: { is_demo_user: true, has_custom_resolution: true } })
    ).toBe(true)
  })
})

describe('matchesOs / matchesFeatures', () => {
  it('пустое условие подходит всегда', () => {
    expect(matchesOs(undefined, windows)).toBe(true)
    expect(matchesFeatures(undefined, windows)).toBe(true)
  })

  it('имя ОС сравнивается точно', () => {
    expect(matchesOs({ name: 'windows' }, windows)).toBe(true)
    expect(matchesOs({ name: 'windows' }, linux)).toBe(false)
  })
})

describe('nativesClassifier', () => {
  it('подставляет разрядность в ${arch}', () => {
    const natives = { windows: 'natives-windows-${arch}' }
    expect(nativesClassifier(natives, windows)).toBe('natives-windows-64')
    expect(nativesClassifier(natives, { ...windows, osArch: 'x86' })).toBe('natives-windows-32')
    expect(nativesClassifier(natives, windowsArm)).toBe('natives-windows-arm64')
  })

  it('возвращает undefined, если для ОС нет ключа', () => {
    expect(nativesClassifier({ osx: 'natives-macos' }, windows)).toBeUndefined()
    expect(nativesClassifier(undefined, windows)).toBeUndefined()
  })
})

describe('currentRuleContext', () => {
  it('переводит архитектуру Node в термины Mojang', () => {
    expect(currentRuleContext('x64', '10.0.26100').osArch).toBe('x86_64')
    expect(currentRuleContext('arm64', '10.0.26100').osArch).toBe('arm64')
    expect(currentRuleContext('ia32', '10.0.26100').osArch).toBe('x86')
  })

  it('всегда сообщает windows: лаунчер собирается только под неё', () => {
    expect(currentRuleContext('x64', '10.0.26100').osName).toBe('windows')
  })
})
