import assert from 'node:assert/strict'
import test from 'node:test'
import {
  anchorScroll,
  approach,
  clampScale,
  clampScroll,
  densityOf,
  fitScale,
  isSettled,
  scaledSize,
  stepScale,
} from '../../src/panel/viewport.ts'

test('比例钳进上下限', () => {
  assert.equal(clampScale(0.1), 0.5)
  assert.equal(clampScale(9), 3)
  assert.equal(clampScale(1.4), 1.4)
})

test('指数逼近逐帧收敛，够近就算停', () => {
  let current = 0
  const frames: number[] = []
  while (!isSettled(current, 100, 0.5) && frames.length < 100) {
    current = approach(current, 100)
    frames.push(current)
  }

  assert.ok(frames.length > 1, '一帧就到位等于没有阻尼')
  assert.ok(frames.length < 60, '超过一秒还没停就是拖泥带水')
  assert.ok(Math.abs(current - 100) < 1)
})

test('锚点缩放：光标下的那处内容不动', () => {
  const before = { scale: 1, scrollX: 40, scrollY: 60 }
  const anchor = { x: 120, y: 80 }
  const next = anchorScroll(before, 2, anchor)

  const contentX = (before.scrollX + anchor.x) / before.scale
  assert.equal((next.scrollX + anchor.x) / 2, contentX)
  assert.equal((next.scrollY + anchor.y) / 2, (before.scrollY + anchor.y) / before.scale)
})

test('滚动范围留半个视口余量，负数也允许', () => {
  const viewport = { width: 400, height: 300 }
  const big = { width: 900, height: 700 }
  const small = { width: 200, height: 100 }

  // 上界 = 内容超出视口的部分 + 余量（200 / 150）；下界 = −余量
  assert.deepEqual(clampScroll({ scrollX: 800, scrollY: 900 }, viewport, big), { scrollX: 700, scrollY: 550 })
  assert.deepEqual(clampScroll({ scrollX: -300, scrollY: -200 }, viewport, big), { scrollX: -200, scrollY: -150 })

  // 内容比视口小也必须能动，否则贴合视口时双指滑行无处可去
  assert.deepEqual(clampScroll({ scrollX: 120, scrollY: 80 }, viewport, small), { scrollX: 120, scrollY: 80 })
})

test('适配宽度：宽度贴合且不放大，高度超出留给纵向滚动', () => {
  assert.equal(fitScale({ width: 900, height: 800 }, { width: 720, height: 776 }), 1)
  assert.equal(fitScale({ width: 900, height: 800 }, { width: 320, height: 388 }), 1)
  assert.equal(fitScale({ width: 600, height: 800 }, { width: 1200, height: 2000 }), 0.5)

  const tall = fitScale({ width: 600, height: 800 }, { width: 720, height: 2600 })
  assert.ok(tall * 2600 > 800, '高图必须留下可滚距离，否则双指滑行无处可去')
  assert.equal(fitScale({ width: 600, height: 400 }, { width: 0, height: 0 }), 1)
})

test('缩放步进按倍率乘，不越过上下限', () => {
  assert.equal(stepScale(1, true), 1.1)
  assert.equal(stepScale(2.9, true), 3)
  assert.equal(stepScale(0.55, false), 0.5)
})

test('密度按比例分档：边标签先收，再收种类；展开的正文不收', () => {
  assert.equal(densityOf(1), 'edge-label')
  assert.equal(densityOf(0.8), 'edge-label')
  assert.equal(densityOf(0.6), 'kind')
  assert.equal(densityOf(0.5), 'name')
})

test('内容放大后的像素尺寸', () => {
  assert.deepEqual(scaledSize({ width: 320, height: 388 }, 2), { width: 640, height: 776 })
})
