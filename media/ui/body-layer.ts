/** 正文浮层：展开的契约正文住在 DOM 里，可选中、可查找；节点本身不再撑高。 */

import type { PreviewNode } from '../../src/panel/payload.ts'
import type { ViewTransform } from '../../src/panel/viewport.ts'

const gapFromNode = 8
const edgeInset = 8
const cardWidth = 260
/** 浮层淡入淡出的时长：短到不挡事，长到看得出来是在出现与消失。 */
export const fadeMs = 120

export interface BodyLayer {
  /** 贴节点右侧；右边放不下就翻到左侧，纵向钳在视口内。 */
  update(
    nodes: PreviewNode[],
    hovered: string | null,
    camera: ViewTransform,
    viewport: { width: number; height: number },
  ): void
}

interface Card {
  root: HTMLElement
  body: HTMLElement
  lines: string
  /** 临时展开（悬停）的浮层随指针移开消失；固定展开的等角标收起。 */
  temporary: boolean
  timer: number
}

export function createBodyLayer(container: HTMLElement): BodyLayer {
  const cards = new Map<string, Card>()

  function cardFor(node: PreviewNode): Card {
    const existing = cards.get(node.name)
    if (existing !== undefined) return existing

    const root = document.createElement('div')
    root.className = 'body-card'
    const title = document.createElement('div')
    title.className = 'body-title'
    title.textContent = node.name
    const body = document.createElement('pre')
    body.className = 'body-text'
    root.append(title, body)
    container.append(root)
    // 先挂上再触发过渡：一次 append 里同时加类，浏览器会把两帧并成一帧，看不到淡入。
    requestAnimationFrame(() => root.classList.add('is-visible'))

    const card: Card = { root, body, lines: '', temporary: false, timer: 0 }
    cards.set(node.name, card)
    return card
  }

  function drop(name: string, card: Card): void {
    card.root.classList.remove('is-visible')
    card.timer = window.setTimeout(() => {
      card.root.remove()
      cards.delete(name)
    }, fadeMs)
  }

  return {
    update(nodes, hovered, camera, viewport) {
      const wanted = new Map<string, PreviewNode>()
      for (const node of nodes) {
        if (node.expanded) wanted.set(node.name, node)
      }
      const hoveredNode = hovered === null ? undefined : nodes.find((node) => node.name === hovered)
      if (hoveredNode !== undefined && !wanted.has(hoveredNode.name)) wanted.set(hoveredNode.name, hoveredNode)

      for (const [name, node] of wanted) {
        const card = cardFor(node)
        card.temporary = !node.expanded
        if (card.timer !== 0) {
          window.clearTimeout(card.timer)
          card.timer = 0
        }
        card.root.classList.add('is-visible')

        // 只换文字不重建节点：拖动与缩放时选中区与滚动位置都保得住。
        const text = node.lines.join('\n')
        if (card.lines !== text) {
          card.body.textContent = text
          card.lines = text
        }
        place(card.root, node, camera, viewport)
      }

      for (const [name, card] of cards) {
        if (wanted.has(name) || card.timer !== 0) continue
        drop(name, card)
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
