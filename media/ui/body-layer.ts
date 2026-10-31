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

function place(
  card: HTMLElement,
  node: PreviewNode,
  camera: ViewTransform,
  viewport: { width: number; height: number },
): void {
  const left = node.x * camera.scale - camera.scrollX
  const right = (node.x + node.width) * camera.scale - camera.scrollX
  const top = node.y * camera.scale - camera.scrollY
  const height = card.offsetHeight

  const fitsRight = right + gapFromNode + cardWidth + edgeInset <= viewport.width
  card.style.left = `${fitsRight ? right + gapFromNode : Math.max(edgeInset, left - gapFromNode - cardWidth)}px`
  card.style.top = `${Math.min(Math.max(edgeInset, top), Math.max(edgeInset, viewport.height - height - edgeInset))}px`
}

export const bodyCardWidth = cardWidth
