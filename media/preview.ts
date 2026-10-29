/** webview 侧的渲染脚本：只负责把面板送来的数据画成 SVG，并把点击与高亮回报给面板。 */

import type { PreviewPayload } from '../src/panel/payload.ts'

declare function acquireVsCodeApi(): { postMessage(message: unknown): void }

const vscode = acquireVsCodeApi()
const namespace = 'http://www.w3.org/2000/svg'

let current: PreviewPayload | null = null
let highlighted: string | null = null
let contractLines = 0
const expanded = new Set<string>()

const graph = document.getElementById('graph') as unknown as SVGSVGElement
const stale = document.getElementById('stale') as HTMLElement

function post(message: unknown): void {
  vscode.postMessage(message)
}

function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const created = document.createElementNS(namespace, name)
  for (const [key, value] of Object.entries(attributes)) created.setAttribute(key, String(value))
  return created
}

function render(payload: PreviewPayload): void {
  current = payload
  highlighted = payload.highlight
  stale.hidden = true
  graph.setAttribute('viewBox', `0 0 ${payload.width} ${payload.height}`)
  graph.style.fontFamily = payload.font
  graph.replaceChildren()
  contractLines = 0

  const edges = element('g', { class: 'edges' })
  for (const edge of payload.edges) {
    const group = element('g', { class: 'edge' })
    const line = element('line', { x1: edge.x1, y1: edge.y1, x2: edge.x2, y2: edge.y2 })
    if (edge.stroke !== undefined) line.setAttribute('stroke', edge.stroke)
    const label = element('text', { x: edge.labelX, y: edge.labelY - 4 })
    label.textContent = edge.artifact
    group.append(line, label)
    edges.append(group)
  }
  graph.append(edges)

  for (const node of payload.nodes) {
    const group = element('g', { class: node.name === highlighted ? 'node highlight' : 'node', 'data-name': node.name })
    const rect = element('rect', { x: node.x, y: node.y, width: node.width, height: node.height, rx: 6 })
    if (node.fill !== undefined) rect.setAttribute('fill', node.fill)
    if (node.stroke !== undefined) rect.setAttribute('stroke', node.stroke)

    const name = element('text', { x: node.x + node.width / 2, y: node.y + node.height / 2 - 8, 'text-anchor': 'middle' })
    name.textContent = node.name
    const kind = element('text', {
      class: 'kind',
      x: node.x + node.width / 2,
      y: node.y + node.height / 2 + 10,
      'text-anchor': 'middle',
    })
    kind.textContent = node.kind

    const chevron = element('text', { class: 'chevron', x: node.x + node.width - 12, y: node.y + 14, 'text-anchor': 'middle' })
    chevron.textContent = expanded.has(node.name) ? '▾' : '▸'
    chevron.addEventListener('click', (event) => {
      event.stopPropagation()
      expandNode(node.name)
    })

    group.append(rect, name, kind, chevron)
    group.addEventListener('click', () => post({ type: 'reveal', payload: { name: node.name } }))
    graph.append(group)

    if (expanded.has(node.name)) graph.append(contractPanel(node))
  }

  postState()
}

function contractPanel(node: PreviewPayload['nodes'][number]): SVGGElement {
  const lines = [...node.path.map((entry) => `path  ${entry}`), ...node.destination]
  const group = element('g', { class: 'contract', 'data-name': node.name })
  group.append(element('rect', { x: node.x, y: node.y + node.height + 3, width: node.width, height: lines.length * 14 + 12, rx: 4 }))
  lines.forEach((line, index) => {
    const text = element('text', { x: node.x + 8, y: node.y + node.height + 18 + index * 14 })
    text.textContent = line.length > 22 ? `${line.slice(0, 22)}…` : line
    group.append(text)
    contractLines += 1
  })
  return group
}

function expandNode(name: string): void {
  expanded.add(name)
  if (current !== null) render(current)
}

function applyHighlight(name: string | null): void {
  highlighted = name
  for (const group of graph.querySelectorAll('g.node')) {
    group.classList.toggle('highlight', group.getAttribute('data-name') === name)
  }
  postState()
}

function postState(): void {
  post({
    type: 'state',
    payload: {
      nodes: current?.nodes.length ?? 0,
      edges: current?.edges.length ?? 0,
      names: current?.nodes.map((node) => node.name) ?? [],
      highlight: highlighted,
      viewBox: graph.getAttribute('viewBox') ?? '',
      contractLines,
      expanded: [...expanded],
    },
  })
}

function showStale(messages: string[]): void {
  stale.hidden = false
  stale.textContent = `文法或结构有问题，先前的图保留：${messages.join('；')}`
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as { type: string; payload?: unknown }
  switch (message.type) {
    case 'render':
      render(message.payload as PreviewPayload)
      break
    case 'highlight':
      applyHighlight((message.payload as { name: string | null }).name)
      break
    case 'stale':
      showStale((message.payload as { messages: string[] }).messages)
      break
    case 'click':
      post({ type: 'reveal', payload: { name: (message.payload as { name: string }).name } })
      break
    case 'expand':
      expandNode((message.payload as { name: string }).name)
      break
    default:
      break
  }
})

post({ type: 'ready' })
