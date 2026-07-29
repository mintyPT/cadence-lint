import type {
  MarkdownDocument,
  MarkdownHtmlCommentBlock,
  MarkdownParagraphBlock,
} from "./markdown-document.js";

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
