/** 面板要的数据：节点框、边的两端与标签位置、画布尺寸。纯计算，不碰 VSCode。 */

import { layout, layoutDefaults } from '../layout.ts'
import type { Diagnostic, NodeKind } from '../model.ts'
import type { Analysis } from '../parser.ts'
import type { Point } from './viewport.ts'

/** 三次贝塞尔：两端点与两个控制点。 */
interface Curve {
  p0: Point
  c1: Point
  c2: Point
  p3: Point
}

export interface PreviewNode {
  name: string
  kind: NodeKind
  line: number
  x: number
  y: number
  width: number
  height: number
  expanded: boolean
  /** 展开后的契约正文，已按框宽折好行；折叠态为空。只给浮层用，不参与排版。 */
  lines: string[]
  path: string[]
  destination: string[]
  /** 落在本节点上的结构缺陷码，渲染侧据此改描边或加角标。 */
  defects: string[]
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
  /** 该边带几个产物，标签按这个数散开。 */
  count: number
}

export interface PreviewLabel {
  x: number
  y: number
  text: string
}

export interface PreviewEdge {
  from: string
  to: string
  artifacts: string[]
  x1: number
  y1: number
  x2: number
  y2: number
  /** 弧线的两个控制点；起点与终点就是 `x1,y1`、`x2,y2`。 */
  curve: { c1: Point; c2: Point }
  /** 弧线的 SVG 路径。 */
  path: string
  labels: PreviewLabel[]
  arrow: PreviewArrow
  /** 落在本连线上的结构缺陷码。 */
  defects: string[]
  stroke?: string
}

export interface PreviewPayload {
  nodes: PreviewNode[]
  edges: PreviewEdge[]
  width: number
  height: number
  font: string
  highlight: string | null
  /** 折叠态高度：名字与种类画在这个高度里。 */
  headerHeight: number
  /** 结构缺陷原文：图里标一遍，清单里再列一遍。 */
  diagnostics: Diagnostic[]
}

const canvasMargin = 80
/** 箭头占的长度：线尾沿线回退这一段，三角形自己补上。 */
const arrowroom = 7
const arrowHalfWidth = 4
const header = layoutDefaults.nodeHeight
/** 浮层里正文的折行宽度，以半角列计：浮层的可用宽度比框宽，仍按列折，不依赖字体度量。 */
const contentColumns = 26

/** 诊断按起点行列对上节点或连线：两条记录同起点即同一条语法构件。 */
function rangeKey(startLine: number, startCharacter: number): string {
  return `${startLine}:${startCharacter}`
}

/** 文法错到没有模型时才不产出新图：结构缺陷照样画出来，就地标记。 */
export function buildPreviewPayload(
  analysis: Analysis,
  highlight: string | null = null,
  expanded: ReadonlySet<string> = new Set(),
): PreviewPayload | undefined {
  const model = analysis.model
  if (model === undefined) return undefined

  const structural = analysis.diagnostics.filter((diagnostic) => diagnostic.layer === 'structural')
  const defectsOf = new Map<string, string[]>()
  for (const diagnostic of structural) {
    const key = rangeKey(diagnostic.range.startLine, diagnostic.range.startCharacter)
    defectsOf.set(key, [...(defectsOf.get(key) ?? []), diagnostic.code])
  }

  const style = analysis.style
  const vertical = style.direction === 'TB' || style.direction === 'BT'

  const classProperties = new Map<string, Record<string, string>>()
  for (const assignment of style.classes) {
    const defined = style.classDefs[assignment.classes[0] ?? ''] ?? {}
    classProperties.set(assignment.node, { ...(classProperties.get(assignment.node) ?? {}), ...defined })
  }

  // 正文不再进框：展开只决定浮层里有没有内容，不影响任何框的高度与坐标。
  const linesOf = new Map<string, string[]>()
  for (const node of model.nodes) {
    if (expanded.has(node.name)) linesOf.set(node.name, contractLines(node.path, node.destination))
  }

  const boxes = layout(model, { direction: style.direction, gap: style.gap })

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
      path: node.path,
      destination: node.destination,
      defects: defectsOf.get(rangeKey(node.range.startLine, node.range.startCharacter)) ?? [],
      fill: properties['fill'],
      stroke: properties['stroke'],
    })
  }

  const byName = new Map(nodes.map((node) => [node.name, node]))
  const edges: PreviewEdge[] = []
  /** 边序号 → 弧线：位次要沿曲线算点，分配标签时复用同一份几何。 */
  const curves = new Map<number, Curve>()
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
    const curve = curveBetween(start, end, vertical)
    const arrow = arrowGeometry(curve, link.artifacts)
    edges.push({
      from: link.from,
      to: link.to,
      artifacts: [...link.artifacts],
      x1: start.x,
      y1: start.y,
      x2: arrow.baseX,
      y2: arrow.baseY,
      curve: { c1: curve.c1, c2: curve.c2 },
      path: `M ${start.x},${start.y} C ${curve.c1.x},${curve.c1.y} ${curve.c2.x},${curve.c2.y} ${arrow.baseX},${arrow.baseY}`,
      labels: [],
      arrow,
      defects: defectsOf.get(rangeKey(link.range.startLine, link.range.startCharacter)) ?? [],
      stroke: linkStyle?.properties['stroke'],
    })
    curves.set(edges.length - 1, curve)
  }

  placeLabels(edges, curves, vertical)

  const right = nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.x + node.width))
  const bottom = nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.y + node.height))

  return {
    nodes,
    edges,
    width: right + canvasMargin,
    height: bottom + canvasMargin,
    font: style.font ?? 'sans-serif',
    highlight,
    headerHeight: header,
    diagnostics: structural,
  }
}

/**
 * 弧线：两端沿流动方向出入，控制点各占一半，斜边也走成平滑的 S 形。
 * 直线在密集交叉处会连成一团，弧形能把来路和去向分开。
 */
function curveBetween(start: Point, end: Point, vertical: boolean): Curve {
  const c1 = vertical
    ? { x: start.x, y: start.y + (end.y - start.y) * 0.5 }
    : { x: start.x + (end.x - start.x) * 0.5, y: start.y }
  const c2 = vertical
    ? { x: end.x, y: end.y - (end.y - start.y) * 0.5 }
    : { x: end.x - (end.x - start.x) * 0.5, y: end.y }
  return { p0: start, c1, c2, p3: end }
}

function bezierAt(curve: Curve, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * curve.p0.x + b * curve.c1.x + c * curve.c2.x + d * curve.p3.x,
    y: a * curve.p0.y + b * curve.c1.y + c * curve.c2.y + d * curve.p3.y,
  }
}

/** 箭头几何：尖端落在目标框边，底边沿曲线在终点的切向回退，两翼按法线张开。 */
function arrowGeometry(curve: Curve, artifacts: string[]): PreviewArrow {
  const end = curve.p3
  const dx = end.x - curve.c2.x
  const dy = end.y - curve.c2.y
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
    count: artifacts.length,
  }
}

/**
 * 标签按层间位次落位：同一缝上的标签先按交叉方向排序，第 i 个放 t=(i+1)/(L+1)。
 * 单标签正好落在中点；层间越密，层距越高，位次之间的垂直距离随层距一起拉开。
 */
function placeLabels(edges: PreviewEdge[], curves: Map<number, Curve>, vertical: boolean): void {
  const bands = new Map<number, number[]>()
  edges.forEach((edge, index) => {
    // 缝的键取出发点的流动坐标：竖直方向是源框下沿的 y，水平方向是源框右沿的 x。
    const key = Math.round(vertical ? edge.y1 : edge.x1)
    const band = bands.get(key)
    if (band === undefined) bands.set(key, [index])
    else band.push(index)
  })

  const crossOf = (curve: Curve): number =>
    vertical ? (curve.p0.x + curve.p3.x) / 2 : (curve.p0.y + curve.p3.y) / 2

  for (const band of bands.values()) {
    const lanes = band.flatMap((index) => {
      const curve = curves.get(index)
      const edge = edges[index]
      if (curve === undefined || edge === undefined) return []
      return edge.artifacts.map((text) => ({ curve, edge, text }))
    })
    // 排序要稳定：同一个源扇出的多条边交叉坐标相近时，仍按连线区里的书写顺序排。
    lanes.sort((left, right) => crossOf(left.curve) - crossOf(right.curve))

    lanes.forEach((lane, index) => {
      const point = bezierAt(lane.curve, (index + 1) / (lanes.length + 1))
      lane.edge.labels.push({ x: point.x, y: point.y - 6, text: lane.text })
    })
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
