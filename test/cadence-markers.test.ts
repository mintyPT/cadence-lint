import { describe, expect, it } from "vitest";
import {
  parseCadenceMarkedSections,
  parseMarkdownDocument,
  validateCadenceMarkers,
} from "../src/index.js";

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

describe("validateCadenceMarkers", () => {
  it("reports nested cadence sections as marker structure errors", () => {
    const document = parseMarkdownDocument([
      "<!-- cadence:intro -->",
      "",
      "Intro paragraph.",
      "",
      "<!-- cadence:detail -->",
      "",
      "Nested paragraph.",
      "",
      "<!-- /cadence:detail -->",
      "",
      "<!-- /cadence:intro -->",
    ].join("\n"));

    expect(validateCadenceMarkers(document, { filePath: "guide.md" })).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Nested cadence section 'detail' inside 'intro'.",
        location: {
          filePath: "guide.md",
          line: 5,
          column: 1,
        },
      }),
      expect.objectContaining({
        severity: "error",
        message: "Unmatched closing cadence marker for section 'detail'.",
        location: {
          filePath: "guide.md",
          line: 9,
          column: 1,
        },
      }),
    ]);
  });

  it("reports unmatched opening and closing cadence markers", () => {
    const document = parseMarkdownDocument([
      "<!-- /cadence:intro -->",
      "",
      "<!-- cadence:detail -->",
      "",
      "Detail paragraph.",
    ].join("\n"));

    expect(validateCadenceMarkers(document, { filePath: "guide.md" })).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Unmatched closing cadence marker for section 'intro'.",
        location: {
          filePath: "guide.md",
          line: 1,
          column: 1,
        },
      }),
      expect.objectContaining({
        severity: "error",
        message: "Unmatched opening cadence marker for section 'detail'.",
        location: {
          filePath: "guide.md",
          line: 3,
          column: 1,
        },
      }),
    ]);
  });

  it("reports malformed standalone cadence marker comments", () => {
    const document = parseMarkdownDocument([
      "<!-- cadence:section intro -->",
      "",
      "Plain prose.",
    ].join("\n"));

    expect(validateCadenceMarkers(document, { filePath: "guide.md" })).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Malformed cadence marker syntax.",
        location: {
          filePath: "guide.md",
          line: 1,
          column: 1,
        },
      }),
    ]);
  });

  it("reports marked sections with no normal paragraphs", () => {
    const document = parseMarkdownDocument([
      "<!-- cadence:intro -->",
      "",
      "<!-- a non-paragraph comment -->",
      "",
      "<!-- /cadence:intro -->",
    ].join("\n"));

    expect(validateCadenceMarkers(document, { filePath: "guide.md" })).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Cadence section 'intro' must contain at least one normal paragraph.",
        location: {
          filePath: "guide.md",
          line: 1,
          column: 1,
        },
      }),
    ]);
  });

  it("reports unknown cadence section names when allowed names are supplied", () => {
    const document = parseMarkdownDocument([
      "<!-- cadence:intro -->",
      "",
      "Intro paragraph.",
      "",
      "<!-- /cadence:intro -->",
    ].join("\n"));

    expect(
      validateCadenceMarkers(document, {
        filePath: "guide.md",
        allowedSectionNames: ["summary"],
      }),
    ).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Unknown cadence section 'intro'.",
        location: {
          filePath: "guide.md",
          line: 1,
          column: 1,
        },
      }),
      expect.objectContaining({
        severity: "error",
        message: "Unknown cadence section 'intro'.",
        location: {
          filePath: "guide.md",
          line: 5,
          column: 1,
        },
      }),
    ]);
  });
});
