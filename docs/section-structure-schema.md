# Section Structure Schema

Cadence section rules should keep the current shorthand while adding a richer
object form for metadata and anchored matching.

## Current compatibility contract

These inputs remain valid:

```jsonc
{
  "sections": {
    "overview": "1/3/1",
    "details": ["2/1", "1/5/1"]
  }
}
```

```bash
cadence-lint --section overview=1/3/1,1/5/1 docs/guide.md
```

String patterns continue to mean repeatable alternatives. A section configured
as `["1/3/1", "2/2"]` may be consumed by any sequence of those complete
patterns until all counted paragraphs are matched.

## Normalized rule model

Implementation should normalize every configured section rule to one internal
shape:

```ts
interface SectionPatternSegment {
  count: number;
  description?: string;
}

interface SectionPattern {
  segments: SectionPatternSegment[];
  description?: string;
}

interface SectionRule {
  any?: SectionPattern[];
  start?: SectionPattern[];
  middle?: SectionPattern[];
  end?: SectionPattern[];
}
```

`any` preserves the current repeatable-alternative behavior. `start`, `middle`,
and `end` add placement constraints without changing the meaning of existing
string patterns.

## Config object form

The config should accept strings as shorthand and objects for richer rules:

```jsonc
{
  "language": "en",
  "sections": {
    "overview": {
      "start": [
        {
          "pattern": [
            { "count": 1, "description": "Introduce the idea" },
            { "count": 3, "description": "Develop the idea" },
            { "count": 1, "description": "Conclude the idea" }
          ],
          "description": "Opening overview"
        }
      ],
      "middle": ["1/5/1"],
      "end": ["1/2/1"]
    }
  }
}
```

For a single described repeatable pattern, use `any`:

```jsonc
{
  "sections": {
    "overview": {
      "any": [
        {
          "pattern": [
            { "count": 1, "description": "Introduce the idea" },
            { "count": 3, "description": "Develop the idea" },
            { "count": 1, "description": "Conclude the idea" }
          ]
        }
      ]
    }
  }
}
```

## Description ownership

Segment descriptions belong to individual paragraph-count positions. A whole
pattern may also carry a description for summaries, but paragraph-level
diagnostics should prefer the segment description for the mismatching position.

This avoids ambiguity in examples such as:

```jsonc
[
  { "count": 1, "description": "Introduce the idea" },
  { "count": 3, "description": "Develop the idea" },
  { "count": 1, "description": "Conclude the idea" }
]
```

Each entry describes the paragraph with that expected sentence count, not the
whole `1/3/1` structure.

## Anchored matching semantics

Anchored rules are evaluated as:

1. Match exactly one `start` pattern at the beginning when `start` exists.
2. Match zero or more `middle` patterns after the start. If no `start` exists,
   middle matching starts at the first paragraph.
3. Match exactly one `end` pattern at the end when `end` exists.
4. If only `any` exists, use the current repeatable-alternative matcher.
5. If anchored buckets and `any` both exist, `any` is an additional middle
   alternative unless `middle` is explicitly set.

This supports the issue's target shape directly: start with `1/3/1`, allow
multiple `1/5/1` structures in the middle, and conclude with `1/2/1`.

## CLI syntax

Keep CLI section flags as the compact string-only path:

```bash
cadence-lint --section overview=1/3/1,1/5/1 docs/guide.md
```

Richer described and anchored rules should live in config. That keeps shell
syntax readable and avoids inventing a second complex grammar for metadata.

## Diagnostics

Diagnostics should keep these stable fields:

- `observedStructure`
- `expectedStructures`
- `structureContext`

Richer diagnostics may add optional fields such as:

```ts
interface ExpectedStructureDetail {
  pattern: string;
  description?: string;
  segmentDescriptions?: readonly string[];
  placement?: "any" | "start" | "middle" | "end";
}
```

Human diagnostics should name the mismatching paragraph, the expected sentence
count, the observed sentence count, the relevant text, and the configured
segment description when available.
