import * as vscode from 'vscode'
import { inspectSource, type InspectResult } from './editor/inspect.ts'
import { registerEditorSupport } from './editor/register.ts'
import { toDumpJson, type DumpJson } from './model.ts'
import { parse } from './parser.ts'
import { createFileSink, createRecorder, type Recorder } from './records.ts'

let recorder: Recorder | undefined

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel('Contract DAG')
  context.subscriptions.push(channel)

  const sinkFile = process.env['CONTRACTDAG_RECORD_SINK']
  recorder = createRecorder({
    appendLine: (line) => channel.appendLine(line),
    sink: sinkFile ? createFileSink(sinkFile) : undefined,
  })

  context.subscriptions.push(
    vscode.commands.registerCommand('contractdag.dump', () => dumpActiveDocument()),
    vscode.commands.registerCommand('contractdag.inspect', () => inspectActiveDocument()),
  )
  registerEditorSupport(context)

  recorder.record('activated', { version: context.extension.packageJSON.version })
}

export function deactivate(): void {
  recorder = undefined
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
