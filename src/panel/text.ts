/** 文本度量：宿主拿不到字体度量，一律按列宽估。 */

/** 半角列折算成字号的比例：约一个半角的平均字宽。 */
export const halfWidthEm = 0.55
/** 估宽留的余量：估窄会叠字，估宽只是多占位。 */
export const widthSafety = 1.1
/** 全角与 CJK 记两列，其余记一列。 */
export function isWideChar(char: string): boolean {
  return /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(char)
}

/** 宿主拿不到字体度量，只能按列估：半角记 0.55 个字号，再留一成余量。 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let columns = 0
  for (const char of text) columns += isWideChar(char) ? 2 : 1
  return columns * fontSize * halfWidthEm * widthSafety
}
