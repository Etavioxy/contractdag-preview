import assert from 'node:assert/strict'
import test from 'node:test'
import { beginPointer, clickSlop, isClick, isDrag, movePointer } from '../../src/panel/gesture.ts'

test('原地按下松开算点击：零位移不触发拖动', () => {
  const track = beginPointer(120, 80)
  const ended = movePointer(track, 120, 80)

  assert.equal(isClick(ended), true)
  assert.equal(isDrag(ended), false)
})

test('手抖在阈值内仍算点击', () => {
  const ended = movePointer(beginPointer(120, 80), 122, 82)

  assert.ok(Math.hypot(2, 2) <= clickSlop)
  assert.equal(isClick(ended), true)
})

test('越过阈值就算拖动，之后不再回到点击', () => {
  const dragged = movePointer(beginPointer(120, 80), 120, 86)
  assert.equal(isDrag(dragged), true)

  // 松手前又挪回原点，仍然是拖动：判定取过程中的最大位移。
  const back = movePointer(dragged, 120, 80)
  assert.equal(isDrag(back), true)
  assert.equal(isClick(back), false)
})

test('斜向位移按直线距离算，不按单轴', () => {
  const diagonal = movePointer(beginPointer(0, 0), 3, 3)

  assert.ok(Math.hypot(3, 3) > clickSlop, '单轴都在阈值内，斜向已经越界')
  assert.equal(isDrag(diagonal), true)
})
