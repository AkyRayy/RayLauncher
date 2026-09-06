import { spawn } from 'node:child_process'
import { win32 as path } from 'node:path'
import { RayError } from '@shared/errors'
import { pathExists } from '../../core/fsx'

export interface JavaProbe {
  path: string
  version: string
  majorVersion: number
  vendor: string
}

export async function resolveJavaExecutable(input: string): Promise<string> {
  const candidates = input.toLowerCase().endsWith('.exe')
    ? [input]
    : [path.join(input, 'java.exe'), path.join(input, 'bin', 'java.exe')]

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }
  throw new RayError('JAVA_MISSING', `java.exe не найден по пути ${input}`, { input })
}

export async function probeJava(input: string): Promise<JavaProbe> {
  const executable = await resolveJavaExecutable(input)
  const output = await run(executable, ['-version'])
  const version = parseVersion(output)

  if (!version) {
    throw new RayError('JAVA_VERSION_MISMATCH', `Не удалось определить версию Java: ${executable}`, {
      path: executable
    })
  }

  return {
    path: executable,
    version: version.raw,
    majorVersion: version.major,
    vendor: parseVendor(output)
  }
}

export function assertJavaMajor(probe: JavaProbe, expected: number): void {
  if (probe.majorVersion !== expected) {
    throw new RayError(
      'JAVA_VERSION_MISMATCH',
      `Нужна Java ${expected}, а по указанному пути Java ${probe.majorVersion}`,
      { expected, actual: probe.majorVersion, path: probe.path }
    )
  }
}

export function parseVersion(output: string): { raw: string; major: number } | null {
  const match = /version "([^"]+)"/.exec(output) ?? /openjdk ([\d._]+)/i.exec(output)
  const raw = match?.[1]
  if (!raw) return null

  const legacy = /^1\.(\d+)/.exec(raw)
  if (legacy?.[1]) return { raw, major: Number(legacy[1]) }

  const modern = /^(\d+)/.exec(raw)
  if (modern?.[1]) return { raw, major: Number(modern[1]) }

  return null
}

function parseVendor(output: string): string {
  if (/temurin|adoptium/i.test(output)) return 'Eclipse Temurin'
  if (/graalvm/i.test(output)) return 'GraalVM'
  if (/zulu/i.test(output)) return 'Azul Zulu'
  if (/microsoft/i.test(output)) return 'Microsoft Build of OpenJDK'
  if (/openjdk/i.test(output)) return 'OpenJDK'
  return 'Java'
}

function run(executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    let output = ''

    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
    child.on('error', (error) => reject(RayError.from(error, 'JAVA_MISSING')))
    child.on('close', () => resolve(output))
  })
}
