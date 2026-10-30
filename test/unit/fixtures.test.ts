import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from '../../src/parser.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const examples = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples')

function codesOf(file: string): string[] {
  return parse(readFileSync(join(fixtures, file), 'utf8')).diagnostics.map((diagnostic) => diagnostic.code)
}

test('分叉样例：一个上游分给两支，两支都汇到根', () => {
  assert.deepEqual(codesOf('fork.contractdag'), [])
})

test('汇合样例：两路并进一个节点，再落到根', () => {
  assert.deepEqual(codesOf('merge.contractdag'), [])
})

test('示范样例：12 个节点分三层并行，无诊断', () => {
  const analysis = parse(readFileSync(join(examples, 'pipeline.contractdag'), 'utf8'))

  assert.deepEqual(analysis.diagnostics, [])
  assert.equal(analysis.model?.nodes.length, 12)
  assert.equal(analysis.model?.links.length, 15)
})

test('示范目录里每一份都零诊断，且产物名在各自文件内唯一', () => {
  const files = readdirSync(examples).filter((name) => name.endsWith('.contractdag'))
  assert.ok(files.length >= 5, '示范样例少于五份')

  for (const file of files) {
    const analysis = parse(readFileSync(join(examples, file), 'utf8'))
    assert.deepEqual(
      analysis.diagnostics.map((diagnostic) => `${file}: ${diagnostic.code}`),
      [],
      `${file} 有诊断`,
    )
  }
})

test('文法错误的样例报在区名那一行', () => {
  const analysis = parse(readFileSync(join(fixtures, 'broken-syntax.contractdag'), 'utf8'))

  assert.equal(analysis.model, undefined)
  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.range.startLine]),
    [['unknown-region', 0]],
  )
})

const defectFixtures: Array<[string, string[]]> = [
  ['defect-cycle.contractdag', ['cycle', 'cycle']],
  ['defect-duplicate-artifact.contractdag', ['duplicate-artifact']],
  ['defect-dangling.contractdag', ['dangling-node']],
  ['defect-missing-path.contractdag', ['missing-path']],
  ['defect-unknown-node.contractdag', ['unknown-node']],
]

for (const [file, expected] of defectFixtures) {
  test(`五条缺陷各有一份样例：${file}`, () => {
    assert.deepEqual(codesOf(file), expected)
  })
}

test('有缺陷的样例仍产出模型，只是诊断非空', () => {
  const analysis = parse(readFileSync(join(fixtures, 'defect-cycle.contractdag'), 'utf8'))

  assert.ok(analysis.model)
  assert.equal(analysis.model.nodes.length, 2)
  assert.equal(analysis.model.links.length, 2)
})
