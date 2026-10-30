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
  html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  body { font-family: var(--vscode-editor-font-family, sans-serif); }
  #graph { display: block; width: 100%; height: 100%; }
  .node rect { fill: var(--vscode-editorWidget-background, #232323); stroke: var(--vscode-editorWidget-border, #555); stroke-width: 1.5; rx: 6; }
  .node.highlight rect { stroke: var(--vscode-focusBorder, #4a9eff); stroke-width: 3; }
  .node text { fill: var(--vscode-editor-foreground); font-size: 13px; dominant-baseline: middle; }
  .node .kind { fill: var(--vscode-descriptionForeground, #999); font-size: 11px; }
  .edge line { stroke: var(--vscode-editorLineNumber-foreground, #666); stroke-width: 1.5; }
  .edge polygon { fill: var(--vscode-editorLineNumber-foreground, #666); stroke: none; }
  .edge text { fill: var(--vscode-descriptionForeground, #999); font-size: 11px; text-anchor: middle; paint-order: stroke; stroke: var(--vscode-editor-background, #1e1e1e); stroke-width: 4px; stroke-linejoin: round; }
  .chevron { fill: var(--vscode-descriptionForeground, #999); font-size: 11px; cursor: pointer; }
  .node .divider { stroke: var(--vscode-editorWidget-border, #555); stroke-width: 1; }
  .contract text { fill: var(--vscode-editor-foreground); font-size: 10px; paint-order: stroke; stroke: var(--vscode-textCodeBlock-background, #1b1b1b); stroke-width: 3px; stroke-linejoin: round; }
  #stale { margin: 8px; color: var(--vscode-errorForeground, #f66); font-size: 12px; }
</style>
</head>
<body>
<svg id="graph" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMin meet"></svg>
<p id="stale" hidden></p>
<script nonce="${options.nonce}" src="${options.scriptUri}"></script>
</body>
</html>`
}
