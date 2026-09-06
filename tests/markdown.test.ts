import { describe, expect, it } from 'vitest'
import { escapeHtml, firstParagraph, markdownToSafeHtml, renderMarkdown } from '@main/news/markdown'

describe('renderMarkdown', () => {
  it('заголовки любого уровня опускаются до h3/h4', () => {
    expect(renderMarkdown('# Версия 1.1')).toBe('<h3>Версия 1.1</h3>')
    expect(renderMarkdown('#### Мелочи')).toBe('<h4>Мелочи</h4>')
  })

  it('собирает маркированный список в один ul', () => {
    const html = renderMarkdown('- первый\n- второй')
    expect(html).toBe('<ul>\n<li>первый</li>\n<li>второй</li>\n</ul>')
  })

  it('нумерованный список остаётся ol', () => {
    expect(renderMarkdown('1. раз\n2. два')).toContain('<ol>')
  })

  it('соседние строки склеиваются в один абзац, пустая строка разделяет', () => {
    const html = renderMarkdown('первая\nвторая\n\nтретья')
    expect(html).toBe('<p>первая вторая</p>\n<p>третья</p>')
  })

  it('блок кода не разбирается как разметка', () => {
    const html = renderMarkdown('```\n**не жирный**\n```')
    expect(html).toBe('<pre><code>**не жирный**</code></pre>')
  })

  it('инлайновый код сохраняет звёздочки', () => {
    expect(renderMarkdown('текст `a*b*c` дальше')).toContain('<code>a*b*c</code>')
  })

  it('жирный, наклонный и зачёркнутый', () => {
    const html = renderMarkdown('**жирный** и _наклонный_ и ~~старый~~')
    expect(html).toContain('<strong>жирный</strong>')
    expect(html).toContain('<em>наклонный</em>')
    expect(html).toContain('<del>старый</del>')
  })

  it('ссылка превращается в a, картинка — в подпись', () => {
    expect(renderMarkdown('[сайт](https://example.com)')).toContain(
      '<a href="https://example.com">сайт</a>'
    )
    expect(renderMarkdown('![скрин](https://example.com/a.png)')).toBe('<p>скрин</p>')
  })
})

describe('markdownToSafeHtml', () => {
  it('вырезает script целиком', () => {
    const html = markdownToSafeHtml('Привет <script>alert(1)</script> мир')
    expect(html).not.toContain('script')
    expect(html).not.toContain('alert')
  })

  it('снимает обработчики событий, но оставляет текст', () => {
    const html = markdownToSafeHtml('<div onclick="steal()">клик</div>')
    expect(html).not.toContain('onclick')
    expect(html).toContain('клик')
  })

  it('не пропускает javascript: в ссылке', () => {
    const html = markdownToSafeHtml('[жми](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('не пропускает data: в ссылке', () => {
    expect(markdownToSafeHtml('[жми](data:text/html;base64,PHNjcmlwdD4=)')).not.toContain('data:')
  })

  it('добавляет rel к внешним ссылкам', () => {
    expect(markdownToSafeHtml('[сайт](https://example.com)')).toContain('rel="noreferrer noopener"')
  })

  it('оставляет разрешённую разметку', () => {
    const html = markdownToSafeHtml('## Что нового\n\n- быстрее\n- надёжнее')
    expect(html).toContain('<h3>Что нового</h3>')
    expect(html).toContain('<li>быстрее</li>')
  })

  it('чужой тег вырезается вместе с содержимым скрипта', () => {
    const html = markdownToSafeHtml('До <iframe src="https://evil.example"></iframe> после')
    expect(html).not.toContain('iframe')
    expect(html).toContain('До')
    expect(html).toContain('после')
  })
})

describe('firstParagraph', () => {
  it('пропускает заголовок и берёт первую содержательную строку', () => {
    expect(firstParagraph('# Заголовок\n\nПервая строка описания.')).toBe('Первая строка описания.')
  })

  it('снимает разметку и обрезает по длине', () => {
    const long = `**${'а'.repeat(300)}**`
    const result = firstParagraph(long, 50)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(50)
    expect(result).not.toContain('*')
  })

  it('пустой текст даёт пустую строку', () => {
    expect(firstParagraph('   \n\n')).toBe('')
  })
})

describe('escapeHtml', () => {
  it('экранирует пять опасных символов', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})
