import { z } from 'zod'
import { MOJANG, RELEASES } from '@shared/constants'
import type { NewsFeed, NewsItem } from '@shared/types'
import { getJson } from '../core/http'
import { readCache, readStaleCache, writeCache } from '../db/cache.repo'
import { logger } from '../logger'
import { firstParagraph, markdownToSafeHtml } from './markdown'

const CACHE_KEY = 'news:feed:v1'

const imageSchema = z.object({ url: z.string().optional() }).nullish()

// Реальный news.json Mojang ставит null в tag/category/text/newsType у части записей,
// поэтому все необязательные поля — nullish. Каждая запись проверяется отдельно:
// одна битая запись пропускается, а не роняет всю ленту.
const mojangEntrySchema = z.object({
  id: z.string().nullish(),
  title: z.string(),
  tag: z.string().nullish(),
  category: z.string().nullish(),
  date: z.string().nullish(),
  text: z.string().nullish(),
  newsPageImage: imageSchema,
  playPageImage: imageSchema,
  readMoreLink: z.string().nullish(),
  newsType: z.array(z.string()).nullish()
})

const mojangSchema = z
  .object({
    version: z.number().optional(),
    entries: z.array(z.unknown()).nullish()
  })
  .nullish()

const releasesSchema = z.array(
  z.object({
    id: z.number(),
    tag_name: z.string(),
    name: z.string().nullish(),
    body: z.string().nullish(),
    html_url: z.string(),
    published_at: z.string().nullish(),
    draft: z.boolean().nullish().transform((value) => value ?? false),
    prerelease: z.boolean().nullish().transform((value) => value ?? false)
  })
)

export async function fetchNews(refresh = false): Promise<NewsFeed> {
  if (!refresh) {
    const cached = readCache<NewsFeed>(CACHE_KEY)
    if (cached) return { ...cached, fromCache: true }
  }

  const [minecraft, launcher] = await Promise.all([
    fetchMinecraftNews().catch((error: unknown) => {
      logger.warn(`Новости Minecraft недоступны: ${messageOf(error)}`)
      return [] as NewsItem[]
    }),
    fetchLauncherReleases().catch((error: unknown) => {
      logger.warn(`Релизы лаунчера недоступны: ${messageOf(error)}`)
      return [] as NewsItem[]
    })
  ])

  const items = [...launcher, ...minecraft].sort(
    (left, right) => Date.parse(right.date) - Date.parse(left.date)
  )

  if (items.length === 0) {
    const stale = readStaleCache<NewsFeed>(CACHE_KEY)
    if (stale) return { ...stale, fromCache: true }
    return { items: [], fetchedAt: Date.now(), fromCache: false }
  }

  const feed: NewsFeed = { items, fetchedAt: Date.now(), fromCache: false }
  writeCache(CACHE_KEY, feed, RELEASES.cacheTtlMs)
  logger.info(`Лента новостей обновлена: ${items.length} записей`)

  return feed
}

async function fetchMinecraftNews(): Promise<NewsItem[]> {
  const data = await getJson(MOJANG.news, mojangSchema)
  const entries = data?.entries ?? []

  const items: NewsItem[] = []
  for (const [index, raw] of entries.entries()) {
    const item = toMinecraftItem(raw, index)
    if (item) items.push(item)
    if (items.length >= 24) break
  }
  return items
}

/** Превращает одну сырую запись Mojang в карточку ленты. null — запись пропускается. */
export function toMinecraftItem(raw: unknown, index: number): NewsItem | null {
  const parsed = mojangEntrySchema.safeParse(raw)
  if (!parsed.success) {
    logger.debug(`Пропускаю новость Mojang #${index}: неожиданный формат записи`)
    return null
  }

  const entry = parsed.data
  if (entry.title.trim().length === 0) return null

  const newsType = entry.newsType ?? []
  if (newsType.length > 0 && !newsType.includes('Java')) return null

  const date = entry.date ?? ''
  const image = entry.newsPageImage?.url ?? entry.playPageImage?.url
  return {
    id: entry.id ?? `mc-${date}-${index}`,
    source: 'minecraft' as const,
    title: entry.title,
    summary: (entry.text ?? '').trim(),
    date: normalizeDate(date),
    category: entry.category ?? entry.tag ?? 'Minecraft',
    ...(image ? { imageUrl: absoluteImage(image) } : {}),
    ...(entry.readMoreLink ? { link: entry.readMoreLink } : {})
  }
}

export function absoluteImage(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `${MOJANG.newsAssets}${url.startsWith('/') ? '' : '/'}${url}`
}

export function normalizeDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString()
}

async function fetchLauncherReleases(): Promise<NewsItem[]> {
  const releases = await getJson(RELEASES.api, releasesSchema, {
    headers: { Accept: 'application/vnd.github+json' }
  })

  return releases
    .filter((release) => !release.draft)
    .slice(0, 10)
    .map((release) => {
      const body = release.body ?? ''
      return {
        id: `release-${release.id}`,
        source: 'launcher' as const,
        title: release.name?.trim().length ? release.name : release.tag_name,
        summary: firstParagraph(body),
        date: normalizeDate(release.published_at ?? ''),
        category: release.prerelease ? 'Бета-версия' : 'Обновление лаунчера',
        link: release.html_url,
        ...(body.trim().length > 0 ? { bodyHtml: markdownToSafeHtml(body) } : {})
      }
    })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
