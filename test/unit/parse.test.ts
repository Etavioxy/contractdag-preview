import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { toDumpJson } from '../../src/model.ts'
import { parse } from '../../src/parser.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const deploy = readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8')

test('样板文件解析成四条节点、三条连线、零诊断', () => {
  const analysis = parse(deploy)

  assert.deepEqual(analysis.diagnostics, [])
  assert.equal(analysis.model?.nodes.length, 4)
  assert.equal(analysis.model?.links.length, 3)
  assert.deepEqual(
    analysis.model?.nodes.map((node) => [node.name, node.kind]),
    [
      ['源码构建节点', 'change'],
      ['上线安装节点', 'change'],
      ['站点巡检节点', 'query'],
      ['流水线收尾', 'root'],
    ],
  )
})

test('dump 出的 JSON 与 docs/concrete-insight.md 的模型一致', () => {
  const analysis = parse(deploy)
  assert.ok(analysis.model)

  assert.deepEqual(toDumpJson(analysis.model, analysis.diagnostics), {
    nodes: [
      {
        name: '源码构建节点',
        kind: 'change',
        path: ['/srv/app/build'],
        destination: ['构建包 `build.tar` 已产出，校验和已记录。', '只写 path 里的位置。'],
      },
      {
        name: '上线安装节点',
        kind: 'change',
        path: ['/srv/app/build', '/srv/app/config'],
        destination: ['两个服务探活连续 3 次成功。', '配置目录只增不改。'],
      },
      {
        name: '站点巡检节点',
        kind: 'query',
        path: ['/srv/app/live'],
        destination: ['对外三个页面各抓取 3 次，全部返回 200 且内容哈希一致。', '抓取并发 8 路，对同一站点不超过每秒 2 次请求。'],
      },
      {
        name: '流水线收尾',
        kind: 'root',
        path: [],
        destination: ['部署流水线完成：`env-ready` 已落盘，巡检报告已归档。'],
      },
    ],
    links: [
      { from: '源码构建节点', to: '上线安装节点', artifact: 'build.tar' },
      { from: '上线安装节点', to: '站点巡检节点', artifact: 'env-ready', target: '/srv/app/live' },
      { from: '站点巡检节点', to: '流水线收尾', artifact: 'verify-report' },
    ],
    diagnostics: [],
  })
})

test('注释与空行不进模型，也不改动位置以外的任何东西', () => {
  const commented = deploy.replace('<nodes>', '<nodes>\n\n# 三个节点各管一段').replace('[上线安装节点:change] fnord', '')

  const analysis = parse(commented)
  const plain = parse(deploy)

  assert.ok(analysis.model)
  assert.ok(plain.model)
  assert.deepEqual(toDumpJson(analysis.model, analysis.diagnostics), toDumpJson(plain.model, plain.diagnostics))
})

test('样式区三句读成呈现参数', () => {
  const source = [
    '<nodes>',
    '[甲:change]',
    'path = /a',
    'destination = 做完。',
    '',
    '[乙:root]',
    'destination = 收尾。',
    '',
    '</nodes>',
    '',
    '<links>',
    '[[甲 -> 乙]]',
    'artifact = x',
    '</links>',
    '',
    '<style>',
    'direction LR',
    'gap 24',
    'font 思源黑体',
    'classDef 危险 fill:#ffe5e5,stroke:#cc3333',
    'class 甲 危险',
    'linkStyle 甲 -> 乙 stroke:#cc3333',
    '</style>',
  ].join('\n')

  const analysis = parse(source)

  assert.deepEqual(analysis.diagnostics, [])
  assert.equal(analysis.style.direction, 'LR')
  assert.equal(analysis.style.gap, 24)
  assert.equal(analysis.style.font, '思源黑体')
  assert.deepEqual(analysis.style.classDefs['危险'], { fill: '#ffe5e5', stroke: '#cc3333' })
  assert.deepEqual(analysis.style.classes.map((entry) => [entry.node, entry.classes]), [['甲', ['危险']]])
  assert.deepEqual(analysis.style.linkStyles.map((entry) => [entry.from, entry.to]), [['甲', '乙']])
})

const broken: Array<{ name: string; source: string; code: string; line: number }> = [
  {
    name: '区名写错',
    source: ['<node>', '</node>'].join('\n'),
    code: 'unknown-region',
    line: 0,
  },
  {
    name: '缺连线区',
    source: ['<nodes>', '[甲:change]', 'path = /a', 'destination = 做完。', '</nodes>'].join('\n'),
    code: 'missing-region',
    line: 4,
  },
  {
    name: '区顺序反了',
    source: ['<links>', '</links>', '<nodes>', '</nodes>'].join('\n'),
    code: 'region-order',
    line: 0,
  },
  {
    name: '节点头没收尾',
    source: ['<nodes>', '[甲', 'destination = 做完。', '</nodes>', '<links>', '</links>'].join('\n'),
    code: 'bad-node-head',
    line: 1,
  },
  {
    name: '种类写错',
    source: ['<nodes>', '[甲:task]', 'destination = 做完。', '</nodes>', '<links>', '</links>'].join('\n'),
    code: 'bad-kind',
    line: 1,
  },
  {
    name: '节点区写了未知键',
    source: ['<nodes>', '[甲:change]', 'path = /a', 'owner = 张三', 'destination = 做完。', '</nodes>', '<links>', '</links>'].join('\n'),
    code: 'unknown-key',
    line: 3,
  },
  {
    name: '节点缺 destination',
    source: ['<nodes>', '[甲:change]', 'path = /a', '</nodes>', '<links>', '</links>'].join('\n'),
    code: 'missing-destination',
    line: 1,
  },
  {
    name: '多行值没收尾',
    source: ['<nodes>', '[甲:change]', 'path = /a', 'destination = [', '做完。', '</nodes>', '<links>', '</links>'].join('\n'),
    code: 'unterminated-value',
    line: 3,
  },
  {
    name: '连线缺 artifact',
    source: ['<nodes>', '[甲:root]', 'destination = 做完。', '</nodes>', '<links>', '[[甲 -> 甲]]', '</links>'].join('\n'),
    code: 'missing-artifact',
    line: 5,
  },
  {
    name: '样式区不认的关键字',
    source: ['<nodes>', '[甲:root]', 'destination = 做完。', '</nodes>', '<links>', '</links>', '<style>', 'shadow 3', '</style>'].join('\n'),
    code: 'unknown-style-key',
    line: 7,
  },
]

for (const { name, source, code, line } of broken) {
  test(`文法错误：${name}`, () => {
    const analysis = parse(source)

    assert.equal(analysis.model, undefined)
    assert.equal(analysis.diagnostics.length, 1)
    assert.equal(analysis.diagnostics[0]?.code, code)
    assert.equal(analysis.diagnostics[0]?.layer, 'syntax')
    assert.equal(analysis.diagnostics[0]?.range.startLine, line)
  })
}
