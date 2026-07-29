import { describe, expect, it } from "vitest";
import { lintMarkdown } from "../src/index.js";

describe("lintMarkdown", () => {
  it("returns an empty lint result while rules are not implemented", () => {
    expect(lintMarkdown("# Title\n\nPlain prose.\n")).toEqual({
      diagnostics: [],
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
});
