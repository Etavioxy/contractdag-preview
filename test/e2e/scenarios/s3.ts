/** S3：编辑器三样可观测。 */

import * as vscode from 'vscode'
import type { InspectResult } from '../../../src/editor/inspect.ts'
import { openDocumentAt, type ScenarioContext } from '../harness.ts'

export async function run(context: ScenarioContext): Promise<void> {
  const editor = await openDocumentAt(context.fixturePath())
  context.check('语言标识是 contract-dag', editor.document.languageId === 'contract-dag')

  const lines = editor.document.getText().split('\n')
  const headLine = lines.findIndex((line) => line.startsWith('[[源码构建节点'))
  context.check('样板里有连线表头', headLine > 0)
  if (headLine <= 0) return

  const bodyLine = headLine + 1
  editor.selection = new vscode.Selection(headLine, 4, headLine, 4)
  const atHead = await vscode.commands.executeCommand<InspectResult>('contractdag.inspect')
  context.check('着色段数大于零', (atHead?.tokens ?? 0) > 0)
  context.check('折叠区间数大于零', (atHead?.folds ?? 0) > 0)
  context.check('表头处补全含已声明节点名', atHead?.completions.includes('上线安装节点') === true)

  editor.selection = new vscode.Selection(bodyLine, 0, bodyLine, 0)
  const atBody = await vscode.commands.executeCommand<InspectResult>('contractdag.inspect')
  context.check('连线体处补全含 artifact', atBody?.completions.includes('artifact') === true)
}
