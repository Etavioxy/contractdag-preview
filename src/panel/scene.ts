/** 图元表：面板数据 + 视口状态 → 一串待画的矩形、曲线、多边形与文字。纯计算，不碰 DOM。 */

import type { PreviewEdge, PreviewNode, PreviewPayload } from './payload.ts'
import { densityOf, type Density, type Point, type ViewTransform } from './viewport.ts'

/** 画到屏幕上的颜色。webview 从主题变量取，测试给固定值。 */
export interface ScenePalette {
  foreground: string
  description: string
  nodeFill: string
  nodeStroke: string
  highlight: string
  edge: string
  background: string
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

export interface SceneLine {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  lineWidth: number
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

export type SceneItem = SceneRect | SceneLine | SceneCurve | ScenePolygon | SceneText

export interface Scene {
  /** 内容坐标系的大小，与缩放无关；画布本身铺满视口。 */
  width: number
  height: number
  density: Density
  items: SceneItem[]
}

const nameSize = 13
const smallSize = 11
const bodySize = 10
const nameRise = 8
const kindDrop = 10
const chevronInset = 12
const chevronDrop = 14
const bodyInset = 8
const dividerInset = 6

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
  const stroke = edge.stroke ?? palette.edge
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
      color: palette.description,
      align: 'middle',
      baseline: 'alphabetic',
      halo: palette.background,
    })
  }
  return items
}

function nodeItems(
  payload: PreviewPayload,
  node: PreviewNode,
  density: Density,
  palette: ScenePalette,
): SceneItem[] {
  const highlighted = node.name === payload.highlight
  const items: SceneItem[] = [
    {
      kind: 'rect',
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      radius: 6,
      fill: node.fill ?? palette.nodeFill,
      stroke: highlighted ? palette.highlight : (node.stroke ?? palette.nodeStroke),
      lineWidth: highlighted ? 3 : 1.5,
    },
    {
      kind: 'text',
      x: node.x + node.width / 2,
      y: node.y + payload.headerHeight / 2 - nameRise,
      text: node.name,
      size: nameSize,
      color: palette.foreground,
      align: 'middle',
      baseline: 'middle',
    },
    {
      kind: 'text',
      x: node.x + node.width / 2,
      y: node.y + payload.headerHeight / 2 + kindDrop,
      text: node.kind,
      size: smallSize,
      color: palette.description,
      align: 'middle',
      baseline: 'middle',
    },
    {
      kind: 'text',
      x: node.x + node.width - chevronInset,
      y: node.y + chevronDrop,
      text: node.expanded ? '▾' : '▸',
      size: smallSize,
      color: palette.description,
      align: 'middle',
      baseline: 'middle',
    },
  ]

  if (density === 'name') items.splice(2, 1)
  if (!node.expanded) return items

  items.push({
    kind: 'line',
    x1: node.x + dividerInset,
    y1: node.dividerY,
    x2: node.x + node.width - dividerInset,
    y2: node.dividerY,
    stroke: palette.nodeStroke,
    lineWidth: 1,
  })
  node.lines.forEach((text, index) => {
    items.push({
      kind: 'text',
      x: node.x + bodyInset,
      y: node.contentTop + index * payload.lineStep,
      text,
      size: bodySize,
      color: palette.foreground,
      align: 'start',
      baseline: 'alphabetic',
      halo: palette.background,
    })
  })

  return items
}
