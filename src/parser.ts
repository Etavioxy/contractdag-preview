/** 按区两遍：节点表读完再解连线；一处不合文法即停，模型不产出。 */

import { inspect } from './defects.ts'
import {
  createStyleSheet,
  directionAliases,
  directionValues,
  type ContractModel,
  type DagNode,
  type DependencyEdge,
  type Diagnostic,
  type SourceRange,
  type StyleSheet,
} from './model.ts'
import { scanLines, type ScannedLine } from './scan.ts'
import * as syntax from './syntax.ts'

/** 解析器交出的全部东西：模型、样式、诊断，以及逐行角色（编辑器直接消费它）。 */
export interface Analysis {
  /** 文法不合法时没有模型：连模型都产不出来。 */
  model?: ContractModel
  style: StyleSheet
  diagnostics: Diagnostic[]
  lines: ScannedLine[]
}

const knownRegions = ['nodes', 'links', 'style']

class SyntaxFailure extends Error {
  readonly code: string
  readonly range: SourceRange

  constructor(code: string, message: string, range: SourceRange) {
    super(message)
    this.code = code
    this.range = range
  }
}

function fail(code: string, message: string, range: SourceRange): SyntaxFailure {
  return new SyntaxFailure(code, message, range)
}

function lineAt(lines: string[], index: number): string {
  return lines[index] ?? ''
}

function lastLineRange(lines: string[]): SourceRange {
  const index = Math.max(0, lines.length - 1)
  return syntax.lineRange(index, lineAt(lines, index).length)
}

function skipIgnorable(lines: string[], from: number): number {
  let cursor = from
  while (cursor < lines.length && syntax.isIgnorable(lineAt(lines, cursor))) cursor += 1
  return cursor
}

export function parse(source: string): Analysis {
  const style = createStyleSheet()
  const lines = scanLines(source)
  try {
    const model = buildModel(source.replace(/^\uFEFF/, '').split(/\r?\n/), style)
    return { model, style, diagnostics: inspect(model), lines }
  } catch (error) {
    if (error instanceof SyntaxFailure) {
      return {
        style,
        diagnostics: [{ layer: 'syntax', code: error.code, message: error.message, range: error.range }],
        lines,
      }
    }
    throw error
  }
}

function buildModel(lines: string[], style: StyleSheet): ContractModel {
  const nodes: DagNode[] = []
  const links: DependencyEdge[] = []

  let cursor = expectRegion(lines, 0, 'nodes')
  cursor = readNodes(lines, cursor, nodes)
  cursor = expectRegion(lines, cursor, 'links')
  cursor = readLinks(lines, cursor, links)

  cursor = skipIgnorable(lines, cursor)
  if (cursor < lines.length) {
    const open = syntax.regionOpen(lineAt(lines, cursor))
    if (open !== 'style') {
      throw fail(
        'unexpected-text',
        `连线区之后只收可选的 <style> 区，这一行读不懂：${lineAt(lines, cursor).trim()}`,
        syntax.lineRange(cursor, lineAt(lines, cursor).length),
      )
    }
    cursor = readStyle(lines, cursor, style)
    cursor = skipIgnorable(lines, cursor)
  }

  if (cursor < lines.length) {
    throw fail(
      'unexpected-text',
      `样式区之后不能再有内容：${lineAt(lines, cursor).trim()}`,
      syntax.lineRange(cursor, lineAt(lines, cursor).length),
    )
  }

  return { nodes, links }
}

function expectRegion(lines: string[], from: number, expected: 'nodes' | 'links'): number {
  const cursor = skipIgnorable(lines, from)
  if (cursor >= lines.length) {
    throw fail('missing-region', `缺少 <${expected}> 区`, lastLineRange(lines))
  }
  const text = lineAt(lines, cursor)
  const range = syntax.lineRange(cursor, text.length)
  const open = syntax.regionOpen(text)
  if (open === expected) return cursor + 1
  if (open === undefined) {
    throw fail('unknown-region', `这里应该是 <${expected}>，读到的不是区标签：${text.trim()}`, range)
  }
  if (knownRegions.includes(open)) {
    throw fail('region-order', `区的顺序是 nodes、links、style，这里应该是 <${expected}>，写成了 <${open}>`, range)
  }
  throw fail('unknown-region', `区名写错了：<${open}>，这里应该是 <${expected}>`, range)
}

interface Entry {
  key: string
  values: string[]
  keyRange: SourceRange
}

function readNodes(lines: string[], from: number, out: DagNode[]): number {
  let cursor = from
  for (;;) {
    cursor = skipIgnorable(lines, cursor)
    if (cursor >= lines.length) throw fail('unterminated-region', '节点区没收尾，缺 </nodes>', lastLineRange(lines))
    const text = lineAt(lines, cursor)
    const range = syntax.lineRange(cursor, text.length)
    const close = syntax.regionClose(text)
    if (close === 'nodes') return cursor + 1
    if (close !== undefined) throw fail('region-order', `节点区里出现了 </${close}>`, range)

    const head = syntax.parseNodeHead(text)
    if (!head.ok) {
      if (!text.trim().startsWith('[')) {
        throw fail('unexpected-text', `节点区只收 [名字:种类] 表头与键值行：${text.trim()}`, range)
      }
      throw fail(head.code, head.message, range)
    }

    const body = readEntries(lines, cursor + 1, { allowBlockValues: true })
    out.push(buildNode(head.value, range, body.entries))
    cursor = body.next
  }
}

function readLinks(lines: string[], from: number, out: DependencyEdge[]): number {
  let cursor = from
  for (;;) {
    cursor = skipIgnorable(lines, cursor)
    if (cursor >= lines.length) throw fail('unterminated-region', '连线区没收尾，缺 </links>', lastLineRange(lines))
    const text = lineAt(lines, cursor)
    const range = syntax.lineRange(cursor, text.length)
    const close = syntax.regionClose(text)
    if (close === 'links') return cursor + 1
    if (close !== undefined) throw fail('region-order', `连线区里出现了 </${close}>`, range)

    const head = syntax.parseLinkHead(text)
    if (!head.ok) {
      if (!text.trim().startsWith('[[')) {
        throw fail('unexpected-text', `连线区只收 [[源 -> 目的]] 表头与键值行：${text.trim()}`, range)
      }
      throw fail(head.code, head.message, range)
    }

    const body = readEntries(lines, cursor + 1, { allowBlockValues: true })
    out.push(buildLink(head.value, range, body.entries))
    cursor = body.next
  }
}

function readEntries(
  lines: string[],
  from: number,
  options: { allowBlockValues: boolean },
): { entries: Entry[]; next: number } {
  const entries: Entry[] = []
  const seen = new Set<string>()
  let cursor = from

  for (;;) {
    const probe = skipIgnorable(lines, cursor)
    if (probe >= lines.length) return { entries, next: probe }
    const text = lineAt(lines, probe)
    if (!syntax.looksLikeKeyValue(text)) return { entries, next: probe }

    const keyRange = syntax.lineRange(probe, text.length)
    const parsed = syntax.parseKeyValue(text)
    if (!parsed.ok) throw fail(parsed.code, parsed.message, keyRange)
    if (seen.has(parsed.value.key)) {
      throw fail('duplicate-key', `同一个块里重复写了 ${parsed.value.key}`, keyRange)
    }
    seen.add(parsed.value.key)

    const value = readValue(lines, probe, parsed.value.value, options.allowBlockValues, keyRange)
    entries.push({ key: parsed.value.key, values: value.values, keyRange })
    cursor = value.next
  }
}

function readValue(
  lines: string[],
  line: number,
  raw: string,
  allowBlockValues: boolean,
  keyRange: SourceRange,
): { values: string[]; next: number } {
  if (raw !== '[') return { values: [raw], next: line + 1 }
  if (!allowBlockValues) throw fail('bad-value', '连线区只收单行值', keyRange)

  const values: string[] = []
  for (let cursor = line + 1; cursor < lines.length; cursor += 1) {
    const text = lineAt(lines, cursor)
    if (text.trim() === ']') return { values, next: cursor + 1 }
    if (syntax.regionClose(text) !== undefined) break
    if (!syntax.isIgnorable(text)) values.push(text.trim())
  }
  throw fail('unterminated-value', '多行值没收尾，缺 ]', keyRange)
}

function buildNode(head: syntax.NodeHead, range: SourceRange, entries: Entry[]): DagNode {
  const keyRanges: Record<string, SourceRange> = {}
  const path: string[] = []
  const destination: string[] = []

  for (const entry of entries) {
    if (entry.key === 'path') path.push(...entry.values)
    else if (entry.key === 'destination') destination.push(...entry.values)
    else throw fail('unknown-key', `节点区只收 path 与 destination，不认 ${entry.key}`, entry.keyRange)
    keyRanges[entry.key] = entry.keyRange
  }
  if (keyRanges['destination'] === undefined) {
    throw fail('missing-destination', `节点 ${head.name} 没写 destination`, range)
  }

  return { name: head.name, kind: head.kind, path, destination, range, keyRanges }
}

function buildLink(head: syntax.LinkHead, range: SourceRange, entries: Entry[]): DependencyEdge {
  const artifacts: string[] = []
  const properties: Record<string, string> = {}
  const keyRanges: Record<string, SourceRange> = {}

  for (const entry of entries) {
    if (entry.key === 'from' || entry.key === 'to') {
      throw fail('reserved-key', `连线区不认 ${entry.key}：端点已经写在表头里`, entry.keyRange)
    }
    if (entry.key === 'artifact') {
      artifacts.push(...entry.values.filter((value) => value !== ''))
      keyRanges[entry.key] = entry.keyRange
      continue
    }
    // 只有 artifact 可以写成多行：其余键机器忽略，多行没有意义。
    if (entry.values.length > 1) {
      throw fail('bad-value', `只有 artifact 可以写多行，${entry.key} 只能单行`, entry.keyRange)
    }
    properties[entry.key] = entry.values[0] ?? ''
    keyRanges[entry.key] = entry.keyRange
  }
  if (artifacts.length === 0) {
    throw fail('missing-artifact', `连线 ${head.from} -> ${head.to} 没写 artifact`, range)
  }

  return { from: head.from, to: head.to, artifacts, properties, range, keyRanges }
}

function readStyle(lines: string[], from: number, style: StyleSheet): number {
  let cursor = from + 1
  for (;;) {
    cursor = skipIgnorable(lines, cursor)
    if (cursor >= lines.length) throw fail('unterminated-region', '样式区没收尾，缺 </style>', lastLineRange(lines))
    const text = lineAt(lines, cursor)
    const range = syntax.lineRange(cursor, text.length)
    const close = syntax.regionClose(text)
    if (close === 'style') return cursor + 1
    if (close !== undefined) throw fail('region-order', `样式区里出现了 </${close}>`, range)

    const command = syntax.parseStyleCommand(text)
    if (!command.ok) throw fail(command.code, command.message, range)
    applyStyleCommand(style, command.value, range)
    cursor += 1
  }
}

function applyStyleCommand(style: StyleSheet, command: syntax.StyleCommand, range: SourceRange): void {
  switch (command.kind) {
    case 'direction': {
      const written = command.value.toUpperCase()
      const value = (directionAliases[written] ?? written) as StyleSheet['direction']
      if (!directionValues.includes(value)) {
        throw fail(
          'bad-style-value',
          `direction 只有 ${directionValues.join(' / ')}（TD 同 TB），写成了 ${command.value}`,
          range,
        )
      }
      style.direction = value
      return
    }
    case 'gap': {
      if (!/^\d+$/.test(command.value)) {
        throw fail('bad-style-value', `gap 要写一个非负整数，写成了 ${command.value}`, range)
      }
      style.gap = Number(command.value)
      return
    }
    case 'font':
      style.font = command.value
      return
    case 'classDef':
      style.classDefs[command.name] = command.properties
      return
    case 'class':
      style.classes.push({ node: command.node, classes: command.classes, range })
      return
    case 'linkStyle':
      style.linkStyles.push({ from: command.from, to: command.to, properties: command.properties, range })
  }
}
