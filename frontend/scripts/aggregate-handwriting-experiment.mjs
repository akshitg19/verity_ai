import { readFile } from "node:fs/promises";

import { aggregateHandwritingExperimentRuns } from
  "../src/recognition/handwritingExperienceReport.js";

const arguments_ = process.argv.slice(2);
const requireReady = arguments_.includes("--require-ready");
const paths = arguments_.filter((value) => value !== "--require-ready");
if (paths.length === 0) {
  console.error(
    "Usage: npm run handwriting:aggregate -- [--require-ready] " +
      "<legacy.json> <current.json> [...]"
  );
  process.exitCode = 2;
} else {
  try {
    const runs = await Promise.all(paths.map(async (path) =>
      JSON.parse(await readFile(path, "utf8"))
    ));
    const report = aggregateHandwritingExperimentRuns(runs);
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
