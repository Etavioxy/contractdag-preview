#!/usr/bin/env node
/** 命令行入口：把解析结果按 JSON 交给别的语言，子进程就够了，不必嵌 JS 运行时。 */

import { readFileSync } from 'node:fs'
import { parseContract } from './lib.ts'

const usage = 'usage: contractdag <file.contractdag>'

/** 退出码 0 无缺陷、1 有缺陷、2 读不出模型或参数不对。 */
function main(argv: string[]): number {
  const file = argv.find((argument) => !argument.startsWith('-'))
  if (file === undefined) {
    process.stderr.write(`${usage}\n`)
    return 2
  }

  let source: string
  try {
    source = readFileSync(file, 'utf8')
  } catch (error) {
    process.stderr.write(`contractdag: ${(error as Error).message}\n`)
    return 2
  }

  const result = parseContract(source)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result.model === undefined) return 2
  return result.diagnostics.length === 0 ? 0 : 1
}

process.exitCode = main(process.argv.slice(2))
