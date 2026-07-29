#!/usr/bin/env node
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import {
  formatDiagnostics,
  getDiagnosticExitCode,
  lintMarkdown,
  parseStructurePattern,
  type LintDiagnostic,
  type SectionStructureRules,
} from "../index.js";

const program = new Command();

program
  .name("cadence-lint")
  .description("Lint Markdown prose structure and cadence.")
  .argument("[files...]", "Markdown files to lint")
  .option(
    "--section-rule <section=pattern>",
    "Allowed sentence-count structure for a cadence section, for example intro=1/3/1. Repeat for alternatives.",
    collectSectionRule,
    [] as string[],
  )
  .version("0.1.0");

interface CliOptions {
  sectionRule: string[];
}

program.action(async (files: string[], options: CliOptions) => {
  const sectionRules = parseSectionRules(options.sectionRule);
  const diagnostics: LintDiagnostic[] = [];

  for (const filePath of files) {
    const markdown = await readFile(filePath, "utf8");
    const result = lintMarkdown(markdown, {
      filePath,
      sectionRules,
    });
    diagnostics.push(...result.diagnostics);
  }

  if (diagnostics.length === 0) {
    console.log("cadence-lint: no issues found");
    return;
  }

  console.log(formatDiagnostics(diagnostics));
  process.exitCode = getDiagnosticExitCode(diagnostics);
});

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

function collectSectionRule(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseSectionRules(rules: readonly string[]): SectionStructureRules {
  const sectionRules: Record<string, number[][]> = {};

  for (const rule of rules) {
    const separatorIndex = rule.indexOf("=");

    if (separatorIndex <= 0 || separatorIndex === rule.length - 1) {
      throw new Error(
        `Section rule must use the format <section>=<pattern>; received "${rule}".`,
      );
    }

    const sectionName = rule.slice(0, separatorIndex);
    const pattern = rule.slice(separatorIndex + 1);
    sectionRules[sectionName] ??= [];
    sectionRules[sectionName].push(parseStructurePattern(pattern));
  }

  return sectionRules;
}
