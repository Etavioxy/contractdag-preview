import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.window.createOutputChannel('Contract DAG'))
}

export function deactivate(): void {}
