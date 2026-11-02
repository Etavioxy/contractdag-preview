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

const zero = { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 }

function node(name: string): ContractModel['nodes'][number] {
  return { name, annotation: 'change', path: ['/a'], destination: ['做完。'], range: zero, keyRanges: {} }
}

function link(from: string, to: string, artifact = 'x'): ContractModel['links'][number] {
  return { from, to, artifacts: [artifact], properties: {}, range: zero, keyRanges: {} }
}

function chainModel(): ContractModel {
  return {
    nodes: [node('甲'), node('乙'), node('丙'), node('丁')],
    links: [link('甲', '乙', 'x'), link('甲', '丙', 'y'), link('乙', '丁', 'z'), link('丙', '丁', 'w')],
  }
}

test('样板布局与 docs/concrete-insight.md 的坐标逐条相同', () => {
  assert.ok(deploy.model)

  assert.deepEqual(boxesToObject(layout(deploy.model, { direction: deploy.style.direction, gap: deploy.style.gap })), {
    源码构建节点: { x: 80, y: 24, width: 160, height: 56 },
    上线安装节点: { x: 80, y: 128, width: 160, height: 56 },
    站点巡检节点: { x: 80, y: 232, width: 160, height: 56 },
    流水线收尾: { x: 80, y: 336, width: 160, height: 56 },
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
      ['丙', 80, 128],
      ['乙', 280, 128],
      ['丁', 180, 232],
    ],
  )
})

test('direction LR 时层沿横向推进，层内沿纵向排开', () => {
  assert.deepEqual(
    [...layout(chainModel(), { direction: 'LR' })].map(([name, box]) => [name, box.x, box.y]),
    [
      ['甲', 80, 72],
      ['丙', 288, 24],
      ['乙', 288, 120],
      ['丁', 496, 72],
    ],
  )
})

test('连线指向未声明的节点时照样排版，不抛错', () => {
  const model: ContractModel = {
    nodes: [
      {
        name: '甲',
        annotation: 'change',
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
        artifacts: ['x'],
        properties: {},
        range: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 },
        keyRanges: {},
      },
    ],
  }

  assert.deepEqual(boxesToObject(layout(model)), { 甲: { x: 80, y: 24, width: 160, height: 56 } })
})

test('空模型排出空表', () => {
  assert.equal(layout({ nodes: [], links: [] }).size, 0)
})

test('缝高按道数增长：三道放得下仍是 gap，四道才变高', () => {
  const model: ContractModel = { nodes: [node('甲'), node('乙')], links: [link('甲', '乙')] }
  const gap = (rows: number): number => {
    const boxes = layout(model, { seamRows: [rows] })
    return (boxes.get('乙')?.y ?? 0) - ((boxes.get('甲')?.y ?? 0) + 56)
  }

  // 1 道 = 11；2 道 = 33；3 道 = 47；4 道 = 61；6 道 = 89
  assert.equal(gap(1), 48)
  assert.equal(gap(3), 48)
  assert.equal(gap(4), 61)
  assert.equal(gap(6), 89)
})

test('框宽按名字给：竖排时宽吃交叉方向，横排时宽吃流动方向', () => {
  const model: ContractModel = { nodes: [node('甲'), node('乙')], links: [link('甲', '乙')] }
  const widths = (name: string): number => (name === '甲' ? 300 : 200)

  const vertical = layout(model, { nodeWidthOf: widths })
  assert.equal(vertical.get('甲')?.width, 300)
  assert.equal(vertical.get('乙')?.width, 200)
  assert.equal(vertical.get('甲')?.x, 80)
  assert.equal(vertical.get('乙')?.x, 130, '单框层在整图宽度里居中')
  assert.equal(vertical.get('乙')?.y, 128)

  const horizontal = layout(model, { direction: 'LR', nodeWidthOf: widths })
  assert.equal(horizontal.get('乙')?.x, 428, '横排时下一层让开最宽的框')
  assert.equal(horizontal.get('乙')?.y, 24)
})

test('框宽按名字给：同层两个框依次排开，不重叠', () => {
  const model: ContractModel = { nodes: [node('甲'), node('乙')], links: [] }
  const boxes = layout(model, { nodeWidthOf: (name) => (name === '甲' ? 300 : 200) })
  const ordered = [...boxes.entries()].sort((left, right) => left[1].x - right[1].x)
  const first = ordered[0]
  const second = ordered[1]
  assert.ok(first !== undefined && second !== undefined)
  assert.equal(first[1].x, 80, '整层从左边距起排')
  assert.equal(second[1].x - (first[1].x + first[1].width), 40, '同层间距仍是 gapCross')
})

test('环上的边不参与分层：先写的那条留下，后写的对边被摘', () => {
  const boxes = layout({ nodes: [node('甲'), node('乙')], links: [link('甲', '乙'), link('乙', '甲')] })

  assert.equal(boxes.get('甲')?.y, 24)
  assert.equal(boxes.get('乙')?.y, 128)
})

test('摘边按出现顺序：反边先写就保留反边', () => {
  const boxes = layout({ nodes: [node('甲'), node('乙')], links: [link('乙', '甲'), link('甲', '乙')] })

  assert.equal(boxes.get('乙')?.y, 24)
  assert.equal(boxes.get('甲')?.y, 128)
})

test('同一对端点写两次只算一个父节点，层不因此多一层', () => {
  const boxes = layout({ nodes: [node('甲'), node('乙')], links: [link('甲', '乙'), link('甲', '乙')] })

  assert.equal(boxes.get('乙')?.y, 128)
  assert.equal(boxes.size, 2)
})
