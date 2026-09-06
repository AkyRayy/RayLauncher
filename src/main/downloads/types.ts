import type { DownloadKind } from '@shared/types'

export interface DownloadSpec {
  kind: DownloadKind
  url: string
  dest: string
  sha1?: string
  size: number
  label: string
  fallbackUrls?: string[]
  profileId?: string
}
