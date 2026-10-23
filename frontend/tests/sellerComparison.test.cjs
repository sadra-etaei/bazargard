const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"); const ts = require("typescript"); const vm = require("node:vm");
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve("../src/lib/sellerComparison.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject });
const { toggleSeller, resolveSellers, bestOffer, lowestEligiblePrice } = exportsObject;
const add = (s, id, shop = id, product = "p") => toggleSeller(s, product, "Product", id, shop);
const offer = (id, price, score = 1, changes = {}) => ({ offer_id: id, price, score, matches_filters: true, stock: { state: "unconfirmed" }, shop: { status: { state: "open" } }, ...changes });
test("select up to three unique sellers and explicitly remove one", () => {
 let s = add(add(add(null, "1"), "2"), "3"); assert.equal(s.sellers.length, 3); assert.equal(add(s, "4"), s);
 s = add(s, "2"); assert.equal(s.sellers.length, 2); assert.equal(add(s, "4").sellers.length, 3);
});
test("another offer at one shop replaces that shop without duplicating it", () => {
 let s = add(null, "a", "shop"); s = add(s, "b", "shop"); assert.equal(s.sellers.length, 1); assert.equal(s.sellers[0].offerId, "b");
});
test("different products start separate seller comparisons", () => {
 const s = add(add(null, "a"), "b", "shop-b", "different"); assert.equal(s.productId, "different"); assert.equal(s.sellers.length, 1);
});
test("missing offers keep their exact column instead of substituting", () => {
 const a = offer("a", 100); const b = offer("b", 200); const result = resolveSellers(["a", "missing", "b"], [a, b]);
 assert.equal(result[0], a); assert.equal(result[1], undefined); assert.equal(result[2], b);
});
test("out of stock, closed and mismatching offers cannot win on price", () => {
 const selected = offer("selected", 500, 5);
 const offers = [offer("out", 1, 100, { stock: { state: "out" } }), offer("closed", 2, 100, { shop: { status: { state: "closed" } } }), offer("wrong", 3, 100, { matches_filters: false }), selected];
 assert.equal(bestOffer(offers), selected); assert.equal(lowestEligiblePrice(offers), 500);
 assert.equal(bestOffer(offers.slice(0, 3)), undefined); assert.equal(lowestEligiblePrice(offers.slice(0, 3)), null);
});
