/** 三样观测的合成：着色段数、可折叠区间数、光标处的补全候选。 */

import { parse } from '../parser.ts'
import { completeAt } from './completion.ts'
import { collectFoldingRanges } from './folding.ts'
import { collectTokens } from './tokens.ts'

export interface InspectResult {
  tokens: number
  folds: number
  completions: string[]
  line: number
  character: number
}

export function inspectSource(source: string, line: number, character: number): InspectResult {
  const analysis = parse(source)
  return {
    tokens: collectTokens(analysis).length,
    folds: collectFoldingRanges(analysis).length,
    completions: completeAt(analysis, line, character).map((suggestion) => suggestion.label),
    line,
    character,
  }
}
