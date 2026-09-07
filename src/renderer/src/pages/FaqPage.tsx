import { useI18n } from '@renderer/i18n'
import { Page } from '@renderer/components/chrome/Page'
import { Card } from '@renderer/components/ui/Card'
import { ChevronIcon } from '@renderer/components/icons'

export function FaqPage(): React.ReactElement {
  const t = useI18n()

  return (
    <Page title={t.faq.title} subtitle={t.faq.subtitle}>
      <div className="mx-auto max-w-3xl space-y-2">
        {t.faq.items.map((item) => (
          <Card key={item.q} className="overflow-hidden">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronIcon
                  size={14}
                  className="shrink-0 text-faint transition-transform duration-150 group-open:rotate-180"
                />
              </summary>
              <p className="px-4 pb-3 text-sm leading-6 text-muted">{item.a}</p>
            </details>
          </Card>
        ))}
      </div>
    </Page>
  )
}
