/** S5：预览出图，并且真开在文本右侧的相邻组。 */

import * as vscode from 'vscode'
import { openDocumentAt, previewTabs, tabGroupsSnapshot, type ScenarioContext } from '../harness.ts'

export async function run(context: ScenarioContext): Promise<void> {
  const editor = await openDocumentAt(context.fixturePath())

  const opened = await vscode.commands.executeCommand<boolean>('contractdag.preview')
  context.check('预览命令开成了', opened === true)

  const state = await context.waitForRecord((record) => record['event'] === 'preview-state')
  context.check('webview 回报了握手', state !== undefined)
  context.check('握手里节点数为四', state?.['nodes'] === 4)
  context.check(
    '握手里四个节点名都在',
    JSON.stringify(state?.['names']) === JSON.stringify(['源码构建节点', '上线安装节点', '站点巡检节点', '流水线收尾']),
  )

  context.note('tabs', { groups: tabGroupsSnapshot(), editorColumn: editor.viewColumn ?? -1 })

  const tabs = previewTabs()
  context.check('预览占据了另一组', tabs.length === 1 && tabs[0]?.group.viewColumn !== editor.viewColumn)
}
