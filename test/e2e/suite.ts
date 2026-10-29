import { readFileSync } from 'node:fs'
import * as vscode from 'vscode'
import type { InspectResult } from '../../src/editor/inspect.ts'
import type { LayoutJson } from '../../src/layout.ts'
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
  const note = (event: string, payload: Record<string, unknown>): void => {
    suite.record(event, payload)
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
      case 's3':
        await runS3(check)
        break
      case 's4':
        await runS4(check)
        break
      case 's5':
        await runS5(check, note)
        break
      case 's6':
        await runS6(check, note)
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

async function runS3(check: (name: string, ok: boolean) => void): Promise<void> {
  const fixture = process.env['CONTRACTDAG_E2E_FIXTURE']
  if (fixture === undefined) throw new Error('缺少 CONTRACTDAG_E2E_FIXTURE')

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fixture))
  const editor = await vscode.window.showTextDocument(document)
  check('语言标识是 contract-dag', document.languageId === 'contract-dag')

  const lines = document.getText().split('\n')
  const headLine = lines.findIndex((line) => line.startsWith('[[源码构建节点'))
  const bodyLine = headLine + 1
  check('样板里有连线表头', headLine > 0)

  editor.selection = new vscode.Selection(headLine, 4, headLine, 4)
  const atHead = await vscode.commands.executeCommand<InspectResult>('contractdag.inspect')
  check('着色段数大于零', (atHead?.tokens ?? 0) > 0)
  check('折叠区间数大于零', (atHead?.folds ?? 0) > 0)
  check('表头处补全含已声明节点名', atHead?.completions.includes('上线安装节点') === true)

  editor.selection = new vscode.Selection(bodyLine, 0, bodyLine, 0)
  const atBody = await vscode.commands.executeCommand<InspectResult>('contractdag.inspect')
  check('连线体处补全含 artifact', atBody?.completions.includes('artifact') === true)
}

async function runS4(check: (name: string, ok: boolean) => void): Promise<void> {
  const fixture = process.env['CONTRACTDAG_E2E_FIXTURE']
  if (fixture === undefined) throw new Error('缺少 CONTRACTDAG_E2E_FIXTURE')

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fixture))
  await vscode.window.showTextDocument(document)

  const result = await vscode.commands.executeCommand<LayoutJson>('contractdag.layout')
  const boxes = result?.boxes ?? {}
  const expected: Record<string, [number, number]> = {
    源码构建节点: [80, 24],
    上线安装节点: [80, 100],
    站点巡检节点: [80, 176],
    流水线收尾: [80, 252],
  }

  for (const [name, [x, y]] of Object.entries(expected)) {
    const box = boxes[name]
    check(`${name} 落在 ${x},${y}`, box?.x === x && box?.y === y)
  }
  check('四格同宽同高 160×56', Object.values(boxes).every((box) => box.width === 160 && box.height === 56))
}

function hold(): Promise<never> {
  return new Promise<never>(() => {})
}

function sinkPath(): string {
  const file = process.env['CONTRACTDAG_RECORD_SINK']
  if (file === undefined) throw new Error('缺少 CONTRACTDAG_RECORD_SINK')
  return file
}

function readRecords(): Array<Record<string, unknown>> {
  try {
    return readFileSync(sinkPath(), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
  } catch {
    return []
  }
}

/** 等某条记录出现；等待绑定终止条件并限次。 */
async function waitForRecord(
  match: (record: Record<string, unknown>) => boolean,
  timeoutMs = 5_000,
): Promise<Record<string, unknown> | undefined> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = readRecords().find(match)
    if (found !== undefined) return found
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return undefined
}

async function openDeploy(): Promise<vscode.TextEditor> {
  const fixture = process.env['CONTRACTDAG_E2E_FIXTURE']
  if (fixture === undefined) throw new Error('缺少 CONTRACTDAG_E2E_FIXTURE')
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fixture))
  return vscode.window.showTextDocument(document)
}

async function runS5(
  check: (name: string, ok: boolean) => void,
  note: (event: string, payload: Record<string, unknown>) => void,
): Promise<void> {
  const editor = await openDeploy()

  const opened = await vscode.commands.executeCommand<boolean>('contractdag.preview')
  check('预览命令开成了', opened === true)

  const state = await waitForRecord((record) => record['event'] === 'preview-state')
  check('webview 回报了握手', state !== undefined)
  check('握手里节点数为四', state?.['nodes'] === 4)
  check(
    '握手里四个节点名都在',
    JSON.stringify(state?.['names']) === JSON.stringify(['源码构建节点', '上线安装节点', '站点巡检节点', '流水线收尾']),
  )

  note('tabs', {
    groups: vscode.window.tabGroups.all.map((group) => ({
      column: group.viewColumn,
      tabs: group.tabs.map((tab) => ({
        label: tab.label,
        input: (tab.input as { constructor?: { name?: string } })?.constructor?.name ?? 'none',
        viewType: (tab.input as { viewType?: string })?.viewType ?? '',
      })),
    })),
    editorColumn: editor.viewColumn ?? -1,
  })

  const webviewTab = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs.map((tab) => ({ group, tab })))
    .find(({ tab }) => String((tab.input as { viewType?: unknown })?.viewType ?? '').includes('contractdag.preview'))
  check('预览占据了另一组', webviewTab !== undefined && webviewTab.group.viewColumn !== editor.viewColumn)
}

async function runS6(
  check: (name: string, ok: boolean) => void,
  note: (event: string, payload: Record<string, unknown>) => void,
): Promise<void> {
  const editor = await openDeploy()
  await vscode.commands.executeCommand('contractdag.preview')
  const first = await waitForRecord((record) => record['event'] === 'preview-state')
  check('预览先画出一张', first !== undefined)

  const document = editor.document
  const original = document.getText()
  const renamed = original.split('站点巡检节点').join('站点巡检')
  const edit = new vscode.WorkspaceEdit()
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), renamed)
  const editedAt = Date.now()
  await vscode.workspace.applyEdit(edit)

  const refreshed = await waitForRecord(
    (record) =>
      record['event'] === 'preview-state' &&
      Array.isArray(record['names']) &&
      (record['names'] as string[]).includes('站点巡检'),
    2_000,
  )
  const renameMs = refreshed === undefined ? -1 : (refreshed['at'] as number) - editedAt
  note('timing', { renameToRenderMs: renameMs })
  check('改名后 300ms 内回报新模型', renameMs >= 0 && renameMs <= 300)

  const sent = await vscode.commands.executeCommand<boolean>('contractdag.reveal', '源码构建节点')
  check('合成点击送进了 webview', sent === true)
  const reveal = await waitForRecord((record) => record['event'] === 'reveal', 2_000)
  check('点框把光标带回声明行', reveal?.['line'] === 2)
  check('编辑器光标落在声明行', vscode.window.activeTextEditor?.selection.active.line === 2)

  const highlighted = await waitForRecord(
    (record) => record['event'] === 'preview-state' && record['highlight'] === '源码构建节点',
    2_000,
  )
  check('光标所在节点在图上高亮', highlighted !== undefined)

  const expandedRequest = await vscode.commands.executeCommand<boolean>('contractdag.expand', '源码构建节点')
  check('合成展开送进了 webview', expandedRequest === true)
  const expanded = await waitForRecord(
    (record) => record['event'] === 'preview-state' && Number(record['contractLines']) > 0,
    2_000,
  )
  check('展开后框里画出契约分区', expanded !== undefined)
  check('契约分区画出三行以上', Number(expanded?.['contractLines']) >= 3)
}
