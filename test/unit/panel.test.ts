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
      ['上线安装节点', 80, 100, 160, 56, 9],
      ['站点巡检节点', 80, 176, 160, 56, 19],
      ['流水线收尾', 80, 252, 160, 56, 26],
    ],
  )
  assert.deepEqual(
    payload.edges.map((edge) => [edge.artifact, edge.x1, edge.y1, edge.x2, edge.y2, edge.labelX, edge.labelY]),
    [
      ['build.tar', 160, 80, 160, 93, 160, 90],
      ['env-ready', 160, 156, 160, 169, 160, 166],
      ['verify-report', 160, 232, 160, 245, 160, 242],
    ],
  )
  assert.equal(payload.width, 320)
  assert.equal(payload.height, 388)
  assert.equal(payload.highlight, null)
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

  // 层距仍按样式区的 gap，只是从上一次的下边界开始算。
  assert.equal(third?.y, second!.y + second!.height + 20)
  assert.equal(fourth?.y, third!.y + third!.height + 20)

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
  // 两翼关于连线对称，各自离线的距离都是半宽
  const distToLine = (x: number, y: number): number => {
    const dx = edge.arrow.tipX - edge.x1
    const dy = edge.arrow.tipY - edge.y1
    return Math.abs((x - edge.x1) * dy - (y - edge.y1) * dx) / Math.hypot(dx, dy)
  }
  assert.ok(Math.abs(distToLine(edge.arrow.leftX, edge.arrow.leftY) - 4) < 1e-6)
  assert.ok(Math.abs(distToLine(edge.arrow.rightX, edge.arrow.rightY) - 4) < 1e-6)
})

test('面板数据：竖直边的箭头仍沿轴，几何与轴对齐时一致', () => {
  const payload = buildPreviewPayload(deploy)
  assert.ok(payload)

  const edge = payload.edges[0]
  assert.ok(edge)
  assert.equal(edge.arrow.tipX, 160)
  assert.equal(edge.arrow.tipY, 100)
  assert.equal(edge.arrow.baseX, 160)
  assert.equal(edge.arrow.baseY, 93)
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
