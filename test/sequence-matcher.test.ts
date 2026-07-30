import { describe, expect, it } from "vitest";
import { matchAnchoredSequence, matchSequence } from "../src/index.js";

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

describe("matchAnchoredSequence", () => {
  it("matches start, repeatable middle, and end anchors", () => {
    expect(
      matchAnchoredSequence([1, 3, 1, 1, 5, 1, 1, 5, 1, 1, 2, 1], {
        start: [[1, 3, 1]],
        middle: [[1, 5, 1]],
        end: [[1, 2, 1]],
      }),
    ).toEqual({
      passed: true,
      segmentation: [[1, 3, 1], [1, 5, 1], [1, 5, 1], [1, 2, 1]],
    });
  });

  it("matches alternatives in anchored start and middle buckets", () => {
    expect(
      matchAnchoredSequence([3, 1, 1, 5, 1, 1, 4, 2, 1, 2, 1], {
        start: [[1, 3, 1], [3, 1]],
        middle: [[1, 5, 1], [1, 4, 2]],
        end: [[1, 2, 1]],
      }),
    ).toEqual({
      passed: true,
      segmentation: [[3, 1], [1, 5, 1], [1, 4, 2], [1, 2, 1]],
    });
  });

  it("uses any patterns as middle alternatives when middle is omitted", () => {
    expect(
      matchAnchoredSequence([1, 3, 1, 1, 5, 1, 1, 2, 1], {
        any: [[1, 5, 1]],
        start: [[1, 3, 1]],
        end: [[1, 2, 1]],
      }),
    ).toEqual({
      passed: true,
      segmentation: [[1, 3, 1], [1, 5, 1], [1, 2, 1]],
    });
  });

  it("lets explicit middle patterns override any as anchored middle alternatives", () => {
    expect(
      matchAnchoredSequence([1, 3, 1, 1, 5, 1, 1, 2, 1], {
        any: [[1, 5, 1]],
        start: [[1, 3, 1]],
        middle: [[2, 2]],
        end: [[1, 2, 1]],
      }),
    ).toEqual({
      passed: false,
      unmatchedSuffixStart: 3,
      failurePlacement: "middle",
    });
  });

  it("reports start anchor failures", () => {
    expect(
      matchAnchoredSequence([2, 3, 1], {
        start: [[1, 3, 1]],
      }),
    ).toEqual({
      passed: false,
      unmatchedSuffixStart: 0,
      failurePlacement: "start",
    });
  });

  it("reports end anchor failures at the anchored suffix", () => {
    expect(
      matchAnchoredSequence([1, 3, 1, 1, 2, 2], {
        start: [[1, 3, 1]],
        end: [[1, 2, 1]],
      }),
    ).toEqual({
      passed: false,
      unmatchedSuffixStart: 5,
      failurePlacement: "end",
    });
  });
});
