import { describe, expect, it } from "vitest";
import { lintMarkdown } from "../src/index.js";

describe("lintMarkdown", () => {
  it("warns for normal paragraphs outside cadence markers", () => {
    expect(lintMarkdown("# Title\n\nPlain prose.\n")).toEqual({
      diagnostics: [
        expect.objectContaining({
          severity: "warning",
          message: "Normal paragraph is not covered by cadence markers.",
          location: {
            filePath: "<input>",
            line: 3,
            column: 1,
          },
        }),
      ],
    });
  });

  it("does not warn for headings, lists, code blocks, and tables", () => {
    expect(
      lintMarkdown(
        [
          "# Title",
          "",
          "- List item",
          "- Another list item",
          "",
          "```ts",
          "const value = 1;",
          "```",
          "",
          "| Column |",
          "| --- |",
          "| Value |",
        ].join("\n"),
      ),
    ).toEqual({
      diagnostics: [],
    });
  });

  it("passes a marked section when the observed structure segments into allowed structures", () => {
    const markdown = [
      "<!-- cadence:intro -->",
      "",
      "One sentence.",
      "",
      "First sentence. Second sentence. Third sentence.",
      "",
      "Last sentence.",
      "",
      "Another sentence. Final sentence.",
      "",
      "<!-- /cadence:intro -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        sectionRules: {
          intro: [[1, 3, 1], [2]],
        },
      }),
    ).toEqual({
      diagnostics: [],
    });
  });

  it("passes anchored start, middle, and end section structures", () => {
    const markdown = [
      "<!-- cadence:overview -->",
      "",
      "One sentence.",
      "",
      "First sentence. Second sentence. Third sentence.",
      "",
      "Last sentence.",
      "",
      "Middle opens.",
      "",
      "One. Two. Three. Four. Five.",
      "",
      "Middle closes.",
      "",
      "Final opens.",
      "",
      "One. Two.",
      "",
      "Final closes.",
      "",
      "<!-- /cadence:overview -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        sectionRules: {
          overview: {
            start: [[1, 3, 1]],
            middle: [[1, 5, 1]],
            end: [[1, 2, 1]],
          },
        },
      }),
    ).toEqual({
      diagnostics: [],
    });
  });

  it("uses any as an anchored middle alternative when middle is omitted", () => {
    const markdown = [
      "<!-- cadence:overview -->",
      "",
      "One sentence.",
      "",
      "First sentence. Second sentence. Third sentence.",
      "",
      "Last sentence.",
      "",
      "Middle opens.",
      "",
      "One. Two. Three. Four. Five.",
      "",
      "Middle closes.",
      "",
      "Final opens.",
      "",
      "One. Two.",
      "",
      "Final closes.",
      "",
      "<!-- /cadence:overview -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        sectionRules: {
          overview: {
            any: [[1, 5, 1]],
            start: [[1, 3, 1]],
            end: [[1, 2, 1]],
          },
        },
      }),
    ).toEqual({
      diagnostics: [],
    });
  });

  it("keeps legacy alternatives repeatable", () => {
    const markdown = [
      "<!-- cadence:overview -->",
      "",
      "One sentence.",
      "",
      "First sentence. Second sentence. Third sentence.",
      "",
      "Last sentence.",
      "",
      "Another sentence.",
      "",
      "First sentence. Second sentence. Third sentence.",
      "",
      "Last sentence.",
      "",
      "<!-- /cadence:overview -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        sectionRules: {
          overview: [[1, 3, 1]],
        },
      }),
    ).toEqual({
      diagnostics: [],
    });
  });

  it("reports structure mismatches with observed and expected structures", () => {
    const markdown = [
      "<!-- cadence:intro -->",
      "",
      "One sentence.",
      "",
      "First sentence. Second sentence. Third sentence.",
      "",
      "Last sentence.",
      "",
      "Unexpected sentence count. This paragraph does not match. The suffix starts here. Still wrong.",
      "",
      "<!-- /cadence:intro -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        filePath: "guide.md",
        sectionRules: {
          intro: [[1, 3, 1], [2]],
        },
      }),
    ).toEqual({
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          message:
            "Cadence section 'intro' structure does not match expected structures. Unmatched suffix starts at paragraph 4.",
          location: {
            filePath: "guide.md",
            line: 1,
            column: 1,
          },
          observedStructure: "1/3/1/4",
          expectedStructures: ["1/3/1", "2"],
          unmatchedSuffixStart: 4,
          structureContext: {
            previousSentences: [
              "Third sentence.",
              "Last sentence.",
              "Unexpected sentence count.",
              "This paragraph does not match.",
              "The suffix starts here.",
              "Still wrong.",
            ],
            mismatchParagraph: 4,
            expectedSentenceCount: 1,
            observedSentenceCount: 4,
            mismatchText: "Unexpected sentence count.",
          },
        }),
      ],
    });
  });

  it("reports described expected structure details on mismatches", () => {
    const markdown = [
      "<!-- cadence:overview -->",
      "",
      "One sentence.",
      "",
      "Only two sentences here. It mismatches.",
      "",
      "<!-- /cadence:overview -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        filePath: "guide.md",
        sectionRules: {
          overview: [
            {
              counts: [1, 3, 1],
              description: "Opening overview",
              segmentDescriptions: [
                "Introduce the idea",
                "Develop the idea",
                "Conclude the idea",
              ],
            },
          ],
        },
      }),
    ).toEqual({
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          observedStructure: "1/2",
          expectedStructures: ["1/3/1"],
          expectedStructureDetails: [
            {
              pattern: "1/3/1",
              description: "Opening overview",
              segmentDescriptions: [
                "Introduce the idea",
                "Develop the idea",
                "Conclude the idea",
              ],
            },
          ],
          structureContext: {
            previousSentences: [
              "One sentence.",
              "Only two sentences here.",
              "It mismatches.",
            ],
            mismatchParagraph: 2,
            expectedSentenceCount: 3,
            observedSentenceCount: 2,
            mismatchText: "Only two sentences here.",
          },
        }),
      ],
    });
  });

  it("passes heading sections within the configured section balance ratio", () => {
    const markdown = [
      "## Background",
      "",
      "One two three four.",
      "",
      "## Argument",
      "",
      "One two three four five six.",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        sectionBalance: {
          measure: "words",
          maxLargestToSmallestRatio: 2,
        },
      }).diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    ).toEqual([]);
  });

  it("reports heading sections that exceed the configured section balance ratio", () => {
    const markdown = [
      "## Background",
      "",
      "One two.",
      "",
      "## Argument",
      "",
      "One two three four five six seven eight nine.",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        filePath: "essay.md",
        sectionBalance: {
          measure: "words",
          maxLargestToSmallestRatio: 4,
        },
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message:
          "Section balance exceeds configured words ratio: 'Argument' is 4.50x 'Background'.",
        location: {
          filePath: "essay.md",
          line: 5,
          column: 1,
        },
        section: {
          title: "Argument",
          line: 5,
          level: 2,
        },
        observedStructure: "Argument:9 / Background:2 (words)",
        expectedStructures: ["largest-to-smallest ratio <= 4"],
      }),
    );
  });

  it("ignores configured headings in section balance checks", () => {
    const markdown = [
      "## Introduction",
      "",
      "One.",
      "",
      "## Background",
      "",
      "One two three four.",
      "",
      "## Argument",
      "",
      "One two three four five six.",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        sectionBalance: {
          measure: "words",
          maxLargestToSmallestRatio: 2,
          ignoreHeadings: ["Introduction"],
        },
      }).diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    ).toEqual([]);
  });

  it("passes lists with required surrounding prose", () => {
    const markdown = [
      "## Body",
      "",
      "Before the list.",
      "",
      "- One item",
      "- Two item",
      "",
      "After the list.",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        listBalance: {
          maxConsecutiveLists: 1,
          requireParagraphBeforeList: true,
          requireParagraphAfterList: true,
        },
      }).diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    ).toEqual([]);
  });

  it("reports consecutive lists that exceed the configured list balance", () => {
    const markdown = [
      "- One item",
      "",
      "1. Another item",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        listBalance: {
          maxConsecutiveLists: 1,
        },
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: "List balance allows at most 1 consecutive list.",
        location: {
          filePath: "<input>",
          line: 3,
          column: 1,
        },
        observedStructure: "2 consecutive lists",
        expectedStructures: ["consecutive lists <= 1"],
      }),
    );
  });

  it("reports lists that start a section when prose is required before lists", () => {
    const markdown = [
      "## Body",
      "",
      "- One item",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        listBalance: {
          requireParagraphBeforeList: true,
        },
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: "List balance requires a prose paragraph before each list.",
        location: {
          filePath: "<input>",
          line: 3,
          column: 1,
        },
      }),
    );
  });

  it("reports lists that end a section when prose is required after lists", () => {
    const markdown = [
      "## Body",
      "",
      "Before the list.",
      "",
      "- One item",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        listBalance: {
          requireParagraphAfterList: true,
        },
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: "List balance requires a prose paragraph after each list.",
        location: {
          filePath: "<input>",
          line: 5,
          column: 1,
        },
      }),
    );
  });

  it("passes configured headings that appear in order", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "Opening.",
        "",
        "## Argument",
        "",
        "Point.",
        "",
        "## Conclusion",
        "",
        "Closing.",
      ].join("\n"),
      {
        headingOrder: ["Introduction", "Argument", "Conclusion"],
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reports configured headings that appear out of order", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "Opening.",
        "",
        "## Conclusion",
        "",
        "Closing.",
        "",
        "## Argument",
        "",
        "Point.",
      ].join("\n"),
      {
        filePath: "essay.md",
        headingOrder: ["Introduction", "Argument", "Conclusion"],
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: "Heading 'Argument' appears before a required earlier heading.",
        location: {
          filePath: "essay.md",
          line: 9,
          column: 1,
        },
        observedStructure: "Introduction -> Conclusion -> Argument",
        expectedStructures: ["Introduction -> Argument -> Conclusion"],
      }),
    );
  });

  it("ignores extra headings in required heading order checks", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "Opening.",
        "",
        "## Aside",
        "",
        "Extra.",
        "",
        "## Argument",
        "",
        "Point.",
      ].join("\n"),
      {
        headingOrder: ["Introduction", "Argument"],
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("passes titles within configured word and character limits", () => {
    const result = lintMarkdown("# Clear Short Title\n", {
      title: {
        maxWords: 4,
        maxCharacters: 40,
      },
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reports titles that exceed configured word or character limits", () => {
    const result = lintMarkdown("# This Title Is Much Too Long For The Rule\n", {
      filePath: "post.md",
      title: {
        maxWords: 5,
        maxCharacters: 20,
      },
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Title has 9 words; expected <= 5.",
          location: {
            filePath: "post.md",
            line: 1,
            column: 1,
          },
          observedStructure: "9 words",
          expectedStructures: ["words <= 5"],
        }),
        expect.objectContaining({
          message: "Title has 40 characters; expected <= 20.",
          observedStructure: "40 characters",
          expectedStructures: ["characters <= 20"],
        }),
      ]),
    );
  });

  it("enforces subtitle limits when subtitles are allowed", () => {
    const result = lintMarkdown(
      [
        "# Main Title",
        "",
        "A subtitle with too many words.",
      ].join("\n"),
      {
        title: {
          allowSubtitle: true,
          maxSubtitleWords: 4,
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Subtitle has 6 words; expected <= 4.",
        location: {
          filePath: "<input>",
          line: 3,
          column: 1,
        },
      }),
    );
  });

  it("reports subtitles when subtitles are disallowed", () => {
    const result = lintMarkdown(
      [
        "# Main Title",
        "",
        "A subtitle.",
      ].join("\n"),
      {
        title: {
          allowSubtitle: false,
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: "Subtitle is not allowed by configured title rules.",
        location: {
          filePath: "<input>",
          line: 3,
          column: 1,
        },
      }),
    );
  });

  it("passes introductions within paragraph limits and allowed structures", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "Context opens the piece. It names the tension.",
        "",
        "This essay argues the point.",
      ].join("\n"),
      {
        introduction: {
          maxParagraphs: 2,
          allowedStructures: [[2, 1]],
          requireLastSentenceMarker: ["This essay argues"],
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reports introductions that exceed the paragraph limit", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "One.",
        "",
        "Two.",
        "",
        "Three.",
      ].join("\n"),
      {
        introduction: {
          maxParagraphs: 2,
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Introduction has 3 paragraphs; expected <= 2.",
        observedStructure: "1/1/1",
        expectedStructures: ["paragraphs <= 2"],
      }),
    );
  });

  it("reports introductions whose sentence structure is not allowed", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "One sentence.",
        "",
        "Two sentences here. Still second paragraph.",
      ].join("\n"),
      {
        introduction: {
          allowedStructures: [[2, 1], [3]],
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Introduction sentence structure does not match allowed structures.",
        observedStructure: "1/2",
        expectedStructures: ["2/1", "3"],
      }),
    );
  });

  it("reports introductions whose final sentence lacks a required marker", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "Context opens. The point is implied.",
      ].join("\n"),
      {
        introduction: {
          requireLastSentenceMarker: ["This essay argues", "I argue"],
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Introduction final sentence is missing a required marker phrase.",
        observedStructure: "The point is implied.",
        expectedStructures: ["This essay argues", "I argue"],
      }),
    );
  });

  it("uses default vague-word terms when wording is enabled without custom terms", () => {
    const result = lintMarkdown("This can improve some parts.\n", {
      wording: {},
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Wording uses banned default term 'improve'.",
          location: {
            filePath: "<input>",
            line: 1,
            column: 10,
          },
        }),
        expect.objectContaining({
          message: "Wording uses banned default term 'some'.",
        }),
      ]),
    );
  });

  it("replaces default vague-word terms when useDefaults is false", () => {
    const result = lintMarkdown("This can improve very rough prose.\n", {
      wording: {
        bannedTerms: ["very"],
        useDefaults: false,
      },
    });

    const wordingDiagnostics = result.diagnostics.filter((diagnostic) =>
      diagnostic.message.startsWith("Wording uses banned"),
    );

    expect(wordingDiagnostics).toEqual([
      expect.objectContaining({
        message: "Wording uses banned custom term 'very'.",
      }),
    ]);
  });

  it("extends default vague-word terms with custom terms", () => {
    const result = lintMarkdown("This can improve very rough prose.\n", {
      wording: {
        bannedTerms: ["very"],
        useDefaults: true,
      },
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Wording uses banned default term 'improve'.",
        }),
        expect.objectContaining({
          message: "Wording uses banned custom term 'very'.",
        }),
      ]),
    );
  });

  it("can disable vague-word checks", () => {
    const result = lintMarkdown("This can improve some parts.\n", {
      wording: {
        enabled: false,
      },
    });

    expect(
      result.diagnostics.filter((diagnostic) =>
        diagnostic.message.startsWith("Wording uses banned"),
      ),
    ).toEqual([]);
  });

  it("matches multi-word banned terms deterministically", () => {
    const result = lintMarkdown("We should clean up the draft.\n", {
      wording: {},
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Wording uses banned default term 'clean up'.",
        location: {
          filePath: "<input>",
          line: 1,
          column: 11,
        },
        observedStructure: "clean up",
        expectedStructures: ["avoid clean up"],
      }),
    );
  });

  it("does not run vague-word checks on non-prose Markdown blocks", () => {
    const result = lintMarkdown(
      [
        "```",
        "improve some code",
        "```",
        "",
        "- improve list item",
        "",
        "| term |",
        "| --- |",
        "| improve |",
      ].join("\n"),
      {
        wording: {},
      },
    );

    expect(
      result.diagnostics.filter((diagnostic) =>
        diagnostic.message.startsWith("Wording uses banned"),
      ),
    ).toEqual([]);
  });

  it("passes lists within item count, word count, nesting, and prefix limits", () => {
    const result = lintMarkdown(
      [
        "- Add concise context",
        "- Update clear examples",
      ].join("\n"),
      {
        lists: {
          maxItems: 3,
          maxWordsPerItem: 4,
          maxDepth: 1,
          allowedPrefixes: ["Add", "Update"],
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reports lists with too many items", () => {
    const result = lintMarkdown(
      [
        "- Add one",
        "- Add two",
        "- Add three",
      ].join("\n"),
      {
        lists: {
          maxItems: 2,
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "List has 3 items; expected <= 2.",
        observedStructure: "3 items",
        expectedStructures: ["items <= 2"],
      }),
    );
  });

  it("reports list items with too many words", () => {
    const result = lintMarkdown("- Add one two three four five\n", {
      lists: {
        maxWordsPerItem: 4,
      },
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "List item has 6 words; expected <= 4.",
        observedStructure: "6 words",
        expectedStructures: ["words per item <= 4"],
      }),
    );
  });

  it("reports nested list items deeper than the configured depth", () => {
    const result = lintMarkdown(
      [
        "- Add parent",
        "  - Add child",
      ].join("\n"),
      {
        lists: {
          maxDepth: 1,
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "List item depth is 2; expected <= 1.",
        observedStructure: "depth 2",
        expectedStructures: ["depth <= 1"],
      }),
    );
  });

  it("reports list items that do not start with an allowed prefix", () => {
    const result = lintMarkdown("1. Remove stale prose\n2. Drift away\n", {
      lists: {
        allowedPrefixes: ["Add", "Remove"],
      },
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "List item does not start with an allowed prefix.",
        observedStructure: "Drift away",
        expectedStructures: ["Add", "Remove"],
      }),
    );
  });

  it("passes selected sections whose first sentence starts with an allowed transition", () => {
    const result = lintMarkdown(
      [
        "## Argument",
        "",
        "However, the evidence changes the point.",
      ].join("\n"),
      {
        transitions: {
          requiredAtHeadingLevels: [2],
          allowedStarts: ["However"],
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reports selected heading levels whose first sentence lacks an allowed transition", () => {
    const result = lintMarkdown(
      [
        "## Argument",
        "",
        "The evidence changes the point.",
      ].join("\n"),
      {
        filePath: "essay.md",
        transitions: {
          requiredAtHeadingLevels: [2],
          allowedStarts: ["However", "By contrast"],
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Section 'Argument' first sentence does not start with an allowed transition.",
        location: {
          filePath: "essay.md",
          line: 1,
          column: 1,
        },
        observedStructure: "The evidence changes the point.",
        expectedStructures: ["However", "By contrast"],
      }),
    );
  });

  it("ignores non-selected heading levels in transition checks", () => {
    const result = lintMarkdown(
      [
        "### Detail",
        "",
        "The evidence changes the point.",
      ].join("\n"),
      {
        transitions: {
          requiredAtHeadingLevels: [2],
          allowedStarts: ["However"],
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("can target transition checks by heading name", () => {
    const result = lintMarkdown(
      [
        "### Takeaway",
        "",
        "The evidence changes the point.",
      ].join("\n"),
      {
        transitions: {
          requiredAtHeadings: ["Takeaway"],
          allowedStarts: ["Finally"],
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        section: {
          title: "Takeaway",
          line: 1,
          level: 3,
        },
      }),
    );
  });

  it("handles transition starts case-insensitively by default", () => {
    const result = lintMarkdown(
      [
        "## Argument",
        "",
        "however, the evidence changes the point.",
      ].join("\n"),
      {
        transitions: {
          requiredAtHeadingLevels: [2],
          allowedStarts: ["However"],
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("passes heading outlines with one H1 and ordered H2/H3 sections", () => {
    const result = lintMarkdown(
      [
        "# Title",
        "",
        "## Argument",
        "",
        "### Evidence",
      ].join("\n"),
      {
        headings: {
          maxDepth: 3,
          forbidSkippedLevels: true,
          singleH1: true,
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reports multiple H1 headings when singleH1 is true", () => {
    const result = lintMarkdown("# First\n\n# Second\n", {
      headings: {
        singleH1: true,
      },
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Document has multiple H1 headings.",
        observedStructure: "H1 count 2",
        expectedStructures: ["single H1"],
      }),
    );
  });

  it("reports headings deeper than the configured maximum depth", () => {
    const result = lintMarkdown("#### Too Deep\n", {
      headings: {
        maxDepth: 3,
      },
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Heading depth is 4; expected <= 3.",
        observedStructure: "depth 4",
        expectedStructures: ["depth <= 3"],
      }),
    );
  });

  it("reports skipped heading levels when forbidden", () => {
    const result = lintMarkdown("# Title\n\n### Skipped\n", {
      headings: {
        forbidSkippedLevels: true,
      },
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Heading level skips from H1 to H3.",
        observedStructure: "H1 -> H3",
        expectedStructures: ["no skipped heading levels"],
      }),
    );
  });

  it("does not report disabled heading hierarchy checks", () => {
    const result = lintMarkdown("# First\n\n# Second\n\n#### Deep\n", {
      headings: {
        singleH1: false,
        forbidSkippedLevels: false,
      },
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("passes sections within configured length limits", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "One sentence.",
        "",
        "- Add one",
      ].join("\n"),
      {
        sectionLength: {
          default: {
            maxParagraphs: 1,
            maxWords: 4,
            maxSentences: 1,
            maxListItems: 1,
          },
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reports sections exceeding configured length limits", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "One sentence. Another sentence.",
        "",
        "Second paragraph.",
        "",
        "- Add one",
        "- Add two",
      ].join("\n"),
      {
        filePath: "essay.md",
        sectionLength: {
          default: {
            maxParagraphs: 1,
            maxWords: 4,
            maxSentences: 2,
            maxListItems: 1,
          },
        },
      },
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Section 'Introduction' has 2 paragraphs; expected <= 1.",
          location: {
            filePath: "essay.md",
            line: 1,
            column: 1,
          },
          observedStructure: "2 paragraphs",
          expectedStructures: ["paragraphs <= 1"],
        }),
        expect.objectContaining({
          message: "Section 'Introduction' has 6 words; expected <= 4.",
          observedStructure: "6 words",
          expectedStructures: ["words <= 4"],
        }),
        expect.objectContaining({
          message: "Section 'Introduction' has 3 sentences; expected <= 2.",
          observedStructure: "3 sentences",
          expectedStructures: ["sentences <= 2"],
        }),
        expect.objectContaining({
          message: "Section 'Introduction' has 2 list items; expected <= 1.",
          observedStructure: "2 list items",
          expectedStructures: ["list items <= 1"],
        }),
      ]),
    );
  });

  it("uses heading-specific section length overrides before defaults", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "One sentence.",
        "",
        "Second paragraph.",
        "",
        "## Body",
        "",
        "One sentence.",
        "",
        "Second paragraph.",
      ].join("\n"),
      {
        sectionLength: {
          default: {
            maxParagraphs: 1,
          },
          Introduction: {
            maxParagraphs: 2,
          },
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Section 'Body' has 2 paragraphs; expected <= 1.",
      }),
    );
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({
        message: "Section 'Introduction' has 2 paragraphs; expected <= 1.",
      }),
    );
  });

  it("passes heading sections whose paragraph sentence structure matches an allowed pattern", () => {
    const result = lintMarkdown(
      [
        "## Introduction",
        "",
        "The draft opens with context. It names the tension.",
        "",
        "The final sentence states the point.",
      ].join("\n"),
      {
        headingSectionRules: {
          Introduction: [[2, 1]],
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reports configured heading sections whose paragraph structure does not match", () => {
    const result = lintMarkdown(
      [
        "## Conclusion",
        "",
        "The piece closes. It adds a new point. It keeps going.",
      ].join("\n"),
      {
        filePath: "essay.md",
        headingSectionRules: {
          Conclusion: [[1, 2], [2]],
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Heading section 'Conclusion' paragraph structure does not match allowed structures.",
        location: {
          filePath: "essay.md",
          line: 1,
          column: 1,
        },
        section: {
          title: "Conclusion",
          line: 1,
          level: 2,
        },
        observedStructure: "3",
        expectedStructures: ["1/2", "2"],
      }),
    );
  });

  it("ignores unconfigured heading sections for paragraph shape", () => {
    const result = lintMarkdown(
      [
        "## Aside",
        "",
        "One. Two. Three.",
      ].join("\n"),
      {
        headingSectionRules: {
          Introduction: [[1]],
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("matches heading section rules by normalized heading id", () => {
    const result = lintMarkdown(
      [
        "## Main Argument",
        "",
        "One. Two.",
      ].join("\n"),
      {
        headingSectionRules: {
          "main-argument": [[1]],
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Heading section 'Main Argument' paragraph structure does not match allowed structures.",
        observedStructure: "2",
        expectedStructures: ["1"],
      }),
    );
  });

  it("uses anchored section rule semantics for heading sections", () => {
    const result = lintMarkdown(
      [
        "## Intro",
        "",
        "Opening.",
        "",
        "Second sentence. Third sentence.",
      ].join("\n"),
      {
        headingSectionRules: {
          Intro: {
            start: [[1]],
            end: [[2]],
          },
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("does not apply cadence section rules to plain Markdown heading sections", () => {
    const result = lintMarkdown(
      [
        "## intro",
        "",
        "One. Two.",
      ].join("\n"),
      {
        sectionRules: {
          intro: [[1]],
        },
      },
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("checks list balance for lists before the first heading", () => {
    const result = lintMarkdown(
      [
        "- Preamble list",
        "",
        "## Body",
        "",
        "Paragraph.",
      ].join("\n"),
      {
        listBalance: {
          requireParagraphBeforeList: true,
        },
      },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "List balance requires a prose paragraph before each list.",
        location: {
          filePath: "<input>",
          line: 1,
          column: 1,
        },
      }),
    );
  });

  it("reports anchored expected structure details with placement on mismatches", () => {
    const markdown = [
      "<!-- cadence:overview -->",
      "",
      "Only two sentences here. It mismatches.",
      "",
      "Final opens.",
      "",
      "One. Two.",
      "",
      "Final closes.",
      "",
      "<!-- /cadence:overview -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        filePath: "guide.md",
        sectionRules: {
          overview: {
            start: [
              {
                counts: [1, 3, 1],
                description: "Opening overview",
                segmentDescriptions: [
                  "Introduce the idea",
                  "Develop the idea",
                  "Conclude the idea",
                ],
              },
            ],
            end: [[1, 2, 1]],
          },
        },
      }),
    ).toEqual({
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          message:
            "Cadence section 'overview' structure does not match expected structures. Start anchor did not match.",
          observedStructure: "2/1/2/1",
          expectedStructures: ["1/3/1", "1/2/1"],
          expectedStructureDetails: [
            {
              pattern: "1/3/1",
              placement: "start",
              description: "Opening overview",
              segmentDescriptions: [
                "Introduce the idea",
                "Develop the idea",
                "Conclude the idea",
              ],
            },
            {
              pattern: "1/2/1",
              placement: "end",
            },
          ],
          structureContext: {
            previousSentences: ["Only two sentences here.", "It mismatches."],
            mismatchParagraph: 1,
            expectedSentenceCount: 1,
            observedSentenceCount: 2,
            mismatchText: "Only two sentences here.",
          },
        }),
      ],
    });
  });

  it("reports structure mismatch context at the start of a section", () => {
    const markdown = [
      "<!-- cadence:overview -->",
      "",
      "One sentence.",
      "",
      "<!-- /cadence:overview -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        filePath: "guide.md",
        sectionRules: {
          overview: [[2]],
        },
      }),
    ).toEqual({
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          message:
            "Cadence section 'overview' structure does not match expected structures.",
          location: {
            filePath: "guide.md",
            line: 1,
            column: 1,
          },
          observedStructure: "1",
          expectedStructures: ["2"],
          structureContext: {
            previousSentences: ["One sentence."],
            mismatchParagraph: 1,
            expectedSentenceCount: 2,
            observedSentenceCount: 1,
            mismatchText: "One sentence.",
          },
        }),
      ],
    });
  });

  it("uses configured section rules as known cadence section names", () => {
    expect(
      lintMarkdown(
        [
          "<!-- cadence:body -->",
          "",
          "One sentence.",
          "",
          "<!-- /cadence:body -->",
        ].join("\n"),
        {
          filePath: "guide.md",
          sectionRules: {
            intro: [[1]],
          },
        },
      ),
    ).toEqual({
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          message: "Unknown cadence section 'body'.",
          location: {
            filePath: "guide.md",
            line: 1,
            column: 1,
          },
        }),
        expect.objectContaining({
          severity: "error",
          message: "Unknown cadence section 'body'.",
          location: {
            filePath: "guide.md",
            line: 5,
            column: 1,
          },
        }),
      ],
    });
  });

  it("reports invalid cadence marker state as lint errors", () => {
    expect(
      lintMarkdown("<!-- cadence:intro -->\n", {
        filePath: "guide.md",
      }),
    ).toEqual({
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          message: "Unmatched opening cadence marker for section 'intro'.",
          location: {
            filePath: "guide.md",
            line: 1,
            column: 1,
          },
        }),
      ],
    });
  });

  it("uses the configured language when counting sentences in marked sections", () => {
    const markdown = [
      "<!-- cadence:intro -->",
      "",
      "M. Dupont parle avec Mme. Durand. Elle ecoute.",
      "",
      "<!-- /cadence:intro -->",
    ].join("\n");

    expect(
      lintMarkdown(markdown, {
        language: "fr",
        sectionRules: {
          intro: [[2]],
        },
      }),
    ).toEqual({
      diagnostics: [],
    });
  });
});
