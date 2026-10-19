# vscode-contractdag-preview — Concrete Insight

以一份 `deploy.contractdag` 把 文本 → 解析 → 模型 → 坐标 → 面板 这条链具体化。

## 总览

```
  ┌───────────────┐     ┌─────────────────────┐
  │ 契约声明文件  │ 含  │ 节点契约            │
  │ 契约文法      │────▶│ 前置 后置 不变式    │
  │ 节点 节点契约 │     │ 验收 停止 授权 回滚 │
  └───────┬───────┘     └─────────────────────┘
          │ 读作
     ┌────▼────┐
     │ 解析器  ├── 判出 ──────┐
     └────┬────┘              │
          │ 建出              │
┌─────────▼─────────┐   ┌─────▼─────┐
│ 契约模型          │   │ 诊断      │
│ 节点 根 查询 变更 │   │ 结构缺陷  │
│ 依赖边 前沿       │   └─────┬─────┘
└─────────┬─────────┘         │
          │ 定位              │
   ┌──────▼───────┐           │
   │ 图布局 坐标  │           │
   └──────┬───────┘           │
          │ 定形              │
          ├───────── 标注 ────┘
          │ 合流
     ┌────▼────┐
     │ 图视图  │
     └────┬────┘
          │ 送达
    ┌─────▼─────┐
    │ 预览面板  │
    └───────────┘
```

## 样板册

> 全文出现的具体名称、数值都收在这一节里，正文禁止使用其他未声明数据。

deploy.contractdag
root · build · verify · install
src-tree · build.tar · verify-report · env-ready
/srv/app/build · /srv/app/live
4 nodes · 3 edges · 2 change · 1 query
x 80 · box 160×56
y 24 · 100 · 176 · 252
编辑区 720 · 预览区 640

## 这个位置本来怎么用

```
┌────────────────────────┬────────────────────────┐
│ deploy.contractdag     │ Contract DAG Preview   │
│                        │                        │
│                        │                        │
│                        │                        │
└────────────────────────┴────────────────────────┘
           720                        640
```

```
 文本编辑器                              预览面板
     │                                      │
     ├──── 开预览 ──────────────────────────▶ 右侧相邻组开一格
     │                                      │
     ├──── 每次编辑 ────────────────────────▶ 整张图重画
     │                                      │
     ├──── 切到别的标签 ────────────────────▶ 退到后台，不销毁
     │                                      │
     └──── 切回来 ──────────────────────────▶ 从上次的页面复原
```

```
沿用
├─ 开在相邻编辑器组，与文本并排
├─ 编辑即重画
└─ 切走不销毁，切回复原
改写
├─ 滚动同步 → 点节点跳到声明处
└─ 当前行标记 → 光标所在节点的高亮
不采用
└─ 锁定预览
```

§预览面板只能挂在编辑器组里，侧栏承载的是视图，不是编辑器内容。

## 一份声明文件长这样

```contractdag
root require env-ready

node build change
  require   src-tree
  ensure    build.tar
  authority /srv/app/build
  stop      3 attempts
  rollback  rm -f /srv/app/build/build.tar

node verify query
  require   build.tar
  ensure    verify-report

node install change
  require   verify-report
  ensure    env-ready
  authority /srv/app/live
  stop      1 attempt
  rollback  restore snapshot-0412
```

§变更节点缺一行配套，这份文件就不是合法的 §契约声明文件。

## 解析把它读成什么

```json
{
  "nodes": [
    {"id": "root", "kind": "root", "require": ["env-ready"]},
    {"id": "build", "kind": "change",
     "require": ["src-tree"], "ensure": ["build.tar"],
     "authority": ["/srv/app/build"], "stop": "3 attempts",
     "rollback": "rm -f /srv/app/build/build.tar"},
    {"id": "verify", "kind": "query",
     "require": ["build.tar"], "ensure": ["verify-report"]},
    {"id": "install", "kind": "change",
     "require": ["verify-report"], "ensure": ["env-ready"],
     "authority": ["/srv/app/live"], "stop": "1 attempt",
     "rollback": "restore snapshot-0412"}
  ],
  "edges": [
    {"from": "build", "to": "verify", "artifact": "build.tar"},
    {"from": "verify", "to": "install", "artifact": "verify-report"},
    {"from": "install", "to": "root", "artifact": "env-ready"}
  ],
  "diagnostics": []
}
```

§依赖边不是画的，由产物名对上：`build.tar` 既是 `verify` 的§前置条件，也是 `build` 的§后置条件；`verify-report` 与 `env-ready` 同理。

## 布局算出哪些坐标

```text
build     x 80  y 24   160×56
verify    x 80  y 100  160×56
install   x 80  y 176  160×56
root      x 80  y 252  160×56
```

```
┌──────────────┐
│ build        │  24
│ change       │
└──────┬───────┘
       │ build.tar
┌──────▼───────┐
│ verify       │  100
│ query        │
└──────┬───────┘
       │ verify-report
┌──────▼───────┐
│ install      │  176
│ change       │
└──────┬───────┘
       │ env-ready
┌──────▼───────┐
│ root         │  252
│ root         │
└──────────────┘
```

§图布局把上游恒排在下游之上，所以四格等距竖排、三条边都是垂直线——这份声明里没有分叉，布局退化成一条链。

## 面板挂在哪个编辑器组

```
┌────────────────────────────┬─────────────────────────┐
│deploy.contractdag          │ ┌──────────────┐        │
│                            │ │ build        │        │
│ root require env-ready     │ │ change       │        │
│                            │ └──────┬───────┘        │
│▸ node build change         │        │ build.tar      │
│   require   src-tree       │ ┌──────▼───────┐        │
│   ensure    build.tar      │ │ verify       │        │
│   authority /srv/app/…     │ │ query        │        │
│   stop      3 attempts     │ └──────┬───────┘        │
│   rollback  rm -f /sr…     │        │ verify-report  │
│                            │ ┌──────▼───────┐        │
│ node verify query          │ │ install      │        │
│   require   build.tar      │ │ change       │        │
│   ensure    verify-report  │ └──────┬───────┘        │
│                            │        │ env-ready      │
│ node install change        │ ┌──────▼───────┐        │
│   require   verify-report  │ │ root         │        │
│   ensure    env-ready      │ │ root         │        │
│   authority /srv/app/live  │ └──────────────┘        │
│   stop      1 attempt      │                         │
│   rollback  restore sn…    │                         │
│                            │                         │
└────────────────────────────┴─────────────────────────┘
```

`▸` 落在 `build` 的声明行上，§图视图里 `build` 的框同步高亮；反过来点那个框，光标回到 `▸` 那一行。两侧靠同一张「§节点 ↔ 声明区间」的表互查，这张表 §解析器 产出 §契约模型 时已建好，§诊断 也用它。
