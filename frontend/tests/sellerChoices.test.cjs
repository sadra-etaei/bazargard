const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../src/lib/sellerChoices.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObject = {};
vm.runInNewContext(output, { exports: exportsObject });
const { sellerChoices } = exportsObject;
function offer(id, price, time, stock = "unconfirmed", at) {
  return { offer_id: id, matches_filters: true, price, stock: { state: stock, at }, shop: { shop_id: id, travel_min: time, status: { state: "open" } } };
}
test("a seller fulfilling several roles appears once", () => {
  const choices = sellerChoices([offer("one", 100, 0, "confirmed", "2026-10-23T10:00:00Z")]);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].labels.length, 3);
});
test("unknown price and travel time cannot win their categories", () => {
  const choices = sellerChoices([offer("unknown", null, null), offer("known", 200, 10)]);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].offer.offer_id, "known");
});
test("a price change alone does not win stock confirmation", () => {
  const choices = sellerChoices([offer("price", 100, 1, "price_changed", "2026-10-23T12:00:00Z"), offer("stock", 200, 2, "confirmed", "2026-10-23T10:00:00Z")]);
  assert.equal(choices.find((c) => c.labels.includes("تازه‌ترین تأیید موجودی")).offer.offer_id, "stock");
});
test("closed, unavailable and mismatching sellers cannot be shortlisted", () => {
  const closed = offer("closed", 1, 1); closed.shop.status.state = "closed";
  const mismatch = offer("mismatch", 1, 1); mismatch.matches_filters = false;
  assert.equal(sellerChoices([closed, mismatch, offer("out", 1, 1, "out")]).length, 0);
});
test("latest stock evidence wins confirmation role", () => {
  const choices = sellerChoices([offer("old", 100, 1, "confirmed", "2026-10-22T10:00:00Z"), offer("new", 200, 2, "confirmed", "2026-10-23T10:00:00Z")]);
  assert.equal(choices.find((c) => c.labels.includes("تازه‌ترین تأیید موجودی")).offer.offer_id, "new");
});
