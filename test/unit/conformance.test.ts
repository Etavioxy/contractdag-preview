import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseContract } from '../../src/lib.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const fixtures = join(root, 'test', 'fixtures')
const corpus = join(root, 'crates', 'contractdag', 'tests', 'corpus')
const expectedOf = (source: string): string => `${JSON.stringify(parseContract(source), null, 2)}\n`

test('Rust 语料与样例逐字一致，期望 JSON 与 TypeScript 的解析结果一致', () => {
  const names = readdirSync(fixtures)
    .filter((name) => name.endsWith('.contractdag'))
    .sort()
  assert.ok(names.length >= 7, '样例不够，检查 test/fixtures')

  for (const name of names) {
    const source = readFileSync(join(fixtures, name), 'utf8')
    assert.equal(
      readFileSync(join(corpus, name), 'utf8'),
      source,
      `${name} 的语料副本过期，跑 pnpm conformance`,
    )
    assert.equal(
      readFileSync(join(corpus, name.replace(/\.contractdag$/, '.expected.json')), 'utf8'),
      expectedOf(source),
      `${name} 的期望 JSON 过期，跑 pnpm conformance`,
    )
  }

  assert.deepEqual(
    readdirSync(corpus).sort(),
    names.flatMap((name) => [name, name.replace(/\.contractdag$/, '.expected.json')]).sort(),
    '语料目录里有样例之外的残留',
  )
})
