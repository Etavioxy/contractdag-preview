/** webview 侧的渲染脚本：画图、管理视口（缩放与拖动，带阻尼）、把点击与状态回报给面板。 */

import type { PreviewPayload } from '../src/panel/payload.ts'
import { beginPointer, isClick, isDrag, movePointer, type PointerTrack } from '../src/panel/gesture.ts'
import {
  anchorScroll,
  approach,
  clampScroll,
  densityOf,
  finiteOffset,
  fitScale,
  isSettled,
  panBy,
  scaleEpsilon,
  scaledSize,
  stepScale,
} from '../src/panel/viewport.ts'

declare function acquireVsCodeApi(): { postMessage(message: unknown): void }

const vscode = acquireVsCodeApi()
const namespace = 'http://www.w3.org/2000/svg'

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
let zoom: ZoomRun | null = null
let frame = 0
let reportTimer = 0
/** 滚轮到底进没进来、进来的是哪个轴：位移不动时靠这三个数字分辨是没事件还是被钳住。 */
const wheelStats = { count: 0, deltaX: 0, deltaY: 0 }
let drag: { pointerId: number; track: PointerTrack; scrollX: number; scrollY: number } | null = null
/** 拖动结束会跟一个 click；这个标记让那次 click 不跳编辑器。 */
let suppressClick = false

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
    const line = element('path', { d: edge.path, fill: 'none' })
    const arrow = element('polygon', {
      points: `${edge.arrow.tipX},${edge.arrow.tipY} ${edge.arrow.leftX},${edge.arrow.leftY} ${edge.arrow.rightX},${edge.arrow.rightY}`,
    })
    if (edge.stroke !== undefined) {
      line.setAttribute('stroke', edge.stroke)
      arrow.setAttribute('fill', edge.stroke)
    }
    group.append(line, arrow)
    for (const label of edge.labels) {
      const text = element('text', { x: label.x, y: label.y })
      text.textContent = label.text
      group.append(text)
    }
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
      if (suppressClick) {
        suppressClick = false
        return
      }
      post({ type: 'reveal', payload: { name: node.name } })
    })
    graph.append(group)
  }

  if (firstRender) {
    firstRender = false
    scroll = { x: 0, y: 0 }
    scale = fitScale(viewportSize(), contentSize())
  } else {
    scroll = clampScroll(scroll, viewportSize(), scaledSize(contentSize(), scale))
  }

  applyView()
  postState()
}

/** 比例决定元素的像素尺寸，平移用 transform：viewBox 恒为内容坐标系，坐标不受缩放与平移影响。 */
function applyView(): void {
  if (current === null) return
  if (!finiteOffset(scroll) || !Number.isFinite(scale)) {
    // 不静默写出 NaN：transform 里出现 NaN 时浏览器整条声明作废，画面会完全不动。
    vscode.postMessage({ type: 'probe', payload: { kind: 'non-finite', scrollX: String(scroll.x), scrollY: String(scroll.y) } })
    scroll = { x: 0, y: 0 }
  }
  const size = scaledSize(contentSize(), scale)
  graph.style.width = `${size.width}px`
  graph.style.height = `${size.height}px`
  graph.style.transform = `translate(${-scroll.x}px, ${-scroll.y}px)`
  graph.setAttribute('data-density', densityOf(scale))
}

function start(): void {
  if (frame === 0) frame = requestAnimationFrame(tick)
}

/** 只有程序触发的缩放走缓动：滚轮与拖动直接跟手，系统惯性不叠加第二层阻尼。 */
function tick(): void {
  frame = 0
  if (current === null || zoom === null) return

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

  scroll = clampScroll(scroll, viewportSize(), scaledSize(contentSize(), scale))
  applyView()

  if (zoom !== null) start()
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
      wheelEvents: wheelStats.count,
      lastDeltaX: Math.round(wheelStats.deltaX),
      lastDeltaY: Math.round(wheelStats.deltaY),
      viewportWidth: Math.round(viewportSize().width),
      viewportHeight: Math.round(viewportSize().height),
      contentWidth: Math.round(current?.width ?? 0),
      contentHeight: Math.round(current?.height ?? 0),
    },
  })
}

/** 手势停下后回报一次，免得每帧都发消息。 */
function scheduleReport(): void {
  if (reportTimer !== 0) window.clearTimeout(reportTimer)
  reportTimer = window.setTimeout(() => {
    reportTimer = 0
    postState()
  }, 150)
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

    // 触控板自带惯性与阻尼，这里再逼近一层会变成双份惯性：滑不停、也停不准。
    const step = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    wheelStats.count += 1
    wheelStats.deltaX = event.deltaX
    wheelStats.deltaY = event.deltaY
    zoom = null
    scroll = panBy(
      scroll,
      { dx: event.shiftKey ? step : event.deltaX, dy: event.shiftKey ? 0 : step },
      viewportSize(),
      scaledSize(contentSize(), scale),
    )
    applyView()
    scheduleReport()
  },
  { passive: false },
)

viewport.addEventListener('pointerdown', (event: PointerEvent) => {
  if (event.button !== 0) return
  suppressClick = false
  drag = {
    pointerId: event.pointerId,
    track: beginPointer(event.clientX, event.clientY),
    scrollX: scroll.x,
    scrollY: scroll.y,
  }
  // 这里不设指针捕获：一旦在按下时就捕获，随后的 click 会派发给视口，节点的点击永远收不到。
})

viewport.addEventListener('pointermove', (event: PointerEvent) => {
  if (drag === null || event.pointerId !== drag.pointerId) return
  drag.track = movePointer(drag.track, event.clientX, event.clientY)
  if (!isDrag(drag.track)) return

  // 判定成拖动之后才捕获：单击不经过捕获，拖动也不会跑出视口。
  if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId)

  zoom = null
  scroll = panBy(
    { x: drag.scrollX, y: drag.scrollY },
    { dx: -(drag.track.x - drag.track.startX), dy: -(drag.track.y - drag.track.startY) },
    viewportSize(),
    scaledSize(contentSize(), scale),
  )
  applyView()
})

function endDrag(event: PointerEvent): void {
  if (drag === null || event.pointerId !== drag.pointerId) return
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
  if (isDrag(drag.track)) {
    suppressClick = true
    scheduleReport()
  } else {
    post({ type: 'probe', payload: { kind: 'click-gesture', scrollX: '', scrollY: '' } })
  }
  drag = null
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
    case 'wheel': {
      // 剧本用的合成立方位移：和真实滚轮走同一个入口，只是不经过 DOM 监听器。
      const { dx, dy } = message.payload as { dx: number; dy: number }
      zoom = null
      scroll = panBy(scroll, { dx, dy }, viewportSize(), scaledSize(contentSize(), scale))
      applyView()
      scheduleReport()
      break
    }
    default:
      break
  }
})

post({ type: 'ready' })
