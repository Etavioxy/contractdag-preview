import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from '../../src/parser.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

function codesOf(file: string): string[] {
  return parse(readFileSync(join(fixtures, file), 'utf8')).diagnostics.map((diagnostic) => diagnostic.code)
}

test('分叉样例：一个上游分给两支，两支都汇到根', () => {
  assert.deepEqual(codesOf('fork.contractdag'), [])
})

test('汇合样例：两路并进一个节点，再落到根', () => {
  assert.deepEqual(codesOf('merge.contractdag'), [])
})

test('文法错误的样例报在区名那一行', () => {
  const analysis = parse(readFileSync(join(fixtures, 'broken-syntax.contractdag'), 'utf8'))

  assert.equal(analysis.model, undefined)
  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.range.startLine]),
    [['unknown-region', 0]],
  )
})

test('五条缺陷各有一份样例，报出的正是那一条', () => {
  assert.deepEqual(codesOf('defect-cycle.contractdag'), ['cycle', 'cycle'])
  assert.deepEqual(codesOf('defect-duplicate-artifact.contractdag'), ['duplicate-artifact'])
  assert.deepEqual(codesOf('defect-dangling.contractdag'), ['dangling-node'])
  assert.deepEqual(codesOf('defect-missing-path.contractdag'), ['missing-path'])
  assert.deepEqual(codesOf('defect-unknown-node.contractdag'), ['unknown-node'])
})

test('有缺陷的样例仍产出模型，只是诊断非空', () => {
  const analysis = parse(readFileSync(join(fixtures, 'defect-cycle.contractdag'), 'utf8'))

  assert.ok(analysis.model)
  assert.equal(analysis.model.nodes.length, 2)
  assert.equal(analysis.model.links.length, 2)
})
