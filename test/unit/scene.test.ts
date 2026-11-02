import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildPreviewPayload } from '../../src/panel/payload.ts'
import { buildScene, type Scene, type SceneItem, type ScenePalette } from '../../src/panel/scene.ts'
import { estimateTextWidth } from '../../src/panel/text.ts'
import { parse } from '../../src/parser.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const deploy = parse(readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8'))

const palette: ScenePalette = {
  foreground: '#ddd',
  description: '#999',
  nodeFill: '#232323',
  nodeStroke: '#555',
  highlight: '#4a9eff',
  highlightFill: '#2a2d2e',
  highlightForeground: '#ffffff',
  hoverFill: '#2a2d2e',
  edge: '#666',
  background: '#1e1e1e',
  error: '#f14c4c',
}

function sceneOf(source: ReturnType<typeof parse>, expanded: ReadonlySet<string> = new Set()): Scene {
  const payload = buildPreviewPayload(source, null, expanded)
  assert.ok(payload)
  return buildScene(payload, { scale: 1, scrollX: 0, scrollY: 0 }, palette)
}

function texts(scene: Scene): Array<{ text: string; x: number; y: number; size: number }> {
  return scene.items
    .filter((item): item is Extract<SceneItem, { kind: 'text' }> => item.kind === 'text')
    .map((item) => ({ text: item.text, x: item.x, y: item.y, size: item.size }))
}

function rects(scene: Scene): Array<{ x: number; y: number; width: number; height: number }> {
  return scene.items
    .filter((item): item is Extract<SceneItem, { kind: 'rect' }> => item.kind === 'rect')
    .map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height }))
}

test('图元表：四个框画在 0.1.0 的同一批坐标上，名字与种类仍在框里', () => {
  const scene = sceneOf(deploy)

  assert.deepEqual(rects(scene), [
    { x: 80, y: 24, width: 160, height: 56 },
    { x: 80, y: 128, width: 160, height: 56 },
    { x: 80, y: 232, width: 160, height: 56 },
    { x: 80, y: 336, width: 160, height: 56 },
  ])

  // 名字在头部中线偏上 8px，种类偏下 10px，角标贴右上角
  assert.deepEqual(
    texts(scene).filter((text) => text.size === 13).map((text) => [text.text, text.x, text.y]),
    [
      ['源码构建节点', 160, 44],
      ['上线安装节点', 160, 148],
      ['站点巡检节点', 160, 252],
      ['流水线收尾', 160, 356],
    ],
  )
  assert.deepEqual(
    texts(scene).filter((text) => text.size === 11 && text.text !== 'build.tar' && text.text !== 'env-ready' && text.text !== 'verify-report').map((text) => [text.text, text.x, text.y]),
    [
      ['change', 160, 62],
      ['▸', 228, 38],
      ['change', 160, 166],
      ['▸', 228, 142],
      ['query', 160, 270],
      ['▸', 228, 246],
      ['root', 160, 374],
      ['▸', 228, 350],
    ],
  )

  assert.equal(scene.width, 320)
  assert.equal(scene.height, 472)
})

test('图元表：长名字完整画出，框宽撑到放得下，不截断', () => {
  const long = '这是一个非常长的节点名字会明显超出框的宽度'
  const source = parse(
    [
      '<nodes>',
      `[${long}:change]`,
      'path = /srv/app',
      'destination = 做完。',
      '',
      '[收尾:root]',
      'destination = 收尾。',
      '</nodes>',
      '',
      '<links>',
      `[[${long} -> 收尾]]`,
      'artifact = done.tar',
      '</links>',
    ].join('\n'),
  )
  const payload = buildPreviewPayload(source)
  assert.ok(payload)
  const node = payload.nodes.find((candidate) => candidate.name === long)
  assert.ok(node)
  assert.ok(node.width > 160, '框宽按名字撑开')
  assert.ok(node.width >= estimateTextWidth(long, 13) + 24, '框宽留得下左右各 12 的内缩')

  const scene = buildScene(payload, { scale: 1, scrollX: 0, scrollY: 0 }, palette)
  const name = scene.items.find(
    (item): item is Extract<SceneItem, { kind: 'text' }> =>
      item.kind === 'text' && item.size === 13 && item.text === long,
  )
  assert.ok(name, '名字原样画出，不带省略号')

  // 短名字一个字都不动
  assert.deepEqual(
    texts(sceneOf(deploy))
      .filter((text) => text.size === 13)
      .map((text) => text.text),
    ['源码构建节点', '上线安装节点', '站点巡检节点', '流水线收尾'],
  )
})

test('图元表：150 个字符的名字也整串画出', () => {
  const long = '长'.repeat(150)
  const source = parse(
    ['<nodes>', `[${long}:root]`, 'destination = 收尾。', '</nodes>', '<links>', '</links>'].join('\n'),
  )
  const payload = buildPreviewPayload(source)
  assert.ok(payload)
  const node = payload.nodes[0]
  assert.ok(node)
  assert.equal(node.name, long)
  assert.ok(node.width >= estimateTextWidth(long, 13) + 24)

  const scene = buildScene(payload, { scale: 1, scrollX: 0, scrollY: 0 }, palette)
  assert.ok(
    scene.items.some((item) => item.kind === 'text' && item.size === 13 && item.text === long),
    '整串画出，没有省略号',
  )
})

test('图元表：三条边都是曲线，两端与箭头落在 0.1.0 的位置', () => {
  const payload = buildPreviewPayload(deploy)
  assert.ok(payload)
  const scene = buildScene(payload, { scale: 1, scrollX: 0, scrollY: 0 }, palette)

  const curves = scene.items.filter((item): item is Extract<SceneItem, { kind: 'curve' }> => item.kind === 'curve')
  assert.equal(curves.length, 3)
  assert.deepEqual(
    curves.map((curve) => [curve.p0.x, curve.p0.y, curve.p3.x, curve.p3.y, curve.lineWidth]),
    [
      [160, 80, 160, 121, 1.5],
      [160, 184, 160, 225, 1.5],
      [160, 288, 160, 329, 1.5],
    ],
  )
  // 竖直边的控制点落在两端中间那一半：曲线与直线重合，肉眼仍是一根
  assert.deepEqual(curves[0]?.c1, { x: 160, y: 104 })
  assert.deepEqual(curves[0]?.c2, { x: 160, y: 104 })

  const arrows = scene.items.filter((item): item is Extract<SceneItem, { kind: 'polygon' }> => item.kind === 'polygon')
  assert.equal(arrows.length, 3)
  assert.deepEqual(arrows[0]?.points[0], { x: 160, y: 128 })

  // 单产物标签在曲线中点上方 6px，带底色描边
  const label = scene.items.find(
    (item): item is Extract<SceneItem, { kind: 'text' }> => item.kind === 'text' && item.text === 'build.tar',
  )
  assert.ok(label)
  assert.deepEqual({ x: label.x, y: label.y }, { x: 160, y: 98 })
  assert.equal(label.halo, '#1e1e1e')
  assert.equal(label.baseline, 'alphabetic')
})

test('图元表：比例越小越早收掉小字，角标与边框始终画', () => {
  const scene = (scale: number): Scene => {
    const payload = buildPreviewPayload(deploy)
    assert.ok(payload)
    return buildScene(payload, { scale, scrollX: 0, scrollY: 0 }, palette)
  }

  const full = scene(0.9)
  assert.ok(texts(full).some((text) => text.text === 'build.tar'), '高比例下有边标签')
  assert.ok(texts(full).some((text) => text.text === 'change'), '高比例下有标注')

  const annotationOnly = scene(0.6)
  assert.ok(!texts(annotationOnly).some((text) => text.text === 'build.tar'), '低比例先收边标签')
  assert.ok(texts(annotationOnly).some((text) => text.text === 'change'), '还剩标注')
  assert.ok(texts(annotationOnly).some((text) => text.text === '▸'), '角标任何时候都在')

  const nameOnly = scene(0.5)
  assert.ok(!texts(nameOnly).some((text) => text.text === 'change'), '再低就只留名字')
  assert.equal(texts(nameOnly).filter((text) => text.size === 13).length, 4)
  assert.equal(rects(nameOnly).length, 4, '框一个不少')
})

test('图元表：高亮只改描边与线宽，坐标不动', () => {
  const source = parse(readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8'))
  const payload = buildPreviewPayload(source, '站点巡检节点')
  assert.ok(payload)
  const scene = buildScene(payload, { scale: 1, scrollX: 0, scrollY: 0 }, palette)

  const boxes = scene.items.filter((item): item is Extract<SceneItem, { kind: 'rect' }> => item.kind === 'rect')
  assert.equal(boxes[2]?.stroke, '#4a9eff')
  assert.equal(boxes[2]?.lineWidth, 3)
  assert.equal(boxes[0]?.stroke, '#555')
  assert.equal(boxes[0]?.lineWidth, 1.5)
})

test('图元表：展开只换角标，框与边一个不动，正文不进画布', () => {
  const folded = sceneOf(parse(readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8')))
  const expanded = sceneOf(parse(readFileSync(join(fixtures, 'deploy.contractdag'), 'utf8')), new Set(['上线安装节点']))

  assert.deepEqual(rects(expanded), rects(folded), '展开不改变任何框')
  assert.equal(expanded.height, folded.height)
  assert.equal(
    expanded.items.filter((item) => item.kind === 'curve').length,
    folded.items.filter((item) => item.kind === 'curve').length,
  )
  // 正文搬进 DOM 浮层：画布里不再有 10px 的正文行
  assert.ok(!texts(expanded).some((text) => text.size === 10))
  // 角标从 ▸ 翻成 ▾，位置不动
  const chevron = texts(expanded).filter((text) => text.text === '▾' || text.text === '▸')
  assert.equal(chevron.filter((text) => text.text === '▾').length, 1)
  assert.deepEqual(
    chevron.filter((text) => text.text === '▾').map((text) => [text.x, text.y]),
    [[228, 142]],
  )
})

test('图元表：缺陷标在图上——环边标红、产物重名带角标', () => {
  const cycleScene = sceneOf(parse(readFileSync(join(fixtures, 'defect-cycle.contractdag'), 'utf8')))
  const curves = cycleScene.items.filter(
    (item): item is Extract<SceneItem, { kind: 'curve' }> => item.kind === 'curve',
  )
  assert.equal(curves.length, 2)
  assert.deepEqual(curves.map((curve) => curve.stroke), ['#f14c4c', '#f14c4c'])

  const duplicateScene = sceneOf(parse(readFileSync(join(fixtures, 'defect-duplicate-artifact.contractdag'), 'utf8')))
  const duplicateBadges = duplicateScene.items.filter(
    (item): item is Extract<SceneItem, { kind: 'badge' }> => item.kind === 'badge',
  )
  assert.equal(duplicateBadges.length, 1)
})

test('图元表：产物重名的角标跟着产物标签一起收', () => {
  const payload = buildPreviewPayload(parse(readFileSync(join(fixtures, 'defect-duplicate-artifact.contractdag'), 'utf8')))
  assert.ok(payload)
  const scene = buildScene(payload, { scale: 0.5, scrollX: 0, scrollY: 0 }, palette)

  assert.equal(scene.density, 'name')
  // 产物重名的角标钉在产物标签旁，标签被收掉时它也跟着收：角标指的就是那个标签。
  assert.equal(scene.items.filter((item) => item.kind === 'badge').length, 0)
})

test('图元表：多产物的标签沿弧线依次排开', () => {
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
    '  a.tar',
    '  a.log',
    '  a.map',
    ']',
    '</links>',
  ].join('\n')

  const scene = sceneOf(parse(source))
  const labels = scene.items.filter(
    (item): item is Extract<SceneItem, { kind: 'text' }> =>
      item.kind === 'text' && ['a.tar', 'a.log', 'a.map'].includes(item.text),
  )
  assert.equal(labels.length, 3)
  const ys = labels.map((label) => label.y)
  assert.ok(ys[0]! < ys[1]! && ys[1]! < ys[2]!)
})
