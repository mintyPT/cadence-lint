import { describe, expect, it } from "vitest";
import { parseStructurePattern } from "../src/index.js";

describe("parseStructurePattern", () => {
  it("parses slash-separated positive integers into sentence counts", () => {
    expect(parseStructurePattern("1/3/1")).toEqual([1, 3, 1]);
    expect(parseStructurePattern("5/1")).toEqual([5, 1]);
  });

  it.each([
    ["", "Structure pattern must not be empty."],
    ["   ", "Structure pattern must not be empty."],
    ["1//3", "Structure pattern segment 2 is empty in \"1//3\"."],
    ["1/three/1", "Structure pattern segment 2 must be a positive integer in \"1/three/1\"."],
    ["1/0/1", "Structure pattern segment 2 must be greater than zero in \"1/0/1\"."],
    ["1/-2/1", "Structure pattern segment 2 must be a positive integer in \"1/-2/1\"."],
  ])("rejects malformed structure pattern %j", (pattern, message) => {
    expect(() => parseStructurePattern(pattern)).toThrow(message);
  });
});
