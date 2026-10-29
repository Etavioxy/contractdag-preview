/** 语义着色：从逐行扫描算出每一段的类型，供 provider 直接打包。 */

import { parseKeyValue, parseLinkHead, parseNodeHead } from '../syntax.ts'
import { scanLines, type ScannedLine } from './scan.ts'

export const tokenTypes = ['keyword', 'class', 'property', 'string', 'comment', 'enumMember', 'operator'] as const

export type TokenType = (typeof tokenTypes)[number]

export interface TokenSpan {
  line: number
  start: number
  length: number
  type: TokenType
  declaration?: boolean
}

function span(line: ScannedLine, start: number, length: number, type: TokenType, declaration = false): TokenSpan | undefined {
  if (length <= 0 || start < 0) return undefined
  return declaration ? { line: line.index, start, length, type, declaration } : { line: line.index, start, length, type }
}

function at(line: ScannedLine, needle: string, from = line.indent): number {
  const found = line.text.indexOf(needle, from)
  return found === -1 ? line.indent : found
}

export function collectTokens(source: string): TokenSpan[] {
  const spans: TokenSpan[] = []

  for (const line of scanLines(source)) {
    switch (line.role) {
      case 'region-open':
      case 'region-close':
        push(spans, span(line, line.indent, line.trimmed.length, 'keyword'))
        break
      case 'comment':
        push(spans, span(line, line.indent, line.trimmed.length, 'comment'))
        break
      case 'node-head':
        addNodeHead(spans, line)
        break
      case 'link-head':
        addLinkHead(spans, line)
        break
      case 'key-value':
      case 'value-open':
        addKeyValue(spans, line)
        break
      case 'value-item':
        push(spans, span(line, line.indent, line.trimmed.length, 'string'))
        break
      case 'value-close':
        push(spans, span(line, line.indent, line.trimmed.length, 'operator'))
        break
      case 'style-command':
        addStyleCommand(spans, line)
        break
      default:
        break
    }
  }

  return spans
}

function push(spans: TokenSpan[], candidate: TokenSpan | undefined): void {
  if (candidate !== undefined) spans.push(candidate)
}

function addNodeHead(spans: TokenSpan[], line: ScannedLine): void {
  const head = parseNodeHead(line.trimmed)
  if (!head.ok) return
  const { name, kind } = head.value
  push(spans, span(line, at(line, name), name.length, 'class', true))

  const colon = line.text.lastIndexOf(':')
  const closing = line.text.lastIndexOf(']')
  if (colon <= line.indent || closing < colon) return
  const kindText = line.text.slice(colon + 1, closing)
  if (kindText.trim() !== kind) return
  const leading = kindText.length - kindText.trimStart().length
  push(spans, span(line, colon + 1 + leading, kind.length, 'enumMember'))
}

function addLinkHead(spans: TokenSpan[], line: ScannedLine): void {
  const head = parseLinkHead(line.trimmed)
  if (!head.ok) return
  const { from, to } = head.value
  const fromStart = at(line, from)
  push(spans, span(line, fromStart, from.length, 'class'))
  push(spans, span(line, at(line, to, fromStart + from.length), to.length, 'class'))
}

function addKeyValue(spans: TokenSpan[], line: ScannedLine): void {
  const parsed = parseKeyValue(line.text)
  if (!parsed.ok) return
  const { key, value } = parsed.value
  const keyStart = line.text.indexOf(key, line.indent)
  push(spans, span(line, keyStart, key.length, 'property'))

  const equals = line.text.indexOf('=', keyStart + key.length)
  if (value === '[') {
    push(spans, span(line, equals + 1 + line.text.slice(equals + 1).indexOf('['), 1, 'operator'))
    return
  }
  push(spans, span(line, line.text.indexOf(value, equals + 1), value.length, 'string'))
}

function addStyleCommand(spans: TokenSpan[], line: ScannedLine): void {
  const space = line.trimmed.search(/\s/)
  const keyword = space === -1 ? line.trimmed : line.trimmed.slice(0, space)
  push(spans, span(line, line.indent, keyword.length, 'keyword'))
  if (space === -1) return

  const rest = line.trimmed.slice(space).trim()
  const restStart = line.text.indexOf(rest, line.indent + keyword.length)
  const type: TokenType = keyword === 'direction' ? 'enumMember' : 'string'
  push(spans, span(line, restStart, rest.length, type))
}
