"use strict";
const assert = require("assert");
const {layout} = require("../bin/resources/app/plugins/goowee-preview/preview-layout.js");
const unit = (kind, value = 1) => ({unit: kind, value});
const ABSV = value => unit("ABSV", value), REL = value => unit("REL", value), AUTO = value => unit("AUTO", value), AUTOV = value => unit("AUTOV", value);
let count = 0;
function test(name, fn) { fn(); count++; console.log("ok - " + name); }
function fixture() {
    const nodes = [];
    function add(type, parent, properties = {}) {
        const node = Object.assign({id: String(nodes.length), name: type, type, layoutType: type, parentId: parent ? parent.id : null,
            children: [], line: nodes.length + 1, size: [REL(1), REL(1)], orientation: 1}, properties);
        nodes.push(node); if (parent) parent.children.push(node); return node;
    }
    return {nodes, add, run(options) { return layout(nodes, Object.assign({width: 1920, height: 1080}, options)); }};
}

test("REL fills the final remainder between fixed siblings, including following siblings", () => {
    const f = fixture(), stack = f.add("StackPanel", null, {size: [1000, 600]});
    const top = f.add("Float", stack, {size: [REL(1), ABSV(58)]});
    const content = f.add("Float", stack, {size: [REL(1), REL(1)]});
    const bottom = f.add("Float", stack, {size: [REL(1), ABSV(105)]});
    f.run();
    assert.deepStrictEqual([top.y, top.height, content.y, content.height, bottom.y, bottom.height], [0, 58, 58, 437, 495, 105]);
    assert.strictEqual(bottom.y + bottom.height, stack.y + stack.height);
});

test("gui_Family header, tabs, centered AUTO card row and REL surface stay within the menu", () => {
    const f = fixture(), canvas = f.add("Canvas", null, {size: [ABSV(1040), ABSV(900)], padding: [8, 8, 8, 8]});
    const stack = f.add("StackPanel", canvas);
    const top = f.add("StackPanel", stack, {size: [REL(1), ABSV(58)]});
    const tabs = f.add("StackPanel", stack, {size: [REL(1), ABSV(48)]});
    const lords = f.add("StackPanel", stack, {size: [AUTO(1), ABSV(105)], orientation: 0, alignment: [1, 0]});
    const main = f.add("StackPanel", lords, {size: [AUTO(1), AUTO(1)], padding: [0, 0, 12, 0], alignment: [0, 1]});
    const lord = f.add("StackPanel", main, {size: [AUTO(1), AUTO(1)], alignment: [1, 0]});
    const button = f.add("Button", lord, {size: [ABSV(70), ABSV(70)], alignment: [1, 0]});
    f.add("Image", button, {size: [ABSV(105), ABSV(105)], alignment: [1, 1]});
    const labelStack = f.add("StackPanel", lord, {size: [AUTO(1), AUTO(1)], margin: [0, 5, 0, 0], alignment: [1, 0]});
    f.add("Label", labelStack, {size: [AUTOV(1), AUTOV(1)], text: "Lord", style: {baseFontSize: 16, fontSize: 16}});
    const tree = f.add("StackPanel", stack), surface = f.add("CanvasSurface", tree);
    f.run();
    assert.deepStrictEqual([stack.width, stack.height], [1024, 884]);
    assert.deepStrictEqual([top.y, tabs.y, lords.y, tree.y], [8, 66, 114, 219]);
    assert.deepStrictEqual([lords.width, lords.height, lords.x], [82, 105, 479]);
    assert.deepStrictEqual([main.width, main.height, main.y], [82, 95, 119]);
    assert.deepStrictEqual([surface.width, surface.height, surface.y + surface.height], [1024, 673, 892]);
});

test("AUTO initially measures its own children, never the whole viewport", () => {
    const f = fixture(), panel = f.add("StackPanel", null, {size: [AUTO(1), AUTO(1)]});
    f.add("Button", panel, {size: [70, 20]});
    const relative = f.add("Image", panel, {size: [REL(0.5), 10]});
    f.run({width: 1600, height: 900});
    assert.strictEqual(panel.width, 70);
    assert.strictEqual(relative.width, 35);
    assert.strictEqual(panel.height, 30);
});

test("AUTO padding uses the finalized own size, and REL margins use the per-child base", () => {
    const f = fixture(), panel = f.add("Float", null, {size: [AUTO(1), 80], padding: [AUTO(0.1), 0, AUTO(0.1), 0]});
    f.add("Button", panel, {size: [100, 30]});
    const root = f.add("Float", null, {size: [200, 80]});
    const child = f.add("Button", root, {size: [REL(1), 20], margin: [REL(0.1), 0, REL(0.2), 0]});
    f.run();
    assert.deepStrictEqual([panel.width, panel.paddingActual[0], panel.paddingActual[2]], [120, 10, 10]);
    assert.deepStrictEqual([child.x, child.width], [20, 140]);
});

test("WrapPanel cross AUTO sums complete lines and keeps line alignment independent", () => {
    const f = fixture(), wrap = f.add("WrapPanel", null, {size: [100, AUTO(1)], orientation: 0});
    const a = f.add("Button", wrap, {size: [60, 20]}), b = f.add("Button", wrap, {size: [60, 30]}), c = f.add("Button", wrap, {size: [20, 10]});
    f.run();
    assert.strictEqual(wrap.height, 50);
    assert.deepStrictEqual([a.x, a.y, b.x, b.y, c.x, c.y], [0, 0, 0, 20, 60, 30]);
});

test("ABSV and AUTOV scale once while ABS and AUTO remain native", () => {
    const f = fixture(), panel = f.add("Float", null, {size: [ABSV(200), 120]});
    const image = f.add("Image", panel, {size: [AUTOV(0.5), AUTO(0.5)], sprite: {name: "s_icon"}, margin: [ABSV(8), 3, 0, 0]});
    f.run({width: 800, height: 600, scale: 2, assets: {s_icon: {width: 80, height: 60}}});
    assert.deepStrictEqual([panel.width, panel.height, image.width, image.height, image.x, image.y], [400, 120, 80, 30, 16, 3]);
});

test("Aspect ratio uses intrinsic image proportions after clamping the driving axis", () => {
    const f = fixture(), image = f.add("Image", null, {size: [100, 0], size_max: [50, 1000], aspectratio: [1, 0], sprite: {name: "s_banner"}});
    f.run({assets: {s_banner: {width: 200, height: 100}}});
    assert.deepStrictEqual([image.width, image.height], [50, 25]);
});

test("Canvas render scale affects descendants through GooWee root-canvas inheritance", () => {
    const f = fixture(), canvas = f.add("Canvas", null, {size: [ABSV(200), ABSV(100)], canvasScale: 0.5});
    const child = f.add("Button", canvas, {size: [ABSV(80), ABSV(30)]});
    const nested = f.add("Canvas", canvas, {size: [ABSV(100), ABSV(50)], canvasScale: 3});
    const nestedChild = f.add("Button", nested, {size: [ABSV(20), ABSV(10)]});
    const separate = f.add("Canvas", canvas, {size: [ABSV(100), ABSV(50)], canvasScale: 3, separateRender: true, ignoreGuiScale: true});
    const separateChild = f.add("Button", separate, {size: [ABSV(20), ABSV(10)]});
    const label = f.add("Label", separate, {size: [AUTOV(1), AUTOV(1)], text: "A", style: {fontSize: 32, baseFontSize: 16}});
    f.run({scale: 2});
    assert.deepStrictEqual([canvas.width, child.width, nested.width, nestedChild.width, separate.width, separateChild.width], [400, 80, 100, 20, 200, 60]);
    assert.deepStrictEqual([label.style.fontSize, label.height], [48, 60]);
});

test("Disabled drawing still affects layout unless the container explicitly excludes it", () => {
    const f = fixture(), stack = f.add("StackPanel", null, {size: [AUTO(1), AUTO(1)]});
    f.add("Button", stack, {size: [50, 30], hidden: true}); f.add("Button", stack, {size: [20, 10]});
    f.run(); assert.deepStrictEqual([stack.width, stack.height], [50, 40]);
    stack.ignoreHiddenChildren = true; f.run(); assert.deepStrictEqual([stack.width, stack.height], [20, 10]);
});

test("Custom base-layout hook sees final parent bounds during placement", () => {
    const f = fixture(), root = f.add("Float", null, {size: [500, 200]});
    const child = f.add("Image", root, {size: [REL(1), REL(1)]});
    f.run({getBaseLayout(parent, node, normal, phase) { return {x: normal.x + 10, y: normal.y + 20, width: parent.width - 20, height: 40}; }});
    assert.deepStrictEqual([child.x, child.y, child.width, child.height], [10, 20, 480, 40]);
});

console.log(count + " GooWee layout fidelity tests passed.");
