import type { LoaderKind } from '@shared/types'

export interface LoaderVersion {
  id: string
  stable: boolean
  recommended?: boolean
}

export interface LoaderProvider {
  kind: Exclude<LoaderKind, 'vanilla'>
  listGameVersions(): Promise<string[]>
  listVersions(gameVersion: string): Promise<LoaderVersion[]>
  install(gameVersion: string, loaderVersion: string, javaPath: string): Promise<string>
}
