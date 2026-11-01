# Issues

> append-only：本文件 issue 条目只追加到文件末尾，每 issue 内段落只追加到段落末尾。
> 查看/修改 此文件 前请 invoke [[issue-lifecycle]]。

## #1 Expose the parser as a library independent of VS Code (2026-11-01) — fixed

The parser is available internally, but the published package entry targets the VS Code extension rather than a supported parser library. Non-editor consumers need to reuse the authoritative parser without copying its grammar or starting VS Code. Expose a documented library entry that returns the parsed model and diagnostics, including source locations, independently of editor activation; document distribution, compatibility guarantees, and an integration path for consumers written in Rust. Keep syntax ownership and validation in this project, and have the extension and external consumers use the same parsing implementation. This request does not prescribe a package name, transport, or implementation language, and does not request new import syntax or observation-specific fields.

**关闭（2026-11-01）**：TypeScript 侧 `src/lib.ts` 成为不依赖 `vscode` 的库入口，`parseContract(source)` 交出模型、样式与两层诊断，行列与编辑器同口径；构建产出 `dist/lib.mjs`、`dist/lib.cjs` 与声明，npm 包只收这几样。Rust 侧 `crates/contractdag` 给出同构的模型类型与 `parse`，下游 Rust 库进程内直接用，不再经过子进程。两份实现由 `crates/contractdag/tests/corpus` 的语料钉住：期望 JSON 由 TypeScript 侧生成，`pnpm conformance` 重生成，`pnpm test` 与 `cargo test` 各自对照，任一侧漂移都会在自己的测试里失败。分发为 npm 包 `contractdag-preview`、crate `contractdag`，以及命令行 `contractdag <文件>` 输出的 JSON 与退出码 0/1/2。原因与取舍记在 `spec.md` §库入口，用法与兼容承诺记在 `docs/library.md`。
