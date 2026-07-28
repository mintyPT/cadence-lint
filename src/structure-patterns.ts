export function parseStructurePattern(pattern: string): number[] {
  if (pattern.trim().length === 0) {
    throw new Error("Structure pattern must not be empty.");
  }

  return pattern.split("/").map((segment, index) => {
    const segmentNumber = index + 1;

    if (segment.length === 0) {
      throw new Error(
        `Structure pattern segment ${segmentNumber} is empty in "${pattern}".`,
      );
    }

    if (!/^\d+$/.test(segment)) {
      throw new Error(
        `Structure pattern segment ${segmentNumber} must be a positive integer in "${pattern}".`,
      );
    }

    const count = Number(segment);

    if (count <= 0) {
      throw new Error(
        `Structure pattern segment ${segmentNumber} must be greater than zero in "${pattern}".`,
      );
    }

    return count;
  });
}
