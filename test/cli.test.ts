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

    expect(result.stdout).toBe("cadence-lint: no issues found");
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

    expect(result.stdout).toBe("cadence-lint: no issues found");
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
