import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { completeAt } from '../../src/editor/completion.ts'
import { collectFoldingRanges } from '../../src/editor/folding.ts'
import { inspectSource } from '../../src/editor/inspect.ts'
import { collectTokens } from '../../src/editor/tokens.ts'
import { parse } from '../../src/parser.ts'

const deploy = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'deploy.contractdag'), 'utf8')
const deployLines = deploy.split('\n')
const deployAnalysis = parse(deploy)

function textOf(span: { line: number; start: number; length: number }): string {
  return (deployLines[span.line] ?? '').slice(span.start, span.start + span.length)
}

test('着色：节点头的名字与种类分开，连头两端都算节点名', () => {
  const tokens = collectTokens(deployAnalysis)

  assert.equal(tokens.length, 52)
  assert.deepEqual(
    tokens.filter((span) => span.line === 2).map((span) => [span.type, textOf(span), span.declaration === true]),
    [
      ['class', '源码构建节点', true],
      ['enumMember', 'change', false],
    ],
  )
  assert.deepEqual(
    tokens.filter((span) => span.line === 32).map((span) => span.type),
    ['class', 'class'],
  )
  assert.deepEqual(
    tokens.filter((span) => span.line === 33).map((span) => [span.type, textOf(span)]),
    [
      ['property', 'artifact'],
      ['string', 'build.tar'],
    ],
  )
})

test('折叠：两个区各一段，四个节点与三条连线各一段', () => {
  assert.deepEqual(collectFoldingRanges(deployAnalysis), [
    { start: 0, end: 29 },
    { start: 2, end: 7 },
    { start: 9, end: 17 },
    { start: 19, end: 24 },
    { start: 26, end: 27 },
    { start: 31, end: 41 },
    { start: 32, end: 33 },
    { start: 35, end: 37 },
    { start: 39, end: 40 },
  ])
})

test('补全：连线表头给已声明的节点名，连线体给 artifact', () => {
  assert.deepEqual(
    completeAt(deployAnalysis, 32, 4).map((item) => item.label),
    ['源码构建节点', '上线安装节点', '站点巡检节点', '流水线收尾'],
  )
  assert.deepEqual(
    completeAt(deployAnalysis, 33, 0).map((item) => item.label),
    ['artifact'],
  )
  assert.deepEqual(
    completeAt(deployAnalysis, 3, 0).map((item) => item.label),
    ['path', 'destination'],
  )
  assert.deepEqual(
    completeAt(deployAnalysis, 2, 8).map((item) => item.label),
    ['change', 'query', 'root'],
  )
})

test('补全：键值行给键，多行值里不给候选', () => {
  assert.deepEqual(
    completeAt(deployAnalysis, 4, 0).map((item) => item.label),
    ['path', 'destination'],
  )
  assert.deepEqual(
    completeAt(deployAnalysis, 5, 0).map((item) => item.label),
    [],
  )
})

test('补全：样式区先给关键字，再按关键字给值', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'path = /a',
    'destination = 做完。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 甲]]',
    'artifact = x',
    '</links>',
    '',
    '<style>',
    '',
    'direction ',
    'class ',
    '</style>',
  ].join('\n')
  const analysis = parse(source)

  assert.deepEqual(
    completeAt(analysis, 12, 0).map((item) => item.label),
    ['direction', 'gap', 'font', 'classDef', 'class', 'linkStyle'],
  )
  assert.deepEqual(
    completeAt(analysis, 13, 10).map((item) => item.label),
    ['TB', 'BT', 'LR', 'RL'],
  )
  assert.deepEqual(
    completeAt(analysis, 14, 6).map((item) => item.label),
    ['甲'],
  )
})

test('补全：按行的角色判，不看前缀打到第几个字符', () => {
  const partial = ['<nodes>', '[甲:change]', 'path = /a', 'destination = 做完。', '</nodes>', '', '<links>', '[', '</links>'].join('\n')

  assert.deepEqual(
    completeAt(parse(partial), 7, 1).map((item) => item.label),
    ['甲'],
  )
  assert.deepEqual(
    completeAt(deployAnalysis, 2, 3).map((item) => item.label),
    ['change', 'query', 'root'],
  )
})

test('补全：还没有任何区时给三个区标签', () => {
  assert.deepEqual(
    completeAt(parse(''), 0, 0).map((item) => item.label),
    ['<nodes>', '<links>', '<style>'],
  )
})

test('首行带 BOM 时列位置照原文算', () => {
  assert.deepEqual(collectTokens(parse('\uFEFF<nodes>\n</nodes>')), [
    { line: 0, start: 1, length: 7, type: 'keyword' },
    { line: 1, start: 0, length: 8, type: 'keyword' },
  ])
})

test('三样观测一起给出，数字与各自的算法一致', () => {
  const result = inspectSource(deploy, 32, 4)

  assert.deepEqual(result, {
    tokens: 52,
    folds: 9,
    completions: ['源码构建节点', '上线安装节点', '站点巡检节点', '流水线收尾'],
    line: 32,
    character: 4,
  })
})
