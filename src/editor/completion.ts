/** 补全：按光标所在区给候选，节点名取自文档里已经写出的表头。 */

import { nodeNamesOf, scanLines } from './scan.ts'

export interface CompletionSuggestion {
  label: string
  detail: string
  insertText: string
}

const kinds = ['change', 'query', 'root']
const nodeKeys = ['path', 'destination']
const styleKeywords = ['direction', 'gap', 'font', 'classDef', 'class', 'linkStyle']
const directions = ['TB', 'BT', 'LR', 'RL']
const regionHeaders = ['<nodes>', '<links>', '<style>']

function suggestion(label: string, detail: string): CompletionSuggestion {
  return { label, detail, insertText: label }
}

export function completeAt(source: string, line: number, character: number): CompletionSuggestion[] {
  const scanned = scanLines(source)
  const current = scanned[line]
  if (current === undefined) return []

  const prefix = current.text.slice(0, character).trimStart()
  const names = nodeNamesOf(scanned)

  switch (current.region) {
    case 'nodes':
      return prefix.startsWith('[') ? kinds.map((kind) => suggestion(kind, '种类')) : nodeKeys.map((key) => suggestion(key, '节点键'))
    case 'links':
      return prefix.startsWith('[[')
        ? names.map((name) => suggestion(name, '节点'))
        : [suggestion('artifact', '连线键，必填')]
    case 'style':
      return styleRegion(prefix, names)
    default:
      return regionHeaders.map((header) => suggestion(header, '区'))
  }
}

function styleRegion(prefix: string, names: string[]): CompletionSuggestion[] {
  const space = prefix.search(/\s/)
  if (space === -1) return styleKeywords.map((keyword) => suggestion(keyword, '样式关键字'))

  const keyword = prefix.slice(0, space)
  if (keyword === 'direction') return directions.map((direction) => suggestion(direction, '方向'))
  if (keyword === 'class') return names.map((name) => suggestion(name, '节点'))
  return []
}
