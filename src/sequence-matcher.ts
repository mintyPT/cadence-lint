export interface SequenceMatchPass {
  passed: true;
  segmentation: number[][];
}

export interface SequenceMatchFail {
  passed: false;
  unmatchedSuffixStart: number;
  failurePlacement?: SequencePatternPlacement;
}

export type SequenceMatchResult = SequenceMatchPass | SequenceMatchFail;
export type SequencePatternPlacement = "any" | "start" | "middle" | "end";

export interface AnchoredSequencePatterns {
  any?: readonly (readonly number[])[];
  start?: readonly (readonly number[])[];
  middle?: readonly (readonly number[])[];
  end?: readonly (readonly number[])[];
}

export function matchSequence(
  observedCounts: number[],
  allowedPatterns: number[][],
): SequenceMatchResult {
  assertNonEmptyPatterns(allowedPatterns);

  const result = segmentFrom(observedCounts, allowedPatterns, 0);

  if (result.segmentation !== undefined) {
    return {
      passed: true,
      segmentation: result.segmentation,
    };
  }

  return {
    passed: false,
    unmatchedSuffixStart: result.unmatchedSuffixStart,
  };
}

export function matchAnchoredSequence(
  observedCounts: readonly number[],
  patterns: AnchoredSequencePatterns,
): SequenceMatchResult {
  const anyPatterns = patterns.any ?? [];
  const startPatterns = patterns.start ?? [];
  const middlePatterns =
    patterns.middle ?? (hasAnchoredPatterns(patterns) ? anyPatterns : []);
  const endPatterns = patterns.end ?? [];

  assertNonEmptyPatterns([
    ...anyPatterns,
    ...startPatterns,
    ...middlePatterns,
    ...endPatterns,
  ]);

  if (!hasAnchoredPatterns(patterns)) {
    return matchSequence([...observedCounts], anyPatterns.map((pattern) => [...pattern]));
  }

  const startMatches =
    startPatterns.length === 0
      ? [[]]
      : startPatterns.filter((pattern) => matchesAt(observedCounts, pattern, 0));

  if (startMatches.length === 0) {
    return {
      passed: false,
      unmatchedSuffixStart: 0,
      failurePlacement: "start",
    };
  }

  const endMatches =
    endPatterns.length === 0
      ? [{ pattern: [], startIndex: observedCounts.length }]
      : endPatterns
          .map((pattern) => ({
            pattern,
            startIndex: observedCounts.length - pattern.length,
          }))
          .filter(
            ({ pattern, startIndex }) =>
              startIndex >= 0 && matchesAt(observedCounts, pattern, startIndex),
          );

  if (endMatches.length === 0) {
    return {
      passed: false,
      unmatchedSuffixStart: findAnchoredEndMismatchStart(observedCounts, endPatterns),
      failurePlacement: "end",
    };
  }

  let bestMiddleFailure: SequenceMatchFail | undefined;

  for (const startPattern of startMatches) {
    const middleStart = startPattern.length;

    for (const endMatch of endMatches) {
      if (middleStart > endMatch.startIndex) {
        continue;
      }

      const middleObserved = observedCounts.slice(middleStart, endMatch.startIndex);

      if (middleObserved.length === 0) {
        return {
          passed: true,
          segmentation: [
            ...(startPattern.length === 0 ? [] : [[...startPattern]]),
            ...(endMatch.pattern.length === 0 ? [] : [[...endMatch.pattern]]),
          ],
        };
      }

      if (middlePatterns.length === 0) {
        bestMiddleFailure = chooseLaterFailure(bestMiddleFailure, {
          passed: false,
          unmatchedSuffixStart: middleStart,
          failurePlacement: "middle",
        });
        continue;
      }

      const middleResult = matchSequence(
        [...middleObserved],
        middlePatterns.map((pattern) => [...pattern]),
      );

      if (middleResult.passed) {
        return {
          passed: true,
          segmentation: [
            ...(startPattern.length === 0 ? [] : [[...startPattern]]),
            ...middleResult.segmentation,
            ...(endMatch.pattern.length === 0 ? [] : [[...endMatch.pattern]]),
          ],
        };
      }

      bestMiddleFailure = chooseLaterFailure(bestMiddleFailure, {
        passed: false,
        unmatchedSuffixStart: middleStart + middleResult.unmatchedSuffixStart,
        failurePlacement: "middle",
      });
    }
  }

  return (
    bestMiddleFailure ?? {
      passed: false,
      unmatchedSuffixStart: Math.min(observedCounts.length, startMatches[0]?.length ?? 0),
      failurePlacement: "middle",
    }
  );
}

function hasAnchoredPatterns(patterns: AnchoredSequencePatterns): boolean {
  return (
    patterns.start !== undefined ||
    patterns.middle !== undefined ||
    patterns.end !== undefined
  );
}

function assertNonEmptyPatterns(patterns: readonly (readonly number[])[]): void {
  for (const pattern of patterns) {
    if (pattern.length === 0) {
      throw new Error("Allowed sequence patterns must not be empty.");
    }
  }
}

function chooseLaterFailure(
  current: SequenceMatchFail | undefined,
  candidate: SequenceMatchFail,
): SequenceMatchFail {
  if (
    current === undefined ||
    candidate.unmatchedSuffixStart > current.unmatchedSuffixStart
  ) {
    return candidate;
  }

  return current;
}

function findAnchoredEndMismatchStart(
  observedCounts: readonly number[],
  endPatterns: readonly (readonly number[])[],
): number {
  let mismatchStart = Math.max(0, observedCounts.length - 1);

  for (const pattern of endPatterns) {
    const startIndex = observedCounts.length - pattern.length;

    if (startIndex < 0) {
      mismatchStart = 0;
      continue;
    }

    const mismatchIndex = findPatternMismatchIndex(
      observedCounts,
      pattern,
      startIndex,
    );

    if (mismatchIndex !== undefined) {
      mismatchStart = Math.min(mismatchStart, mismatchIndex);
    }
  }

  return mismatchStart;
}

interface SegmentSearchResult {
  segmentation?: number[][];
  unmatchedSuffixStart: number;
}

function segmentFrom(
  observedCounts: number[],
  allowedPatterns: number[][],
  startIndex: number,
): SegmentSearchResult {
  if (startIndex === observedCounts.length) {
    return {
      segmentation: [],
      unmatchedSuffixStart: startIndex,
    };
  }

  let unmatchedSuffixStart = startIndex;

  for (const pattern of allowedPatterns) {
    if (!matchesAt(observedCounts, pattern, startIndex)) {
      continue;
    }

    const rest = segmentFrom(
      observedCounts,
      allowedPatterns,
      startIndex + pattern.length,
    );

    if (rest.segmentation !== undefined) {
      return {
        segmentation: [pattern, ...rest.segmentation],
        unmatchedSuffixStart: rest.unmatchedSuffixStart,
      };
    }

    unmatchedSuffixStart = Math.max(
      unmatchedSuffixStart,
      rest.unmatchedSuffixStart,
    );
  }

  return { unmatchedSuffixStart };
}

function matchesAt(
  observedCounts: readonly number[],
  pattern: readonly number[],
  startIndex: number,
): boolean {
  if (startIndex + pattern.length > observedCounts.length) {
    return false;
  }

  return pattern.every(
    (expectedCount, offset) => observedCounts[startIndex + offset] === expectedCount,
  );
}

function findPatternMismatchIndex(
  observedCounts: readonly number[],
  pattern: readonly number[],
  startIndex: number,
): number | undefined {
  for (let offset = 0; offset < pattern.length; offset += 1) {
    const observedCount = observedCounts[startIndex + offset];

    if (observedCount !== pattern[offset]) {
      return startIndex + offset;
    }
  }

  return undefined;
}
