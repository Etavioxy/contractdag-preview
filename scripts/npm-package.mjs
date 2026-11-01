import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// npm 包只收库与命令行；构建产物从根目录的 dist 搬过来，不重复打包。
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'packages', 'contractdag')

const extension = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const library = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
if (extension.version !== library.version) {
  throw new Error(`版本不一致：扩展 ${extension.version}，npm 包 ${library.version}`)
}

rmSync(join(target, 'dist'), { recursive: true, force: true })
mkdirSync(join(target, 'dist', 'types'), { recursive: true })
for (const file of ['lib.mjs', 'lib.cjs', 'cli.cjs']) {
  copyFileSync(join(root, 'dist', file), join(target, 'dist', file))
}
cpSync(join(root, 'dist', 'types'), join(target, 'dist', 'types'), { recursive: true })
copyFileSync(join(root, 'LICENSE'), join(target, 'LICENSE'))

console.log(`npm package: ${library.name}@${library.version} staged in packages/contractdag`)
