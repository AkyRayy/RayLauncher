const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б'
  if (bytes < KB) return `${Math.round(bytes)} Б`
  if (bytes < MB) return `${round(bytes / KB, 0)} КБ`
  if (bytes < GB) return `${round(bytes / MB, 1)} МБ`
  return `${round(bytes / GB, 2)} ГБ`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/с`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} ч ${minutes} мин`
  if (minutes > 0) return `${minutes} мин ${seconds} с`
  return `${seconds} с`
}

export function formatMemory(megabytes: number): string {
  return megabytes >= 1024 ? `${round(megabytes / 1024, 1)} ГБ` : `${megabytes} МБ`
}

function round(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.?0+$/, '')
    .replace('.', ',')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function recommendedMaxMemoryMb(totalMemoryMb: number): number {
  return clamp(Math.floor(Math.min(8192, totalMemoryMb * 0.5)), 1024, 32_768)
}

export function smoothSpeed(previous: number | undefined, next: number, alpha = 0.3): number {
  if (previous === undefined || previous <= 0) return next
  return previous * (1 - alpha) + next * alpha
}

export function uuidWithDashes(uuid: string): string {
  const raw = uuid.replace(/-/g, '')
  if (raw.length !== 32) return uuid
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}

export function uuidWithoutDashes(uuid: string): string {
  return uuid.replace(/-/g, '')
}
