import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignLabels,
  estimateTextWidth,
  partitionLanes,
  pointAt,
  solveFlowT,
  type Curve,
} from '../../src/panel/labels.ts'

test('区间划分：左端点排序后复用已结束的道，得到最少道数', () => {
  const intervals = [
    { start: 6, end: 14 },
    { start: 9, end: 20 },
    { start: 20, end: 23 },
    { start: 19, end: 30 },
  ]

  const { lanes, rows } = partitionLanes(intervals)
  assert.equal(rows, 2)
  // 前两条相交必须不同道；后两条与前面不相交，复用第 0 道
  assert.notEqual(lanes[0], lanes[1])
  assert.deepEqual([...new Set(lanes)].length, 2)
})

test('区间划分：全部不相交时只用一道', () => {
  const { rows } = partitionLanes([
    { start: 0, end: 10 },
    { start: 10, end: 20 },
    { start: 30, end: 40 },
  ])
  assert.equal(rows, 1)
})

test('估宽：半角按 0.55 字号、CJK 按两列，再留一成余量', () => {
  const ascii = estimateTextWidth('build', 11)
  const cjk = estimateTextWidth('构建包', 11)

  assert.ok(Math.abs(ascii - 5 * 11 * 0.55 * 1.1) < 1e-9)
  assert.ok(Math.abs(cjk - 6 * 11 * 0.55 * 1.1) < 1e-9)
})

test('缝内解 t：流动坐标落到给定高度，跨多层也不假设 0.5', () => {
  const curve: Curve = {
    p0: { x: 0, y: 0 },
    c1: { x: 0, y: 50 },
    c2: { x: 200, y: 150 },
    p3: { x: 200, y: 200 },
  }

  for (const target of [20, 100, 180]) {
    const t = solveFlowT(curve, target, true)
    assert.ok(Math.abs(pointAt(curve, t).y - target) < 0.01)
  }
})

test('落位：水平相交的标签分道并沿流动方向错开，不相交的留在一行', () => {
  const curve: Curve = {
    p0: { x: 100, y: 0 },
    c1: { x: 100, y: 20 },
    c2: { x: 100, y: 40 },
    p3: { x: 100, y: 60 },
  }
  const apart: Curve = {
    p0: { x: 400, y: 0 },
    c1: { x: 400, y: 20 },
    c2: { x: 400, y: 40 },
    p3: { x: 400, y: 60 },
  }

  const placement = assignLabels(
    [
      { curve, seam: 0, artifacts: ['same'] },
      { curve, seam: 0, artifacts: ['same'] },
      { curve: apart, seam: 0, artifacts: ['other'] },
    ],
    [30],
    true,
    11,
    14,
  )

  assert.deepEqual(placement.rows, [2])
  assert.equal(placement.labels.length, 3)
  const sameYs = placement.labels.filter((label) => label.text === 'same').map((label) => label.anchor.y)
  assert.equal(Math.abs(sameYs[0]! - sameYs[1]!), 14)
  const other = placement.labels.find((label) => label.text === 'other')
  assert.ok(Math.abs(other!.anchor.y - (30 - 6)) < 1)
})
