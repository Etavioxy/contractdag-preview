import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateTextWidth, isWideChar } from '../../src/panel/text.ts'

test('文本度量：半角按一列、全角与 CJK 按两列，另留一成余量', () => {
  assert.equal(isWideChar('a'), false)
  assert.equal(isWideChar('中'), true)
  assert.equal(isWideChar('，'), true)

  // 5 列 × 11px × 0.55 × 1.1
  assert.ok(Math.abs(estimateTextWidth('build', 11) - 33.275) < 0.01)
  // 6 列：三个汉字各占两列
  assert.ok(Math.abs(estimateTextWidth('构建包', 11) - 39.93) < 0.01)
  assert.ok(estimateTextWidth('构建包', 11) > estimateTextWidth('build', 11))
})
