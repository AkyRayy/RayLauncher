import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { listSpring } from '@renderer/lib/motion'
import { Page } from '@renderer/components/chrome/Page'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Skeleton } from '@renderer/components/ui/Skeleton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ExternalIcon, NewsIcon, RefreshIcon } from '@renderer/components/icons'
import { useSettingsStore } from '@renderer/stores/settings.store'
import type { NewsFeed, NewsItem, NewsSource } from '@shared/types'

type Filter = NewsSource | 'all'

export function NewsPage(): React.ReactElement {
  const t = useI18n()
  const language = useSettingsStore((state) => state.settings.language)

  const [feed, setFeed] = useState<NewsFeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let alive = true
    api.news
      .list()
      .then((result) => {
        if (alive) setFeed(result)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const refresh = (): void => {
    setLoading(true)
    void api.news
      .list(true)
      .then(setFeed)
      .finally(() => setLoading(false))
  }

  const items = useMemo(() => {
    const all = feed?.items ?? []
    return filter === 'all' ? all : all.filter((item) => item.source === filter)
  }, [feed, filter])

  return (
    <Page
      title={t.news.title}
      subtitle={t.news.subtitle}
      actions={
        <div className="flex items-center gap-2">
          <SegmentedControl
            ariaLabel={t.news.filterAll}
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t.news.filterAll },
              { value: 'launcher', label: t.news.sourceLauncher },
              { value: 'minecraft', label: t.news.sourceMinecraft }
            ]}
          />
          <Button size="sm" icon={<RefreshIcon size={14} />} disabled={loading} onClick={refresh}>
            {loading ? t.news.refreshing : t.news.refresh}
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl">
        {feed?.fromCache && <p className="mb-4 text-xs text-warning">{t.news.fromCache}</p>}

        {loading && !feed && (
          <ul className="space-y-3">
            {[0, 1, 2].map((index) => (
              <li key={index}>
                <Skeleton className="h-36 rounded-lg" />
              </li>
            ))}
          </ul>
        )}

        {!loading && items.length === 0 && (
          <EmptyState
            icon={<NewsIcon size={26} />}
            title={t.news.emptyTitle}
            body={t.news.emptyBody}
            action={
              <Button variant="secondary" onClick={refresh}>
                {t.news.refresh}
              </Button>
            }
          />
        )}

        {items.length > 0 && (
          <ul className="space-y-3">
            {items.map((item) => (
              <NewsCard key={item.id} item={item} language={language} />
            ))}
          </ul>
        )}

        {feed && feed.items.length > 0 && (
          <footer className="mt-6 flex items-center justify-between">
            <span className="text-xs text-faint">
              {t.news.updatedAt(new Date(feed.fetchedAt).toLocaleTimeString(language))}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void api.news.openReleases()}>
              {t.news.allReleases}
            </Button>
          </footer>
        )}
      </div>
    </Page>
  )
}

function NewsCard({ item, language }: { item: NewsItem; language: 'ru' | 'en' }): React.ReactElement {
  const t = useI18n()
  const isLauncher = item.source === 'launcher'

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={listSpring}>
      <Card className="overflow-hidden">
        <article className={cn('flex gap-4 p-4', item.imageUrl && 'p-0')}>
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="h-auto w-44 shrink-0 self-stretch bg-fill object-cover"
            />
          )}

          <div className={cn('min-w-0 flex-1', item.imageUrl && 'py-4 pr-4')}>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'rounded-sm px-1.5 py-0.5 font-medium',
                  isLauncher ? 'bg-accent/12 text-accent' : 'bg-fill text-muted'
                )}
              >
                {isLauncher ? t.news.sourceLauncher : t.news.sourceMinecraft}
              </span>
              <span className="text-faint">{formatDate(item.date, language)}</span>
              {!isLauncher && <span className="truncate text-faint">{item.category}</span>}
            </div>

            <h2 className="mt-2 text-base font-semibold leading-snug text-ink">{item.title}</h2>
            {item.summary && <p className="mt-1.5 text-sm leading-6 text-muted">{item.summary}</p>}

            {item.bodyHtml && (
              <div
                className="news-body mt-3 text-sm leading-6 text-muted"
                dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
              />
            )}

            {item.link && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 -ml-2"
                icon={<ExternalIcon size={13} />}
                onClick={() => void api.system.openExternal(item.link ?? '')}
              >
                {isLauncher ? t.news.openRelease : t.news.readMore}
              </Button>
            )}
          </div>
        </article>
      </Card>
    </motion.li>
  )
}

function formatDate(iso: string, language: 'ru' | 'en'): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' })
}
