/** webview 侧的渲染脚本：画图、管理视口（缩放与拖动，带阻尼）、把点击与状态回报给面板。 */

import type { PreviewPayload } from '../src/panel/payload.ts'
import {
  anchorScroll,
  approach,
  clampScroll,
  densityOf,
  fitScale,
  isSettled,
  scaleEpsilon,
  scaledSize,
  scrollEpsilon,
  stepScale,
} from '../src/panel/viewport.ts'

declare function acquireVsCodeApi(): { postMessage(message: unknown): void }

const vscode = acquireVsCodeApi()
const namespace = 'http://www.w3.org/2000/svg'
const arrowLength = 7
/** 位移小于这个像素数才算点击；超过就是拖动，不跳编辑器。 */
const dragThreshold = 4

interface ZoomRun {
  fromScale: number
  toScale: number
  fromScroll: { x: number; y: number }
  toScroll: { x: number; y: number }
}

let current: PreviewPayload | null = null
let highlighted: string | null = null
let firstRender = true

let scale = 1
let scroll = { x: 0, y: 0 }
let targetScroll = { x: 0, y: 0 }
let zoom: ZoomRun | null = null
let frame = 0
let drag: { pointerId: number; pointerX: number; pointerY: number; scrollX: number; scrollY: number; moved: number } | null =
  null

const viewport = document.getElementById('viewport') as HTMLElement
const graph = document.getElementById('graph') as unknown as SVGSVGElement
const stale = document.getElementById('stale') as HTMLElement

function post(message: unknown): void {
  vscode.postMessage(message)
}

function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const created = document.createElementNS(namespace, name)
  for (const [key, value] of Object.entries(attributes)) created.setAttribute(key, String(value))
  return created
}

function contentSize(): { width: number; height: number } {
  return { width: current?.width ?? 0, height: current?.height ?? 0 }
}

function viewportSize(): { width: number; height: number } {
  return { width: viewport.clientWidth, height: viewport.clientHeight }
}

function render(payload: PreviewPayload): void {
  current = payload
  highlighted = payload.highlight
  stale.hidden = true
  graph.setAttribute('viewBox', `0 0 ${payload.width} ${payload.height}`)
  graph.style.fontFamily = payload.font
  graph.replaceChildren()

  const edges = element('g', { class: 'edges' })
  for (const edge of payload.edges) {
    const group = element('g', { class: 'edge' })
    const line = element('line', { x1: edge.x1, y1: edge.y1, x2: edge.x2, y2: edge.y2 })
    const arrow = arrowHead(edge)
    if (edge.stroke !== undefined) {
      line.setAttribute('stroke', edge.stroke)
      arrow.setAttribute('fill', edge.stroke)
    }
    const label = element('text', { x: edge.labelX, y: edge.labelY - 4 })
    label.textContent = edge.artifact
    group.append(line, arrow, label)
    edges.append(group)
  }
  graph.append(edges)

  for (const node of payload.nodes) {
    const group = element('g', { class: node.name === highlighted ? 'node highlight' : 'node', 'data-name': node.name })
    const rect = element('rect', { x: node.x, y: node.y, width: node.width, height: node.height, rx: 6 })
    if (node.fill !== undefined) rect.setAttribute('fill', node.fill)
    if (node.stroke !== undefined) rect.setAttribute('stroke', node.stroke)

    const name = element('text', {
      x: node.x + node.width / 2,
      y: node.y + payload.headerHeight / 2 - 8,
      'text-anchor': 'middle',
    })
    name.textContent = node.name
    const kind = element('text', {
      class: 'kind',
      x: node.x + node.width / 2,
      y: node.y + payload.headerHeight / 2 + 10,
      'text-anchor': 'middle',
    })
    kind.textContent = node.kind

    const chevron = element('text', { class: 'chevron', x: node.x + node.width - 12, y: node.y + 14, 'text-anchor': 'middle' })
    chevron.textContent = node.expanded ? '▾' : '▸'
    chevron.addEventListener('click', (event) => {
      event.stopPropagation()
      post({ type: 'expand', payload: { name: node.name } })
    })

    group.append(rect, name, kind, chevron)

    if (node.expanded) {
      const divider = element('line', {
        class: 'divider',
        x1: node.x + 6,
        y1: node.dividerY,
        x2: node.x + node.width - 6,
        y2: node.dividerY,
      })
      group.append(divider)
      const body = element('g', { class: 'contract', 'data-name': node.name })
      node.lines.forEach((text, index) => {
        const line = element('text', { x: node.x + 8, y: node.contentTop + index * payload.lineStep })
        line.textContent = text
        body.append(line)
      })
      group.append(body)
    }

    group.addEventListener('click', () => {
      if (drag !== null && drag.moved > dragThreshold) return
      post({ type: 'reveal', payload: { name: node.name } })
    })
    graph.append(group)
  }

  if (firstRender) {
    firstRender = false
    scroll = { x: 0, y: 0 }
    targetScroll = { x: 0, y: 0 }
    scale = fitScale(viewportSize(), contentSize())
  } else {
    scroll = clampScroll(scroll, viewportSize(), scaledSize(contentSize(), scale))
    targetScroll = { x: scroll.x, y: scroll.y }
  }

  applyView()
  postState()
}

/** 边轴对齐，箭头用三角形自己画：不依赖 marker 的 context-stroke。 */
function arrowHead(edge: PreviewPayload['edges'][number]): SVGPolygonElement {
  const vertical = Math.abs(edge.x2 - edge.x1) < 0.5
  const signX = Math.sign(edge.x2 - edge.x1)
  const signY = Math.sign(edge.y2 - edge.y1)
  const tipX = edge.x2 + signX * arrowLength
  const tipY = edge.y2 + signY * arrowLength

  return vertical
    ? element('polygon', { points: `${tipX},${tipY} ${tipX - 4},${edge.y2} ${tipX + 4},${edge.y2}` })
    : element('polygon', { points: `${tipX},${tipY} ${edge.x2},${tipY - 4} ${edge.x2},${tipY + 4}` })
}

/** 比例决定元素的像素尺寸，viewBox 恒为内容坐标系，所以缩放不影响坐标。 */
function applyView(): void {
  if (current === null) return
  const size = scaledSize(contentSize(), scale)
  graph.style.width = `${size.width}px`
  graph.style.height = `${size.height}px`
  graph.setAttribute('data-density', densityOf(scale))
  viewport.scrollLeft = scroll.x
  viewport.scrollTop = scroll.y
}

function start(): void {
  if (frame === 0) frame = requestAnimationFrame(tick)
}

/** 每帧朝目标走一步；比例与滚动共用一次指数逼近，滚动按比例进度插值，锚点才不漂。 */
function tick(): void {
  frame = 0
  if (current === null) return

  let busy = false
  if (zoom !== null) {
    const span = zoom.toScale - zoom.fromScale
    scale = approach(scale, zoom.toScale)
    const progress = span === 0 ? 1 : (scale - zoom.fromScale) / span
    scroll = {
      x: zoom.fromScroll.x + (zoom.toScroll.x - zoom.fromScroll.x) * progress,
      y: zoom.fromScroll.y + (zoom.toScroll.y - zoom.fromScroll.y) * progress,
    }
    if (isSettled(scale, zoom.toScale, scaleEpsilon)) {
      scale = zoom.toScale
      scroll = { ...zoom.toScroll }
      zoom = null
    }
    targetScroll = { x: scroll.x, y: scroll.y }
    busy = true
  } else if (!isSettled(scroll.x, targetScroll.x, scrollEpsilon) || !isSettled(scroll.y, targetScroll.y, scrollEpsilon)) {
    scroll = { x: approach(scroll.x, targetScroll.x), y: approach(scroll.y, targetScroll.y) }
    busy = true
  }

  scroll = clampScroll(scroll, viewportSize(), scaledSize(contentSize(), scale))
  applyView()

  if (busy) start()
  else postState()
}

function requestZoom(nextScale: number, anchor: { x: number; y: number }): void {
  const target = anchorScroll({ scale, scrollX: scroll.x, scrollY: scroll.y }, nextScale, anchor)
  zoom = { fromScale: scale, toScale: nextScale, fromScroll: { ...scroll }, toScroll: target }
  start()
}

function anchorAtCenter(): { x: number; y: number } {
  return { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
}

function applyHighlight(name: string | null): void {
  highlighted = name
  for (const group of graph.querySelectorAll('g.node')) {
    group.classList.toggle('highlight', group.getAttribute('data-name') === name)
  }
  postState()
}

function postState(): void {
  const expanded = current?.nodes.filter((node) => node.expanded).map((node) => node.name) ?? []
  const contractLines =
    current?.nodes.filter((node) => node.expanded).reduce((total, node) => total + node.lines.length, 0) ?? 0

  post({
    type: 'state',
    payload: {
      nodes: current?.nodes.length ?? 0,
      edges: current?.edges.length ?? 0,
      names: current?.nodes.map((node) => node.name) ?? [],
      highlight: highlighted,
      viewBox: graph.getAttribute('viewBox') ?? '',
      contractLines,
      expanded,
      scale: Math.round(scale * 100),
      scrollX: Math.round(scroll.x),
      scrollY: Math.round(scroll.y),
    },
  })
}

function showStale(messages: string[]): void {
  stale.hidden = false
  stale.textContent = `文法或结构有问题，先前的图保留：${messages.join('；')}`
}

viewport.addEventListener(
  'wheel',
  (event: WheelEvent) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const rect = viewport.getBoundingClientRect()
      requestZoom(stepScale(zoom?.toScale ?? scale, event.deltaY < 0), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
      return
    }

    const step = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    targetScroll = clampScroll(
      { x: targetScroll.x + (event.shiftKey ? step : event.deltaX), y: targetScroll.y + (event.shiftKey ? 0 : step) },
      viewportSize(),
      scaledSize(contentSize(), scale),
    )
    start()
  },
  { passive: false },
)

viewport.addEventListener('pointerdown', (event: PointerEvent) => {
  if (event.button !== 0) return
  drag = {
    pointerId: event.pointerId,
    pointerX: event.clientX,
    pointerY: event.clientY,
    scrollX: scroll.x,
    scrollY: scroll.y,
    moved: 0,
  }
  viewport.setPointerCapture(event.pointerId)
})

viewport.addEventListener('pointermove', (event: PointerEvent) => {
  if (drag === null || event.pointerId !== drag.pointerId) return
  const dx = event.clientX - drag.pointerX
  const dy = event.clientY - drag.pointerY
  drag.moved = Math.max(drag.moved, Math.hypot(dx, dy))
  if (drag.moved <= dragThreshold) return

  // 拖动不阻尼：手指到哪图到哪，阻尼加在这里会跟手不及。
  zoom = null
  scroll = clampScroll({ x: drag.scrollX - dx, y: drag.scrollY - dy }, viewportSize(), scaledSize(contentSize(), scale))
  targetScroll = { x: scroll.x, y: scroll.y }
  applyView()
})

function endDrag(event: PointerEvent): void {
  if (drag === null || event.pointerId !== drag.pointerId) return
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
  window.setTimeout(() => {
    drag = null
  }, 0)
}

viewport.addEventListener('pointerup', endDrag)
viewport.addEventListener('pointercancel', endDrag)

document.getElementById('zoom-in')?.addEventListener('click', () => {
  requestZoom(stepScale(zoom?.toScale ?? scale, true), anchorAtCenter())
})

document.getElementById('zoom-out')?.addEventListener('click', () => {
  requestZoom(stepScale(zoom?.toScale ?? scale, false), anchorAtCenter())
})

document.getElementById('zoom-fit')?.addEventListener('click', () => {
  zoom = {
    fromScale: scale,
    toScale: fitScale(viewportSize(), contentSize()),
    fromScroll: { ...scroll },
    toScroll: { x: 0, y: 0 },
  }
  start()
})

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as { type: string; payload?: unknown }
  switch (message.type) {
    case 'render':
      render(message.payload as PreviewPayload)
      break
    case 'highlight':
      applyHighlight((message.payload as { name: string | null }).name)
      break
    case 'stale':
      showStale((message.payload as { messages: string[] }).messages)
      break
    case 'click':
      post({ type: 'reveal', payload: { name: (message.payload as { name: string }).name } })
      break
    case 'expand':
      // 展开要重排，由宿主算新坐标后整份重发。
      post({ type: 'expand', payload: { name: (message.payload as { name: string }).name } })
      break
    default:
      break
  }
})

post({ type: 'ready' })
