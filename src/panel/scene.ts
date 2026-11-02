/** 图元表：面板数据 + 视口状态 → 一串待画的矩形、曲线、多边形与文字。纯计算，不碰 DOM。 */

import type { PreviewEdge, PreviewNode, PreviewPayload } from './payload.ts'
import { nameSize } from './node-size.ts'
import { densityOf, type Density, type Point, type ViewTransform } from './viewport.ts'

/** 画到屏幕上的颜色。webview 从主题变量取，测试给固定值。 */
export interface ScenePalette {
  foreground: string
  description: string
  nodeFill: string
  nodeStroke: string
  /** 当前节点（光标所在行或回跳落点）的描边。 */
  highlight: string
  /** 当前节点的填充。 */
  highlightFill: string
  /** 当前节点的文字：比常规前景更亮。 */
  highlightForeground: string
  /** 指针悬停时的填充。 */
  hoverFill: string
  edge: string
  background: string
  /** 结构缺陷的标记色。 */
  error: string
}

export type SceneAlign = 'start' | 'middle' | 'end'
export type SceneBaseline = 'middle' | 'alphabetic'

export interface SceneRect {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  radius: number
  fill?: string
  stroke?: string
  lineWidth?: number
}

/** 三次贝塞尔：起点、两个控制点、终点。 */
export interface SceneCurve {
  kind: 'curve'
  p0: Point
  c1: Point
  c2: Point
  p3: Point
  stroke: string
  lineWidth: number
}

export interface ScenePolygon {
  kind: 'polygon'
  points: [Point, Point, Point]
  fill: string
}

/** 缺陷角标：一个圆底加一个惊叹号，画在节点左上角或产物标签旁边。 */
export interface SceneBadge {
  kind: 'badge'
  x: number
  y: number
  radius: number
  fill: string
  text: string
  color: string
  size: number
}

export interface SceneText {
  kind: 'text'
  x: number
  y: number
  text: string
  size: number
  color: string
  align: SceneAlign
  baseline: SceneBaseline
  /** 描边垫底色：压在曲线与框上的标签才读得清。 */
  halo?: string
}

export type SceneItem = SceneRect | SceneCurve | ScenePolygon | SceneBadge | SceneText

export interface Scene {
  /** 内容坐标系的大小，与缩放无关；画布本身铺满视口。 */
  width: number
  height: number
  density: Density
  items: SceneItem[]
}

const smallSize = 11
const nameRise = 8
const annotationDrop = 10
const chevronInset = 12
const chevronDrop = 14

/**
 * 画什么由 payload 决定，画到哪一层细节由当前比例决定。
 * 输出统一用内容坐标：相机由渲染侧的变换矩阵承接，缩放与平移不改图元。
 */
export function buildScene(
  payload: PreviewPayload,
  view: ViewTransform,
  palette: ScenePalette,
): Scene {
  const density = densityOf(view.scale)
  const items: SceneItem[] = []

  for (const edge of payload.edges) {
    items.push(...edgeItems(edge, density, palette))
  }
  for (const node of payload.nodes) {
    items.push(...nodeItems(payload, node, density, palette))
  }

  return { width: payload.width, height: payload.height, density, items }
}

function edgeItems(edge: PreviewEdge, density: Density, palette: ScenePalette): SceneItem[] {
  // 环上的边整条标红：形状还在，方向走不通。
  const stroke = edge.defects.includes('cycle') ? palette.error : (edge.stroke ?? palette.edge)
  const items: SceneItem[] = [
    {
      kind: 'curve',
      p0: { x: edge.x1, y: edge.y1 },
      c1: edge.curve.c1,
      c2: edge.curve.c2,
      p3: { x: edge.x2, y: edge.y2 },
      stroke,
      lineWidth: 1.5,
    },
    {
      kind: 'polygon',
      points: [
        { x: edge.arrow.tipX, y: edge.arrow.tipY },
        { x: edge.arrow.leftX, y: edge.arrow.leftY },
        { x: edge.arrow.rightX, y: edge.arrow.rightY },
      ],
      fill: stroke,
    },
  ]

  if (density !== 'edge-label') return items
  for (const label of edge.labels) {
    items.push({
      kind: 'text',
      x: label.x,
      y: label.y,
      text: label.text,
      size: smallSize,
      color: edge.defects.length > 0 ? palette.error : palette.description,
      align: 'middle',
      baseline: 'alphabetic',
      halo: palette.background,
    })
  }

  // 产物重名：角标贴在第一个产物标签的右上角。
  const first = edge.labels[0]
  if (edge.defects.includes('duplicate-artifact') && first !== undefined) {
    items.push(badge(first.x + smallSize, first.y - 6, palette))
  }

  return items
}

export function badge(x: number, y: number, palette: ScenePalette): SceneBadge {
  return { kind: 'badge', x, y, radius: 6, fill: palette.error, text: '!', color: palette.background, size: 10 }
}

function nodeItems(
  payload: PreviewPayload,
  node: PreviewNode,
  density: Density,
  palette: ScenePalette,
): SceneItem[] {
  const highlighted = node.name === payload.highlight
  const hovered = !highlighted && payload.hover === node.name
  // 两者落在同一个节点时按当前节点画：高亮压过悬停，描边不在一粗一细之间打架。
  const stroke = highlighted || hovered ? palette.highlight : (node.stroke ?? palette.nodeStroke)
  const fill =
    node.fill ?? (highlighted ? palette.highlightFill : hovered ? palette.hoverFill : palette.nodeFill)

  const items: SceneItem[] = [
    {
      kind: 'rect',
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      radius: 6,
      fill,
      stroke,
      lineWidth: highlighted ? 3 : hovered ? 2 : 1.5,
    },
    {
      kind: 'text',
      x: node.x + node.width / 2,
      y: node.y + payload.headerHeight / 2 - nameRise,
      text: node.name,
      size: nameSize,
      color: highlighted ? palette.highlightForeground : palette.foreground,
      align: 'middle',
      baseline: 'middle',
    },
  ]

  // 标注是自由文本，写了才画；低比例下先收掉，给名字留位置。
  if (density !== 'name' && node.annotation !== '') {
    items.push({
      kind: 'text',
      x: node.x + node.width / 2,
      y: node.y + payload.headerHeight / 2 + annotationDrop,
      text: node.annotation,
      size: smallSize,
      color: highlighted ? palette.highlightForeground : palette.description,
      align: 'middle',
      baseline: 'middle',
    })
  }

  items.push({
    kind: 'text',
    x: node.x + node.width - chevronInset,
    y: node.y + chevronDrop,
    text: node.expanded ? '▾' : '▸',
    size: smallSize,
    color: highlighted ? palette.highlightForeground : palette.description,
    align: 'middle',
    baseline: 'middle',
  })

  // 缺 path：角标钉在左上角，不挡名字与角标。
  if (node.defects.includes('missing-path')) items.push(badge(node.x + 10, node.y + 10, palette))
  return items
}
