# Ideas

> 原始想法记录，后续逐步展开。

生成一个 VSCode 插件，可以 preview：我们声明一个 dag，只需要编辑这个文件，右侧看到 dag 的形态即可。

我希望你帮我生成一个vscode插件，可以preview，这个放到cyperpunk 里面吧先起一个名称，功能很简单，就是我们声明一个dag，扩展名，我们只需要编辑这个，右侧看到dag的形态即可。

——「wish 有没有太简单了？ 我们是DbC？」

这不是一个通用的 DAG 画图器，画的是**每个节点带 DbC 契约的 DAG**：节点用 `require` / `ensure` / `invariant` 声明它对上游的要求和它向上游的保证，文件本身是一份契约书，preview 是这份契约书的形态。

## 命名

| 属性 | 值 |
|------|-----|
| 目录 | `cyberpunkedgerunners/vscode-contractdag-preview` |
| 文件后缀 | `.contractdag` |
| 语言 ID | `contract-dag` |
| displayName | `Contract DAG Preview` |
