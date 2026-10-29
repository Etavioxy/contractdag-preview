import * as vscode from 'vscode'
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
    vscode.commands.registerCommand('contractdag.dump', () => {
      recorder?.record('dump', { nodes: 0, links: 0 })
    }),
  )

  recorder.record('activated', { version: context.extension.packageJSON.version })
}

export function deactivate(): void {
  recorder = undefined
}
