import { existsSync } from 'node:fs'
import { build } from 'esbuild'

// 每个入口单独打包；入口还没落仓就跳过，免得每加一个入口都改这里。
const entries = [
  { entry: 'src/extension.ts', outfile: 'dist/extension.cjs', platform: 'node', format: 'cjs', external: ['vscode'] },
  { entry: 'src/lib.ts', outfile: 'dist/lib.mjs', platform: 'node', format: 'esm', external: [] },
  { entry: 'src/lib.ts', outfile: 'dist/lib.cjs', platform: 'node', format: 'cjs', external: [] },
  { entry: 'src/cli.ts', outfile: 'dist/cli.cjs', platform: 'node', format: 'cjs', external: [] },
  { entry: 'test/e2e/suite.ts', outfile: 'dist/test/e2e/suite.cjs', platform: 'node', format: 'cjs', external: ['vscode'] },
  { entry: 'test/e2e/host.ts', outfile: 'dist/test/e2e/host.cjs', platform: 'node', format: 'cjs', external: ['@vscode/test-electron'] },
  { entry: 'media/preview.ts', outfile: 'dist/media/preview.js', platform: 'browser', format: 'iife', external: [] },
]

for (const { entry, outfile, platform, format, external } of entries) {
  if (!existsSync(entry)) continue
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    sourcemap: true,
    target: platform === 'browser' ? 'es2022' : 'node20',
    platform,
    format,
    external,
    logLevel: 'info',
  })
}
