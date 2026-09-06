import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { Page } from '@renderer/components/chrome/Page'
import { Button } from '@renderer/components/ui/Button'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { TextInput } from '@renderer/components/ui/Field'
import { Switch } from '@renderer/components/ui/Switch'
import { CopyIcon, DownloadIcon, SearchIcon } from '@renderer/components/icons'
import type { LogLine, LogLevel } from '@shared/types'

type LevelFilter = LogLevel | 'all'

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-faint',
  info: 'text-muted',
  warn: 'text-warning',
  error: 'text-danger'
}

export function LogsPage(): React.ReactElement {
  const t = useI18n()
  const [lines, setLines] = useState<LogLine[]>([])
  const [level, setLevel] = useState<LevelFilter>('all')
  const [query, setQuery] = useState('')
  const [autoscroll, setAutoscroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void api.logs.tail(500).then(setLines)
    return api.on['launcher:log']((line) => {
      setLines((previous) => [...previous.slice(-1499), line])
    })
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return lines.filter(
      (line) =>
        (level === 'all' || line.level === level) &&
        (needle.length === 0 || line.text.toLowerCase().includes(needle))
    )
  }, [lines, level, query])

  useEffect(() => {
    if (!autoscroll || !viewport.current) return
    viewport.current.scrollTop = viewport.current.scrollHeight
  }, [visible, autoscroll])

  const copyAll = async (): Promise<void> => {
    await navigator.clipboard.writeText(visible.map(formatLine).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Page
      title={t.logs.title}
      subtitle={t.logs.subtitle}
      scroll={false}
      actions={
        <>
          <Button size="sm" icon={<CopyIcon size={14} />} onClick={() => void copyAll()}>
            {copied ? t.logs.copied : t.logs.copy}
          </Button>
          <Button size="sm" icon={<DownloadIcon size={14} />} onClick={() => void api.logs.export()}>
            {t.logs.export}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SegmentedControl
          size="sm"
          ariaLabel={t.logs.levels.all}
          value={level}
          onChange={setLevel}
          options={[
            { value: 'all', label: t.logs.levels.all },
            { value: 'debug', label: t.logs.levels.debug },
            { value: 'info', label: t.logs.levels.info },
            { value: 'warn', label: t.logs.levels.warn },
            { value: 'error', label: t.logs.levels.error }
          ]}
        />

        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint">
            <SearchIcon size={14} />
          </span>
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.logs.search}
            aria-label={t.logs.search}
            className="h-7 w-64 pl-8 text-xs"
          />
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          {t.logs.autoscroll}
          <Switch checked={autoscroll} onChange={setAutoscroll} label={t.logs.autoscroll} />
        </label>
      </div>

      <div
        ref={viewport}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-surface p-3 font-mono text-xs leading-5 shadow-soft"
      >
        {visible.length === 0 ? (
          <p className="p-4 text-center text-muted">{t.logs.empty}</p>
        ) : (
          visible.map((line, index) => (
            <div key={`${line.time}-${index}`} className="flex gap-3 whitespace-pre-wrap break-all">
              <span className="shrink-0 text-faint">{time(line.time)}</span>
              <span className={`w-12 shrink-0 uppercase ${LEVEL_COLOR[line.level]}`}>{line.level}</span>
              <span className="text-ink">{line.text}</span>
            </div>
          ))
        )}
      </div>
    </Page>
  )
}

function time(value: number): string {
  return new Date(value).toLocaleTimeString('ru-RU', { hour12: false })
}

function formatLine(line: LogLine): string {
  return `${new Date(line.time).toISOString()} [${line.level}] ${line.text}`
}
