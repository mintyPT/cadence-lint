#!/usr/bin/env node
import { Command } from "commander";
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadCadenceConfig } from "./config.js";
import { formatDiagnosticsAsJson } from "../diagnostics.js";
import {
  formatDiagnostics,
  getDiagnosticExitCode,
  lintMarkdown,
  parseStructurePattern,
  validateSentenceLanguage,
  type LintDiagnostic,
  type SectionStructureRules,
} from "../index.js";

const program = new Command();

program
  .name("cadence-lint")
  .description("Lint Markdown prose structure and cadence.")
  .argument("[files...]", "Markdown files to lint")
  .option(
    "--section <section=pattern[,pattern...]>",
    "Allowed sentence-count structure for a cadence section, for example intro=1/3/1,1/5/1. Repeat for sections.",
    collectSectionRule,
    [] as string[],
  )
  .option(
    "--section-rule <section=pattern>",
    "Allowed sentence-count structure for a cadence section, for example intro=1/3/1. Repeat for alternatives.",
    collectSectionRule,
    [] as string[],
  )
  .option("--language <language>", "Language code for prose rules.")
  .option("--config <path>", "Path to a cadence JSONC config file.")
  .option("--format <format>", "Output format: human or json.", "human")
  .version("0.1.0")
  .addHelpText(
    "after",
    [
      "",
      "Field notes:",
      "  Lint marked prose sections before publishing a README or guide.",
      "  Load configured section structures from cadence.config.jsonc.",
      "  Use --format json when CI or editor tooling needs diagnostics.",
    ].join("\n"),
  );

interface CliOptions {
  section: string[];
  sectionRule: string[];
  language?: string;
  config?: string;
  format: string;
}

program.action(async (files: string[], options: CliOptions) => {
  if (files.length === 0) {
    throw new Error("cadence-lint: at least one file or glob target is required");
  }

  const config = await loadCadenceConfig({
    cwd: process.cwd(),
    configPath: options.config,
  });
  const cliSectionRules = parseSectionRules([
    ...options.sectionRule,
    ...options.section,
  ]);
  const hasCliSectionRules =
    options.sectionRule.length > 0 || options.section.length > 0;
  const sectionRules = hasCliSectionRules ? cliSectionRules : config.sectionRules;
  const language = options.language ?? config.language;
  validateSentenceLanguage(language);
  validateFormat(options.format);
  const diagnostics: LintDiagnostic[] = [];
  const filePaths = await resolveFileTargets(files);

  for (const filePath of filePaths) {
    const markdown = await readFile(filePath, "utf8");
    const result = lintMarkdown(markdown, {
      filePath,
      language,
      protectedPatterns: config.protectedPatterns,
      sectionRules,
      sectionBalance: config.sectionBalance,
      listBalance: config.listBalance,
      headingOrder: config.headingOrder,
      title: config.title,
    });
    diagnostics.push(...result.diagnostics);
  }

  if (diagnostics.length === 0) {
    console.log(formatNoIssues(options.format));
    return;
  }

  console.log(formatDiagnosticOutput(diagnostics, options.format));
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

function validateFormat(format: string): void {
  if (format !== "human" && format !== "json") {
    throw new Error(`cadence-lint: unsupported output format: ${format}`);
  }
}

function formatNoIssues(format: string): string {
  return format === "json"
    ? formatDiagnosticsAsJson([])
    : "cadence-lint: no issues found";
}

function formatDiagnosticOutput(
  diagnostics: readonly LintDiagnostic[],
  format: string,
): string {
  return format === "json"
    ? formatDiagnosticsAsJson(diagnostics)
    : formatDiagnostics(diagnostics);
}

async function resolveFileTargets(targets: readonly string[]): Promise<string[]> {
  const filePaths: string[] = [];

  for (const target of targets) {
    const matches = hasGlobMeta(target)
      ? await expandGlobTarget(target)
      : (await isFile(target))
        ? [target]
        : [];

    if (matches.length === 0) {
      throw new Error(`cadence-lint: target did not match any file: ${target}`);
    }

    filePaths.push(...matches);
  }

  return filePaths;
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function expandGlobTarget(target: string): Promise<string[]> {
  const { root, segments } = splitGlobTarget(target);

  return expandGlobSegments(root, segments);
}

async function expandGlobSegments(
  directory: string,
  segments: readonly string[],
): Promise<string[]> {
  const [segment, ...remainingSegments] = segments;

  if (segment === undefined) {
    return (await isFile(directory)) ? [directory] : [];
  }

  if (!hasGlobMeta(segment)) {
    return expandGlobSegments(join(directory, segment), remainingSegments);
  }

  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  const segmentPattern = globSegmentToRegExp(segment);
  const matches: string[] = [];

  for (const entry of entries) {
    if (!segmentPattern.test(entry.name)) {
      continue;
    }

    const entryPath = join(directory, entry.name);

    if (remainingSegments.length === 0) {
      if (entry.isFile()) {
        matches.push(entryPath);
      }

      continue;
    }

    if (entry.isDirectory()) {
      matches.push(...(await expandGlobSegments(entryPath, remainingSegments)));
    }
  }

  return matches.sort();
}

function splitGlobTarget(target: string): { root: string; segments: string[] } {
  const isAbsoluteTarget = target.startsWith("/");
  const root = isAbsoluteTarget ? "/" : ".";
  const segments = target.split("/").filter((segment) => segment.length > 0);

  return { root, segments };
}

function globSegmentToRegExp(segment: string): RegExp {
  let pattern = "^";

  for (const character of segment) {
    if (character === "*") {
      pattern += "[^/]*";
      continue;
    }

    if (character === "?") {
      pattern += "[^/]";
      continue;
    }

    pattern += escapeRegExp(character);
  }

  return new RegExp(`${pattern}$`);
}

function hasGlobMeta(target: string): boolean {
  return /[*?]/.test(target);
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
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
    const patterns = rule.slice(separatorIndex + 1).split(",");
    sectionRules[sectionName] ??= [];

    for (const pattern of patterns) {
      sectionRules[sectionName].push(parseStructurePattern(pattern));
    }
  }

  return sectionRules;
}
