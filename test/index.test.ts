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
