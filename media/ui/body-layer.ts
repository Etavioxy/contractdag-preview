/** 正文浮层：展开的契约正文住在 DOM 里，可选中、可查找；节点本身不再撑高。 */

import type { PreviewNode } from '../../src/panel/payload.ts'
import type { ViewTransform } from '../../src/panel/viewport.ts'

const gapFromNode = 8
const edgeInset = 8
const cardWidth = 260

export interface BodyLayer {
  /** 贴节点右侧；右边放不下就翻到左侧，纵向钳在视口内。 */
  update(nodes: PreviewNode[], camera: ViewTransform, viewport: { width: number; height: number }): void
}

interface Card {
  root: HTMLElement
  body: HTMLElement
  lines: string
}

export function createBodyLayer(container: HTMLElement): BodyLayer {
  const cards = new Map<string, Card>()

  return {
    update(nodes, camera, viewport) {
      const alive = new Set<string>()

      for (const node of nodes) {
        if (!node.expanded) continue
        alive.add(node.name)

        let card = cards.get(node.name)
        const text = node.lines.join('\n')
        if (card === undefined) {
          const root = document.createElement('div')
          root.className = 'body-card'
          const title = document.createElement('div')
          title.className = 'body-title'
          title.textContent = node.name
          const body = document.createElement('pre')
          body.className = 'body-text'
          root.append(title, body)
          container.append(root)
          card = { root, body, lines: '' }
          cards.set(node.name, card)
        }

        // 只换文字不重建节点：拖动与缩放时选中区与滚动位置都保得住。
        if (card.lines !== text) {
          card.body.textContent = text
          card.lines = text
        }
        place(card.root, node, camera, viewport)
      }

      for (const [name, card] of cards) {
        if (alive.has(name)) continue
        card.root.remove()
        cards.delete(name)
      }
    },
  }
}

/**
 * 浮层跟着相机一起缩放：它挂在节点旁边，比例变了却不变大变小，就会和图的尺度对不上。
 * 位置仍按屏幕坐标算，缩放交给 transform，锚点取左上角。
 */
function place(
  card: HTMLElement,
  node: PreviewNode,
  camera: ViewTransform,
  viewport: { width: number; height: number },
): void {
  const scale = camera.scale
  const left = node.x * scale - camera.scrollX
  const right = (node.x + node.width) * scale - camera.scrollX
  const top = node.y * scale - camera.scrollY
  const width = cardWidth * scale
  const height = card.offsetHeight * scale
  const gap = gapFromNode * scale

  const fitsRight = right + gap + width + edgeInset <= viewport.width
  card.style.transformOrigin = 'top left'
  card.style.transform = `scale(${scale})`
  card.style.left = `${fitsRight ? right + gap : Math.max(edgeInset, left - gap - width)}px`
  card.style.top = `${Math.min(Math.max(edgeInset, top), Math.max(edgeInset, viewport.height - height - edgeInset))}px`
}

export const bodyCardWidth = cardWidth
