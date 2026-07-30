import { describe, expect, it } from "vitest";
import {
  formatDiagnostic,
  formatDiagnostics,
  getDiagnosticExitCode,
  type LintDiagnostic,
} from "../src/index.js";

describe("diagnostics", () => {
  it("formats a diagnostic with severity, location, message, and section metadata", () => {
    const diagnostic: LintDiagnostic = {
      severity: "error",
      message: "Expected section order intro -> evidence -> takeaway.",
      location: {
        filePath: "README.md",
        line: 12,
        column: 3,
      },
      section: {
        title: "Launch notes",
        line: 8,
        level: 2,
      },
      observedStructure: "intro -> takeaway",
      expectedStructures: ["intro -> evidence -> takeaway"],
      structureContext: {
        previousSentences: ["Intro sentence.", "Evidence sentence."],
        mismatchParagraph: 3,
        mismatchText: "Takeaway sentence.",
      },
    };

    expect(formatDiagnostic(diagnostic)).toBe(
      "README.md:12:3 error Expected section order intro -> evidence -> takeaway. [section: Launch notes, heading line: 8, level: 2, observed: intro -> takeaway, expected: intro -> evidence -> takeaway, context: previous \"Intro sentence.\" | \"Evidence sentence.\"; mismatch paragraph 3 \"Takeaway sentence.\"]",
    );
  });

  it("formats multiple diagnostics one per line", () => {
    const diagnostics: LintDiagnostic[] = [
      {
        severity: "warning",
        message: "Sentence cadence is repetitive.",
        location: {
          filePath: "guide.md",
          line: 4,
          column: 1,
        },
      },
      {
        severity: "error",
        message: "Missing required summary section.",
        location: {
          filePath: "guide.md",
          line: 18,
          column: 1,
        },
      },
    ];

    expect(formatDiagnostics(diagnostics)).toBe(
      [
        "guide.md:4:1 warning Sentence cadence is repetitive.",
        "guide.md:18:1 error Missing required summary section.",
      ].join("\n"),
    );
  });

  it("returns a failing exit code only when an error diagnostic exists", () => {
    expect(getDiagnosticExitCode([])).toBe(0);
    expect(
      getDiagnosticExitCode([
        {
          severity: "warning",
          message: "Sentence cadence is repetitive.",
          location: {
            filePath: "guide.md",
            line: 4,
            column: 1,
          },
        },
      ]),
    ).toBe(0);
    expect(
      getDiagnosticExitCode([
        {
          severity: "error",
          message: "Missing required summary section.",
          location: {
            filePath: "guide.md",
            line: 18,
            column: 1,
          },
        },
      ]),
    ).toBe(1);
  });
});
