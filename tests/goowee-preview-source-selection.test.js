"use strict";
const assert = require("assert");
const selection = require("../bin/resources/app/plugins/goowee-preview/preview-source-selection");
const engine = require("../bin/resources/app/plugins/goowee-preview/preview-engine");
const source = `#import "games.keevee.gw"
function first() {
    var icon = new Image(undefined);
    icon.size(ABS(20), ABS(30));
    // icon is documentation
    var text = "icon";
}
function second() {
    var icon = new Image(undefined);
    icon.size(ABS(40), ABS(50));
}`;
const scene = engine.analyze(source, {entry:"first", sourcePath:"scripts/sample/sample.gml"});
const resolve = p => p == null ? "scripts/sample/sample.gml" : p;
function find(row, column, length = 4, nodes = scene.nodes, current, hidden) {
    return selection.find(nodes, source, {start:{row,column},end:{row,column:column+length}}, resolve, current, hidden);
}
const icon = scene.nodes.find(n => n.name === "icon");
assert(icon);
assert.strictEqual(find(2,8),icon, "declaration selects the constructed element");
assert.strictEqual(find(3,4),icon, "later use selects the same element");
assert.strictEqual(find(4,7),null, "comments do not select elements");
assert.strictEqual(find(5,16),null, "string contents do not select elements");
assert.strictEqual(find(2,8,3),null, "partial identifier is ignored");
assert.strictEqual(find(2,8,0),null, "a caret without selection is ignored");
assert.strictEqual(find(8,8),null, "an unexecuted function's identically named local does not select another function's element");
assert.strictEqual(find(2,8,4,[{...icon,sourcePath:"scripts/another/another.gml"}]),null);
assert.strictEqual(find(2,8,4,scene.nodes,null,new Set([icon.id])),icon, "manually hidden elements remain selectable from code");
const hiddenIcon = {...icon,hidden:true};
assert.strictEqual(find(2,8,4,[hiddenIcon]),hiddenIcon, "source-hidden elements remain selectable from code");
const duplicate = {...icon,id:"another-instance"};
assert.strictEqual(find(2,8,4,[icon,duplicate],duplicate.id),duplicate, "repeated instances preserve the selected instance");
assert.deepStrictEqual(selection.centerOffset({x:100,y:200,width:20,height:30}, {x:-400,y:-600,scale:4}, 800,600),{x:360,y:40});
console.log("GooWee source selection: 12 checks passed.");
