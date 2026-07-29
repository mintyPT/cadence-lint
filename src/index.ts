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

import type { LintDiagnostic } from "./diagnostics.js";

export interface LintResult {
  diagnostics: LintDiagnostic[];
}

export function lintMarkdown(_markdown: string): LintResult {
  return {
    diagnostics: [],
  };
}
