import fs from "node:fs";

const APP_LINE_LIMIT = 260;
const appPath = new URL("../src/App.jsx", import.meta.url);
const lineCount = fs.readFileSync(appPath, "utf8").split(/\r?\n/).length;

if (lineCount > APP_LINE_LIMIT) {
  console.error(
    `App.jsx is ${lineCount} lines; the maximum is ${APP_LINE_LIMIT}. ` +
      "Extract functionality into a focused hook or component rather than " +
      "raising the limit casually."
  );
  process.exit(1);
}

console.log(`App.jsx line count ${lineCount}/${APP_LINE_LIMIT}`);
