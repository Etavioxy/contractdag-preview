/** 命中判定：内容坐标 → 节点或它的展开角标。纯计算，不碰 DOM。 */

import type { PreviewPayload } from './payload.ts'
import type { Point } from './viewport.ts'

export interface HitNode {
  kind: 'node'
  name: string
}

export interface HitChevron {
  kind: 'chevron'
  name: string
}

export type Hit = HitNode | HitChevron | null

/** 角标的可点范围：右上角 24×28，比字形本身大一圈，免得要精确戳中。 */
export const chevronHitBox = { width: 24, height: 28 } as const

/**
 * 后画的盖住先画的：从最后一个节点往前找。
 * 角标画在框里，与框重叠，所以同一个节点先判角标。
 */
export function hitTest(payload: PreviewPayload, point: Point): Hit {
  for (let index = payload.nodes.length - 1; index >= 0; index -= 1) {
    const node = payload.nodes[index]
    if (node === undefined) continue

    const inNode =
      point.x >= node.x &&
      point.x <= node.x + node.width &&
      point.y >= node.y &&
      point.y <= node.y + node.height
    if (!inNode) continue

    const chevronLeft = node.x + node.width - chevronHitBox.width
    const chevronBottom = node.y + chevronHitBox.height
    if (point.x >= chevronLeft && point.y <= chevronBottom) return { kind: 'chevron', name: node.name }
    return { kind: 'node', name: node.name }
  }
  return null
}
