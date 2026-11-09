"use strict";
const assert = require("assert");
const engine = require("../bin/resources/app/plugins/goowee-preview/preview-engine.js");
const preamble = '#import "games.keevee.gw"\n';
let count = 0;
function test(name, fn) { fn(); count++; console.log("ok - " + name); }
function preview(source, options) { return engine.analyze(preamble + source, options || {}); }
function texts(scene) { return scene.nodes.filter(node => node.type === "Label").map(node => node.text); }
function clean(scene) { assert.deepStrictEqual(scene.diagnostics, []); }

test("compact values substitute local declarations, assignments, returns and if conditions", () => {
    const result = preview(`function caption() {
        return "runtime"; // @preview value "sample"
    }
    function menu() {
        var amount = live_amount(); // @preview value 7
        amount = live_amount(); // @preview value amount + 1
        /// @preview value false
        if (live_condition()) { new Label(undefined, "wrong"); }
        else { new Label(undefined, string(amount) + caption()); }
    }`, {entry:"menu"});
    assert.deepStrictEqual(texts(result), ["8sample"]); clean(result);
    assert.strictEqual(result.previewHints, 4);
});

test("argument hints modify only the outer call and do not evaluate replaced arguments", () => {
    const result = preview(`function side_effect() { global.calls += 1; return "runtime"; }
    function wrap(value) { return value; }
    function menu() {
        global.calls = 0;
        // @preview arg 1 = "sample"
        // @preview arg 0 = undefined
        var title = new Label(undefined, wrap(side_effect()));
        new Label(undefined, string(global.calls));
    }`);
    assert.deepStrictEqual(texts(result), ["sample", "0"]); clean(result);
});

test("trailing tags follow complete multiline statements and typed editor declarations", () => {
    const result = preview(`function menu() {
        var label:Label = new Label(
            undefined,
            "runtime"
        ); // @preview arg 1 = "multiline"
        var caption:string = "runtime"; /// @preview value "typed"
        new Label(undefined, caption);
    }`);
    assert.deepStrictEqual(texts(result), ["multiline", "typed"]); clean(result);
    assert.strictEqual(result.nodes[0].line, 3);
});

test("inline initialization and set hints use the local scope in source order", () => {
    const result = preview(`function make_rows() { return ["first", "second"]; }
    function menu() {
        var rows = []; // @preview set rows = make_rows()
        // @preview init array_push(rows, "third")
        var count = array_length(rows);
        new Label(undefined, string(count));
        var last = rows[2]; // @preview set last = "changed"
        new Label(undefined, last);
    }`);
    assert.deepStrictEqual(texts(result), ["3", "changed"]); clean(result);
});

test("hide preserves a constructed element while skip omits the complete attached statement", () => {
    const result = preview(`function menu() {
        var root = new Canvas(undefined); root.size(300, 200);
        var hidden = new Label(root, "Hidden"); // @preview hide
        // @preview skip
        if (true) { new Label(root, "Skipped yes"); } else { new Label(root, "Skipped no"); }
        new Label(root, "Visible");
    }`);
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.nodes.find(node => node.name === "hidden").hidden, true);
    assert.deepStrictEqual(texts(result), ["Hidden", "Visible"]); clean(result);
});

test("callback return tags bind inside the callback rather than its unfinished declaration", () => {
    const result = preview(`function menu() {
        var root = new Canvas(undefined);
        var bind = new DataBind(function(value) { new Label(root, value); }, function() {
            return "runtime"; // @preview value "sample"
        });
        bind.update();
    }`);
    assert.deepStrictEqual(texts(result), ["sample"]);
    assert(result.diagnostics.every(note=>/DataBind.update sampled once/.test(note.message)));
});

test("compact expressions can read JSON and produce preview closures without changing the game code", () => {
    const result = preview(`function menu() {
        var rows = load_rows(); // @preview value preview_json("datafiles/rows.json")
        var caption = runtime_callback(); // @preview value function() { return preview_text("caption"); }
        for (var i = 0; i < array_length(rows); i++) { new Label(undefined, rows[i].name + caption()); }
    }`, {jsonFor:()=>[{name:"A"},{name:"B"}],localize:key=>key==="caption"?"!":undefined});
    assert.deepStrictEqual(texts(result), ["A!", "B!"]); clean(result);
});

test("unsupported or malformed compact hints preserve the original statement and source location", () => {
    for (const hint of ['value "broken', 'value 2 /* unclosed', 'value 1 +', 'value 2; global.changed = true', 'arg 4 = "bad"', 'arg -1 = 3']) {
        const result = preview(`function menu() {
            var amount = 1; // @preview ${hint}
            new Label(undefined, string(amount));
        }`, {sourcePath:"scripts/demo.gml"});
        assert.deepStrictEqual(texts(result), ["1"], hint);
        assert(result.diagnostics.some(note => note.line===3 && note.sourcePath==="scripts/demo.gml" && /@preview/.test(note.message)), hint);
    }
});

test("standalone tags cannot escape their enclosing block or attach inside unfinished expressions", () => {
    const result = preview(`function menu() {
        var first = new Label(undefined, "first");
        // @preview skip
    }
    function another() { new Label(undefined, "second"); }
    function incomplete_hint() {
        var value = make_value(
            // @preview value 3
            2);
        new Label(undefined, "kept");
    }`, {entry:"another"});
    assert.deepStrictEqual(texts(result), ["second"]);
    assert.strictEqual(result.diagnostics.filter(note=>/Place the tag/.test(note.message)).length, 2);
});

test("control-flow tags do not introduce execution after return and ordinary advanced blocks still compose", () => {
    const result = preview(`/* @goowee-preview setup global.value = 1; */
    function sample() { return 7; // @preview set global.value = 99
    }
    function menu() {
        var value = sample();
        /* @goowee-preview code value += global.value; */
        new Label(undefined, string(value));
    }`, {entry:"menu"});
    assert.deepStrictEqual(texts(result), ["8"]);
    assert(result.diagnostics.some(note=>/before the control-flow/.test(note.message)));
});

test("after-statement hints respect a return propagated through an enclosing block", () => {
    const result = preview(`function sample() {
        if (true) { return 7; } // @preview set global.value = 99
    }
    function menu() {
        global.value = 1;
        var value = sample();
        new Label(undefined, string(value + global.value));
    }`, {entry:"menu"});
    assert.deepStrictEqual(texts(result), ["8"]); clean(result);
});

console.log("GooWee compact hints: " + count + " tests passed.");
