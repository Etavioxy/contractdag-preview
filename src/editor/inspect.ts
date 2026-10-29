/** 三样观测的合成：着色段数、可折叠区间数、光标处的补全候选。 */

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
  return {
    tokens: collectTokens(source).length,
    folds: collectFoldingRanges(source).length,
    completions: completeAt(source, line, character).map((suggestion) => suggestion.label),
    line,
    character,
  }
}
