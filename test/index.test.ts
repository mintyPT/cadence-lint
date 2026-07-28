import { describe, expect, it } from "vitest";
import { lintMarkdown } from "../src/index.js";

describe("lintMarkdown", () => {
  it("returns an empty lint result while rules are not implemented", () => {
    expect(lintMarkdown("# Title\n\nPlain prose.\n")).toEqual({
      diagnostics: [],
    });
  });
});
