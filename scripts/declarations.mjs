import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// tsc 7 的声明产物照抄源码里的 .ts 后缀；发布出去的 d.ts 要能被 .js 解析，这里补一次改写。
const root = 'dist/types'
const specifier = /(from\s+'\.{1,2}\/[^']+)\.ts'/g

let rewritten = 0
for (const name of readdirSync(root, { recursive: true })) {
  if (!name.endsWith('.d.ts')) continue
  const file = join(root, String(name))
  const before = readFileSync(file, 'utf8')
  const after = before.replace(specifier, "$1.js'")
  if (after === before) continue
  writeFileSync(file, after)
  rewritten += 1
}

for (const name of readdirSync(root, { recursive: true })) {
  if (!name.endsWith('.d.ts')) continue
  const text = readFileSync(join(root, String(name)), 'utf8')
  if (/(from\s+'\.{1,2}\/[^']+)\.ts'/.test(text)) throw new Error(`${name} 里还有 .ts 后缀的导入`)
}

console.log(`declarations: rewrote ${rewritten} file(s)`)
