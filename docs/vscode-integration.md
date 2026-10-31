# vscode-contractdag-preview — VS Code Integration

- **本文档范围**：扩展与 VS Code 之间的接缝——面板开在哪、命令与菜单怎么挂、webview 沙盒开多大、以及缩放与拖动的输入映射。画什么归 `panel-ui.md`，坐标怎么算归 `graph-layout.md`。
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

## 输入映射

| 输入 | 动作 |
|---|---|
| 双指滑行 / 滚轮 | 纵向滚动，位移直接跟手 |
| Shift + 滚轮 | 横向滚动 |
| Ctrl/Cmd + 滚轮 | 以指针为锚缩放 |
| 在空白或节点上拖动 | 平移画布 |
| 单击节点 | 光标落到该节点的声明行 |
| 单击右上角标 | 展开或收起该节点的正文浮层 |

- 位移超过 4px 按拖动处理，不再跳编辑器；阈值内才算点击。常量在 `gesture.ts` 的 `clickSlop`。
- 指针捕获只在判定成拖动之后才设：单击全程不经过捕获，命中用按下时的原位点；拖动才捕获，指针跑出视口也能继续跟手。
- 缩放与滚动的可达范围、步进、阻尼，见 `panel-ui.md` §缩放与滚动的边界、§阻尼。
