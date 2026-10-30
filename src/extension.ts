import * as vscode from 'vscode'
import { inspectSource, type InspectResult } from './editor/inspect.ts'
import { registerEditorSupport } from './editor/register.ts'
import { layout, type LayoutJson } from './layout.ts'
import { toDumpJson, type DumpJson } from './model.ts'
import {
  closePreview,
  hasPreview,
  notifyDocumentChanged,
  notifySelectionChanged,
  openPreview,
  requestClick,
  requestExpand,
  requestWheel,
  setPreviewRecorder,
} from './panel/graph-panel.ts'
import { parse } from './parser.ts'
import { createFileSink, createRecorder, type Recorder } from './records.ts'

let recorder: Recorder | undefined
let extensionContext: vscode.ExtensionContext | undefined

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context
  const channel = vscode.window.createOutputChannel('Contract DAG')
  context.subscriptions.push(channel)

  // 沙盒用环境变量指定落脚点；正常运行时落到扩展自己的全局存储，面板里的位移数字才有处可查。
  const sinkFile =
    process.env['CONTRACTDAG_RECORD_SINK'] ?? vscode.Uri.joinPath(context.globalStorageUri, 'records.jsonl').fsPath
  recorder = createRecorder({
    appendLine: (line) => channel.appendLine(line),
    sink: createFileSink(sinkFile),
  })
  setPreviewRecorder(recorder)

  context.subscriptions.push(
    vscode.commands.registerCommand('contractdag.dump', () => dumpActiveDocument()),
    vscode.commands.registerCommand('contractdag.inspect', () => inspectActiveDocument()),
    vscode.commands.registerCommand('contractdag.layout', () => layoutActiveDocument()),
    vscode.commands.registerCommand('contractdag.preview', () => previewActiveDocument()),
    vscode.commands.registerCommand('contractdag.reveal', (name?: unknown) => revealForScenario(name)),
    vscode.commands.registerCommand('contractdag.expand', (name?: unknown) => expandForScenario(name)),
    vscode.commands.registerCommand('contractdag.wheel', (dx?: unknown, dy?: unknown) => wheelForScenario(dx, dy)),
    vscode.commands.registerCommand('contractdag.closePreview', () => closePreviewForScenario()),
    vscode.workspace.onDidChangeTextDocument((event) => notifyDocumentChanged(event.document)),
    vscode.window.onDidChangeTextEditorSelection((event) => notifySelectionChanged(event.textEditor)),
  )
  registerEditorSupport(context)

  recorder.record('activated', { version: context.extension.packageJSON.version })
}

export function deactivate(): void {
  recorder = undefined
  extensionContext = undefined
}

/** 把当前文档解析成模型，同一份 JSON 既写记录也作为命令返回值。 */
function dumpActiveDocument(): DumpJson | undefined {
  const document = vscode.window.activeTextEditor?.document
  if (document === undefined) {
    recorder?.record('dump', { error: 'no-active-document' })
    return undefined
  }

  const analysis = parse(document.getText())
  const dump = toDumpJson(analysis.model ?? { nodes: [], links: [] }, analysis.diagnostics)
  recorder?.record('dump', { ...dump })
  return dump
}

/** 把着色段数、折叠区间数、光标处补全候选打成一条记录。 */
function inspectActiveDocument(): InspectResult | undefined {
  const editor = vscode.window.activeTextEditor
  if (editor === undefined) {
    recorder?.record('inspect', { error: 'no-active-document' })
    return undefined
  }

  const { line, character } = editor.selection.active
  const result = inspectSource(editor.document.getText(), line, character)
  recorder?.record('inspect', { ...result })
  return result
}

/** 按当前文档算一遍布局，同一份坐标既写记录也作为命令返回值。 */
function layoutActiveDocument(): LayoutJson | undefined {
  const document = vscode.window.activeTextEditor?.document
  if (document === undefined) {
    recorder?.record('layout', { error: 'no-active-document' })
    return undefined
  }

  const analysis = parse(document.getText())
  if (analysis.model === undefined) {
    recorder?.record('layout', { error: 'no-model' })
    return undefined
  }

  const result = {
    boxes: Object.fromEntries(layout(analysis.model, { direction: analysis.style.direction, gap: analysis.style.gap })),
  }
  recorder?.record('layout', { ...result })
  return result
}

/** 在文本右侧相邻的组里开一格预览。 */
function previewActiveDocument(): boolean {
  const document = vscode.window.activeTextEditor?.document
  if (document === undefined || extensionContext === undefined) {
    recorder?.record('preview', { error: 'no-active-document' })
    return false
  }

  openPreview(extensionContext, document, vscode.ViewColumn.Beside)
  recorder?.record('preview', { uri: document.uri.toString() })
  return true
}

/** 面板抢了焦点时 activeTextEditor 会是空的，退回找一个开着预览的可见编辑器。 */
function previewTargetDocument(): vscode.TextDocument | undefined {
  const active = vscode.window.activeTextEditor?.document
  if (active !== undefined && hasPreview(active)) return active
  return vscode.window.visibleTextEditors.find((editor) => hasPreview(editor.document))?.document
}

/** 剧本用的合成点击：走 webview 自己那条点击回报的路。 */
function revealForScenario(name: unknown): boolean {
  const document = previewTargetDocument()
  if (document === undefined || typeof name !== 'string') {
    recorder?.record('reveal-request', { error: 'bad-argument' })
    return false
  }
  const sent = requestClick(document, name)
  recorder?.record('reveal-request', { name, sent })
  return sent
}

/** 剧本用的合成展开：让 webview 把契约分区画出来。 */
function expandForScenario(name: unknown): boolean {
  const document = previewTargetDocument()
  if (document === undefined || typeof name !== 'string') return false
  const sent = requestExpand(document, name)
  recorder?.record('expand-request', { name, sent })
  return sent
}

/** 剧本用的合成滚轮：验「滑得动」，走的是渲染侧同一个位移入口。 */
function wheelForScenario(dx: unknown, dy: unknown): boolean {
  const document = previewTargetDocument()
  if (document === undefined || typeof dx !== 'number' || typeof dy !== 'number') return false
  const sent = requestWheel(document, dx, dy)
  recorder?.record('wheel-request', { dx, dy, sent })
  return sent
}

function closePreviewForScenario(): boolean {
  const document = previewTargetDocument()
  if (document === undefined) return false
  const closed = closePreview(document)
  recorder?.record('preview-close', { closed })
  return closed
}
