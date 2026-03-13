import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const INDEX_HTML = path.resolve("src/public/index.html");

test("interval options should match 15m/1h/4h/24h windows", async () => {
  const html = await readFile(INDEX_HTML, "utf8");

  const options = [...html.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]);
  const unique = [...new Set(options)];

  assert.deepEqual(unique, ["15m", "1h", "4h", "24h"]);
});
