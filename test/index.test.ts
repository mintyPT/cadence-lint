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
