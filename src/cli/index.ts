#!/usr/bin/env node
import { Command } from "commander";
import { createGreeting } from "../index.js";

const program = new Command();

program
  .name("cadence-lint")
  .description("Lint prose structure and cadence from Markdown.")
  .version("0.1.0");

program
  .command("greet")
  .argument("<name>", "Name to greet")
  .option("-p, --punctuation <mark>", "Greeting punctuation", "!")
  .action((name: string, options: { punctuation: string }) => {
    console.log(createGreeting(name, { punctuation: options.punctuation }));
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
