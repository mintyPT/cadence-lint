export interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

export const supportedSentenceLanguages = ["en", "fr", "pt"] as const;

export type SentenceLanguage = (typeof supportedSentenceLanguages)[number];

export interface SentenceSplitOptions {
  language?: string;
  protectedPatterns?: readonly RegExp[];
}

interface ProtectedSpan {
  start: number;
  end: number;
}

const builtInProtectedPatternsByLanguage: Record<
  SentenceLanguage,
  readonly RegExp[]
> = {
  en: [
    /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./i,
    /\b(?:a\.m|p\.m|e\.g|i\.e)\./i,
    /(?:\b[A-Z]\.\s*){2,}/,
    /\b\d+\.\d+\b/,
  ],
  fr: [
    /\b(?:M|Mme|Mlle|Dr|Pr|St|Ste|etc)\./i,
    /(?:\b[A-Z]\.\s*){2,}/,
    /\b\d+\.\d+\b/,
  ],
  pt: [
    /\b(?:Sr|Sra|Srta|Dr|Dra|Prof|Profa|etc)\./i,
    /(?:\b[A-Z]\.\s*){2,}/,
    /\b\d+\.\d+\b/,
  ],
};

export function splitSentences(
  paragraph: string,
  options: SentenceSplitOptions = {},
): SentenceSpan[] {
  const protectedSpans = collectProtectedSpans(
    paragraph,
    getProtectedPatterns(options),
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

export function validateSentenceLanguage(
  language: string,
): asserts language is SentenceLanguage {
  if (!isSupportedSentenceLanguage(language)) {
    throw new Error(`cadence-lint: unsupported language: ${language}`);
  }
}

export function isSupportedSentenceLanguage(
  language: string,
): language is SentenceLanguage {
  return (supportedSentenceLanguages as readonly string[]).includes(language);
}

function getProtectedPatterns(options: SentenceSplitOptions): readonly RegExp[] {
  if (options.language === undefined) {
    return options.protectedPatterns ?? [];
  }

  validateSentenceLanguage(options.language);

  return [
    ...builtInProtectedPatternsByLanguage[options.language],
    ...(options.protectedPatterns ?? []),
  ];
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
