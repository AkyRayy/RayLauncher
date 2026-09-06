import sanitizeHtml from 'sanitize-html'

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'em',
    'del',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'a',
    'h3',
    'h4',
    'blockquote',
    'hr'
  ],
  allowedAttributes: { a: ['href', 'title', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: 'noreferrer noopener' }
    })
  }
}

export function markdownToSafeHtml(markdown: string): string {
  return sanitizeHtml(renderMarkdown(markdown), SANITIZE_OPTIONS)
}

export function firstParagraph(markdown: string, limit = 220): string {
  const line = markdown
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0 && !item.startsWith('#') && !item.startsWith('<'))

  if (!line) return ''

  const plain = line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .trim()

  return plain.length > limit ? `${plain.slice(0, limit - 1).trimEnd()}…` : plain
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []

  let listTag: 'ul' | 'ol' | null = null
  let paragraph: string[] = []
  let inCode = false
  let code: string[] = []

  const closeParagraph = (): void => {
    if (paragraph.length === 0) return
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const closeList = (): void => {
    if (!listTag) return
    out.push(`</${listTag}>`)
    listTag = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = []
        inCode = false
      } else {
        closeParagraph()
        closeList()
        inCode = true
      }
      continue
    }

    if (inCode) {
      code.push(raw)
      continue
    }

    if (line.trim().length === 0) {
      closeParagraph()
      closeList()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      closeParagraph()
      closeList()
      const level = (heading[1] ?? '#').length <= 2 ? 'h3' : 'h4'
      out.push(`<${level}>${inline(heading[2] ?? '')}</${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeParagraph()
      closeList()
      out.push('<hr />')
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      closeParagraph()
      closeList()
      out.push(`<blockquote>${inline(quote[1] ?? '')}</blockquote>`)
      continue
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)

    if (bullet ?? numbered) {
      closeParagraph()
      const wanted: 'ul' | 'ol' = bullet ? 'ul' : 'ol'
      if (listTag !== wanted) {
        closeList()
        out.push(`<${wanted}>`)
        listTag = wanted
      }
      out.push(`<li>${inline((bullet ?? numbered)?.[1] ?? '')}</li>`)
      continue
    }

    paragraph.push(line.trim())
  }

  if (inCode && code.length > 0) {
    out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  }
  closeParagraph()
  closeList()

  return out.join('\n')
}

const MARKER = '\uE000'
const MARKER_PATTERN = /\uE000(\d+)\uE000/g

function inline(text: string): string {
  let result = text

  const codeSpans: string[] = []
  result = result.replace(/`([^`]+)`/g, (_match, content: string) => {
    codeSpans.push(content)
    return `${MARKER}${codeSpans.length - 1}${MARKER}`
  })

  result = result
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_match, label: string, href: string) =>
      isSafeHref(href) ? `<a href="${href}">${label}</a>` : label
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')

  return result.replace(MARKER_PATTERN, (_match, index: string) => {
    const content = codeSpans[Number(index)] ?? ''
    return `<code>${content}</code>`
  })
}

function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('mailto:')
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
