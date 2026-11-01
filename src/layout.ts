/** 图布局：用 d3-dag 分层与定层内次序，坐标按样例的间距口径自己算。 */

import { graphStratify, sugiyama } from 'd3-dag'
import type { ContractModel, StyleSheet } from './model.ts'

export interface LayoutOptions {
  direction?: StyleSheet['direction']
  gap?: number
  nodeWidth?: number
  /** 每个节点的框宽；缺省时一律用 `nodeWidth`。名字长到放不下时靠它撑宽。 */
  nodeWidthOf?: (name: string) => number
  nodeHeight?: number
  gapCross?: number
  marginX?: number
  marginY?: number
  /** 每缝的标签道数：决定这一缝要不要比 `gap` 更高。 */
  seamRows?: number[]
}

export interface NodeBox {
  x: number
  y: number
  width: number
  height: number
}

export type LayoutResult = Map<string, NodeBox>

/** 对外的坐标形状：命令返回值与记录都用它。 */
export interface LayoutJson {
  boxes: Record<string, NodeBox>
}

export const layoutDefaults: Required<Omit<LayoutOptions, 'seamRows' | 'nodeWidthOf'>> = {
  direction: 'TB',
  // 层间要同时放下弧线、箭头与若干个产物标签：20 太挤，标签会被框压住。
  gap: 48,
  nodeWidth: 160,
  nodeHeight: 56,
  gapCross: 40,
  marginX: 80,
  marginY: 24,
}

/** 一个产物标签占的高度：层间空隙按跨缝标签数增长，步长就用它。 */
export const labelSpacing = 14
/** 标签的字形高度：撞不撞只看字形，4px 描边垫底不算。 */
export const labelHeight = 11
/** 标签与上下框之间的余量。 */
export const labelPadding = 4

export interface LayoutDetail {
  boxes: LayoutResult
  /** 层序：每层的节点名，下标就是缝号两侧的层号。 */
  layers: string[][]
}

export function layout(model: ContractModel, options: LayoutOptions = {}): LayoutResult {
  return layoutLayers(model, options).boxes
}

export function layoutLayers(model: ContractModel, options: LayoutOptions = {}): LayoutDetail {
  const settings = { ...layoutDefaults, ...options }

  const names = [...new Set(model.nodes.map((node) => node.name))]
  const boxes: LayoutResult = new Map()
  if (names.length === 0) return { boxes, layers: [] }

  const known = new Set(names)
  // 分层算法只认 DAG：环上的边先按出现顺序摘掉，画图仍用原模型，边上标红由渲染侧负责。
  const parents = acyclicParents(model, known)
  const data = names.map((name) => ({
    id: name,
    parentIds: parents.get(name) ?? [],
  }))

  const graph = graphStratify()(data)
  sugiyama().nodeSize([settings.nodeWidth + settings.gapCross, settings.nodeHeight + settings.gap])(graph)
  const layers = toLayers(
    [...graph.nodes()].map((node) => ({ name: node.data.id, x: node.x, y: node.y })),
    settings.nodeHeight + settings.gap,
  )

  const vertical = settings.direction === 'TB' || settings.direction === 'BT'
  const reversed = settings.direction === 'BT' || settings.direction === 'RL'

  // 缝高由这一缝要放几道标签决定：放得下就还是 gap，放不下才长高。
  const gapOf = (layer: number): number => {
    const rows = options.seamRows?.[layer] ?? 1
    return Math.max(settings.gap, labelHeight + (rows - 1) * labelSpacing + 2 * labelPadding)
  }

  // 框高统一、框宽按名字给：竖排时宽吃交叉方向，横排时宽吃流动方向。
  const widthOf = (name: string): number => settings.nodeWidthOf?.(name) ?? settings.nodeWidth
  // 交叉方向的长度：竖排时是框宽，横排时是框高。
  const crossOf = (name: string): number => (vertical ? widthOf(name) : settings.nodeHeight)
  const crossSpanOf = (layer: string[]): number =>
    layer.reduce((sum, name) => sum + crossOf(name), 0) + Math.max(0, layer.length - 1) * settings.gapCross
  /** 横排时这一层的流动长度取最宽的框，免得下一层压上来。 */
  const flowOf = (layer: string[]): number => (vertical ? settings.nodeHeight : Math.max(...layer.map(widthOf)))

  const visualLayers = reversed ? [...layers].reverse() : layers
  const visualFlow = visualLayers.map(flowOf)
  const visualCross = visualLayers.map(crossSpanOf)
  // 缝 i 是第 i 层与第 i+1 层之间；反转方向时缝的顺序也一并反。
  const gaps = Array.from({ length: Math.max(0, layers.length - 1) }, (_, index) => gapOf(index))
  const visualGaps = reversed ? [...gaps].reverse() : gaps

  const widest = Math.max(...visualCross)
  const crossStart = vertical ? settings.marginX : settings.marginY
  const flowStart = vertical ? settings.marginY : settings.marginX

  let flow = flowStart
  for (const [layerIndex, layer] of visualLayers.entries()) {
    const span = visualCross[layerIndex] ?? 0
    let cross = crossStart + (widest - span) / 2

    for (const name of layer) {
      const box = { width: widthOf(name), height: settings.nodeHeight }
      boxes.set(name, vertical ? { x: cross, y: flow, ...box } : { x: flow, y: cross, ...box })
      cross += crossOf(name) + settings.gapCross
    }

    flow += (visualFlow[layerIndex] ?? settings.nodeHeight) + (visualGaps[layerIndex] ?? settings.gap)
  }

  return { boxes, layers }
}

/** 层按 y 递增，层内按 d3-dag 给的 x 从左到右；相邻层距不会小于层距的一半，按这个阈值切层。 */
function toLayers(placed: Array<{ name: string; x: number; y: number }>, layerStep: number): string[][] {
  const layers: string[][] = []
  let layerY = Number.NaN

  for (const node of [...placed].sort((left, right) => left.y - right.y || left.x - right.x)) {
    if (layers.length === 0 || Math.abs(node.y - layerY) > layerStep / 2) {
      layers.push([])
      layerY = node.y
    }
    layers[layers.length - 1]?.push(node.name)
  }

  return layers
}

/**
 * 按出现顺序收边，跳过会成环的那一条：`to` 已经能走回 `from` 时，这条边只进图、不进分层。
 * 分层算法只认 DAG，环留给渲染侧标红，排版不等它。
 */
function acyclicParents(model: ContractModel, known: Set<string>): Map<string, string[]> {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()

  const reaches = (start: string, goal: string): boolean => {
    const seen = new Set<string>()
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.pop() as string
      if (current === goal) return true
      if (seen.has(current)) continue
      seen.add(current)
      for (const next of children.get(current) ?? []) queue.push(next)
    }
    return false
  }

  for (const link of model.links) {
    if (!known.has(link.from) || !known.has(link.to)) continue
    if (reaches(link.to, link.from)) continue

    const list = parents.get(link.to)
    if (list === undefined) parents.set(link.to, [link.from])
    else if (!list.includes(link.from)) list.push(link.from)

    const out = children.get(link.from)
    if (out === undefined) children.set(link.from, [link.to])
    else if (!out.includes(link.to)) out.push(link.to)
  }

  return parents
}
