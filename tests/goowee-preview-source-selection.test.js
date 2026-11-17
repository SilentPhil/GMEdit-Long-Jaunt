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

// Exercise the production menu handler with the shared GMEdit menu API.
{
    const fs = require("fs"), vm = require("vm");
    const source = fs.readFileSync(require.resolve("../bin/resources/app/plugins/goowee-preview/goowee-preview.js"), "utf8");
    const begin = source.indexOf("    function hasForces("), end = source.indexOf("    function scheduleSourceSelection(", begin);
    const state = {forces:{drawing:new Set()},hidden:new Set(["stable-key"]),history:[]}, calls = [];
    const context = {visibilityState:state, active:true, nodeKeys:new Map([["node","stable-key"]]),
        selectNode(node) {calls.push(node.id);}, visibilityChanged() {calls.push("changed");}, refresh() {calls.push("refresh");},
        Electron_Menu:class {constructor(){this.items=[];} append(item){this.items.push(item);}},
        Electron_MenuItem:class {constructor(options){Object.assign(this,options);}},
        $gmedit:{"electron.MenuFallback":{popupMenu(menu,position){context.menu=menu;context.position=position;}}}};
    vm.createContext(context); vm.runInContext(source.slice(begin,end),context);
    const event = {clientX:25,clientY:35,preventDefault(){},stopPropagation(){}};
    context.elementContextMenu(event,{id:"node"});
    assert.strictEqual(context.menu.items[0].type,"checkbox");
    assert.strictEqual(context.menu.items[0].checked,false);
    assert.strictEqual(context.position.x,25);
    context.menu.items[0].click();
    assert(state.forces.drawing.has("stable-key") && !state.hidden.has("stable-key"));
    context.elementContextMenu(event,{id:"node"});
    assert.strictEqual(context.menu.items[0].checked,true);
    context.menu.items[0].click();
    assert(!state.forces.drawing.has("stable-key"));
    assert.deepStrictEqual(calls,["node","changed","node","changed"]);
    assert.strictEqual(context.hasForces(),false);
    state.forces.drawing.add("first"); state.forces.drawing.add("second");
    state.forces.exampleFutureForce = new Map([["first",42]]);
    state.hidden.add("still-hidden");
    assert.strictEqual(context.hasForces(),true);
    context.resetForces();
    assert.strictEqual(state.forces.drawing.size,0);
    assert.strictEqual(state.forces.exampleFutureForce.size,0,"The same reset must clear future force kinds");
    assert(state.hidden.has("still-hidden"),"Manual hide is not a forced override");
    assert.strictEqual(context.hasForces(),false);
    context.resetForces();
    assert.strictEqual(calls.filter(c=>c==="refresh").length,1,"One rebuild per reset; no rebuild without overrides");
    console.log("GooWee context menu: shared menu checkbox and visibility toggle passed.");
    console.log("GooWee force reset: current and future force kinds cleared with one rebuild.");
    context.scene=scene; context.selectedId=null; context.GooWeePreviewSourceSelection=selection;
    context.nodeKeys.set(icon.id,"stable-key");
    context.getResources=()=>({relativeSourcePath:p=>p});
    const editorBuffer={gmlFile:{path:"scripts/sample/sample.gml"},getLine:row=>sourceForEditor.split("\n")[row],getValue:()=>sourceForEditor};
    const sourceForEditor = `#import "games.keevee.gw"
function first() {
    var icon = new Image(undefined);
    // icon
}`;
    let clicked={row:2,column:10};
    const editor={session:editorBuffer,renderer:{screenToTextCoordinates:()=>clicked},getCursorPosition:()=>({row:0,column:0})};
    const popup={editor,event,items:[{id:"sub-search"}]};
    context.editorContextMenu(popup);
    assert.strictEqual(popup.items[1].label,"GUI Element on preview");
    assert.strictEqual(popup.items[1].submenu.items[0].label,context.elementMenu(icon).items[0].label);
    popup.items[1].submenu.items[0].click();
    assert(state.forces.drawing.has("stable-key"),"Code submenu must update the same force state");
    clicked={row:3,column:8};
    const ignored={editor,event,items:[]}; context.editorContextMenu(ignored);
    assert.strictEqual(ignored.items.length,0,"Comments must not receive an element submenu");
    assert.strictEqual(selection.wordRange(" icon.size()",0,5),null,"Punctuation is not the neighboring identifier");
    console.log("GooWee editor menu: pointer lookup, shared actions and comment rejection passed.");
    context.prefs={followSelection:false}; context.visible=false;
    context.title="GooWee Preview"; context.dock={set(){calls.push("reveal");}};
    context.setVisible=()=>{context.visible=true;calls.push("reveal");};
    context.sourceSelectionTimer=1; context.clearTimeout=()=>{};
    context.referenceShow={checked:true}; context.currentReference=()=>context.referenceShow.checked;
    context.updateReference=()=>calls.push("reference-hidden");
    context.requestDraw=()=>calls.push("draw");
    const menu=context.elementMenu(icon);
    const rebuilt={...icon,id:"rebuilt-node"}; context.scene={nodes:[rebuilt]}; context.nodeKeys.set(rebuilt.id,"stable-key");
    menu.items.find(i=>i.label==="Select and center").click();
    assert.strictEqual(context.centerNodeId,rebuilt.id,"Center the current scene instance by stable key");
    assert.strictEqual(context.referenceShow.checked,false);
    assert(context.visible && !context.prefs.followSelection,"Explicit centering works without enabling automatic selection");
    assert(calls.includes("reveal") && calls.includes("draw"));
    menu.items.find(i=>i.label==="Hide").click();
    assert(state.hidden.has("stable-key") && !state.forces.drawing.has("stable-key"));
    assert.deepStrictEqual(state.history,["stable-key"]);
    context.elementMenu(rebuilt).items.find(i=>i.label==="Unhide").click();
    assert(!state.hidden.has("stable-key") && state.history.length===0);
    context.elementMenu(rebuilt).items.find(i=>i.label==="Hide").click();
    vm.runInContext(source.slice(source.indexOf("    function undoHide("),source.indexOf("    function hasForces(")),context);
    context.undoHide(); assert(!state.hidden.has("stable-key"),"Menu hiding participates in Ctrl+H undo");
    const before=calls.length; context.visibilityState={};
    menu.items.find(i=>i.label==="Hide").click();
    menu.items.find(i=>i.label==="Select and center").click();
    assert.strictEqual(calls.length,before,"Stale menus must not affect another entry");
    console.log("GooWee element actions: explicit centering, reference switching, hide/unhide and undo passed.");
}
