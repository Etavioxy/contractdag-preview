/** 面板的 HTML 骨架：CSP、nonce、脚本地址都由调用方给，不在模板里猜。 */

export interface PreviewHtmlOptions {
  scriptUri: string
  nonce: string
}

export function buildPreviewHtml(options: PreviewHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Contract DAG Preview</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); overflow: hidden; }
  body { font-family: var(--vscode-editor-font-family, sans-serif); }
  #viewport { position: absolute; inset: 0; overflow: hidden; }
  #graph { display: block; }
  #controls { position: fixed; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 6px; background: var(--vscode-editorWidget-background, #232323); border: 1px solid var(--vscode-editorWidget-border, #555); }
  #controls button { min-width: 26px; height: 24px; padding: 0 6px; border: 0; border-radius: 4px; background: transparent; color: var(--vscode-editor-foreground); font-size: 12px; cursor: pointer; }
  #controls button:hover { background: var(--vscode-toolbar-hoverBackground, #3a3a3a); }
  #stale { position: fixed; left: 8px; right: 8px; bottom: 8px; margin: 0; padding: 6px 8px; border-radius: 4px; background: var(--vscode-inputValidation-errorBackground, #3a1d1d); color: var(--vscode-errorForeground, #f66); font-size: 12px; }
</style>
</head>
<body>
<div id="viewport"><canvas id="graph"></canvas></div>
<div id="controls">
  <button id="zoom-out" title="缩小">−</button>
  <button id="zoom-fit" title="适配宽度">适配宽度</button>
  <button id="zoom-in" title="放大">+</button>
</div>
<p id="stale" hidden></p>
<script nonce="${options.nonce}" src="${options.scriptUri}"></script>
</body>
</html>`
}
