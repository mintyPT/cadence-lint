import { describe, expect, it } from "vitest";
import { execa } from "execa";

describe("cli", () => {
  it("prints a greeting", async () => {
    const result = await execa("tsx", ["src/cli/index.ts", "greet", "World"]);

    expect(result.stdout).toBe("Hello, World!");
  });
});
