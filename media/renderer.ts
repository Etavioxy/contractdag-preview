/** 画布：把图元表按相机变换画出来。全量重绘，不保留对象模型。 */

import type { Scene, SceneAlign, SceneBaseline, SceneItem, ScenePalette } from '../src/panel/scene.ts'
import type { ViewTransform } from '../src/panel/viewport.ts'

export interface RendererSize {
  width: number
  height: number
}

export interface CanvasRenderer {
  /** 画布铺满视口；后端尺寸按设备像素比放大，样式尺寸仍是 CSS 像素。 */
  resize(viewport: RendererSize, pixelRatio: number): RendererSize
  /** 每帧全量重绘：相机由变换矩阵承接，图元不需要跟着缩放重算。 */
  draw(scene: Scene, camera: ViewTransform, fontFamily: string): void
}

export function createRenderer(canvas: HTMLCanvasElement): CanvasRenderer {
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('canvas 拿不到 2d 上下文')

  let ratio = 1

  return {
    resize(viewport, pixelRatio) {
      ratio = pixelRatio > 0 ? pixelRatio : 1
      canvas.width = Math.max(1, Math.round(viewport.width * ratio))
      canvas.height = Math.max(1, Math.round(viewport.height * ratio))
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      return { width: canvas.width, height: canvas.height }
    },

    draw(scene, camera, fontFamily) {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.setTransform(
        ratio * camera.scale,
        0,
        0,
        ratio * camera.scale,
        -ratio * camera.scrollX,
        -ratio * camera.scrollY,
      )
      for (const item of scene.items) paint(context, item, fontFamily)
    },
  }
}

/** 字体名带空格或连字符时 canvas 会解析失败，统一包成带引号的族名。 */
export function fontOf(size: number, family: string): string {
  return `${size}px "${family}", sans-serif`
}

function paint(context: CanvasRenderingContext2D, item: SceneItem, family: string): void {
  switch (item.kind) {
    case 'rect': {
      context.beginPath()
      context.roundRect(item.x, item.y, item.width, item.height, item.radius)
      if (item.fill !== undefined) {
        context.fillStyle = item.fill
        context.fill()
      }
      if (item.stroke !== undefined) {
        context.strokeStyle = item.stroke
        context.lineWidth = item.lineWidth ?? 1
        context.stroke()
      }
      return
    }
    case 'line': {
      context.beginPath()
      context.moveTo(item.x1, item.y1)
      context.lineTo(item.x2, item.y2)
      context.strokeStyle = item.stroke
      context.lineWidth = item.lineWidth
      context.stroke()
      return
    }
    case 'curve': {
      context.beginPath()
      context.moveTo(item.p0.x, item.p0.y)
      context.bezierCurveTo(item.c1.x, item.c1.y, item.c2.x, item.c2.y, item.p3.x, item.p3.y)
      context.strokeStyle = item.stroke
      context.lineWidth = item.lineWidth
      context.lineCap = 'round'
      context.stroke()
      return
    }
    case 'polygon': {
      context.beginPath()
      context.moveTo(item.points[0].x, item.points[0].y)
      context.lineTo(item.points[1].x, item.points[1].y)
      context.lineTo(item.points[2].x, item.points[2].y)
      context.closePath()
      context.fillStyle = item.fill
      context.fill()
      return
    }
    case 'text': {
      context.font = fontOf(item.size, family)
      context.textAlign = alignOf(item.align)
      context.textBaseline = baselineOf(item.baseline)
      // 描边垫底再填字：压在曲线与框上的标签才读得清，等价于 SVG 的 paint-order: stroke。
      if (item.halo !== undefined) {
        context.lineJoin = 'round'
        context.lineWidth = 4
        context.strokeStyle = item.halo
        context.strokeText(item.text, item.x, item.y)
      }
      context.fillStyle = item.color
      context.fillText(item.text, item.x, item.y)
      return
    }
  }
}

function alignOf(align: SceneAlign): CanvasTextAlign {
  if (align === 'middle') return 'center'
  if (align === 'end') return 'right'
  return 'left'
}

function baselineOf(baseline: SceneBaseline): CanvasTextBaseline {
  return baseline
}

/** 主题色只从 CSS 变量取，不在脚本里写死深浅两套。 */
export function readPalette(root: HTMLElement): ScenePalette {
  const style = getComputedStyle(root)
  const read = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim()
    return value === '' ? fallback : value
  }

  return {
    foreground: read('--vscode-editor-foreground', '#cccccc'),
    description: read('--vscode-descriptionForeground', '#999999'),
    nodeFill: read('--vscode-editorWidget-background', '#232323'),
    nodeStroke: read('--vscode-editorWidget-border', '#555555'),
    highlight: read('--vscode-focusBorder', '#4a9eff'),
    edge: read('--vscode-editorLineNumber-foreground', '#666666'),
    background: read('--vscode-editor-background', '#1e1e1e'),
  }
}

export type { ScenePalette }
