import { describe, expect, it } from "vitest";
import { execa } from "execa";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliTestTimeout = 30_000;

describe("cli", () => {
  it("identifies cadence-lint in help output", async () => {
    const result = await execa("tsx", ["src/cli/index.ts", "--help"]);

    expect(result.stdout).toContain("Usage: cadence-lint [options] [files...]");
    expect(result.stdout).toContain("Lint Markdown prose structure and cadence.");
  }, cliTestTimeout);

  it("includes concise field notes in help output", async () => {
    const result = await execa("tsx", ["src/cli/index.ts", "--help"]);

    expect(result.stdout).toContain("Field notes:");
    expect(result.stdout).toContain(
      "Lint marked prose sections before publishing a README or guide.",
    );
    expect(result.stdout).toContain(
      "Load configured section structures from cadence.config.jsonc.",
    );
    expect(result.stdout).toContain(
      "Use --format json when CI or editor tooling needs diagnostics.",
    );
  }, cliTestTimeout);

  it("accepts Markdown files for linting", async () => {
    const result = await execa("tsx", ["src/cli/index.ts", "README.md"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "README.md:3:1 warning Normal paragraph is not covered by cadence markers.",
    );
  }, cliTestTimeout);

  it("emits valid JSON diagnostics when requested", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(filePath, "Plain prose outside markers.\n");

    const result = await execa("tsx", [
      "src/cli/index.ts",
      "--format",
      "json",
      filePath,
    ]);

    expect(JSON.parse(result.stdout)).toEqual({
      diagnostics: [
        {
          severity: "warning",
          message: "Normal paragraph is not covered by cadence markers.",
          location: {
            filePath,
            line: 1,
            column: 1,
          },
        },
      ],
    });
  }, cliTestTimeout);

  it("emits JSON errors and warnings with stable diagnostic fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "Plain prose outside markers.",
        "",
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "Second paragraph has two sentences. It mismatches.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [
        "src/cli/index.ts",
        "--format",
        "json",
        "--section-rule",
        "intro=1/1",
        filePath,
      ],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      diagnostics: [
        {
          severity: "warning",
          message: "Normal paragraph is not covered by cadence markers.",
          location: {
            filePath,
            line: 1,
            column: 1,
          },
        },
        {
          severity: "error",
          message:
            "Cadence section 'intro' structure does not match expected structures.",
          location: {
            filePath,
            line: 3,
            column: 1,
          },
          observedStructure: "1/2",
          expectedStructures: ["1/1"],
          structureContext: {
            previousSentences: [
              "One sentence.",
              "Second paragraph has two sentences.",
              "It mismatches.",
            ],
            mismatchParagraph: 2,
            expectedSentenceCount: 1,
            observedSentenceCount: 2,
            mismatchText: "Second paragraph has two sentences.",
          },
        },
      ],
    });
  }, cliTestTimeout);

  it("emits unmatched suffix start in JSON structure diagnostics", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "First sentence. Second sentence. Third sentence.",
        "",
        "Last sentence.",
        "",
        "Unexpected sentence count. This paragraph does not match. The suffix starts here. Still wrong.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [
        "src/cli/index.ts",
        "--format",
        "json",
        "--section-rule",
        "intro=1/3/1,2",
        filePath,
      ],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        observedStructure: "1/3/1/4",
        expectedStructures: ["1/3/1", "2"],
        unmatchedSuffixStart: 4,
      }),
    );
  }, cliTestTimeout);

  it("emits an empty JSON diagnostics list when no issues are found", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa("tsx", [
      "src/cli/index.ts",
      "--format",
      "json",
      "--section-rule",
      "intro=1",
      filePath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ diagnostics: [] });
  }, cliTestTimeout);

  it("requires at least one file or glob target", async () => {
    const result = await execa("tsx", ["src/cli/index.ts"], { reject: false });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      "cadence-lint: at least one file or glob target is required",
    );
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("reports a clear error for a missing file target", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "missing.md");

    const result = await execa("tsx", ["src/cli/index.ts", filePath], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`cadence-lint: target did not match any file: ${filePath}`);
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("lints files matched by a glob target", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    await writeFile(join(directory, "one.md"), "One sentence.\n");
    await writeFile(join(directory, "two.md"), "Two sentences. Still valid.\n");

    const result = await execa("tsx", ["src/cli/index.ts", join(directory, "*.md")]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      `${directory}/one.md:1:1 warning Normal paragraph is not covered by cadence markers.`,
    );
    expect(result.stdout).toContain(
      `${directory}/two.md:1:1 warning Normal paragraph is not covered by cadence markers.`,
    );
  }, cliTestTimeout);

  it("reports a clear error for an unmatched glob target", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const target = join(directory, "*.md");

    const result = await execa("tsx", ["src/cli/index.ts", target], {
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`cadence-lint: target did not match any file: ${target}`);
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("reports diagnostics with source paths for multiple files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const firstFilePath = join(directory, "first.md");
    const secondFilePath = join(directory, "second.md");
    const invalidSection = [
      "<!-- cadence:intro -->",
      "",
      "One sentence. Another sentence.",
      "",
      "<!-- /cadence:intro -->",
    ].join("\n");
    await writeFile(firstFilePath, invalidSection);
    await writeFile(secondFilePath, invalidSection);

    const result = await execa(
      "tsx",
      [
        "src/cli/index.ts",
        "--section-rule",
        "intro=1",
        firstFilePath,
        secondFilePath,
      ],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`${firstFilePath}:1:1 error`);
    expect(result.stdout).toContain(`${secondFilePath}:1:1 error`);
  }, cliTestTimeout);

  it("exits zero for coverage warnings without errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(filePath, "Plain prose outside markers.\n");

    const result = await execa("tsx", ["src/cli/index.ts", filePath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      `${filePath}:1:1 warning Normal paragraph is not covered by cadence markers.`,
    );
  }, cliTestTimeout);

  it("exits nonzero when coverage warnings are reported with errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "Plain prose outside markers.",
        "",
        "<!-- cadence:intro -->",
        "",
        "One sentence. Second sentence.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--section", "intro=1", filePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      `${filePath}:1:1 warning Normal paragraph is not covered by cadence markers.`,
    );
    expect(result.stdout).toContain(
      `${filePath}:3:1 error Cadence section 'intro' structure does not match expected structures.`,
    );
  }, cliTestTimeout);

  it("accepts repeatable section flags", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "<!-- /cadence:intro -->",
        "",
        "<!-- cadence:body -->",
        "",
        "First sentence. Second sentence.",
        "",
        "<!-- /cadence:body -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [
        "src/cli/index.ts",
        "--section",
        "intro=1",
        "--section",
        "body=2",
        filePath,
      ],
    );

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("accepts multiple patterns in one section flag", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.",
        "",
        "Last sentence.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--section", "intro=1/3/1,1/5/1", filePath],
    );

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("keeps accepting legacy section-rule flags", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--section-rule", "intro=1", filePath],
    );

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("loads section rules and regex exceptions from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        "  // JSONC is accepted.",
        '  "language": "en",',
        '  "sections": {',
        '    "intro": ["1"],',
        "  },",
        '  "exceptions": ["Dr\\\\."],',
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "Dr. Stone arrived.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
    });

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("loads arbitrary named section rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "sections": {',
        '    "overview": ["1/2"]',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "<!-- cadence:overview -->",
        "",
        "One sentence.",
        "",
        "First sentence. Second sentence.",
        "",
        "<!-- /cadence:overview -->",
      ].join("\n"),
    );

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
    });

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("loads section balance rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "essay.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "sectionBalance": {',
        '    "measure": "words",',
        '    "maxLargestToSmallestRatio": 2,',
        '    "ignoreHeadings": ["Introduction"]',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "## Introduction",
        "",
        "Ignored.",
        "",
        "## Background",
        "",
        "One two.",
        "",
        "## Argument",
        "",
        "One two three four five.",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        message:
          "Section balance exceeds configured words ratio: 'Argument' is 2.50x 'Background'.",
        observedStructure: "Argument:5 / Background:2 (words)",
        expectedStructures: ["largest-to-smallest ratio <= 2"],
      }),
    );
  }, cliTestTimeout);

  it("loads list balance rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "post.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "listBalance": {',
        '    "maxConsecutiveLists": 1,',
        '    "requireParagraphBeforeList": true,',
        '    "requireParagraphAfterList": true',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "## Body",
        "",
        "- First list",
        "",
        "1. Second list",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "List balance requires a prose paragraph before each list.",
        }),
        expect.objectContaining({
          message: "List balance allows at most 1 consecutive list.",
        }),
        expect.objectContaining({
          message: "List balance requires a prose paragraph after each list.",
        }),
      ]),
    );
  }, cliTestTimeout);

  it("loads required heading order from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "essay.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "headingOrder": ["Introduction", "Argument", "Conclusion"]',
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "## Introduction",
        "",
        "Opening.",
        "",
        "## Conclusion",
        "",
        "Closing.",
        "",
        "## Argument",
        "",
        "Point.",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Heading 'Argument' appears before a required earlier heading.",
        observedStructure: "Introduction -> Conclusion -> Argument",
        expectedStructures: ["Introduction -> Argument -> Conclusion"],
      }),
    );
  }, cliTestTimeout);

  it("loads required heading presence rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "essay.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "requiredHeadings": ["Introduction", "Argument", "Evidence", "Conclusion"]',
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "## Introduction",
        "",
        "Open.",
        "",
        "## Argument",
        "",
        "Claim.",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Required heading 'Evidence' is missing.",
          expectedStructures: ["Introduction", "Argument", "Evidence", "Conclusion"],
        }),
        expect.objectContaining({
          message: "Required heading 'Conclusion' is missing.",
        }),
      ]),
    );
  }, cliTestTimeout);

  it("loads title rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "post.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "title": {',
        '    "maxWords": 3,',
        '    "allowSubtitle": false',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "# This Title Is Too Long",
        "",
        "Subtitle here.",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Title has 5 words; expected <= 3.",
        }),
        expect.objectContaining({
          message: "Subtitle is not allowed by configured title rules.",
        }),
      ]),
    );
  }, cliTestTimeout);

  it("loads introduction rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "essay.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "introduction": {',
        '    "heading": "Introduction",',
        '    "maxParagraphs": 1,',
        '    "allowedStructures": ["2"],',
        '    "requireLastSentenceMarker": ["This essay argues"]',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "## Introduction",
        "",
        "Context opens.",
        "",
        "The point is implied.",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Introduction has 2 paragraphs; expected <= 1.",
        }),
        expect.objectContaining({
          message: "Introduction sentence structure does not match allowed structures.",
          observedStructure: "1/1",
        }),
        expect.objectContaining({
          message: "Introduction final sentence is missing a required marker phrase.",
        }),
      ]),
    );
  }, cliTestTimeout);

  it("loads wording rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "post.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "wording": {',
        '    "bannedTerms": ["very", "clean up"],',
        '    "useDefaults": false',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(filePath, "We should clean up this very short draft.\n");

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Wording uses banned custom term 'clean up'.",
        }),
        expect.objectContaining({
          message: "Wording uses banned custom term 'very'.",
        }),
      ]),
    );
  }, cliTestTimeout);

  it("loads list discipline rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "post.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "lists": {',
        '    "maxItems": 1,',
        '    "maxWordsPerItem": 3,',
        '    "maxDepth": 1,',
        '    "allowedPrefixes": ["Add"]',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "- Add concise point",
        "- Drift into too many words",
        "  - Add nested point",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "List has 2 items; expected <= 1.",
        }),
        expect.objectContaining({
          message: "List item has 5 words; expected <= 3.",
        }),
        expect.objectContaining({
          message: "List item depth is 2; expected <= 1.",
        }),
        expect.objectContaining({
          message: "List item does not start with an allowed prefix.",
        }),
      ]),
    );
  }, cliTestTimeout);

  it("loads transition rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "post.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "transitions": {',
        '    "requiredAtHeadingLevels": [2],',
        '    "allowedStarts": ["However", "Finally"]',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "## Argument",
        "",
        "The point starts abruptly.",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Section 'Argument' first sentence does not start with an allowed transition.",
        observedStructure: "The point starts abruptly.",
        expectedStructures: ["However", "Finally"],
      }),
    );
  }, cliTestTimeout);

  it("loads heading hierarchy rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "post.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "headings": {',
        '    "maxDepth": 2,',
        '    "forbidSkippedLevels": true,',
        '    "singleH1": true',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(filePath, "# First\n\n# Second\n\n#### Too Deep\n");

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Document has multiple H1 headings.",
        }),
        expect.objectContaining({
          message: "Heading depth is 4; expected <= 2.",
        }),
        expect.objectContaining({
          message: "Heading level skips from H1 to H4.",
        }),
      ]),
    );
  }, cliTestTimeout);

  it("applies configured heading section rules to Markdown heading sections", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "essay.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "headingSections": {',
        '    "Introduction": ["2/1"]',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "## Introduction",
        "",
        "One sentence.",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Heading section 'Introduction' paragraph structure does not match allowed structures.",
        observedStructure: "1",
        expectedStructures: ["2/1"],
      }),
    );
  }, cliTestTimeout);

  it("loads section length rules from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "essay.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "sectionLength": {',
        '    "default": { "maxParagraphs": 1, "maxWords": 6 },',
        '    "Introduction": { "maxParagraphs": 3, "maxWords": 4 }',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "## Introduction",
        "",
        "One two three four five.",
        "",
        "## Body",
        "",
        "One sentence.",
        "",
        "Second paragraph.",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      { cwd: directory, reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Section 'Introduction' has 5 words; expected <= 4.",
        }),
        expect.objectContaining({
          message: "Section 'Body' has 2 paragraphs; expected <= 1.",
        }),
      ]),
    );
  }, cliTestTimeout);

  it("loads described section structures from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "sections": {',
        '    "overview": {',
        '      "pattern": [',
        '        { "count": 1, "description": "Introduce the idea" },',
        '        { "count": 3, "description": "Develop the idea" },',
        '        { "count": 1, "description": "Conclude the idea" }',
        "      ],",
        '      "description": "Opening overview"',
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "<!-- cadence:overview -->",
        "",
        "One sentence.",
        "",
        "First sentence. Second sentence.",
        "",
        "<!-- /cadence:overview -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--format", "json", filePath],
      {
        cwd: directory,
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics).toContainEqual(
      expect.objectContaining({
        observedStructure: "1/2",
        expectedStructures: ["1/3/1"],
        expectedStructureDetails: [
          {
            pattern: "1/3/1",
            description: "Opening overview",
            segmentDescriptions: [
              "Introduce the idea",
              "Develop the idea",
              "Conclude the idea",
            ],
          },
        ],
      }),
    );
  }, cliTestTimeout);

  it("loads anchored section structures from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "sections": {',
        '    "overview": {',
        '      "start": ["1/3/1"],',
        '      "middle": [',
        '        {',
        '          "pattern": [',
        '            { "count": 1, "description": "Open middle" },',
        '            { "count": 5, "description": "Develop middle" },',
        '            { "count": 1, "description": "Close middle" }',
        "          ],",
        '          "description": "Middle body"',
        "        }",
        "      ],",
        '      "end": ["1/2/1"]',
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "<!-- cadence:overview -->",
        "",
        "One sentence.",
        "",
        "First sentence. Second sentence. Third sentence.",
        "",
        "Last sentence.",
        "",
        "Middle opens.",
        "",
        "One. Two. Three. Four. Five.",
        "",
        "Middle closes.",
        "",
        "Final opens.",
        "",
        "One. Two.",
        "",
        "Final closes.",
        "",
        "<!-- /cadence:overview -->",
      ].join("\n"),
    );

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
    });

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("loads anchored section alternatives from cadence.config.jsonc", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "sections": {',
        '    "overview": {',
        '      "start": ["1/3/1", "3/1"],',
        '      "middle": ["1/5/1", "1/4/2"],',
        '      "end": ["1/2/1"]',
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "<!-- cadence:overview -->",
        "",
        "First sentence. Second sentence. Third sentence.",
        "",
        "Start closes.",
        "",
        "Middle one opens.",
        "",
        "One. Two. Three. Four. Five.",
        "",
        "Middle one closes.",
        "",
        "Middle two opens.",
        "",
        "One. Two. Three. Four.",
        "",
        "Two-sentence close. Still closing.",
        "",
        "Final opens.",
        "",
        "One. Two.",
        "",
        "Final closes.",
        "",
        "<!-- /cadence:overview -->",
      ].join("\n"),
    );

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
    });

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("loads issue-style described count arrays as one section structure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "sections": {',
        '    "overview": [',
        '      { "count": 1, "description": "Introduce the idea" },',
        '      { "count": 3, "description": "Develop the idea" },',
        '      { "count": 1, "description": "Conclude the idea" }',
        "    ]",
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "<!-- cadence:overview -->",
        "",
        "One sentence.",
        "",
        "First sentence. Second sentence. Third sentence.",
        "",
        "Last sentence.",
        "",
        "<!-- /cadence:overview -->",
      ].join("\n"),
    );

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
    });

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("allows a missing auto-discovered config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(filePath, "One sentence.\n");

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      `${filePath}:1:1 warning Normal paragraph is not covered by cadence markers.`,
    );
  }, cliTestTimeout);

  it("reports a clear error for a missing explicit config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    const configPath = join(directory, "missing.config.jsonc");
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--config", configPath, filePath],
      {
        cwd: directory,
        reject: false,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`cadence-lint: config file not found: ${configPath}`);
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("lets section flags override config section rules", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "sections": {',
        '    "intro": ["2"]',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--section", "intro=1", filePath],
      { cwd: directory },
    );

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("lets the language flag override the config language", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "language": "fr"',
        "}",
      ].join("\n"),
    );
    await writeFile(filePath, "One sentence.\n");

    const result = await execa(
      "tsx",
      [join(process.cwd(), "src/cli/index.ts"), "--language", "en", filePath],
      { cwd: directory },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      `${filePath}:1:1 warning Normal paragraph is not covered by cadence markers.`,
    );
  }, cliTestTimeout);

  it("uses the configured language built-ins when linting section structures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "language": "fr",',
        '  "sections": {',
        '    "intro": ["2"]',
        "  }",
        "}",
      ].join("\n"),
    );
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "M. Dupont parle avec Mme. Durand. Elle ecoute.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
    });

    expect(result.stdout).toBe("cadence-lint: no issues found");
  }, cliTestTimeout);

  it("reports a clear error for an unsupported effective language", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      join(directory, "cadence.config.jsonc"),
      [
        "{",
        '  "language": "es"',
        "}",
      ].join("\n"),
    );
    await writeFile(filePath, "One sentence.\n");

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("cadence-lint: unsupported language: es");
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("fails unsupported CLI language before resolving file targets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const missingFilePath = join(directory, "missing.md");

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--language", "es", missingFilePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("cadence-lint: unsupported language: es");
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("fails invalid config regex exceptions before resolving file targets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const configPath = join(directory, "cadence.config.jsonc");
    const missingFilePath = join(directory, "missing.md");
    await writeFile(
      configPath,
      [
        "{",
        '  "exceptions": ["["]',
        "}",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--config", configPath, missingFilePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "cadence-lint: config exceptions[0] is not a valid regex:",
    );
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("fails malformed config structures before resolving file targets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const configPath = join(directory, "cadence.config.jsonc");
    const missingFilePath = join(directory, "missing.md");
    await writeFile(
      configPath,
      [
        "{",
        '  "sections": {',
        '    "intro": ["1//3"]',
        "  }",
        "}",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--config", configPath, missingFilePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('Structure pattern segment 2 is empty in "1//3".');
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("fails non-positive CLI section counts before resolving file targets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const missingFilePath = join(directory, "missing.md");

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--section", "intro=1/0/1", missingFilePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      'Structure pattern segment 2 must be greater than zero in "1/0/1".',
    );
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("fails empty config structure lists clearly before resolving file targets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const configPath = join(directory, "cadence.config.jsonc");
    const missingFilePath = join(directory, "missing.md");
    await writeFile(
      configPath,
      [
        "{",
        '  "sections": {',
        '    "intro": []',
        "  }",
        "}",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--config", configPath, missingFilePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      "cadence-lint: config section 'intro' must define at least one structure pattern",
    );
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("fails malformed section flags before linting", async () => {
    const missingFilePath = join(tmpdir(), "cadence-lint-missing.md");

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--section", "intro=", missingFilePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      'Section rule must use the format <section>=<pattern>; received "intro=".',
    );
    expect(result.stdout).toBe("");
  }, cliTestTimeout);

  it("reports unknown marked sections when section flags configure other rules", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "<!-- cadence:body -->",
        "",
        "One sentence.",
        "",
        "<!-- /cadence:body -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--section", "intro=1", filePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      `${filePath}:1:1 error Unknown cadence section 'body'.`,
    );
    expect(result.stdout).toContain(
      `${filePath}:5:1 error Unknown cadence section 'body'.`,
    );
  }, cliTestTimeout);

  it("reports structure errors from marked Markdown files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadence-lint-"));
    const filePath = join(directory, "guide.md");
    await writeFile(
      filePath,
      [
        "<!-- cadence:intro -->",
        "",
        "One sentence.",
        "",
        "Second paragraph has two sentences. It mismatches.",
        "",
        "<!-- /cadence:intro -->",
      ].join("\n"),
    );

    const result = await execa(
      "tsx",
      ["src/cli/index.ts", "--section-rule", "intro=1/1", filePath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      `${filePath}:1:1 error Cadence section 'intro' structure does not match expected structures.`,
    );
    expect(result.stdout).toContain("observed: 1/2");
    expect(result.stdout).toContain("expected: 1/1");
  }, cliTestTimeout);
});
