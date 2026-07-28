import { describe, expect, it } from "vitest";
import { createGreeting } from "../src/index.js";

describe("createGreeting", () => {
  it("greets a trimmed name", () => {
    expect(createGreeting(" World ")).toBe("Hello, World!");
  });

  it("supports custom punctuation", () => {
    expect(createGreeting("World", { punctuation: "." })).toBe("Hello, World.");
  });

  it("rejects an empty name", () => {
    expect(() => createGreeting(" ")).toThrow("Name must not be empty.");
  });
});
