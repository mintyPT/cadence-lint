#!/usr/bin/env node
import { Command } from "commander";
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
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
  if (files.length === 0) {
    throw new Error("cadence-lint: at least one file or glob target is required");
  }

  const sectionRules = parseSectionRules(options.sectionRule);
  const diagnostics: LintDiagnostic[] = [];
  const filePaths = await resolveFileTargets(files);

  for (const filePath of filePaths) {
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
    const pattern = rule.slice(separatorIndex + 1);
    sectionRules[sectionName] ??= [];
    sectionRules[sectionName].push(parseStructurePattern(pattern));
  }

  return sectionRules;
}
