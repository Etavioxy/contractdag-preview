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
  return { name, kind: 'change', path: ['/a'], destination: ['做完。'], range: zero, keyRanges: {} }
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
      ['丙', 80, 142],
      ['乙', 280, 142],
      ['丁', 180, 260],
    ],
  )
})

test('direction LR 时层沿横向推进，层内沿纵向排开', () => {
  assert.deepEqual(
    [...layout(chainModel(), { direction: 'LR' })].map(([name, box]) => [name, box.x, box.y]),
    [
      ['甲', 80, 72],
      ['丙', 302, 24],
      ['乙', 302, 120],
      ['丁', 524, 72],
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

test('层间空隙按跨缝标签数增长：两条边出发的缝比一条更高', () => {
  const one = layout({ nodes: [node('甲'), node('乙')], links: [link('甲', '乙')] })
  const two = layout({
    nodes: [node('甲'), node('乙'), node('丙')],
    links: [link('甲', '乙'), link('甲', '丙')],
  })

  assert.equal((one.get('乙')?.y ?? 0) - ((one.get('甲')?.y ?? 0) + 56), 48)
  assert.equal((two.get('乙')?.y ?? 0) - ((two.get('甲')?.y ?? 0) + 56), 62)
})

test('跨缝标签数按产物条数算：一条边挂三个产物，缝更高', () => {
  const model: ContractModel = {
    nodes: [node('甲'), node('乙')],
    links: [{ ...link('甲', '乙'), artifacts: ['a', 'b', 'c'] }],
  }
  const boxes = layout(model)

  assert.equal((boxes.get('乙')?.y ?? 0) - ((boxes.get('甲')?.y ?? 0) + 56), 48 + 14 * 2)
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

  assert.equal(boxes.get('乙')?.y, 142)
  assert.equal(boxes.size, 2)
})
