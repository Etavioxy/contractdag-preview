import assert from 'node:assert/strict'
import test from 'node:test'
import { ellipsis, estimateTextWidth, isWideChar, truncateToWidth } from '../../src/panel/text.ts'

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

test('截断：放得下就原样返回，放不下就截到宽度以内并留省略号', () => {
  const size = 13
  const width = 136

  assert.equal(truncateToWidth('短名字', width, size), '短名字')
  assert.equal(truncateToWidth('', width, size), '')

  const long = '这是一个非常长的节点名字会明显超出框的宽度'
  const clipped = truncateToWidth(long, width, size)
  assert.ok(clipped.endsWith(ellipsis), '截断后以省略号收尾')
  assert.ok(clipped.length < long.length, '确实少了字')
  assert.ok(estimateTextWidth(clipped, size) <= width, '截断后宽度不越过可用宽度')

  // 半角长串同样受约束
  const ascii = truncateToWidth('a-really-long-node-name-that-overflows', width, size)
  assert.ok(ascii.endsWith(ellipsis))
  assert.ok(estimateTextWidth(ascii, size) <= width)
})

test('截断：可用宽度为零或为负时只剩省略号', () => {
  assert.equal(truncateToWidth('名字', 0, 13), ellipsis)
  assert.equal(truncateToWidth('名字', -5, 13), ellipsis)
})
