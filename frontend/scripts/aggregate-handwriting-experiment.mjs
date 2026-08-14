import { readFile } from "node:fs/promises";

import { aggregateHandwritingExperimentRuns } from
  "../src/recognition/handwritingExperienceReport.js";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error(
    "Usage: npm run handwriting:aggregate -- <legacy.json> <current.json> [...]"
  );
  process.exitCode = 2;
} else {
  const runs = await Promise.all(paths.map(async (path) =>
    JSON.parse(await readFile(path, "utf8"))
  ));
  process.stdout.write(`${JSON.stringify(
    aggregateHandwritingExperimentRuns(runs),
    null,
    2
  )}\n`);
}
