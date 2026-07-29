# Cadence Lint

Cadence Lint is a Markdown prose structure linter. It will check documents for structural and cadence issues such as heading flow, paragraph rhythm, and prose organization.

## Setup

Use Node 20 or newer.

```bash
npm install
npm test
npm run build
```

After the package is published:

```bash
npm install cadence-lint
npx cadence-lint README.md
```

## CLI

```bash
npm run dev -- README.md
```

After publishing or linking the package:

```bash
cadence-lint README.md
```

## Library

```ts
import { lintMarkdown } from "cadence-lint";

const result = lintMarkdown("# Title\n\nPlain prose.\n");
console.log(result.diagnostics);
```

## Package Release

The npm package is prepared as `cadence-lint` with MIT
licensing, `public` npm access, provenance-enabled CI publishing, a
`cadence-lint` binary, ESM library exports, and TypeScript declarations.

Before publishing, run the local release check:

```bash
npm run release:check
```

This runs type-checking, tests, a production build, and a package dry-run verification that checks
the built CLI, library entry points, declaration files, README, and license. To inspect npm's packed
file list without the full check:

```bash
npm run pack:dry
```

Publishing is intentionally manual. See [`RELEASE.md`](./RELEASE.md) for the confirmation checklist,
first-time package creation flow, trusted-publisher setup, and GitHub Actions workflow steps.
