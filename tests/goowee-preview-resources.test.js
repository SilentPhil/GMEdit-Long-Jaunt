"use strict";
const assert = require("assert");
const { create } = require("../bin/resources/app/plugins/goowee-preview/project-resources");

let reads = 0;
const yy = { resourceType: "GMSprite", width: 59, height: 59,
	sequence: { xorigin: 7, yorigin: -3 },
	frames: [{ name: "first-frame" }, { name: "second-frame" }],
	nineSlice: { enabled: true, left: 29, right: 29, top: 29, bottom: 29, tileMode: [1, 1, 1, 1, 4] } };
const project = {
	yyResourceGUIDs: { ns_menu_frame: "ns_menu_frame", bad: "bad", f_font: "f_font" },
	yyResources: {
		ns_menu_frame: { id: { path: "sprites/ns_menu_frame/ns_menu_frame.yy" } },
		bad: { id: { path: "sprites/bad/bad.yy" } },
		f_font: { id: { path: "fonts/f_font/f_font.yy" } }
	},
	yyResourceTypes: { ns_menu_frame: "GMSprite", bad: "GMSprite", f_font: "GMFont" },
	readYyFileSync(path) { reads++; if (path.includes("/bad/")) throw Error("Missing asset"); return yy; },
	getImageURL(path) { return "file:///project/" + path; }
};
const resources = create(project);
const frame = resources.sprite("ns_menu_frame", 1);
assert.strictEqual(frame.url, "file:///project/sprites/ns_menu_frame/second-frame.png");
assert.strictEqual(frame.width, 59);
assert.strictEqual(frame.height, 59);
assert.strictEqual(frame.originX, 7);
assert.strictEqual(frame.originY, -3);
assert.deepStrictEqual(frame.nineSlice.tileMode, [1, 1, 1, 1, 4]);
assert.strictEqual(resources.sprite("ns_menu_frame", 3.4), frame, "indices wrap after flooring");
assert.strictEqual(resources.sprite("ns_menu_frame", -1), frame);
assert.strictEqual(resources.sprite("ns_menu_frame", NaN).index, 0);
assert.strictEqual(reads, 1, "metadata is cached across frame requests");
assert.deepStrictEqual(Object.keys(resources.collect("new gw_Image(canvas, ns_menu_frame); sprite_get_width(ns_menu_frame); f_font; unknown;")), ["ns_menu_frame"]);
assert.strictEqual(resources.sprite("bad"), null, "corrupt asset does not abort preview");
assert.strictEqual(resources.sprite("../secrets"), null, "only resource identifiers are accepted");
assert.strictEqual(resources.sprite("toString"), null);
assert.strictEqual(resources.sprite("f_font"), null);
yy.width = 80;
resources.clear();
assert.strictEqual(resources.sprite("ns_menu_frame").width, 80, "refresh sees changed metadata");
resources.dispose();
assert.strictEqual(resources.sprite("ns_menu_frame"), null);
assert.deepStrictEqual(Object.keys(resources.collect("ns_menu_frame")), []);

const legacy = create({
	yyResourceGUIDs: { spr_legacy: "sprite-guid" },
	yyResources: { "sprite-guid": { Value: { resourcePath: "sprites/spr_legacy/spr_legacy.yy" } } },
	readYyFileSync() { return { width: 32, height: 16, xorig: 16, yorig: 8, frames: [{ id: "legacy-frame" }] }; },
	getImageURL(path) { return "data:" + path; }
});
assert.strictEqual(legacy.sprite("spr_legacy").url, "data:sprites/spr_legacy/legacy-frame.png");
assert.strictEqual(legacy.sprite("spr_legacy").nineSlice, null);
assert.strictEqual(legacy.sprite("spr_legacy").originX, 16);
assert.strictEqual(legacy.sprite("spr_legacy").originY, 8);
const thumbnail = create({ getSpriteURL(name) { return name === "s_old" ? "data:image/png;base64,AA" : null; } });
assert.strictEqual(thumbnail.sprite("s_old").width, null);
assert.strictEqual(thumbnail.sprite("unknown"), null);

let sourceReads = [];
const sourceTexts = {
	"scripts/gui_Common/gui_Common.gml": 'function gui_menu_title_add(parent) { return new gw_Label(parent, "Title"); }',
	"scripts/gui_RoughDesign/gui_RoughDesign.gml": "function GuiRoughTabButton(width) constructor {}",
	"scripts/gw_Canvas/gw_Canvas.gml": "function gw_Canvas(parent) constructor {}",
	"scripts/direct/direct.gml": "function direct() {}"
};
const sourceProject = {
	dir: "C:/project",
	yyResources: { direct: { id: { path: "scripts/direct/direct.yy" } }, f_font: {id: {path: "fonts/f_font/f_font.yy"}} },
	yyResourceTypes: {direct: "GMScript", f_font: "GMFont"},
	relPath(path) { return path.startsWith("C:/project/") ? path.slice("C:/project/".length) : null; },
	readTextFileSync(path) { sourceReads.push(path); if (!(path in sourceTexts)) throw new Error("Missing script"); return sourceTexts[path]; }
};
const sourceAPI = {gmlLookup: {
	gui_menu_title_add: {path: "C:\\project\\scripts\\gui_Common\\gui_Common.gml", row: 680},
	gui_other_common: {path: "C:/project/scripts/gui_Common/gui_Common.gml", row: 700},
	GuiRoughTabButton: {path: "scripts/gui_RoughDesign/gui_RoughDesign.gml", row: 2},
	gw_Canvas: {path: "scripts/gw_Canvas/gw_Canvas.gml", row: 0},
	external: {path: "C:/elsewhere/private.gml", row: 0},
	traversal: {path: "../private.gml", row: 0},
	notCode: {path: "sprites/asset/asset.yy", row: 0}
}, gmlEnums: {
	MenuCategory: {origin: "C:/project/scripts/direct/direct.gml", names: ["GENERAL", "CULTURE"]},
	ExternalEnum: {origin: "C:/elsewhere/private.gml"},
	TraversalEnum: {origin: "../private.gml"}
}};
const sourceResources = create(sourceProject, sourceAPI);
assert.strictEqual(sourceResources.relativeSourcePath("C:\\project\\scripts\\direct\\direct.gml"),"scripts/direct/direct.gml");
assert.strictEqual(sourceResources.relativeSourcePath("C:/elsewhere/private.gml"),null);
assert.deepStrictEqual(sourceResources.sourceFor("gui_menu_title_add"), {
	name: "gui_menu_title_add", path: "scripts/gui_Common/gui_Common.gml", source: sourceTexts["scripts/gui_Common/gui_Common.gml"], row: 680
});
assert(sourceResources.sourceFor("gui_other_common"), "functions in a shared script reuse the cached source");
assert.deepStrictEqual(sourceReads, ["scripts/gui_Common/gui_Common.gml"]);
assert.strictEqual(sourceResources.sourceFor("GuiRoughTabButton").path, "scripts/gui_RoughDesign/gui_RoughDesign.gml");
assert.strictEqual(sourceResources.sourceFor("Canvas").name, "gw_Canvas", "GooWee import aliases resolve to canonical function names");
assert.strictEqual(sourceResources.sourceFor("direct").path, "scripts/direct/direct.gml", "script resources work before their functions are indexed");
assert.strictEqual(sourceResources.sourceFor("MenuCategory").path, "scripts/direct/direct.gml", "enum declarations resolve through their own GMEdit index without a function lookup");
assert.strictEqual(sourceResources.sourceFor("ExternalEnum"), null);
assert.strictEqual(sourceResources.sourceFor("TraversalEnum"), null);
assert.strictEqual(sourceResources.sourceFor("f_font"), null);
assert.strictEqual(sourceResources.sourceFor("external"), null);
assert.strictEqual(sourceResources.sourceFor("traversal"), null);
assert.strictEqual(sourceResources.sourceFor("notCode"), null);
assert.strictEqual(sourceResources.sourceFor("../gui_Common"), null);
assert.strictEqual(sourceResources.sourceFor("toString"), null);
assert.strictEqual(sourceResources.sourceFor("late_index"), null);
sourceAPI.gmlLookup.late_index = sourceAPI.gmlLookup.gui_menu_title_add;
assert(sourceResources.sourceFor("late_index"), "late project indexing is visible without rescanning files");
sourceTexts["scripts/gui_Common/gui_Common.gml"] += "\n// saved edit";
sourceResources.clear();
assert(sourceResources.sourceFor("gui_menu_title_add").source.includes("saved edit"));
sourceResources.dispose();
assert.strictEqual(sourceResources.sourceFor("gui_menu_title_add"), null);

// A locked root can use an unsaved nested script without saving or rebuilding
// the resource adapter. Disk caching must never mask the current editor buffer.
const livePath = "scripts/shared_view/shared_view.gml", liveBuffers = new Map();
let liveReads = 0, liveCallbacks = 0;
const savedNested = 'function create_nested_view(parent) { return new gw_Label(parent, "Saved"); }';
const liveResources = create({
	yyResources: {}, yyResourceTypes: {},
	readTextFileSync(path) { liveReads++; if (path === livePath) return savedNested; throw Error("Missing script"); },
	existsSync() { return false; }
}, {gmlLookup: {create_nested_view: {path: livePath, row: 4}}}, path => {
	liveCallbacks++; return liveBuffers.get(path);
});
assert.strictEqual(liveResources.sourceFor("create_nested_view").source, savedNested);
assert.strictEqual(liveReads, 1);
liveBuffers.set(livePath, 'function create_nested_view(parent) { return new gw_Label(parent, "Unsaved"); }');
assert.deepStrictEqual(liveResources.sourceFor("create_nested_view"), {
	name: "create_nested_view", path: livePath, source: liveBuffers.get(livePath), row: 4
});
const engine = require("../bin/resources/app/plugins/goowee-preview/preview-engine.js");
const liveRoot = '#import "games.keevee.gw"\nfunction root_view() { var root = new Canvas(undefined); create_nested_view(root); }';
function liveCaption() {
	const scene = engine.analyze(liveRoot, {sourceFor: liveResources.sourceFor});
	return scene.nodes.find(node => node.type === "Label");
}
assert.strictEqual(liveCaption().text, "Unsaved", "Nested UI must render the editor implementation over cached saved text");
liveBuffers.set(livePath, liveBuffers.get(livePath).replace("Unsaved", "Edited again"));
assert.strictEqual(liveCaption().text, "Edited again", "Further edits must be visible without cache invalidation");
assert.strictEqual(liveReads, 1, "Editor overlays must not perform extra disk reads");
liveBuffers.set(livePath, "");
assert.strictEqual(liveResources.sourceFor("create_nested_view").source, "", "An emptied editor buffer must not fall back to saved code");
assert.strictEqual(liveCaption(), undefined);
liveBuffers.set(livePath, " ".repeat(2 * 1024 * 1024 + 1));
assert.strictEqual(liveResources.sourceFor("create_nested_view"), null, "Oversized live source must not fall back to stale disk contents");
assert.strictEqual(liveReads, 1);
liveBuffers.set(livePath, null);
assert.strictEqual(liveResources.sourceFor("create_nested_view").source, savedNested, "Explicit null restores disk fallback when the nested tab closes");
liveBuffers.delete(livePath);
assert.strictEqual(liveResources.sourceFor("create_nested_view").source, savedNested, "Undefined also uses disk fallback");
assert.strictEqual(liveReads, 1, "Disk fallback retains normal resource caching");
liveBuffers.set(".goowee-preview.gml", "/* @goowee-preview setup\npreview_note(\"Unsaved setup\");\n*/");
assert.strictEqual(liveResources.previewSetup().source, liveBuffers.get(".goowee-preview.gml"), "An unsaved shared setup is read before checking disk existence");
liveBuffers.set(".goowee-preview.gml", "");
assert.strictEqual(liveResources.previewSetup().source, "");
liveBuffers.set(".goowee-preview.gml", " ".repeat(256 * 1024 + 1));
assert.throws(() => liveResources.previewSetup(), /256 KiB/);
liveBuffers.delete(".goowee-preview.gml");
assert.strictEqual(liveResources.previewSetup(), null);
liveResources.dispose();
const callbacksAfterDispose = liveCallbacks;
assert.strictEqual(liveResources.sourceFor("create_nested_view"), null);
assert.strictEqual(liveResources.previewSetup(), null);
assert.strictEqual(liveCallbacks, callbacksAfterDispose, "Disposed adapters release and stop invoking the editor callback");


const fontYY = {resourceType:"GMFont",fontName:"Arbitrary Typeface",styleName:"Regular",size:32,bold:false,italic:false,
    usesSDF:true,sdfSpread:12,lineHeight:53,ascender:37,ascenderOffset:3,applyKerning:1,
    glyphs:{"65":{character:65,x:14,y:2,w:30,h:73,shift:24,offset:-1}},kerningPairs:[{first:65,second:65,amount:-2}]};
let fontReads=0;
const fonts=create({yyResources:{f_any:{id:{path:"fonts/f_any/f_any.yy"}}},yyResourceTypes:{f_any:"GMFont"},
    readYyFileSync(){fontReads++;return fontYY;},getImageURL(file){return "file:///game/"+file;}});
const atlas=fonts.font("f_any");
assert.strictEqual(atlas.fontName,"Arbitrary Typeface");
assert.deepStrictEqual([atlas.size,atlas.lineHeight,atlas.sdfSpread,atlas.ascenderOffset,atlas.applyKerning],[32,53,12,3,true]);
assert.strictEqual(atlas.glyphs[65].offset,-1);
assert.deepStrictEqual(atlas.kerningPairs,[{first:65,second:65,amount:-2}]);
assert.strictEqual(fonts.font("f_any"),atlas);assert.strictEqual(fontReads,1);
assert.strictEqual(fonts.font("../secret"),null);
assert.strictEqual(fonts.sprite("f_any"),null);
const dynamic=fonts.fontFileFor("fonts/Example-Bold.ttf",24,true,false);
assert.strictEqual(dynamic.url,"file:///game/datafiles/fonts/Example-Bold.ttf");
assert.deepStrictEqual([dynamic.size,dynamic.bold,dynamic.italic],[24,true,false]);
assert.strictEqual(fonts.font(dynamic.name),dynamic);
assert.strictEqual(fonts.fontFileFor("datafiles/fonts/Example-Bold.ttf",24,true,false),dynamic);
assert.throws(()=>fonts.fontFileFor("../../private.ttf",20),/inside/);
assert.strictEqual(fonts.fontFileFor("fonts/not-font.json",20),null);
fonts.clear();assert.strictEqual(fonts.font(dynamic.name),null,"Refresh releases dynamic font descriptors");
fonts.dispose();assert.strictEqual(fonts.font("f_any"),null);

let jsonReads=0;
const files={"fixtures/items.json":'{"items":[{"caption":"A","cost":10}]}',"fixtures/b.json":'{"id":"b"}',"fixtures/bad.json":"not json"};
const fixtureResources=create({
    readTextFileSync(file){jsonReads++;if(!(file in files))throw Error("Missing fixture");return files[file];},
    readdirSync(){return [{fileName:"items.json",isDirectory:false},{fileName:"b.json",isDirectory:false},{fileName:"folder.json",isDirectory:true},{fileName:"notes.txt",isDirectory:false}];}
});
const firstData=fixtureResources.jsonFor("fixtures/items.json");firstData.items[0].cost=999;
assert.strictEqual(fixtureResources.jsonFor("fixtures/items.json").items[0].cost,10,"Every analysis gets fresh data");
assert.strictEqual(jsonReads,1,"Reads are cached until Refresh");
assert.deepStrictEqual(fixtureResources.jsonFiles("fixtures"),["fixtures/b.json","fixtures/items.json"]);
for(const file of ["../secret.json","C:/private.json","/private.json","fixtures/../../private.json","https://example.test/data.json"]){
    assert.throws(()=>fixtureResources.jsonFor(file),/inside/);
}
assert.throws(()=>fixtureResources.jsonFor("fixtures/script.gml"),/JSON/);
assert.throws(()=>fixtureResources.jsonFor("fixtures/bad.json"));
files["fixtures/items.json"]='{"items":[]}';fixtureResources.clear();
assert.deepStrictEqual(fixtureResources.jsonFor("fixtures/items.json"),{items:[]});
files["fixtures/huge.json"]=" ".repeat(512*1024+1);assert.throws(()=>fixtureResources.jsonFor("fixtures/huge.json"),/limit/);
fixtureResources.dispose();assert.throws(()=>fixtureResources.jsonFor("fixtures/items.json"),/unavailable/);
const hugeDirectory=create({readdirSync(){return Array.from({length:1025},(_,i)=>i+".json");}});
assert.throws(()=>hugeDirectory.jsonFiles("fixtures"),/limit/);
const setupProject={existsSync(){return true;},readTextFileSync(){return "/* @goowee-preview setup preview_note(\"Demo\"); */";}};
const setupResources=create(setupProject);
assert.deepStrictEqual(setupResources.previewSetup(),{path:".goowee-preview.gml",source:setupProject.readTextFileSync()});
setupProject.readTextFileSync=()=>" ".repeat(256*1024+1);
assert.throws(()=>setupResources.previewSetup(),/limit/);
setupProject.existsSync=()=>false;
assert.strictEqual(setupResources.previewSetup(),null,"An unconfigured project needs no bootstrap");
setupResources.dispose();assert.strictEqual(setupResources.previewSetup(),null);
const includeBuffers = new Map(), includeFiles = {"fixtures/view.gml": "/* @goowee-preview setup global.example = 42; */"};
const includeResources=create({readTextFileSync(file){if(!(file in includeFiles))throw Error("Missing fixture");return includeFiles[file];}},null,path=>includeBuffers.get(path));
assert.deepStrictEqual(includeResources.previewSourceFor("fixtures/view.gml"),{path:"fixtures/view.gml",source:includeFiles["fixtures/view.gml"]});
includeBuffers.set("fixtures/view.gml", "");
assert.strictEqual(includeResources.previewSourceFor("fixtures/view.gml").source, "", "Unsaved include text is authoritative");
includeBuffers.set("fixtures/view.gml", " ".repeat(256*1024+1));
assert.throws(()=>includeResources.previewSourceFor("fixtures/view.gml"),/limit/);
for(const path of ["../secret.gml","C:/private.gml","https://example.test/file.gml"])assert.throws(()=>includeResources.previewSourceFor(path),/inside/);
assert.throws(()=>includeResources.previewSourceFor("fixtures/data.json"),/GML/);
includeResources.dispose();assert.throws(()=>includeResources.previewSourceFor("fixtures/view.gml"),/project/);
// GMEdit indexes symbols in object events by the object's YY path, not the GML path.
const objectFile="objects/o_catalog/o_catalog.yy", eventFile="objects/o_catalog/Other_10.gml";
const eventSources={
	"objects/o_catalog/Create_0.gml": '// enum SampleKind { WRONG }\nvar text="enum SampleKind { ALSO_WRONG }";\n/* function sample_caption() {} */',
	[eventFile]: 'throw "Object initialization must not run";\nenum SampleKind { FIRST=2, SECOND=5, SIZEOF=6 }\nfunction sample_caption(){ return "catalogue"; }'
};
const objectBuffers=new Map();let objectReads=0;
const objectAPI={gmlLookup:{sample_caption:{path:"C:/project/"+objectFile,row:2}},gmlEnums:{SampleKind:{origin:"C:/project/"+objectFile}}};
const objectResources=create({dir:"C:/project",
	readYyFileSync(file){assert.strictEqual(file,objectFile);objectReads++;return {resourceType:"GMObject",eventList:[{eventType:0,eventNum:0},{eventType:7,eventNum:10},{eventType:4,collisionObjectId:{name:"../invalid"}}]};},
	readTextFileSync(file){assert(file in eventSources,file);return eventSources[file];}
},objectAPI,path=>objectBuffers.get(path));
assert.strictEqual(objectResources.relativeSourcePath("C:\\project\\objects\\o_catalog\\o_catalog.yy"),objectFile);
assert.deepStrictEqual(objectResources.sourceFor("SampleKind"),{name:"SampleKind",path:eventFile,source:eventSources[eventFile],row:1});
assert.strictEqual(objectResources.sourceFor("sample_caption").path,eventFile);
assert.strictEqual(objectReads,1,"Event metadata is shared across symbols");
const objectRoot='#import "games.keevee.gw"\nfunction page(){ var kinds=array_create(SampleKind.SIZEOF,0); new Label(undefined,string(array_length(kinds))+"/"+string(SampleKind.SECOND)+"/"+sample_caption()); }';
let objectScene=engine.analyze(objectRoot,{sourceFor:objectResources.sourceFor});
assert.deepStrictEqual(objectScene.diagnostics,[]);
assert.strictEqual(objectScene.nodes[0].text,"6/5/catalogue","The first enum access loads its declaration without executing the object");
objectBuffers.set(eventFile,'enum SampleKind { FIRST=3, SECOND=8, SIZEOF=9 }\nfunction sample_caption(){return "event edit";}');
objectScene=engine.analyze(objectRoot,{sourceFor:objectResources.sourceFor});
assert.strictEqual(objectScene.nodes[0].text,"9/8/event edit");
objectBuffers.set(objectFile,'#event create\nenum SampleKind { FIRST=0, SECOND=1, SIZEOF=2 }\n#event other:10\nfunction sample_caption(){return "object edit";}');
objectScene=engine.analyze(objectRoot,{sourceFor:objectResources.sourceFor});
assert.deepStrictEqual(objectScene.diagnostics,[]);
assert.strictEqual(objectScene.nodes[0].text,"2/1/object edit","Combined object editor text overrides saved event files");
objectBuffers.set(objectFile,"");
assert.strictEqual(objectResources.sourceFor("SampleKind").source,"");
objectBuffers.set(objectFile," ".repeat(2*1024*1024+1));
assert.strictEqual(objectResources.sourceFor("SampleKind"),null);
objectBuffers.clear();objectResources.clear();
assert.strictEqual(objectResources.sourceFor("SampleKind").path,eventFile);
assert.strictEqual(objectReads,2);
objectAPI.gmlEnums.Outside={origin:"C:/private/objects/o_catalog/o_catalog.yy"};
objectAPI.gmlEnums.Traversal={origin:"../objects/o_catalog/o_catalog.yy"};
assert.strictEqual(objectResources.sourceFor("Outside"),null);
assert.strictEqual(objectResources.sourceFor("Traversal"),null);
objectResources.dispose();assert.strictEqual(objectResources.sourceFor("SampleKind"),null);
console.log("GooWee generic resource, font and fixture adapter tests passed.");
