# Essay and Blog Structure Rules

*2026-07-31T08:12:34Z by Showboat 0.6.1*
<!-- showboat-id: fb0599ec-d245-4f70-a317-cb679655248a -->

This demo uses the source checkout command, `npx tsx src/cli/index.ts`, to exercise the essay and blog structure rules added on this branch. Each example writes a small Markdown/config pair, runs Cadence, and captures the diagnostic output.

```bash
rm -rf .showboat-essay-blog-features
mkdir -p .showboat-essay-blog-features
cat > .showboat-essay-blog-features/structure.md <<'MARKDOWN'
# A Title That Runs Much Too Long For The Configured Limit

This subtitle should not be here.

## Introduction
Context opens the essay. It names the tension.

The point is implied.

## Conclusion
The piece closes. It adds a new point. It keeps going.

## Argument
The evidence starts abruptly.

Short.

Long section has many extra words to trip the balance rule clearly today.

- Add concise context

1. Drift into too many words for the configured list discipline rule

#### Too Deep
Nested point.
MARKDOWN
cat > .showboat-essay-blog-features/structure.config.jsonc <<'JSONC'
{
  "sectionBalance": {
    "measure": "words",
    "maxLargestToSmallestRatio": 2,
    "ignoreHeadings": ["Introduction"]
  },
  "listBalance": {
    "maxConsecutiveLists": 1,
    "requireParagraphBeforeList": true,
    "requireParagraphAfterList": true
  },
  "headingOrder": ["Introduction", "Argument", "Conclusion"],
  "title": {
    "maxWords": 6,
    "maxCharacters": 50,
    "allowSubtitle": false
  },
  "introduction": {
    "heading": "Introduction",
    "maxParagraphs": 1,
    "allowedStructures": ["2"],
    "requireLastSentenceMarker": ["This essay argues"]
  },
  "lists": {
    "maxItems": 1,
    "maxWordsPerItem": 5,
    "maxDepth": 1,
    "allowedPrefixes": ["Add"]
  },
  "transitions": {
    "requiredAtHeadingLevels": [2],
    "allowedStarts": ["However", "Finally"]
  },
  "headings": {
    "maxDepth": 3,
    "forbidSkippedLevels": true,
    "singleH1": true
  }
}
JSONC
find .showboat-essay-blog-features -maxdepth 1 -type f | sort
```

```output
.showboat-essay-blog-features/structure.config.jsonc
.showboat-essay-blog-features/structure.md
```

Run the structural config against the draft. This single run demonstrates section balance, list-to-prose balance, required heading order, title/subtitle limits, introduction shape, list discipline, transition starts, and heading hierarchy.

```bash
set +e
npx tsx src/cli/index.ts --config .showboat-essay-blog-features/structure.config.jsonc .showboat-essay-blog-features/structure.md
exit_code=$?
echo "exit=$exit_code"
```

```output
.showboat-essay-blog-features/structure.md:3:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/structure.md:6:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/structure.md:8:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/structure.md:11:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/structure.md:14:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/structure.md:16:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/structure.md:18:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/structure.md:25:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/structure.md:13:1 error Section balance exceeds configured words ratio: 'Argument' is 9.00x 'Too Deep'. [section: Argument, heading line: 13, level: 2, observed: Argument:18 / Too Deep:2 (words), expected: largest-to-smallest ratio <= 2]
.showboat-essay-blog-features/structure.md:20:1 error List balance requires a prose paragraph after each list.
.showboat-essay-blog-features/structure.md:22:1 error List balance allows at most 1 consecutive list. [observed: 2 consecutive lists, expected: consecutive lists <= 1]
.showboat-essay-blog-features/structure.md:22:1 error List balance requires a prose paragraph before each list.
.showboat-essay-blog-features/structure.md:22:1 error List balance requires a prose paragraph after each list.
.showboat-essay-blog-features/structure.md:13:1 error Heading 'Argument' appears before a required earlier heading. [section: Argument, heading line: 13, level: 2, observed: Introduction -> Conclusion -> Argument, expected: Introduction -> Argument -> Conclusion]
.showboat-essay-blog-features/structure.md:1:1 error Title has 11 words; expected <= 6. [observed: 11 words, expected: words <= 6]
.showboat-essay-blog-features/structure.md:1:1 error Title has 56 characters; expected <= 50. [observed: 56 characters, expected: characters <= 50]
.showboat-essay-blog-features/structure.md:3:1 error Subtitle is not allowed by configured title rules.
.showboat-essay-blog-features/structure.md:5:1 error Introduction has 2 paragraphs; expected <= 1. [section: Introduction, heading line: 5, level: 2, observed: 2/1, expected: paragraphs <= 1]
.showboat-essay-blog-features/structure.md:5:1 error Introduction sentence structure does not match allowed structures. [section: Introduction, heading line: 5, level: 2, observed: 2/1, expected: 2]
.showboat-essay-blog-features/structure.md:5:1 error Introduction final sentence is missing a required marker phrase. [section: Introduction, heading line: 5, level: 2, observed: The point is implied., expected: This essay argues]
.showboat-essay-blog-features/structure.md:22:1 error List item has 11 words; expected <= 5. [observed: 11 words, expected: words per item <= 5]
.showboat-essay-blog-features/structure.md:22:1 error List item does not start with an allowed prefix. [observed: Drift into too many words for the configured list discipline rule, expected: Add]
.showboat-essay-blog-features/structure.md:5:1 error Section 'Introduction' first sentence does not start with an allowed transition. [section: Introduction, heading line: 5, level: 2, observed: Context opens the essay., expected: However | Finally]
.showboat-essay-blog-features/structure.md:10:1 error Section 'Conclusion' first sentence does not start with an allowed transition. [section: Conclusion, heading line: 10, level: 2, observed: The piece closes., expected: However | Finally]
.showboat-essay-blog-features/structure.md:13:1 error Section 'Argument' first sentence does not start with an allowed transition. [section: Argument, heading line: 13, level: 2, observed: The evidence starts abruptly., expected: However | Finally]
.showboat-essay-blog-features/structure.md:24:1 error Heading depth is 4; expected <= 3. [section: Too Deep, heading line: 24, level: 4, observed: depth 4, expected: depth <= 3]
.showboat-essay-blog-features/structure.md:24:1 error Heading level skips from H2 to H4. [section: Too Deep, heading line: 24, level: 4, observed: H2 -> H4, expected: no skipped heading levels]
exit=1
```

```bash
cat > .showboat-essay-blog-features/wording-and-heading-sections.md <<'MARKDOWN'
## Main Argument
One sentence.

Second paragraph has two sentences. It fails.

This paragraph says we should improve some things and clean up the draft.
MARKDOWN
cat > .showboat-essay-blog-features/wording-and-heading-sections.config.jsonc <<'JSONC'
{
  "headingSections": {
    "main-argument": ["1/1"]
  },
  "wording": {
    "bannedTerms": ["things"],
    "useDefaults": true
  }
}
JSONC
find .showboat-essay-blog-features -maxdepth 1 -type f | sort
```

```output
.showboat-essay-blog-features/structure.config.jsonc
.showboat-essay-blog-features/structure.md
.showboat-essay-blog-features/wording-and-heading-sections.config.jsonc
.showboat-essay-blog-features/wording-and-heading-sections.md
```

Use `headingSections` when paragraph-shape rules should apply to Markdown headings instead of cadence marker comments. The same run also enables wording defaults and adds a project-specific term.

```bash
set +e
npx tsx src/cli/index.ts --config .showboat-essay-blog-features/wording-and-heading-sections.config.jsonc .showboat-essay-blog-features/wording-and-heading-sections.md
exit_code=$?
echo "exit=$exit_code"
```

```output
.showboat-essay-blog-features/wording-and-heading-sections.md:2:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/wording-and-heading-sections.md:4:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/wording-and-heading-sections.md:6:1 warning Normal paragraph is not covered by cadence markers.
.showboat-essay-blog-features/wording-and-heading-sections.md:1:1 error Heading section 'Main Argument' paragraph structure does not match allowed structures. [section: Main Argument, heading line: 1, level: 2, observed: 1/2/1, expected: 1/1]
.showboat-essay-blog-features/wording-and-heading-sections.md:6:31 error Wording uses banned default term 'improve'. [observed: improve, expected: avoid improve]
.showboat-essay-blog-features/wording-and-heading-sections.md:6:39 error Wording uses banned default term 'some'. [observed: some, expected: avoid some]
.showboat-essay-blog-features/wording-and-heading-sections.md:6:44 error Wording uses banned custom term 'things'. [observed: things, expected: avoid things]
.showboat-essay-blog-features/wording-and-heading-sections.md:6:55 error Wording uses banned default term 'clean up'. [observed: clean up, expected: avoid clean up]
exit=1
```

Together these runs cover the new config keys: `sectionBalance`, `listBalance`, `headingOrder`, `title`, `introduction`, `lists`, `transitions`, `headings`, `headingSections`, and `wording`.
