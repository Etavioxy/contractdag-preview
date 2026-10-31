import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { hitTest, chevronHitBox } from '../../src/panel/hit.ts'
import { buildPreviewPayload } from '../../src/panel/payload.ts'
import { parse } from '../../src/parser.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const payload = buildPreviewPayload(parse(readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8')))
assert.ok(payload)

test('命中：框内任意处命中该节点，框外不命中', () => {
  assert.deepEqual(hitTest(payload, { x: 160, y: 52 }), { kind: 'node', name: '源码构建节点' })
  assert.deepEqual(hitTest(payload, { x: 160, y: 156 }), { kind: 'node', name: '上线安装节点' })
  assert.equal(hitTest(payload, { x: 20, y: 100 }), null)
  assert.equal(hitTest(payload, { x: 160, y: 110 }), null, '两层之间的空隙不属于任何框')
})

test('命中：边界按闭区间算，贴边仍算框内', () => {
  // 源码构建节点：x ∈ [80, 240]，y ∈ [24, 80]
  assert.deepEqual(hitTest(payload, { x: 80, y: 24 }), { kind: 'node', name: '源码构建节点' })
  assert.deepEqual(hitTest(payload, { x: 240, y: 80 }), { kind: 'node', name: '源码构建节点' })
  assert.equal(hitTest(payload, { x: 79.5, y: 52 }), null)
  assert.equal(hitTest(payload, { x: 240.5, y: 52 }), null)
})

test('命中：右上角归角标，角标与框重叠时角标优先', () => {
  const chevron = hitTest(payload, { x: 228, y: 38 })
  assert.deepEqual(chevron, { kind: 'chevron', name: '源码构建节点' })

  // 角标左沿也在框内：同一个节点必须先判角标，否则展开就点不动
  const leftEdge = hitTest(payload, { x: 240 - chevronHitBox.width, y: 30 })
  assert.deepEqual(leftEdge, { kind: 'chevron', name: '源码构建节点' })

  // 角标下方仍归节点
  assert.deepEqual(hitTest(payload, { x: 228, y: 60 }), { kind: 'node', name: '源码构建节点' })
})

test('命中：落在两个框之间的空白处回 null，不误判给相邻节点', () => {
  const between = (80 + 128) / 2
  assert.equal(hitTest(payload, { x: 160, y: between }), null)
})
