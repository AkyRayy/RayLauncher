import { useNavigate } from 'react-router-dom'
import { useI18n } from '@renderer/i18n'
import { formatDate, useLocale } from '@renderer/lib/format'
import { api } from '@renderer/lib/api'
import { Skeleton } from '@renderer/components/ui/Skeleton'
import { NewsIcon } from '@renderer/components/icons'
import type { NewsItem } from '@shared/types'

export function NewsCard({
  items,
  loading
}: {
  items: readonly NewsItem[]
  loading: boolean
}): React.ReactElement {
  const t = useI18n()
  const locale = useLocale()
  const navigate = useNavigate()

  return (
    <section className="flex min-h-[200px] flex-col rounded-lg bg-surface shadow-soft">
      <header className="flex items-center justify-between px-4 py-3 hairline-b">
        <h2 className="text-sm font-semibold text-ink">{t.news.title}</h2>
        <button type="button" onClick={() => navigate('/news')} className="text-xs text-accent hover:underline">
          {t.home.allNews}
        </button>
      </header>

      {loading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="flex flex-1 items-center gap-2 px-4 text-sm text-muted">
          <NewsIcon size={15} />
          {t.news.emptyTitle}
        </p>
      ) : (
        <ul className="inset-list flex-1 py-1">
          {items.slice(0, 3).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => (item.link ? void api.system.openExternal(item.link) : navigate('/news'))}
                className="flex h-[60px] w-full items-center gap-3 px-3 text-left hover:bg-fill"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm text-ink">{item.title}</span>
                  <span className="mt-0.5 block text-2xs text-faint">
                    {formatDate(item.date, locale)}
                  </span>
                </span>
                {item.imageUrl !== undefined && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="h-10 w-[68px] shrink-0 rounded-sm object-cover"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
