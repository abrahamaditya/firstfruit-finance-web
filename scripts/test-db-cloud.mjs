import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const testsDirectory = join(projectRoot, "supabase", "tests", "database");
const testFiles = readdirSync(testsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const supabaseCli = join(
  projectRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);

if (testFiles.length === 0) {
  throw new Error("No database test files were found.");
}

for (const file of testFiles) {
  const absolutePath = join(testsDirectory, file);
  const displayPath = relative(projectRoot, absolutePath);
  const result = spawnSync(
    process.execPath,
    [
      supabaseCli,
      "db",
      "query",
      "--linked",
      "--file",
      absolutePath,
      "--output",
      "json",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || String(result.error ?? ""));
    throw new Error(`${displayPath} could not be executed.`);
  }

  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    process.stderr.write(result.stderr || "");
    process.stderr.write(result.stdout || "");
    throw new Error(`${displayPath} returned an invalid test response.`);
  }

  const testOutput = JSON.stringify(response.rows ?? []);
  if (/\bnot ok\b|Looks like you failed/i.test(testOutput)) {
    process.stderr.write(`${testOutput}\n`);
    throw new Error(`${displayPath} failed.`);
  }

  process.stdout.write(`PASS ${displayPath}\n`);
}

process.stdout.write(`All ${testFiles.length} cloud database test suites passed.\n`);
