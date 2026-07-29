import { describe, expect, it } from "vitest";
import { splitSentences } from "../src/index.js";

describe("splitSentences", () => {
  it("splits a paragraph on terminal punctuation and returns source spans", () => {
    expect(splitSentences("First sentence. Is this second? Yes!")).toEqual([
      {
        text: "First sentence.",
        start: 0,
        end: 15,
      },
      {
        text: "Is this second?",
        start: 16,
        end: 31,
      },
      {
        text: "Yes!",
        start: 32,
        end: 36,
      },
    ]);
  });

  it("keeps punctuation inside regex protected spans within the sentence", () => {
    const paragraph =
      "Dr. A. B. Stone paid 3.50 at https://example.com/a.b now. Done.";

    expect(
      splitSentences(paragraph, {
        protectedPatterns: [
          /\bDr\./,
          /(?:\b[A-Z]\.\s*){2,}/,
          /\b\d+\.\d+\b/,
          /https?:\/\/\S+/,
        ],
      }),
    ).toEqual([
      {
        text: "Dr. A. B. Stone paid 3.50 at https://example.com/a.b now.",
        start: 0,
        end: 57,
      },
      {
        text: "Done.",
        start: 58,
        end: 63,
      },
    ]);
  });

  it("splits unprotected punctuation even when it resembles an exception", () => {
    expect(splitSentences("Dr. Stone paid 3.50.")).toEqual([
      {
        text: "Dr.",
        start: 0,
        end: 3,
      },
      {
        text: "Stone paid 3.",
        start: 4,
        end: 17,
      },
      {
        text: "50.",
        start: 17,
        end: 20,
      },
    ]);
  });

  it("uses built-in English exceptions for common abbreviations", () => {
    expect(splitSentences("Dr. Stone arrived at 3 p.m. for tea. He stayed.", { language: "en" }))
      .toHaveLength(2);
  });

  it("uses built-in French exceptions for common abbreviations", () => {
    expect(splitSentences("M. Dupont parle avec Mme. Durand. Elle ecoute.", { language: "fr" }))
      .toHaveLength(2);
  });

  it("uses built-in Portuguese exceptions for common abbreviations", () => {
    expect(splitSentences("O Sr. Silva falou com a Sra. Costa. Ela respondeu.", { language: "pt" }))
      .toHaveLength(2);
  });

  it("merges user-provided exceptions with language built-ins", () => {
    expect(
      splitSentences("Dr. Stone joined Acme Inc. for lunch. It worked.", {
        language: "en",
        protectedPatterns: [/\bInc\./],
      }),
    ).toHaveLength(2);
  });

  it("rejects unsupported languages", () => {
    expect(() => splitSentences("One sentence.", { language: "es" })).toThrow(
      "cadence-lint: unsupported language: es",
    );
  });
});
