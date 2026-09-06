export type RuleAction = 'allow' | 'disallow'

export interface RuleOs {
  name?: string
  version?: string
  arch?: string
}

export interface Rule {
  action: RuleAction
  os?: RuleOs
  features?: Record<string, boolean>
}

export interface RuleContext {
  osName: 'windows' | 'osx' | 'linux'
  osVersion: string
  osArch: 'x86' | 'x86_64' | 'arm64'
  features: Record<string, boolean>
}

export function currentRuleContext(
  arch: NodeJS.Architecture,
  release: string,
  features: Record<string, boolean> = {}
): RuleContext {
  return {
    osName: 'windows',
    osVersion: release,
    osArch: arch === 'arm64' ? 'arm64' : arch === 'ia32' ? 'x86' : 'x86_64',
    features
  }
}

export function matchesOs(os: RuleOs | undefined, context: RuleContext): boolean {
  if (!os) return true
  if (os.name !== undefined && os.name !== context.osName) return false
  if (os.arch !== undefined && os.arch !== context.osArch) return false
  if (os.version !== undefined) {
    let pattern: RegExp
    try {
      pattern = new RegExp(os.version)
    } catch {
      return false
    }
    if (!pattern.test(context.osVersion)) return false
  }
  return true
}

export function matchesFeatures(
  features: Record<string, boolean> | undefined,
  context: RuleContext
): boolean {
  if (!features) return true
  return Object.entries(features).every(
    ([key, expected]) => (context.features[key] ?? false) === expected
  )
}

export function evaluateRules(rules: Rule[] | undefined, context: RuleContext): boolean {
  if (!rules || rules.length === 0) return true

  let allowed = false
  for (const rule of rules) {
    if (!matchesOs(rule.os, context) || !matchesFeatures(rule.features, context)) continue
    allowed = rule.action === 'allow'
  }
  return allowed
}

export function nativesClassifier(
  natives: Record<string, string> | undefined,
  context: RuleContext
): string | undefined {
  const template = natives?.[context.osName]
  if (!template) return undefined
  const arch = context.osArch === 'x86' ? '32' : context.osArch === 'arm64' ? 'arm64' : '64'
  return template.replace('${arch}', arch)
}
