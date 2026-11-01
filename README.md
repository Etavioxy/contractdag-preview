# Contract DAG Preview

English | [中文](README.zh.md)

Draw a `.contractdag` contract declaration as a directed acyclic graph: edit the file on the left, the graph on the right follows.

## Draws contracts, not workflows

Every node states two things: which locations it may touch (`path`), and what holds once it is done (`destination`). Artifacts are not declared on nodes but on the links between them (`artifact`) — an artifact belongs to a hand-off.

Runtime concepts stay out of the file. How many retries, where to roll back, whether a human steps in: none of that is in the grammar. The file describes the state after a job is done, so a reader judges the outcome, not the choreography.

## Install

Search for `Contract DAG Preview` in the Extensions view, or install a packaged build:

```bash
code --install-extension contractdag-preview-<version>.vsix
```

## First preview

1. Create a file with the `.contractdag` extension
2. Click the icon in the editor title bar, or run `Contract DAG: 打开预览` from the Command Palette
3. The graph opens in the editor group beside the text; running the command again only brings that group forward
4. Switching to another tab keeps the panel alive; coming back restores the previous zoom and position

## What a declaration file looks like

```contractdag
<nodes>

[源码构建节点:change]
path        = /srv/app/build
destination = [
  构建包 `build.tar` 已产出，校验和已记录。
  只写 path 里的位置。
]

[站点巡检节点:query]
path        = /srv/app/live
destination = 对外三个页面各抓取 3 次，全部返回 200 且内容哈希一致。

[流水线收尾:root]
destination = 部署流水线完成：`env-ready` 已落盘，巡检报告已归档。

</nodes>

<links>

[[源码构建节点 -> 站点巡检节点]]
artifact = build.tar

[[站点巡检节点 -> 流水线收尾]]
artifact = verify-report

</links>
```

A file has exactly three regions, in this order: nodes, links, style. The style region may be omitted entirely.

| Region | Accepts |
|---|---|
| `<nodes>` | `[name:kind]` headers; keys are `path` and `destination`; kind is `change` (default), `query`, or `root` |
| `<links>` | `[[from -> to]]` headers; `artifact` is required and may span multiple lines (one link can deliver several artifacts); any other key is free-form on a single line |
| `<style>` | Global settings such as `direction TB / BT / LR / RL`, `gap 32`, `font Sarasa Mono SC`, plus mermaid's three lines: `classDef` defines properties, `class` attaches them to nodes, `linkStyle` attaches them to links |

Blocks are delimited by headers, not indentation; lines starting with `#` are comments and never reach the model.

A `change` node without `path` is not a legal declaration — it touches things, so it must say where it may touch them.

## What the graph shows

- **Nodes**: always 160×56, name on top, kind below, a badge in the top-right corner. Body text never enters the frame; click the badge to expand it into a floating card next to the graph that you can select and search
- **Links**: curved, arrowheads sitting on the target frame; artifact names land in the gap between two layers, and labels in the same gap never overlap
- **Zooming out**: below 0.75 the artifact labels go first, below 0.55 the kind goes too; names and borders stay until the minimum
- **Defects**: edges in a cycle turn red, dangling nodes turn grey, a `change` node missing `path` and a duplicated artifact name each get a badge, and a link to an undeclared node cannot be drawn
- **Bottom-left**: `nodes · links · zoom`, with defects listed line by line (`line: message`) above it; the list collapses when there are none

The graph is never withdrawn because of a defect — cycles and dangling nodes still render, and the defects are marked on the drawing.

## Interaction

| Input | Action |
|---|---|
| Wheel / two-finger scroll | Scroll vertically |
| Shift + wheel | Scroll horizontally |
| Ctrl/Cmd + wheel | Zoom anchored at the pointer (0.5 to 3, ×1.1 per step) |
| Drag on empty space or a node | Pan |
| Click a node | Move the cursor to that node's declaration |
| Click the corner badge | Expand or collapse that node's body card |

A drag only counts past 4px, anything shorter is a click — so a quick sweep across the graph will not move your cursor.

## Commands

| Command | Effect |
|---|---|
| `Contract DAG: 打开预览` | Open the preview, or bring it forward |
| `Contract DAG: 导出契约模型` | Print the parsed model as JSON to the output channel |
| `Contract DAG: 观测编辑器三样` | Record token count, folding range count and the completion candidates at the cursor |
| `Contract DAG: 计算图布局` | Print the coordinates computed for this file |

## The parser without the editor

The same parser ships as a Node library and a CLI, for tooling that never opens VS Code:

```bash
npm install @etavioxy/contractdag
npx contractdag pipeline.contractdag
```

```js
import { parseContract } from '@etavioxy/contractdag'

const { model, diagnostics } = parseContract(source)
```

`model` is absent when the text does not parse; every node, link and diagnostic carries a 0-based range. The CLI exits `0` when there are no defects, `1` when the model has defects, `2` when it has no model. Rust consumers use the crate instead of the CLI: `cargo add contractdag`. Details, compatibility promises and the conformance corpus that keeps both implementations aligned: [docs/library.md](docs/library.md).

## Editor support

`.contractdag` has its own language id, `contract-dag`: region tags, keys, kinds, link arrows and comments are coloured separately; each region folds as one range, and so does each node or link block; completions follow the region under the cursor — keys and kinds in the node region, `artifact` and already-declared node names in the link region, keywords and directions in the style region.

## Limits

- The preview is read-only: nothing you do on the graph writes to the file, and changing the graph means changing the text
- No runtime in the drawing: no retries, timeouts, rollbacks or processes
- Artifact label widths are estimated from column counts (no font metrics on the extension side); labels stick to their own curve and are not moved out of the way of other curves
- Only `.contractdag` activates the extension; no other file does

## License

MIT
