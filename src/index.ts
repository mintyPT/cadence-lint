export interface LintDiagnostic {
  message: string;
  line: number;
  column: number;
}

export interface LintResult {
  diagnostics: LintDiagnostic[];
}

export function lintMarkdown(_markdown: string): LintResult {
  return {
    diagnostics: [],
  };
}
