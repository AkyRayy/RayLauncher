export const APP_NAME = 'RayLauncher'
export const APP_USER_AGENT = 'RayLauncher/1.0.0 (+https://github.com/raylauncher/raylauncher)'

export const DEFAULT_MS_CLIENT_ID = '00000000402b5328'

export const MOJANG = {
  versionManifest: 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
  javaRuntimeManifest:
    'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json',
  resources: 'https://resources.download.minecraft.net',
  news: 'https://launchercontent.mojang.com/v2/news.json',
  newsAssets: 'https://launchercontent.mojang.com',
  libraries: 'https://libraries.minecraft.net/'
} as const

export const AUTH = {
  authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  scope: 'XboxLive.signin offline_access',
  xboxLive: 'https://user.auth.xboxlive.com/user/authenticate',
  xsts: 'https://xsts.auth.xboxlive.com/xsts/authorize',
  loginWithXbox: 'https://api.minecraftservices.com/authentication/login_with_xbox',
  entitlements: 'https://api.minecraftservices.com/entitlements/mcstore',
  profile: 'https://api.minecraftservices.com/minecraft/profile',
  timeoutMs: 5 * 60 * 1000
} as const

export const MODRINTH = {
  base: 'https://api.modrinth.com/v2',
  cdn: 'https://cdn.modrinth.com/data',
  rateLimit: 300
} as const

export const CURSEFORGE = {
  base: 'https://api.curseforge.com/v1',
  gameId: 432,
  classId: { mods: 6, modpacks: 4471, resourcePacks: 12, shaders: 6552, worlds: 17 }
} as const

export const LOADERS = {
  fabricMeta: 'https://meta.fabricmc.net/v2',
  quiltMeta: 'https://meta.quiltmc.org/v3',
  neoforgeMaven: 'https://maven.neoforged.net/api/maven/latest/version/releases/net/neoforged/neoforge',
  forgePromotions: 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
  fabricMavenRepo: 'https://maven.fabricmc.net/',
  neoforgeMavenRepo: 'https://maven.neoforged.net/releases/',
  forgeMavenRepo: 'https://maven.minecraftforge.net/'
} as const

export const AUTHLIB_INJECTOR = {
  version: '1.2.8',
  releaseApi: 'https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest'
} as const

export const RELEASES = {
  api: 'https://api.github.com/repos/raylauncher/raylauncher/releases?per_page=10',
  page: 'https://github.com/raylauncher/raylauncher/releases',
  cacheTtlMs: 15 * 60 * 1000
} as const

export const NETWORK = {
  requestTimeoutMs: 30_000,
  retries: 3,
  retryBaseMs: 500,
  defaultConcurrency: 8,
  minConcurrency: 1,
  maxConcurrency: 32
} as const

export const MEMORY = {
  minMb: 1024,
  maxMb: 32_768,
  warnRatio: 0.75
} as const

export const LIMITS = {
  maxPathLength: 240,
  nicknamePattern: /^[A-Za-z0-9_]{3,16}$/,
  logRotationMb: 10,
  logRotationCount: 5
} as const

export const EXTERNAL_LINK_ALLOWLIST: readonly string[] = [
  'minecraft.net',
  'www.minecraft.net',
  'modrinth.com',
  'cdn.modrinth.com',
  'curseforge.com',
  'www.curseforge.com',
  'console.curseforge.com',
  'github.com',
  'api.github.com',
  'launchercontent.mojang.com',
  'fabricmc.net',
  'neoforged.net',
  'quiltmc.org',
  'minecraftforge.net',
  'files.minecraftforge.net',
  'account.microsoft.com',
  'login.live.com'
]
