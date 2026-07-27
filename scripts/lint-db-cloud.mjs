import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const supabaseCli = join(
  projectRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const result = spawnSync(
  process.execPath,
  [
    supabaseCli,
    "db",
    "lint",
    "--linked",
    "--level",
    "warning",
    "--fail-on",
    "none",
  ],
  {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || String(result.error ?? ""));
  throw new Error("The linked database could not be linted.");
}

let response;
try {
  response = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr || "");
  process.stderr.write(result.stdout || "");
  throw new Error("Supabase returned an invalid database lint response.");
}

const ignoredIssues = [];
const reportableIssues = [];

for (const functionResult of response.results ?? []) {
  for (const issue of functionResult.issues ?? []) {
    const entry = {
      function: functionResult.function,
      ...issue,
    };
    const isKnownTemporaryTableFalsePositive =
      entry.function === "public.finalize_split_bill" &&
      entry.sqlState === "42P01" &&
      entry.message === 'relation "pg_temp.firstfruit_split_net" does not exist';

    if (isKnownTemporaryTableFalsePositive) {
      ignoredIssues.push(entry);
    } else {
      reportableIssues.push(entry);
    }
  }
}

for (const issue of reportableIssues) {
  process.stdout.write(
    `${issue.level.toUpperCase()} ${issue.function}: ${issue.message}\n`,
  );
}
for (const issue of ignoredIssues) {
  process.stdout.write(
    `KNOWN ${issue.function}: ${issue.message} (runtime temp table; covered by pgTAP)\n`,
  );
}

const errors = reportableIssues.filter((issue) => issue.level === "error");
if (errors.length > 0) {
  throw new Error(`${errors.length} database lint error(s) found.`);
}

process.stdout.write(
  `Database lint passed with ${reportableIssues.length} warning(s) and ${ignoredIssues.length} documented false-positive(s).\n`,
);
