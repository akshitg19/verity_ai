import { readFile } from "node:fs/promises";

import { aggregateHandwritingExperimentRuns } from
  "../src/recognition/handwritingExperienceReport.js";

const arguments_ = process.argv.slice(2);
let requireReady = false;
const requiredEnvironments = [];
const paths = [];
let invalidArguments = false;
for (let index = 0; index < arguments_.length; index += 1) {
  const value = arguments_[index];
  if (value === "--require-ready") {
    requireReady = true;
  } else if (value === "--require-environment") {
    const environment = arguments_[index + 1];
    if (!environment || environment.startsWith("--")) {
      invalidArguments = true;
      break;
    }
    requiredEnvironments.push(environment);
    index += 1;
  } else if (value.startsWith("--")) {
    invalidArguments = true;
    break;
  } else {
    paths.push(value);
  }
}
if (invalidArguments || paths.length === 0) {
  console.error(
    "Usage: npm run handwriting:aggregate -- [--require-ready] " +
      "[--require-environment browser/device]... " +
      "<legacy.json> <current.json> [...]"
  );
  process.exitCode = 2;
} else {
  try {
    const runs = await Promise.all(paths.map(async (path) =>
      JSON.parse(await readFile(path, "utf8"))
    ));
    const report = aggregateHandwritingExperimentRuns(runs, {
      requiredEnvironments,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (requireReady && !report.readiness.ready) {
      console.error("Handwriting A/B evidence readiness gate failed.");
      process.exitCode = 1;
    }
  } catch (error) {
    const safeValidationMessage = error instanceof TypeError &&
      error.message.startsWith("Invalid handwriting experiment export:")
      ? error.message
      : "Handwriting A/B input could not be read or parsed.";
    console.error(safeValidationMessage);
    process.exitCode = 1;
  }
}
