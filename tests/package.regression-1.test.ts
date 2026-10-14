// Regression: ISSUE-001 — `bun run test` left out tests/plugins.test.ts.
// Found by /qa on 2026-10-14
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-10-14.md
import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import pkg from "../package.json";

// `bun run test` names the files in tests/ one by one (the browser tests in tests/e2e run apart).
test("the unit test command names every test file in tests/", () => {
  const named = pkg.scripts.test.split(" ");
  const files = readdirSync(import.meta.dir)
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => `tests/${f}`);
  expect(files.length).toBeGreaterThan(3);
  expect(files.filter((f) => !named.includes(f))).toEqual([]);
});
