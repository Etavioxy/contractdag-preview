/** 库入口：只把文本变成模型与诊断，不碰 VS Code、编辑器状态与文件系统。 */

import type { ContractModel, Diagnostic, StyleSheet } from './model.ts'
import { parse } from './parser.ts'

/** 库调用方拿到的全部东西：模型、样式、两层诊断。 */
export interface ParseResult {
  /** 文法不合法时缺省：连模型都产不出来。 */
  model?: ContractModel
  /** 样式区是呈现参数，不是契约模型的一部分。 */
  style: StyleSheet
  diagnostics: Diagnostic[]
}

/** 与扩展同一个解析实现：同一份文法、同一套诊断。 */
export function parseContract(source: string): ParseResult {
  const { model, style, diagnostics } = parse(source)
  return model === undefined ? { style, diagnostics } : { model, style, diagnostics }
}

export { toDumpJson } from './model.ts'
export type {
  ClassAssignment,
  ContractModel,
  DagNode,
  DependencyEdge,
  Diagnostic,
  DiagnosticLayer,
  LinkStyle,
  SourceRange,
  StyleSheet,
} from './model.ts'
