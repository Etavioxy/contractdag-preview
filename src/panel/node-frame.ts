/** 节点框的宽：按名字估宽撑开，不截断。 */

import { layoutDefaults } from '../layout.ts'
import { nameInset, nameSize } from './node-size.ts'
import { estimateTextWidth } from './text.ts'

/** 名字完整显示需要的框宽；比默认宽还短的名字仍用默认宽。 */
export function nodeWidthFor(name: string): number {
  return Math.max(layoutDefaults.nodeWidth, Math.ceil(estimateTextWidth(name, nameSize) + nameInset * 2))
}
