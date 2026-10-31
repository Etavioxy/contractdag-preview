/** HUD 与缺陷清单：一行状态条，一份结构缺陷抽屉。 */

import type { Diagnostic } from '../../src/model.ts'

export interface Hud {
  set(text: string): void
}

export function createHud(element: HTMLElement): Hud {
  return {
    set(text) {
      if (element.textContent !== text) element.textContent = text
    },
  }
}

export interface DefectList {
  /** 有缺陷才露出来；空列表就收起，不占画面。 */
  set(diagnostics: Diagnostic[]): void
}

export function createDefectList(element: HTMLElement): DefectList {
  let rendered = ''

  return {
    set(diagnostics) {
      const key = JSON.stringify(diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message]))
      if (key === rendered) return
      rendered = key

      if (diagnostics.length === 0) {
        element.hidden = true
        element.replaceChildren()
        return
      }

      element.hidden = false
      element.replaceChildren(
        ...diagnostics.map((diagnostic) => {
          const row = document.createElement('div')
          row.className = 'defect-row'
          row.dataset['code'] = diagnostic.code
          row.textContent = `${diagnostic.range.startLine + 1}: ${diagnostic.message}`
          return row
        }),
      )
    },
  }
}
