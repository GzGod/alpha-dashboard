import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const INDEX_HTML = path.resolve("src/public/index.html");

test("scan limit should initialize to 0 and be controlled by token count", async () => {
  const html = await readFile(INDEX_HTML, "utf8");
  const match = html.match(/id="scanLimitInput"[^>]*value="(\d+)"[^>]*readonly/);
  assert.ok(match, "scan limit input should exist");
  assert.equal(Number(match[1]), 0);
});
