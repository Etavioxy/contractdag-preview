import * as vscode from 'vscode'
import { createFileSink, createRecorder } from '../../src/records.ts'

const EXTENSION_ID = 'contractdag.contractdag-preview'

/** 沙盒里的剧本入口：跑完就挂住，等沙盒外的管家按 PID 收掉。 */
export async function run(): Promise<void> {
  const sinkFile = process.env['CONTRACTDAG_RECORD_SINK']
  const suite = createRecorder({
    appendLine: () => {},
    sink: sinkFile ? createFileSink(sinkFile) : undefined,
  })

  const extension = vscode.extensions.getExtension(EXTENSION_ID)
  if (!extension) {
    suite.record('suite-error', { reason: 'extension-missing', extensionId: EXTENSION_ID })
    return hold()
  }

  await extension.activate()
  await vscode.commands.executeCommand('contractdag.dump')
  suite.record('suite-ready', { extensionId: EXTENSION_ID })
  return hold()
}

function hold(): Promise<never> {
  return new Promise<never>(() => {})
}
