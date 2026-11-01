import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseContract } from '../src/lib.ts'

// Rust 侧的语料从这份样例生成：两边的期望值只能是同一份 JSON。
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(root, 'test', 'fixtures')
const corpus = join(root, 'crates', 'contractdag', 'tests', 'corpus')

const names = readdirSync(fixtures)
  .filter((name) => name.endsWith('.contractdag'))
  .sort()

mkdirSync(corpus, { recursive: true })
for (const name of names) {
  const source = readFileSync(join(fixtures, name), 'utf8')
  writeFileSync(join(corpus, name), source)
  writeFileSync(join(corpus, name.replace(/\.contractdag$/, '.expected.json')), `${JSON.stringify(parseContract(source), null, 2)}\n`)
}

console.log(`conformance: wrote ${names.length} fixture(s) to crates/contractdag/tests/corpus`)
