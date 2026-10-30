/** 图布局：用 d3-dag 分层与定层内次序，坐标按样例的间距口径自己算。 */

import { graphStratify, sugiyama } from 'd3-dag'
import type { ContractModel, StyleSheet } from './model.ts'

export interface LayoutOptions {
  direction?: StyleSheet['direction']
  gap?: number
  nodeWidth?: number
  nodeHeight?: number
  gapCross?: number
  marginX?: number
  marginY?: number
  /** 按节点覆盖高度：展开的契约分区比折叠态高，层距要按最高那个算。 */
  heights?: Record<string, number>
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

export const layoutDefaults: Required<Omit<LayoutOptions, 'heights'>> = {
  direction: 'TB',
  gap: 20,
  nodeWidth: 160,
  nodeHeight: 56,
  gapCross: 40,
  marginX: 80,
  marginY: 24,
}

export function layout(model: ContractModel, options: LayoutOptions = {}): LayoutResult {
  const settings = { ...layoutDefaults, ...options }
  const heights = options.heights ?? {}
  const heightOf = (name: string): number => heights[name] ?? settings.nodeHeight

  const names = [...new Set(model.nodes.map((node) => node.name))]
  const boxes: LayoutResult = new Map()
  if (names.length === 0) return boxes

  const known = new Set(names)
  const data = names.map((name) => ({
    id: name,
    parentIds: model.links.filter((link) => link.to === name && known.has(link.from)).map((link) => link.from),
  }))

  const graph = graphStratify()(data)
  sugiyama().nodeSize([settings.nodeWidth + settings.gapCross, settings.nodeHeight + settings.gap])(graph)
  const layers = toLayers(
    [...graph.nodes()].map((node) => ({ name: node.data.id, x: node.x, y: node.y })),
    settings.nodeHeight + settings.gap,
  )

  const vertical = settings.direction === 'TB' || settings.direction === 'BT'
  const reversed = settings.direction === 'BT' || settings.direction === 'RL'

  // 每个节点在流动方向上的长度（TB 是高度，LR 是宽度）与在交叉方向上的长度各自算，
  // 再取每层最大值：展开的节点只把本层撑大，不压邻居。
  const flowOf = (name: string): number => (vertical ? heightOf(name) : settings.nodeWidth)
  const crossOf = (name: string): number => (vertical ? settings.nodeWidth : heightOf(name))
  const flowExtent = layers.map((layer) => Math.max(...layer.map(flowOf)))
  const crossExtent = layers.map((layer) => Math.max(...layer.map(crossOf)))

  const visualLayers = reversed ? [...layers].reverse() : layers
  const visualFlow = reversed ? [...flowExtent].reverse() : flowExtent
  const visualCross = reversed ? [...crossExtent].reverse() : crossExtent

  const widest = Math.max(
    ...visualLayers.map((layer, index) => layer.length * visualCross[index]! + (layer.length - 1) * settings.gapCross),
  )
  const crossStart = vertical ? settings.marginX : settings.marginY
  const flowStart = vertical ? settings.marginY : settings.marginX

  let flow = flowStart
  for (const [layerIndex, layer] of visualLayers.entries()) {
    const extent = visualCross[layerIndex]!
    const layerSpan = layer.length * extent + (layer.length - 1) * settings.gapCross
    const layerStart = crossStart + (widest - layerSpan) / 2
    const crossStep = extent + settings.gapCross

    for (const [order, name] of layer.entries()) {
      const cross = layerStart + order * crossStep
      const box = { width: settings.nodeWidth, height: heightOf(name) }
      boxes.set(
        name,
        vertical ? { x: cross, y: flow, ...box } : { x: flow, y: cross, ...box },
      )
    }

    flow += visualFlow[layerIndex]! + settings.gap
  }

  return boxes
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
