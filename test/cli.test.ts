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
