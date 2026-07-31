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
  type MarkdownHeadingBlock,
  type MarkdownHtmlCommentBlock,
  type MarkdownListBlock,
  type MarkdownListItem,
  type MarkdownParagraph,
  type MarkdownParagraphBlock,
  type MarkdownSection,
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
  type MarkdownDocument,
  type MarkdownParagraph,
  type MarkdownSection,
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

export type SectionBalanceMeasure = "words" | "sentences" | "paragraphs";

export interface SectionBalanceOptions {
  measure: SectionBalanceMeasure;
  maxLargestToSmallestRatio: number;
  ignoreHeadings?: readonly string[];
}

export interface ListBalanceOptions {
  maxConsecutiveLists?: number;
  requireParagraphBeforeList?: boolean;
  requireParagraphAfterList?: boolean;
}

export interface TitleOptions {
  minWords?: number;
  maxWords?: number;
  minCharacters?: number;
  maxCharacters?: number;
  allowSubtitle?: boolean;
  maxSubtitleWords?: number;
  maxSubtitleCharacters?: number;
}

export interface IntroductionOptions {
  heading?: string;
  maxParagraphs?: number;
  allowedStructures?: readonly SectionStructurePattern[];
  requireLastSentenceMarker?: readonly string[];
}

export interface LintMarkdownOptions {
  filePath?: string;
  language?: string;
  allowedSectionNames?: readonly string[];
  sectionRules?: SectionStructureRules;
  protectedPatterns?: readonly RegExp[];
  sectionBalance?: SectionBalanceOptions;
  listBalance?: ListBalanceOptions;
  headingOrder?: readonly string[];
  title?: TitleOptions;
  introduction?: IntroductionOptions;
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
      ...lintSectionBalance(document, filePath, options.sectionBalance, {
        language,
        protectedPatterns: options.protectedPatterns ?? [],
      }),
      ...lintListBalance(document, filePath, options.listBalance),
      ...lintHeadingOrder(document, filePath, options.headingOrder),
      ...lintTitle(document, filePath, options.title),
      ...lintIntroduction(document, filePath, options.introduction, {
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

function lintSectionBalance(
  document: MarkdownDocument,
  filePath: string,
  options: SectionBalanceOptions | undefined,
  sentenceOptions: { language: string; protectedPatterns: readonly RegExp[] },
): LintDiagnostic[] {
  if (options === undefined || document.sections.length < 2) {
    return [];
  }

  const ignoredHeadings = new Set(options.ignoreHeadings ?? []);
  const measuredSections = document.sections
    .filter((section) => !ignoredHeadings.has(section.heading.text))
    .map((section) => ({
      section,
      size: measureSection(section, options.measure, sentenceOptions),
    }));

  if (measuredSections.length < 2) {
    return [];
  }

  const largest = measuredSections.reduce((current, candidate) =>
    candidate.size > current.size ? candidate : current,
  );
  const smallest = measuredSections.reduce((current, candidate) =>
    candidate.size < current.size ? candidate : current,
  );
  const observedRatio =
    smallest.size === 0 ? Number.POSITIVE_INFINITY : largest.size / smallest.size;

  if (observedRatio <= options.maxLargestToSmallestRatio) {
    return [];
  }

  return [
    {
      severity: "error",
      message: `Section balance exceeds configured ${options.measure} ratio: '${largest.section.heading.text}' is ${formatRatio(observedRatio)}x '${smallest.section.heading.text}'.`,
      location: {
        filePath,
        line: largest.section.heading.line,
        column: largest.section.heading.column,
      },
      section: {
        title: largest.section.heading.text,
        line: largest.section.heading.line,
        level: largest.section.heading.depth,
      },
      observedStructure: `${largest.section.heading.text}:${largest.size} / ${smallest.section.heading.text}:${smallest.size} (${options.measure})`,
      expectedStructures: [
        `largest-to-smallest ratio <= ${options.maxLargestToSmallestRatio}`,
      ],
    },
  ];
}

function lintListBalance(
  document: MarkdownDocument,
  filePath: string,
  options: ListBalanceOptions | undefined,
): LintDiagnostic[] {
  if (options === undefined) {
    return [];
  }

  const diagnostics: LintDiagnostic[] = [];
  const blockGroups = document.sections.length > 0
    ? document.sections.map((section) => section.blocks)
    : [document.blocks];

  for (const blocks of blockGroups) {
    let consecutiveLists = 0;

    blocks.forEach((block, index) => {
      if (block.type !== "list") {
        consecutiveLists = 0;
        return;
      }

      consecutiveLists += 1;

      if (
        options.maxConsecutiveLists !== undefined &&
        consecutiveLists > options.maxConsecutiveLists
      ) {
        diagnostics.push({
          severity: "error",
          message: `List balance allows at most ${options.maxConsecutiveLists} consecutive list${options.maxConsecutiveLists === 1 ? "" : "s"}.`,
          location: {
            filePath,
            line: block.line,
            column: block.column,
          },
          observedStructure: `${consecutiveLists} consecutive lists`,
          expectedStructures: [
            `consecutive lists <= ${options.maxConsecutiveLists}`,
          ],
        });
      }

      if (options.requireParagraphBeforeList === true && !hasAdjacentParagraph(blocks, index, -1)) {
        diagnostics.push({
          severity: "error",
          message: "List balance requires a prose paragraph before each list.",
          location: {
            filePath,
            line: block.line,
            column: block.column,
          },
        });
      }

      if (options.requireParagraphAfterList === true && !hasAdjacentParagraph(blocks, index, 1)) {
        diagnostics.push({
          severity: "error",
          message: "List balance requires a prose paragraph after each list.",
          location: {
            filePath,
            line: block.line,
            column: block.column,
          },
        });
      }
    });
  }

  return diagnostics;
}

function lintHeadingOrder(
  document: MarkdownDocument,
  filePath: string,
  expectedOrder: readonly string[] | undefined,
): LintDiagnostic[] {
  if (expectedOrder === undefined || expectedOrder.length === 0) {
    return [];
  }

  const orderByHeading = new Map(
    expectedOrder.map((heading, index) => [heading, index]),
  );
  const observedHeadings = document.headings.filter((heading) =>
    orderByHeading.has(heading.text),
  );
  let highestExpectedIndex = -1;

  for (const heading of observedHeadings) {
    const expectedIndex = orderByHeading.get(heading.text);

    if (expectedIndex === undefined) {
      continue;
    }

    if (expectedIndex < highestExpectedIndex) {
      return [
        {
          severity: "error",
          message: `Heading '${heading.text}' appears before a required earlier heading.`,
          location: {
            filePath,
            line: heading.line,
            column: heading.column,
          },
          section: {
            title: heading.text,
            line: heading.line,
            level: heading.depth,
          },
          observedStructure: observedHeadings.map((item) => item.text).join(" -> "),
          expectedStructures: [expectedOrder.join(" -> ")],
        },
      ];
    }

    highestExpectedIndex = expectedIndex;
  }

  return [];
}

function lintTitle(
  document: MarkdownDocument,
  filePath: string,
  options: TitleOptions | undefined,
): LintDiagnostic[] {
  if (options === undefined) {
    return [];
  }

  const title = document.headings.find((heading) => heading.depth === 1);
  if (title === undefined) {
    return [];
  }

  const diagnostics: LintDiagnostic[] = [
    ...lintTextBounds("Title", title.text, title.line, title.column, filePath, {
      minWords: options.minWords,
      maxWords: options.maxWords,
      minCharacters: options.minCharacters,
      maxCharacters: options.maxCharacters,
    }),
  ];
  const subtitle = findSubtitleParagraph(document, title);

  if (subtitle === undefined) {
    return diagnostics;
  }

  if (options.allowSubtitle === false) {
    diagnostics.push({
      severity: "error",
      message: "Subtitle is not allowed by configured title rules.",
      location: {
        filePath,
        line: subtitle.line,
        column: subtitle.column,
      },
    });
    return diagnostics;
  }

  diagnostics.push(
    ...lintTextBounds("Subtitle", subtitle.text, subtitle.line, subtitle.column, filePath, {
      maxWords: options.maxSubtitleWords,
      maxCharacters: options.maxSubtitleCharacters,
    }),
  );

  return diagnostics;
}

function lintIntroduction(
  document: MarkdownDocument,
  filePath: string,
  options: IntroductionOptions | undefined,
  sentenceOptions: { language: string; protectedPatterns: readonly RegExp[] },
): LintDiagnostic[] {
  if (options === undefined) {
    return [];
  }

  const headingText = options.heading ?? "Introduction";
  const section = document.sections.find((item) => item.heading.text === headingText);

  if (section === undefined) {
    return [];
  }

  const diagnostics: LintDiagnostic[] = [];
  const paragraphAnalyses = section.paragraphs.map((paragraph) =>
    analyzeParagraphStructure(paragraph, sentenceOptions),
  );
  const observedStructure = paragraphAnalyses.map((analysis) => analysis.sentenceCount);

  if (
    options.maxParagraphs !== undefined &&
    section.paragraphs.length > options.maxParagraphs
  ) {
    diagnostics.push({
      severity: "error",
      message: `Introduction has ${section.paragraphs.length} paragraphs; expected <= ${options.maxParagraphs}.`,
      location: {
        filePath,
        line: section.heading.line,
        column: section.heading.column,
      },
      section: {
        title: section.heading.text,
        line: section.heading.line,
        level: section.heading.depth,
      },
      observedStructure: formatStructure(observedStructure),
      expectedStructures: [`paragraphs <= ${options.maxParagraphs}`],
    });
  }

  if (
    options.allowedStructures !== undefined &&
    options.allowedStructures.length > 0 &&
    !options.allowedStructures
      .map(normalizeSectionStructure)
      .some((structure) => structuresEqual(observedStructure, structure.counts))
  ) {
    diagnostics.push({
      severity: "error",
      message: "Introduction sentence structure does not match allowed structures.",
      location: {
        filePath,
        line: section.heading.line,
        column: section.heading.column,
      },
      section: {
        title: section.heading.text,
        line: section.heading.line,
        level: section.heading.depth,
      },
      observedStructure: formatStructure(observedStructure),
      expectedStructures: options.allowedStructures
        .map(normalizeSectionStructure)
        .map((structure) => formatStructure(structure.counts)),
    });
  }

  const finalSentence = paragraphAnalyses.at(-1)?.sentences.at(-1);
  if (
    options.requireLastSentenceMarker !== undefined &&
    options.requireLastSentenceMarker.length > 0 &&
    (finalSentence === undefined ||
      !options.requireLastSentenceMarker.some((marker) => finalSentence.includes(marker)))
  ) {
    diagnostics.push({
      severity: "error",
      message: "Introduction final sentence is missing a required marker phrase.",
      location: {
        filePath,
        line: section.heading.line,
        column: section.heading.column,
      },
      section: {
        title: section.heading.text,
        line: section.heading.line,
        level: section.heading.depth,
      },
      observedStructure: finalSentence ?? "",
      expectedStructures: options.requireLastSentenceMarker,
    });
  }

  return diagnostics;
}

function structuresEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findSubtitleParagraph(
  document: MarkdownDocument,
  title: { line: number },
): MarkdownParagraph | undefined {
  const titleSection = document.sections.find((section) => section.heading.line === title.line);

  return titleSection?.paragraphs[0];
}

function lintTextBounds(
  label: "Title" | "Subtitle",
  text: string,
  line: number,
  column: number,
  filePath: string,
  options: {
    minWords?: number;
    maxWords?: number;
    minCharacters?: number;
    maxCharacters?: number;
  },
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const wordCount = countWords(text);
  const characterCount = text.length;

  if (options.minWords !== undefined && wordCount < options.minWords) {
    diagnostics.push(textBoundDiagnostic(label, "words", wordCount, `>= ${options.minWords}`, filePath, line, column));
  }

  if (options.maxWords !== undefined && wordCount > options.maxWords) {
    diagnostics.push(textBoundDiagnostic(label, "words", wordCount, `<= ${options.maxWords}`, filePath, line, column));
  }

  if (options.minCharacters !== undefined && characterCount < options.minCharacters) {
    diagnostics.push(textBoundDiagnostic(label, "characters", characterCount, `>= ${options.minCharacters}`, filePath, line, column));
  }

  if (options.maxCharacters !== undefined && characterCount > options.maxCharacters) {
    diagnostics.push(textBoundDiagnostic(label, "characters", characterCount, `<= ${options.maxCharacters}`, filePath, line, column));
  }

  return diagnostics;
}

function textBoundDiagnostic(
  label: "Title" | "Subtitle",
  unit: "words" | "characters",
  observed: number,
  expected: string,
  filePath: string,
  line: number,
  column: number,
): LintDiagnostic {
  return {
    severity: "error",
    message: `${label} has ${observed} ${unit}; expected ${expected}.`,
    location: {
      filePath,
      line,
      column,
    },
    observedStructure: `${observed} ${unit}`,
    expectedStructures: [`${unit} ${expected}`],
  };
}

function hasAdjacentParagraph(
  blocks: readonly MarkdownDocument["blocks"][number][],
  index: number,
  direction: -1 | 1,
): boolean {
  const adjacent = blocks[index + direction];

  return adjacent?.type === "paragraph";
}

function measureSection(
  section: MarkdownSection,
  measure: SectionBalanceMeasure,
  sentenceOptions: { language: string; protectedPatterns: readonly RegExp[] },
): number {
  if (measure === "paragraphs") {
    return section.paragraphs.length;
  }

  if (measure === "sentences") {
    return section.paragraphs.reduce(
      (total, paragraph) =>
        total + analyzeParagraphStructure(paragraph, sentenceOptions).sentenceCount,
      0,
    );
  }

  return section.paragraphs.reduce(
    (total, paragraph) => total + countWords(paragraph.text),
    0,
  );
}

function countWords(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}

function formatRatio(ratio: number): string {
  return Number.isFinite(ratio) ? ratio.toFixed(2) : "Infinity";
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
  const mismatchSentences = paragraphAnalyses[mismatchIndex]?.sentences ?? [];

  return {
    previousSentences: [...previousSentences, ...mismatchSentences],
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
