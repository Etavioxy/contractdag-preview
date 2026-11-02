/** 呈现用的逐行扫描：只认行的形态，不产出任何契约模型事实。 */

import { looksLikeKeyValue, parseKeyValue, parseNodeHead, regionClose, regionOpen } from './syntax.ts'

export type RegionName = 'nodes' | 'links' | 'style'

export type LineRole =
  | 'blank'
  | 'comment'
  | 'region-open'
  | 'region-close'
  | 'node-head'
  | 'link-head'
  | 'link-head-continue'
  | 'key-value'
  | 'value-open'
  | 'value-close'
  | 'value-item'
  | 'style-command'
  | 'other'

export interface ScannedLine {
  index: number
  text: string
  trimmed: string
  indent: number
  role: LineRole
  region: RegionName | 'none'
}

const regionNames: readonly RegionName[] = ['nodes', 'links', 'style']

function asRegion(name: string | undefined): RegionName | undefined {
  return regionNames.find((region) => region === name)
}

export function scanLines(source: string): ScannedLine[] {
  const lines = source.split(/\r?\n/)
  const scanned: ScannedLine[] = []
  let region: RegionName | 'none' = 'none'
  let inValueBlock = false
  let inLinkHead = false

  for (const [index, text] of lines.entries()) {
    const trimmed = text.trim()
    const indent = text.length - text.trimStart().length
    const base = { index, text, trimmed, indent, region }

    if (trimmed === '') {
      scanned.push({ ...base, role: 'blank' })
      continue
    }
    if (trimmed.startsWith('#')) {
      scanned.push({ ...base, role: 'comment' })
      continue
    }
    if (inValueBlock) {
      if (trimmed === ']') {
        inValueBlock = false
        scanned.push({ ...base, role: 'value-close', region: 'nodes' })
      } else {
        scanned.push({ ...base, role: 'value-item', region: 'nodes' })
      }
      continue
    }

    if (inLinkHead) {
      // 表头跨行：后续行的角色只影响着色与折叠，不产出模型事实。
      if (trimmed.endsWith(']]')) inLinkHead = false
      scanned.push({ ...base, role: 'link-head-continue', region: 'links' })
      continue
    }

    const open = asRegion(regionOpen(text))
    if (open !== undefined) {
      region = open
      scanned.push({ ...base, role: 'region-open', region: open })
      continue
    }
    const close = asRegion(regionClose(text))
    if (close !== undefined) {
      const closedRegion = region
      region = 'none'
      scanned.push({ ...base, role: 'region-close', region: closedRegion })
      continue
    }

    if (region === 'nodes' && trimmed.startsWith('[')) {
      scanned.push({ ...base, role: 'node-head' })
      continue
    }
    if (region === 'links' && trimmed.startsWith('[[')) {
      if (!trimmed.endsWith(']]')) inLinkHead = true
      scanned.push({ ...base, role: 'link-head' })
      continue
    }
    if ((region === 'nodes' || region === 'links') && looksLikeKeyValue(text)) {
      const parsed = parseKeyValue(text)
      const opensBlock = parsed.ok && parsed.value.value === '['
      if (opensBlock) inValueBlock = true
      scanned.push({ ...base, role: opensBlock ? 'value-open' : 'key-value' })
      continue
    }
    if (region === 'style') {
      scanned.push({ ...base, role: 'style-command' })
      continue
    }

    scanned.push({ ...base, role: 'other' })
  }

  return scanned
}

export function nodeNamesOf(scanned: ScannedLine[]): string[] {
  const names: string[] = []
  for (const line of scanned) {
    if (line.role !== 'node-head') continue
    const head = parseNodeHead(line.trimmed)
    if (head.ok) names.push(head.value.name)
  }
  return names
}
