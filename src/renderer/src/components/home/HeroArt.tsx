import { useState } from 'react'
import islandArt from '@renderer/assets/hero-island.jpg'
import portalArt from '@renderer/assets/hero-portal.jpg'
import type { NewsItem } from '@shared/types'

const LOCAL_ART = [islandArt, portalArt]

const SCRIM =
  'linear-gradient(100deg, var(--surface) 4%, color-mix(in srgb, var(--surface) 92%, transparent) 26%, color-mix(in srgb, var(--surface) 55%, transparent) 52%, color-mix(in srgb, var(--surface) 18%, transparent) 78%, transparent 100%)'

const SCRIM_BOTTOM =
  'linear-gradient(to top, color-mix(in srgb, var(--surface) 70%, transparent), transparent 46%)'

export interface HeroArtwork {
  src: string
  kind: 'local' | 'news'
  caption?: string
}

function hash(value: string): number {
  let sum = 0
  for (let index = 0; index < value.length; index += 1) sum = (sum * 31 + value.charCodeAt(index)) % 9973
  return sum
}

function localArtFor(versionId: string): string {
  return LOCAL_ART[hash(versionId) % LOCAL_ART.length] ?? islandArt
}

export function pickArtwork(versionId: string, news: readonly NewsItem[]): HeroArtwork {
  const needle = versionId.toLowerCase()
  const match = news.find(
    (item) =>
      item.imageUrl !== undefined &&
      item.source === 'minecraft' &&
      (item.title.toLowerCase().includes(needle) || item.summary.toLowerCase().includes(needle))
  )

  if (match?.imageUrl !== undefined) {
    return { src: match.imageUrl, kind: 'news', caption: match.title }
  }

  return { src: localArtFor(versionId), kind: 'local' }
}

export function HeroArt({
  versionId,
  news,
  sourceLabel
}: {
  versionId: string
  news: readonly NewsItem[]
  sourceLabel: string
}): React.ReactElement {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)

  const artwork = pickArtwork(versionId, news)
  const showNews = artwork.kind === 'news' && artwork.src !== brokenSrc
  const src = showNews ? artwork.src : localArtFor(versionId)

  return (
    <figure className="pointer-events-none absolute inset-0 m-0 select-none overflow-hidden rounded-xl">
      <img
        key={src}
        src={src}
        alt=""
        aria-hidden
        onError={() => setBrokenSrc(artwork.src)}
        className="ray-hero-fade h-full w-full object-cover"
        style={{ objectPosition: showNews ? '58% 42%' : '66% 46%' }}
      />
      <div className="absolute inset-0" style={{ background: SCRIM }} />
      <div className="absolute inset-0" style={{ background: SCRIM_BOTTOM }} />
      {showNews && artwork.caption !== undefined && (
        <figcaption className="absolute bottom-3 right-5 max-w-[46%] truncate text-2xs text-faint">
          {sourceLabel}: {artwork.caption}
        </figcaption>
      )}
    </figure>
  )
}
