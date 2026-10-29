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
      ['build.tar', 160, 80, 160, 100, 160, 90],
      ['env-ready', 160, 156, 160, 176, 160, 166],
      ['verify-report', 160, 232, 160, 252, 160, 242],
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
