/**
 * Минимальный писатель ZIP-архивов без сжатия (метод store).
 * Нужен для экспорта .mrpack без новых зависимостей: yauzl умеет только читать.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let crc = n
    for (let k = 0; k < 8; k += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[n] = crc >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ (data[index] ?? 0)) & 0xff] as number ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: string
  data: Uint8Array
  crc: number
  offset: number
}

export class ZipBuilder {
  private readonly entries: ZipEntry[] = []
  private offset = 0

  addFile(name: string, data: Uint8Array | string): this {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const normalized = name.replace(/\\/g, '/').replace(/^\//, '')
    if (normalized.length === 0 || normalized.length > 65535) {
      throw new Error(`Некорректное имя файла в архиве: ${name}`)
    }
    this.entries.push({ name: normalized, data: bytes, crc: crc32(bytes), offset: this.offset })
    this.offset += 30 + Buffer.byteLength(normalized, 'utf8') + bytes.length
    return this
  }

  get fileCount(): number {
    return this.entries.length
  }

  build(): Buffer {
    const chunks: Buffer[] = []
    for (const entry of this.entries) {
      chunks.push(localHeader(entry), Buffer.from(entry.data))
    }

    const centralStart = this.offset
    const central: Buffer[] = []
    for (const entry of this.entries) {
      central.push(centralHeader(entry))
    }
    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0)

    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(this.entries.length, 8)
    end.writeUInt16LE(this.entries.length, 10)
    end.writeUInt32LE(centralSize, 12)
    end.writeUInt32LE(centralStart, 16)
    end.writeUInt16LE(0, 20)

    return Buffer.concat([...chunks, ...central, end])
  }
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() >> 1) & 31)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

function localHeader(entry: ZipEntry): Buffer {
  const name = Buffer.from(entry.name, 'utf8')
  const header = Buffer.alloc(30 + name.length)
  const { time, date } = dosDateTime()

  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0x0800, 6) // UTF-8
  header.writeUInt16LE(0, 8) // store
  header.writeUInt16LE(time, 10)
  header.writeUInt16LE(date, 12)
  header.writeUInt32LE(entry.crc, 14)
  header.writeUInt32LE(entry.data.length, 18)
  header.writeUInt32LE(entry.data.length, 22)
  header.writeUInt16LE(name.length, 26)
  header.writeUInt16LE(0, 28)
  name.copy(header, 30)

  return header
}

function centralHeader(entry: ZipEntry): Buffer {
  const name = Buffer.from(entry.name, 'utf8')
  const header = Buffer.alloc(46 + name.length)
  const { time, date } = dosDateTime()

  header.writeUInt32LE(0x02014b50, 0)
  header.writeUInt16LE(63, 4) // made by: Unix, v6.3
  header.writeUInt16LE(20, 6)
  header.writeUInt16LE(0x0800, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(time, 12)
  header.writeUInt16LE(date, 14)
  header.writeUInt32LE(entry.crc, 16)
  header.writeUInt32LE(entry.data.length, 20)
  header.writeUInt32LE(entry.data.length, 24)
  header.writeUInt16LE(name.length, 28)
  header.writeUInt16LE(0, 30)
  header.writeUInt16LE(0, 32)
  header.writeUInt16LE(0, 34)
  header.writeUInt16LE(0, 36)
  header.writeUInt32LE(0, 38)
  header.writeUInt32LE(entry.offset, 42)
  name.copy(header, 46)

  return header
}
