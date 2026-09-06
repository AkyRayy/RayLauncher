import { describe, expect, it } from 'vitest'
import {
  createLogParser,
  detectFatalReason,
  looksLikeCrash,
  looksLikeGameReady,
  normalizeLevel,
  parseLog4jEvent,
  parsePlainLine
} from '../src/main/minecraft/logParser'

describe('normalizeLevel', () => {
  it('сводит уровни log4j к четырём', () => {
    expect(normalizeLevel('FATAL')).toBe('error')
    expect(normalizeLevel('WARN')).toBe('warn')
    expect(normalizeLevel('TRACE')).toBe('debug')
    expect(normalizeLevel('INFO')).toBe('info')
    expect(normalizeLevel('что-то своё')).toBe('info')
  })
})

describe('parsePlainLine', () => {
  it('разбирает обычную строку клиента', () => {
    const line = parsePlainLine('[12:34:56] [Render thread/INFO]: Setting user: Player')
    expect(line.level).toBe('info')
    expect(line.thread).toBe('Render thread')
    expect(line.text).toBe('Setting user: Player')
  })

  it('понимает формат с именем логгера от модов', () => {
    const line = parsePlainLine('[12:34:56] [main/WARN] [FML]: Mod file is missing mods.toml')
    expect(line.level).toBe('warn')
    expect(line.text).toContain('mods.toml')
  })

  it('строку стека считает ошибкой', () => {
    expect(parsePlainLine('\tat net.minecraft.client.main.Main.main(Main.java:205)').level).toBe('error')
  })

  it('незнакомую строку отдаёт как info', () => {
    const line = parsePlainLine('Picked up JAVA_TOOL_OPTIONS')
    expect(line.level).toBe('info')
    expect(line.text).toBe('Picked up JAVA_TOOL_OPTIONS')
  })
})

describe('parseLog4jEvent', () => {
  it('вынимает уровень, поток и сообщение из XML', () => {
    const event =
      '<log4j:Event logger="net.minecraft.client.Minecraft" timestamp="1700000000000" level="WARN" thread="Render thread">' +
      '<log4j:Message><![CDATA[Missing sound for event]]></log4j:Message></log4j:Event>'

    const line = parseLog4jEvent(event)
    expect(line.level).toBe('warn')
    expect(line.thread).toBe('Render thread')
    expect(line.logger).toBe('net.minecraft.client.Minecraft')
    expect(line.text).toBe('Missing sound for event')
    expect(line.time).toBe(1_700_000_000_000)
  })

  it('приклеивает стек из log4j:Throwable', () => {
    const event =
      '<log4j:Event level="ERROR" thread="main"><log4j:Message><![CDATA[Ошибка]]></log4j:Message>' +
      '<log4j:Throwable><![CDATA[java.lang.NullPointerException\n\tat Main.run(Main.java:1)]]></log4j:Throwable></log4j:Event>'

    const line = parseLog4jEvent(event)
    expect(line.level).toBe('error')
    expect(line.text).toContain('Ошибка')
    expect(line.text).toContain('NullPointerException')
  })
})

describe('createLogParser', () => {
  it('склеивает XML-событие, разорванное между чанками', () => {
    const parser = createLogParser()
    const first = parser.feed('<log4j:Event level="INFO" thread="main"><log4j:Message><![CDATA[Начало')
    expect(first).toEqual([])

    const second = parser.feed(' работы]]></log4j:Message></log4j:Event>')
    expect(second).toHaveLength(1)
    expect(second[0]?.text).toBe('Начало работы')
  })

  it('отдаёт только завершённые текстовые строки, хвост оставляет в буфере', () => {
    const parser = createLogParser()
    expect(parser.feed('[12:00:00] [main/INFO]: первая\n[12:00:01] [main/INFO]: вто')).toHaveLength(1)
    expect(parser.feed('рая\n')[0]?.text).toBe('вторая')
  })

  it('flush возвращает остаток при завершении процесса', () => {
    const parser = createLogParser()
    parser.feed('последняя строка без перевода')
    const rest = parser.flush()
    expect(rest).toHaveLength(1)
    expect(rest[0]?.text).toBe('последняя строка без перевода')
    expect(parser.flush()).toEqual([])
  })

  it('разбирает смешанный поток: текст JVM, затем XML', () => {
    const parser = createLogParser()
    const lines = parser.feed(
      'Picked up JAVA_TOOL_OPTIONS\n<log4j:Event level="INFO" thread="main"><log4j:Message><![CDATA[ок]]></log4j:Message></log4j:Event>'
    )
    expect(lines.map((line) => line.text)).toEqual(['Picked up JAVA_TOOL_OPTIONS', 'ок'])
  })
})

describe('признаки состояния', () => {
  it('видит готовность игры', () => {
    expect(looksLikeGameReady(parsePlainLine('[12:00:00] [main/INFO]: Setting user: Player'))).toBe(true)
    expect(looksLikeGameReady(parsePlainLine('[12:00:00] [main/INFO]: Loading libraries'))).toBe(false)
  })

  it('видит начало крэш-репорта', () => {
    expect(looksLikeCrash(parsePlainLine('---- Minecraft Crash Report ----'))).toBe(true)
  })

  it('узнаёт несовпадение версии Java', () => {
    const line = parsePlainLine(
      'java.lang.UnsupportedClassVersionError: net/minecraft/client/main/Main has been compiled by a more recent version of the Java Runtime'
    )
    expect(detectFatalReason(line)).toBe('JAVA_VERSION_MISMATCH')
  })

  it('узнаёт нехватку памяти', () => {
    expect(detectFatalReason(parsePlainLine('Could not reserve enough space for 8388608KB object heap'))).toBe(
      'GAME_CRASHED'
    )
  })
})
