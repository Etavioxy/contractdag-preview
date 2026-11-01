# Issues

> append-only：本文件 issue 条目只追加到文件末尾，每 issue 内段落只追加到段落末尾。
> 查看/修改 此文件 前请 invoke [[issue-lifecycle]]。

## #1 Expose the parser as a library independent of VS Code (2026-11-01) — open

The parser is available internally, but the published package entry targets the VS Code extension rather than a supported parser library. Non-editor consumers need to reuse the authoritative parser without copying its grammar or starting VS Code. Expose a documented library entry that returns the parsed model and diagnostics, including source locations, independently of editor activation; document distribution, compatibility guarantees, and an integration path for consumers written in Rust. Keep syntax ownership and validation in this project, and have the extension and external consumers use the same parsing implementation. This request does not prescribe a package name, transport, or implementation language, and does not request new import syntax or observation-specific fields.
