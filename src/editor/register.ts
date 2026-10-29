/** 把三个纯函数挂成 provider；provider 只做类型搬运。 */

import * as vscode from 'vscode'
import { completeAt } from './completion.ts'
import { collectFoldingRanges } from './folding.ts'
import { collectTokens, tokenTypes } from './tokens.ts'

export const languageId = 'contract-dag'

const selector: vscode.DocumentSelector = { language: languageId }
const legend = new vscode.SemanticTokensLegend([...tokenTypes], ['declaration'])

export function registerEditorSupport(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      selector,
      {
        provideDocumentSemanticTokens(document) {
          const builder = new vscode.SemanticTokensBuilder(legend)
          for (const span of collectTokens(document.getText())) {
            builder.push(
              span.line,
              span.start,
              span.length,
              tokenTypes.indexOf(span.type),
              span.declaration === true ? 1 : 0,
            )
          }
          return builder.build()
        },
      },
      legend,
    ),
    vscode.languages.registerFoldingRangeProvider(selector, {
      provideFoldingRanges(document) {
        return collectFoldingRanges(document.getText()).map((range) => new vscode.FoldingRange(range.start, range.end))
      },
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(document, position) {
        return completeAt(document.getText(), position.line, position.character).map((suggestion) => {
          const item = new vscode.CompletionItem(suggestion.label, vscode.CompletionItemKind.Keyword)
          item.detail = suggestion.detail
          item.insertText = suggestion.insertText
          return item
        })
      },
    }),
  )
}
