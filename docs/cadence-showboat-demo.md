# Using Cadence Lint

*2026-07-30T12:37:39Z by Showboat 0.6.1*
<!-- showboat-id: ff8447b9-1749-4036-ae48-b89f5fe130cf -->

Start by asking the CLI what it accepts. In a source checkout, use `npx tsx src/cli/index.ts`; after installation, the equivalent command is `cadence-lint`.

```bash
npx tsx src/cli/index.ts --help | sed -n '1,30p'

```

```output
Usage: cadence-lint [options] [files...]

Lint Markdown prose structure and cadence.

Arguments:
  files                                     Markdown files to lint

Options:
  --section <section=pattern[,pattern...]>  Allowed sentence-count structure for a cadence section, for example intro=1/3/1,1/5/1. Repeat for sections. (default: [])
  --section-rule <section=pattern>          Allowed sentence-count structure for a cadence section, for example intro=1/3/1. Repeat for alternatives. (default: [])
  --language <language>                     Language code for prose rules.
  --config <path>                           Path to a cadence JSONC config file.
  --format <format>                         Output format: human or json. (default: "human")
  -V, --version                             output the version number
  -h, --help                                display help for command

Field notes:
  Lint marked prose sections before publishing a README or guide.
  Load configured section structures from cadence.config.jsonc.
  Use --format json when CI or editor tooling needs diagnostics.
```

Create three tiny Markdown files: one section that matches a `1/3/1` cadence, one section that does not match, and one unmarked paragraph to show marker-coverage warnings.

```bash
mkdir -p .showboat-cadence
cat > .showboat-cadence/good.md <<'MARKDOWN'
<!-- cadence:overview -->

One sentence.

First sentence. Second sentence. Third sentence.

Last sentence.

<!-- /cadence:overview -->
MARKDOWN
cat > .showboat-cadence/bad.md <<'MARKDOWN'
<!-- cadence:overview -->

One sentence.

This paragraph has two sentences. It does not match.

<!-- /cadence:overview -->
MARKDOWN
cat > .showboat-cadence/unmarked.md <<'MARKDOWN'
This paragraph is outside cadence markers.
MARKDOWN
find .showboat-cadence -maxdepth 1 -type f -name '*.md' | sort

```

```output
.showboat-cadence/bad.md
.showboat-cadence/good.md
.showboat-cadence/unmarked.md
```

Run Cadence with a section rule. The rule `overview=1/3/1` means the `overview` section must contain three counted paragraphs with one sentence, then three sentences, then one sentence.

```bash
npx tsx src/cli/index.ts --section overview=1/3/1 .showboat-cadence/good.md

```

```output
cadence-lint: no issues found
```

When the observed paragraph sentence counts do not match the configured structure, Cadence reports an error and exits non-zero. This block captures both the diagnostic and the exit code.

```bash
set +e
npx tsx src/cli/index.ts --section overview=1/3/1 .showboat-cadence/bad.md
status=$?
echo "exit=$status"

```

```output
.showboat-cadence/bad.md:1:1 error Cadence section 'overview' structure does not match expected structures. [observed: 1/2, expected: 1/3/1]
exit=1
```

Cadence also warns when normal paragraphs are not wrapped in cadence markers. Warnings do not make the command fail; they return exit code 0.

```bash
set +e
npx tsx src/cli/index.ts .showboat-cadence/unmarked.md
status=$?
echo "exit=$status"

```

```output
.showboat-cadence/unmarked.md:1:1 warning Normal paragraph is not covered by cadence markers.
exit=0
```

Use `--format json` when another tool needs stable diagnostic fields instead of human-readable lines.

```bash
set +e
npx tsx src/cli/index.ts --format json --section overview=1/3/1 .showboat-cadence/bad.md
status=$?
echo "exit=$status"

```

```output
{
  "diagnostics": [
    {
      "severity": "error",
      "message": "Cadence section 'overview' structure does not match expected structures.",
      "location": {
        "filePath": ".showboat-cadence/bad.md",
        "line": 1,
        "column": 1
      },
      "observedStructure": "1/2",
      "expectedStructures": [
        "1/3/1"
      ]
    }
  ]
}
exit=1
```

For repeated use, put section rules in `cadence.config.jsonc`. Cadence auto-discovers this file from the current working directory, or you can pass it explicitly with `--config`.

```bash
cat > .showboat-cadence/cadence.config.jsonc <<'JSONC'
{
  "language": "en",
  "sections": {
    "overview": ["1/3/1"]
  }
}
JSONC
npx tsx src/cli/index.ts --config .showboat-cadence/cadence.config.jsonc .showboat-cadence/good.md

```

```output
cadence-lint: no issues found
```

That is the everyday workflow: mark prose sections, configure the expected sentence-count pattern for each section name, run the CLI over Markdown files or globs, and use JSON output when automation needs to consume diagnostics.
