/** 补全：只在行首给候选，候选集按光标所在区算。 */

import type { Analysis } from '../parser.ts'
import type { ScannedLine } from '../scan.ts'

export interface CompletionSuggestion {
  label: string
  detail: string
  insertText: string
}

const nodeKeys = ['path', 'destination']
const styleKeywords = ['direction', 'gap', 'font', 'classDef', 'class', 'linkStyle']
const regionHeaders = ['<nodes>', '<links>', '<style>', '</nodes>', '</links>', '</style>']

function suggestion(label: string, detail: string): CompletionSuggestion {
  return { label, detail, insertText: label }
}

/** 行首才补：光标前除缩进外只有刚敲下的 `<` 时也算行首。 */
export function completeAt(analysis: Analysis, line: number, character: number): CompletionSuggestion[] {
  const current = analysis.lines[line]
  if (current === undefined) return []
  if (current.role === 'comment' || current.role === 'value-item' || current.role === 'value-close') return []

  const prefix = current.text.slice(0, character).trim()
  if (prefix !== '' && !prefix.startsWith('<')) return []

  if (prefix.startsWith('<')) {
    return regionHeaders.filter((header) => header.startsWith(prefix)).map((header) => suggestion(header, '区标签'))
  }

  switch (current.region) {
    case 'nodes':
      return nodeKeys.map((key) => suggestion(key, '节点键'))
    case 'links':
      return linkKeys(analysis.lines).map((key) => suggestion(key, '连线键'))
    case 'style':
      return styleKeywords.map((keyword) => suggestion(keyword, '样式关键字'))
    default:
      return []
  }
}

/** 连线区的键：`artifact` 加本文件里已经写过的自由键。 */
function linkKeys(scanned: ScannedLine[]): string[] {
  const keys = ['artifact']
  for (const line of scanned) {
    if (line.role !== 'key-value' || line.region !== 'links') continue
    const key = line.text.slice(0, line.text.indexOf('=')).trim()
    if (key !== '' && !keys.includes(key)) keys.push(key)
  }
  return keys
}
