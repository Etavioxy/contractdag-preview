/** 折叠：区各一段，节点与连线各一段。 */

import { scanLines, type ScannedLine } from './scan.ts'

export interface FoldRange {
  start: number
  end: number
}

const bodyRoles = new Set<ScannedLine['role']>(['key-value', 'value-open', 'value-item', 'value-close'])

export function collectFoldingRanges(source: string): FoldRange[] {
  const scanned = scanLines(source)
  const ranges: FoldRange[] = []

  for (const [position, line] of scanned.entries()) {
    if (line.role === 'region-open') {
      const close = scanned.slice(position + 1).find((candidate) => candidate.role === 'region-close')
      if (close !== undefined && close.index > line.index) ranges.push({ start: line.index, end: close.index })
      continue
    }

    if (line.role !== 'node-head' && line.role !== 'link-head') continue

    let end = line.index
    for (let next = position + 1; next < scanned.length; next += 1) {
      const candidate = scanned[next]
      if (candidate === undefined || !bodyRoles.has(candidate.role)) break
      end = candidate.index
    }
    if (end > line.index) ranges.push({ start: line.index, end })
  }

  return ranges.sort((left, right) => left.start - right.start)
}
