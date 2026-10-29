import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/** 一条记录的去处：输出通道与（可选）文件各收一份。 */
export interface RecordSink {
  append(line: string): void
}

export interface Recorder {
  record(event: string, payload?: Record<string, unknown>): string
}

export interface RecorderOptions {
  appendLine(line: string): void
  sink?: RecordSink
}

/** 把记录同时写到输出通道与沙盒外的文件，两处内容逐字节相同。 */
export function createRecorder(options: RecorderOptions): Recorder {
  return {
    record(event, payload = {}) {
      const line = JSON.stringify({ event, ...payload, at: Date.now() })
      options.appendLine(line)
      options.sink?.append(line)
      return line
    },
  }
}

export function createFileSink(filePath: string): RecordSink {
  mkdirSync(dirname(filePath), { recursive: true })
  return {
    append(line) {
      appendFileSync(filePath, `${line}\n`)
    },
  }
}
