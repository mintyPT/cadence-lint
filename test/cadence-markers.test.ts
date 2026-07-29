import { describe, expect, it } from "vitest";
import { parseCadenceMarkedSections, parseMarkdownDocument } from "../src/index.js";

describe("parseCadenceMarkedSections", () => {
  it("associates paragraphs between standalone opening and closing cadence markers", () => {
    const document = parseMarkdownDocument([
      "Before the marked range.",
      "",
      "<!-- cadence:intro -->",
      "",
      "First marked paragraph.",
      "",
      "Second marked paragraph.",
      "",
      "<!-- /cadence:intro -->",
      "",
      "After the marked range.",
    ].join("\n"));

    expect(parseCadenceMarkedSections(document)).toEqual([
      {
        name: "intro",
        openingMarker: {
          type: "openingMarker",
          name: "intro",
          line: 3,
          column: 1,
          endLine: 3,
          endColumn: 23,
        },
        closingMarker: {
          type: "closingMarker",
          name: "intro",
          line: 9,
          column: 1,
          endLine: 9,
          endColumn: 24,
        },
        paragraphs: [
          {
            type: "paragraph",
            text: "First marked paragraph.",
            line: 5,
            column: 1,
            endLine: 5,
            endColumn: 24,
          },
          {
            type: "paragraph",
            text: "Second marked paragraph.",
            line: 7,
            column: 1,
            endLine: 7,
            endColumn: 25,
          },
        ],
      },
    ]);
  });

  it("ignores inline and non-marker cadence-like comments", () => {
    const document = parseMarkdownDocument([
      "Inline <!-- cadence:inline --> text must stay unmarked.",
      "",
      "<!-- cadence:section intro -->",
      "",
      "This paragraph is outside any valid marked range.",
      "",
      "<!-- cadence:intro --> trailing text",
      "",
      "This paragraph is also outside any valid marked range.",
      "",
      "<!-- /cadence:intro -->",
    ].join("\n"));

    expect(parseCadenceMarkedSections(document)).toEqual([]);
  });
});
