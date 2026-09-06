import { describe, expect, it } from 'vitest'
import { pickBestVersion, resolveInstall, versionMatches, type VersionSource } from '@main/mods/resolver'
import { RayError } from '@shared/errors'
import type { ModDependency, ModVersionInfo } from '@shared/types'

function version(
  projectId: string,
  options: Partial<ModVersionInfo> & { dependencies?: ModDependency[] } = {}
): ModVersionInfo {
  return {
    source: 'modrinth',
    versionId: `${projectId}-v1`,
    projectId,
    title: projectId,
    versionNumber: '1.0.0',
    gameVersions: ['26.2'],
    loaders: ['fabric'],
    releaseType: 'release',
    datePublished: '2026-08-01T00:00:00Z',
    downloadUrl: `https://cdn.modrinth.com/${projectId}.jar`,
    fileName: `${projectId}.jar`,
    size: 1024,
    sha1: 'a'.repeat(40),
    dependencies: [],
    ...options
  }
}

function sourceOf(versions: ModVersionInfo[]): VersionSource {
  const byProject = new Map(versions.map((item) => [item.projectId, item]))
  const byVersion = new Map(versions.map((item) => [item.versionId, item]))

  return {
    bestVersion: async (projectId) => byProject.get(projectId) ?? null,
    versionById: async (versionId) => byVersion.get(versionId) ?? null,
    projectTitle: async (projectId) => byProject.get(projectId)?.title ?? projectId
  }
}

describe('resolveInstall', () => {
  it('тянет обязательную зависимость', async () => {
    const fabricApi = version('fabric-api', { title: 'Fabric API' })
    const sodium = version('sodium', {
      title: 'Sodium',
      dependencies: [{ kind: 'required', projectId: 'fabric-api' }]
    })

    const plan = await resolveInstall(sodium, sourceOf([fabricApi]), { installedProjectIds: [] })

    expect(plan.primary).toBe(sodium)
    expect(plan.dependencies.map((item) => item.projectId)).toEqual(['fabric-api'])
    expect(plan.incompatible).toEqual([])
    expect(plan.missing).toEqual([])
  })

  it('проходит цепочку зависимостей вглубь', async () => {
    const c = version('c')
    const b = version('b', { dependencies: [{ kind: 'required', projectId: 'c' }] })
    const a = version('a', { dependencies: [{ kind: 'required', projectId: 'b' }] })

    const plan = await resolveInstall(a, sourceOf([b, c]), { installedProjectIds: [] })

    expect(plan.dependencies.map((item) => item.projectId)).toEqual(['b', 'c'])
  })

  it('не ставит уже установленное', async () => {
    const fabricApi = version('fabric-api')
    const sodium = version('sodium', {
      dependencies: [{ kind: 'required', projectId: 'fabric-api' }]
    })

    const plan = await resolveInstall(sodium, sourceOf([fabricApi]), {
      installedProjectIds: ['fabric-api']
    })

    expect(plan.dependencies).toEqual([])
  })

  it('пропускает необязательные и встроенные зависимости', async () => {
    const optional = version('optional-mod')
    const embedded = version('embedded-lib')
    const mod = version('mod', {
      dependencies: [
        { kind: 'optional', projectId: 'optional-mod' },
        { kind: 'embedded', projectId: 'embedded-lib' }
      ]
    })

    const plan = await resolveInstall(mod, sourceOf([optional, embedded]), {
      installedProjectIds: []
    })

    expect(plan.dependencies).toEqual([])
    expect(plan.missing).toEqual([])
  })

  it('называет конфликтующий мод и не тянет его в план', async () => {
    const rival = version('optifine', { title: 'OptiFine' })
    const sodium = version('sodium', {
      dependencies: [{ kind: 'incompatible', projectId: 'optifine' }]
    })

    const plan = await resolveInstall(sodium, sourceOf([rival]), { installedProjectIds: [] })

    expect(plan.incompatible).toEqual(['OptiFine'])
    expect(plan.dependencies).toEqual([])
  })

  it('складывает ненайденные зависимости в missing', async () => {
    const mod = version('mod', {
      dependencies: [{ kind: 'required', projectId: 'ghost-lib' }]
    })

    const plan = await resolveInstall(mod, sourceOf([]), { installedProjectIds: [] })

    expect(plan.missing).toEqual(['ghost-lib'])
    expect(plan.dependencies).toEqual([])
  })

  it('не зацикливается на A → B → A', async () => {
    const a = version('a', { dependencies: [{ kind: 'required', projectId: 'b' }] })
    const b = version('b', { dependencies: [{ kind: 'required', projectId: 'a' }] })

    const plan = await resolveInstall(a, sourceOf([a, b]), { installedProjectIds: [] })

    expect(plan.dependencies.map((item) => item.projectId)).toEqual(['b'])
  })

  it('бросает MOD_DEPENDENCY_CYCLE, когда цепочка глубже предела', async () => {
    const chain = ['l1', 'l2', 'l3', 'l4'].map((id, index, all) => {
      const next = all[index + 1]
      return version(id, next ? { dependencies: [{ kind: 'required', projectId: next }] } : {})
    })
    const root = version('root', { dependencies: [{ kind: 'required', projectId: 'l1' }] })

    const attempt = resolveInstall(root, sourceOf(chain), {
      installedProjectIds: [],
      maxDepth: 2
    })

    await expect(attempt).rejects.toBeInstanceOf(RayError)
    await expect(attempt).rejects.toMatchObject({ code: 'MOD_DEPENDENCY_CYCLE' })
  })

  it('разрешает зависимость, заданную конкретной версией', async () => {
    const pinned = version('lib', { versionId: 'lib-exact' })
    const mod = version('mod', { dependencies: [{ kind: 'required', versionId: 'lib-exact' }] })

    const plan = await resolveInstall(mod, sourceOf([pinned]), { installedProjectIds: [] })

    expect(plan.dependencies.map((item) => item.versionId)).toEqual(['lib-exact'])
  })

  it('не дублирует зависимость, нужную двум модам сразу', async () => {
    const lib = version('lib')
    const mid = version('mid', { dependencies: [{ kind: 'required', projectId: 'lib' }] })
    const root = version('root', {
      dependencies: [
        { kind: 'required', projectId: 'lib' },
        { kind: 'required', projectId: 'mid' }
      ]
    })

    const plan = await resolveInstall(root, sourceOf([lib, mid]), { installedProjectIds: [] })

    expect(plan.dependencies.map((item) => item.projectId)).toEqual(['lib', 'mid'])
  })
})

describe('versionMatches', () => {
  it('требует совпадения версии игры', () => {
    const mod = version('mod', { gameVersions: ['26.1'] })
    expect(versionMatches(mod, '26.2', 'fabric')).toBe(false)
    expect(versionMatches(mod, '26.1', 'fabric')).toBe(true)
  })

  it('quilt принимает моды fabric, а fabric quilt-моды — нет', () => {
    const fabricMod = version('mod', { loaders: ['fabric'] })
    const quiltMod = version('mod', { loaders: ['quilt'] })

    expect(versionMatches(fabricMod, '26.2', 'quilt')).toBe(true)
    expect(versionMatches(quiltMod, '26.2', 'fabric')).toBe(false)
  })

  it('не путает forge и neoforge', () => {
    const forgeMod = version('mod', { loaders: ['forge'] })
    expect(versionMatches(forgeMod, '26.2', 'neoforge')).toBe(false)
    expect(versionMatches(forgeMod, '26.2', 'forge')).toBe(true)
  })

  it('версия без списка загрузчиков подходит любому', () => {
    const anyLoader = version('mod', { loaders: [] })
    expect(versionMatches(anyLoader, '26.2', 'neoforge')).toBe(true)
  })
})

describe('pickBestVersion', () => {
  it('предпочитает релиз бете и альфе', () => {
    const alpha = version('mod', {
      versionId: 'alpha',
      releaseType: 'alpha',
      datePublished: '2026-09-01T00:00:00Z'
    })
    const beta = version('mod', {
      versionId: 'beta',
      releaseType: 'beta',
      datePublished: '2026-08-20T00:00:00Z'
    })
    const release = version('mod', {
      versionId: 'release',
      releaseType: 'release',
      datePublished: '2026-07-01T00:00:00Z'
    })

    expect(pickBestVersion([alpha, beta, release], '26.2', 'fabric')?.versionId).toBe('release')
  })

  it('среди равных берёт свежую по дате, а не по номеру', () => {
    const older = version('mod', {
      versionId: 'v10',
      versionNumber: '10.0',
      datePublished: '2026-05-01T00:00:00Z'
    })
    const newer = version('mod', {
      versionId: 'v2',
      versionNumber: '2.0',
      datePublished: '2026-08-01T00:00:00Z'
    })

    expect(pickBestVersion([older, newer], '26.2', 'fabric')?.versionId).toBe('v2')
  })

  it('возвращает null, когда подходящей версии нет', () => {
    const mod = version('mod', { gameVersions: ['1.20.1'] })
    expect(pickBestVersion([mod], '26.2', 'fabric')).toBeNull()
  })

  it('отбрасывает чужой загрузчик до сортировки', () => {
    const forgeOnly = version('mod', { versionId: 'forge', loaders: ['forge'] })
    const fabricBeta = version('mod', {
      versionId: 'fabric-beta',
      loaders: ['fabric'],
      releaseType: 'beta'
    })

    expect(pickBestVersion([forgeOnly, fabricBeta], '26.2', 'fabric')?.versionId).toBe('fabric-beta')
  })
})
