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
    '[乙:root]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '',
    '[[甲 -> 乙]]',
    'artifact = x',
    '</links>',
  ].join('\n')

  const analysis = parse(source)

  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.range.startLine]),
    [['duplicate-artifact', 13]],
  )
})

test('断头节点：非根节点没有出边', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'path = /a',
    'destination = 做完。',
    '',
    '[乙:root]',
    'destination = 收尾。',
    '',
    '[丙:change]',
    'path = /c',
    'destination = 做完。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '</links>',
  ].join('\n')

  const analysis = parse(source)

  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.range.startLine]),
    [['dangling-node', 8]],
  )
})

test('根节点不止一个也算断头：出口只能有一处', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'path = /a',
    'destination = 做完。',
    '',
    '[乙:root]',
    'destination = 收尾。',
    '',
    '[丙:root]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '',
    '[[甲 -> 丙]]',
    'artifact = y',
    '</links>',
  ].join('\n')

  const analysis = parse(source)

  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.range.startLine, diagnostic.message]),
    [['dangling-node', 8, '图里只能有一个根节点，这里有 2 个']],
  )
})

test('变更节点缺 path', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'destination = 做完。',
    '',
    '[乙:root]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '</links>',
  ].join('\n')

  const analysis = parse(source)

  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message]),
    [['missing-path', '变更节点没写 path：甲']],
  )
})

test('坏名字：连线引用了未声明的节点', () => {
  const source = [
    '<nodes>',
    '[甲:root]',
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
