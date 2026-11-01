/** 节点框的尺寸口径：宽由名字撑开，高固定；名字不截断。 */

import { layoutDefaults } from '../layout.ts'
import { estimateTextWidth } from './text.ts'

/** 名字的字号。 */
export const nameSize = 13
/** 名字左右各留的内缩：留出角标与边框的呼吸。 */
export const nameInset = 12

/** 名字完整显示需要的框宽；比默认宽还短的名字仍用默认宽。 */
export function nodeWidthFor(name: string): number {
  return Math.max(layoutDefaults.nodeWidth, Math.ceil(estimateTextWidth(name, nameSize) + nameInset * 2))
}
