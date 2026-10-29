import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createFileSink, createRecorder } from '../../src/records.ts'

function lines(filePath: string): string[] {
  return readFileSync(filePath, 'utf8').split('\n').filter((line) => line.length > 0)
}

test('记录同时落到输出通道与文件，两处逐字节相同', () => {
  const filePath = join(mkdtempSync(join(tmpdir(), 'contractdag-records-')), 'records.jsonl')
  const channel: string[] = []
  const recorder = createRecorder({
    appendLine: (line) => channel.push(line),
    sink: createFileSink(filePath),
  })

  const returned = recorder.record('activated', { version: '0.0.1' })

  assert.deepEqual(channel, [returned])
  assert.deepEqual(lines(filePath), [returned])
  const parsed = JSON.parse(returned) as Record<string, unknown>
  assert.equal(parsed['event'], 'activated')
  assert.equal(parsed['version'], '0.0.1')
  assert.equal(typeof parsed['at'], 'number')
})

test('没有文件去处时只写输出通道，不抛错', () => {
  const channel: string[] = []
  const recorder = createRecorder({ appendLine: (line) => channel.push(line) })

  recorder.record('dump', { nodes: 0, links: 0 })

  assert.equal(channel.length, 1)
})
