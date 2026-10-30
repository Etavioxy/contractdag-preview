/** 面板要的数据：节点框、边的两端与标签位置、画布尺寸。纯计算，不碰 VSCode。 */

import { layout, layoutDefaults } from '../layout.ts'
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
  expanded: boolean
  /** 展开后的契约正文，已按框宽折好行；折叠态为空。 */
  lines: string[]
  /** 契约分区与头部之间的分隔线位置。 */
  dividerY: number
  /** 第一行正文的基线中心，其余行按 lineStep 递增。 */
  contentTop: number
  path: string[]
  destination: string[]
  fill?: string
  stroke?: string
}

/** 箭头三个顶点，由宿主按连线方向算好，渲染侧不再自己猜朝向。 */
export interface PreviewArrow {
  tipX: number
  tipY: number
  baseX: number
  baseY: number
  leftX: number
  leftY: number
  rightX: number
  rightY: number
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
  arrow: PreviewArrow
  stroke?: string
}

export interface PreviewPayload {
  nodes: PreviewNode[]
  edges: PreviewEdge[]
  width: number
  height: number
  font: string
  highlight: string | null
  /** 正文行距，webview 不自带常量。 */
  lineStep: number
  /** 契约分区与头部之间的空隙。 */
  dividerGap: number
  /** 折叠态高度：名字与种类画在这个高度里。 */
  headerHeight: number
}

const canvasMargin = 80
/** 箭头占的长度：线尾沿线回退这一段，三角形自己补上。 */
const arrowroom = 7
const arrowHalfWidth = 4
const header = layoutDefaults.nodeHeight
const lineStep = 13
const dividerGap = 6
const linePadTop = 10
const linePadBottom = 8
/** 框内正文可用宽度，以半角列计：框宽 160 减去两侧 8px 内边距。 */
const contentColumns = 26

/** 文法错或有结构缺陷时不产出新图：调用方保留上一张。 */
export function buildPreviewPayload(
  analysis: Analysis,
  highlight: string | null = null,
  expanded: ReadonlySet<string> = new Set(),
): PreviewPayload | undefined {
  const model = analysis.model
  if (model === undefined || analysis.diagnostics.length > 0) return undefined

  const style = analysis.style
  const vertical = style.direction === 'TB' || style.direction === 'BT'

  const classProperties = new Map<string, Record<string, string>>()
  for (const assignment of style.classes) {
    const defined = style.classDefs[assignment.classes[0] ?? ''] ?? {}
    classProperties.set(assignment.node, { ...(classProperties.get(assignment.node) ?? {}), ...defined })
  }

  const linesOf = new Map<string, string[]>()
  for (const node of model.nodes) {
    if (expanded.has(node.name)) linesOf.set(node.name, contractLines(node.path, node.destination))
  }

  const heights: Record<string, number> = {}
  for (const [name, lines] of linesOf) {
    heights[name] = header + dividerGap + linePadTop + (lines.length - 1) * lineStep + linePadBottom
  }

  const boxes = layout(model, { direction: style.direction, gap: style.gap, heights })

  const nodes: PreviewNode[] = []
  for (const node of model.nodes) {
    const box = boxes.get(node.name)
    if (box === undefined) continue
    const properties = classProperties.get(node.name) ?? {}
    const isExpanded = linesOf.has(node.name)
    nodes.push({
      name: node.name,
      kind: node.kind,
      line: node.range.startLine,
      ...box,
      expanded: isExpanded,
      lines: linesOf.get(node.name) ?? [],
      dividerY: box.y + header + dividerGap,
      contentTop: box.y + header + dividerGap + linePadTop,
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
    const start = vertical
      ? { x: from.x + from.width / 2, y: from.y + from.height }
      : { x: from.x + from.width, y: from.y + from.height / 2 }
    const end = vertical
      ? { x: to.x + to.width / 2, y: to.y }
      : { x: to.x, y: to.y + to.height / 2 }
    const linkStyle = style.linkStyles.find((entry) => entry.from === link.from && entry.to === link.to)
    const arrow = arrowGeometry(start, end)
    edges.push({
      from: link.from,
      to: link.to,
      artifact: link.properties['artifact'] ?? '',
      x1: start.x,
      y1: start.y,
      // 线尾沿线方向收，箭头三角形自己补上那段，两者朝向才一致。
      x2: arrow.baseX,
      y2: arrow.baseY,
      labelX: (start.x + end.x) / 2,
      labelY: (start.y + end.y) / 2,
      arrow,
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
    lineStep,
    dividerGap,
    headerHeight: header,
  }
}

/** 契约正文：path 每项带标签，destination 保持原句，按框宽折行。 */
/**
 * 箭头几何：尖端落在目标框边，底边沿连线方向回退，两翼按法线张开。
 * 相邻两层的框常不在同一列，连线是斜的；按轴对齐画三角形就会和线错开。
 */
function arrowGeometry(start: { x: number; y: number }, end: { x: number; y: number }): PreviewArrow {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const baseX = end.x - ux * arrowroom
  const baseY = end.y - uy * arrowroom
  const px = -uy * arrowHalfWidth
  const py = ux * arrowHalfWidth

  return {
    tipX: end.x,
    tipY: end.y,
    baseX,
    baseY,
    leftX: baseX + px,
    leftY: baseY + py,
    rightX: baseX - px,
    rightY: baseY - py,
  }
}

/** 契约正文：path 每项带标签，destination 保持原句，按框宽折行。 */
function contractLines(path: string[], destination: string[]): string[] {
  const labeled = [
    ...path.map((entry) => `path  ${entry}`),
    ...destination,
  ]
  return labeled.flatMap((line) => wrap(line, contentColumns))
}

/** 全角与 CJK 记两列，其余记一列；按列宽硬折，不依赖字体度量。 */
function wrap(text: string, columns: number): string[] {
  const out: string[] = []
  let current = ''
  let used = 0

  for (const char of text) {
    const width = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
      char,
    )
      ? 2
      : 1
    if (used + width > columns && current !== '') {
      out.push(current)
      current = ''
      used = 0
    }
    current += char
    used += width
  }

  if (current !== '') out.push(current)
  return out
}
