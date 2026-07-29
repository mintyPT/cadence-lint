#!/usr/bin/env node
import { Command } from "commander";
import { lintMarkdown } from "../index.js";

const program = new Command();

program
  .name("cadence-lint")
  .description("Lint Markdown prose structure and cadence.")
  .argument("[files...]", "Markdown files to lint")
  .version("0.1.0");

program.action((_files: string[]) => {
  const result = lintMarkdown("");

  if (result.diagnostics.length === 0) {
    console.log("cadence-lint: no issues found");
    return;
  }

  for (const diagnostic of result.diagnostics) {
    console.log(`${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`);
  }
});

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
