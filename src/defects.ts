/** 五条结构判定：模型已产出之后才判得出来的问题。 */

import type { ContractModel, DependencyEdge, Diagnostic } from './model.ts'

export function inspect(model: ContractModel): Diagnostic[] {
  const diagnostics = [
    ...unknownNodes(model),
    ...duplicateArtifacts(model),
    ...danglingNodes(model),
    ...missingPaths(model),
    ...cycles(model),
  ]
  return diagnostics.sort((left, right) => left.range.startLine - right.range.startLine)
}

function unknownNodes(model: ContractModel): Diagnostic[] {
  const names = new Set(model.nodes.map((node) => node.name))
  const diagnostics: Diagnostic[] = []
  for (const link of model.links) {
    const missing = [link.from, link.to].filter((name) => !names.has(name))
    if (missing.length === 0) continue
    diagnostics.push({
      layer: 'structural',
      code: 'unknown-node',
      message: `连线引用了未声明的节点：${missing.join('、')}`,
      range: link.range,
    })
  }
  return diagnostics
}

function duplicateArtifacts(model: ContractModel): Diagnostic[] {
  const firstSeen = new Map<string, DependencyEdge>()
  const diagnostics: Diagnostic[] = []
  for (const link of model.links) {
    for (const artifact of link.artifacts) {
      const first = firstSeen.get(artifact)
      if (first === undefined) {
        firstSeen.set(artifact, link)
        continue
      }
      diagnostics.push({
        layer: 'structural',
        code: 'duplicate-artifact',
        message: `产物名重复：${artifact} 已挂在 ${first.from} -> ${first.to} 上`,
        range: link.range,
      })
    }
  }
  return diagnostics
}

function danglingNodes(model: ContractModel): Diagnostic[] {
  const outbound = new Set(model.links.map((link) => link.from))
  const diagnostics: Diagnostic[] = []

  const extraRoot = model.nodes.filter((node) => node.kind === 'root')[1]
  if (extraRoot !== undefined) {
    const rootCount = model.nodes.filter((node) => node.kind === 'root').length
    diagnostics.push({
      layer: 'structural',
      code: 'dangling-node',
      message: `图里只能有一个根节点，这里有 ${rootCount} 个`,
      range: extraRoot.range,
    })
  }

  for (const node of model.nodes) {
    if (node.kind === 'root' || outbound.has(node.name)) continue
    diagnostics.push({
      layer: 'structural',
      code: 'dangling-node',
      message: `非根节点没有出边，产物交不出去：${node.name}`,
      range: node.range,
    })
  }
  return diagnostics
}

function missingPaths(model: ContractModel): Diagnostic[] {
  return model.nodes
    .filter((node) => node.kind === 'change' && node.path.length === 0)
    .map((node) => ({
      layer: 'structural' as const,
      code: 'missing-path',
      message: `变更节点没写 path：${node.name}`,
      range: node.range,
    }))
}

function cycles(model: ContractModel): Diagnostic[] {
  const outbound = new Map<string, string[]>()
  for (const link of model.links) {
    const targets = outbound.get(link.from)
    if (targets === undefined) outbound.set(link.from, [link.to])
    else targets.push(link.to)
  }

  const reaches = (start: string, goal: string): boolean => {
    const seen = new Set<string>()
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.pop() as string
      if (current === goal) return true
      if (seen.has(current)) continue
      seen.add(current)
      for (const next of outbound.get(current) ?? []) queue.push(next)
    }
    return false
  }

  return model.links
    .filter((link) => reaches(link.to, link.from))
    .map((link) => ({
      layer: 'structural' as const,
      code: 'cycle',
      message: `依赖边接成环：${link.from} -> ${link.to}`,
      range: link.range,
    }))
}
