/** 预览面板：开在相邻组、随文档变更重画、文法或结构有问题时保留上一张图。 */

import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import { parse } from '../parser.ts'
import type { Recorder } from '../records.ts'
import { buildPreviewHtml } from './html.ts'
import { buildPreviewPayload, type PreviewPayload } from './payload.ts'

const panels = new Map<string, vscode.WebviewPanel>()
const payloads = new Map<string, PreviewPayload>()
const highlights = new Map<string, string | null>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const debounceMs = 80

let recorder: Recorder | undefined
let revision = 0

export function setPreviewRecorder(next: Recorder): void {
  recorder = next
}

export function openPreview(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  column: vscode.ViewColumn,
): vscode.WebviewPanel {
  const key = document.uri.toString()
  const existing = panels.get(key)
  if (existing !== undefined) {
    existing.reveal(column, true)
    return existing
  }

  const panel = vscode.window.createWebviewPanel(
    'contractdag.preview',
    `预览 ${document.uri.path.split('/').pop() ?? '契约'}`,
    column,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'media')],
    },
  )
  panels.set(key, panel)

  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'media', 'preview.js'))
  panel.webview.html = buildPreviewHtml({ scriptUri: scriptUri.toString(), nonce: createNonce() })

  panel.webview.onDidReceiveMessage((message: unknown) => handleMessage(document, message))
  panel.onDidDispose(() => {
    panels.delete(key)
    payloads.delete(key)
    highlights.delete(key)
    const timer = timers.get(key)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(key)
  })

  return panel
}

export function notifyDocumentChanged(document: vscode.TextDocument): void {
  const key = document.uri.toString()
  if (!panels.has(key)) return

  const pending = timers.get(key)
  if (pending !== undefined) clearTimeout(pending)
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      refresh(document)
    }, debounceMs),
  )
}

export function notifySelectionChanged(editor: vscode.TextEditor): void {
  const key = editor.document.uri.toString()
  const panel = panels.get(key)
  if (panel === undefined) return

  const line = editor.selection.active.line
  const name = payloads.get(key)?.nodes.find((node) => node.line === line)?.name ?? null
  highlights.set(key, name)
  void panel.webview.postMessage({ type: 'highlight', payload: { name } })
}

export function hasPreview(document: vscode.TextDocument): boolean {
  return panels.has(document.uri.toString())
}

/** 剧本用的合成展开：让 webview 走它自己那条渲染契约分区的路。 */
export function requestExpand(document: vscode.TextDocument, name: string): boolean {
  const panel = panels.get(document.uri.toString())
  if (panel === undefined) return false
  void panel.webview.postMessage({ type: 'expand', payload: { name } })
  return true
}

/** 剧本用的合成点击：让 webview 走它自己那条点击回报的路。 */
export function requestClick(document: vscode.TextDocument, name: string): boolean {
  const panel = panels.get(document.uri.toString())
  if (panel === undefined) return false
  void panel.webview.postMessage({ type: 'click', payload: { name } })
  return true
}

export function closePreview(document: vscode.TextDocument): boolean {
  const panel = panels.get(document.uri.toString())
  if (panel === undefined) return false
  panel.dispose()
  return true
}

function handleMessage(document: vscode.TextDocument, message: unknown): void {
  if (typeof message !== 'object' || message === null) return
  const { type, payload } = message as { type?: unknown; payload?: unknown }

  switch (type) {
    case 'ready':
      refresh(document)
      return
    case 'state':
      recorder?.record('preview-state', toStateRecord(payload))
      return
    case 'reveal': {
      const name = (payload as { name?: unknown } | undefined)?.name
      if (typeof name === 'string') void revealNode(document, name)
      return
    }
    default:
      return
  }
}

function refresh(document: vscode.TextDocument): void {
  const key = document.uri.toString()
  const panel = panels.get(key)
  if (panel === undefined) return

  const analysis = parse(document.getText())
  const payload = buildPreviewPayload(analysis, highlights.get(key) ?? null)
  if (payload === undefined) {
    const messages = analysis.diagnostics.map((diagnostic) => diagnostic.message)
    void panel.webview.postMessage({ type: 'stale', payload: { messages } })
    recorder?.record('preview-stale', { diagnostics: messages.length })
    return
  }

  payloads.set(key, payload)
  void panel.webview.postMessage({ type: 'render', payload })
  recorder?.record('render', { nodes: payload.nodes.length, edges: payload.edges.length, revision: (revision += 1) })
}

async function revealNode(document: vscode.TextDocument, name: string): Promise<void> {
  const analysis = parse(document.getText())
  const node = analysis.model?.nodes.find((entry) => entry.name === name)
  if (node === undefined) return

  const target = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.toString() === document.uri.toString(),
  )
  const range = new vscode.Range(node.range.startLine, 0, node.range.startLine, 0)
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: target?.viewColumn ?? vscode.ViewColumn.One,
    selection: range,
  })
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
  recorder?.record('reveal', { name, line: node.range.startLine })
}

/** webview 来的东西只按约定字段收，其余一律丢掉。 */
function toStateRecord(payload: unknown): Record<string, unknown> {
  const source = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>
  const names = Array.isArray(source['names']) ? source['names'].filter((name): name is string => typeof name === 'string') : []
  const expanded = Array.isArray(source['expanded'])
    ? source['expanded'].filter((name): name is string => typeof name === 'string')
    : []

  return {
    nodes: typeof source['nodes'] === 'number' ? source['nodes'] : -1,
    edges: typeof source['edges'] === 'number' ? source['edges'] : -1,
    contractLines: typeof source['contractLines'] === 'number' ? source['contractLines'] : -1,
    names,
    expanded,
    highlight: typeof source['highlight'] === 'string' ? source['highlight'] : null,
    viewBox: typeof source['viewBox'] === 'string' ? source['viewBox'] : '',
  }
}

function createNonce(): string {
  return randomBytes(16).toString('base64')
}
