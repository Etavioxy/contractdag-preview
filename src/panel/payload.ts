/** 面板要的数据：节点框、边的两端与标签位置、画布尺寸。纯计算，不碰 VSCode。 */

import { layout } from '../layout.ts'
import type { NodeKind } from '../model.ts'
import type { Analysis } from '../parser.ts'

export interface PreviewNode {
  name: string
  kind: NodeKind
  line: number
  x: number
  y: number
  width: number
  height: number
  path: string[]
  destination: string[]
  fill?: string
  stroke?: string
}

export interface PreviewEdge {
  from: string
  to: string
  artifact: string
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
  stroke?: string
}

export interface PreviewPayload {
  nodes: PreviewNode[]
  edges: PreviewEdge[]
  width: number
  height: number
  font: string
  highlight: string | null
}

const canvasMargin = 80

/** 文法错或有结构缺陷时不产出新图：调用方保留上一张。 */
export function buildPreviewPayload(analysis: Analysis, highlight: string | null = null): PreviewPayload | undefined {
  const model = analysis.model
  if (model === undefined || analysis.diagnostics.length > 0) return undefined

  const style = analysis.style
  const boxes = layout(model, { direction: style.direction, gap: style.gap })
  const vertical = style.direction === 'TB' || style.direction === 'BT'

  const classProperties = new Map<string, Record<string, string>>()
  for (const assignment of style.classes) {
    const defined = style.classDefs[assignment.classes[0] ?? ''] ?? {}
    classProperties.set(assignment.node, { ...(classProperties.get(assignment.node) ?? {}), ...defined })
  }

  const nodes: PreviewNode[] = []
  for (const node of model.nodes) {
    const box = boxes.get(node.name)
    if (box === undefined) continue
    const properties = classProperties.get(node.name) ?? {}
    nodes.push({
      name: node.name,
      kind: node.kind,
      line: node.range.startLine,
      ...box,
      path: node.path,
      destination: node.destination,
      fill: properties['fill'],
      stroke: properties['stroke'],
    })
  }

  const byName = new Map(nodes.map((node) => [node.name, node]))
  const edges: PreviewEdge[] = []
  for (const link of model.links) {
    const from = byName.get(link.from)
    const to = byName.get(link.to)
    if (from === undefined || to === undefined) continue
    const points = vertical
      ? { x1: from.x + from.width / 2, y1: from.y + from.height, x2: to.x + to.width / 2, y2: to.y }
      : { x1: from.x + from.width, y1: from.y + from.height / 2, x2: to.x, y2: to.y + to.height / 2 }
    const linkStyle = style.linkStyles.find((entry) => entry.from === link.from && entry.to === link.to)
    edges.push({
      from: link.from,
      to: link.to,
      artifact: link.properties['artifact'] ?? '',
      ...points,
      labelX: (points.x1 + points.x2) / 2,
      labelY: (points.y1 + points.y2) / 2,
      stroke: linkStyle?.properties['stroke'],
    })
  }

  const right = nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.x + node.width))
  const bottom = nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.y + node.height))

  return {
    nodes,
    edges,
    width: right + canvasMargin,
    height: bottom + canvasMargin,
    font: style.font ?? 'sans-serif',
    highlight,
  }
}
