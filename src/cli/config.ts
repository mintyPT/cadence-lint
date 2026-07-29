import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseStructurePattern, type SectionStructureRules } from "../index.js";

export interface CadenceCliConfig {
  language: string;
  sectionRules: SectionStructureRules;
  protectedPatterns: readonly RegExp[];
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
  };
}

export function defaultConfig(): CadenceCliConfig {
  return {
    language: "en",
    sectionRules: {},
    protectedPatterns: [],
  };
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

  const sectionRules: Record<string, number[][]> = {};

  for (const [sectionName, patterns] of Object.entries(config.sections)) {
    const patternValues = Array.isArray(patterns) ? patterns : [patterns];
    sectionRules[sectionName] = patternValues.map((pattern) => {
      if (typeof pattern !== "string") {
        throw new Error(
          `cadence-lint: config section '${sectionName}' patterns must be strings`,
        );
      }

      return parseStructurePattern(pattern);
    });
  }

  return sectionRules;
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

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
