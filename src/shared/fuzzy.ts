export interface FuzzyMatch {
  score: number
  indices: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return { score: 0, indices: [] }

  const haystack = target.toLowerCase()
  const indices: number[] = []

  let score = 0
  let cursor = 0
  let previous = -2

  for (const char of needle) {
    if (char === ' ') continue

    const found = haystack.indexOf(char, cursor)
    if (found === -1) return null

    const startsWord = found === 0 || /[\s._\-/]/.test(haystack[found - 1] ?? '')
    if (startsWord) score += 8
    if (found === previous + 1) score += 5
    score += Math.max(0, 4 - found / 12)

    indices.push(found)
    previous = found
    cursor = found + 1
  }

  score += Math.max(0, 10 - target.length / 6)
  return { score, indices }
}

export interface Ranked<T> {
  item: T
  score: number
  indices: number[]
}

export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  keyOf: (item: T) => string
): Array<Ranked<T>> {
  const ranked: Array<Ranked<T>> = []

  for (const item of items) {
    const match = fuzzyMatch(query, keyOf(item))
    if (match) ranked.push({ item, score: match.score, indices: match.indices })
  }

  return ranked.sort((left, right) => right.score - left.score)
}

export function highlightParts(
  text: string,
  indices: readonly number[]
): Array<{ text: string; hit: boolean }> {
  if (indices.length === 0) return [{ text, hit: false }]

  const set = new Set(indices)
  const parts: Array<{ text: string; hit: boolean }> = []
  let buffer = ''
  let bufferHit = set.has(0)

  for (let index = 0; index < text.length; index += 1) {
    const hit = set.has(index)
    if (hit !== bufferHit && buffer.length > 0) {
      parts.push({ text: buffer, hit: bufferHit })
      buffer = ''
    }
    bufferHit = hit
    buffer += text[index] ?? ''
  }

  if (buffer.length > 0) parts.push({ text: buffer, hit: bufferHit })
  return parts
}
