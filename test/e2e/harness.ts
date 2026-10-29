/** 剧本共用的东西：记录读取、等待、打开样例、数预览格。 */

import { readFileSync } from 'node:fs'
import * as vscode from 'vscode'

export interface ScenarioContext {
  check(name: string, ok: boolean): void
  note(event: string, payload: Record<string, unknown>): void
  waitForRecord(
    match: (record: Record<string, unknown>) => boolean,
    timeoutMs?: number,
  ): Promise<Record<string, unknown> | undefined>
  fixturePath(): string
}

export function sinkPath(): string {
  const file = process.env['CONTRACTDAG_RECORD_SINK']
  if (file === undefined) throw new Error('缺少 CONTRACTDAG_RECORD_SINK')
  return file
}

export function readRecords(): Array<Record<string, unknown>> {
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
export async function waitForRecord(
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

export async function openDocumentAt(path: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path))
  return vscode.window.showTextDocument(document)
}

/** 界面变化是异步的：等到条件成立或到点，不使用固定 sleep。 */
export async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return predicate()
}

/** 预览面板在标签组里的样子：viewType 带我们自己的前缀。 */
export function isPreviewTab(tab: vscode.Tab): boolean {
  return String((tab.input as { viewType?: unknown })?.viewType ?? '').includes('contractdag.preview')
}

export function previewTabs(): Array<{ group: vscode.TabGroup; tab: vscode.Tab }> {
  return vscode.window.tabGroups.all.flatMap((group) =>
    group.tabs.map((tab) => ({ group, tab })).filter(({ tab }) => isPreviewTab(tab)),
  )
}

export function countPreviewPanels(): number {
  return previewTabs().length
}

export function tabGroupsSnapshot(): Array<Record<string, unknown>> {
  return vscode.window.tabGroups.all.map((group) => ({
    column: group.viewColumn,
    tabs: group.tabs.map((tab) => ({
      label: tab.label,
      viewType: String((tab.input as { viewType?: unknown })?.viewType ?? ''),
    })),
  }))
}
