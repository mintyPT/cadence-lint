import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseStructurePattern,
  type IntroductionOptions,
  type ListBalanceOptions,
  type ListsOptions,
  type SectionBalanceOptions,
  type SectionStructure,
  type SectionRule,
  type SectionStructureRules,
  type SectionStructureSegment,
  type SectionStructurePattern,
  type TitleOptions,
  type WordingOptions,
} from "../index.js";

export interface CadenceCliConfig {
  language: string;
  sectionRules: SectionStructureRules;
  protectedPatterns: readonly RegExp[];
  sectionBalance?: SectionBalanceOptions;
  listBalance?: ListBalanceOptions;
  headingOrder?: readonly string[];
  title?: TitleOptions;
  introduction?: IntroductionOptions;
  wording?: WordingOptions;
  lists?: ListsOptions;
}

export async function loadCadenceConfig(options: {
  cwd: string;
  configPath?: string;
}): Promise<CadenceCliConfig> {
  const configPath = options.configPath ?? join(options.cwd, "cadence.config.jsonc");
  let contents: string;

  try {
    contents = await readFile(configPath, "utf8");
  } catch (error: unknown) {
    if (options.configPath === undefined && isMissingFileError(error)) {
      return defaultConfig();
    }

    if (isMissingFileError(error)) {
      throw new Error(`cadence-lint: config file not found: ${options.configPath}`);
    }

    throw error;
  }

  const parsed = parseJsonc(contents, configPath);

  return {
    language: readLanguage(parsed),
    sectionRules: readSectionRules(parsed),
    protectedPatterns: readProtectedPatterns(parsed),
    ...withOptionalConfig("sectionBalance", readSectionBalance(parsed)),
    ...withOptionalConfig("listBalance", readListBalance(parsed)),
    ...withOptionalConfig(
      "headingOrder",
      readStringArray(
        isRecord(parsed) ? parsed.headingOrder : undefined,
        "cadence-lint: config headingOrder must be an array of strings",
      ),
    ),
    ...withOptionalConfig("title", readTitle(parsed)),
    ...withOptionalConfig("introduction", readIntroduction(parsed)),
    ...withOptionalConfig("wording", readWording(parsed)),
    ...withOptionalConfig("lists", readLists(parsed)),
  };
}

export function defaultConfig(): CadenceCliConfig {
  return {
    language: "en",
    sectionRules: {},
    protectedPatterns: [],
  };
}

function withOptionalConfig<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Record<Key, Value> | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as Record<Key, Value>;
}

function parseJsonc(contents: string, configPath: string): unknown {
  try {
    return JSON.parse(stripTrailingCommas(stripJsonComments(contents)));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`cadence-lint: failed to parse config ${configPath}: ${detail}`);
  }
}

function readLanguage(config: unknown): string {
  if (!isRecord(config) || config.language === undefined) {
    return "en";
  }

  if (typeof config.language !== "string" || config.language.length === 0) {
    throw new Error("cadence-lint: config language must be a non-empty string");
  }

  return config.language;
}

function readSectionRules(config: unknown): SectionStructureRules {
  if (!isRecord(config) || config.sections === undefined) {
    return {};
  }

  if (!isRecord(config.sections)) {
    throw new Error("cadence-lint: config sections must be an object");
  }

  const sectionRules: SectionStructureRules = {};

  for (const [sectionName, patterns] of Object.entries(config.sections)) {
    if (isAnchoredSectionRuleObject(patterns)) {
      sectionRules[sectionName] = readAnchoredSectionRule(sectionName, patterns);
      continue;
    }

    const patternValues = isSegmentList(patterns)
      ? [patterns]
      : Array.isArray(patterns)
        ? patterns
        : [patterns];

    if (patternValues.length === 0) {
      throw new Error(
        `cadence-lint: config section '${sectionName}' must define at least one structure pattern`,
      );
    }

    sectionRules[sectionName] = patternValues.map((pattern) =>
      readSectionPattern(sectionName, pattern),
    );
  }

  return sectionRules;
}

function readSectionPattern(
  sectionName: string,
  pattern: unknown,
): SectionStructurePattern {
  if (typeof pattern === "string") {
    return parseStructurePattern(pattern);
  }

  if (isSegmentList(pattern)) {
    return readDescribedPattern(sectionName, pattern);
  }

  if (!isRecord(pattern)) {
    throw new Error(
      `cadence-lint: config section '${sectionName}' patterns must be strings or objects`,
    );
  }

  const description = readOptionalString(
    pattern.description,
    `cadence-lint: config section '${sectionName}' pattern description must be a string`,
  );
  const patternValue = pattern.pattern;

  if (typeof patternValue === "string") {
    return {
      counts: parseStructurePattern(patternValue),
      ...(description === undefined ? {} : { description }),
    };
  }

  if (isSegmentList(patternValue)) {
    return readDescribedPattern(sectionName, patternValue, description);
  }

  throw new Error(
    `cadence-lint: config section '${sectionName}' pattern object must define a string pattern or described segment list`,
  );
}

function readAnchoredSectionRule(
  sectionName: string,
  rule: Record<string, unknown>,
): SectionRule {
  const normalizedRule: SectionRule = {};
  let bucketCount = 0;

  for (const placement of ["any", "start", "middle", "end"] as const) {
    if (rule[placement] === undefined) {
      continue;
    }

    const bucket = readPatternBucket(sectionName, placement, rule[placement]);
    normalizedRule[placement] = bucket;
    bucketCount += bucket.length;
  }

  if (bucketCount === 0) {
    throw new Error(
      `cadence-lint: config section '${sectionName}' must define at least one structure pattern`,
    );
  }

  return normalizedRule;
}

function readPatternBucket(
  sectionName: string,
  placement: "any" | "start" | "middle" | "end",
  value: unknown,
): readonly SectionStructurePattern[] {
  const values =
    typeof value === "string" || isSegmentList(value) || isPatternObject(value)
      ? [value]
      : Array.isArray(value)
        ? value
        : undefined;

  if (values === undefined) {
    throw new Error(
      `cadence-lint: config section '${sectionName}' ${placement} must be a pattern or array of patterns`,
    );
  }

  if (values.length === 0) {
    throw new Error(
      `cadence-lint: config section '${sectionName}' ${placement} must define at least one structure pattern`,
    );
  }

  return values.map((pattern) => readSectionPattern(sectionName, pattern));
}

function readDescribedPattern(
  sectionName: string,
  segments: readonly unknown[],
  description?: string,
): SectionStructure {
  if (segments.length === 0) {
    throw new Error(
      `cadence-lint: config section '${sectionName}' described pattern must define at least one segment`,
    );
  }

  const parsedSegments = segments.map((segment, index) =>
    readPatternSegment(sectionName, segment, index),
  );

  return {
    counts: parsedSegments.map((segment) => segment.count),
    ...(description === undefined ? {} : { description }),
    segmentDescriptions: parsedSegments.map((segment) => segment.description ?? ""),
  };
}

function readPatternSegment(
  sectionName: string,
  segment: unknown,
  index: number,
): SectionStructureSegment {
  if (!isRecord(segment)) {
    throw new Error(
      `cadence-lint: config section '${sectionName}' pattern segment ${index + 1} must be an object`,
    );
  }

  const count = segment.count;

  if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
    throw new Error(
      `cadence-lint: config section '${sectionName}' pattern segment ${index + 1} count must be a positive integer`,
    );
  }

  const description = readOptionalString(
    segment.description,
    `cadence-lint: config section '${sectionName}' pattern segment ${index + 1} description must be a string`,
  );

  return {
    count,
    ...(description === undefined ? {} : { description }),
  };
}

function readOptionalString(value: unknown, errorMessage: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(errorMessage);
  }

  return value;
}

function readProtectedPatterns(config: unknown): readonly RegExp[] {
  if (!isRecord(config) || config.exceptions === undefined) {
    return [];
  }

  if (!Array.isArray(config.exceptions)) {
    throw new Error("cadence-lint: config exceptions must be an array of regex strings");
  }

  return config.exceptions.map((pattern, index) => {
    if (typeof pattern !== "string") {
      throw new Error(`cadence-lint: config exceptions[${index}] must be a string`);
    }

    try {
      return new RegExp(pattern);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `cadence-lint: config exceptions[${index}] is not a valid regex: ${detail}`,
      );
    }
  });
}

function readSectionBalance(config: unknown): SectionBalanceOptions | undefined {
  if (!isRecord(config) || config.sectionBalance === undefined) {
    return undefined;
  }

  if (!isRecord(config.sectionBalance)) {
    throw new Error("cadence-lint: config sectionBalance must be an object");
  }

  const measure = config.sectionBalance.measure ?? "words";
  if (measure !== "words" && measure !== "sentences" && measure !== "paragraphs") {
    throw new Error(
      "cadence-lint: config sectionBalance.measure must be words, sentences, or paragraphs",
    );
  }

  const ratio = config.sectionBalance.maxLargestToSmallestRatio;
  if (typeof ratio !== "number" || ratio <= 0) {
    throw new Error(
      "cadence-lint: config sectionBalance.maxLargestToSmallestRatio must be a positive number",
    );
  }

  return {
    measure,
    maxLargestToSmallestRatio: ratio,
    ...withOptionalConfig(
      "ignoreHeadings",
      readStringArray(
        config.sectionBalance.ignoreHeadings,
        "cadence-lint: config sectionBalance.ignoreHeadings must be an array of strings",
      ),
    ),
  };
}

function readListBalance(config: unknown): ListBalanceOptions | undefined {
  if (!isRecord(config) || config.listBalance === undefined) {
    return undefined;
  }

  if (!isRecord(config.listBalance)) {
    throw new Error("cadence-lint: config listBalance must be an object");
  }

  return {
    ...withOptionalConfig(
      "maxConsecutiveLists",
      readOptionalPositiveInteger(
        config.listBalance.maxConsecutiveLists,
        "cadence-lint: config listBalance.maxConsecutiveLists must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "requireParagraphBeforeList",
      readOptionalBoolean(
        config.listBalance.requireParagraphBeforeList,
        "cadence-lint: config listBalance.requireParagraphBeforeList must be a boolean",
      ),
    ),
    ...withOptionalConfig(
      "requireParagraphAfterList",
      readOptionalBoolean(
        config.listBalance.requireParagraphAfterList,
        "cadence-lint: config listBalance.requireParagraphAfterList must be a boolean",
      ),
    ),
  };
}

function readTitle(config: unknown): TitleOptions | undefined {
  if (!isRecord(config) || config.title === undefined) {
    return undefined;
  }

  if (!isRecord(config.title)) {
    throw new Error("cadence-lint: config title must be an object");
  }

  return {
    ...withOptionalConfig(
      "minWords",
      readOptionalPositiveInteger(
        config.title.minWords,
        "cadence-lint: config title.minWords must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "maxWords",
      readOptionalPositiveInteger(
        config.title.maxWords,
        "cadence-lint: config title.maxWords must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "minCharacters",
      readOptionalPositiveInteger(
        config.title.minCharacters,
        "cadence-lint: config title.minCharacters must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "maxCharacters",
      readOptionalPositiveInteger(
        config.title.maxCharacters,
        "cadence-lint: config title.maxCharacters must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "allowSubtitle",
      readOptionalBoolean(
        config.title.allowSubtitle,
        "cadence-lint: config title.allowSubtitle must be a boolean",
      ),
    ),
    ...withOptionalConfig(
      "maxSubtitleWords",
      readOptionalPositiveInteger(
        config.title.maxSubtitleWords,
        "cadence-lint: config title.maxSubtitleWords must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "maxSubtitleCharacters",
      readOptionalPositiveInteger(
        config.title.maxSubtitleCharacters,
        "cadence-lint: config title.maxSubtitleCharacters must be a positive integer",
      ),
    ),
  };
}

function readIntroduction(config: unknown): IntroductionOptions | undefined {
  if (!isRecord(config) || config.introduction === undefined) {
    return undefined;
  }

  if (!isRecord(config.introduction)) {
    throw new Error("cadence-lint: config introduction must be an object");
  }

  return {
    ...withOptionalConfig(
      "heading",
      readOptionalString(
        config.introduction.heading,
        "cadence-lint: config introduction.heading must be a string",
      ),
    ),
    ...withOptionalConfig(
      "maxParagraphs",
      readOptionalPositiveInteger(
        config.introduction.maxParagraphs,
        "cadence-lint: config introduction.maxParagraphs must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "allowedStructures",
      config.introduction.allowedStructures === undefined
        ? undefined
        : readPatternBucket(
            "introduction",
            "any",
            config.introduction.allowedStructures,
          ),
    ),
    ...withOptionalConfig(
      "requireLastSentenceMarker",
      readStringArray(
        config.introduction.requireLastSentenceMarker,
        "cadence-lint: config introduction.requireLastSentenceMarker must be an array of strings",
      ),
    ),
  };
}

function readWording(config: unknown): WordingOptions | undefined {
  if (!isRecord(config) || config.wording === undefined) {
    return undefined;
  }

  if (!isRecord(config.wording)) {
    throw new Error("cadence-lint: config wording must be an object");
  }

  return {
    ...withOptionalConfig(
      "enabled",
      readOptionalBoolean(
        config.wording.enabled,
        "cadence-lint: config wording.enabled must be a boolean",
      ),
    ),
    ...withOptionalConfig(
      "bannedTerms",
      readStringArray(
        config.wording.bannedTerms,
        "cadence-lint: config wording.bannedTerms must be an array of strings",
      ),
    ),
    ...withOptionalConfig(
      "useDefaults",
      readOptionalBoolean(
        config.wording.useDefaults,
        "cadence-lint: config wording.useDefaults must be a boolean",
      ),
    ),
  };
}

function readLists(config: unknown): ListsOptions | undefined {
  if (!isRecord(config) || config.lists === undefined) {
    return undefined;
  }

  if (!isRecord(config.lists)) {
    throw new Error("cadence-lint: config lists must be an object");
  }

  return {
    ...withOptionalConfig(
      "maxItems",
      readOptionalPositiveInteger(
        config.lists.maxItems,
        "cadence-lint: config lists.maxItems must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "maxWordsPerItem",
      readOptionalPositiveInteger(
        config.lists.maxWordsPerItem,
        "cadence-lint: config lists.maxWordsPerItem must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "maxDepth",
      readOptionalPositiveInteger(
        config.lists.maxDepth,
        "cadence-lint: config lists.maxDepth must be a positive integer",
      ),
    ),
    ...withOptionalConfig(
      "allowedPrefixes",
      readStringArray(
        config.lists.allowedPrefixes,
        "cadence-lint: config lists.allowedPrefixes must be an array of strings",
      ),
    ),
  };
}

function readOptionalPositiveInteger(
  value: unknown,
  errorMessage: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(errorMessage);
  }

  return value;
}

function readOptionalBoolean(
  value: unknown,
  errorMessage: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(errorMessage);
  }

  return value;
}

function readStringArray(
  value: unknown,
  errorMessage: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(errorMessage);
  }

  return value;
}

function stripJsonComments(contents: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    const nextCharacter = contents[index + 1];

    if (inString) {
      output += character;

      if (character === "\"" && !escaped) {
        inString = false;
      }

      escaped = character === "\\" && !escaped;

      continue;
    }

    if (character === "\"") {
      inString = true;
      output += character;
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      while (index < contents.length && contents[index] !== "\n") {
        index += 1;
      }
      output += "\n";
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      index += 2;
      while (
        index < contents.length &&
        !(contents[index] === "*" && contents[index + 1] === "/")
      ) {
        output += contents[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      index += 1;
      continue;
    }

    output += character;
  }

  return output;
}

function stripTrailingCommas(contents: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];

    if (inString) {
      output += character;

      if (character === "\"" && !escaped) {
        inString = false;
      }

      escaped = character === "\\" && !escaped;

      continue;
    }

    if (character === "\"") {
      inString = true;
      output += character;
      continue;
    }

    if (character !== ",") {
      output += character;
      continue;
    }

    const nextSignificantIndex = findNextSignificantIndex(contents, index + 1);

    if (
      nextSignificantIndex !== undefined &&
      /[}\]]/.test(contents[nextSignificantIndex])
    ) {
      continue;
    }

    output += character;
  }

  return output;
}

function findNextSignificantIndex(
  contents: string,
  startIndex: number,
): number | undefined {
  for (let index = startIndex; index < contents.length; index += 1) {
    if (!/\s/.test(contents[index])) {
      return index;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSegmentList(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isRecord(item) && "count" in item)
  );
}

function isPatternObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && "pattern" in value;
}

function isAnchoredSectionRuleObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    ("any" in value || "start" in value || "middle" in value || "end" in value)
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
