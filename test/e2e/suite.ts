/** 沙盒里的剧本入口：按名字挑一个剧本演一遍，跑完就挂住，等沙盒外的管家按 PID 收掉。 */

import * as vscode from 'vscode'
import { createFileSink, createRecorder } from '../../src/records.ts'
import { waitForRecord, type ScenarioContext } from './harness.ts'
import { run as runS1 } from './scenarios/s1.ts'
import { run as runS2 } from './scenarios/s2.ts'
import { run as runS3 } from './scenarios/s3.ts'
import { run as runS4 } from './scenarios/s4.ts'
import { run as runS5 } from './scenarios/s5.ts'
import { run as runS6 } from './scenarios/s6.ts'
import { run as runS7 } from './scenarios/s7.ts'

const EXTENSION_ID = 'contractdag.contractdag-preview'

const runners: Record<string, (context: ScenarioContext) => Promise<void>> = {
  s1: runS1,
  s2: runS2,
  s3: runS3,
  s4: runS4,
  s5: runS5,
  s6: runS6,
  s7: runS7,
}

export async function run(): Promise<void> {
  const sinkFile = process.env['CONTRACTDAG_RECORD_SINK']
  const suite = createRecorder({
    appendLine: () => {},
    sink: sinkFile ? createFileSink(sinkFile) : undefined,
  })
  const scenario = process.env['CONTRACTDAG_E2E_SCENARIO'] ?? 's1'

  const context: ScenarioContext = {
    check: (name, ok) => {
      suite.record('check', { name, ok })
    },
    note: (event, payload) => {
      suite.record(event, payload)
    },
    waitForRecord,
    fixturePath: () => {
      const fixture = process.env['CONTRACTDAG_E2E_FIXTURE']
      if (fixture === undefined) throw new Error('缺少 CONTRACTDAG_E2E_FIXTURE')
      return fixture
    },
    isExtensionActive: () => vscode.extensions.getExtension(EXTENSION_ID)?.isActive === true,
  }

  const extension = vscode.extensions.getExtension(EXTENSION_ID)
  if (!extension) {
    suite.record('suite-error', { scenario, reason: 'extension-missing', extensionId: EXTENSION_ID })
    return hold()
  }

  // S7 要验「打开 .contractdag 就激活」，所以这一幕不提前手动激活。
  if (scenario !== 's7') await extension.activate()

  const runner = runners[scenario]
  try {
    if (runner === undefined) throw new Error(`没有这个剧本：${scenario}`)
    await runner(context)
    suite.record('suite-ready', { extensionId: EXTENSION_ID, scenario })
  } catch (error) {
    suite.record('suite-error', { scenario, reason: String(error) })
  }
  return hold()
}

/** 进程要一直活着，等沙盒外的管家按 PID 收掉。 */
function hold(): Promise<never> {
  return new Promise<never>(() => {})
}
