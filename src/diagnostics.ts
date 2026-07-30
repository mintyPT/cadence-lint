export type DiagnosticSeverity = "error" | "warning";

export interface DiagnosticLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface DiagnosticSection {
  title: string;
  line: number;
  level?: number;
}

export interface DiagnosticStructureContext {
  previousSentences: readonly string[];
  mismatchParagraph: number;
  mismatchText: string;
}

export interface LintDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  location: DiagnosticLocation;
  section?: DiagnosticSection;
  observedStructure?: string;
  expectedStructures?: readonly string[];
  unmatchedSuffixStart?: number;
  structureContext?: DiagnosticStructureContext;
}

export type DiagnosticExitCode = 0 | 1;

export function formatDiagnostic(diagnostic: LintDiagnostic): string {
  const details = formatDiagnosticDetails(diagnostic);
  const suffix = details.length > 0 ? ` [${details.join(", ")}]` : "";

  return [
    `${diagnostic.location.filePath}:${diagnostic.location.line}:${diagnostic.location.column}`,
    diagnostic.severity,
    diagnostic.message,
  ].join(" ") + suffix;
}

export function formatDiagnostics(diagnostics: readonly LintDiagnostic[]): string {
  return diagnostics.map(formatDiagnostic).join("\n");
}

export function formatDiagnosticsAsJson(
  diagnostics: readonly LintDiagnostic[],
): string {
  return JSON.stringify({ diagnostics }, null, 2);
}

export function getDiagnosticExitCode(
  diagnostics: readonly LintDiagnostic[],
): DiagnosticExitCode {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error") ? 1 : 0;
}

function formatDiagnosticDetails(diagnostic: LintDiagnostic): string[] {
  const details: string[] = [];

  if (diagnostic.section) {
    details.push(`section: ${diagnostic.section.title}`);
    details.push(`heading line: ${diagnostic.section.line}`);

    if (diagnostic.section.level !== undefined) {
      details.push(`level: ${diagnostic.section.level}`);
    }
  }

  if (diagnostic.observedStructure) {
    details.push(`observed: ${diagnostic.observedStructure}`);
  }

  if (diagnostic.expectedStructures && diagnostic.expectedStructures.length > 0) {
    details.push(`expected: ${diagnostic.expectedStructures.join(" | ")}`);
  }

  if (diagnostic.structureContext) {
    details.push(formatStructureContext(diagnostic.structureContext));
  }

  return details;
}

function formatStructureContext(context: DiagnosticStructureContext): string {
  const previous =
    context.previousSentences.length === 0
      ? "previous none"
      : `previous ${context.previousSentences.map(quoteContextText).join(" | ")}`;

  return `context: ${previous}; mismatch paragraph ${
    context.mismatchParagraph
  } ${quoteContextText(context.mismatchText)}`;
}

function quoteContextText(text: string): string {
  return `"${text.replace(/\s+/g, " ").trim()}"`;
}
