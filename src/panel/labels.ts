/** 标签落位：按缝分道、按道偏移、按缝带中点解 t。纯计算，不碰 DOM。 */

import type { Point } from './viewport.ts'

export interface Curve {
  p0: Point
  c1: Point
  c2: Point
  p3: Point
}

export interface SeamEdge {
  curve: Curve
  /** 出发缝号：源楼层在层序里的下标。 */
  seam: number
  artifacts: string[]
}

export interface LabelAnchor {
  edge: number
  text: string
  anchor: Point
}

export interface SeamPlacement {
  /** 每缝的道数，下标是缝号。 */
  rows: number[]
  labels: LabelAnchor[]
}

/** 半角列折算成字号的比例：约一个半角的平均字宽。 */
export const halfWidthEm = 0.55
/** 估宽留的余量：估窄会叠字，估宽只是多占位。 */
export const widthSafety = 1.1

/** 全角与 CJK 记两列，其余记一列。 */
export function isWideChar(char: string): boolean {
  return /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(char)
}

/** 宿主拿不到字体度量，只能按列估：半角记 0.55 个字号，再留一成余量。 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let columns = 0
  for (const char of text) columns += isWideChar(char) ? 2 : 1
  return columns * fontSize * halfWidthEm * widthSafety
}

/** 区间划分：按左端点排序，优先复用已经结束的道，得到最少道数。 */
export function partitionLanes(intervals: ReadonlyArray<{ start: number; end: number }>): {
  lanes: number[]
  rows: number
} {
  const order = intervals
    .map((interval, index) => ({ ...interval, index }))
    .sort((left, right) => left.start - right.start || left.index - right.index)

  const laneEnds: number[] = []
  const lanes = new Array<number>(intervals.length).fill(0)

  for (const interval of order) {
    let lane = laneEnds.findIndex((end) => end <= interval.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(interval.end)
    } else {
      laneEnds[lane] = interval.end
    }
    lanes[interval.index] = lane
  }

  return { lanes, rows: laneEnds.length }
}

/** 曲线上按参数取点。 */
export function pointAt(curve: Curve, t: number): Point {
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

/**
 * 解 t 让曲线的流动坐标落到 target：控制点在流动方向单调，二分即可。
 * 跨多层时标签要落在出发缝里，不能再假设 t=0.5。
 */
export function solveFlowT(curve: Curve, target: number, vertical: boolean): number {
  const flow = (t: number): number => (vertical ? pointAt(curve, t).y : pointAt(curve, t).x)
  let low = 0
  let high = 1
  const rising = flow(1) >= flow(0)
  for (let step = 0; step < 30; step += 1) {
    const middle = (low + high) / 2
    const value = flow(middle)
    if (rising === value < target) low = middle
    else high = middle
  }
  return (low + high) / 2
}

/**
 * 同一缝里的标签按交叉方向各占一段区间，区间相交的必须分到不同的道；
 * 道号沿流动方向偏移，标签因此仍落在自己那条曲线附近的缝带里。
 */
export function assignLabels(
  edges: ReadonlyArray<SeamEdge>,
  seamMid: ReadonlyArray<number | undefined>,
  vertical: boolean,
  fontSize: number,
  spacing: number,
): SeamPlacement {
  const groups = new Map<number, Array<{ edge: number; text: string; cross: number; width: number }>>()

  edges.forEach((edge, index) => {
    const mid = seamMid[edge.seam]
    if (mid === undefined) return
    const point = pointAt(edge.curve, solveFlowT(edge.curve, mid, vertical))
    const cross = vertical ? point.x : point.y
    const group = groups.get(edge.seam) ?? []
    for (const text of edge.artifacts) {
      group.push({ edge: index, text, cross, width: estimateTextWidth(text, fontSize) })
    }
    groups.set(edge.seam, group)
  })

  const rows: number[] = []
  const labels: LabelAnchor[] = []

  for (const [seam, group] of groups) {
    // 只有真正会撞的标签才互相错道：先按区间相交拆成簇，簇内部分道、各自居中。
    const order = group
      .map((piece, index) => ({
        index,
        start: piece.cross - piece.width / 2,
        end: piece.cross + piece.width / 2,
      }))
      .sort((left, right) => left.start - right.start || left.index - right.index)

    const clusters: Array<typeof order> = []
    let current: typeof order = []
    let clusterEnd = Number.NEGATIVE_INFINITY
    for (const interval of order) {
      if (current.length > 0 && interval.start >= clusterEnd) {
        clusters.push(current)
        current = []
        clusterEnd = Number.NEGATIVE_INFINITY
      }
      current.push(interval)
      clusterEnd = Math.max(clusterEnd, interval.end)
    }
    if (current.length > 0) clusters.push(current)

    rows[seam] = 1
    const mid = seamMid[seam] ?? 0

    for (const cluster of clusters) {
      const { lanes, rows: laneCount } = partitionLanes(cluster)
      rows[seam] = Math.max(rows[seam] ?? 1, laneCount)

      for (const [position, interval] of cluster.entries()) {
        const piece = group[interval.index]
        if (piece === undefined) continue
        const offset = (lanes[position]! - (laneCount - 1) / 2) * spacing
        const flow = mid + offset
        labels.push({
          edge: piece.edge,
          text: piece.text,
          anchor: vertical ? { x: piece.cross, y: flow - 6 } : { x: flow, y: piece.cross - 6 },
        })
      }
    }
  }

  return { rows, labels }
}
