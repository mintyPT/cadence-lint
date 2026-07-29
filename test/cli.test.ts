import { describe, expect, it } from "vitest";
import { execa } from "execa";

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
});
