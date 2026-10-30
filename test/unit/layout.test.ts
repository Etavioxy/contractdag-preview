import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { layout, type NodeBox } from '../../src/layout.ts'
import type { ContractModel } from '../../src/model.ts'
import { parse } from '../../src/parser.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const deploy = parse(readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8'))

function boxesToObject(boxes: Map<string, NodeBox>): Record<string, NodeBox> {
  return Object.fromEntries(boxes)
}

function chainModel(): ContractModel {
  const node = (name: string): ContractModel['nodes'][number] => ({
    name,
    kind: 'change',
    path: ['/a'],
    destination: ['做完。'],
    range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 },
    keyRanges: {},
  })
  const link = (from: string, to: string, artifact: string): ContractModel['links'][number] => ({
    from,
    to,
    properties: { artifact },
    range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 },
    keyRanges: {},
  })
  return {
    nodes: [node('甲'), node('乙'), node('丙'), node('丁')],
    links: [link('甲', '乙', 'x'), link('甲', '丙', 'y'), link('乙', '丁', 'z'), link('丙', '丁', 'w')],
  }
}

test('样板布局与 docs/concrete-insight.md 的坐标逐条相同', () => {
  assert.ok(deploy.model)

  assert.deepEqual(boxesToObject(layout(deploy.model, { direction: deploy.style.direction, gap: deploy.style.gap })), {
    源码构建节点: { x: 80, y: 24, width: 160, height: 56 },
    上线安装节点: { x: 80, y: 100, width: 160, height: 56 },
    站点巡检节点: { x: 80, y: 176, width: 160, height: 56 },
    流水线收尾: { x: 80, y: 252, width: 160, height: 56 },
  })
})

test('间距取自样式区：gap 40 时层距变 96', () => {
  assert.ok(deploy.model)

  const ys = [...layout(deploy.model, { gap: 40 }).values()].map((box) => box.y)

  assert.deepEqual(ys, [24, 120, 216, 312])
})

test('分叉：同层两列并排，汇合处居中', () => {
  const boxes = layout(chainModel())

  assert.deepEqual(
    [...boxes].map(([name, box]) => [name, box.x, box.y]),
    [
      ['甲', 180, 24],
      ['丙', 80, 100],
      ['乙', 280, 100],
      ['丁', 180, 176],
    ],
  )
})

test('direction LR 时层沿横向推进，层内沿纵向排开', () => {
  assert.deepEqual(
    [...layout(chainModel(), { direction: 'LR' })].map(([name, box]) => [name, box.x, box.y]),
    [
      ['甲', 80, 72],
      ['丙', 260, 24],
      ['乙', 260, 120],
      ['丁', 440, 72],
    ],
  )
})

test('连线指向未声明的节点时照样排版，不抛错', () => {
  const model: ContractModel = {
    nodes: [
      {
        name: '甲',
        kind: 'change',
        path: ['/a'],
        destination: ['做完。'],
        range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 },
        keyRanges: {},
      },
    ],
    links: [
      {
        from: '甲',
        to: '不存在',
        properties: { artifact: 'x' },
        range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 },
        keyRanges: {},
      },
    ],
  }

  assert.deepEqual(boxesToObject(layout(model)), { 甲: { x: 80, y: 24, width: 160, height: 56 } })
})

test('方向：给单个节点指定更高时，后续层整体下移，交叉方向不动', () => {
  assert.deepEqual(
    [...layout(chainModel(), { heights: { 甲: 120 } })].map(([name, box]) => [name, box.x, box.y, box.height]),
    [
      ['甲', 180, 24, 120],
      ['丙', 80, 164, 56],
      ['乙', 280, 164, 56],
      ['丁', 180, 240, 56],
    ],
  )
})

test('方向：同层里最高的那个决定层距，同层其他节点仍与它顶对齐', () => {
  assert.deepEqual(
    [...layout(chainModel(), { heights: { 乙: 100 } })].map(([name, box]) => [name, box.x, box.y, box.height]),
    [
      ['甲', 180, 24, 56],
      ['丙', 80, 100, 56],
      ['乙', 280, 100, 100],
      ['丁', 180, 220, 56],
    ],
  )
})

test('空模型排出空表', () => {
  assert.equal(layout({ nodes: [], links: [] }).size, 0)
})
