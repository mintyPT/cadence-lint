export interface SequenceMatchPass {
  passed: true;
  segmentation: number[][];
}

export interface SequenceMatchFail {
  passed: false;
  unmatchedSuffixStart: number;
}

export type SequenceMatchResult = SequenceMatchPass | SequenceMatchFail;

export function matchSequence(
  observedCounts: number[],
  allowedPatterns: number[][],
): SequenceMatchResult {
  for (const pattern of allowedPatterns) {
    if (pattern.length === 0) {
      throw new Error("Allowed sequence patterns must not be empty.");
    }
  }

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
  observedCounts: number[],
  pattern: number[],
  startIndex: number,
): boolean {
  if (startIndex + pattern.length > observedCounts.length) {
    return false;
  }

  return pattern.every(
    (expectedCount, offset) => observedCounts[startIndex + offset] === expectedCount,
  );
}
