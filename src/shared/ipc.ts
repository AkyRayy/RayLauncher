import type {
  AppInfo,
  ContentKind,
  CrashFixId,
  CrashFixResult,
  CrashVerdict,
  DiscordStatus,
  GameServer,
  LoaderKind,
  PackExportResult,
  PerfPreset,
  PerfPresetId,
  Profile,
  ProfileStats,
  ProfileTemplate,
  PublicAccount,
  BoostResult,
  DownloadTask,
  GameState,
  InstallStage,
  JavaRuntimeInfo,
  LogLine,
  ModEntry,
  ModSearchResult,
  ModSource,
  ModUpdateInfo,
  ModVersionInfo,
  NewsFeed,
  ServerStatus,
  Settings,
  TelemetrySendResult,
  ThemePack,
  UpdateState,
  VersionCatalog,
  WindowState,
  CustomBackground
} from './types'

export interface IpcContract {
  'app:info': { req: void; res: AppInfo }

  'window:minimize': { req: void; res: void }
  'window:toggleMaximize': { req: void; res: WindowState }
  'window:close': { req: void; res: void }
  'window:state': { req: void; res: WindowState }

  'settings:get': { req: void; res: Settings }
  'settings:patch': { req: Partial<Settings>; res: Settings }
  'settings:reset': { req: void; res: Settings }

  'background:choose': { req: void; res: CustomBackground | null }
  'background:current': { req: void; res: CustomBackground | null }
  'background:clear': { req: void; res: void }

  'system:openExternal': { req: { url: string }; res: void }
  'system:openFolder': { req: { target: FolderTarget }; res: void }
  'system:chooseDirectory': { req: { title?: string }; res: { path: string | null } }

  'logs:tail': { req: { limit: number }; res: LogLine[] }
  'logs:export': { req: void; res: { path: string | null } }

  'versions:list': { req: { refresh?: boolean }; res: VersionCatalog }
  'java:list': { req: void; res: JavaRuntimeInfo[] }

  'install:version': { req: { versionId: string }; res: { versionId: string; javaComponent: string } }
  'install:cancel': { req: { versionId: string }; res: void }

  'downloads:list': { req: void; res: DownloadTask[] }
  'downloads:pause': { req: { taskId: string }; res: void }
  'downloads:resume': { req: { taskId: string }; res: void }
  'downloads:cancel': { req: { taskId: string }; res: void }
  'downloads:retry': { req: { taskId: string }; res: void }
  'downloads:clearFinished': { req: void; res: void }
  'downloads:reveal': { req: { taskId: string }; res: void }

  'game:launch': {
    req: { versionId: string; nickname: string; accountId?: string; memoryMaxMb?: number }
    res: GameState
  }
  'game:stop': { req: { profileId: string }; res: void }
  'game:kill': { req: { profileId: string }; res: void }
  'game:state': { req: void; res: GameState | null }
  'game:revealCrash': { req: void; res: void }

  'crash:verdict': { req: { profileId?: string }; res: CrashVerdict | null }
  'crash:applyFix': { req: { profileId?: string; fixId: CrashFixId }; res: CrashFixResult }
  'crash:sendReport': { req: { profileId?: string }; res: TelemetrySendResult }

  'perf:presets': { req: void; res: PerfPreset[] }
  'perf:apply': { req: { profileId: string; preset: PerfPresetId }; res: Profile }
  'perf:boost': { req: { profileId: string }; res: BoostResult }

  'discord:status': { req: void; res: DiscordStatus }

  'servers:list': { req: void; res: GameServer[] }
  'servers:add': { req: { name: string; address: string; port?: number }; res: GameServer }
  'servers:update': {
    req: { id: string; patch: { name?: string; address?: string; port?: number; favorite?: boolean } }
    res: GameServer
  }
  'servers:remove': { req: { id: string }; res: void }
  'servers:ping': { req: { id: string }; res: ServerStatus }
  'servers:pingAll': { req: void; res: Record<string, ServerStatus> }
  'servers:connect': { req: { serverId: string; profileId: string }; res: GameState }

  'stats:list': { req: void; res: ProfileStats[] }

  'themes:list': { req: void; res: ThemePack[] }
  'themes:apply': { req: { id: string }; res: Settings }
  'themes:import': { req: void; res: ThemePack | null }
  'themes:export': { req: { id?: string }; res: { path: string | null } }
  'themes:delete': { req: { id: string }; res: void }

  'accounts:list': { req: void; res: PublicAccount[] }
  'accounts:active': { req: void; res: string | null }
  'accounts:setActive': { req: { accountId: string }; res: void }
  'accounts:remove': { req: { accountId: string }; res: void }
  'accounts:addGuest': { req: { nickname: string }; res: PublicAccount }
  'accounts:guestNicknames': { req: void; res: string[] }
  'accounts:signInMicrosoft': { req: void; res: PublicAccount }
  'accounts:cancelSignIn': { req: void; res: void }
  'accounts:signInYggdrasil': {
    req: { apiRoot: string; username: string; password: string; serverName?: string }
    res: { pendingId: string | null; profiles: Array<{ id: string; name: string }>; account: PublicAccount | null }
  }
  'accounts:chooseYggdrasilProfile': {
    req: { pendingId: string; profileId: string }
    res: PublicAccount
  }
  'accounts:refresh': { req: { accountId: string }; res: PublicAccount }
  'accounts:skin': {
    req: { accountId: string }
    res: { dataUrl: string | null; variant: 'classic' | 'slim' }
  }
  'profiles:list': { req: void; res: Profile[] }
  'profiles:get': { req: { profileId: string }; res: Profile }
  'profiles:create': {
    req: {
      name: string
      gameVersion: string
      loader: { kind: LoaderKind; version?: string }
      accountId?: string
      memory?: { auto: boolean; minMb: number; maxMb: number }
      java?: { mode: 'auto' | 'custom'; component?: string; customPath?: string }
    }
    res: Profile
  }
  'profiles:update': {
    req: { profileId: string; patch: Partial<Omit<Profile, 'id' | 'created' | 'updated'>> }
    res: Profile
  }
  'profiles:duplicate': { req: { profileId: string }; res: Profile }
  'profiles:delete': { req: { profileId: string; deleteFiles: boolean }; res: void }
  'profiles:install': {
    req: { profileId: string; verify?: boolean }
    res: { versionId: string; javaComponent: string }
  }
  'profiles:launch': { req: { profileId: string }; res: GameState }
  'profiles:openFolder': {
    req: { profileId: string; sub?: 'mods' | 'saves' | 'config' | 'logs' | 'crash-reports' | 'resourcepacks' | 'shaderpacks' }
    res: void
  }
  'profiles:loaderVersions': {
    req: { kind: LoaderKind; gameVersion: string }
    res: Array<{ id: string; stable: boolean; recommended?: boolean }>
  }
  'profiles:templates': { req: void; res: ProfileTemplate[] }
  'profiles:createFromTemplate': { req: { templateId: string; name?: string }; res: Profile }

  'mods:search': {
    req: {
      source: ModSource
      query: string
      profileId?: string
      gameVersion?: string
      loader?: LoaderKind
      kind?: ContentKind
      sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
      offset?: number
      limit?: number
    }
    res: ModSearchResult
  }
  'mods:project': {
    req: { source: ModSource; projectId: string }
    res: {
      title: string
      body: string
      links: { source?: string; issues?: string; wiki?: string }
      gallery: string[]
    }
  }
  'mods:versions': {
    req: { source: ModSource; projectId: string; profileId: string; kind?: ContentKind }
    res: ModVersionInfo[]
  }
  'mods:plan': {
    req: { profileId: string; version: ModVersionInfo }
    res: { dependencies: ModVersionInfo[]; incompatible: string[]; missing: string[] }
  }
  'mods:install': {
    req: { profileId: string; version: ModVersionInfo; withDependencies?: boolean }
    res: ModEntry[]
  }
  'mods:remove': { req: { modId: string }; res: void }
  'mods:toggle': { req: { modId: string; enabled: boolean }; res: ModEntry }
  'mods:update': { req: { modId: string; version: ModVersionInfo }; res: ModEntry }
  'mods:list': { req: { profileId: string }; res: ModEntry[] }
  'mods:scan': { req: { profileId: string }; res: ModEntry[] }
  'mods:updates': { req: { profileId: string }; res: ModUpdateInfo[] }
  'mods:updateAll': { req: { profileId: string }; res: { updated: number; total: number } }
  'mods:pin': { req: { modId: string; pinned: boolean }; res: ModEntry }
  'mods:rollback': { req: { modId: string }; res: ModEntry }
  'mods:openFolder': { req: { profileId: string }; res: void }
  'mods:importPack': {
    req: void
    res: { profileId: string; name: string; modsInstalled: number; filesSkipped: number } | null
  }
  'mods:exportPack': { req: { profileId: string; includeConfigs?: boolean }; res: PackExportResult }
  'mods:setCurseforgeKey': { req: { key: string }; res: void }
  'mods:curseforgeReady': { req: void; res: boolean }

  'news:list': { req: { refresh?: boolean }; res: NewsFeed }
  'news:openReleases': { req: void; res: void }
  'updates:state': { req: void; res: UpdateState }
  'updates:check': { req: void; res: UpdateState }
  'updates:download': { req: void; res: UpdateState }
  'updates:install': { req: void; res: void }

  'accounts:importSkin': {
    req: { accountId: string; variant: 'classic' | 'slim' }
    res: { dataUrl: string | null; variant: 'classic' | 'slim' }
  }
}

export type FolderTarget = 'games' | 'logs' | 'userData' | 'instances'

export interface IpcEvents {
  'settings:changed': Settings
  'window:state': WindowState
  'launcher:log': LogLine
  'download:progress': DownloadTask
  'install:stage': InstallStage
  'game:state': GameState
  'game:log': LogLine
  'accounts:changed': PublicAccount[]
  'profiles:changed': Profile[]
  'mods:changed': { profileId: string; mods: ModEntry[] }
  'update:state': UpdateState
}

export type IpcChannel = keyof IpcContract
export type IpcEventChannel = keyof IpcEvents

export type IpcRequest<C extends IpcChannel> = IpcContract[C]['req']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['res']

export const IPC_CHANNELS = [
  'app:info',
  'window:minimize',
  'window:toggleMaximize',
  'window:close',
  'window:state',
  'settings:get',
  'settings:patch',
  'settings:reset',
  'background:choose',
  'background:current',
  'background:clear',
  'system:openExternal',
  'system:openFolder',
  'system:chooseDirectory',
  'logs:tail',
  'logs:export',
  'versions:list',
  'java:list',
  'install:version',
  'install:cancel',
  'downloads:list',
  'downloads:pause',
  'downloads:resume',
  'downloads:cancel',
  'downloads:retry',
  'downloads:clearFinished',
  'downloads:reveal',
  'game:launch',
  'game:stop',
  'game:kill',
  'game:state',
  'game:revealCrash',
  'crash:verdict',
  'crash:applyFix',
  'crash:sendReport',
  'perf:presets',
  'perf:apply',
  'perf:boost',
  'discord:status',
  'servers:list',
  'servers:add',
  'servers:update',
  'servers:remove',
  'servers:ping',
  'servers:pingAll',
  'servers:connect',
  'stats:list',
  'themes:list',
  'themes:apply',
  'themes:import',
  'themes:export',
  'themes:delete',
  'accounts:list',
  'accounts:active',
  'accounts:setActive',
  'accounts:remove',
  'accounts:addGuest',
  'accounts:guestNicknames',
  'accounts:signInMicrosoft',
  'accounts:cancelSignIn',
  'accounts:signInYggdrasil',
  'accounts:chooseYggdrasilProfile',
  'accounts:refresh',
  'accounts:skin',
  'accounts:importSkin',
  'profiles:list',
  'profiles:get',
  'profiles:create',
  'profiles:update',
  'profiles:duplicate',
  'profiles:delete',
  'profiles:install',
    'profiles:launch',
  'profiles:openFolder',
  'profiles:loaderVersions',
  'profiles:templates',
  'profiles:createFromTemplate',
  'mods:search',
  'mods:project',
  'mods:versions',
  'mods:plan',
  'mods:install',
  'mods:remove',
  'mods:toggle',
  'mods:update',
  'mods:list',
  'mods:scan',
  'mods:updates',
  'mods:updateAll',
  'mods:pin',
  'mods:rollback',
  'mods:openFolder',
  'mods:importPack',
  'mods:exportPack',
  'mods:setCurseforgeKey',
  'mods:curseforgeReady',
  'news:list',
  'news:openReleases',
  'updates:state',
  'updates:check',
  'updates:download',
  'updates:install'
] as const satisfies readonly IpcChannel[]

export const IPC_EVENT_CHANNELS = [
  'settings:changed',
  'window:state',
  'launcher:log',
  'download:progress',
  'install:stage',
  'game:state',
  'game:log',
  'accounts:changed',
  'profiles:changed',
  'mods:changed',
  'update:state'
] as const satisfies readonly IpcEventChannel[]

export type Unsubscribe = () => void

export interface RayApi {
  app: {
    info(): Promise<AppInfo>
  }
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<WindowState>
    close(): Promise<void>
    state(): Promise<WindowState>
  }
  settings: {
    get(): Promise<Settings>
    patch(patch: Partial<Settings>): Promise<Settings>
    reset(): Promise<Settings>
  }
  background: {
    choose(): Promise<CustomBackground | null>
    current(): Promise<CustomBackground | null>
    clear(): Promise<void>
  }
  system: {
    openExternal(url: string): Promise<void>
    openFolder(target: FolderTarget): Promise<void>
    chooseDirectory(title?: string): Promise<{ path: string | null }>
  }
  logs: {
    tail(limit: number): Promise<LogLine[]>
    export(): Promise<{ path: string | null }>
  }
  versions: {
    list(refresh?: boolean): Promise<VersionCatalog>
  }
  java: {
    list(): Promise<JavaRuntimeInfo[]>
  }
  install: {
    version(versionId: string): Promise<{ versionId: string; javaComponent: string }>
    cancel(versionId: string): Promise<void>
  }
  downloads: {
    list(): Promise<DownloadTask[]>
    pause(taskId: string): Promise<void>
    resume(taskId: string): Promise<void>
    cancel(taskId: string): Promise<void>
    retry(taskId: string): Promise<void>
    clearFinished(): Promise<void>
    reveal(taskId: string): Promise<void>
  }
  accounts: {
    list(): Promise<PublicAccount[]>
    active(): Promise<string | null>
    setActive(accountId: string): Promise<void>
    remove(accountId: string): Promise<void>
    addGuest(nickname: string): Promise<PublicAccount>
    guestNicknames(): Promise<string[]>
    signInMicrosoft(): Promise<PublicAccount>
    cancelSignIn(): Promise<void>
    signInYggdrasil(request: {
      apiRoot: string
      username: string
      password: string
      serverName?: string
    }): Promise<{
      pendingId: string | null
      profiles: Array<{ id: string; name: string }>
      account: PublicAccount | null
    }>
    chooseYggdrasilProfile(request: { pendingId: string; profileId: string }): Promise<PublicAccount>
    refresh(accountId: string): Promise<PublicAccount>
    skin(accountId: string): Promise<{ dataUrl: string | null; variant: 'classic' | 'slim' }>
    importSkin(request: {
      accountId: string
      variant: 'classic' | 'slim'
    }): Promise<{ dataUrl: string | null; variant: 'classic' | 'slim' }>
  }
  profiles: {
    list(): Promise<Profile[]>
    get(profileId: string): Promise<Profile>
    create(request: {
      name: string
      gameVersion: string
      loader: { kind: LoaderKind; version?: string }
      accountId?: string
      memory?: { auto: boolean; minMb: number; maxMb: number }
      java?: { mode: 'auto' | 'custom'; component?: string; customPath?: string }
    }): Promise<Profile>
    update(request: {
      profileId: string
      patch: Partial<Omit<Profile, 'id' | 'created' | 'updated'>>
    }): Promise<Profile>
    duplicate(profileId: string): Promise<Profile>
    remove(request: { profileId: string; deleteFiles: boolean }): Promise<void>
    install(request: { profileId: string; verify?: boolean }): Promise<{
      versionId: string
      javaComponent: string
    }>
    launch(profileId: string): Promise<GameState>
    openFolder(request: {
      profileId: string
      sub?: 'mods' | 'saves' | 'config' | 'logs' | 'crash-reports' | 'resourcepacks' | 'shaderpacks'
    }): Promise<void>
    loaderVersions(request: { kind: LoaderKind; gameVersion: string }): Promise<
      Array<{ id: string; stable: boolean; recommended?: boolean }>
    >
    templates(): Promise<ProfileTemplate[]>
    createFromTemplate(request: { templateId: string; name?: string }): Promise<Profile>
  }
  mods: {
    search(request: {
      source: ModSource
      query: string
      profileId?: string
      gameVersion?: string
      loader?: LoaderKind
      kind?: ContentKind
      sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
      offset?: number
      limit?: number
    }): Promise<ModSearchResult>
    project(request: {
      source: ModSource
      projectId: string
    }): Promise<{
      title: string
      body: string
      links: { source?: string; issues?: string; wiki?: string }
      gallery: string[]
    }>
    versions(request: {
      source: ModSource
      projectId: string
      profileId: string
      kind?: ContentKind
    }): Promise<ModVersionInfo[]>
    plan(request: {
      profileId: string
      version: ModVersionInfo
    }): Promise<{ dependencies: ModVersionInfo[]; incompatible: string[]; missing: string[] }>
    install(request: {
      profileId: string
      version: ModVersionInfo
      withDependencies?: boolean
    }): Promise<ModEntry[]>
    remove(request: { modId: string }): Promise<void>
    toggle(request: { modId: string; enabled: boolean }): Promise<ModEntry>
    update(request: { modId: string; version: ModVersionInfo }): Promise<ModEntry>
    list(profileId: string): Promise<ModEntry[]>
    scan(profileId: string): Promise<ModEntry[]>
    updates(profileId: string): Promise<ModUpdateInfo[]>
    updateAll(profileId: string): Promise<{ updated: number; total: number }>
    pin(request: { modId: string; pinned: boolean }): Promise<ModEntry>
    rollback(request: { modId: string }): Promise<ModEntry>
    openFolder(profileId: string): Promise<void>
    importPack(): Promise<{
      profileId: string
      name: string
      modsInstalled: number
      filesSkipped: number
    } | null>
    exportPack(request: { profileId: string; includeConfigs?: boolean }): Promise<PackExportResult>
    setCurseforgeKey(key: string): Promise<void>
    curseforgeReady(): Promise<boolean>
  }
  news: {
    list(refresh?: boolean): Promise<NewsFeed>
    openReleases(): Promise<void>
  }
  updates: {
    state(): Promise<UpdateState>
    check(): Promise<UpdateState>
    download(): Promise<UpdateState>
    install(): Promise<void>
  }
  game: {
    launch(request: { versionId: string; nickname: string; accountId?: string; memoryMaxMb?: number }): Promise<GameState>
    stop(profileId: string): Promise<void>
    kill(profileId: string): Promise<void>
    state(): Promise<GameState | null>
    revealCrash(): Promise<void>
  }
  crash: {
    verdict(profileId?: string): Promise<CrashVerdict | null>
    applyFix(request: { profileId?: string; fixId: CrashFixId }): Promise<CrashFixResult>
    sendReport(profileId?: string): Promise<TelemetrySendResult>
  }
  perf: {
    presets(): Promise<PerfPreset[]>
    apply(request: { profileId: string; preset: PerfPresetId }): Promise<Profile>
    boost(profileId: string): Promise<BoostResult>
  }
  discord: {
    status(): Promise<DiscordStatus>
  }
  servers: {
    list(): Promise<GameServer[]>
    add(request: { name: string; address: string; port?: number }): Promise<GameServer>
    update(request: {
      id: string
      patch: { name?: string; address?: string; port?: number; favorite?: boolean }
    }): Promise<GameServer>
    remove(id: string): Promise<void>
    ping(id: string): Promise<ServerStatus>
    pingAll(): Promise<Record<string, ServerStatus>>
    connect(request: { serverId: string; profileId: string }): Promise<GameState>
  }
  stats: {
    list(): Promise<ProfileStats[]>
  }
  themes: {
    list(): Promise<ThemePack[]>
    apply(id: string): Promise<Settings>
    importPack(): Promise<ThemePack | null>
    exportPack(id?: string): Promise<{ path: string | null }>
    remove(id: string): Promise<void>
  }
  on: {
    [E in IpcEventChannel]: (listener: (payload: IpcEvents[E]) => void) => Unsubscribe
  }
}
