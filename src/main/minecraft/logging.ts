import { win32 as path } from 'node:path'
import { paths } from '../core/paths'
import type { DownloadSpec } from '../downloads/types'
import type { VersionJson } from './versionJson'

export interface LoggingPlan {
  download: DownloadSpec
  argument: string
}

export function planLogging(version: VersionJson): LoggingPlan | null {
  const client = version.logging?.client
  if (!client) return null

  const dest = path.join(paths().assets, 'log_configs', client.file.id)

  return {
    download: {
      kind: 'library',
      url: client.file.url,
      dest,
      sha1: client.file.sha1,
      size: client.file.size,
      label: client.file.id
    },
    argument: client.argument.replace('${path}', dest)
  }
}
