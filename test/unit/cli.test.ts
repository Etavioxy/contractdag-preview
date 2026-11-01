import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const cli = join(root, 'src', 'cli.ts')
const fixture = (name: string): string => join(root, 'test', 'fixtures', name)

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('干净的文件：退出码 0，stdout 是带行号的 ParseResult', () => {
  const { status, stdout } = run(fixture('deploy.contractdag'))
  const parsed = JSON.parse(stdout)

  assert.equal(status, 0)
  assert.deepEqual(parsed.diagnostics, [])
  assert.equal(parsed.model.nodes.length, 4)
  assert.equal(parsed.model.nodes[0].range.startLine, 2)
})

test('结构缺陷：退出码 1，模型照样交出', () => {
  const { status, stdout } = run(fixture('defect-cycle.contractdag'))
  const parsed = JSON.parse(stdout)

  assert.equal(status, 1)
  assert.equal(parsed.model.nodes.length, 2)
  assert.deepEqual(
    parsed.diagnostics.map(({ layer, code }: { layer: string; code: string }) => ({ layer, code })),
    [
      { layer: 'structural', code: 'cycle' },
      { layer: 'structural', code: 'cycle' },
    ],
  )
})

test('文法不合：退出码 2，没有模型，诊断仍是语法层', () => {
  const { status, stdout } = run(fixture('broken-syntax.contractdag'))
  const parsed = JSON.parse(stdout)

  assert.equal(status, 2)
  assert.equal(parsed.model, undefined)
  assert.equal(parsed.diagnostics[0].layer, 'syntax')
})

test('没给文件或是读不到：退出码 2，理由写进 stderr', () => {
  const missing = run()
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /usage: contractdag/)

  const unreadable = run(join(root, 'test', 'fixtures', 'nope.contractdag'))
  assert.equal(unreadable.status, 2)
  assert.match(unreadable.stderr, /no such file/i)
})
