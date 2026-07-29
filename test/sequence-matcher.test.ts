import { describe, expect, it } from "vitest";
import { matchSequence } from "../src/index.js";

describe("matchSequence", () => {
  it("matches one allowed structure against a whole section", () => {
    expect(matchSequence([1, 3, 1], [[1, 3, 1]])).toEqual({
      passed: true,
      segmentation: [[1, 3, 1]],
    });
  });

  it("repeats allowed structures to consume longer sections", () => {
    expect(matchSequence([1, 3, 1, 2, 2, 1, 3, 1], [[1, 3, 1], [2, 2]])).toEqual({
      passed: true,
      segmentation: [[1, 3, 1], [2, 2], [1, 3, 1]],
    });
  });

  it("backtracks across overlapping patterns instead of failing greedily", () => {
    expect(matchSequence([1, 2, 3], [[1, 2], [1], [2, 3]])).toEqual({
      passed: true,
      segmentation: [[1], [2, 3]],
    });
  });

  it("returns the unmatched suffix start index when exact segmentation fails", () => {
    expect(matchSequence([1, 3, 1, 2, 4], [[1, 3, 1], [2, 2]])).toEqual({
      passed: false,
      unmatchedSuffixStart: 3,
    });
  });

  it("rejects empty allowed patterns", () => {
    expect(() => matchSequence([1], [[]])).toThrow(
      "Allowed sequence patterns must not be empty.",
    );
  });
});
