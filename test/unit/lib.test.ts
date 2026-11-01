import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseContract } from '../../src/lib.ts'

const fixtures = new URL('../fixtures/', import.meta.url)
const fixture = (name: string): string => readFileSync(new URL(name, fixtures), 'utf8')

test('库入口交出模型、样式与诊断，不带编辑器用的逐行角色', () => {
  const result = parseContract(fixture('deploy.contractdag'))

  assert.deepEqual(Object.keys(result).sort(), ['diagnostics', 'model', 'style'])
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.model?.nodes.length, 4)
  assert.equal(result.model?.links.length, 3)
  assert.equal(result.style.direction, 'TB')
})

test('模型里的行列与诊断同一口径：都从 0 起，落在声明行上', () => {
  const source = fixture('deploy.contractdag')
  const result = parseContract(source)
  const node = result.model?.nodes[0]
  assert.ok(node)

  assert.deepEqual(node.range, { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 15 })
  assert.equal(node.keyRanges['path']?.startLine, 3)
  assert.equal(source.split(/\r?\n/)[node.range.startLine], '[源码构建节点:change]')
})

test('文法不合时不产出模型，诊断仍带位置', () => {
  const result = parseContract(fixture('broken-syntax.contractdag'))

  assert.equal(result.model, undefined)
  assert.deepEqual(
    result.diagnostics.map(({ layer, code }) => ({ layer, code })),
    [{ layer: 'syntax', code: 'unknown-region' }],
  )
  assert.deepEqual(result.diagnostics[0]?.range, {
    startLine: 0,
    startCharacter: 0,
    endLine: 0,
    endCharacter: 6,
  })
})

test('结构缺陷与模型一起交出：模型留着，缺陷标在声明行', () => {
  const result = parseContract(fixture('defect-cycle.contractdag'))
  assert.ok(result.model)

  assert.equal(result.model.nodes.length, 2)
  assert.equal(result.model.links.length, 2)
  assert.deepEqual(
    result.diagnostics.map(({ layer, code }) => ({ layer, code })),
    [
      { layer: 'structural', code: 'cycle' },
      { layer: 'structural', code: 'cycle' },
    ],
  )
})

test('库入口的依赖闭包里没有 vscode：不激活编辑器也能跑', () => {
  const pending = [fileURLToPath(new URL('../../src/lib.ts', import.meta.url))]
  const visited = new Set<string>()

  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)

    const source = readFileSync(file, 'utf8')
    for (const [, specifier] of source.matchAll(/from\s+'([^']+)'/g)) {
      assert.notEqual(specifier, 'vscode', `${file} 依赖了 vscode`)
      if (specifier?.startsWith('.')) pending.push(fileURLToPath(new URL(specifier, `file://${file}`)))
    }
  }

  assert.ok(visited.size > 1, '依赖闭包没走通，检查正则')
})
