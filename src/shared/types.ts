export type AccountKind = 'microsoft' | 'guest' | 'yggdrasil'

export interface AccountSkin {
  url: string
  variant: 'classic' | 'slim'
  hash: string
}

export interface Account {
  id: string
  kind: AccountKind
  username: string
  uuid: string
  accessToken: string
  clientToken?: string
  xuid?: string
  refreshToken?: string
  expiresAt?: number
  skin?: AccountSkin
  capeUrl?: string
  yggdrasil?: { apiRoot: string; serverName: string }
  createdAt: number
  lastUsedAt: number
}

export type PublicAccount = Omit<Account, 'accessToken' | 'clientToken' | 'refreshToken'> & {
  expired: boolean
}

export type LoaderKind = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'

export interface Profile {
  id: string
  name: string
  icon?: string
  gameVersion: string
  loader: { kind: LoaderKind; version?: string }
  resolvedVersionId?: string
  accountId?: string
  java: { mode: 'auto' | 'custom'; component?: string; customPath?: string }
  memory: { minMb: number; maxMb: number; auto: boolean }
  window?: { width: number; height: number; fullscreen: boolean }
  jvmArgs: string[]
  gameArgs: string[]
  resolutionFix?: boolean
  offlineSkins: boolean
  created: number
  updated: number
  lastPlayed?: number
}

export type ModSource = 'modrinth' | 'curseforge' | 'local'

export interface ModEntry {
  id: string
  profileId: string
  source: ModSource
  projectId: string
  versionId: string
  title: string
  slug: string
  iconUrl?: string
  fileName: string
  filePath: string
  sha1: string
  sha512?: string
  size: number
  enabled: boolean
  installedAt: number
}

export interface ModSearchHit {
  source: ModSource
  projectId: string
  slug: string
  title: string
  description: string
  iconUrl?: string
  downloads: number
  categories: string[]
  updated?: string
  installed?: boolean
}

export interface ModSearchResult {
  hits: ModSearchHit[]
  total: number
  offset: number
}

export type DependencyKind = 'required' | 'optional' | 'incompatible' | 'embedded'

export interface ModDependency {
  kind: DependencyKind
  projectId?: string
  versionId?: string
}

export interface ModVersionInfo {
  source: ModSource
  versionId: string
  projectId: string
  title: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  releaseType: 'release' | 'beta' | 'alpha'
  datePublished: string
  downloadUrl: string
  fileName: string
  size: number
  sha1: string
  sha512?: string
  iconUrl?: string
  dependencies: ModDependency[]
}

export interface InstallPlan {
  primary: ModVersionInfo
  dependencies: ModVersionInfo[]
  incompatible: string[]
  missing: string[]
}

export interface ModUpdateInfo {
  modId: string
  title: string
  currentVersion: string
  next: ModVersionInfo
}

export type DownloadKind =
  | 'client-jar'
  | 'library'
  | 'asset'
  | 'jre'
  | 'mod'
  | 'modpack'
  | 'loader'
  | 'skin'
  | 'update'

export type DownloadState = 'queued' | 'running' | 'paused' | 'done' | 'error'

export interface DownloadTask {
  id: string
  kind: DownloadKind
  url: string
  dest: string
  sha1?: string
  size: number
  received: number
  state: DownloadState
  label: string
  profileId?: string
  error?: string
  speedBps?: number
}

export type VersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'

export interface VersionSummary {
  id: string
  type: VersionType
  releaseTime: string
  complianceLevel: number
  installed: boolean
}

export interface VersionCatalog {
  latestRelease: string
  latestSnapshot: string
  versions: VersionSummary[]
  fetchedAt: number
  fromCache: boolean
}

export interface JavaRuntimeInfo {
  component: string
  majorVersion: number
  installed: boolean
  path?: string
}

export type InstallStageId =
  | 'manifest'
  | 'version-json'
  | 'client'
  | 'libraries'
  | 'natives'
  | 'assets'
  | 'logging'
  | 'java'
  | 'loader'
  | 'mods'
  | 'done'

export interface InstallStage {
  versionId: string
  profileId?: string
  stage: InstallStageId
  progress: number
  label: string
  bytesDone: number
  bytesTotal: number
}

export type GamePhase =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'launching'
  | 'running'
  | 'stopped'
  | 'crashed'

export interface GameState {
  profileId: string
  phase: GamePhase
  pid?: number
  exitCode?: number
  startedAt?: number
  crashReportPath?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogLine {
  source: string
  level: LogLevel
  time: number
  text: string
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentId = 'indigo' | 'azure' | 'teal' | 'moss' | 'amber' | 'rose' | 'plum' | 'graphite'
export type Density = 'comfortable' | 'compact'
export type BackgroundId = 'none' | 'dawn' | 'night' | 'studio' | 'custom'

export interface CustomBackground {
  file: string
  url: string
  kind: 'image' | 'video'
}
export type UpdateChannel = 'stable' | 'beta'

export interface Settings {
  language: 'ru' | 'en'
  theme: ThemeMode
  accent: AccentId
  density: Density
  sidebarCollapsed: boolean
  backgroundId: BackgroundId
  backgroundCustom: string
  backgroundBlur: number
  backgroundDim: number
  backgroundMotion: boolean
  gamesDir: string
  concurrency: number
  speedLimitKbps: number
  defaultMemoryMb: number
  jvmArgs: string[]
  closeLauncherOnLaunch: boolean
  minimizeToTray: boolean
  curseforgeEnabled: boolean
  curseforgeKeySet: boolean
  msClientId: string
  offlineSkins: boolean
  activeProfileId: string
  guestNickname: string
  lastVersionId: string
  updateChannel: UpdateChannel
  telemetry: boolean
  onboarded: boolean
}

export type NewsSource = 'minecraft' | 'launcher'

export interface NewsItem {
  id: string
  source: NewsSource
  title: string
  summary: string
  date: string
  category: string
  imageUrl?: string
  link?: string
  bodyHtml?: string
}

export interface NewsFeed {
  items: NewsItem[]
  fetchedAt: number
  fromCache: boolean
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error'

export interface UpdateState {
  phase: UpdatePhase
  version?: string
  releaseNotesHtml?: string
  releaseDate?: string
  progress?: number
  bytesPerSecond?: number
  error?: string
  supported: boolean
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  userDataDir: string
  gamesDir: string
  logsDir: string
  totalMemoryMb: number
  oneDriveWarning: boolean
}

export interface WindowState {
  maximized: boolean
  focused: boolean
}
