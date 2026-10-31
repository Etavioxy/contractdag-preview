# 计划：contractdag-preview 首发

被实施仓：本仓（单仓）。规格源：`concepts.md`、`spec.md`；`docs/concrete-insight.md` 提供样例与期望坐标。

## 资源

- 工作仓：本仓，分支 `main`，起点 `1de211f`
- 规格：`concepts.md`（25 个概念）、`spec.md`（8 行选型 + 9 条决策）
- 样例：`docs/concrete-insight.md` 的 `deploy.contractdag` 与它的四条布局坐标
- 沙盒宿主：`@vscode/test-electron` 起的一次性 VS Code，`--user-data-dir`、`--extensions-dir` 均落在临时目录
- 计划：`plans/contractdag-preview.md`（本文件）

## 授权区

| action | target | bounds |
|---|---|---|
| 安装或移除依赖 | `package.json`、`pnpm-lock.yaml` | 只装 `spec.md` 选型里点名的包；不装被否方向的包 |
| 启动沙盒 VS Code | 一次性 `--user-data-dir`、`--extensions-dir` 目录 | 只启本流程自建的实例，不碰用户既有的 VS Code 进程与配置 |
| 终止自建的沙盒 VS Code | 本流程记录的那个实例 PID | 只按 PID 终止自己启动的实例；不按进程名杀，不碰其他实例 |

expiry：随本次 goal 循环，不跨启动。越出三字段任一即按缺授权处理。

## 决策

- **D1 不实现 `3 运行`。** 插件只读不执行：`3a`–`3d` 没有文件语法（`spec.md`「运行时与文件」），本仓也不产生运行态。概念保留，代码不落地。
- **D2 解析器手写递归下降。** 依据 `spec.md` 选型与初步 insight 2；不引 langium、chevrotain。
- **D3 布局只取 d3-dag，渲染自绘 SVG。** 依据初步 insight 1；不引 mermaid。
- **D4 被否：`CustomTextEditorProvider`。** 预览必须并排可见，自定义编辑器接管文本区就做不到并排。
- **D5 被否：锁定预览。** 不做，`docs/concrete-insight.md`「不采用」。
- **D6 被否：侧栏 webview 视图充当预览。** 侧栏承载视图不承载编辑器内容，位置与并排要求冲突。
- **D7 不变式与验收判据不单独落地。** 文件里没有这两个键，它们写在 `destination` 的句子里，机器不解析——`2c3`、`2c4` 是概念层的分法，不是字段。
- **D8 沙盒宿主用 `@vscode/test-electron`。** 它自带下载与隔离目录，起的是真实例、有窗口，可按 PID 终止；不用本机装好的那一套，避免污染用户配置。
- **D9 观测走输出通道，不靠截图。** 每条剧本的断言读扩展自己写进输出通道的记录（模型 JSON、坐标 JSON、provider 结果），截图只作佐证，不作为判据。
- **D10 本轮交付面止于 P4。** 授权轮次 5 轮，阶段即轮次边界，P0–P4 各占一轮；P5 与剧本 S7 不在本轮范围，S7 未跑即不产生轮次判定，记在「覆盖缺口」。阶段内的 S1–S6 仍按映射剧本跑。
- **D11 「退出码 0」指脚本自身。** 实测沙盒实例被 SIGTERM 收掉时关闭码为 1、信号为空，实例退出码不能作判据；收尾把实例的 `code` 与 `signal` 记入证据，判据留脚本。
- **D12 断头节点按出边判。** `spec.md` 与 `concepts.md` 原写「非根节点没有入边」，与样板 `diagnostics: []` 冲突：照字面判，任何非单点 DAG 的图首都是缺陷，等于禁止一切多节点图。断头读作断头路，判据改为「非根节点没有出边」——后置条件的产物交不出去；两份文档已同步改词。
- **D13 断头节点连根节点唯一性一起管。** `2a1` 要求「一张图恰有一个根节点」，五条判据的封闭列表里没有它；并入断头节点（产物交不到唯一的根：非根无出边，或根不止一个）而不新增第六条，`spec.md` 与 `concepts.md` `2d` 同步补这一句。
- **D14 逐行角色由解析器一并产出。** spec 要求三样编辑器能力共用解析器产出的树，而 P2 原定「不改解析」；实现改为 `parse()` 多交一份 `lines`（行形态与区归属），判定逻辑不动，编辑器三样只消费它，不再自行判区。
- **D15 布局取 d3-dag 的分层与层内次序，坐标自己算。** 实测 d3-dag 的 `sugiyama` 把层距定成 `nodeSize + 1`，样式区的 `gap` 就落不成整数格；改为只取它的层归属与层内 x 次序，层距与格宽按 `gap`、`160×56` 自己算。仍是只引 d3-dag，不另起分层算法。
- **D16 折叠态只画名字与种类，展开态把契约分区画进框内。** `6` 要求节点契约成框内分区，`docs/concrete-insight.md` 的坐标又钉死 `160×56`；spec 的渲染选型写的是「可展开的契约卡片」。折叠态保持 160×56 只画名字与种类，坐标与样板逐条相同；展开态把 `path` 与 `destination` 按框宽折行后画在框内的分隔线下，节点高度按行数撑开，层距取层内最高的那个。所以展开是**布局输入**而不是纯渲染：状态留在宿主，重排后整份重发。
- **D17 渲染层换成手写 Canvas 2D，辅助 UI 用原生 DOM。** 目标是自由相机与可控绘制循环：浮层、缓动、任何"动"的东西在 SVG 上都要逐元素加属性，在 Canvas 上是同一个变换矩阵。选型判据不是体积而是**不可让渡的资产是宿主侧几何**（`layout`/`payload`/`gesture`/`viewport`，单测钉着），因此渲染器必须是一层薄壳：手写 Canvas（0 依赖），不引 Konva（对象模型会同化几何）、不引 PixiJS（76MB / 10 依赖的 GPU 管线，几十节点用不上）、不引 Cytoscape（自带布局与样式，会和 DSL 与五条判定形成两套真源）。
  辅助 UI（缩放控件、正文浮层、缺陷清单、HUD）用原生 DOM 加一层薄工具，不引框架；理由是我们的 chrome 只有十来个节点，框架换来的是组件复用与 diff，一样用不上。**升级触发条件**：出现①浮层超过 3 个且互斥嵌套、②需要可编辑表单、③需要列表虚拟滚动，任一即换 Lit 3.3（5.9KB gzip，模板字面量不 eval，与现有 CSP 相容）。明确拒绝 Alpine 与 petite-vue（`new Function` 与 `script-src 'nonce-'` 冲突，且都已停更）。
  分工铁律：**DOM 不发几何，Canvas 不存状态**；`viewState` 只有一份，Canvas 每帧读它画，DOM 订阅它画控件，几何只由宿主 payload 决定。
  代价：文本不可选、不可 Ctrl+F、读屏读不到图；补偿是把契约正文放进 DOM 浮层（可选中、可查找），编辑器本体就在旁边。


## 评审轴

基线两轴之外登记一条域维度：

| name | description | websearch |
|---|---|---|
| `webview-sandbox` | webview 的 CSP、`postMessage` 协议边界、资源加载来源；只判代码里看得见的面 | false |

P0–P3 尚无 webview，该轴在这四轮判不出内容，只跑基线两轴。

## 阶段

### P0 沙盒宿主与扩展骨架

- 状态：done
- 改动面：`package.json`、`tsconfig`、`esbuild` 脚本、`src/extension.ts`、`test/e2e/host.ts`；无解析逻辑
- 验收：沙盒宿主起来后执行 `contractdag.dump`，输出通道出现一行 `activated`，脚本随后按 PID 终止该实例，脚本退出码 0
- seams：`activate(context)`、命令 `contractdag.dump`、宿主启动与终止脚本
- 映射剧本：S1
- 预估：2 轮

commits：

1. `chore: 扩展骨架`——`package.json`（`engines`/`main`/`activationEvents`/`contributes`）、`tsconfig`、esbuild 宿主侧 bundle
2. `feat: 激活与命令`——`contractdag.dump` 写一行记录到输出通道
3. `test: 沙盒宿主`——`@vscode/test-electron` 启动、记录 PID、按 PID 终止、退出码

- 实落 commit：`f886fa4`（骨架）、`22935f7`（激活与命令）、`e97cdaa`（沙盒宿主）、`e91bdbb`（记录不被 payload 覆盖）、`b0e7a8b`（收尾记录关闭码）
- fixedPoint：`1de211f`
- e2e：S1 通过——宿主管家六项检查全过（`activated`、`dump`、`suite-ready`、无 `suite-error`、按 PID 终止、观察到实例已关闭），复用缓存后 2.3s 起停，脚本退出码 0
- findings：standards 轴一条判断（payload 能覆盖 `event`），已修并加用例；spec 轴一条硬（把「退出码 0」判给实例），实测实例被 SIGTERM 收掉时关闭码为 1，判据指脚本，已改本段措辞并把关闭码与信号记入证据
- consistency：代码与 spec 一致；本阶段无解析器，未出现解析器触碰文件系统或时钟

### P1 文法、模型与判定

- 状态：done
- 改动面：`src/syntax`、`src/model`、`src/parser`、`src/defects`、`test/unit/`；无 VSCode 依赖
- 验收：`pnpm test` 合法样例产出四条节点、三条连线、零缺陷，每类文法错误与五条结构缺陷各有一个用例判得出来；沙盒里对样例执行 `contractdag.dump` 打出同一份模型 JSON
- seams：`parse(source: string) -> { model, diagnostics }`
- 映射剧本：S2
- 预估：2 轮

commits：

1. `feat: 文法词法`——三区标签、`[名字:种类]` 表头、`键 = 值`、多行值 `[ ]`、连线 `[[源 -> 目的]]` 与对象 `{ }`、样式三句、`#` 注释
2. `feat: 契约模型类型`——节点、连线、产物属性、缺陷
3. `feat: 解析器`——按区两遍：节点表读完再解连线
4. `feat: 五条判定`——环、产物名重复、断头节点、变更节点缺 `path`、坏名字
5. `feat: 模型 dump`——`contractdag.dump` 输出模型 JSON
6. `test: 文法与判定用例`——合法样例、每类文法错误、五条缺陷

- 实落 commit：`d658c59`（模型类型）、`97e6aa2`（文法词法）、`01914ae`（五条判定）、`7ffea0b`（解析器）、`1cb1c9c`（模型 dump 与 S2 剧本）、`d466f8a`（用例）、`65ed865`（校验归解析器、端点键）、`39bee33`（断头含根节点唯一性）
  顺序与计划不同：判定先于解析器落（解析器要引用 `inspect`），模型类型连带对外 dump 形状一起落
- fixedPoint：`b0e7a8b`
- e2e：S2 通过——沙盒里打开样例、`contractdag.dump` 打出与 `docs/concrete-insight.md` 逐字段相同的 JSON，剧本五项检查全过；修正后复跑仍过
- findings：standards 轴两条硬（`syntax.ts` 越出词法层去做值校验；dump 里 `from`/`to` 可被自由键顶掉）与一条判断（注释用例的 `replace` 不命中），已分别改为值校验归解析器、端点键判 `reserved-key`、用例真插注释；spec 轴一条硬（`2a1` 的唯一根节点未校验而计划声称承接）+ 两条判断（D12 站得住；`2d` 四类与 spec 五条的分层表述），已并入断头节点（D13）并补两份文档
- consistency：`spec.md`「断头节点」与「五条判据」的分层说明、`concepts.md` `2d` 与实现一致；`2a1` 的唯一根节点现由断头节点判定承接

### P2 编辑器支持

- 状态：done
- 改动面：`package.json` 的 `contributes`、`src/editor`；只读 P1 的树，不改解析
- 验收：沙盒里打开样例，输出通道打出三样——着色 token 数、可折叠区间数、光标处的补全候选，且候选里出现 `artifact` 与已声明节点名
- seams：`contributes.languages`、`contributes.grammars`、`DocumentSemanticTokensProvider`、`FoldingRangeProvider`、`CompletionItemProvider`
- 映射剧本：S3
- 预估：2 轮

commits：

1. `feat: 语言注册`——`.contractdag`、`contract-dag`、`displayName`
2. `feat: TextMate 文法`——四类行各一条规则
3. `feat: 语义 token`——用 P1 的树覆盖着色
4. `feat: 折叠`——按区与块给区间
5. `feat: 补全`——按光标所在区给候选：种类值、键名、已声明节点名、样式键
6. `test: provider 观测命令`——把三样结果写进输出通道

- 实落 commit：`8437063`（语言注册与 TextMate 文法）、`f68d1d8`（着色、折叠与补全）、`6475777`（provider 注册与观测命令）、`6c5b5ac`（逐行角色归解析器）、`1df5ea9`（补全按行角色判）
  commits 1 与 2 合并：`contributes.grammars` 指向的文法文件不能先于注册落下，硬拆会留下指不到文件的提交
- fixedPoint：`39bee33`
- e2e：S3 通过——沙盒里样例的语言标识为 `contract-dag`，`contractdag.inspect` 打出 `tokens 52`、`folds 9`，连线表头处补全给出四个节点名、连线体处给出 `artifact`；改构后复跑 S2、S3 仍过
- findings：standards 轴一条判断（剥 BOM 会让列偏移少 1），已改为不剥并加用例；spec 轴一条硬（编辑器层由 `scanLines` 自建逐行判区，没共用解析器的树）已按 D14 改构，另两条判断——补全精度与承接核对；复核两轴均无硬，补全余下那条判断已改为按行角色判
- consistency：`Analysis.lines` 成为着色、折叠、补全的唯一来源；`spec.md`「编辑器支持」与实现一致

### P3 图布局

- 状态：done
- 改动面：`src/layout`；纯计算，无 VSCode 依赖
- 验收：样例算出的坐标等于 `docs/concrete-insight.md` 的 `x 80`、`y 24·100·176·252`；沙盒里 dump 出同一份坐标 JSON
- seams：`layout(model, options) -> Map<nodeName, {x, y, w, h}>`
- 映射剧本：S4
- 预估：1 轮

commits：

1. `feat: 分层`——d3-dag 取层，`direction` 映射上下或左右
2. `feat: 间距与尺寸`——`gap`、`160×56` 落在选项里
3. `test: 坐标快照`——样例与一条分叉样例

- 实落 commit：`bd707e6`（图布局）、`6c4bee9`（布局命令）、`f1d7dd8`（坐标快照与 S4 剧本）、`70c430e`（分层按阈值切）
- fixedPoint：`1df5ea9`
- e2e：S4 通过——沙盒里对样例执行 `contractdag.layout`，四格坐标 `80,24`、`80,100`、`80,176`、`80,252` 与尺寸 `160×56` 逐条对上；S1–S3 复跑仍过
- findings：standards 轴一条硬（拿浮点 `y` 相等当同层分组键，层距有微差就会裂层），已改为按层距一半的阈值切层，坐标结果不变；spec 轴无意见
- consistency：`6a` 的目标（上游恒在下游之前、交叉尽量少）由分层与层内次序承接；`direction` 与 `gap` 都进入最终坐标

### P4 预览面板

- 状态：done
- 改动面：`src/panel`、`media/`；首个引入 webview 的阶段
- 验收：沙盒里执行预览命令后右侧相邻组出现 webview，webview 回报的握手消息里节点数为四；改一个节点名后 300ms 内回报的模型里节点名已变
- seams：`openPreview(document, column)`、`postMessage({type, payload})` 协议
- 映射剧本：S5、S6
- 预估：3 轮

commits：

1. `feat: 面板`——`ViewColumn.Beside` 开格、切走不销毁、重开复位、CSP
2. `feat: 渲染`——节点卡片、边与产物标签、样式区映射到 SVG 属性
3. `feat: 刷新`——文档变更即重算并重发模型；文法错误时保留上一张图
4. `feat: 双向定位`——点框回文本行，光标所在节点框高亮
5. `feat: 握手记录`——webview 回报渲染摘要，供剧本断言

- 实落 commit：`f905f32`（面板数据与 HTML 骨架）、`3a5afee`（预览面板与渲染脚本）、`b4aab69`（预览命令、双向定位与 S5/S6 剧本）
  commits 1–5 按文件面并成三刀：数据与 HTML / 面板与脚本 / 命令与剧本，五条改动面同在这三个文件里，硬拆只能靠拆行
- fixedPoint：`70c430e`
- e2e：S5 通过——预览命令在相邻组开出 webview，脚本加载后回报 `nodes 4`、四个节点名、`render` 记录 `nodes 4 edges 3`；S6 通过——改名后 98ms 回报新模型，合成点击把光标带回第 2 行，光标所在节点在图上高亮
- findings：spec 轴一条硬（`6` 要求节点契约成框内分区，面板只画了名字与种类），按 D16 改为折叠态 160×56、展开态画 `path` 与 `destination`，S6 加「展开后契约分区画出三行以上」；webview-sandbox 轴两条判断（`style-src` 放行 `cspSource` 但只有内联样式、`state` 消息未校验结构），已收窄 CSP 并按约定字段收；standards 轴无意见
- consistency：`7` 的并排、重画、切走不销毁、不承载可写状态都有代码对应；`2d` 的结构缺陷阻断更新由 `buildPreviewPayload` 返回 undefined、面板发 stale 并保留上一张图承接

### P5 端到端

- 状态：done
- 改动面：`test/e2e/` 的剧本与宿主管家；不改产品代码
- 验收：全流程剧本 S7 一遍过、无卡点；沙盒按 PID 收掉，临时目录清空
- seams：`pnpm e2e`、`test/e2e/scenarios/`
- 映射剧本：S7
- 预估：2 轮

commits：

1. `test: 全流程剧本`——开工作区、写样例、开预览、改名、点框回跳
2. `test: 宿主管家`——超时逐级、卡点记录、PID 终止、临时目录清理
3. `test: 多形态样例`——分叉、合并、文法错误、五条缺陷各一份

- 实落 commit：`a2558e1`（剧本拆成一幕一文件）、`1001df1`（全流程剧本与宿主管家）、`a7f68f6`（多形态样例）、`8fbd20c`（S7 顺带验激活事件）、`c90e461`（表头兜底、缺陷样例一测一条）、`48f63cd`（收尾算判据、写真列号）
  commits 1 与 2 合并：S7 与管家的改动都落在 `test/e2e/` 同一批文件上，拆开只能靠拆行
- fixedPoint：`cbebb90`
- e2e：S7 通过——十四项检查全过，改名到重画 91–98ms，`tabGroups` 里文本第 1 列、预览第 2 列，关掉后 webview 标签归零；`cleanup: done` 且「临时目录已清空」本身也是判据；沙盒按 PID 收掉；S1–S6 复跑仍过。独立上下文的剧本 agent 在同一提交上复跑一次，结论一致
- findings：spec 轴一条硬（临时目录清空只做了动作、没进 PASS 判据），已改成「先清、清干净才算过，没过就留现场」；另两条判断——S7 只验了相邻组没验精确列号（已改断言第 1/2 列）、通盘承接核对（无缺口）；standards 轴无硬，两条判断（表头找不到仍用负行号建选区、五条缺陷挤在同一用例）已改成提前收与一条一测
- consistency：`concepts.md` 二十五个概念与 `spec.md` 九条决策逐条指到阶段或 seam，未承接的只剩 D1（运行 3/3a–3d）与 D7（2c3/2c4）

## 端到端

e2e = 任何非单元测试且需启动整个程序的过程，这里的载体只有沙盒宿主。剧本跑「用户会怎么用」，不按 provider 写。

S1–S6 是阶段性观测，逐阶段挂上；S7 是整条用户路径，只有它进轮次判定。

| id | 目的 | 步骤 | status |
|---|---|---|---|
| S1 | 宿主起得来、命令跑得通 | 起沙盒 → 执行 `contractdag.dump` → 读输出通道 → 按 PID 终止 | passed |
| S2 | 样例解析成模型 | 打开 `deploy.contractdag` → `contractdag.dump` → 断言 4 节点 3 连线 0 缺陷 | passed |
| S3 | 编辑器三样可观测 | 打开样例 → 光标停在节点头 → 断言 token 数、折叠区间数、补全候选含 `artifact` 与节点名 | passed |
| S4 | 坐标与样例一致 | dump 坐标 → 逐条比对 `x 80`、`y 24·100·176·252` | passed |
| S5 | 预览出图 | 执行预览 → webview 握手 → 断言节点数 4 | passed |
| S6 | 编辑即重画、点框回跳 | 改一个节点名 → 断言 300ms 内新模型 → 点框 → 断言光标行号 | passed |
| S7 | 用户整条路径 | 见下 | passed |

S7 的十四步，全部落在 VS Code 的可见状态上，不靠截图：

1. 沙盒开在一个临时工作区上，工作区里有 `pipeline.contractdag`
2. 打开它，语言标识是 `contract-dag`
3. 打开即激活：`isActive` 为真（这一幕不手动 `activate()`，验的是 `onLanguage` 事件）
4. 执行预览命令
5. 图先画出来：`preview-state` 回报四节点三边、`viewBox 0 0 320 388`
6. 文本在第 1 列、预览在第 2 列（读 `tabGroups`）
7. 预览开在文本右侧（列号比文本大）
8. 把 `上线安装节点` 改成 `上线安装`
9. 300ms 内回报的模型里节点名已变（实测 91–98ms）
10. 点框：合成点击送进 webview，由它自己回报 `reveal`
11. 光标落在该节点的声明行（第 19 行）
12. 再开一次预览：仍只有一格（复用而非新开）
13. 关掉预览：`tabGroups` 里不再有 webview 标签
14. 关掉编辑器：可见编辑器清空；随后沙盒按 PID 收掉、临时目录清空

- 轮次：`scenarioRuns` 全 `done` 即本轮结束；S7 未过就开下一轮，过了即收尾。
- 卡点三条：无法观测、无法调用、调用超时；任何超时都不算一遍过。
- 超时最小且尽快触发，禁 sleep；timeout 回写剧本。

## 覆盖缺口

初建时为空。逐条承接：

- P0 承接 spec 的「构建」与「解析位置」前置（宿主侧 bundle、扩展可激活）
- P1 承接 `1`、`1a`、`2`、`2a`、`2a1`–`2a4`、`2b`、`2c`、`2c1`、`2c2`、`2d`、`4`、`5`（产出侧）
- P2 承接 `5`（编辑器侧呈现）
- P3 承接 `6a`
- P4 承接 `6`、`7`
- `3`、`3a`–`3d` 由 D1 显式不做；`2c3`、`2c4` 由 D7 显式不做
- S7 已随 P5 跑通（十四项检查），此条缺口关闭；D10 的「本轮止于 P4」随授权放宽作废

## e2e 轮次

轮次 1（P5 收尾）：

- `scenarioRuns`：S1–S7 全部 done
- `blockers`：无（首跑 S7 时「关掉后不留 webview 标签」失败，是面板销毁后标签异步消失、断言没等，已在剧本里改成等到条件成立，不算卡点）
- `conclusion`：S7 一遍过、无卡点；沙盒按 PID 收掉；临时目录已清空，且这一项本身纳入判据

轮次 2（实际安装后修的三个硬伤）：

- 触发：装进本机 VS Code 后实测，展开的契约分区画在 `rect` 外面，压住下一层节点与边标签；边标签没有描边垫底；命令只在命令面板里，编辑器标题栏没有按钮。
- 修法：展开状态从 webview 移到宿主，`layout()` 收 `heights` 选项，层距按层内最高节点算；正文在宿主折行（半角列宽 26）后画进框内；边尾提前 7px 给箭头让位，标签加 `paint-order: stroke` 垫底；`package.json` 补 `editor/title` 与 `commandPalette`，都按 `resourceLangId == contract-dag` 收窄，附亮暗两套图标。
- `scenarioRuns`：S1–S7 逐个复跑（宿主一次只演一个剧本，不是 `pnpm e2e` 一把过），9 + 10 + 10 + 10 + 11 + 13 + 13 = 76 项检查全过。
- 单测：56 → 62（新增可变高布局、同层最高定层距、展开撑高、正文折行不超列宽、边从展开节点下沿出发）。
- 折叠态坐标未动：样板仍是 `320×388`，S7 的 `viewBox` 判据原样通过。
- `blockers`：无。

轮次 3（视口与实现层文档）：

- 输入：面板缺缩放与拖动；滚动与缩放要有延迟阻尼；`direction` 要收 mermaid 的 `TD`；按 `docs/*.md` 的定位拆三份实现层文档。
- 落法：新增 `src/panel/viewport.ts` 承纯计算（比例钳制、锚点缩放、滚动钳制、适配、步进、密度分档、指数逼近）；webview 改成「视口 + 变换」模型，`viewBox` 恒为内容坐标系、元素像素尺寸按比例给，缩放不动坐标；阻尼 0.18 每帧，滚动与比例共十二帧收九成；拖动直接跟手不阻尼；`TD` 在解析器归一为 `TB`。
- 判据：4px 位移以内算点击（仍跳编辑器），超过算拖动。
- 三份文档：`docs/graph-layout.md`（模型 + 高度 → 坐标、层距、方向、端点）、`docs/panel-ui.md`（三层状态、节点与正文排版、密度、缩放边界、阻尼）、`docs/vscode-integration.md`（面板列与复用、CSP、命令与菜单、输入映射）。切缝按「输入 / 呈现 / 几何」，同一事实只在一份完整陈述，另两份留指针。
- `scenarioRuns`：S1–S7 逐个复跑，76 项检查仍全过；折叠态 `viewBox` 未变。
- 单测：62 → 71（视口纯计算八条、`TD` 归一一条）。
- 装本机：0.0.3，`examples/pipeline.contractdag` 已开窗。
- `blockers`：无。

轮次 4（双指滑行手感）：

- 现象：装本机后双指滑行"没做好感觉"。
- 根因两条：① 适配取两个方向的较小比例，内容永远恰好装进视口，可滚距离恒为 0（实测 600×800 视口下 12 节点图可滚 0px），滚轮无处可去；② 滚轮把增量累到目标再逐帧逼近，等于在触控板自带的惯性上再叠一层，表现为滑不停、停不准。
- 修法：初始比例改成适配宽度（宽度贴合、不放大、高度超出交给纵向滚动）；滚轮与拖动直接改滚动量并即时 applyView，`targetScroll` 整套删掉；缓动只保留给缩放与适配按钮。
- 验证：单测 71 全过（适配宽度那条新增"高图必须留下可滚距离"断言）；S5–S7 复跑 11 + 13 + 13 全过。
- 装本机：0.0.4。
- `blockers`：无。

轮次 5（两个方向都滑不动）：

- 现象：双指横向、纵向都滑不动，不是手感问题。
- 根因：适配宽度让内容宽度恰好等于视口宽度，`clampScroll` 的上界按 `内容 - 视口` 算，于是横向可滚 0px；高度方向在同一比例下也装得下，纵向同样 0px。手势全被钳死。
- 修法：① 滚动范围改成「内容 + 每个方向半个视口余量」，下界允许为负；② 平移改用 `transform: translate` —— `scrollLeft` 不接受负值，负向那一半余量会直接失效。
- 验证：单测 71 全过（滚动余量那条新增负值断言与"内容小于视口仍可滑"断言）；S1–S7 复跑 76 项全过。
- 装本机：0.0.5。
- `blockers`：无。

轮次 6（双指滑行仍无位移，靠记录定位）：

- 现象：0.0.5 装好后双指上下、左右滑仍然完全没有位移。
- 取证：0.0.6/0.0.7 把 `wheelEvents`、`lastDeltaX/Y`、`scrollX/Y`、`viewport` 与内容尺寸写进 `records.jsonl`。记录给出三条硬事实——`wheelEvents` 从 24 涨到 539（事件确实进来）、`lastDeltaY` 有 -22/64 等真实增量、`scale` 从 79 变 226 后到 50（Ctrl+滚轮缩放正常），而 `scrollX/scrollY` 恒为 -1。
- 定位：`-1` 是宿主侧"不是数字"的兜底值。渲染侧算出的位移是 NaN，`JSON.stringify` 把 NaN 写成 `null`，`typeof null` 不是 number，于是落成 -1。NaN 的来源是类型不一致：`clampScroll` 与 `anchorScroll` 返回 `{scrollX, scrollY}`，调用方按 `{x, y}` 读，第一次钳制后 `scroll.x` 变 `undefined`，其后全是 NaN；`transform: translate(NaNpx, …)` 是非法声明，浏览器整条丢掉，画面纹丝不动。缩放不受影响，因为 `scale` 是独立变量，不经过钳制。
- 为什么没被类型检查挡住：`tsconfig.json` 的 `include` 只有 `src/test/scripts`，`media/` 从来没进过 typecheck。
- 修法：位移统一成 `Offset = {x, y}`（`clampScroll`、`anchorScroll` 一起改），`include` 加上 `media`——加上后 tsc 立刻报出同一处不匹配；渲染侧加 `finiteOffset` 兜底，出现非有限数就复位并回报 `preview-probe`，不再静默写出 NaN。
- 验证：单测 72 全过（新增非有限数判定一条）；S5–S7 复跑 11 + 13 + 13 全过。
- 装本机：0.0.8。
- `blockers`：无。

轮次 7（点击失效，并为两个 bug 补测试）：

- 现象：0.0.8 滚动正常，但点节点不再把光标带回声明行。
- 根因：`pointerdown` 一开始就 `setPointerCapture`，指针捕获激活后 `click` 被派发给捕获元素（视口），节点的 click 监听器收不到。S7 用的是 `requestClick` 合成长消息，绕过了 DOM，所以 e2e 一直没抓到。
- 修法：捕获改到「判定成拖动之后」才设，单击全程不经过捕获；click 的抑制改用一个手势标记。新增 `src/panel/gesture.ts`（纯判定：`beginPointer`/`movePointer`/`isDrag`/`isClick`/`clickSlop`）与 `viewport.ts` 的 `panBy`（位移的唯一入口）。
- 补测试：单测 72 → 77，新增 `gesture.test.ts` 四条（原地松开、阈值内手抖、越界后不回落、斜向按直线距离）与 `panBy` 的「滚轮一步真的产生位移且始终有限」一条；S6 加三条端到端检查——`contractdag.wheel` 合成滚轮、`preview-state.scrollY > 0`、位移回报是数字而非兜底 `-1`。
- 装本机：0.0.9。
- `blockers`：无。

轮次 8（斜边箭头错位）：

- 现象：截图里斜着进来的边，箭头三角形和线错开一个夹角，尖端也落到框边之外。
- 根因：`arrowHead` 只在「竖直 / 水平」里二选一，而宿主的线尾也只按布局方向那一轴回退 7px。相邻两层的框不在同一列时连线是斜的，两者都对不上角度。
- 修法：箭头几何移到宿主，`arrowGeometry` 用单位方向向量算尖端、底边中心与两翼（法线半宽 4），线尾取底边中心；`PreviewEdge` 带 `arrow` 六个数，渲染侧只负责画多边形。
- 验证：单测 77 → 79（斜边尖端贴框边且两翼到连线距离为 4；竖直边几何保持不变）；S5–S7 复跑 11 + 14 + 13 全过。
- 装本机：0.0.10。
- `blockers`：无。

轮次 9（待做：Canvas 迁移，按 D17）：

1. `src/panel/scene.ts`：`payload + viewState → 图元列表`（矩形 / 路径 / 文字 / 标签），纯函数；单测断言"与 0.1.0 画的是同一批位置"。
2. `src/panel/hit.ts`：内容坐标 → 命中节点或角标，纯函数；单测覆盖边界与重叠。
3. Canvas 渲染器（`media/`）：DPR 处理、全量重绘、`ctx.setTransform` 承接相机；SVG 路径下线。
4. DOM 层（`media/ui/`）：原生 DOM + 薄工具；缩放控件、正文浮层、缺陷清单、HUD。正文从节点里搬出来，节点不再因展开撑高——这一条同时解掉遮挡与视图跳动。
5. 缺陷标记进图：环=红边、断头=灰节点、重名产物=角标。
6. 交互重建：命中（复用 `hit.ts`）、拖动与滚轮（复用 `viewport.panBy`）、缩放锚点、点击跳声明行（复用 `gesture` 判定）。
7. e2e 收口：七个剧本保留；`requestClick`/`requestExpand` 改走命中路径；新增画布尺寸与 DPR 的记录。

- 验收：单测 ≥ 100 且 scene/hit 两条纯函数被覆盖；S1–S7 全过；折叠态样板坐标不变；`viewBox` 判据改为画布尺寸判据。
- 已知代价：文本不可选、不可 Ctrl+F、读屏读不到图；正文进 DOM 浮层后可选可查。
- `blockers`：无。
