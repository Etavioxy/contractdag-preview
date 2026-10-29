import { existsSync } from 'node:fs'
import { build } from 'esbuild'

// 每个入口单独打包；入口还没落仓就跳过，免得每加一个入口都改这里。
const entries = [
  { entry: 'src/extension.ts', outfile: 'dist/extension.cjs', external: ['vscode'] },
  { entry: 'test/e2e/suite.ts', outfile: 'dist/test/e2e/suite.cjs', external: ['vscode'] },
  { entry: 'test/e2e/host.ts', outfile: 'dist/test/e2e/host.cjs', external: ['@vscode/test-electron'] },
]

for (const { entry, outfile, external } of entries) {
  if (!existsSync(entry)) continue
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    sourcemap: true,
    target: 'node20',
    platform: 'node',
    format: 'cjs',
    external,
    logLevel: 'info',
  })
}
