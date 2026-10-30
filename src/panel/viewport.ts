/** 视口变换的纯计算：比例、锚点、钳制、阻尼。不碰 DOM，宿主与 webview 都能测。 */

export interface ViewTransform {
  scale: number
  scrollX: number
  scrollY: number
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export const scaleLimits = { min: 0.5, max: 3 } as const
export const scaleStep = 1.1

/** 每帧吃掉剩余距离的比例。0.18 时约十二帧走完九成，够迟滞又不拖泥带水。 */
export const dampingFactor = 0.18
export const scaleEpsilon = 0.0005

export function clampScale(scale: number): number {
  return Math.min(scaleLimits.max, Math.max(scaleLimits.min, scale))
}

/** 指数逼近：每帧朝目标走固定比例，越近越慢，收到阈值内就停。 */
export function approach(current: number, target: number, factor: number = dampingFactor): number {
  return current + (target - current) * factor
}

export function isSettled(current: number, target: number, epsilon: number): boolean {
  return Math.abs(target - current) < epsilon
}

/** 内容按比例放大后的像素尺寸。 */
export function scaledSize(content: Size, scale: number): Size {
  return { width: content.width * scale, height: content.height * scale }
}

/** 缩放时锚点下的内容保持不动：先把锚点换算成内容坐标，再按新比例摆回去。 */
export function anchorScroll(transform: ViewTransform, nextScale: number, anchor: Point): Offset {
  const contentX = (transform.scrollX + anchor.x) / transform.scale
  const contentY = (transform.scrollY + anchor.y) / transform.scale
  return { x: contentX * nextScale - anchor.x, y: contentY * nextScale - anchor.y }
}

/**
 * 每个方向允许滑出内容边界的余量，按视口的比例算。
 * 不给余量时，内容一旦贴合视口，可滚距离就是 0，双指滑行与拖动会完全失效。
 */
export const panSlack = 0.5

/** 位移量。统一用 `{x, y}`，避免与 `ViewTransform` 的 `scrollX/scrollY` 混用。 */
export interface Offset {
  x: number
  y: number
}

/** 滚动钳进「内容 + 两侧余量」的范围；余量允许负值，所以平移用 transform 而不是 scrollLeft。 */
export function clampScroll(scroll: Offset, viewport: Size, content: Size): Offset {
  const slackX = viewport.width * panSlack
  const slackY = viewport.height * panSlack
  const maxX = Math.max(0, content.width - viewport.width) + slackX
  const maxY = Math.max(0, content.height - viewport.height) + slackY
  return {
    x: Math.min(maxX, Math.max(-slackX, scroll.x)),
    y: Math.min(maxY, Math.max(-slackY, scroll.y)),
  }
}

/** 位移或比例一旦不是有限数就回到原点：宁可复位，也不要写出 NaN 让 transform 整条失效。 */
export function finiteOffset(scroll: Offset): boolean {
  return Number.isFinite(scroll.x) && Number.isFinite(scroll.y)
}

/**
 * 适配宽度：宽度贴合视口且不超过 1，高度超出就让纵向滚动负担。
 * 取两个方向的较小比例会让内容永远装进视口，可滚距离恒为 0，双指滑行等于失效。
 */
export function fitScale(viewport: Size, content: Size): number {
  if (content.width === 0) return 1
  return clampScale(Math.min(1, viewport.width / content.width))
}

/** 滚轮一格的目标比例：按固定倍率乘，落在上下限里。 */
export function stepScale(scale: number, forward: boolean): number {
  return clampScale(forward ? scale * scaleStep : scale / scaleStep)
}

/**
 * 小于这个比例就把那一层细节收掉，免得出现 6px 的字。
 * 展开的契约正文不参与分档：展开是显式动作，收掉就等于点不动。
 */
export const densityThresholds = { edgeLabel: 0.75, kind: 0.55 } as const

export type Density = 'name' | 'kind' | 'edge-label'

/** 当前比例下还该画到哪一层。 */
export function densityOf(scale: number): Density {
  if (scale >= densityThresholds.edgeLabel) return 'edge-label'
  if (scale >= densityThresholds.kind) return 'kind'
  return 'name'
}
