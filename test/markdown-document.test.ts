import { describe, expect, it } from "vitest";
import { parseMarkdownDocument } from "../src/index.js";

describe("parseMarkdownDocument", () => {
  it("extracts normal Markdown paragraphs with text and line information", () => {
    const document = parseMarkdownDocument([
      "# Release notes",
      "",
      "Intro paragraph with **bold** text",
      "and a second line.",
      "",
      "- A list item is not a paragraph",
      "",
      "```ts",
      "const ignored = true;",
      "```",
      "",
      "| Column | Value |",
      "| ------ | ----- |",
      "| alpha  | beta  |",
      "",
      "Second paragraph keeps <!-- cadence:ignore --> marker comments.",
      "",
      "## Details",
      "",
    ].join("\n"));

    expect(document.paragraphs).toEqual([
      {
        text: "Intro paragraph with bold text\nand a second line.",
        line: 3,
        column: 1,
        endLine: 4,
        endColumn: 19,
      },
      {
        text: "Second paragraph keeps <!-- cadence:ignore --> marker comments.",
        line: 16,
        column: 1,
        endLine: 16,
        endColumn: 64,
      },
    ]);
  });

  it("preserves standalone HTML comments in block order for downstream marker parsing", () => {
    const document = parseMarkdownDocument([
      "First paragraph.",
      "",
      "<!-- cadence:section intro -->",
      "",
      "Second paragraph.",
    ].join("\n"));

    expect(document.blocks).toEqual([
      {
        type: "paragraph",
        text: "First paragraph.",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 17,
      },
      {
        type: "htmlComment",
        value: "<!-- cadence:section intro -->",
        line: 3,
        column: 1,
        endLine: 3,
        endColumn: 31,
      },
      {
        type: "paragraph",
        text: "Second paragraph.",
        line: 5,
        column: 1,
        endLine: 5,
        endColumn: 18,
      },
    ]);
  });
});
