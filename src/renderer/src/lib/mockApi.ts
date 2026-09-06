import type { RayApi, Unsubscribe } from '@shared/ipc'
import type {
  AppInfo,
  LoaderKind,
  Profile,
  PublicAccount,
  GameState,
  DownloadTask,
  JavaRuntimeInfo,
  LogLine,
  ModEntry,
  ModSearchHit,
  ModVersionInfo,
  NewsItem,
  Settings,
  VersionCatalog,
  VersionSummary,
  WindowState
} from '@shared/types'
import { DEFAULT_MS_CLIENT_ID } from '@shared/constants'

const STORAGE_KEY = 'ray.mock.settings'

const defaults: Settings = {
  language: 'ru',
  theme: 'dark',
  accent: 'amber',
  backgroundId: 'night',
  backgroundCustom: '',
  backgroundBlur: 0,
  backgroundDim: 0.35,
  backgroundMotion: true,
  density: 'comfortable',
  sidebarCollapsed: false,
  gamesDir: 'C:\\Users\\Player\\AppData\\Roaming\\RayLauncher\\games',
  concurrency: 8,
  speedLimitKbps: 0,
  defaultMemoryMb: 4096,
  jvmArgs: ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50'],
  closeLauncherOnLaunch: false,
  minimizeToTray: true,
  curseforgeEnabled: false,
  curseforgeKeySet: false,
  msClientId: DEFAULT_MS_CLIENT_ID,
  offlineSkins: true,
  activeProfileId: '',
  guestNickname: 'Player',
  lastVersionId: '26.2',
  updateChannel: 'stable',
  telemetry: false,
  onboarded: true
}

export function createMockApi(): RayApi {
  let settings: Settings = load()
  const tasks = new Map<string, DownloadTask>()
  const listeners = new Map<string, Set<(payload: never) => void>>()

  const emit = (channel: string, payload: unknown): void => {
    for (const listener of listeners.get(channel) ?? []) {
      ;(listener as (value: unknown) => void)(payload)
    }
  }

  const on = (channel: string) => (listener: (payload: never) => void): Unsubscribe => {
    const set = listeners.get(channel) ?? new Set()
    set.add(listener)
    listeners.set(channel, set)
    return () => set.delete(listener)
  }

  const windowState: WindowState = { maximized: false, focused: true }

  const info: AppInfo = {
    version: '1.0.0',
    electron: '44.2.0',
    chrome: '146.0.0.0',
    node: '24.9.0',
    platform: 'win32',
    arch: 'x64',
    userDataDir: 'C:\\Users\\Player\\AppData\\Roaming\\RayLauncher',
    gamesDir: settings.gamesDir,
    logsDir: 'C:\\Users\\Player\\AppData\\Roaming\\RayLauncher\\logs',
    totalMemoryMb: 16_384,
    oneDriveWarning: false
  }

  const profiles: Profile[] = [
    mockProfile('Ванильная 26.2', '26.2', { kind: 'vanilla' }),
    mockProfile('Fabric-сборка', '1.21.4', { kind: 'fabric', version: '0.17.2' })
  ]

  const accounts: PublicAccount[] = [
    mockAccount('microsoft', 'RayDemo'),
    mockAccount('guest', 'Player')
  ]
  let activeAccountId: string | null = accounts[0]?.id ?? null

  const startedAt = Date.now()
  const log: LogLine[] = [
    line(startedAt, 'info', 'RayLauncher 1.0.0 запускается'),
    line(startedAt + 12, 'info', 'Данные: C:\\Users\\Player\\AppData\\Roaming\\RayLauncher'),
    line(startedAt + 14, 'info', 'Игры: C:\\Users\\Player\\AppData\\Roaming\\RayLauncher\\games'),
    line(startedAt + 96, 'debug', 'ipc settings:get ok 1 мс'),
    line(startedAt + 130, 'info', 'Главное окно показано'),
    line(startedAt + 480, 'warn', 'Браузерный режим: данные показаны из мок-адаптера, main-процесс не запущен')
  ]

  return {
    app: { info: async () => ({ ...info, gamesDir: settings.gamesDir }) },
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => {
        windowState.maximized = !windowState.maximized
        emit('window:state', { ...windowState })
        return { ...windowState }
      },
      close: async () => undefined,
      state: async () => ({ ...windowState })
    },
    settings: {
      get: async () => settings,
      patch: async (patch) => {
        settings = { ...settings, ...patch }
        save(settings)
        emit('settings:changed', settings)
        return settings
      },
      reset: async () => {
        settings = { ...defaults }
        save(settings)
        emit('settings:changed', settings)
        return settings
      }
    },
    background: {
      choose: async () => null,
      current: async () => null,
      clear: async () => {
        save({ ...load(), backgroundId: 'night', backgroundCustom: '' })
      }
    },
    system: {
      openExternal: async () => undefined,
      openFolder: async () => undefined,
      chooseDirectory: async () => ({ path: 'D:\\Games\\RayLauncher' })
    },
    logs: {
      tail: async (limit) => log.slice(-limit),
      export: async () => ({ path: null })
    },
    versions: {
      list: async () => catalog
    },
    java: {
      list: async () => javaRuntimes
    },
    install: {
      version: async (versionId) => {
        await simulateInstall(versionId, emit, tasks)
        const target = catalog.versions.find((item) => item.id === versionId)
        if (target) target.installed = true
        return { versionId, javaComponent: 'java-runtime-epsilon' }
      },
      cancel: async () => {
        return undefined
      }
    },
    downloads: {
      list: async () => [...tasks.values()],
      pause: async (taskId) => patchTask(tasks, taskId, { state: 'paused' }, emit),
      resume: async (taskId) => patchTask(tasks, taskId, { state: 'running' }, emit),
      cancel: async (taskId) => {
        tasks.delete(taskId)
      },
      retry: async (taskId) => patchTask(tasks, taskId, { state: 'queued', received: 0 }, emit),
      clearFinished: async () => {
        for (const [id, task] of tasks) {
          if (task.state === 'done' || task.state === 'error') tasks.delete(id)
        }
      },
      reveal: async () => undefined
    },
    profiles: {
      list: async () => profiles.map((profile) => ({ ...profile })),
      get: async (profileId) => {
        const found = profiles.find((item) => item.id === profileId)
        if (!found) throw new Error('Профиль не найден')
        return found
      },
      create: async (input) => {
        const profile = mockProfile(input.name, input.gameVersion, input.loader)
        if (input.memory) profile.memory = input.memory
        profiles.push(profile)
        emit('profiles:changed', profiles)
        return profile
      },
      update: async ({ profileId, patch }) => {
        const found = profiles.find((item) => item.id === profileId)
        if (!found) throw new Error('Профиль не найден')
        Object.assign(found, patch, { updated: Date.now() })
        emit('profiles:changed', profiles)
        return found
      },
      duplicate: async (profileId) => {
        const found = profiles.find((item) => item.id === profileId)
        if (!found) throw new Error('Профиль не найден')
        const copy = mockProfile(`${found.name} (копия)`, found.gameVersion, found.loader)
        profiles.push(copy)
        emit('profiles:changed', profiles)
        return copy
      },
      remove: async ({ profileId }) => {
        const index = profiles.findIndex((item) => item.id === profileId)
        if (index >= 0) profiles.splice(index, 1)
        emit('profiles:changed', profiles)
      },
      install: async ({ profileId }) => {
        const found = profiles.find((item) => item.id === profileId)
        await simulateInstall(found?.gameVersion ?? '26.2', emit, tasks)
        return { versionId: found?.gameVersion ?? '26.2', javaComponent: 'java-runtime-epsilon' }
      },
      launch: async (profileId) => {
        const found = profiles.find((item) => item.id === profileId)
        await simulateInstall(found?.gameVersion ?? '26.2', emit, tasks)
        return simulateSession(found?.gameVersion ?? '26.2', found?.name ?? 'Player', emit, profileId)
      },
      openFolder: async () => undefined,
      loaderVersions: async ({ kind }) => {
        await delay(400)
        if (kind === 'vanilla') return []
        const samples: Record<string, string[]> = {
          fabric: ['0.17.2', '0.17.1', '0.16.14'],
          quilt: ['0.29.1', '0.28.0'],
          forge: ['1.20.1-47.4.6', '1.20.1-47.4.0'],
          neoforge: ['21.1.209', '21.1.200', '21.1.180-beta']
        }
        return (samples[kind] ?? []).map((id, index) => ({
          id,
          stable: !id.includes('beta'),
          recommended: index === 0
        }))
      }
    },
    accounts: {
      list: async () => accounts.map((account) => ({ ...account })),
      active: async () => activeAccountId,
      setActive: async (accountId) => {
        activeAccountId = accountId
        emit('accounts:changed', accounts)
      },
      remove: async (accountId) => {
        const index = accounts.findIndex((item) => item.id === accountId)
        if (index >= 0) accounts.splice(index, 1)
        if (activeAccountId === accountId) activeAccountId = accounts[0]?.id ?? null
        emit('accounts:changed', accounts)
      },
      addGuest: async (nickname) => {
        const account = mockAccount('guest', nickname)
        accounts.push(account)
        activeAccountId ??= account.id
        emit('accounts:changed', accounts)
        return account
      },
      guestNicknames: async () => ['Player', 'Notch', 'Steve'],
      signInMicrosoft: async () => {
        await delay(1200)
        const account = mockAccount('microsoft', 'RayDemo')
        accounts.push(account)
        activeAccountId ??= account.id
        emit('accounts:changed', accounts)
        return account
      },
      cancelSignIn: async () => undefined,
      signInYggdrasil: async ({ username, serverName }) => {
        await delay(700)
        const account = mockAccount('yggdrasil', username)
        account.yggdrasil = { apiRoot: 'https://example.com/api/yggdrasil', serverName: serverName ?? 'example.com' }
        accounts.push(account)
        activeAccountId ??= account.id
        emit('accounts:changed', accounts)
        return { pendingId: null, profiles: [], account }
      },
      chooseYggdrasilProfile: async ({ profileId }) => {
        const found = accounts.find((item) => item.id === profileId)
        return found ?? mockAccount('yggdrasil', 'Profile')
      },
      refresh: async (accountId) => {
        const found = accounts.find((item) => item.id === accountId)
        if (!found) throw new Error('Аккаунт не найден')
        found.expired = false
        found.expiresAt = Date.now() + 86_400_000
        emit('accounts:changed', accounts)
        return found
      },
      skin: async (accountId) => {
        const found = accounts.find((item) => item.id === accountId)
        return { dataUrl: demoSkin(found?.username ?? 'Player'), variant: found?.skin?.variant ?? 'classic' }
      },
      importSkin: async ({ accountId, variant }) => {
        const found = accounts.find((item) => item.id === accountId)
        return { dataUrl: demoSkin(found?.username ?? 'Player'), variant }
      }
    },
    mods: {
      search: async ({ query, offset = 0, limit = 20 }) => {
        await delay(320)
        const filtered = demoHits.filter((hit) =>
          query.length === 0 ? true : hit.title.toLowerCase().includes(query.toLowerCase())
        )
        return {
          hits: filtered.slice(offset, offset + limit).map((hit) => ({
            ...hit,
            installed: mockMods.some((mod) => mod.projectId === hit.projectId)
          })),
          total: filtered.length,
          offset
        }
      },
      project: async ({ projectId }) => ({
        title: demoHits.find((hit) => hit.projectId === projectId)?.title ?? projectId,
        body: 'Описание проекта приходит из Modrinth в виде Markdown и очищается sanitize-html.',
        links: { source: 'https://github.com', issues: 'https://github.com/issues' }
      }),
      versions: async ({ projectId }) => [demoVersion(projectId, '1.0.3'), demoVersion(projectId, '1.0.2')],
      plan: async () => ({ dependencies: [], incompatible: [], missing: [] }),
      install: async ({ profileId, version }) => {
        await delay(600)
        const entry = mockModEntry(profileId, version)
        mockMods.push(entry)
        emit('mods:changed', { profileId, mods: mockMods })
        return [entry]
      },
      remove: async ({ modId }) => {
        const index = mockMods.findIndex((mod) => mod.id === modId)
        const removed = mockMods[index]
        if (index >= 0) mockMods.splice(index, 1)
        if (removed) emit('mods:changed', { profileId: removed.profileId, mods: mockMods })
      },
      toggle: async ({ modId, enabled }) => {
        const found = mockMods.find((mod) => mod.id === modId)
        if (!found) throw new Error('Мод не найден')
        found.enabled = enabled
        emit('mods:changed', { profileId: found.profileId, mods: mockMods })
        return found
      },
      update: async ({ modId, version }) => {
        const found = mockMods.find((mod) => mod.id === modId)
        if (!found) throw new Error('Мод не найден')
        found.versionId = version.versionId
        found.fileName = version.fileName
        emit('mods:changed', { profileId: found.profileId, mods: mockMods })
        return found
      },
      list: async (profileId) => mockMods.filter((mod) => mod.profileId === profileId),
      scan: async () => [],
      updates: async (profileId) =>
        mockMods
          .filter((mod) => mod.profileId === profileId)
          .slice(0, 1)
          .map((mod) => ({
            modId: mod.id,
            title: mod.title,
            currentVersion: mod.versionId,
            next: demoVersion(mod.projectId, '1.1.0')
          })),
      updateAll: async () => ({ updated: 1, total: 1 }),
      openFolder: async () => undefined,
      importPack: async () => null,
      setCurseforgeKey: async () => undefined,
      curseforgeReady: async () => false
    },
    news: {
      list: async () => {
        await delay(400)
        return { items: demoNews, fetchedAt: Date.now(), fromCache: false }
      },
      openReleases: async () => undefined
    },
    updates: {
      state: async () => ({ phase: 'up-to-date' as const, version: '1.0.0', supported: false }),
      check: async () => {
        await delay(700)
        return { phase: 'up-to-date' as const, version: '1.0.0', supported: false }
      },
      download: async () => ({ phase: 'idle' as const, supported: false }),
      install: async () => undefined
    },
    game: {
      launch: async ({ versionId, nickname }) => {
        await simulateInstall(versionId, emit, tasks)
        return simulateSession(versionId, nickname, emit)
      },
      stop: async (profileId) => {
        stopSimulation(profileId, emit)
      },
      state: async () => mockGameState,
      revealCrash: async () => undefined
    },
    on: {
      'settings:changed': on('settings:changed'),
      'window:state': on('window:state'),
      'launcher:log': on('launcher:log'),
      'download:progress': on('download:progress'),
      'install:stage': on('install:stage'),
      'game:state': on('game:state'),
      'game:log': on('game:log'),
      'accounts:changed': on('accounts:changed'),
      'profiles:changed': on('profiles:changed'),
      'mods:changed': on('mods:changed'),
      'update:state': on('update:state')
    } as RayApi['on']
  }
}

const demoHits: ModSearchHit[] = [
  {
    source: 'modrinth',
    projectId: 'AANobbMI',
    slug: 'sodium',
    title: 'Sodium',
    description: 'Переписанный рендер: больше кадров и меньше нагрузка на видеокарту.',
    downloads: 48_300_000,
    categories: ['optimization'],
    updated: '2026-08-14T10:12:00Z'
  },
  {
    source: 'modrinth',
    projectId: 'gvQqBUqZ',
    slug: 'lithium',
    title: 'Lithium',
    description: 'Оптимизация серверной логики без изменений в поведении игры.',
    downloads: 31_900_000,
    categories: ['optimization'],
    updated: '2026-08-02T09:40:00Z'
  },
  {
    source: 'modrinth',
    projectId: 'P7dR8mSH',
    slug: 'fabric-api',
    title: 'Fabric API',
    description: 'Базовые хуки, от которых зависит большинство модов Fabric.',
    downloads: 62_100_000,
    categories: ['library'],
    updated: '2026-08-28T18:05:00Z'
  },
  {
    source: 'modrinth',
    projectId: 'mOgUt4GM',
    slug: 'modmenu',
    title: 'Mod Menu',
    description: 'Список установленных модов и их настройки прямо в главном меню.',
    downloads: 27_400_000,
    categories: ['utility'],
    updated: '2026-07-19T12:30:00Z'
  }
]

const mockMods: ModEntry[] = []

function demoVersion(projectId: string, versionNumber: string): ModVersionInfo {
  const hit = demoHits.find((item) => item.projectId === projectId)
  return {
    source: 'modrinth',
    versionId: `${projectId}-${versionNumber}`,
    projectId,
    title: hit?.title ?? projectId,
    versionNumber,
    gameVersions: ['26.2', '26.1'],
    loaders: ['fabric', 'quilt'],
    releaseType: 'release',
    datePublished: '2026-08-14T10:12:00Z',
    downloadUrl: `https://cdn.modrinth.com/data/${projectId}/versions/${versionNumber}/file.jar`,
    fileName: `${hit?.slug ?? projectId}-${versionNumber}.jar`,
    size: 812_000,
    sha1: '0'.repeat(40),
    dependencies: []
  }
}

function mockModEntry(profileId: string, version: ModVersionInfo): ModEntry {
  return {
    id: `m-${Math.random().toString(16).slice(2, 10)}`,
    profileId,
    source: version.source,
    projectId: version.projectId,
    versionId: version.versionId,
    title: version.title,
    slug: version.projectId,
    fileName: version.fileName,
    filePath: `C:\\RayLauncher\\instances\\${profileId}\\mods\\${version.fileName}`,
    sha1: version.sha1,
    size: version.size,
    enabled: true,
    installedAt: Date.now()
  }
}

const demoNews: NewsItem[] = [
  {
    id: 'release-demo',
    source: 'launcher',
    title: 'RayLauncher 1.0.0',
    summary: 'Первая публичная версия: профили-инстансы, моды Modrinth и запуск без сторонних библиотек.',
    date: '2026-09-01T00:00:00.000Z',
    category: 'Обновление лаунчера',
    bodyHtml:
      '<h3>Что нового</h3><ul><li>Профили с Fabric, Forge, NeoForge и Quilt</li><li>Каталог модов с разбором зависимостей</li><li>Вход через Microsoft, гостя и свой Yggdrasil</li></ul>'
  },
  {
    id: 'mc-demo-1',
    source: 'minecraft',
    title: 'Our next drop has a name',
    summary:
      'Следующее обновление называется Wilderness Bound: собирайте припасы и готовьтесь к походу в лес.',
    date: '2026-09-05T00:00:00.000Z',
    category: 'Minecraft: Java Edition',
    link: 'https://www.minecraft.net/article/drop-3-2026-name-announce'
  },
  {
    id: 'mc-demo-2',
    source: 'minecraft',
    title: 'Snapshot 26.3-pre-2',
    summary: 'Предрелизная сборка с исправлениями освещения и новой генерацией пещер.',
    date: '2026-08-27T00:00:00.000Z',
    category: 'Minecraft: Java Edition',
    link: 'https://www.minecraft.net/article/minecraft-snapshot'
  }
]

function mockProfile(
  name: string,
  gameVersion: string,
  loader: { kind: LoaderKind; version?: string }
): Profile {
  const now = Date.now()
  return {
    id: `p-${Math.random().toString(16).slice(2, 10)}`,
    name,
    gameVersion,
    loader,
    java: { mode: 'auto' },
    memory: { auto: true, minMb: 2048, maxMb: 4096 },
    jvmArgs: [],
    gameArgs: [],
    offlineSkins: true,
    created: now,
    updated: now
  }
}

function mockAccount(kind: PublicAccount['kind'], username: string): PublicAccount {
  const uuid = [...username].reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) >>> 0, 7)
    .toString(16)
    .padStart(8, '0')
    .repeat(4)
    .slice(0, 32)

  return {
    id: `${kind}-${uuid.slice(0, 12)}`,
    kind,
    username,
    uuid,
    createdAt: Date.now() - 86_400_000,
    lastUsedAt: Date.now(),
    expired: false,
    ...(kind === 'guest' ? {} : { expiresAt: Date.now() + 86_400_000 }),
    skin: { url: '', variant: 'classic', hash: uuid.slice(0, 40) }
  }
}

function demoSkin(seed: string): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return null

  const hue = [...seed].reduce((sum, char) => sum + char.codePointAt(0)!, 0) % 360
  context.clearRect(0, 0, 64, 64)

  const fill = (x: number, y: number, w: number, h: number, lightness: number): void => {
    context.fillStyle = `hsl(${hue} 42% ${lightness}%)`
    context.fillRect(x, y, w, h)
  }

  fill(0, 0, 64, 16, 62)
  fill(16, 16, 24, 16, 46)
  fill(40, 16, 16, 16, 54)
  fill(0, 16, 16, 16, 38)
  fill(8, 8, 8, 8, 70)
  context.fillStyle = '#1c1c1e'
  context.fillRect(10, 11, 2, 2)
  context.fillRect(14, 11, 2, 2)

  return canvas.toDataURL('image/png')
}

function line(time: number, level: LogLine['level'], text: string): LogLine {
  return { source: 'launcher', level, time, text }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

function save(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    return
  }
}

const CATALOG_SAMPLE: Array<[string, VersionSummary['type'], string, boolean]> = [
  ['26.3-pre-2', 'snapshot', '2026-09-02T10:12:00+00:00', false],
  ['26.3-pre-1', 'snapshot', '2026-08-27T09:40:00+00:00', false],
  ['26.2', 'release', '2026-06-16T12:03:33+00:00', true],
  ['26.1.2', 'release', '2026-05-19T11:20:14+00:00', false],
  ['26.1.1', 'release', '2026-04-28T08:55:02+00:00', false],
  ['26.1', 'release', '2026-04-14T10:05:41+00:00', false],
  ['1.21.11', 'release', '2025-12-02T13:31:07+00:00', false],
  ['1.21.4', 'release', '2024-12-03T10:12:57+00:00', false],
  ['1.20.1', 'release', '2023-06-12T13:25:51+00:00', false],
  ['1.16.5', 'release', '2021-01-14T16:05:32+00:00', false],
  ['1.12.2', 'release', '2017-09-18T08:39:46+00:00', false],
  ['1.7.10', 'release', '2014-05-14T17:29:23+00:00', false]
]

const catalog: VersionCatalog = {
  latestRelease: '26.2',
  latestSnapshot: '26.3-pre-2',
  fetchedAt: Date.now(),
  fromCache: false,
  versions: CATALOG_SAMPLE.map(([id, type, releaseTime, installed]) => ({
    id,
    type,
    releaseTime,
    complianceLevel: 1,
    installed
  }))
}

const javaRuntimes: JavaRuntimeInfo[] = [
  { component: 'jre-legacy', majorVersion: 8, installed: false },
  { component: 'java-runtime-alpha', majorVersion: 16, installed: false },
  { component: 'java-runtime-gamma', majorVersion: 17, installed: false },
  { component: 'java-runtime-delta', majorVersion: 21, installed: true, path: 'games\\jre\\java-runtime-delta\\bin\\java.exe' },
  { component: 'java-runtime-epsilon', majorVersion: 25, installed: true, path: 'games\\jre\\java-runtime-epsilon\\bin\\java.exe' }
]

async function simulateInstall(
  versionId: string,
  emit: (channel: string, payload: unknown) => void,
  tasks: Map<string, DownloadTask>
): Promise<void> {
  const stages: Array<{ stage: string; label: (step: number) => string; files: number; bytes: number }> = [
    { stage: 'libraries', label: (step) => `Скачиваю библиотеки · ${step} из 88`, files: 88, bytes: 92_000_000 },
    { stage: 'assets', label: (step) => `Скачиваю ресурсы · ${step} из 5057`, files: 5057, bytes: 410_000_000 },
    { stage: 'java', label: () => 'Ставлю Java 25', files: 411, bytes: 105_080_003 }
  ]

  const totalBytes = stages.reduce((sum, stage) => sum + stage.bytes, 0)
  let bytesDone = 0

  for (const stage of stages) {
    for (let step = 1; step <= 12; step += 1) {
      await delay(90)
      bytesDone += stage.bytes / 12
      const files = Math.round((stage.files / 12) * step)

      emit('install:stage', {
        versionId,
        stage: stage.stage,
        progress: bytesDone / totalBytes,
        label: stage.label(files),
        bytesDone: Math.round(bytesDone),
        bytesTotal: totalBytes
      })

      const task: DownloadTask = {
        id: `${stage.stage}-${step}`,
        kind: stage.stage === 'java' ? 'jre' : stage.stage === 'assets' ? 'asset' : 'library',
        url: 'https://libraries.minecraft.net/',
        dest: `games\\${stage.stage}\\file-${step}`,
        size: Math.round(stage.bytes / 12),
        received: Math.round(stage.bytes / 12),
        state: step === 12 ? 'done' : 'running',
        label: `${stage.stage}-${step}.jar`,
        speedBps: 12_400_000
      }
      tasks.set(task.id, task)
      emit('download:progress', task)
    }
  }

  emit('install:stage', {
    versionId,
    stage: 'done',
    progress: 1,
    label: `Версия ${versionId} готова`,
    bytesDone: totalBytes,
    bytesTotal: totalBytes
  })
}

function patchTask(
  tasks: Map<string, DownloadTask>,
  taskId: string,
  patch: Partial<DownloadTask>,
  emit: (channel: string, payload: unknown) => void
): void {
  const task = tasks.get(taskId)
  if (!task) return
  Object.assign(task, patch)
  emit('download:progress', { ...task })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const QUICK_PROFILE = 'quick'

let mockGameState: GameState | null = null
let sessionTimers: ReturnType<typeof setTimeout>[] = []

function simulateSession(
  versionId: string,
  nickname: string,
  emit: (channel: string, payload: unknown) => void,
  profileId: string = QUICK_PROFILE
): GameState {
  const startedAt = Date.now()
  const publish = (state: GameState): GameState => {
    mockGameState = state
    emit('game:state', state)
    return state
  }

  const lines: Array<[number, string, 'info' | 'warn' | 'error']> = [
    [0, 'Loading Minecraft ' + versionId + ' with Java 25', 'info'],
    [400, 'Setting user: ' + nickname, 'info'],
    [900, 'Backend library: LWJGL version 3.3.3+1', 'info'],
    [1500, 'Reloading ResourceManager: vanilla', 'info'],
    [2400, 'Sound engine started', 'info'],
    [3200, 'Created: 1024x512 minecraft:textures/atlas/blocks.png-atlas', 'info'],
    [4200, 'OpenAL initialized on device Speakers', 'info']
  ]

  for (const [delayMs, text, level] of lines) {
    sessionTimers.push(
      setTimeout(() => {
        emit('game:log', { source: profileId, level, time: Date.now(), text })
        if (text.startsWith('Setting user')) {
          publish({ profileId, phase: 'running', pid: 4242, startedAt })
        }
      }, delayMs)
    )
  }

  return publish({ profileId, phase: 'launching', pid: 4242, startedAt })
}

function stopSimulation(profileId: string, emit: (channel: string, payload: unknown) => void): void {
  for (const timer of sessionTimers) clearTimeout(timer)
  sessionTimers = []
  emit('game:log', { source: profileId, level: 'info', time: Date.now(), text: 'Stopping!' })
  mockGameState = { profileId, phase: 'stopped', exitCode: 0 }
  emit('game:state', mockGameState)
}
