/** S4：坐标与样板一致。 */

import * as vscode from 'vscode'
import type { LayoutJson } from '../../../src/layout.ts'
import { openDocumentAt, type ScenarioContext } from '../harness.ts'

export async function run(context: ScenarioContext): Promise<void> {
  await openDocumentAt(context.fixturePath())

  const result = await vscode.commands.executeCommand<LayoutJson>('contractdag.layout')
  const boxes = result?.boxes ?? {}
  const expected: Record<string, [number, number]> = {
    源码构建节点: [80, 24],
    上线安装节点: [80, 128],
    站点巡检节点: [80, 232],
    流水线收尾: [80, 336],
  }

  for (const [name, [x, y]] of Object.entries(expected)) {
    const box = boxes[name]
    context.check(`${name} 落在 ${x},${y}`, box?.x === x && box?.y === y)
  }
  context.check('四格同宽同高 160×56', Object.values(boxes).every((box) => box.width === 160 && box.height === 56))
}
