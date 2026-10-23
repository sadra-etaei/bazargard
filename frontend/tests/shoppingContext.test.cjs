const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve("../src/lib/shoppingContext.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject });
const { EMPTY_SEARCH_SCOPE: empty, mergeSearchScope, scopeFromParams, conversationFilters, parseBudgetInput } = exportsObject;
test("budget and mall survive new product searches while item facets reset", () => {
 const previous = { ...empty, q: "phone", category: "phones", brand: "apple", mall: "mall", budget_max: 2000000 };
 const result = scopeFromParams(new URLSearchParams("q=charger"), previous);
 assert.equal(result.budget_max, 2000000); assert.equal(result.mall, "mall"); assert.equal(result.category, null); assert.equal(result.brand, null);
});
test("explicit cleared budgets and disabled conditions override stale chat", () => {
 const result = conversationFilters({ budget_max: 200, installments: true, lat: 35 }, { budget_max: null, installments: false, lat: null });
 assert.equal(result.budget_max, null); assert.equal(result.installments, false); assert.equal(result.lat, null);
});
test("scope updates preserve omitted keys but respect explicit removals", () => {
 const scope = mergeSearchScope({ ...empty, budget_max: 200, mall: "mall" }, { budget_max: null });
 assert.equal(scope.budget_max, null); assert.equal(scope.mall, "mall");
});
test("deep links can explicitly replace or clear a budget", () => {
 assert.equal(scopeFromParams(new URLSearchParams("budget_max=500"), { ...empty, budget_max: 200 }).budget_max, 500);
 assert.equal(scopeFromParams(new URLSearchParams("budget_max="), { ...empty, budget_max: 200 }).budget_max, null);
});
test("Persian and Arabic digits become numeric toman values", () => {
 assert.equal(parseBudgetInput("۲٬۵۰۰٬۰۰۰"), 2500000); assert.equal(parseBudgetInput("١٢٠٠"), 1200); assert.equal(parseBudgetInput(""), null); assert.equal(parseBudgetInput("abc"), null);
});
