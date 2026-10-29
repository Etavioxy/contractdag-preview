/** S1：宿主起得来、命令跑得通。 */

import * as vscode from 'vscode'
import type { ScenarioContext } from '../harness.ts'

export async function run(_context: ScenarioContext): Promise<void> {
  await vscode.commands.executeCommand('contractdag.dump')
}
