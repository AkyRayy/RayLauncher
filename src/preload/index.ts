import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcEventChannel, IpcEvents, RayApi, Unsubscribe } from '@shared/ipc'
import { IPC_EVENT_CHANNELS } from '@shared/ipc'
import { RayError, isSerializedRayError } from '@shared/errors'

async function invoke<C extends IpcChannel>(channel: C, payload?: unknown): Promise<unknown> {
  try {
    return await ipcRenderer.invoke(channel, payload)
  } catch (error) {
    throw unwrap(error)
  }
}

function unwrap(error: unknown): RayError {
  const message = error instanceof Error ? error.message : String(error)
  const start = message.indexOf('{')
  const end = message.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const parsed = tryParseJson(message.slice(start, end + 1))
    if (isSerializedRayError(parsed)) {
      return new RayError(parsed.code, parsed.message, parsed.details)
    }
  }
  return new RayError('INTERNAL', message)
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function subscribe<E extends IpcEventChannel>(
  channel: E,
  listener: (payload: IpcEvents[E]) => void
): Unsubscribe {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: IpcEvents[E]): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const on = Object.fromEntries(
  IPC_EVENT_CHANNELS.map((channel) => [
    channel,
    (listener: (payload: IpcEvents[IpcEventChannel]) => void) =>
      subscribe(channel, listener as (payload: IpcEvents[typeof channel]) => void)
  ])
) as unknown as RayApi['on']

const api: RayApi = {
  app: {
    info: () => invoke('app:info') as Promise<Awaited<ReturnType<RayApi['app']['info']>>>
  },
  window: {
    minimize: () => invoke('window:minimize') as Promise<void>,
    toggleMaximize: () =>
      invoke('window:toggleMaximize') as Promise<Awaited<ReturnType<RayApi['window']['toggleMaximize']>>>,
    close: () => invoke('window:close') as Promise<void>,
    state: () => invoke('window:state') as Promise<Awaited<ReturnType<RayApi['window']['state']>>>
  },
  settings: {
    get: () => invoke('settings:get') as Promise<Awaited<ReturnType<RayApi['settings']['get']>>>,
    patch: (patch) =>
      invoke('settings:patch', patch) as Promise<Awaited<ReturnType<RayApi['settings']['patch']>>>,
    reset: () => invoke('settings:reset') as Promise<Awaited<ReturnType<RayApi['settings']['reset']>>>
  },
  background: {
    choose: () => invoke('background:choose') as Promise<Awaited<ReturnType<RayApi['background']['choose']>>>,
    current: () => invoke('background:current') as Promise<Awaited<ReturnType<RayApi['background']['current']>>>,
    clear: () => invoke('background:clear') as Promise<void>
  },
  system: {
    openExternal: (url) => invoke('system:openExternal', { url }) as Promise<void>,
    openFolder: (target) => invoke('system:openFolder', { target }) as Promise<void>,
    chooseDirectory: (title) =>
      invoke('system:chooseDirectory', { title }) as Promise<{ path: string | null }>
  },
  logs: {
    tail: (limit) => invoke('logs:tail', { limit }) as Promise<Awaited<ReturnType<RayApi['logs']['tail']>>>,
    export: () => invoke('logs:export') as Promise<{ path: string | null }>
  },
  versions: {
    list: (refresh) =>
      invoke('versions:list', { refresh }) as Promise<Awaited<ReturnType<RayApi['versions']['list']>>>
  },
  java: {
    list: () => invoke('java:list') as Promise<Awaited<ReturnType<RayApi['java']['list']>>>
  },
  install: {
    version: (versionId) =>
      invoke('install:version', { versionId }) as Promise<
        Awaited<ReturnType<RayApi['install']['version']>>
      >,
    cancel: (versionId) => invoke('install:cancel', { versionId }) as Promise<void>
  },
  downloads: {
    list: () => invoke('downloads:list') as Promise<Awaited<ReturnType<RayApi['downloads']['list']>>>,
    pause: (taskId) => invoke('downloads:pause', { taskId }) as Promise<void>,
    resume: (taskId) => invoke('downloads:resume', { taskId }) as Promise<void>,
    cancel: (taskId) => invoke('downloads:cancel', { taskId }) as Promise<void>,
    retry: (taskId) => invoke('downloads:retry', { taskId }) as Promise<void>,
    clearFinished: () => invoke('downloads:clearFinished') as Promise<void>,
    reveal: (taskId) => invoke('downloads:reveal', { taskId }) as Promise<void>
  },
  accounts: {
    list: () => invoke('accounts:list') as Promise<Awaited<ReturnType<RayApi['accounts']['list']>>>,
    active: () => invoke('accounts:active') as Promise<string | null>,
    setActive: (accountId) => invoke('accounts:setActive', { accountId }) as Promise<void>,
    remove: (accountId) => invoke('accounts:remove', { accountId }) as Promise<void>,
    addGuest: (nickname) =>
      invoke('accounts:addGuest', { nickname }) as Promise<Awaited<ReturnType<RayApi['accounts']['addGuest']>>>,
    guestNicknames: () => invoke('accounts:guestNicknames') as Promise<string[]>,
    signInMicrosoft: () =>
      invoke('accounts:signInMicrosoft') as Promise<Awaited<ReturnType<RayApi['accounts']['signInMicrosoft']>>>,
    cancelSignIn: () => invoke('accounts:cancelSignIn') as Promise<void>,
    signInYggdrasil: (payload) =>
      invoke('accounts:signInYggdrasil', payload) as Promise<
        Awaited<ReturnType<RayApi['accounts']['signInYggdrasil']>>
      >,
    chooseYggdrasilProfile: (payload) =>
      invoke('accounts:chooseYggdrasilProfile', payload) as Promise<
        Awaited<ReturnType<RayApi['accounts']['chooseYggdrasilProfile']>>
      >,
    refresh: (accountId) =>
      invoke('accounts:refresh', { accountId }) as Promise<Awaited<ReturnType<RayApi['accounts']['refresh']>>>,
    skin: (accountId) =>
      invoke('accounts:skin', { accountId }) as Promise<Awaited<ReturnType<RayApi['accounts']['skin']>>>,
    importSkin: (payload) =>
      invoke('accounts:importSkin', payload) as Promise<Awaited<ReturnType<RayApi['accounts']['importSkin']>>>
  },
  profiles: {
    list: () => invoke('profiles:list') as Promise<Awaited<ReturnType<RayApi['profiles']['list']>>>,
    get: (profileId) =>
      invoke('profiles:get', { profileId }) as Promise<Awaited<ReturnType<RayApi['profiles']['get']>>>,
    create: (request) =>
      invoke('profiles:create', request) as Promise<Awaited<ReturnType<RayApi['profiles']['create']>>>,
    update: (request) =>
      invoke('profiles:update', request) as Promise<Awaited<ReturnType<RayApi['profiles']['update']>>>,
    duplicate: (profileId) =>
      invoke('profiles:duplicate', { profileId }) as Promise<
        Awaited<ReturnType<RayApi['profiles']['duplicate']>>
      >,
    remove: (request) => invoke('profiles:delete', request) as Promise<void>,
    install: (request) =>
      invoke('profiles:install', request) as Promise<Awaited<ReturnType<RayApi['profiles']['install']>>>,
    launch: (profileId) =>
      invoke('profiles:launch', { profileId }) as Promise<Awaited<ReturnType<RayApi['profiles']['launch']>>>,
    openFolder: (request) => invoke('profiles:openFolder', request) as Promise<void>,
    loaderVersions: (request) =>
      invoke('profiles:loaderVersions', request) as Promise<
        Awaited<ReturnType<RayApi['profiles']['loaderVersions']>>
      >,
    templates: () =>
      invoke('profiles:templates') as Promise<Awaited<ReturnType<RayApi['profiles']['templates']>>>,
    createFromTemplate: (request) =>
      invoke('profiles:createFromTemplate', request) as Promise<
        Awaited<ReturnType<RayApi['profiles']['createFromTemplate']>>
      >
  },
  mods: {
    search: (request) =>
      invoke('mods:search', request) as Promise<Awaited<ReturnType<RayApi['mods']['search']>>>,
    project: (request) =>
      invoke('mods:project', request) as Promise<Awaited<ReturnType<RayApi['mods']['project']>>>,
    versions: (request) =>
      invoke('mods:versions', request) as Promise<Awaited<ReturnType<RayApi['mods']['versions']>>>,
    plan: (request) => invoke('mods:plan', request) as Promise<Awaited<ReturnType<RayApi['mods']['plan']>>>,
    install: (request) =>
      invoke('mods:install', request) as Promise<Awaited<ReturnType<RayApi['mods']['install']>>>,
    remove: (request) => invoke('mods:remove', request) as Promise<void>,
    toggle: (request) =>
      invoke('mods:toggle', request) as Promise<Awaited<ReturnType<RayApi['mods']['toggle']>>>,
    update: (request) =>
      invoke('mods:update', request) as Promise<Awaited<ReturnType<RayApi['mods']['update']>>>,
    list: (profileId) =>
      invoke('mods:list', { profileId }) as Promise<Awaited<ReturnType<RayApi['mods']['list']>>>,
    scan: (profileId) =>
      invoke('mods:scan', { profileId }) as Promise<Awaited<ReturnType<RayApi['mods']['scan']>>>,
    updates: (profileId) =>
      invoke('mods:updates', { profileId }) as Promise<Awaited<ReturnType<RayApi['mods']['updates']>>>,
    updateAll: (profileId) =>
      invoke('mods:updateAll', { profileId }) as Promise<
        Awaited<ReturnType<RayApi['mods']['updateAll']>>
      >,
    pin: (request) =>
      invoke('mods:pin', request) as Promise<Awaited<ReturnType<RayApi['mods']['pin']>>>,
    rollback: (request) =>
      invoke('mods:rollback', request) as Promise<Awaited<ReturnType<RayApi['mods']['rollback']>>>,
    openFolder: (profileId) => invoke('mods:openFolder', { profileId }) as Promise<void>,
    importPack: () =>
      invoke('mods:importPack') as Promise<Awaited<ReturnType<RayApi['mods']['importPack']>>>,
    exportPack: (request) =>
      invoke('mods:exportPack', request) as Promise<Awaited<ReturnType<RayApi['mods']['exportPack']>>>,
    setCurseforgeKey: (key) => invoke('mods:setCurseforgeKey', { key }) as Promise<void>,
    curseforgeReady: () => invoke('mods:curseforgeReady') as Promise<boolean>
  },
  news: {
    list: (refresh) =>
      invoke('news:list', { refresh }) as Promise<Awaited<ReturnType<RayApi['news']['list']>>>,
    openReleases: () => invoke('news:openReleases') as Promise<void>
  },
  updates: {
    state: () => invoke('updates:state') as Promise<Awaited<ReturnType<RayApi['updates']['state']>>>,
    check: () => invoke('updates:check') as Promise<Awaited<ReturnType<RayApi['updates']['check']>>>,
    download: () =>
      invoke('updates:download') as Promise<Awaited<ReturnType<RayApi['updates']['download']>>>,
    install: () => invoke('updates:install') as Promise<void>
  },
  game: {
    launch: (request) => invoke('game:launch', request) as Promise<Awaited<ReturnType<RayApi['game']['launch']>>>,
    stop: (profileId) => invoke('game:stop', { profileId }) as Promise<void>,
    kill: (profileId) => invoke('game:kill', { profileId }) as Promise<void>,
    state: () => invoke('game:state') as Promise<Awaited<ReturnType<RayApi['game']['state']>>>,
    revealCrash: () => invoke('game:revealCrash') as Promise<void>
  },
  crash: {
    verdict: (profileId) =>
      invoke('crash:verdict', { profileId }) as Promise<
        Awaited<ReturnType<RayApi['crash']['verdict']>>
      >,
    applyFix: (request) =>
      invoke('crash:applyFix', request) as Promise<Awaited<ReturnType<RayApi['crash']['applyFix']>>>,
    sendReport: (profileId) =>
      invoke('crash:sendReport', { profileId }) as Promise<
        Awaited<ReturnType<RayApi['crash']['sendReport']>>
      >
  },
  perf: {
    presets: () => invoke('perf:presets') as Promise<Awaited<ReturnType<RayApi['perf']['presets']>>>,
    apply: (request) =>
      invoke('perf:apply', request) as Promise<Awaited<ReturnType<RayApi['perf']['apply']>>>,
    boost: (profileId) =>
      invoke('perf:boost', { profileId }) as Promise<Awaited<ReturnType<RayApi['perf']['boost']>>>
  },
  discord: {
    status: () => invoke('discord:status') as Promise<Awaited<ReturnType<RayApi['discord']['status']>>>
  },
  servers: {
    list: () => invoke('servers:list') as Promise<Awaited<ReturnType<RayApi['servers']['list']>>>,
    add: (request) =>
      invoke('servers:add', request) as Promise<Awaited<ReturnType<RayApi['servers']['add']>>>,
    update: (request) =>
      invoke('servers:update', request) as Promise<Awaited<ReturnType<RayApi['servers']['update']>>>,
    remove: (id) => invoke('servers:remove', { id }) as Promise<void>,
    ping: (id) =>
      invoke('servers:ping', { id }) as Promise<Awaited<ReturnType<RayApi['servers']['ping']>>>,
    pingAll: () =>
      invoke('servers:pingAll') as Promise<Awaited<ReturnType<RayApi['servers']['pingAll']>>>,
    connect: (request) =>
      invoke('servers:connect', request) as Promise<Awaited<ReturnType<RayApi['servers']['connect']>>>
  },
  stats: {
    list: () => invoke('stats:list') as Promise<Awaited<ReturnType<RayApi['stats']['list']>>>
  },
  themes: {
    list: () => invoke('themes:list') as Promise<Awaited<ReturnType<RayApi['themes']['list']>>>,
    apply: (id) =>
      invoke('themes:apply', { id }) as Promise<Awaited<ReturnType<RayApi['themes']['apply']>>>,
    importPack: () =>
      invoke('themes:import') as Promise<Awaited<ReturnType<RayApi['themes']['importPack']>>>,
    exportPack: (id) =>
      invoke('themes:export', { id }) as Promise<
        Awaited<ReturnType<RayApi['themes']['exportPack']>>
      >,
    remove: (id) => invoke('themes:delete', { id }) as Promise<void>
  },
  on
}

contextBridge.exposeInMainWorld('ray', api)
