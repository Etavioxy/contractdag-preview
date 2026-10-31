import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildPreviewHtml } from '../../src/panel/html.ts'
import { buildPreviewPayload } from '../../src/panel/payload.ts'
import { parse } from '../../src/parser.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const deploy = parse(readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8'))

test('面板数据：四个框落在样板的坐标上，三条边的两端贴在框边', () => {
  const payload = buildPreviewPayload(deploy)
  assert.ok(payload)

  assert.deepEqual(
    payload.nodes.map((node) => [node.name, node.x, node.y, node.width, node.height, node.line]),
    [
      ['源码构建节点', 80, 24, 160, 56, 2],
      ['上线安装节点', 80, 128, 160, 56, 9],
      ['站点巡检节点', 80, 232, 160, 56, 19],
      ['流水线收尾', 80, 336, 160, 56, 26],
    ],
  )
  assert.deepEqual(
    payload.edges.map((edge) => [edge.artifacts.join(' '), edge.x1, edge.y1, edge.x2, edge.y2]),
    [
      ['build.tar', 160, 80, 160, 121],
      ['env-ready', 160, 184, 160, 225],
      ['verify-report', 160, 288, 160, 329],
    ],
  )
  // 单产物落在弧线中点上方 6px
  assert.deepEqual(
    payload.edges.map((edge) => edge.labels.map((label) => [label.text, Math.round(label.x), Math.round(label.y)])),
    [
      [['build.tar', 160, 98]],
      [['env-ready', 160, 202]],
      [['verify-report', 160, 306]],
    ],
  )
  assert.equal(payload.width, 320)
  assert.equal(payload.height, 472)
  assert.equal(payload.highlight, null)
})

test('面板数据：一条边带多个产物时标签沿弧线散开，不叠在一起', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'path = /a',
    'destination = 做完。',
    '',
    '[乙:root]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = [',
    '  build.tar',
    '  build.log',
    '  build.map',
    ']',
    '</links>',
  ].join('\n')

  const payload = buildPreviewPayload(parse(source))
  assert.ok(payload)

  const edge = payload.edges[0]
  assert.ok(edge)
  assert.deepEqual(edge.artifacts, ['build.tar', 'build.log', 'build.map'])
  assert.deepEqual(edge.labels.map((label) => label.text), ['build.tar', 'build.log', 'build.map'])

  // 三个标签的 y 依次递增，间距够放下一行 11px 的字
  const ys = edge.labels.map((label) => label.y)
  assert.ok(ys[1]! > ys[0]! && ys[2]! > ys[1]!, '标签应沿弧线排开')
  assert.ok(ys[1]! - ys[0]! >= 11)
})

test('面板数据：重复的产物名按条数报缺陷，列表里的也算', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'path = /a',
    'destination = 做完。',
    '',
    '[乙:root]',
    'destination = 收尾。',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = [',
    '  same-name',
    '  same-name',
    ']',
    '</links>',
  ].join('\n')

  const analysis = parse(source)
  assert.deepEqual(
    analysis.diagnostics.map((diagnostic) => diagnostic.code),
    ['duplicate-artifact'],
  )
})

test('面板数据：契约正文随节点带过去', () => {
  const payload = buildPreviewPayload(deploy)
  assert.ok(payload)

  assert.deepEqual(payload.nodes[0]?.path, ['/srv/app/build'])
  assert.deepEqual(payload.nodes[0]?.destination, ['构建包 `build.tar` 已产出，校验和已记录。', '只写 path 里的位置。'])
  assert.deepEqual(payload.nodes[3]?.path, [])
})

test('面板数据：高亮的名字随参数带过去', () => {
  assert.equal(buildPreviewPayload(deploy, '站点巡检节点')?.highlight, '站点巡检节点')
})

test('面板数据：展开的节点撑高自己与后续层，正文全部落在框内', () => {
  const payload = buildPreviewPayload(deploy, null, new Set(['上线安装节点']))
  assert.ok(payload)

  const [first, second, third, fourth] = payload.nodes
  assert.equal(first?.y, 24)
  assert.equal(second?.expanded, true)
  assert.ok(second!.height > 56)

  // 层距仍按样式区的 gap（默认 48），只是从上一次的下边界开始算。
  assert.equal(third?.y, second!.y + second!.height + 48)
  assert.equal(fourth?.y, third!.y + third!.height + 48)

  // 分隔线在头部下沿，正文最后一行仍在框内。
  assert.ok(second!.dividerY > second!.y + 56)
  assert.ok(second!.contentTop > second!.dividerY)
  assert.ok(second!.contentTop + (second!.lines.length - 1) * payload.lineStep < second!.y + second!.height)
  assert.equal(payload.height, fourth!.y + fourth!.height + 80)
})

test('面板数据：展开正文按框宽折行，每行不超过可用列数', () => {
  const payload = buildPreviewPayload(deploy, null, new Set(['站点巡检节点']))
  assert.ok(payload)

  const node = payload.nodes.find((entry) => entry.name === '站点巡检节点')
  assert.ok(node)
  assert.ok(node.lines.length >= 3)
  for (const line of node.lines) {
    const columns = [...line].reduce(
      (width, char) => width + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(char) ? 2 : 1),
      0,
    )
    assert.ok(columns <= 26, `${line} 有 ${columns} 列`)
  }
})

test('面板数据：边从展开节点的实际下沿出发', () => {
  const payload = buildPreviewPayload(deploy, null, new Set(['上线安装节点']))
  assert.ok(payload)

  const node = payload.nodes.find((entry) => entry.name === '上线安装节点')
  const edge = payload.edges.find((entry) => entry.from === '上线安装节点')
  assert.ok(node)
  assert.ok(edge)
  assert.equal(edge.y1, node.y + node.height)
})

test('面板数据：斜边的箭头尖端贴框边，朝向与连线一致', () => {
  const fork = parse(readFileSync(join(fixtures, 'fork.contractdag'), 'utf8'))
  const payload = buildPreviewPayload(fork)
  assert.ok(payload)

  const edge = payload.edges.find((entry) => entry.from === '甲' && entry.to === '乙')
  const target = payload.nodes.find((node) => node.name === '乙')
  assert.ok(edge)
  assert.ok(target)

  // 尖端贴在目标框的上沿中点
  assert.equal(edge.arrow.tipX, target.x + target.width / 2)
  assert.equal(edge.arrow.tipY, target.y)
  // 线尾就是箭头底边中心，两者相距正好是箭头占位
  assert.equal(edge.x2, edge.arrow.baseX)
  assert.equal(edge.y2, edge.arrow.baseY)
  assert.ok(Math.abs(Math.hypot(edge.arrow.tipX - edge.arrow.baseX, edge.arrow.tipY - edge.arrow.baseY) - 7) < 1e-6)

  // 连线是斜的：两框不在同一列，这正是轴对齐画法会错位的场景
  assert.ok(Math.abs(edge.arrow.tipX - edge.x1) > 1)
  // 两翼关于「底边中心 → 尖端」对称，各自离底边中心半个宽度
  assert.ok(Math.abs((edge.arrow.leftX + edge.arrow.rightX) / 2 - edge.arrow.baseX) < 1e-6)
  assert.ok(Math.abs((edge.arrow.leftY + edge.arrow.rightY) / 2 - edge.arrow.baseY) < 1e-6)
  assert.ok(Math.abs(Math.hypot(edge.arrow.leftX - edge.arrow.baseX, edge.arrow.leftY - edge.arrow.baseY) - 4) < 1e-6)
  assert.ok(Math.abs(Math.hypot(edge.arrow.rightX - edge.arrow.baseX, edge.arrow.rightY - edge.arrow.baseY) - 4) < 1e-6)
})

test('面板数据：竖直边的箭头仍沿轴，几何与轴对齐时一致', () => {
  const payload = buildPreviewPayload(deploy)
  assert.ok(payload)

  const edge = payload.edges[0]
  assert.ok(edge)
  assert.equal(edge.arrow.tipX, 160)
  assert.equal(edge.arrow.tipY, 128)
  assert.equal(edge.arrow.baseX, 160)
  assert.equal(edge.arrow.baseY, 121)
  assert.ok(Math.abs(edge.arrow.leftX - 156) < 1e-6)
  assert.ok(Math.abs(edge.arrow.rightX - 164) < 1e-6)
})

test('有结构缺陷时不产出新图', () => {
  const broken = parse(
    [
      '<nodes>',
      '[甲:change]',
      'path = /a',
      'destination = 做完。',
      '',
      '[乙:root]',
      'destination = 收尾。',
      '</nodes>',
      '',
      '<links>',
      '[[甲 -> 乙]]',
      'artifact = x',
      '',
      '[[甲 -> 乙]]',
      'artifact = x',
      '</links>',
    ].join('\n'),
  )

  assert.ok(broken.model)
  assert.ok(broken.diagnostics.length > 0)
  assert.equal(buildPreviewPayload(broken), undefined)
})

test('文法错误时不产出新图', () => {
  assert.equal(buildPreviewPayload(parse('<node>\n</node>')), undefined)
})

test('面板 HTML 带 CSP、nonce 与脚本地址', () => {
  const html = buildPreviewHtml({
    scriptUri: 'vscode-resource://x/dist/media/preview.js',
    nonce: 'abc123',
  })

  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /default-src 'none'/)
  assert.match(html, /script-src 'nonce-abc123'/)
  assert.match(html, /vscode-resource:\/\/x\/dist\/media\/preview\.js/)
})
