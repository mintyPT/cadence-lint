export interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

export interface SentenceSplitOptions {
  protectedPatterns?: readonly RegExp[];
}

interface ProtectedSpan {
  start: number;
  end: number;
}

export function splitSentences(
  paragraph: string,
  options: SentenceSplitOptions = {},
): SentenceSpan[] {
  const protectedSpans = collectProtectedSpans(
    paragraph,
    options.protectedPatterns ?? [],
  );
  const sentences: SentenceSpan[] = [];
  let sentenceStart = nextNonWhitespaceIndex(paragraph, 0);

  for (let index = sentenceStart; index < paragraph.length; index += 1) {
    if (!isTerminalPunctuation(paragraph[index])) {
      continue;
    }

    if (isProtectedIndex(index, protectedSpans)) {
      continue;
    }

    const end = index + 1;
    sentences.push({
      text: paragraph.slice(sentenceStart, end),
      start: sentenceStart,
      end,
    });
    sentenceStart = nextNonWhitespaceIndex(paragraph, end);
    index = sentenceStart - 1;
  }

  if (sentenceStart < paragraph.length) {
    const end = trimEndIndex(paragraph);

    if (sentenceStart < end) {
      sentences.push({
        text: paragraph.slice(sentenceStart, end),
        start: sentenceStart,
        end,
      });
    }
  }

  return sentences;
}

function collectProtectedSpans(
  text: string,
  patterns: readonly RegExp[],
): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];

  for (const pattern of patterns) {
    const matcher = toGlobalRegExp(pattern);

    for (const match of text.matchAll(matcher)) {
      if (match.index === undefined || match[0].length === 0) {
        continue;
      }

      spans.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return mergeSpans(spans);
}

function toGlobalRegExp(pattern: RegExp): RegExp {
  const flags = new Set(pattern.flags.replace("y", ""));
  flags.add("g");

  return new RegExp(pattern.source, [...flags].join(""));
}

function mergeSpans(spans: ProtectedSpan[]): ProtectedSpan[] {
  const sorted = [...spans].sort((left, right) => left.start - right.start);
  const merged: ProtectedSpan[] = [];

  for (const span of sorted) {
    const previous = merged.at(-1);

    if (!previous || span.start > previous.end) {
      merged.push({ ...span });
      continue;
    }

    previous.end = Math.max(previous.end, span.end);
  }

  return merged;
}

function isProtectedIndex(index: number, spans: readonly ProtectedSpan[]): boolean {
  return spans.some((span) => index >= span.start && index < span.end);
}

function isTerminalPunctuation(character: string): boolean {
  return character === "." || character === "!" || character === "?";
}

function nextNonWhitespaceIndex(text: string, start: number): number {
  let index = start;

  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }

  return index;
}

function trimEndIndex(text: string): number {
  let end = text.length;

  while (end > 0 && /\s/.test(text[end - 1])) {
    end -= 1;
  }

  return end;
}
