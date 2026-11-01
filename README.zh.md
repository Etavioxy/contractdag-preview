# Contract DAG Preview

[English](README.md) | 中文

把一份 `.contractdag` 契约声明文件画成有向无环图：左边改文件，右边那张图当场跟着变。

## 画的是契约，不是流程

每个节点写下两件事——它允许碰哪些位置（`path`），以及它做完之后是什么样（`destination`）。产物名不写在节点上，写在节点之间的连线上（`artifact`）：产物是交接物，只属于那一次交接。

运行时概念不进文件。重试几次、失败了回滚到哪、要不要人工介入，这些都不在语法里——文件只描述做完之后的状态，读者判的是结果对不对，不是流程走没走对。

## 安装

在扩展视图里搜 `Contract DAG Preview`，或装打包好的 vsix：

```bash
code --install-extension contractdag-preview-<版本>.vsix
```

## 第一次预览

1. 新建一个文件，后缀 `.contractdag`
2. 点编辑器右上角的图标，或从命令面板执行 `Contract DAG: 打开预览`
3. 图开在右侧相邻的编辑器组里，与文本并排；再执行一次只是把那格提到前面，不重复开
4. 切到别的标签页不销毁，切回来还原上次的比例与位置

## 一份声明文件长这样

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

文件固定三个区，顺序是节点、连线、样式；样式区可以整块省略。

| 区 | 认什么 |
|---|---|
| `<nodes>` | `[名字:种类]` 表头，键只有 `path` 与 `destination`；种类为 `change`（默认）、`query`、`root` |
| `<links>` | `[[源 -> 目的]]` 表头；`artifact` 必填，可写多行（一条边交多个产物），其余键按单行自由写 |
| `<style>` | 照 mermaid 的三句：`direction TB / BT / LR / RL`、`gap 32`、`font 更纱黑体 SC` 这类全局设置，`classDef` 定义属性、`class` 挂到节点、`linkStyle` 挂到连线 |

块的边界是表头，不是缩进；`#` 起头的行是注释，不进模型。

`change` 节点不写 `path` 就不是合法声明——它要动东西，必须说清允许动哪里。

## 图上看得见什么

- **框**：高固定 56、宽至少 160，名字多长框就多宽（不截断）；名字在上、种类在下，右上角一个角标。正文不进框，点角标展开成浮层，贴在图旁边，可以选中、可以查找
- **边**：曲线，箭头贴在目标框边上；产物名落在两层之间的缝里，同一个缝里的标签互不重叠
- **缩小**：比例低于 0.75 先收产物标签，低于 0.55 再收种类，名字与边框一直留到最小
- **缺陷**：成环的边标红，断头节点转灰，变更节点缺 `path`、产物重名各打一个角标，引用了未声明节点的连线画不出来
- **左下角**：`节点数 · 边数 · 比例`，上面一行一行列缺陷（`行号: 消息`）；没有缺陷时收起

图不会因为结构缺陷而消失——成环与断头的拓扑仍然画得出来，缺陷标在图上。

## 操作

| 输入 | 动作 |
|---|---|
| 滚轮 / 双指滑行 | 上下滚动 |
| Shift + 滚轮 | 左右滚动 |
| Ctrl/Cmd + 滚轮 | 以指针为锚缩放（0.5 到 3，每次乘 1.1） |
| 在空白或节点上拖动 | 平移画布 |
| 单击节点 | 光标跳到这个节点的声明行 |
| 单击右上角角标 | 展开或收起这个节点的正文浮层 |

拖动超过 4px 才算拖动，阈值内算点击——所以在图上快扫不会把光标带跑。

## 命令

| 命令 | 作用 |
|---|---|
| `Contract DAG: 打开预览` | 打开或提到前面 |
| `Contract DAG: 导出契约模型` | 把解析出的模型 JSON 写进输出面板 |
| `Contract DAG: 观测编辑器三样` | 把着色段数、折叠区间数、光标处补全候选打成一条记录 |
| `Contract DAG: 计算图布局` | 打印这份文件算出的坐标 |

## 不开编辑器也能用

同一个解析器也发成 Node 库和命令行，给不打开 VS Code 的工具用。不发 npm，从仓库挂本地依赖：

```bash
pnpm stage:lib    # 把 dist 打进 packages/contractdag
```

```json
{ "dependencies": { "@etavioxy/contractdag": "file:../vscode-contractdag-preview/packages/contractdag" } }
```

```js
import { parseContract } from '@etavioxy/contractdag'

const { model, diagnostics } = parseContract(source)
```

文法不合法时没有 `model`；节点、连线与诊断都带从 0 起的 `range`。装好的包还提供 `contractdag <文件>`：退出码 `0` 无缺陷、`1` 有模型但有缺陷、`2` 没有模型。Rust 侧不用命令行，直接用 crate：`cargo add contractdag`。分发、兼容承诺，以及钉住两份实现的语料见 [docs/library.md](docs/library.md)。

## 编辑器支持

`.contractdag` 有自己的语言 ID `contract-dag`：区标签、键名、种类、连线箭头、注释分别着色；三个区各折一段，节点块与连线块也各折一段；补全按光标所在区给候选——节点区给 `path` / `destination` 与种类，连线区给 `artifact` 与文档里已经写出的节点名，样式区给关键字与方向。

## 边界

- 预览只读：图上的一切操作都不改文件，改图就是改文本
- 不画运行时：没有重试、超时、回滚、进程这些概念
- 产物标签的宽度在扩展侧按列估算（拿不到字体度量），标签贴着它自己的曲线，与别的曲线相交时不做避让
- 只有 `.contractdag` 会被激活，别的文件不触发

## 许可

MIT
