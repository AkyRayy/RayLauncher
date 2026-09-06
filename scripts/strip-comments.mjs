import ts from 'typescript'
import { readFileSync, writeFileSync } from 'node:fs'

const MARK = '\u0000'

const KEEP = /^\/[/*]\s*(eslint-|@ts-|prettier-|<reference|@vite|webpack|#__PURE__)/

function scriptKind(file) {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

function collect(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file))
  const ranges = []
  const seen = new Set()

  const add = (pos, end) => {
    const key = `${pos}:${end}`
    if (seen.has(key)) return
    if (KEEP.test(text.slice(pos, end))) return
    seen.add(key)
    ranges.push({ pos, end })
  }

  const visit = (node) => {
    // {/* ... */} в JSX: остаток `{}` был бы мусором, убираем контейнер целиком.
    if (ts.isJsxExpression(node) && node.expression === undefined) {
      add(node.getStart(source), node.getEnd())
      return
    }

    const children = node.getChildren(source)
    if (children.length === 0) {
      for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
        add(range.pos, range.end)
      }
      for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) {
        add(range.pos, range.end)
      }
      return
    }
    for (const child of children) visit(child)
  }

  visit(source)
  return ranges
}

function stripTypeScript(file) {
  const text = readFileSync(file, 'utf8')
  const ranges = collect(file, text).sort((left, right) => right.pos - left.pos)
  if (ranges.length === 0) return false

  let out = text
  for (const range of ranges) {
    out = out.slice(0, range.pos) + MARK + out.slice(range.end)
  }
  writeFileSync(file, tidy(out), 'utf8')
  return true
}

/** Строка, где кроме комментария ничего не было, исчезает вместе с отступом. */
function tidy(text) {
  const kept = []
  for (const line of text.split('\n')) {
    if (line.includes(MARK) && line.replaceAll(MARK, '').trim().length === 0) continue
    kept.push(line.replaceAll(MARK, '').replace(/[ \t]+$/, ''))
  }

  return `${kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')}\n`
}

/** CSS и HTML разбираем отдельно: там свой синтаксис комментариев. */
function stripPlain(file, pattern) {
  const text = readFileSync(file, 'utf8')
  if (!pattern.test(text)) return false

  const out = text.replace(pattern, (match) => MARK.repeat(1) + ' '.repeat(0) + match.replace(/[^]/g, '') + MARK.repeat(0))
  writeFileSync(file, tidy(out), 'utf8')
  return true
}

const files = process.argv.slice(2)
let changed = 0

for (const file of files) {
  const done = file.endsWith('.css')
    ? stripPlain(file, /\/\*[^]*?\*\//g)
    : file.endsWith('.html')
      ? stripPlain(file, /<!--[^]*?-->/g)
      : stripTypeScript(file)

  if (done) changed += 1
}

console.log(`комментарии удалены: ${changed} из ${files.length}`)
