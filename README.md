# Cadence Lint

Cadence Lint v1 is a Markdown structure linter. It checks sentence-count
patterns in normal Markdown paragraphs wrapped by cadence markers.

v1 only checks Markdown paragraph structure. It does not lint heading flow,
author roles, section order, style tone, or deferred cadence features.

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

Pass one or more Markdown files, directories are not supported:

```bash
cadence-lint docs/intro.md docs/*.md
```

Use `--format json` for machine-readable diagnostics:

```bash
cadence-lint --format json docs/intro.md
```

Configure section structures on the CLI with `--section`:

```bash
cadence-lint --section intro=1/3/1 docs/intro.md
cadence-lint --section intro=1/3/1,1/5/1 docs/intro.md
cadence-lint --section overview=1 --section details=2/1 docs/guide.md
```

`--section-rule <section=pattern>` is still accepted as a compatibility alias
for `--section`.

Use `--language <language>` to choose sentence-splitting built-ins. Supported
languages are `en`, `fr`, and `pt`.

## Markers

Cadence sections are standalone HTML comments:

```markdown
<!-- cadence:overview -->

One sentence.

First sentence. Second sentence. Third sentence.

Last sentence.

<!-- /cadence:overview -->
```

The opening marker is `<!-- cadence:name -->`. The matching closing marker is
`<!-- /cadence:name -->`. Marker names may contain letters, numbers,
underscores, and hyphens. Use any section name that matches a configured
section rule, such as `overview`, `details`, or `takeaway`.

Markers must be standalone Markdown blocks. Inline comments are treated as
normal paragraph text:

```markdown
This paragraph contains <!-- cadence:intro --> inline text, not a marker.
```

Nested sections, unmatched closing markers, unmatched opening markers, malformed
marker comments, and marked sections not present in configured section rules are
reported as errors.

Normal Markdown paragraphs outside cadence markers are reported as warnings:

```markdown
This paragraph is outside a cadence section.
```

When you run the CLI, every marker name must have a matching configured section
rule. With no `sections`, `--section`, or `--section-rule` values, normal
paragraphs are linted for marker coverage, but marked sections have no known
names or structures to validate against.

## Structures

A structure is a slash-separated list of sentence counts, one number per
paragraph. `1/3/1` means:

```markdown
<!-- cadence:intro -->

One sentence.

First sentence. Second sentence. Third sentence.

Last sentence.

<!-- /cadence:intro -->
```

The observed structure above is `1/3/1`: the first paragraph has one sentence,
the second has three sentences, and the third has one sentence.

Each structure segment must be a positive integer. Sections can allow more than
one structure:

```bash
cadence-lint --section intro=1/3/1,1/5/1 docs/intro.md
```

Allowed structures can repeat to cover longer marked sections. For example,
`intro=1/3/1` also accepts a six-paragraph section with observed structure
`1/3/1/1/3/1`.

Only normal Markdown paragraphs are counted. Headings, lists, code blocks, and
HTML comments are not paragraph structure segments.

## Config

Cadence Lint auto-discovers `cadence.config.jsonc` from the current working
directory when it exists. A missing auto-discovered config is allowed. Use
`--config <path>` to load a specific config file. A missing explicit config is
an error.

```jsonc
{
  "language": "en",
  "sections": {
    "overview": ["1/3/1", "1/5/1"],
    "details": ["2/1"]
  },
  "exceptions": ["Dr\\."]
}
```

`sections` maps cadence section names to allowed sentence-count structures. A
section value may be a single string or an array of strings.

`exceptions` is an array of regex strings protected during sentence splitting.
Use it for abbreviations or other punctuation that should not end a sentence.

Defaults:

- `language`: `en`
- `sections`: no configured section structures
- `exceptions`: none

Precedence:

- Auto-discovered `cadence.config.jsonc` is used when no explicit config path is
  provided.
- `--config <path>` uses that config instead of auto-discovery.
- `--language` overrides the config `language`.
- Any `--section` or `--section-rule` flag replaces the config `sections` set.
  Include every section rule you want active when using section flags.
- CLI flags do not override config `exceptions`.

## Diagnostics and Exit Codes

Human output is one diagnostic per line:

```text
docs/intro.md:1:1 warning Normal paragraph is not covered by cadence markers.
docs/intro.md:3:1 error Cadence section 'intro' structure does not match expected structures. [observed: 1/2, expected: 1/3/1]
```

JSON output wraps diagnostics in a `diagnostics` array:

```json
{
  "diagnostics": [
    {
      "severity": "error",
      "message": "Cadence section 'intro' structure does not match expected structures.",
      "location": {
        "filePath": "docs/intro.md",
        "line": 3,
        "column": 1
      },
      "observedStructure": "1/2",
      "expectedStructures": ["1/3/1"]
    }
  ]
}
```

Exit-code behavior:

- Exit code `0`: no diagnostics, or warnings only.
- Exit code `1`: at least one error diagnostic, invalid CLI input, unsupported
  language, missing target, or config load/parse error.

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
