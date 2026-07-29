import { describe, expect, it } from "vitest";
import { execa } from "execa";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cliTestTimeout = 10_000;

describe("cli", () => {
  it("identifies cadence-lint in help output", async () => {
    const result = await execa("tsx", ["src/cli/index.ts", "--help"]);

    expect(result.stdout).toContain("Usage: cadence-lint [options] [files...]");
    expect(result.stdout).toContain("Lint Markdown prose structure and cadence.");
  }, cliTestTimeout);

  it("accepts Markdown files for linting", async () => {
    const result = await execa("tsx", ["src/cli/index.ts", "README.md"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "README.md:3:1 warning Normal paragraph is not covered by cadence markers.",
    );
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

  it("reports a clear error for an unsupported effective language", async () => {
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

    const result = await execa("tsx", [join(process.cwd(), "src/cli/index.ts"), filePath], {
      cwd: directory,
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("cadence-lint: unsupported language: fr");
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
