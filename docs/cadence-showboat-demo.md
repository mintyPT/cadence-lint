# Using Cadence Lint

*2026-07-30T14:25:00Z by Showboat 0.6.1*
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
node - <<'NODE'
import { rmSync } from "node:fs";

rmSync(".showboat-cadence", { recursive: true, force: true });
NODE
mkdir -p .showboat-cadence
cat > .showboat-cadence/good.md <<'MARKDOWN'
<!-- cadence:installation -->

One sentence.

First sentence. Second sentence. Third sentence.

Last sentence.

<!-- /cadence:installation -->
MARKDOWN
cat > .showboat-cadence/bad.md <<'MARKDOWN'
<!-- cadence:installation -->

One sentence.

This paragraph has two sentences. It does not match.

<!-- /cadence:installation -->
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

Run Cadence with a section rule. The rule `installation=1/3/1` means the non-intro `installation` section must contain three counted paragraphs with one sentence, then three sentences, then one sentence.

```bash
npx tsx src/cli/index.ts --section installation=1/3/1 .showboat-cadence/good.md

```

```output
cadence-lint: no issues found
```

Multiple allowed structures can be passed in one `--section` flag. The example below accepts either `1/3/1` or `1/5/1` for the `installation` section.

```bash
npx tsx src/cli/index.ts --section installation=1/3/1,1/5/1 .showboat-cadence/good.md

```

```output
cadence-lint: no issues found
```

Allowed structures can also repeat to consume a longer marked section. This file uses one `1/3/1` structure followed by one `1/5/1` structure.

```bash
cat > .showboat-cadence/repeated.md <<'MARKDOWN'
<!-- cadence:installation -->

One sentence.

First sentence. Second sentence. Third sentence.

Last sentence.

Middle opens.

One. Two. Three. Four. Five.

Middle closes.

<!-- /cadence:installation -->
MARKDOWN
npx tsx src/cli/index.ts --section installation=1/3/1,1/5/1 .showboat-cadence/repeated.md

```

```output
cadence-lint: no issues found
```

When the observed paragraph sentence counts do not match the configured structure, Cadence reports an error and exits non-zero. This block captures both the diagnostic and the exit code.

```bash
set +e
npx tsx src/cli/index.ts --section installation=1/3/1 .showboat-cadence/bad.md
exit_code=$?
echo "exit=$exit_code"

```

```output
.showboat-cadence/bad.md:1:1 error Cadence section 'installation' structure does not match expected structures. [observed: 1/2, expected: 1/3/1, context: previous "One sentence."; mismatch paragraph 2 expected 3 sentences but observed 2 sentences "This paragraph has two sentences."]
exit=1
```

Cadence also warns when normal paragraphs are not wrapped in cadence markers. Warnings do not make the command fail; they return exit code 0.

```bash
set +e
npx tsx src/cli/index.ts .showboat-cadence/unmarked.md
exit_code=$?
echo "exit=$exit_code"

```

```output
.showboat-cadence/unmarked.md:1:1 warning Normal paragraph is not covered by cadence markers.
exit=0
```

Use `--format json` when another tool needs stable diagnostic fields instead of human-readable lines.

```bash
set +e
npx tsx src/cli/index.ts --format json --section installation=1/3/1 .showboat-cadence/bad.md
exit_code=$?
echo "exit=$exit_code"

```

```output
{
  "diagnostics": [
    {
      "severity": "error",
      "message": "Cadence section 'installation' structure does not match expected structures.",
      "location": {
        "filePath": ".showboat-cadence/bad.md",
        "line": 1,
        "column": 1
      },
      "observedStructure": "1/2",
      "expectedStructures": [
        "1/3/1"
      ],
      "structureContext": {
        "previousSentences": [
          "One sentence."
        ],
        "mismatchParagraph": 2,
        "expectedSentenceCount": 3,
        "observedSentenceCount": 2,
        "mismatchText": "This paragraph has two sentences."
      }
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
    "installation": ["1/3/1"]
  }
}
JSONC
npx tsx src/cli/index.ts --config .showboat-cadence/cadence.config.jsonc .showboat-cadence/good.md

```

```output
cadence-lint: no issues found
```

Config entries can also describe the expected structure. Descriptions are included in JSON diagnostics so editor integrations and review tools can explain the intent behind a failing paragraph.

```bash
cat > .showboat-cadence/described.config.jsonc <<'JSONC'
{
  "language": "en",
  "sections": {
    "installation": [
      { "count": 1, "description": "Introduce the installation path" },
      { "count": 3, "description": "Explain the installation details" },
      { "count": 1, "description": "Close with the result" }
    ]
  }
}
JSONC
set +e
npx tsx src/cli/index.ts --format json --config .showboat-cadence/described.config.jsonc .showboat-cadence/bad.md
exit_code=$?
echo "exit=$exit_code"

```

```output
{
  "diagnostics": [
    {
      "severity": "error",
      "message": "Cadence section 'installation' structure does not match expected structures.",
      "location": {
        "filePath": ".showboat-cadence/bad.md",
        "line": 1,
        "column": 1
      },
      "observedStructure": "1/2",
      "expectedStructures": [
        "1/3/1"
      ],
      "expectedStructureDetails": [
        {
          "pattern": "1/3/1",
          "segmentDescriptions": [
            "Introduce the installation path",
            "Explain the installation details",
            "Close with the result"
          ]
        }
      ],
      "structureContext": {
        "previousSentences": [
          "One sentence."
        ],
        "mismatchParagraph": 2,
        "expectedSentenceCount": 3,
        "observedSentenceCount": 2,
        "mismatchText": "This paragraph has two sentences."
      }
    }
  ]
}
exit=1
```

Use anchored structures when a section needs a specific opening shape, a repeatable middle shape, and a specific closing shape.

```bash
cat > .showboat-cadence/anchored.md <<'MARKDOWN'
<!-- cadence:installation -->

One sentence.

First sentence. Second sentence. Third sentence.

Last sentence.

Middle opens.

One. Two. Three. Four. Five.

Middle closes.

Final opens.

One. Two.

Final closes.

<!-- /cadence:installation -->
MARKDOWN
cat > .showboat-cadence/anchored.config.jsonc <<'JSONC'
{
  "sections": {
    "installation": {
      "start": ["1/3/1"],
      "middle": ["1/5/1"],
      "end": ["1/2/1"]
    }
  }
}
JSONC
npx tsx src/cli/index.ts --config .showboat-cadence/anchored.config.jsonc .showboat-cadence/anchored.md

```

```output
cadence-lint: no issues found
```

That is the everyday workflow: mark prose sections, configure the expected sentence-count pattern for each section name, run the CLI over Markdown files or globs, and use JSON output when automation needs to consume diagnostics.
