import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from '../../src/parser.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

function codes(source: string): string[] {
  return parse(source).diagnostics.map((diagnostic) => diagnostic.code)
}

test('样板文件里图首没有入边不算缺陷：断头看的是出边', () => {
  const deploy = readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8')

  assert.deepEqual(codes(deploy), [])
})

test('依赖环：环上的每条边各报一条', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'path = /a',
    'destination = 做完。',
    '',
    '[乙:change]',
    'path = /b',
    'destination = 做完。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '',
    '[[乙 -> 甲]]',
    'artifact = y',
    '</links>',
  ].join('\n')

  assert.deepEqual(codes(source), ['cycle', 'cycle'])
})

test('产物重名：报在后写的那条边上', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'path = /a',
    'destination = 做完。',
    '',
    '[乙:change]',
    'path = /b',
    'destination = 做完。',
    '',
    '[丙:root]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '',
    '[[乙 -> 丙]]',
    'artifact = x',
    '</links>',
  ].join('\n')

  const analysis = parse(source)

  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.range.startLine]),
    [['duplicate-artifact', 17]],
  )
})

test('同一条边写两遍：仍是同一条边，产物取并集，不报重名', () => {
  const source = [
    '<nodes>',
    '[甲]',
    'destination = 做完。',
    '',
    '[乙]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '',
    '[[甲 -> 乙]]',
    'artifact = y',
    '</links>',
  ].join('\n')

  const analysis = parse(source)
  const link = analysis.model?.links[0]

  assert.equal(analysis.model?.links.length, 1)
  assert.deepEqual(link?.artifacts, ['x', 'y'])
  assert.deepEqual(analysis.diagnostics, [])
})

test('链式表头：相邻两名一条边，与单边声明合并成同一批边', () => {
  const source = [
    '<nodes>',
    '[甲]',
    'destination = 甲做完。',
    '',
    '[乙]',
    'destination = 乙做完。',
    '',
    '[丙]',
    'destination = 丙做完。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 ->',
    ' 乙',
    ' -> 丙]]',
    '',
    '[[乙 -> 丙]]',
    'artifact = y',
    '</links>',
  ].join('\n')

  const analysis = parse(source)
  const pairs = analysis.model?.links.map((link) => [link.from, link.to, link.artifacts])

  assert.deepEqual(pairs, [
    ['甲', '乙', []],
    ['乙', '丙', ['y']],
  ])
  assert.deepEqual(analysis.diagnostics, [])
})

test('坏名字：连线引用了未声明的节点', () => {
  const source = [
    '<nodes>',
    '[甲]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 未声明]]',
    'artifact = x',
    '</links>',
  ].join('\n')

  const analysis = parse(source)

  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.layer]),
    [['unknown-node', 'structural']],
  )
})

test('一个模型可同时含多处缺陷，各带自己的位置', () => {
  const source = [
    '<nodes>',
    '[甲]',
    'path = /a',
    'destination = 做完。',
    '',
    '[乙]',
    'path = /b',
    'destination = 做完。',
    '',
    '[丙]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '',
    '[[乙 -> 甲]]',
    'artifact = x',
    '',
    '[[乙 -> 丙]]',
    'artifact = y',
    '</links>',
  ].join('\n')

  const analysis = parse(source)
  const found = analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.range.startLine])

  assert.deepEqual(found, [
    ['cycle', 14],
    ['duplicate-artifact', 17],
    ['cycle', 17],
  ])
})
