import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildPreviewHtml } from '../../src/panel/html.ts'
import { buildPreviewPayload } from '../../src/panel/payload.ts'
import { estimateTextWidth } from '../../src/panel/text.ts'
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

test('面板数据：crossing 示例里水平相撞的标签都被错开，缝高仍是 48', () => {
  const crossing = parse(readFileSync(join(fixtures, '..', '..', 'examples', 'crossing.contractdag'), 'utf8'))
  const payload = buildPreviewPayload(crossing)
  assert.ok(payload)

  // 层距没被抬高：第一层的框仍在 128
  const layer = payload.nodes.filter((node) => ['甲', '乙', '丙'].includes(node.name)).map((node) => node.y)
  assert.deepEqual([...new Set(layer)], [128])

  // 硬保证：水平区间相交的标签，垂直方向至少隔一个 labelSpacing
  const labels = payload.edges.flatMap((edge) => edge.labels)
  for (let left = 0; left < labels.length; left += 1) {
    for (let right = left + 1; right < labels.length; right += 1) {
      const first = labels[left]!
      const second = labels[right]!
      const overlap =
        Math.abs(first.x - second.x) < (estimateTextWidth(first.text, 11) + estimateTextWidth(second.text, 11)) / 2
      if (!overlap) continue
      assert.ok(Math.abs(first.y - second.y) >= 14, `${first.text} 与 ${second.text} 撞在一起`)
    }
  }
})

test('面板数据：同缝两条边水平分得开时只用一行，不白白错道', () => {
  const payload = buildPreviewPayload(parse(readFileSync(join(fixtures, 'fork.contractdag'), 'utf8')))
  assert.ok(payload)

  const outgoing = payload.edges.filter((edge) => edge.from === '甲')
  assert.equal(outgoing.length, 2)
  const first = outgoing[0]?.labels[0]
  const second = outgoing[1]?.labels[0]
  assert.ok(first !== undefined && second !== undefined)
  // 同一条道：y 相同；横向差得开
  assert.equal(first.y, second.y)
  assert.ok(Math.abs(first.x - second.x) > 40)
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

test('面板数据：展开不撑高节点，坐标与画布高度一个不动', () => {
  const folded = buildPreviewPayload(deploy)
  const payload = buildPreviewPayload(deploy, null, new Set(['上线安装节点']))
  assert.ok(folded)
  assert.ok(payload)

  const second = payload.nodes[1]
  assert.equal(second?.expanded, true)
  assert.equal(second?.height, 56)
  // 正文只随 payload 带给浮层，不参与排版
  assert.ok((second?.lines.length ?? 0) > 3)
  assert.deepEqual(
    payload.nodes.map((node) => [node.x, node.y, node.width, node.height]),
    folded.nodes.map((node) => [node.x, node.y, node.width, node.height]),
  )
  assert.equal(payload.height, folded.height)
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

test('有结构缺陷照常出图，缺陷落在对应的边上', () => {
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
  const payload = buildPreviewPayload(broken)
  assert.ok(payload)
  assert.equal(payload.edges.length, 2)
  assert.deepEqual(payload.edges.map((edge) => edge.defects), [[], ['duplicate-artifact']])
  assert.equal(payload.diagnostics.length, 1)
  assert.equal(payload.diagnostics[0]?.layer, 'structural')
})

test('结构缺陷不再撤图：环、断头、缺 path 都照常出图并带标记', () => {
  const cycle = buildPreviewPayload(parse(readFileSync(join(fixtures, 'defect-cycle.contractdag'), 'utf8')))
  assert.ok(cycle)
  assert.deepEqual(cycle.edges.map((edge) => edge.defects), [['cycle'], ['cycle']])

  const dangling = buildPreviewPayload(parse(readFileSync(join(fixtures, 'defect-dangling.contractdag'), 'utf8')))
  assert.ok(dangling)
  assert.deepEqual(dangling.nodes.find((node) => node.name === '丙')?.defects, ['dangling-node'])

  const missing = buildPreviewPayload(parse(readFileSync(join(fixtures, 'defect-missing-path.contractdag'), 'utf8')))
  assert.ok(missing)
  assert.deepEqual(missing.nodes.find((node) => node.name === '甲')?.defects, ['missing-path'])
})

test('文法错误时不产出新图', () => {
  assert.equal(buildPreviewPayload(parse('<node>\n</node>')), undefined)
})

test('结构缺陷时画布尺寸照算，不因缺陷缩成 0', () => {
  const payload = buildPreviewPayload(parse(readFileSync(join(fixtures, 'defect-cycle.contractdag'), 'utf8')))
  assert.ok(payload)
  assert.ok(payload.width > 0 && payload.height > 0)
  assert.equal(payload.height, Math.max(...payload.nodes.map((node) => node.y + node.height)) + 80)
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
  // 画布、正文浮层、HUD、缺陷清单都在骨架里
  assert.match(html, /<canvas id="graph">/)
  assert.match(html, /<div id="bodies">/)
  assert.match(html, /<div id="hud">/)
  assert.match(html, /<div id="defects" hidden>/)
})
