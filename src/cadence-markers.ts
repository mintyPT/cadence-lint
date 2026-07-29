import type {
  MarkdownDocument,
  MarkdownHtmlCommentBlock,
  MarkdownParagraphBlock,
} from "./markdown-document.js";
import type { LintDiagnostic } from "./diagnostics.js";

export type CadenceMarkerType = "openingMarker" | "closingMarker";

export interface CadenceMarker {
  type: CadenceMarkerType;
  name: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface CadenceMarkedSection {
  name: string;
  openingMarker: CadenceMarker;
  closingMarker: CadenceMarker;
  paragraphs: MarkdownParagraphBlock[];
}

export interface CadenceMarkerValidationOptions {
  filePath: string;
  allowedSectionNames?: readonly string[];
}

interface OpenCadenceSection {
  name: string;
  openingMarker: CadenceMarker;
  paragraphs: MarkdownParagraphBlock[];
}

export function parseCadenceMarkedSections(
  document: MarkdownDocument,
): CadenceMarkedSection[] {
  const sections: CadenceMarkedSection[] = [];
  let openSection: OpenCadenceSection | undefined;

  for (const block of document.blocks) {
    if (block.type === "paragraph") {
      openSection?.paragraphs.push(block);
      continue;
    }

    const marker = parseCadenceMarker(block);

    if (marker === undefined) {
      continue;
    }

    if (marker.type === "openingMarker") {
      openSection = {
        name: marker.name,
        openingMarker: marker,
        paragraphs: [],
      };
      continue;
    }

    if (openSection !== undefined && openSection.name === marker.name) {
      sections.push({
        name: openSection.name,
        openingMarker: openSection.openingMarker,
        closingMarker: marker,
        paragraphs: openSection.paragraphs,
      });
      openSection = undefined;
    }
  }

  return sections;
}

export function validateCadenceMarkers(
  document: MarkdownDocument,
  options: CadenceMarkerValidationOptions,
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const allowedSectionNames =
    options.allowedSectionNames === undefined
      ? undefined
      : new Set(options.allowedSectionNames);
  let openSection: OpenCadenceSection | undefined;

  for (const block of document.blocks) {
    if (block.type === "paragraph") {
      openSection?.paragraphs.push(block);
      continue;
    }

    const marker = parseCadenceMarker(block);

    if (marker === undefined) {
      if (isMalformedCadenceMarker(block)) {
        diagnostics.push(markerDiagnostic(options.filePath, block, "Malformed cadence marker syntax."));
      }

      continue;
    }

    if (allowedSectionNames !== undefined && !allowedSectionNames.has(marker.name)) {
      diagnostics.push(
        markerDiagnostic(options.filePath, marker, `Unknown cadence section '${marker.name}'.`),
      );
    }

    if (marker.type === "openingMarker") {
      if (openSection !== undefined) {
        diagnostics.push(
          markerDiagnostic(
            options.filePath,
            marker,
            `Nested cadence section '${marker.name}' inside '${openSection.name}'.`,
          ),
        );
        continue;
      }

      openSection = {
        name: marker.name,
        openingMarker: marker,
        paragraphs: [],
      };
      continue;
    }

    if (openSection === undefined || openSection.name !== marker.name) {
      diagnostics.push(
        markerDiagnostic(
          options.filePath,
          marker,
          `Unmatched closing cadence marker for section '${marker.name}'.`,
        ),
      );
      continue;
    }

    if (openSection.paragraphs.length === 0) {
      diagnostics.push(
        markerDiagnostic(
          options.filePath,
          openSection.openingMarker,
          `Cadence section '${openSection.name}' must contain at least one normal paragraph.`,
        ),
      );
    }

    openSection = undefined;
  }

  if (openSection !== undefined) {
    diagnostics.push(
      markerDiagnostic(
        options.filePath,
        openSection.openingMarker,
        `Unmatched opening cadence marker for section '${openSection.name}'.`,
      ),
    );
  }

  return diagnostics;
}

function parseCadenceMarker(
  block: MarkdownHtmlCommentBlock,
): CadenceMarker | undefined {
  const match = /^<!--\s*(\/?)cadence:([A-Za-z0-9_-]+)\s*-->$/.exec(block.value.trim());

  if (match === null) {
    return undefined;
  }

  return {
    type: match[1] === "/" ? "closingMarker" : "openingMarker",
    name: match[2],
    line: block.line,
    column: block.column,
    endLine: block.endLine,
    endColumn: block.endColumn,
  };
}

function isMalformedCadenceMarker(block: MarkdownHtmlCommentBlock): boolean {
  return /^<!--\s*\/?cadence(?:\b|:)/.test(block.value.trim());
}

function markerDiagnostic(
  filePath: string,
  marker: Pick<CadenceMarker, "line" | "column">,
  message: string,
): LintDiagnostic {
  return {
    severity: "error",
    message,
    location: {
      filePath,
      line: marker.line,
      column: marker.column,
    },
  };
}
