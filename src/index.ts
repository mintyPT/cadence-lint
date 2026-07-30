export {
  formatDiagnostic,
  formatDiagnostics,
  getDiagnosticExitCode,
  type DiagnosticExitCode,
  type ExpectedStructureDetail,
  type DiagnosticLocation,
  type DiagnosticSection,
  type DiagnosticSeverity,
  type DiagnosticStructureContext,
  type LintDiagnostic,
} from "./diagnostics.js";
export {
  supportedSentenceLanguages,
  splitSentences,
  validateSentenceLanguage,
  type SentenceLanguage,
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
  matchAnchoredSequence,
  matchSequence,
  type AnchoredSequencePatterns,
  type SequenceMatchFail,
  type SequenceMatchPass,
  type SequencePatternPlacement,
  type SequenceMatchResult,
} from "./sequence-matcher.js";

import type {
  DiagnosticStructureContext,
  ExpectedStructureDetail,
  LintDiagnostic,
} from "./diagnostics.js";
import {
  parseMarkdownDocument,
  type MarkdownParagraph,
} from "./markdown-document.js";
import {
  findParagraphsOutsideCadenceMarkers,
  parseCadenceMarkedSections,
  validateCadenceMarkers,
} from "./cadence-markers.js";
import {
  matchAnchoredSequence,
  type SequencePatternPlacement,
} from "./sequence-matcher.js";
import { splitSentences, validateSentenceLanguage } from "./sentences.js";

export interface SectionStructureSegment {
  count: number;
  description?: string;
}

export interface SectionStructure {
  counts: readonly number[];
  description?: string;
  segmentDescriptions?: readonly string[];
}

export type SectionStructurePattern = readonly number[] | SectionStructure;

export interface SectionRule {
  any?: readonly SectionStructurePattern[];
  start?: readonly SectionStructurePattern[];
  middle?: readonly SectionStructurePattern[];
  end?: readonly SectionStructurePattern[];
}

export type SectionStructureRule =
  | SectionStructurePattern
  | readonly SectionStructurePattern[]
  | SectionRule;
export type SectionStructureRules = Record<string, SectionStructureRule>;

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
  const language = options.language ?? "en";
  validateSentenceLanguage(language);
  const diagnostics = validateCadenceMarkers(document, {
    filePath,
    allowedSectionNames,
  });

  return {
    diagnostics: [
      ...diagnostics,
      ...lintCadenceMarkerCoverage(document, filePath),
      ...lintMarkedSectionStructures(document, filePath, options.sectionRules ?? {}, {
        language,
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
  options: { language: string; protectedPatterns: readonly RegExp[] },
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const section of parseCadenceMarkedSections(document)) {
    const allowedStructures = sectionRules[section.name];

    if (allowedStructures === undefined || section.paragraphs.length === 0) {
      continue;
    }

    const paragraphAnalyses = section.paragraphs.map((paragraph) =>
      analyzeParagraphStructure(paragraph, options),
    );
    const observedStructure = paragraphAnalyses.map(
      (analysis) => analysis.sentenceCount,
    );
    const normalizedRule = normalizeSectionRule(allowedStructures);
    const result = matchAnchoredSequence(
      observedStructure,
      toMatcherPatterns(normalizedRule),
    );

    if (result.passed) {
      continue;
    }

    const suffixDetail =
      result.unmatchedSuffixStart > 0
        ? ` Unmatched suffix starts at paragraph ${result.unmatchedSuffixStart + 1}.`
        : "";
    const placementDetail =
      result.failurePlacement === undefined
        ? ""
        : ` ${formatPlacement(result.failurePlacement)} anchor did not match.`;
    const expectedStructures = flattenSectionRule(normalizedRule);
    const contextStart = isAnchoredNormalizedRule(normalizedRule)
      ? result.unmatchedSuffixStart
      : findStructureContextStart(
          observedStructure,
          (normalizedRule.any ?? []).map((structure) => structure.counts),
        );
    const expectedSentenceCount = findExpectedSentenceCountAt(
      normalizedRule,
      observedStructure,
      contextStart,
      result.failurePlacement,
    );

    diagnostics.push({
      severity: "error",
      message: `Cadence section '${section.name}' structure does not match expected structures.${placementDetail}${suffixDetail}`,
      location: {
        filePath,
        line: section.openingMarker.line,
        column: section.openingMarker.column,
      },
      observedStructure: formatStructure(observedStructure),
      expectedStructures: expectedStructures.map(({ structure }) =>
        formatStructure(structure.counts),
      ),
      ...withExpectedStructureDetails(expectedStructures),
      structureContext: buildStructureContext(
        section.paragraphs,
        paragraphAnalyses,
        contextStart,
        expectedSentenceCount,
      ),
      ...(result.unmatchedSuffixStart > 0
        ? { unmatchedSuffixStart: result.unmatchedSuffixStart + 1 }
        : {}),
    });
  }

  return diagnostics;
}

interface NormalizedSectionRule {
  any?: readonly SectionStructure[];
  start?: readonly SectionStructure[];
  middle?: readonly SectionStructure[];
  end?: readonly SectionStructure[];
}

interface PlacedSectionStructure {
  structure: SectionStructure;
  placement: SequencePatternPlacement;
}

function normalizeSectionRule(rule: SectionStructureRule): NormalizedSectionRule {
  if (isSectionRuleObject(rule)) {
    return {
      ...(rule.any === undefined
        ? {}
        : { any: rule.any.map(normalizeSectionStructure) }),
      ...(rule.start === undefined
        ? {}
        : { start: rule.start.map(normalizeSectionStructure) }),
      ...(rule.middle === undefined
        ? {}
        : { middle: rule.middle.map(normalizeSectionStructure) }),
      ...(rule.end === undefined
        ? {}
        : { end: rule.end.map(normalizeSectionStructure) }),
    };
  }

  if (isSectionStructurePatternList(rule)) {
    return { any: rule.map(normalizeSectionStructure) };
  }

  return { any: [normalizeSectionStructure(rule)] };
}

function isSectionRuleObject(rule: SectionStructureRule): rule is SectionRule {
  return (
    typeof rule === "object" &&
    rule !== null &&
    !Array.isArray(rule) &&
    ("any" in rule || "start" in rule || "middle" in rule || "end" in rule)
  );
}

function isSectionStructurePatternList(
  rule: SectionStructureRule,
): rule is readonly SectionStructurePattern[] {
  return Array.isArray(rule) && (rule.length === 0 || isSectionStructurePattern(rule[0]));
}

function isSectionStructurePattern(rule: unknown): rule is SectionStructurePattern {
  return (
    Array.isArray(rule) ||
    (typeof rule === "object" && rule !== null && "counts" in rule)
  );
}

function normalizeSectionStructure(
  structure: SectionStructurePattern,
): SectionStructure {
  if (!Array.isArray(structure) && "counts" in structure) {
    return structure;
  }

  return { counts: structure };
}

function toMatcherPatterns(rule: NormalizedSectionRule) {
  return {
    ...(rule.any === undefined
      ? {}
      : { any: rule.any.map((structure) => structure.counts) }),
    ...(rule.start === undefined
      ? {}
      : { start: rule.start.map((structure) => structure.counts) }),
    ...(rule.middle === undefined
      ? {}
      : { middle: rule.middle.map((structure) => structure.counts) }),
    ...(rule.end === undefined
      ? {}
      : { end: rule.end.map((structure) => structure.counts) }),
  };
}

function flattenSectionRule(rule: NormalizedSectionRule): PlacedSectionStructure[] {
  return [
    ...(rule.any ?? []).map((structure) => ({ structure, placement: "any" as const })),
    ...(rule.start ?? []).map((structure) => ({
      structure,
      placement: "start" as const,
    })),
    ...(rule.middle ?? []).map((structure) => ({
      structure,
      placement: "middle" as const,
    })),
    ...(rule.end ?? []).map((structure) => ({ structure, placement: "end" as const })),
  ];
}

function isAnchoredNormalizedRule(rule: NormalizedSectionRule): boolean {
  return (
    rule.start !== undefined ||
    rule.middle !== undefined ||
    rule.end !== undefined
  );
}

function findExpectedSentenceCountAt(
  rule: NormalizedSectionRule,
  observedStructure: readonly number[],
  paragraphIndex: number,
  placement: SequencePatternPlacement | undefined,
): number | undefined {
  if (placement === undefined) {
    return findExpectedCountFromPatterns(
      observedStructure,
      (rule.any ?? []).map((structure) => structure.counts),
      paragraphIndex,
      0,
    );
  }

  const placements =
    placement === "middle" && rule.middle === undefined
      ? (["middle", "any"] as const)
      : ([placement] as const);

  for (const currentPlacement of placements) {
    for (const structure of rule[currentPlacement] ?? []) {
      const expectedCount = structure.counts[paragraphIndex % structure.counts.length];

      if (expectedCount !== undefined) {
        return expectedCount;
      }
    }
  }

  return undefined;
}

function findExpectedCountFromPatterns(
  observedStructure: readonly number[],
  allowedStructures: readonly (readonly number[])[],
  targetIndex: number,
  startIndex: number,
): number | undefined {
  for (const allowedStructure of allowedStructures) {
    const mismatchIndex = findPatternMismatchIndex(
      observedStructure,
      allowedStructure,
      startIndex,
    );

    if (mismatchIndex === targetIndex) {
      return allowedStructure[targetIndex - startIndex];
    }

    if (mismatchIndex !== undefined) {
      continue;
    }

    const nextStartIndex = startIndex + allowedStructure.length;

    if (targetIndex < nextStartIndex) {
      return allowedStructure[targetIndex - startIndex];
    }

    const nestedExpected = findExpectedCountFromPatterns(
      observedStructure,
      allowedStructures,
      targetIndex,
      nextStartIndex,
    );

    if (nestedExpected !== undefined) {
      return nestedExpected;
    }
  }

  return undefined;
}

function buildExpectedStructureDetails(
  structures: readonly PlacedSectionStructure[],
): ExpectedStructureDetail[] | undefined {
  const details = structures
    .filter(
      ({ structure, placement }) =>
        placement !== "any" ||
        structure.description !== undefined ||
        (structure.segmentDescriptions?.length ?? 0) > 0,
    )
    .map(({ structure, placement }) => ({
      pattern: formatStructure(structure.counts),
      ...(placement === "any" ? {} : { placement }),
      ...(structure.description === undefined
        ? {}
        : { description: structure.description }),
      ...(structure.segmentDescriptions === undefined
        ? {}
        : { segmentDescriptions: structure.segmentDescriptions }),
    }));

  return details.length === 0 ? undefined : details;
}

function withExpectedStructureDetails(
  structures: readonly PlacedSectionStructure[],
): { expectedStructureDetails?: ExpectedStructureDetail[] } {
  const details = buildExpectedStructureDetails(structures);

  return details === undefined ? {} : { expectedStructureDetails: details };
}

interface ParagraphStructureAnalysis {
  sentenceCount: number;
  sentences: readonly string[];
}

function analyzeParagraphStructure(
  paragraph: MarkdownParagraph,
  options: { language: string; protectedPatterns: readonly RegExp[] },
): ParagraphStructureAnalysis {
  const sentences = splitSentences(paragraph.text, {
    language: options.language,
    protectedPatterns: options.protectedPatterns,
  }).map((sentence) => sentence.text);

  return {
    sentenceCount: sentences.length,
    sentences,
  };
}

function findStructureContextStart(
  observedStructure: readonly number[],
  allowedStructures: readonly (readonly number[])[],
): number {
  return findStructureContextStartFrom(observedStructure, allowedStructures, 0);
}

function findStructureContextStartFrom(
  observedStructure: readonly number[],
  allowedStructures: readonly (readonly number[])[],
  startIndex: number,
): number {
  if (startIndex >= observedStructure.length) {
    return startIndex;
  }

  let contextStart = startIndex;

  for (const allowedStructure of allowedStructures) {
    const mismatchIndex = findPatternMismatchIndex(
      observedStructure,
      allowedStructure,
      startIndex,
    );

    if (mismatchIndex !== undefined) {
      contextStart = Math.max(contextStart, mismatchIndex);
      continue;
    }

    contextStart = Math.max(
      contextStart,
      findStructureContextStartFrom(
        observedStructure,
        allowedStructures,
        startIndex + allowedStructure.length,
      ),
    );
  }

  return contextStart;
}

function findPatternMismatchIndex(
  observedStructure: readonly number[],
  allowedStructure: readonly number[],
  startIndex: number,
): number | undefined {
  for (let offset = 0; offset < allowedStructure.length; offset += 1) {
    const observedCount = observedStructure[startIndex + offset];

    if (observedCount === undefined) {
      return startIndex + offset;
    }

    if (observedCount !== allowedStructure[offset]) {
      return startIndex + offset;
    }
  }

  return undefined;
}

function buildStructureContext(
  paragraphs: readonly MarkdownParagraph[],
  paragraphAnalyses: readonly ParagraphStructureAnalysis[],
  contextStart: number,
  expectedSentenceCount: number | undefined,
): DiagnosticStructureContext {
  const mismatchIndex = Math.min(contextStart, paragraphs.length - 1);
  const previousSentences = paragraphAnalyses
    .slice(0, mismatchIndex)
    .flatMap((analysis) => analysis.sentences)
    .slice(-2);

  return {
    previousSentences,
    mismatchParagraph: mismatchIndex + 1,
    ...(expectedSentenceCount === undefined
      ? {}
      : { expectedSentenceCount }),
    observedSentenceCount: paragraphAnalyses[mismatchIndex]?.sentenceCount ?? 0,
    mismatchText:
      paragraphAnalyses[mismatchIndex]?.sentences[0] ??
      paragraphs[mismatchIndex]?.text.trim() ??
      "",
  };
}

function formatStructure(structure: readonly number[]): string {
  return structure.join("/");
}

function formatPlacement(placement: SequencePatternPlacement): string {
  return placement[0].toUpperCase() + placement.slice(1);
}
