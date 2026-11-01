import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const entry = fileURLToPath(new URL('../../src/panel/scene.ts', import.meta.url))

test('图元表不把布局引擎带进 webview：运行期依赖不碰 layout.ts 与 d3-dag', () => {
  const pending = [entry]
  const visited = new Set<string>()

  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)

    const source = readFileSync(file, 'utf8')
    for (const [, specifier] of source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)) {
      assert.ok(!specifier.includes('d3-dag'), `${file} 依赖了 d3-dag，webview 只该收画图用的数据`)
      assert.ok(!specifier.endsWith('/layout.ts'), `${file} 依赖了布局，坐标由宿主算好下发`)
      if (specifier?.startsWith('.')) pending.push(fileURLToPath(new URL(specifier, `file://${file}`)))
    }
  }

  assert.ok(visited.size > 1, '依赖闭包没走通，检查正则')
})
