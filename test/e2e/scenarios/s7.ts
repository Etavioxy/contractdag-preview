/** S7：整条用户路径——开工作区里的契约、开预览、看图、改契约、点框回跳、再开一格、关闭。 */

import { existsSync } from 'node:fs'
import * as vscode from 'vscode'
import { countPreviewPanels, previewTabs, tabGroupsSnapshot, waitUntil, type ScenarioContext } from '../harness.ts'

export async function run(context: ScenarioContext): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0]
  context.check('沙盒开在一个工作区上', workspace !== undefined)
  if (workspace === undefined) return

  const target = vscode.Uri.joinPath(workspace.uri, 'pipeline.contractdag')
  context.check('工作区里有 pipeline.contractdag', existsSync(target.fsPath))

  const document = await vscode.workspace.openTextDocument(target)
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One)
  context.check('按 contract-dag 语言打开', document.languageId === 'contract-dag')

  await vscode.commands.executeCommand('contractdag.preview')
  const state = await context.waitForRecord((record) => record['event'] === 'preview-state')
  context.check('图先画出来：四节点三边', state?.['nodes'] === 4 && state?.['edges'] === 3)
  context.check('画布按坐标展开', state?.['viewBox'] === '0 0 320 388')

  context.note('tabs', { groups: tabGroupsSnapshot(), editorColumn: editor.viewColumn ?? -1 })
  const tabs = previewTabs()
  context.check('预览与文本分处两组', tabs.length === 1 && tabs[0]?.group.viewColumn !== editor.viewColumn)
  context.check('预览开在文本右侧', (tabs[0]?.group.viewColumn ?? 0) > (editor.viewColumn ?? 0))

  const original = document.getText()
  const edited = original.split('上线安装节点').join('上线安装')
  const edit = new vscode.WorkspaceEdit()
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), edited)
  const editedAt = Date.now()
  await vscode.workspace.applyEdit(edit)

  const refreshed = await context.waitForRecord(
    (record) =>
      record['event'] === 'preview-state' &&
      Array.isArray(record['names']) &&
      (record['names'] as string[]).includes('上线安装'),
    2_000,
  )
  const renameMs = refreshed === undefined ? -1 : (refreshed['at'] as number) - editedAt
  context.note('timing', { renameToRenderMs: renameMs })
  context.check('改一处契约，图跟着变', renameMs >= 0 && renameMs <= 300)

  await vscode.commands.executeCommand('contractdag.reveal', '站点巡检节点')
  const reveal = await context.waitForRecord((record) => record['event'] === 'reveal', 2_000)
  context.check('点框把光标带回声明行', reveal?.['line'] === 19)
  context.check('编辑器光标落在声明行', vscode.window.activeTextEditor?.selection.active.line === 19)

  const before = countPreviewPanels()
  await vscode.commands.executeCommand('contractdag.preview')
  context.check('再开一次复用同一格', before === 1 && countPreviewPanels() === 1)

  await vscode.commands.executeCommand('contractdag.closePreview')
  context.check('关掉后不留 webview 标签', await waitUntil(() => countPreviewPanels() === 0))

  await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  context.check('编辑器都关掉了', await waitUntil(() => vscode.window.visibleTextEditors.length === 0))
}
