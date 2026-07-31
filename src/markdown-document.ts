import type {
  Heading,
  Html,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
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

export interface MarkdownHeadingBlock {
  type: "heading";
  text: string;
  depth: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface MarkdownListItem {
  text: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  depth: number;
}

export interface MarkdownListBlock {
  type: "list";
  ordered: boolean;
  items: readonly MarkdownListItem[];
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface MarkdownHtmlCommentBlock {
  type: "htmlComment";
  value: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export type MarkdownBlock =
  | MarkdownParagraphBlock
  | MarkdownHtmlCommentBlock
  | MarkdownHeadingBlock
  | MarkdownListBlock;

export interface MarkdownSection {
  heading: MarkdownHeadingBlock;
  blocks: readonly MarkdownBlock[];
  paragraphs: readonly MarkdownParagraph[];
}

export interface MarkdownDocument {
  blocks: MarkdownBlock[];
  paragraphs: MarkdownParagraph[];
  headings: MarkdownHeadingBlock[];
  lists: MarkdownListBlock[];
  sections: MarkdownSection[];
}

export function parseMarkdownDocument(markdown: string): MarkdownDocument {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const blocks = collectBlocks(tree);
  const paragraphs = blocks
    .filter((block): block is MarkdownParagraphBlock => block.type === "paragraph")
    .map(({ type: _type, ...paragraph }) => paragraph);
  const headings = blocks.filter(
    (block): block is MarkdownHeadingBlock => block.type === "heading",
  );
  const lists = blocks.filter(
    (block): block is MarkdownListBlock => block.type === "list",
  );

  return {
    blocks,
    paragraphs,
    headings,
    lists,
    sections: collectSections(blocks),
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
  if (node.type === "heading" && node.position !== undefined) {
    return toMarkdownHeading(node);
  }

  if (node.type === "list" && node.position !== undefined) {
    return toMarkdownList(node);
  }

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

function toMarkdownHeading(heading: Heading): MarkdownHeadingBlock {
  if (heading.position === undefined) {
    throw new Error("Cannot extract a heading without source position data.");
  }

  return {
    type: "heading",
    text: heading.children.map(extractPhrasingText).join(""),
    depth: heading.depth,
    line: heading.position.start.line,
    column: heading.position.start.column,
    endLine: heading.position.end.line,
    endColumn: heading.position.end.column,
  };
}

function toMarkdownList(list: List): MarkdownListBlock {
  if (list.position === undefined) {
    throw new Error("Cannot extract a list without source position data.");
  }

  return {
    type: "list",
    ordered: list.ordered ?? false,
    items: collectListItems(list, 1),
    line: list.position.start.line,
    column: list.position.start.column,
    endLine: list.position.end.line,
    endColumn: list.position.end.column,
  };
}

function collectListItems(list: List, depth: number): MarkdownListItem[] {
  const items: MarkdownListItem[] = [];

  for (const item of list.children) {
    items.push(toMarkdownListItem(item, depth));

    for (const child of item.children) {
      if (child.type === "list") {
        items.push(...collectListItems(child, depth + 1));
      }
    }
  }

  return items;
}

function toMarkdownListItem(item: ListItem, depth: number): MarkdownListItem {
  if (item.position === undefined) {
    throw new Error("Cannot extract a list item without source position data.");
  }

  return {
    text: item.children
      .filter((child): child is Paragraph => child.type === "paragraph")
      .flatMap((paragraph) => paragraph.children)
      .map(extractPhrasingText)
      .join("")
      .trim(),
    line: item.position.start.line,
    column: item.position.start.column,
    endLine: item.position.end.line,
    endColumn: item.position.end.column,
    depth,
  };
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

function collectSections(blocks: readonly MarkdownBlock[]): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let currentSection: {
    heading: MarkdownHeadingBlock;
    blocks: MarkdownBlock[];
    paragraphs: MarkdownParagraph[];
  } | undefined;

  for (const block of blocks) {
    if (block.type === "heading") {
      if (currentSection !== undefined) {
        sections.push(currentSection);
      }

      currentSection = {
        heading: block,
        blocks: [],
        paragraphs: [],
      };
      continue;
    }

    if (currentSection === undefined) {
      continue;
    }

    currentSection.blocks.push(block);

    if (block.type === "paragraph") {
      const { type: _type, ...paragraph } = block;
      currentSection.paragraphs.push(paragraph);
    }
  }

  if (currentSection !== undefined) {
    sections.push(currentSection);
  }

  return sections;
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
