const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../src/lib/mapPins.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObject = {};
vm.runInNewContext(output, { exports: exportsObject });
const { groupMapPoints, escapeMapLabel } = exportsObject;
function point(id, lat = 35.7, lon = 51.4) { return { id, lat, lon, label: id }; }
test("co-located stores stay selectable as separate records", () => {
  const groups = groupMapPoints([point("floor-1"), point("floor-2")], 19);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].lat, 35.7);
  assert.equal(groups[0].lon, 51.4);
});
test("separate stores can separate as the map zooms in", () => {
  const points = [point("one"), point("two", 35.7, 51.4003)];
  assert.ok(groupMapPoints(points, 19).length > groupMapPoints(points, 10).length);
});
test("invalid coordinates do not become markers", () => {
  assert.equal(groupMapPoints([point("bad", NaN), point("good")], 15).length, 1);
  assert.equal(groupMapPoints([point("bad", NaN), point("good")], 15)[0].items[0].id, "good");
});
test("store labels cannot inject markup into map pins", () => {
  assert.equal(escapeMapLabel('<img src=x onerror="alert(1)"> & shop'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; shop');
});
