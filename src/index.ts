export interface GreetingOptions {
  punctuation?: string;
}

export function createGreeting(name: string, options: GreetingOptions = {}): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Name must not be empty.");
  }

  return `Hello, ${trimmed}${options.punctuation ?? "!"}`;
}
