import assert from 'node:assert/strict'
import test from 'node:test'
import { layoutDefaults } from '../../src/layout.ts'
import { nodeWidthFor } from '../../src/panel/node-frame.ts'
import { nameInset, nameSize } from '../../src/panel/node-size.ts'
import { estimateTextWidth } from '../../src/panel/text.ts'

test('框宽：短名字用默认宽，长名字按估宽撑开', () => {
  assert.equal(nodeWidthFor('短名字'), layoutDefaults.nodeWidth)
  assert.equal(nodeWidthFor(''), layoutDefaults.nodeWidth)

  const long = '这是一个非常长的节点名字会明显超出默认框的宽度'
  const width = nodeWidthFor(long)
  assert.ok(width > layoutDefaults.nodeWidth)
  assert.ok(width >= estimateTextWidth(long, nameSize) + nameInset * 2)
})

test('框宽：上限不低于 150 个字符，汉字与半角都完整放得下', () => {
  for (const name of ['长'.repeat(150), 'a'.repeat(150)]) {
    const width = nodeWidthFor(name)
    assert.ok(
      width >= estimateTextWidth(name, nameSize) + nameInset * 2,
      `${name.slice(0, 8)}… 的框宽放不下整串`,
    )
    assert.ok(width > layoutDefaults.nodeWidth)
  }
})

test('框宽：名字越长框越宽，不封顶', () => {
  const short = nodeWidthFor('短')
  const long = nodeWidthFor('长'.repeat(120))
  assert.ok(long > short)
})
