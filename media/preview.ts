/** webview 侧的脚本：把图元画到画布、管相机（缩放与拖动）、把命中与状态回报给面板。 */

import { beginPointer, isDrag, movePointer, type PointerTrack } from '../src/panel/gesture.ts'
import { hitTest } from '../src/panel/hit.ts'
import type { PreviewPayload } from '../src/panel/payload.ts'
import { buildScene, type Scene } from '../src/panel/scene.ts'
import {
  anchorScroll,
  approach,
  clampScroll,
  finiteOffset,
  fitScale,
  isSettled,
  panBy,
  scaleEpsilon,
  scaledSize,
  stepScale,
  type Point,
  type ViewTransform,
} from '../src/panel/viewport.ts'
import { createRenderer, readPalette } from './renderer.ts'

declare function acquireVsCodeApi(): { postMessage(message: unknown): void }

const vscode = acquireVsCodeApi()

interface ZoomRun {
  fromScale: number
  toScale: number
  fromScroll: Point
  toScroll: Point
}

let current: PreviewPayload | null = null
let scene: Scene | null = null
let firstRender = true

let scale = 1
let scroll: Point = { x: 0, y: 0 }
let zoom: ZoomRun | null = null
let frame = 0
let reportTimer = 0
/** 滚轮到底进没进来、进来的是哪个轴：位移不动时靠这三个数字分辨是没事件还是被钳住。 */
const wheelStats = { count: 0, deltaX: 0, deltaY: 0 }
let drag: { pointerId: number; track: PointerTrack; scrollX: number; scrollY: number } | null = null

const viewport = document.getElementById('viewport') as HTMLElement
const canvas = document.getElementById('graph') as HTMLCanvasElement
const stale = document.getElementById('stale') as HTMLElement
const renderer = createRenderer(canvas)

function post(message: unknown): void {
  vscode.postMessage(message)
}

function contentSize(): { width: number; height: number } {
  return { width: current?.width ?? 0, height: current?.height ?? 0 }
}

function viewportSize(): { width: number; height: number } {
  return { width: viewport.clientWidth, height: viewport.clientHeight }
}

function camera(): ViewTransform {
  return { scale, scrollX: scroll.x, scrollY: scroll.y }
}

function render(payload: PreviewPayload): void {
  current = payload
  stale.hidden = true

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

/** 相机整个交给变换矩阵：图元是内容坐标，缩放与平移不改一份图。 */
function applyView(): void {
  if (current === null) return
  if (!finiteOffset(scroll) || !Number.isFinite(scale)) {
    // 不静默画错：非有限数会让整幅变换失效，先复位再回报。
    post({ type: 'probe', payload: { kind: 'non-finite', scrollX: String(scroll.x), scrollY: String(scroll.y) } })
    scroll = { x: 0, y: 0 }
  }

  renderer.resize(viewportSize(), window.devicePixelRatio)
  scene = buildScene(current, camera(), readPalette(document.body))
  renderer.draw(scene, camera(), current.font)
  canvas.dataset['density'] = scene.density
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

function requestZoom(nextScale: number, anchor: Point): void {
  const target = anchorScroll({ scale, scrollX: scroll.x, scrollY: scroll.y }, nextScale, anchor)
  zoom = { fromScale: scale, toScale: nextScale, fromScroll: { ...scroll }, toScroll: target }
  start()
}

function anchorAtCenter(): Point {
  return { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
}

/** 指针位置换算成内容坐标：命中判定只需要内容坐标，与相机无关。 */
function contentPoint(clientX: number, clientY: number): Point {
  const rect = viewport.getBoundingClientRect()
  return { x: (clientX - rect.left + scroll.x) / scale, y: (clientY - rect.top + scroll.y) / scale }
}

/** 命中之后只做两件事：角标切展开，框把光标带回声明行。 */
function handleHit(point: Point): void {
  if (current === null) return
  const hit = hitTest(current, point)
  if (hit === null) {
    post({ type: 'probe', payload: { kind: 'hit-miss', x: String(Math.round(point.x)), y: String(Math.round(point.y)) } })
    return
  }
  post({ type: hit.kind === 'chevron' ? 'expand' : 'reveal', payload: { name: hit.name } })
}

function applyHighlight(name: string | null): void {
  if (current === null) return
  current = { ...current, highlight: name }
  applyView()
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
      highlight: current?.highlight ?? null,
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
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      devicePixelRatio: window.devicePixelRatio,
      sceneItems: scene?.items.length ?? 0,
      density: scene?.density ?? '',
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
  drag = {
    pointerId: event.pointerId,
    track: beginPointer(event.clientX, event.clientY),
    scrollX: scroll.x,
    scrollY: scroll.y,
  }
  // 这里不设指针捕获：一旦在按下时就捕获，单击之后的 pointerup 会跑偏，命中判定拿不到原位点。
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

  // 单击与拖动的分界沿用 gesture 的口径：没过阈值才算点，点才做命中。
  const wasClick = !isDrag(drag.track)
  drag = null
  if (wasClick) {
    post({ type: 'probe', payload: { kind: 'click-gesture', scrollX: '', scrollY: '' } })
    handleHit(contentPoint(event.clientX, event.clientY))
  } else {
    scheduleReport()
  }
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

window.addEventListener('resize', () => {
  zoom = null
  scroll = clampScroll(scroll, viewportSize(), scaledSize(contentSize(), scale))
  applyView()
  scheduleReport()
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
    case 'clickAt': {
      // 剧本用的合成点击：给的是内容坐标，走的仍是同一条命中路径。
      const point = message.payload as Point
      handleHit(point)
      break
    }
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
