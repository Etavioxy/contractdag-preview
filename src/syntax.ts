/** 行级词法：把一行文本认成区标签、表头、键值行或样式命令，不持有状态。 */

import { nodeKinds, type NodeKind, type SourceRange, type StyleSheet } from './model.ts'

export type Parsed<T> = { ok: true; value: T } | { ok: false; code: string; message: string }

export function ok<T>(value: T): Parsed<T> {
  return { ok: true, value }
}

export function bad<T>(code: string, message: string): Parsed<T> {
  return { ok: false, code, message }
}

export function lineRange(line: number, length: number): SourceRange {
  return { startLine: line, startCharacter: 0, endLine: line, endCharacter: length }
}

export function isIgnorable(text: string): boolean {
  const trimmed = text.trim()
  return trimmed === '' || trimmed.startsWith('#')
}

export function regionOpen(text: string): string | undefined {
  return /^<([^<>/]+)>$/.exec(text.trim())?.[1]
}

export function regionClose(text: string): string | undefined {
  return /^<\/([^<>/]+)>$/.exec(text.trim())?.[1]
}

export interface NodeHead {
  name: string
  kind: NodeKind
}

export function parseNodeHead(text: string): Parsed<NodeHead> {
  const trimmed = text.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']') || trimmed.startsWith('[[')) {
    return bad('bad-node-head', '节点头要写成 [名字] 或 [名字:种类]')
  }
  const inner = trimmed.slice(1, -1)
  const colon = inner.lastIndexOf(':')
  const name = (colon === -1 ? inner : inner.slice(0, colon)).trim()
  const kindText = colon === -1 ? '' : inner.slice(colon + 1).trim()
  if (name === '') return bad('empty-name', '节点没有名字')
  if (kindText !== '' && !nodeKinds.includes(kindText as NodeKind)) {
    return bad('bad-kind', `种类只有 ${nodeKinds.join(' / ')}，写成了 ${kindText}`)
  }
  return ok({ name, kind: (kindText === '' ? 'change' : kindText) as NodeKind })
}

export interface LinkHead {
  from: string
  to: string
}

export function parseLinkHead(text: string): Parsed<LinkHead> {
  const trimmed = text.trim()
  if (!trimmed.startsWith('[[') || !trimmed.endsWith(']]')) {
    return bad('bad-link-head', '连线表头要写成 [[源 -> 目的]]')
  }
  const inner = trimmed.slice(2, -2)
  const parts = inner.split('->')
  if (parts.length !== 2) return bad('bad-link-head', '连线表头要有且只有一个 ->')
  const from = parts[0]?.trim() ?? ''
  const to = parts[1]?.trim() ?? ''
  if (from === '' || to === '') return bad('bad-link-head', '连线两端都要有节点名')
  return ok({ from, to })
}

export interface KeyValue {
  key: string
  value: string
}

const keyPattern = /^[A-Za-z][A-Za-z0-9_-]*$/

/** 键值行：够不够像，只看有没有半角等号且不以表头的方括号起头。 */
export function looksLikeKeyValue(text: string): boolean {
  const trimmed = text.trim()
  return !trimmed.startsWith('[') && trimmed.includes('=')
}

export function parseKeyValue(text: string): Parsed<KeyValue> {
  const trimmed = text.trim()
  const equals = trimmed.indexOf('=')
  if (equals <= 0) return bad('bad-key-value', '键值行要写成 键 = 值')
  const key = trimmed.slice(0, equals).trim()
  const value = trimmed.slice(equals + 1).trim()
  if (!keyPattern.test(key)) return bad('bad-key', `键名要用英文字母、数字、下划线或连字符：${key}`)
  if (value === '') return bad('missing-value', `键 ${key} 没写值`)
  return ok({ key, value })
}

export type StyleCommand =
  | { kind: 'direction'; value: string }
  | { kind: 'gap'; value: string }
  | { kind: 'font'; value: string }
  | { kind: 'classDef'; name: string; properties: Record<string, string> }
  | { kind: 'class'; node: string; classes: string[] }
  | { kind: 'linkStyle'; from: string; to: string; properties: Record<string, string> }

const propertyText = /^[A-Za-z][A-Za-z0-9-]*:[^,]*(,[A-Za-z][A-Za-z0-9-]*:[^,]*)*$/

function parseProperties(text: string): Parsed<Record<string, string>> {
  if (!propertyText.test(text)) return bad('bad-style-value', `属性要写成 名:值，多项用逗号分开：${text}`)
  const properties: Record<string, string> = {}
  for (const item of text.split(',')) {
    const colon = item.indexOf(':')
    properties[item.slice(0, colon).trim()] = item.slice(colon + 1).trim()
  }
  return ok(properties)
}

function splitEndpoints(text: string): Parsed<LinkHead> {
  const parts = text.split('->')
  if (parts.length !== 2) return bad('bad-style-value', '端点要写成 源 -> 目的')
  const from = parts[0]?.trim() ?? ''
  const to = parts[1]?.trim() ?? ''
  if (from === '' || to === '') return bad('bad-style-value', '端点两端都要有节点名')
  return ok({ from, to })
}

export function parseStyleCommand(text: string): Parsed<StyleCommand> {
  const trimmed = text.trim()
  const space = trimmed.search(/\s/)
  if (space === -1) return bad('bad-style-line', '样式行要写成 关键字 参数')
  const keyword = trimmed.slice(0, space)
  const rest = trimmed.slice(space).trim()

  switch (keyword) {
    case 'direction':
      return ok({ kind: 'direction', value: rest })
    case 'gap':
      return ok({ kind: 'gap', value: rest })
    case 'font':
      return ok({ kind: 'font', value: rest })
    case 'classDef': {
      const parts = rest.split(/\s+/)
      const name = parts[0] ?? ''
      const properties = parseProperties(parts.slice(1).join(' '))
      if (name === '') return bad('bad-style-line', 'classDef 要写成 classDef 类名 名:值')
      if (!properties.ok) return properties
      return ok({ kind: 'classDef', name, properties: properties.value })
    }
    case 'class': {
      // 节点名可以含空格，类名取最后一个词。
      const cut = rest.lastIndexOf(' ')
      if (cut <= 0) return bad('bad-style-line', 'class 要写成 class 节点名 类名')
      return ok({ kind: 'class', node: rest.slice(0, cut).trim(), classes: [rest.slice(cut + 1).trim()] })
    }
    case 'linkStyle': {
      const cut = rest.lastIndexOf(' ')
      if (cut <= 0) return bad('bad-style-line', 'linkStyle 要写成 linkStyle 源 -> 目的 名:值')
      const endpoints = splitEndpoints(rest.slice(0, cut))
      const properties = parseProperties(rest.slice(cut + 1).trim())
      if (!endpoints.ok) return endpoints
      if (!properties.ok) return properties
      return ok({ kind: 'linkStyle', from: endpoints.value.from, to: endpoints.value.to, properties: properties.value })
    }
    default:
      return bad('unknown-style-key', `样式区不认这个关键字：${keyword}`)
  }
}
