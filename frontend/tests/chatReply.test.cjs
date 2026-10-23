const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
function harness() {
  let state, effect, tick, active = false;
  const output = ts.transpileModule(fs.readFileSync(require.resolve("../src/pages/Chat.tsx"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exportsObject = {};
  const element = (type, props) => ({type, props});
  vm.runInNewContext(output + "\nexports.RichForTest = Rich;", {
    exports: exportsObject,
    require: name => name === "react" ? {
      useState: initial => { if (state === undefined) state = initial; return [state, next => { state = typeof next === "function" ? next(state) : next; }]; },
      useEffect: fn => { if (!effect) effect = fn; },
    } : name === "react/jsx-runtime" ? {jsx: element, jsxs: element, Fragment: "Fragment"} : {},
    setInterval: fn => {tick = fn; active = true; return 1;}, clearInterval: () => {active = false;},
  });
  return {render: props => exportsObject.RichForTest(props), start: () => effect(), tick: () => {if (active) tick();}};
}
function text(node) {
 if (node === null || node === undefined || typeof node === "boolean") return "";
 if (typeof node === "string" || typeof node === "number") return String(node);
 if (Array.isArray(node)) return node.map(text).join("");
 return text(node.props?.children);
}
test("animated Persian replies reveal characters and finish with the original reply", () => {
 const h = harness(); let finished = 0;
 const reply = "قیمت ثبت‌شده با موجودی فرق دارد.";
 const props = {text: reply, animate: true, onDone: () => finished++};
 assert.equal(text(h.render(props)), ""); h.start(); h.tick();
 const partial = text(h.render(props)); assert.ok(partial.length > 0); assert.ok(partial.length < reply.length);
 for (let i = 0; i < 100; i++) h.tick();
 assert.equal(text(h.render(props)), reply); assert.equal(finished, 1);
});
test("restored replies are visible immediately without animation", () => {
 const h = harness(); assert.equal(text(h.render({text: "پاسخ قبلی", animate: false})), "پاسخ قبلی");
});
