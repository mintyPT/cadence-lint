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

Cadence Lint auto-discovers `cadence.config.jsonc` from the current working
directory when it exists. A missing auto-discovered config is allowed. Use
`--config <path>` to load a specific config file.

```jsonc
{
  "language": "en",
  "sections": {
    "intro": ["1/3/1", "1/5/1"]
  },
  "exceptions": ["Dr\\."]
}
```

`sections` maps cadence section names to allowed sentence-count structures.
`exceptions` is an array of regex strings protected during sentence splitting.
The defaults are language `en` and no section structures. CLI `--language`,
`--section`, and `--section-rule` values override config values.

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
