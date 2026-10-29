import * as vscode from 'vscode'
import type { DumpJson } from '../../src/model.ts'
import { createFileSink, createRecorder } from '../../src/records.ts'

const EXTENSION_ID = 'contractdag.contractdag-preview'

/** 沙盒里的剧本入口：照剧本演一遍，跑完就挂住，等沙盒外的管家按 PID 收掉。 */
export async function run(): Promise<void> {
  const sinkFile = process.env['CONTRACTDAG_RECORD_SINK']
  const suite = createRecorder({
    appendLine: () => {},
    sink: sinkFile ? createFileSink(sinkFile) : undefined,
  })
  const scenario = process.env['CONTRACTDAG_E2E_SCENARIO'] ?? 's1'
  const check = (name: string, ok: boolean): void => {
    suite.record('check', { name, ok })
  }

  const extension = vscode.extensions.getExtension(EXTENSION_ID)
  if (!extension) {
    suite.record('suite-error', { scenario, reason: 'extension-missing', extensionId: EXTENSION_ID })
    return hold()
  }

  await extension.activate()

  try {
    switch (scenario) {
      case 's1':
        await vscode.commands.executeCommand('contractdag.dump')
        break
      case 's2':
        await runS2(check)
        break
      default:
        throw new Error(`没有这个剧本：${scenario}`)
    }
    suite.record('suite-ready', { extensionId: EXTENSION_ID, scenario })
  } catch (error) {
    suite.record('suite-error', { scenario, reason: String(error) })
  }
  return hold()
}

async function runS2(check: (name: string, ok: boolean) => void): Promise<void> {
  const fixture = process.env['CONTRACTDAG_E2E_FIXTURE']
  if (fixture === undefined) throw new Error('缺少 CONTRACTDAG_E2E_FIXTURE')

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fixture))
  await vscode.window.showTextDocument(document)
  check('样例成为当前文档', vscode.window.activeTextEditor?.document.uri.fsPath === fixture)

  const dump = await vscode.commands.executeCommand<DumpJson>('contractdag.dump')
  const names = dump?.nodes.map((node) => node.name) ?? []
  check('模型有四个节点', dump?.nodes.length === 4)
  check('模型有三条连线', dump?.links.length === 3)
  check('模型零诊断', dump?.diagnostics.length === 0)
  check('节点名与样板一致', names.join('|') === '源码构建节点|上线安装节点|站点巡检节点|流水线收尾')
}

function hold(): Promise<never> {
  return new Promise<never>(() => {})
}
