# vscode-contractdag-preview — VS Code Integration

- **本文档范围**：扩展与 VS Code 之间的接缝——面板开在哪、命令与菜单怎么挂、webview 沙盒开多大、缩放与拖动的输入映射、编辑器侧的补全、以及本语言的默认配置。画什么归 `panel-ui.md`，坐标怎么算归 `graph-layout.md`。
- **预览必须能并排**：图要开在文本右侧的新组，不替换文本编辑器，也不进侧栏。
- **预览不承载可写状态**：一切改动落回文本。
- **宿主算、webview 画**：解析与坐标都在宿主侧，webview 只收模型。

## 面板

- 用 `window.createWebviewPanel` 开在 `ViewColumn.Beside`；按文档 URI 一文档一面板，再次执行预览只 reveal 已有的那个。
- 面板关闭时清掉该文档的展开集合、高亮、发送防抖定时器与缓存模型。
- webview 选项：`enableScripts` 开；`retainContextWhenHidden` 开，切走再回来不重画；`localResourceRoots` 只放 `dist/media`。
- 文档变更后 80ms 内的连续修改合并成一次重算，常量在 `graph-panel.ts` 的 `debounceMs`。

## CSP

`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-<每次新生成>'`。脚本地址由 `asWebviewUri` 给出，nonce 每次建面板现生成。

## 命令与菜单

| 命令 | 作用 |
|---|---|
| `contractdag.preview` | 打开预览 |
| `contractdag.dump` | 把模型 JSON 写进输出通道与记录文件 |
| `contractdag.inspect` | 实时算出编辑器三样 |
| `contractdag.layout` | 算出布局坐标 |

- 预览命令同时挂在 `editor/title` 与 `commandPalette`，两处条件都是 `editorLangId == contract-dag`，与 VS Code 自带的 Markdown 预览同键；`editor/title` 的组是 `navigation@1`。
- 图标分亮暗两套，落在 `media/icons/`。

## 记录

- 一次激活、一次预览刷新、一次点节点、一条命令都写一行 JSON：`{...payload, event, at}`。
- 输出通道 `Contract DAG` 始终收一份——面板里的位移、缩放、缺陷数在那查。
- 文件只在环境变量 `CONTRACTDAG_RECORD_SINK` 指定路径时才写：端到端剧本靠回读这个文件判断「命令有没有发出去、面板收没收到」。用户侧不落盘，否则一份日志会随每次编辑无限长下去。

## 输入映射

| 输入 | 动作 |
|---|---|
| 滚轮 / 双指捏合 | 以指针为锚缩放，比例直接跟手 |
| Shift + 滚轮 | 横向平移 |
| Ctrl/Cmd + 滚轮 | 纵向平移 |
| 在空白或节点上拖动 | 平移画布 |
| 单击节点 | 光标落到该节点的声明行 |
| 指针停在节点上 | 临时展开正文浮层，移开即收 |
| 单击右上角标 | 固定展开或收起该节点的正文浮层 |

- 位移超过 4px 按拖动处理，不再跳编辑器；阈值内才算点击。常量在 `gesture.ts` 的 `clickSlop`。
- 指针捕获只在判定成拖动之后才设：单击全程不经过捕获，命中用按下时的原位点；拖动才捕获，指针跑出视口也能继续跟手。
- 缩放与平移的可达范围、步进、阻尼，见 `panel-ui.md` §缩放与滚动的边界、§阻尼。
- 触控板捏合在浏览器里就是带 Ctrl 的滚轮事件，所以缩放占默认滚轮、平移占修饰键：捏合与滚轮落在缩放上，修饰键留给平移。

## 补全

候选只按区的行首给：光标前只有缩进，或只有刚敲下的 `<`。

| 位置 | 候选 |
|---|---|
| 行首敲 `<` | 三个区标签与三个闭合标签 |
| 节点区行首 | `path`、`destination` |
| 连线区行首 | `artifact`，加上本文件里出现过的其他键 |
| 样式区行首 | `direction`、`gap`、`font`、`classDef`、`class`、`linkStyle` |

## 语言默认配置

- `contributes.configurationDefaults` 给 `[contract-dag]` 改一条编辑器默认值：`editor.bracketPairColorization.enabled` 置 false——`[[ ]]` 是定界符而不是嵌套结构，按层上色只添噪音。语言级默认值只影响这门语言，不动用户在其他语言里的设置。
