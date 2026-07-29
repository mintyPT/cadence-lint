export {
  formatDiagnostic,
  formatDiagnostics,
  getDiagnosticExitCode,
  type DiagnosticExitCode,
  type DiagnosticLocation,
  type DiagnosticSection,
  type DiagnosticSeverity,
  type LintDiagnostic,
} from "./diagnostics.js";
export {
  splitSentences,
  type SentenceSpan,
  type SentenceSplitOptions,
} from "./sentences.js";
export { parseStructurePattern } from "./structure-patterns.js";
export {
  parseMarkdownDocument,
  type MarkdownBlock,
  type MarkdownDocument,
  type MarkdownHtmlCommentBlock,
  type MarkdownParagraph,
  type MarkdownParagraphBlock,
} from "./markdown-document.js";
export {
  findParagraphsOutsideCadenceMarkers,
  parseCadenceMarkedSections,
  validateCadenceMarkers,
  type CadenceMarkerValidationOptions,
  type CadenceMarkedSection,
  type CadenceMarker,
  type CadenceMarkerType,
} from "./cadence-markers.js";
export {
  matchSequence,
  type SequenceMatchFail,
  type SequenceMatchPass,
  type SequenceMatchResult,
} from "./sequence-matcher.js";

import type { LintDiagnostic } from "./diagnostics.js";
import { parseMarkdownDocument } from "./markdown-document.js";
import {
  findParagraphsOutsideCadenceMarkers,
  parseCadenceMarkedSections,
  validateCadenceMarkers,
} from "./cadence-markers.js";
import { matchSequence } from "./sequence-matcher.js";
import { splitSentences } from "./sentences.js";

export type SectionStructureRules = Record<string, readonly (readonly number[])[]>;

export interface LintMarkdownOptions {
  filePath?: string;
  language?: string;
  allowedSectionNames?: readonly string[];
  sectionRules?: SectionStructureRules;
  protectedPatterns?: readonly RegExp[];
}

export interface LintResult {
  diagnostics: LintDiagnostic[];
}

export function lintMarkdown(markdown: string, options: LintMarkdownOptions = {}): LintResult {
  const document = parseMarkdownDocument(markdown);
  const filePath = options.filePath ?? "<input>";
  const allowedSectionNames =
    options.allowedSectionNames ??
    (options.sectionRules === undefined ? undefined : Object.keys(options.sectionRules));
  const diagnostics = validateCadenceMarkers(document, {
    filePath,
    allowedSectionNames,
  });

  return {
    diagnostics: [
      ...diagnostics,
      ...lintCadenceMarkerCoverage(document, filePath),
      ...lintMarkedSectionStructures(document, filePath, options.sectionRules ?? {}, {
        protectedPatterns: options.protectedPatterns ?? [],
      }),
    ],
  };
}

function lintCadenceMarkerCoverage(
  document: ReturnType<typeof parseMarkdownDocument>,
  filePath: string,
): LintDiagnostic[] {
  return findParagraphsOutsideCadenceMarkers(document).map((paragraph) => ({
    severity: "warning",
    message: "Normal paragraph is not covered by cadence markers.",
    location: {
      filePath,
      line: paragraph.line,
      column: paragraph.column,
    },
  }));
}

function lintMarkedSectionStructures(
  document: ReturnType<typeof parseMarkdownDocument>,
  filePath: string,
  sectionRules: SectionStructureRules,
  options: { protectedPatterns: readonly RegExp[] },
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const section of parseCadenceMarkedSections(document)) {
    const allowedStructures = sectionRules[section.name];

    if (allowedStructures === undefined || section.paragraphs.length === 0) {
      continue;
    }

    const observedStructure = section.paragraphs.map(
      (paragraph) =>
        splitSentences(paragraph.text, {
          protectedPatterns: options.protectedPatterns,
        }).length,
    );
    const result = matchSequence(
      observedStructure,
      allowedStructures.map((structure) => [...structure]),
    );

    if (result.passed) {
      continue;
    }

    const suffixDetail =
      result.unmatchedSuffixStart > 0
        ? ` Unmatched suffix starts at paragraph ${result.unmatchedSuffixStart + 1}.`
        : "";

    diagnostics.push({
      severity: "error",
      message: `Cadence section '${section.name}' structure does not match expected structures.${suffixDetail}`,
      location: {
        filePath,
        line: section.openingMarker.line,
        column: section.openingMarker.column,
      },
      observedStructure: formatStructure(observedStructure),
      expectedStructures: allowedStructures.map(formatStructure),
    });
  }

  return diagnostics;
}

function formatStructure(structure: readonly number[]): string {
  return structure.join("/");
}
