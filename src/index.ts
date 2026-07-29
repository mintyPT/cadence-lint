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
import { validateCadenceMarkers } from "./cadence-markers.js";

export interface LintMarkdownOptions {
  filePath?: string;
  allowedSectionNames?: readonly string[];
}

export interface LintResult {
  diagnostics: LintDiagnostic[];
}

export function lintMarkdown(markdown: string, options: LintMarkdownOptions = {}): LintResult {
  const document = parseMarkdownDocument(markdown);

  return {
    diagnostics: validateCadenceMarkers(document, {
      filePath: options.filePath ?? "<input>",
      allowedSectionNames: options.allowedSectionNames,
    }),
  };
}
