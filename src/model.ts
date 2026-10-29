/** 契约模型的类型与外部形状。 */

export type NodeKind = 'change' | 'query' | 'root'

export const nodeKinds: readonly NodeKind[] = ['change', 'query', 'root']

/** 文本里的一个位置区间，行与列都从 0 起，与 VSCode 的 Range 同一口径。 */
export interface SourceRange {
  startLine: number
  startCharacter: number
  endLine: number
  endCharacter: number
}

export interface DagNode {
  name: string
  kind: NodeKind
  path: string[]
  destination: string[]
  range: SourceRange
  keyRanges: Record<string, SourceRange>
}

export interface DependencyEdge {
  from: string
  to: string
  /** 连线区的自由键值，`artifact` 必在其中。 */
  properties: Record<string, string>
  range: SourceRange
  keyRanges: Record<string, SourceRange>
}

export interface ContractModel {
  nodes: DagNode[]
  links: DependencyEdge[]
}

export interface ClassAssignment {
  node: string
  classes: string[]
  range: SourceRange
}

export interface LinkStyle {
  from: string
  to: string
  properties: Record<string, string>
  range: SourceRange
}

/** 样式区不是契约模型的一部分，只是呈现参数。 */
export interface StyleSheet {
  direction: 'TB' | 'BT' | 'LR' | 'RL'
  gap: number
  font?: string
  classDefs: Record<string, Record<string, string>>
  classes: ClassAssignment[]
  linkStyles: LinkStyle[]
}

export type DiagnosticLayer = 'syntax' | 'structural'

export interface Diagnostic {
  layer: DiagnosticLayer
  code: string
  message: string
  range: SourceRange
}

export interface Analysis {
  /** 文法不合法时没有模型：连模型都产不出来。 */
  model?: ContractModel
  style: StyleSheet
  diagnostics: Diagnostic[]
}

export function createStyleSheet(): StyleSheet {
  return { direction: 'TB', gap: 20, classDefs: {}, classes: [], linkStyles: [] }
}

export interface DumpNode {
  name: string
  kind: NodeKind
  path: string[]
  destination: string[]
}

export interface DumpJson {
  nodes: DumpNode[]
  links: Array<Record<string, string>>
  diagnostics: Diagnostic[]
}

/** 对外的模型形状：只留契约本身，行号与样式都不进来。 */
export function toDumpJson(model: ContractModel, diagnostics: Diagnostic[]): DumpJson {
  return {
    nodes: model.nodes.map((node) => ({
      name: node.name,
      kind: node.kind,
      path: node.path,
      destination: node.destination,
    })),
    links: model.links.map((link) => ({ from: link.from, to: link.to, ...link.properties })),
    diagnostics,
  }
}
