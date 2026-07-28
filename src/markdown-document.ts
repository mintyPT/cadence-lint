import type { Html, Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export interface MarkdownParagraph {
  text: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface MarkdownParagraphBlock extends MarkdownParagraph {
  type: "paragraph";
}

export interface MarkdownHtmlCommentBlock {
  type: "htmlComment";
  value: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export type MarkdownBlock = MarkdownParagraphBlock | MarkdownHtmlCommentBlock;

export interface MarkdownDocument {
  blocks: MarkdownBlock[];
  paragraphs: MarkdownParagraph[];
}

export function parseMarkdownDocument(markdown: string): MarkdownDocument {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const blocks = collectBlocks(tree);

  return {
    blocks,
    paragraphs: blocks
      .filter((block): block is MarkdownParagraphBlock => block.type === "paragraph")
      .map(({ type: _type, ...paragraph }) => paragraph),
  };
}

function collectBlocks(root: Root): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  for (const node of root.children) {
    const block = toMarkdownBlock(node);

    if (block === undefined) {
      continue;
    }

    blocks.push(block);
  }

  return blocks;
}

function toMarkdownBlock(node: RootContent): MarkdownBlock | undefined {
  if (node.type === "paragraph" && node.position !== undefined) {
    return {
      type: "paragraph",
      ...toMarkdownParagraph(node),
    };
  }

  if (node.type === "html" && node.position !== undefined && isHtmlComment(node)) {
    return {
      type: "htmlComment",
      value: node.value,
      line: node.position.start.line,
      column: node.position.start.column,
      endLine: node.position.end.line,
      endColumn: node.position.end.column,
    };
  }

  return undefined;
}

function toMarkdownParagraph(paragraph: Paragraph): MarkdownParagraph {
  if (paragraph.position === undefined) {
    throw new Error("Cannot extract a paragraph without source position data.");
  }

  return {
    text: paragraph.children.map(extractPhrasingText).join(""),
    line: paragraph.position.start.line,
    column: paragraph.position.start.column,
    endLine: paragraph.position.end.line,
    endColumn: paragraph.position.end.column,
  };
}

function isHtmlComment(node: Html): boolean {
  const value = node.value.trim();

  return value.startsWith("<!--") && value.endsWith("-->");
}

function extractPhrasingText(node: PhrasingContent): string {
  switch (node.type) {
    case "break":
      return "\n";
    case "delete":
    case "emphasis":
    case "link":
    case "strong":
      return node.children.map(extractPhrasingText).join("");
    case "html":
    case "inlineCode":
    case "text":
      return node.value;
    case "image":
    case "imageReference":
      return node.alt ?? "";
    case "linkReference":
      return node.children.map(extractPhrasingText).join("");
    case "footnoteReference":
      return "";
  }
}
