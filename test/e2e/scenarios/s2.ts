/** S2：样例解析成模型。 */

import * as vscode from 'vscode'
import type { DumpJson } from '../../../src/model.ts'
import { openDocumentAt, type ScenarioContext } from '../harness.ts'

export async function run(context: ScenarioContext): Promise<void> {
  const editor = await openDocumentAt(context.fixturePath())
  context.check('样例成为当前文档', vscode.window.activeTextEditor?.document.uri.fsPath === editor.document.uri.fsPath)

  const dump = await vscode.commands.executeCommand<DumpJson>('contractdag.dump')
  const names = dump?.nodes.map((node) => node.name) ?? []
  context.check('模型有四个节点', dump?.nodes.length === 4)
  context.check('模型有三条连线', dump?.links.length === 3)
  context.check('模型零诊断', dump?.diagnostics.length === 0)
  context.check('节点名与样板一致', names.join('|') === '源码构建节点|上线安装节点|站点巡检节点|流水线收尾')
}
