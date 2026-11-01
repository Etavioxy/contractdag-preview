# vscode-contractdag-preview — Library

- **本文档范围**：解析器在编辑器之外的用法——两个入口（TypeScript 与 Rust）、返回什么、怎么分发、兼容承诺。文法归 `spec.md`，图的画法归 `panel-ui.md`。

## 两个入口，一份语义

| 入口 | 产物 | 给谁 |
|---|---|---|
| TypeScript | `dist/lib.mjs`、`dist/lib.cjs`、`dist/types` | 扩展、npm 上的 JS 工具 |
| Rust | `crates/contractdag` | Rust 下游库 |
| 命令行 | `dist/cli.cjs`（`contractdag`） | 其他语言、脚本 |

- 两份实现由同一份语料钉住：`crates/contractdag/tests/corpus` 里每份样例配一份期望 JSON，期望值由 TypeScript 侧生成。`pnpm conformance` 重生成，`pnpm test` 与 `cargo test` 各自对着它跑——任一侧漂移都会在自己的测试里失败。
- 除这两份之外不再有第三处实现。
- 语料没覆盖的行为不承诺跨语言一致：加文法先加样例，再改两边。

## TypeScript

```ts
import { parseContract } from 'contractdag-preview'

const { model, style, diagnostics } = parseContract(source)
```

| 字段 | 含义 |
|---|---|
| `model` | 节点与连线；文法不合法时缺省 |
| `style` | 样式区解出来的呈现参数，不进契约模型 |
| `diagnostics` | `syntax` 与 `structural` 两层，每条带 `code`、`message`、`range` |

- 入口的依赖闭包只有 `parser`、`defects`、`scan`、`syntax`、`model`，不含 `vscode`：不激活编辑器也能跑，也不必装 VS Code。
- 包根的 `exports` 指向库，`main` 仍是 `dist/extension.cjs` 给扩展用；两边互不改对方的加载方式。
- `range` 行与列都从 0 起，与 VS Code 同口径；节点与连线除自身 `range` 外还带 `keyRanges`，逐键定位到声明行。
- 文法错误不产出模型：模型要么完整要么没有，调用方不用拼半个模型。
- 结构缺陷不撤模型：环、断头、产物重名、缺 `path`、坏名字都在 `diagnostics` 里，`model` 照常给出。
- `toDumpJson(model, diagnostics)` 给只要契约本身、不要行号的一侧用；扩展的「导出契约模型」按它出 JSON。

## Rust

```rust
let result = contractdag::parse(source);
for diagnostic in &result.diagnostics {
    eprintln!("{}:{} {}", diagnostic.range.start_line + 1, diagnostic.range.start_character, diagnostic.message);
}
```

- `contractdag::parse(&str) -> ParseResult`，字段与 TypeScript 侧同构：`model`（`Option<ContractModel>`）、`style`、`diagnostics`。
- 类型全部实现了 `Serialize` / `Deserialize`，JSON 与 npm 侧逐字段一致：区间是 `startLine` / `startCharacter` 这类小驼峰，种类小写，方向大写。
- 列宽按 UTF-16 码元数算，与 JavaScript 的 `String.length` 同口径——列号拿到 JS 侧能直接用，不按字节数。
- 不碰文件系统与时钟：`parse` 只吃字符串，同样的输入永远给同样的输出。

## 命令行

```bash
contractdag pipeline.contractdag
```

- stdout 是一份 `ParseResult` 的 JSON，字段与两个库的返回同构；stderr 只在读不到文件或参数不对时写理由。
- 退出码先分流，不必先解 JSON：`0` 无缺陷、`1` 有模型但有缺陷、`2` 没有模型。
- 一次调用起一个 node 进程，本机实测约 30ms 一次；批量解析就一个文件一次调用，不要在进程里常驻。Rust 侧要进程内解析时用 crate，不用这条路。

## 分发

- npm 包 `contractdag-preview`，与扩展同名同版本：`pnpm add contractdag-preview`。包里只有 `dist/lib.*`、`dist/cli.cjs`、`dist/types`，加上两份 README 与 LICENSE。
- crate `contractdag`：`cargo add contractdag`。与 npm 包同版本号，跟着扩展一起发。
- `prepublishOnly` 重打一遍 bundle 并生成声明；TypeScript 7 目前不为声明文件改写 `.ts` 后缀，`scripts/declarations.mjs` 补这一步，未改写干净就报错。
- 构建目标是 node20 与 Rust 1.85；更低的版本没有验证过。

## 兼容承诺

- 0.x 期间 minor 可以改 API 与模型形状，patch 不改。
- 模型与诊断只增字段：既有字段的含义不换；删字段或改名走 major。
- `diagnostics[].code` 是稳定标识，`message` 是给人读的文本，随时可能改。
- 两侧的语义以语料为准；语料没覆盖到的差异不承诺一致，发现即补样例。
