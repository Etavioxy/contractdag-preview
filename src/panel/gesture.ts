/** 指针手势的判定：把「这次按下是点击还是拖动」与指针捕获时机从 DOM 里抽出来。 */

export interface PointerTrack {
  startX: number
  startY: number
  x: number
  y: number
  moved: number
}

/** 位移不超过这个像素数仍算点击：手在触控板上按一下会抖 1–3px。 */
export const clickSlop = 4

export function beginPointer(x: number, y: number): PointerTrack {
  return { startX: x, startY: y, x, y, moved: 0 }
}

export function movePointer(track: PointerTrack, x: number, y: number): PointerTrack {
  return { ...track, x, y, moved: Math.max(track.moved, Math.hypot(x - track.startX, y - track.startY)) }
}

/** 拖动从超过阈值那一刻开始算——捕获也只在此时才设，否则单击会被捕获吃掉。 */
export function isDrag(track: PointerTrack): boolean {
  return track.moved > clickSlop
}

export function isClick(track: PointerTrack): boolean {
  return !isDrag(track)
}
