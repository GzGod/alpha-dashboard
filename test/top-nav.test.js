import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const INDEX_HTML = path.resolve("src/public/index.html");

test("top nav links should point to real page sections", async () => {
  const html = await readFile(INDEX_HTML, "utf8");

  const navMatch = html.match(/<nav class="top-nav">([\s\S]*?)<\/nav>/);
  assert.ok(navMatch, "top nav should exist");

  const navBlock = navMatch[1];
  const hrefMatches = [...navBlock.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefMatches.length > 0, "top nav should contain links");

  for (const href of hrefMatches) {
    assert.notEqual(href, "#", "top nav link should not use placeholder '#'");
    assert.ok(href.startsWith("#"), "top nav link should be section anchor");

    const sectionId = href.slice(1);
    assert.ok(sectionId.length > 0, "section anchor should not be empty");

    const idPattern = new RegExp(`<section[^>]*id="${sectionId}"`, "i");
    assert.ok(idPattern.test(html), `section '${sectionId}' should exist`);
  }
});
