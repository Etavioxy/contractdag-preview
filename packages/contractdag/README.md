# @etavioxy/contractdag

Model types and parser for `.contractdag` contract declarations — the same parser the [Contract DAG Preview](https://marketplace.visualstudio.com/items?itemName=Etavioxy.contractdag-preview) extension draws with.

This directory is the package for local use; it is not published to npm. Build it from the repository root:

```bash
pnpm stage:lib    # rebuilds dist and stages it here
```

Then depend on it by path:

```json
{ "dependencies": { "@etavioxy/contractdag": "file:../vscode-contractdag-preview/packages/contractdag" } }
```

```ts
import { parseContract } from '@etavioxy/contractdag'

const { model, style, diagnostics } = parseContract(source)
```

`model` is absent when the text does not parse — a model is either complete or absent. Every node, link and diagnostic carries a 0-based `range`, so positions can be mapped back into the file.

The package also provides the command line:

```bash
npx contractdag pipeline.contractdag
```

It prints the same parse result as JSON. Exit code `0` means no defects, `1` means a model with defects, `2` means no model (syntax error or unreadable file).

Rust consumers use the crate instead: `cargo add contractdag`.

Docs, compatibility promises and the conformance corpus that keeps both implementations aligned: [docs/library.md](https://github.com/Etavioxy/contractdag-preview/blob/main/docs/library.md).
