import { z } from 'zod'
import type { IpcChannel } from './ipc'
import { MEMORY, NETWORK } from './constants'

const empty = z.void()

export const themeModeSchema = z.enum(['light', 'dark', 'system'])
export const accentSchema = z.enum([
  'indigo',
  'azure',
  'teal',
  'moss',
  'amber',
  'rose',
  'plum',
  'graphite'
])
export const densitySchema = z.enum(['comfortable', 'compact'])
export const updateChannelSchema = z.enum(['stable', 'beta'])
export const folderTargetSchema = z.enum(['games', 'logs', 'userData', 'instances'])

export const backgroundIdSchema = z.enum(['none', 'dawn', 'night', 'studio', 'custom'])

export const settingsSchema = z.object({
  language: z.enum(['ru', 'en']),
  theme: themeModeSchema,
  accent: accentSchema,
  density: densitySchema,
  sidebarCollapsed: z.boolean(),
  backgroundId: backgroundIdSchema,
  backgroundCustom: z.string().max(160),
  backgroundBlur: z.number().int().min(0).max(40),
  backgroundDim: z.number().min(0).max(0.9),
  backgroundMotion: z.boolean(),
  gamesDir: z.string().min(1),
  concurrency: z.number().int().min(NETWORK.minConcurrency).max(NETWORK.maxConcurrency),
  speedLimitKbps: z.number().int().min(0).max(1_000_000),
  defaultMemoryMb: z.number().int().min(MEMORY.minMb).max(MEMORY.maxMb),
  jvmArgs: z.array(z.string()),
  closeLauncherOnLaunch: z.boolean(),
  minimizeToTray: z.boolean(),
  curseforgeEnabled: z.boolean(),
  curseforgeKeySet: z.boolean(),
  msClientId: z.string().min(1),
  offlineSkins: z.boolean(),
  activeProfileId: z.string().max(64),
  guestNickname: z.string().max(16),
  lastVersionId: z.string().max(64),
  updateChannel: updateChannelSchema,
  telemetry: z.boolean(),
  telemetryEndpoint: z.string().max(300),
  onboarded: z.boolean(),
  discordPresence: z.boolean(),
  discordClientId: z.string().max(32),
  watchdogEnabled: z.boolean(),
  watchdogTimeoutMin: z.number().int().min(2).max(120),
  themePackId: z.string().max(64),
  customCssVars: z.record(z.string().max(60), z.string().max(200))
})

export const settingsPatchSchema = settingsSchema
  .omit({ curseforgeKeySet: true })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Пустой патч настроек'
  })

export const externalUrlSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
      message: 'Разрешены только http и https'
    })
})

export const openFolderSchema = z.object({ target: folderTargetSchema })
export const chooseDirectorySchema = z.object({ title: z.string().max(120).optional() })
export const logsTailSchema = z.object({ limit: z.number().int().min(1).max(5000) })

export const versionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._\- +]*$/, 'Недопустимый идентификатор версии')

export const nicknameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_]{3,16}$/, 'Ник: 3–16 символов, латиница, цифры и подчёркивание')

export const taskIdSchema = z.object({ taskId: z.string().min(1).max(128) })

export const profileIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Недопустимый профиль')

export const gameLaunchSchema = z.object({
  versionId: versionIdSchema,
  nickname: nicknameSchema,
  accountId: z.string().min(1).max(64).optional(),
  memoryMaxMb: z.number().int().min(MEMORY.minMb).max(MEMORY.maxMb).optional()
})

export const loaderKindSchema = z.enum(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'])

export const profileRefSchema = z.object({ profileId: profileIdSchema })

const profileMemorySchema = z.object({
  auto: z.boolean(),
  minMb: z.number().int().min(MEMORY.minMb).max(MEMORY.maxMb),
  maxMb: z.number().int().min(MEMORY.minMb).max(MEMORY.maxMb)
})

const javaSettingSchema = z.object({
  mode: z.enum(['auto', 'custom']),
  component: z.string().max(80).optional(),
  customPath: z.string().max(400).optional()
})

const windowSchema = z.object({
  width: z.number().int().min(320).max(7680),
  height: z.number().int().min(240).max(4320),
  fullscreen: z.boolean()
})

export const profileCreateSchema = z.object({
  name: z.string().min(1).max(60),
  gameVersion: versionIdSchema,
  loader: z.object({ kind: loaderKindSchema, version: z.string().max(60).optional() }),
  accountId: z.string().min(1).max(64).optional(),
  memory: profileMemorySchema.optional(),
  java: javaSettingSchema.optional()
})

export const profilePatchSchema = z.object({
  profileId: profileIdSchema,
  patch: z.object({
    name: z.string().min(1).max(60).optional(),
    icon: z.string().max(200).optional(),
    gameVersion: versionIdSchema.optional(),
    loader: z.object({ kind: loaderKindSchema, version: z.string().max(60).optional() }).optional(),
    resolvedVersionId: versionIdSchema.optional(),
    accountId: z.string().min(1).max(64).optional(),
    java: javaSettingSchema.optional(),
    memory: profileMemorySchema.optional(),
    window: windowSchema.optional(),
    jvmArgs: z.array(z.string().max(200)).max(64).optional(),
    gameArgs: z.array(z.string().max(200)).max(64).optional(),
    offlineSkins: z.boolean().optional(),
    lastPlayed: z.number().int().nonnegative().optional()
  })
})

export const accountIdSchema = z.object({ accountId: z.string().min(1).max(64) })
export const skinVariantSchema = z.enum(['classic', 'slim'])

export const yggdrasilLoginSchema = z.object({
  apiRoot: z.string().url().max(300),
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  serverName: z.string().max(60).optional()
})

export const modSourceSchema = z.enum(['modrinth', 'curseforge', 'local'])

const modIdSchema = z.object({ modId: z.string().min(1).max(64) })
const modProfileSchema = z.object({ profileId: z.string().min(1).max(64) })

export const modDependencySchema = z.object({
  kind: z.enum(['required', 'optional', 'incompatible', 'embedded']),
  projectId: z.string().max(64).optional(),
  versionId: z.string().max(64).optional()
})

export const contentKindSchema = z.enum(['mod', 'resourcepack', 'shader'])

export const modVersionSchema = z.object({
  source: modSourceSchema,
  contentKind: contentKindSchema.optional(),
  versionId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  title: z.string().max(200),
  versionNumber: z.string().max(120),
  gameVersions: z.array(z.string().max(40)).max(400),
  loaders: z.array(z.string().max(40)).max(40),
  releaseType: z.enum(['release', 'beta', 'alpha']),
  datePublished: z.string().max(40),
  downloadUrl: z.string().url().max(600),
  fileName: z.string().min(1).max(260),
  size: z.number().int().min(0),
  sha1: z.string().max(64),
  sha512: z.string().max(160).optional(),
  iconUrl: z.string().url().max(600).optional(),
  dependencies: z.array(modDependencySchema).max(200)
})

export const modSearchSchema = z.object({
  source: modSourceSchema,
  query: z.string().max(200),
  profileId: z.string().max(64).optional(),
  gameVersion: z.string().max(40).optional(),
  loader: loaderKindSchema.optional(),
  kind: contentKindSchema.optional(),
  sort: z.enum(['relevance', 'downloads', 'follows', 'newest', 'updated']).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
  limit: z.number().int().min(1).max(100).optional()
})

export const requestSchemas = {
  'app:info': empty,
  'window:minimize': empty,
  'window:toggleMaximize': empty,
  'window:close': empty,
  'window:state': empty,
  'settings:get': empty,
  'settings:patch': settingsPatchSchema,
  'settings:reset': empty,
  'background:choose': empty,
  'background:current': empty,
  'background:clear': empty,
  'system:openExternal': externalUrlSchema,
  'system:openFolder': openFolderSchema,
  'system:chooseDirectory': chooseDirectorySchema,
  'logs:tail': logsTailSchema,
  'logs:export': empty,
  'versions:list': z.object({ refresh: z.boolean().optional() }),
  'java:list': empty,
  'install:version': z.object({ versionId: versionIdSchema }),
  'install:cancel': z.object({ versionId: versionIdSchema }),
  'downloads:list': empty,
  'downloads:pause': taskIdSchema,
  'downloads:resume': taskIdSchema,
  'downloads:cancel': taskIdSchema,
  'downloads:retry': taskIdSchema,
  'downloads:clearFinished': empty,
  'downloads:reveal': taskIdSchema,
  'game:launch': gameLaunchSchema,
  'game:stop': z.object({ profileId: profileIdSchema }),
  'game:kill': z.object({ profileId: profileIdSchema }),
  'game:state': empty,
  'game:revealCrash': empty,
  'crash:verdict': z.object({ profileId: z.string().max(64).optional() }),
  'crash:applyFix': z.object({
    profileId: z.string().max(64).optional(),
    fixId: z.enum([
      'add-memory',
      'disable-suspects',
      'reinstall-suspects',
      'reset-java',
      'verify-files',
      'reveal-report'
    ])
  }),
  'crash:sendReport': z.object({ profileId: z.string().max(64).optional() }),
  'perf:presets': empty,
  'perf:apply': z.object({ profileId: profileIdSchema, preset: z.enum(['low', 'balanced', 'high']) }),
  'perf:boost': modProfileSchema,
  'discord:status': empty,
  'servers:list': empty,
  'servers:add': z.object({
    name: z.string().min(1).max(60),
    address: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65535).optional()
  }),
  'servers:update': z.object({
    id: z.string().min(1).max(64),
    patch: z.object({
      name: z.string().min(1).max(60).optional(),
      address: z.string().min(1).max(255).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      favorite: z.boolean().optional()
    })
  }),
  'servers:remove': z.object({ id: z.string().min(1).max(64) }),
  'servers:ping': z.object({ id: z.string().min(1).max(64) }),
  'servers:pingAll': empty,
  'servers:connect': z.object({ serverId: z.string().min(1).max(64), profileId: profileIdSchema }),
  'stats:list': empty,
  'themes:list': empty,
  'themes:apply': z.object({ id: z.string().min(1).max(64) }),
  'themes:import': empty,
  'themes:export': z.object({ id: z.string().min(1).max(64).optional() }),
  'themes:delete': z.object({ id: z.string().min(1).max(64) }),
  'accounts:list': empty,
  'accounts:active': empty,
  'accounts:setActive': accountIdSchema,
  'accounts:remove': accountIdSchema,
  'accounts:addGuest': z.object({ nickname: nicknameSchema }),
  'accounts:guestNicknames': empty,
  'accounts:signInMicrosoft': empty,
  'accounts:cancelSignIn': empty,
  'accounts:signInYggdrasil': yggdrasilLoginSchema,
  'accounts:chooseYggdrasilProfile': z.object({
    pendingId: z.string().min(1).max(64),
    profileId: z.string().min(1).max(64)
  }),
  'accounts:refresh': accountIdSchema,
  'accounts:skin': accountIdSchema,
  'accounts:importSkin': accountIdSchema.extend({ variant: skinVariantSchema }),
  'profiles:list': empty,
  'profiles:get': profileRefSchema,
  'profiles:create': profileCreateSchema,
  'profiles:update': profilePatchSchema,
  'profiles:duplicate': profileRefSchema,
  'profiles:delete': profileRefSchema.extend({ deleteFiles: z.boolean() }),
  'profiles:install': profileRefSchema.extend({ verify: z.boolean().optional() }),
  'profiles:launch': profileRefSchema,
  'profiles:openFolder': profileRefSchema.extend({
    sub: z
      .enum(['mods', 'saves', 'config', 'logs', 'crash-reports', 'resourcepacks', 'shaderpacks'])
      .optional()
  }),
  'profiles:loaderVersions': z.object({ kind: loaderKindSchema, gameVersion: versionIdSchema }),
  'profiles:templates': empty,
  'profiles:createFromTemplate': z.object({
    templateId: z.string().min(1).max(64),
    name: z.string().min(1).max(60).optional()
  }),
  'mods:search': modSearchSchema,
  'mods:project': z.object({ source: modSourceSchema, projectId: z.string().min(1).max(64) }),
  'mods:versions': z.object({
    source: modSourceSchema,
    projectId: z.string().min(1).max(64),
    profileId: z.string().min(1).max(64),
    kind: contentKindSchema.optional()
  }),
  'mods:plan': modProfileSchema.extend({ version: modVersionSchema }),
  'mods:install': modProfileSchema.extend({
    version: modVersionSchema,
    withDependencies: z.boolean().optional()
  }),
  'mods:remove': modIdSchema,
  'mods:toggle': modIdSchema.extend({ enabled: z.boolean() }),
  'mods:update': modIdSchema.extend({ version: modVersionSchema }),
  'mods:list': modProfileSchema,
  'mods:scan': modProfileSchema,
  'mods:updates': modProfileSchema,
  'mods:updateAll': modProfileSchema,
  'mods:pin': modIdSchema.extend({ pinned: z.boolean() }),
  'mods:rollback': modIdSchema,
  'mods:openFolder': modProfileSchema,
  'mods:importPack': empty,
  'mods:exportPack': modProfileSchema.extend({ includeConfigs: z.boolean().optional() }),
  'mods:setCurseforgeKey': z.object({ key: z.string().max(200) }),
  'mods:curseforgeReady': empty,
  'news:list': z.object({ refresh: z.boolean().optional() }),
  'news:openReleases': empty,
  'updates:state': empty,
  'updates:check': empty,
  'updates:download': empty,
  'updates:install': empty
} as const satisfies Record<IpcChannel, z.ZodType>

export type RequestSchemas = typeof requestSchemas

export const memorySchema = z
  .object({
    minMb: z.number().int().min(512).max(MEMORY.maxMb),
    maxMb: z.number().int().min(MEMORY.minMb).max(MEMORY.maxMb),
    auto: z.boolean()
  })
  .refine((memory) => memory.minMb <= memory.maxMb, {
    message: 'Минимум памяти не может превышать максимум'
  })

export const loaderSchema = z.object({
  kind: z.enum(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']),
  version: z.string().min(1).optional()
})
