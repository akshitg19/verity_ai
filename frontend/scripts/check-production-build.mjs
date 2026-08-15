import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const expected = "https://verity-ai-389644353290.us-central1.run.app/api";
const assetsDir = new URL("../dist/assets/", import.meta.url);
const files = await readdir(assetsDir);
const javascript = files
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFile(join(assetsDir.pathname, file), "utf8"));
const source = (await Promise.all(javascript)).join("\n");

if (!source.includes(expected)) {
  throw new Error(`Production bundle is missing the expected API base: ${expected}`);
}

if (source.includes('const API_BASE="/api"') || source.includes("const API_BASE='/api'")) {
  throw new Error("Production bundle still uses /api as its effective API base.");
}

const forbiddenProviderSecretTokens = [
  "MYSCRIPT_APPLICATION_KEY",
  "MYSCRIPT_HMAC_KEY",
  "verity-myscript-application-key",
  "verity-myscript-hmac-key",
];
for (const token of forbiddenProviderSecretTokens) {
  if (source.includes(token)) {
    throw new Error(`Production bundle contains a forbidden provider-secret token: ${token}`);
  }
}

console.log(`Production API base verified in ${javascript.length} JavaScript asset(s): ${expected}`);
console.log("Production bundle contains no MyScript provider-secret names.");
