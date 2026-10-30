/** S6：改契约即重画，点框回跳，展开看契约分区。 */

import * as vscode from 'vscode'
import { openDocumentAt, type ScenarioContext } from '../harness.ts'

export async function run(context: ScenarioContext): Promise<void> {
  const editor = await openDocumentAt(context.fixturePath())
  await vscode.commands.executeCommand('contractdag.preview')
  const first = await context.waitForRecord((record) => record['event'] === 'preview-state')
  context.check('预览先画出一张', first !== undefined)

  const document = editor.document
  const original = document.getText()
  const renamed = original.split('站点巡检节点').join('站点巡检')
  const edit = new vscode.WorkspaceEdit()
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), renamed)
  const editedAt = Date.now()
  await vscode.workspace.applyEdit(edit)

  const refreshed = await context.waitForRecord(
    (record) =>
      record['event'] === 'preview-state' &&
      Array.isArray(record['names']) &&
      (record['names'] as string[]).includes('站点巡检'),
    2_000,
  )
  const renameMs = refreshed === undefined ? -1 : (refreshed['at'] as number) - editedAt
  context.note('timing', { renameToRenderMs: renameMs })
  context.check('改名后 300ms 内回报新模型', renameMs >= 0 && renameMs <= 300)

  const sent = await vscode.commands.executeCommand<boolean>('contractdag.reveal', '源码构建节点')
  context.check('合成点击送进了 webview', sent === true)
  const reveal = await context.waitForRecord((record) => record['event'] === 'reveal', 2_000)
  context.check('点框把光标带回声明行', reveal?.['line'] === 2)
  context.check('编辑器光标落在声明行', vscode.window.activeTextEditor?.selection.active.line === 2)

  const highlighted = await context.waitForRecord(
    (record) => record['event'] === 'preview-state' && record['highlight'] === '源码构建节点',
    2_000,
  )
  context.check('光标所在节点在图上高亮', highlighted !== undefined)

  const expandedRequest = await vscode.commands.executeCommand<boolean>('contractdag.expand', '源码构建节点')
  context.check('合成展开送进了 webview', expandedRequest === true)
  const expanded = await context.waitForRecord(
    (record) => record['event'] === 'preview-state' && Number(record['contractLines']) > 0,
    2_000,
  )
  context.check('展开后框里画出契约分区', expanded !== undefined)
  context.check('契约分区画出三行以上', Number(expanded?.['contractLines']) >= 3)

  const wheelSent = await vscode.commands.executeCommand<boolean>('contractdag.wheel', 0, 64)
  context.check('合成滚轮送进了 webview', wheelSent === true)
  const scrolled = await context.waitForRecord(
    (record) => record['event'] === 'preview-state' && Number(record['scrollY']) > 0,
    2_000,
  )
  context.check('滚轮真的产生了纵向位移', scrolled !== undefined)
  context.check(
    '位移回报的是数字不是兜底值',
    typeof scrolled?.['scrollX'] === 'number' && typeof scrolled?.['scrollY'] === 'number',
  )
}
