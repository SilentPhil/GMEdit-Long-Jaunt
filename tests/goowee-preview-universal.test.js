"use strict";
const assert = require("assert");
const engine = require("../bin/resources/app/plugins/goowee-preview/preview-engine.js");
const resourcesAPI = require("../bin/resources/app/plugins/goowee-preview/project-resources.js");
const preamble = '#import "games.keevee.gw"\n';
let count = 0;
function test(name, run) { run(); count++; console.log("ok - " + name); }
function texts(scene) { return scene.nodes.filter(node => node.type === "Label").map(node => node.text); }
function clean(scene) { assert.deepStrictEqual(scene.diagnostics, [], JSON.stringify(scene.diagnostics)); }

// Two unrelated menus use ordinary project source and author-owned fixtures.
// No class/function here is a widget/helper name recognized by the plugin.
const inventorySource = `
/* @goowee-preview setup
preview_args([new ItemLedger(preview_json("datafiles/sample/items.json"))]);
*/
function inventory_page(controller) { return assemble_shelf(controller); }
`;
const inventoryLibrary = `
function ItemLedger(records) constructor {
    __records = records;
    static list = function() { return __records; };
}
function ItemViewData(raw) constructor {
    __caption = raw.caption;
    __cost = raw.cost;
    static caption = function() { return __caption; };
    static cost = function() { return __cost; };
}
function TileFrame(parent) : Button(parent) constructor {
    padding(8, 6, 8, 6);
}
function PurchaseTile(parent, item) : TileFrame(parent) constructor {
    size(220, 60);
    var title = new Label(self, item.caption());
    title.margin(0, 0, 0, 0);
    var price = new Label(self, string(item.cost()));
    price.margin(0, 24, 0, 0);
}
function assemble_shelf(controller) {
    var shelf = new StackPanel(undefined);
    shelf.size(240, AUTO(1));
    shelf.padding(10, 10, 10, 10);
    var records = controller.list();
    for (var index = 0; index < array_length(records); index++) {
        var tile = new PurchaseTile(shelf, new ItemViewData(records[index]));
        tile.margin(0, 0, 0, 5);
    }
    return shelf;
}`;
function inventoryOptions(library = inventoryLibrary) {
    const functions = new Set(Array.from(library.matchAll(/function (\w+)\(/g), match => match[1]));
    let reads = 0;
    const resources = resourcesAPI.create({
        readTextFileSync(file) {
            assert.strictEqual(file, "datafiles/sample/items.json"); reads++;
            return JSON.stringify([{id: "item-a", caption: "Compass", cost: 120}, {id: "item-b", caption: "Rope", cost: 35}]);
        }
    });
    return {resources, reads: () => reads, options: {
        entry: "inventory_page", sourcePath: "scripts/inventory_page.gml", jsonFor: resources.jsonFor,
        sourceFor(name) { return functions.has(name) ? {path: "scripts/ordinary_library.gml", source: library} : null; }
    }};
}

test("an inventory loads JSON through project code and builds arbitrary inherited widgets", () => {
    const fixture = inventoryOptions();
    const scene = engine.analyze(preamble + inventorySource, fixture.options);
    clean(scene);
    assert.strictEqual(scene.entry, "inventory_page");
    assert.strictEqual(scene.roots.length, 1);
    assert.deepStrictEqual(texts(scene), ["Compass", "120", "Rope", "35"]);
    const tiles = scene.nodes.filter(node => node.type === "PurchaseTile");
    assert.strictEqual(tiles.length, 2);
    assert(tiles.every(node => node.width === 220 && node.height === 60 && node.parentId === scene.roots[0].id));
    assert(tiles[1].y >= tiles[0].y + tiles[0].height);
    assert(scene.nodes.filter(node => node.name === "title").every(node => node.sourcePath === "scripts/ordinary_library.gml"));
    assert.strictEqual(fixture.reads(), 1);
    const repeated = engine.analyze(preamble + inventorySource, fixture.options);
    assert.deepStrictEqual(texts(repeated), texts(scene));
    assert.strictEqual(fixture.reads(), 1, "Resource caching must not cache the mutable interpreter scene");
    fixture.resources.dispose();
});

test("renaming every custom constructor and helper preserves the rendered inventory", () => {
    const replacements = {ItemLedger: "RepositoryZ9", ItemViewData: "DataPacket41", TileFrame: "FrameN7", PurchaseTile: "WidgetZ31", assemble_shelf: "render_collection_Q"};
    function rename(source) { return source.replace(/\b(?:ItemLedger|ItemViewData|TileFrame|PurchaseTile|assemble_shelf)\b/g, name => replacements[name]); }
    const original = inventoryOptions(), renamed = inventoryOptions(rename(inventoryLibrary));
    const first = engine.analyze(preamble + inventorySource, original.options);
    const second = engine.analyze(preamble + rename(inventorySource), renamed.options);
    clean(second);
    const geometry = scene => scene.nodes.map(node => [node.x, node.y, node.width, node.height, node.text]);
    assert.deepStrictEqual(geometry(second), geometry(first));
    original.resources.dispose(); renamed.resources.dispose();
});

test("indexed source tables initialize only by an explicit hint and once per analysis", () => {
    const source = `/* @goowee-preview setup
        global.palette = [];
        global.initializations = 0;
    */
    function palette_menu() {
        var before = new Label(undefined, string(palette_size()));
        /* @goowee-preview code
        preview_init_script("palette_catalogue");
        preview_init_script("palette_catalogue");
        */
        var after = new Label(undefined, string(palette_size()));
        var item = new Label(undefined, palette_caption(1));
        var runs = new Label(undefined, string(global.initializations));
    }`;
    const catalogue = `global.palette = [];
        array_push(global.palette, {caption: "First swatch", index: 3});
        array_push(global.palette, {caption: "Second swatch", index: 8});
        global.initializations++;
        /* @goowee-preview code
        preview_init_script("palette_catalogue");
        */
        function palette_size() { return array_length(global.palette); }
        function palette_caption(index) { return global.palette[index].caption; }`;
    const options = {sourceFor(name) {
        return ["palette_catalogue", "palette_size", "palette_caption"].includes(name) ? {path: "scripts/palette_catalogue.gml", source: catalogue} : null;
    }};
    for (let refresh = 0; refresh < 2; refresh++) {
        const scene = engine.analyze(preamble + source, options);
        clean(scene);
        assert.deepStrictEqual(texts(scene), ["0", "2", "Second swatch", "1"]);
    }
});

test("script initialization does not accept a file path or run outside preview hints", () => {
    const requested = [];
    const scene = engine.analyze(preamble + `/* @goowee-preview setup
        var rejected = preview_init_script("../outside.gml");
    */
    function menu() {
        var denied = preview_init_script("unrelated_script");
        var caption = new Label(undefined, "Menu still builds");
    }`, {sourceFor(name) { requested.push(name); return null; }});
    assert.deepStrictEqual(texts(scene), ["Menu still builds"]);
    assert(scene.diagnostics.some(note => /indexed script symbol/.test(note.message)));
    assert(scene.diagnostics.some(note => /only available inside preview annotations/.test(note.message)));
    // Entry discovery may query symbols, but rejected initialization must not
    // receive a filesystem path or execute the unindexed script.
    assert(!requested.includes("../outside.gml"));
    assert(!requested.includes("unrelated_script"));
});

test("a different profile menu uses overrides and local hints without changing plugin code", () => {
    const source = `
/* @goowee-preview setup
preview_override("load_profile", function() { return {id: 7, name: "Morgan", rank: 12}; });
preview_override("caption_for_rank", function(rank) { return "Rank " + string(rank); });
*/
function profile_panel() {
    var profile = load_profile();
    var panel = new StackPanel(undefined); panel.size(300, AUTO(1));
    var title = new Label(panel, profile.name);
    var subtitle = new Label(panel, caption_for_rank(profile.rank));
    /* @goowee-preview replace
    var can_edit = true;
    */
    var can_edit = player_has_permissions(profile);
    if (can_edit) { var status = new Label(panel, "Editable"); }
    // @goowee-preview skip-next
    if (debug_enabled()) { attach_debug(panel); } else { attach_warning(panel); }
    var private_info = new Label(panel, "Private");
    /* @goowee-preview code
    private_info.draw_disable();
    */
}`;
    const scene = engine.analyze(preamble + source, {entry: "profile_panel"});
    clean(scene);
    assert.strictEqual(scene.roots.length, 1);
    assert.deepStrictEqual(texts(scene), ["Morgan", "Rank 12", "Editable", "Private"]);
    assert(scene.nodes.find(node => node.name === "private_info").hidden);
    assert.strictEqual(scene.previewHints, 4);
});

test("explicit scene roots survive while unresolved parents cannot create detached widgets", () => {
    const scene = engine.analyze(preamble + `function independent_roots(missing_parent) {
        var primary = new Canvas(undefined); primary.size(300, 100);
        var first = new Label(primary, "First window");
        var secondary = new Canvas(GooWee.view); secondary.size(200, 80);
        var second = new Label(secondary, "Second window");
        var imported = new Canvas(gw_GooWee.view); imported.size(150, 60);
        var third = new Label(imported, "Imported root");
        var detached = new Button(missing_parent);
        var detached_child = new Label(detached, "Must not escape into a root");
    }`);
    assert.strictEqual(scene.roots.length, 3);
    assert.deepStrictEqual(texts(scene), ["First window", "Second window", "Imported root"]);
    assert.strictEqual(scene.nodes.length, 6);
    assert(scene.diagnostics.some(note => /parent/i.test(note.message)));
    assert(!scene.nodes.some(node => node.name === "detached" || node.name === "detached_child"));
});

test("selecting an arbitrary standalone custom-widget constructor gives it an explicit preview root", () => {
    const source = `function UniqueBadge(parent) : BadgeBase(parent) constructor {
        size(140, 45);
        var title = new Label(self, "Standalone badge");
    }`;
    const scene = engine.analyze(preamble + source, {
        entry: "UniqueBadge",
        sourceFor(name) { return name === "BadgeBase" ? {path: "scripts/base.gml", source: "function BadgeBase(parent) : Button(parent) constructor { padding(5, 5, 5, 5); }"} : null; }
    });
    assert.strictEqual(scene.entry, "UniqueBadge");
    assert.strictEqual(scene.roots.length, 1);
    assert.deepStrictEqual(texts(scene), ["Standalone badge"]);
    assert.deepStrictEqual([scene.roots[0].width, scene.roots[0].height], [140, 45]);
    assert.strictEqual(scene.nodes[1].parentId, scene.roots[0].id);
});

test("JSON business fields cannot impersonate internal interpreter values", () => {
    const cases = {
        id: 123, struct: true, unknown: true, fn: {k: "fn"}, receiver: {}, builtin: "preview_note",
        sprite: true, dataBind: true, _textStyle: true, unit: "ABS", spriteReceiver: {}, textStyleReceiver: {}
    };
    for (const [field, value] of Object.entries(cases)) {
        const data = {caption: "Business record", font: "Business font", alpha: "Business alpha", [field]: value};
        const scene = engine.analyze(preamble + `/* @goowee-preview setup
            preview_args([preview_json("sample.json")]);
        */
        function menu(data) {
            var caption = new Label(undefined, data.caption);
            var font = new Label(undefined, data.font);
            var alpha = new Label(undefined, data.alpha);
        }`, {jsonFor: () => JSON.parse(JSON.stringify(data))});
        assert.deepStrictEqual(texts(scene), ["Business record", "Business font", "Business alpha"], field);
        clean(scene);
    }
});

test("ordinary sprite and style fields do not steal a project struct's clone method", () => {
    for (const field of ["sprite", "_textStyle"]) {
        const scene = engine.analyze(preamble + `/* @goowee-preview setup
            preview_args([{${field}: true, clone: function() { return "Project clone"; }}]);
        */
        function menu(record) { var caption = new Label(undefined, record.clone()); }`);
        assert.deepStrictEqual(texts(scene), ["Project clone"], field);
        clean(scene);
    }
});

test("invalid callable, unit and label data remain local failures instead of aborting the menu", () => {
    const inputs = [
        ['{spriteReceiver: {caption: "fake"}}', "data()", ""],
        ['{textStyleReceiver: {fontSize: 1000}}', "data()", ""],
        ['{unit: "ABS", value: 777}', '"Unit"', "caption.size(data, 20);"],
        ['{caption: "Raw record"}', "data", ""]
    ];
    for (const [data, expression, after] of inputs) {
        const scene = engine.analyze(preamble + `/* @goowee-preview setup preview_args([${data}]); */
            function menu(data) {
                var caption = new Label(undefined, ${expression}); ${after}
                var sibling = new Label(undefined, "Still visible");
            }`);
        assert.strictEqual(texts(scene).at(-1), "Still visible", data);
        assert(scene.diagnostics.length > 0, data);
        assert(!scene.diagnostics.some(note => /Some syntax could not be analyzed/.test(note.message)), data);
        if (after) assert.notStrictEqual(scene.nodes[0].width, 777);
    }
});

test("fixture execution remains bounded and native-looking calls cannot reach the host", () => {
    global.__universalPreviewHostProbe = false;
    const scene = engine.analyze(preamble + `/* @goowee-preview setup
        var counter = 0;
        while (true) { counter++; }
        global.__universalPreviewHostProbe = true;
        require("fs").writeFileSync("preview-probe-should-not-exist", "blocked");
    */
    function menu() { var caption = new Label(undefined, "Still responsive"); }`);
    assert.strictEqual(global.__universalPreviewHostProbe, false);
    delete global.__universalPreviewHostProbe;
    assert.deepStrictEqual(texts(scene), ["Still responsive"]);
    assert(scene.diagnostics.some(note => /capped|limit/.test(note.message)));
    assert(scene.diagnostics.some(note => /Unknown|Unsupported|unresolved|omitted/i.test(note.message)));
});

test("project includes compose setup fixtures synchronously and execute each once", () => {
    const files = {
        "fixtures/outer.gml": `/* @goowee-preview setup
            preview_include("fixtures/inner.gml");
            global.caption = global.caption + " outer";
        */`,
        "fixtures/inner.gml": `/* @goowee-preview setup
            global.caption = "inner";
            preview_include("fixtures/outer.gml");
        */ new Label(undefined, "Must not execute ordinary file body");`
    };
    const scene = engine.analyze(preamble + `/* @goowee-preview setup
        preview_include("fixtures/outer.gml");
        preview_include("fixtures/inner.gml");
        preview_args([global.caption]);
    */
    function page(caption) { var label = new Label(undefined, caption); }`, {
        previewSourceFor: path => ({path,source: files[path]})
    });
    assert.deepStrictEqual(texts(scene), ["inner outer"]);
    clean(scene);
});

test("compact hints can include external setup while preserving source diagnostics", () => {
    const scene = engine.analyze(preamble + `function page() {
        /// @preview init preview_include("fixtures/view.gml")
        var label = new Label(undefined, global.caption);
    }`, {previewSourceFor: path => ({path,source: `/* @goowee-preview setup
        global.caption = "Configured";
        preview_note("Demo state");
    */`})});
    assert.deepStrictEqual(texts(scene), ["Configured"]);
    assert(scene.diagnostics.some(note=>note.sourcePath === "fixtures/view.gml" && /Demo state/.test(note.message)));
    const missing = engine.analyze(preamble + `function page() {
        /// @preview init preview_include("missing.gml")
        var label = new Label(undefined, "Still rendered");
    }`, {previewSourceFor: () => { throw Error("Missing fixture"); }});
    assert.deepStrictEqual(texts(missing), ["Still rendered"]);
    assert(missing.diagnostics.some(note=>/Missing fixture/.test(note.message)));
});

test("explicit sprite layers retain intrinsic dimensions and validate source data", () => {
    const actual=engine.analyze(preamble + `function page() {
        /// @preview arg 1 = preview_sprite_layers(128,170,[{sprite:new SpriteImage(s_face,1,#BBAA88),x:3,y:4}])
        var image = new Image(undefined, unknown_runtime_surface());
    }`, {assets:{s_face:{width:20,height:30}}});
    clean(actual);
    assert.deepStrictEqual([actual.nodes[0].width,actual.nodes[0].height],[128,170]);
    assert.deepStrictEqual([actual.nodes[0].sprite.layers[0].width,actual.nodes[0].sprite.layers[0].height],[20,30]);
    assert.strictEqual(actual.nodes[0].sprite.layers[0].sprite.index,1);
    const invalid=engine.analyze(preamble + `function page() {
        /// @preview arg 1 = preview_sprite_layers(99999,170,[])
        var image = new Image(undefined, unknown_runtime_surface());
    }`);
    assert(invalid.diagnostics.some(note=>/2048/.test(note.message)));
});

test("sample instances run inherited source methods without constructor side effects", () => {
    const source = `function Ancestor() constructor {
        host_native_side_effect();
        static caption = function() { return prefix + value; };
        static multiplier = function() { return 2; };
    }
    function SampleModel() : Ancestor() constructor {
        new Label(undefined, "Constructor must not run");
        static result = function() { return caption() + string(multiplier()); };
        static multiplier = function() { return 3; };
    }`;
    const options={sourceFor: () => ({path:"model.gml",source})};
    const scene=engine.analyze(preamble + `/* @goowee-preview setup
        var first=preview_instance(SampleModel,{prefix:"A",value:7});
        var second=preview_instance(SampleModel,{prefix:"B",value:8,multiplier:function(){return 4;}});
        first.value=9;
        preview_args([first,second]);
    */ function page(first,second){new Label(undefined,first.result());new Label(undefined,second.result());}`,options);
    clean(scene);assert.deepStrictEqual(texts(scene),["A93","B84"]);
});

test("entry identity selects source-defined tabs independently for each scene", () => {
    const sceneSource=preamble + `/* @goowee-preview setup
        global.entry=preview_entry();
    */
    function first_page(){ new Label(undefined,string(global.entry==first_page)); }
    function second_page(){ new Label(undefined,string(global.entry==second_page)); }`;
    for(const entry of ["first_page","second_page"]){const scene=engine.analyze(sceneSource,{entry});clean(scene);assert.deepStrictEqual(texts(scene),["true"]);}
});

test("sample source methods follow source edits and report invalid constructors", () => {
    const sceneSource=preamble + `/* @goowee-preview setup
        global.model=preview_instance("Rules",{});
    */function page(){new Label(undefined,global.model.caption());}`;
    for(const caption of ["before","after"]){
        const scene=engine.analyze(sceneSource,{sourceFor:()=>({path:"Rules.gml",source:`function Rules() constructor {static caption=function(){return "${caption}";};}`})});
        clean(scene);assert.deepStrictEqual(texts(scene),[caption]);
    }
    const invalid=engine.analyze(preamble+`/* @goowee-preview setup preview_instance("Missing",{}); */ function page(){new Label(undefined,"Remaining UI");}`);
    assert(invalid.diagnostics.some(note=>/indexed constructor/.test(note.message)));assert.deepStrictEqual(texts(invalid),["Remaining UI"]);
});

test("dynamic constructor values and standard collections preserve source behavior", () => {
    const scene=engine.analyze(preamble+`function Part(value) constructor { caption=value; }
    function page(){
        var ctor=Part;var part=new ctor("gear");
        var map=ds_map_create();map[? "item"]=part;ds_map_add(map,"other",3);
        var priority=ds_priority_create();ds_priority_add(priority,"low",1);ds_priority_add(priority,map[? "item"].caption,5);
        var values=["prefix"];array_copy(values,1,[ds_priority_delete_max(priority),ds_priority_delete_min(priority)],0,2);
        new Label(undefined,values[1]+values[2]+string(ds_map_size(map)));
        ds_priority_destroy(priority);ds_map_destroy(map);
    }`);clean(scene);assert.deepStrictEqual(texts(scene),["gearlow2"]);
});

test("project draw methods build immutable virtual sprites with source origins and crops", () => {
    const scene=engine.analyze(preamble+`function page(){
        var source=surface_create(32,24);surface_set_target(source);draw_clear_alpha(c_black,0);
        draw_sprite_ext(s_part,1,10,12,2,3,20,c_white,0.5);surface_reset_target();
        var captured=sprite_create_from_surface(source,4,5,20,10,false,false,2,3);
        surface_set_target(source);draw_clear_alpha(c_black,0);surface_reset_target();surface_free(source);
        var image=new Image(undefined,new SpriteImage(captured,0,c_white,0.75));
        new Label(undefined,string(sprite_get_width(captured))+"/"+string(sprite_get_yoffset(captured)));
    }`,{assets:{s_part:{width:8,height:9,originX:2,originY:3,frameCount:2}}});
    clean(scene);assert.deepStrictEqual(texts(scene),["20/3"]);
    const sprite=scene.nodes.find(n=>n.type==="Image").sprite;
    assert.deepStrictEqual([sprite.width,sprite.height,sprite.originX,sprite.originY,sprite.alpha],[20,10,2,3,0.75]);
    const drawn=sprite.layers[0].sprite.layers[0];
    assert.deepStrictEqual([drawn.originX,drawn.originY,drawn.scaleX,drawn.scaleY,drawn.angle,drawn.sprite.index,drawn.sprite.alpha],[2,3,2,3,20,1,0.5]);
    assert.deepStrictEqual(sprite.layers[0].crop,{x:4,y:5,width:20,height:10});
});

test("nested surface targets and matrices keep captures independent", () => {
    const scene=engine.analyze(preamble+`function page(){
        var a=surface_create(20,20);surface_set_target(a);
        var b=surface_create(10,10);surface_set_target(b);draw_sprite(s_part,0,0,0);surface_reset_target();
        matrix_set(matrix_world,matrix_build(3,4,0,0,0,0,2,2,1));
        draw_surface_ext(b,1,2,1,1,0,c_white,1);surface_reset_target();
        new Image(undefined,new SpriteImage(sprite_create_from_surface(a,0,0,20,20,false,false,0,0)));
    }`,{assets:{s_part:{width:2,height:2,originX:0,originY:0}}});clean(scene);
    const layer=scene.nodes[0].sprite.layers[0].sprite.layers[0];
    assert.deepStrictEqual(layer.matrix.map(value=>value || 0),[2,0,0,2,3,4]);assert.strictEqual(layer.sprite.layers.length,1);
});

test("source try/catch/finally preserves return values and executes cleanup", () => {
    const scene=engine.analyze(preamble+`function safe_value(){try{throw "sample";}catch(problem){return problem;}finally{global.cleaned=true;}}
    function direct_value(){try{return "source";}catch(problem){return "wrong";}}
    function page(){new Label(undefined,safe_value()+"/"+direct_value()+"/"+string(global.cleaned));}`);
    clean(scene);assert.deepStrictEqual(texts(scene),["sample/source/true"]);
});

test("source constructors can be selected through lazily indexed function values", () => {
    const scene=engine.analyze(preamble+`function page(){var chosen=ExternalPart;var part=new chosen("native");new Label(undefined,part.caption());}`,{
        sourceFor:name=>name==="ExternalPart"?{path:"ExternalPart.gml",source:'function ExternalPart(value) constructor { __value=value; static caption=function(){return __value;}; }'}:null
    });clean(scene);assert.deepStrictEqual(texts(scene),["native"]);
});

test("source aliases preserve original builtins when the project wraps their names", () => {
    const scene=engine.analyze(preamble+`
    #macro original_map array_map
    #macro array_map wrapped_map
    function wrapped_map(values,callback){return original_map(values,callback);}
    function page(){
        var result=array_map([2,3],function(value){return value*2;});
        var mask=0;mask|=2;mask|=4;mask&=6;mask^=2;
        new Label(undefined,string(result[0])+"/"+string(result[1])+"/"+string(mask)+"/"+string(c_white==16777215));
    }`);clean(scene);assert.deepStrictEqual(texts(scene),["4/6/4/true"]);
});

test("sprite resource assignment switches between captured and native images", () => {
    const scene=engine.analyze(preamble+`function page(){
        var target=surface_create(7,9);surface_set_target(target);draw_clear_alpha(c_red,1);surface_reset_target();
        var captured=sprite_create_from_surface(target,0,0,7,9,false,false,2,3);
        var image=new SpriteImage(s_native,0,c_white,0.4);image.sprite=captured;
        new Image(undefined,image.clone());
        image.sprite=s_native;new Image(undefined,image);
        surface_free(target);
    }`,{assets:{s_native:{width:3,height:5}}});clean(scene);
    const images=scene.nodes.filter(node=>node.type==="Image");
    assert.deepStrictEqual(images.map(node=>[node.width,node.height]),[[7,9],[3,5]]);
    assert.strictEqual(images[0].sprite.virtual,true);assert.strictEqual(images[0].sprite.alpha,0.4);
    assert.deepStrictEqual([images[0].sprite.originX,images[0].sprite.originY],[2,3]);
    assert.strictEqual(images[1].sprite.name,"s_native");assert(!images[1].sprite.virtual && !images[1].sprite.layers);
});

test("nested surface reuse cannot grow an unbounded composition graph", () => {
    const scene=engine.analyze(preamble+`function page(){
        var first=surface_create(1,1);var second=surface_create(1,1);
        surface_set_target(first);draw_clear_alpha(c_red,1);surface_reset_target();
        for(var i=0;i<30;i++){
            surface_set_target(second);draw_clear_alpha(c_black,0);
            draw_surface(first,0,0);draw_surface(first,0,0);surface_reset_target();
            var swap=first;first=second;second=swap;
        }
        new Image(undefined,new SpriteImage(sprite_create_from_surface(first,0,0,1,1,false,false,0,0)));
        new Label(undefined,"Completed");
    }`);
    assert(scene.diagnostics.some(note=>/nested draw nodes|composition levels/.test(note.message)));
    assert.deepStrictEqual(texts(scene),["Completed"]);
    const image=scene.nodes.find(node=>node.type==="Image").sprite;
    const graphCost=spec=>1+(spec.layers || []).reduce((sum,layer)=>sum+1+(layer.sprite?graphCost(layer.sprite):0),0);
    assert(graphCost(image)<=4096);
    assert(JSON.stringify(image).length<1000000);
});

test("local macro cycles and unhandled throws retain useful source diagnostics", () => {
    const cyclic=engine.analyze(preamble+'#macro CYCLE CYCLE;\nfunction page(){CYCLE}',{sourcePath:"scripts/cycle.gml"});
    assert(cyclic.diagnostics.some(note=>/Recursive token macro CYCLE/.test(note.message) && note.line===3 && note.sourcePath==="scripts/cycle.gml"));
    const thrown=engine.analyze(preamble+'function page(){\n throw "Missing sample field";\n new Label(undefined,"Unreachable");\n}',{sourcePath:"scripts/throws.gml"});
    assert(thrown.diagnostics.some(note=>/Missing sample field/.test(note.message) && note.line===3 && note.sourcePath==="scripts/throws.gml"));
    assert.strictEqual(thrown.nodes.length,0);
});

test("source collection helpers can exclude an object without mutating the input", () => {
    const scene=engine.analyze(preamble+`function exclude(items,excluded){
        var chosen=array_clone(items);
        for(var i=array_length(chosen)-1;i>=0;i--){if(chosen[i]==excluded)array_delete(chosen,i,1);}
        return chosen;
    }
    function page(){
        var self_item={caption:"Self"};var peer={caption:"Peer"};var items=[self_item,peer,self_item];
        var selected=exclude(items,self_item);
        new Label(undefined,selected[0].caption+"/"+string(array_length(selected))+"/"+string(array_length(items)));
    }`);clean(scene);assert.deepStrictEqual(texts(scene),["Peer/1/3"]);
});

test("top-level constructor fields do not capture unrelated caller locals", () => {
    const scene=engine.analyze(preamble+`function Record() constructor {
        name="Record";label="Source";
        static caption=function(){return name+"/"+label;};
    }
    function page(){
        var name="Caller";var label="Local";var model=new Record();
        new Label(undefined,model.caption());
        new Label(undefined,name+"/"+label);
    }`);clean(scene);assert.deepStrictEqual(texts(scene),["Record/Source","Caller/Local"]);
});

test("known assets remain defined through a source native-alias wrapper", () => {
    const scene=engine.analyze(preamble+`
    #macro native_width sprite_get_width
    #macro sprite_get_width source_width
    function source_width(value){if(value==undefined)return 1;return native_width(value);}
    function page(){new Label(undefined,string(sprite_get_width(s_part)));}`,
    {assets:{s_part:{width:37,height:13}}});clean(scene);assert.deepStrictEqual(texts(scene),["37"]);
});

test("boolean sprite opacity controls native and captured images", () => {
    const scene=engine.analyze(preamble+`function page(){
        var target=surface_create(2,2);surface_set_target(target);draw_clear_alpha(c_red,1);surface_reset_target();
        var captured=sprite_create_from_surface(target,0,0,2,2,false,false,0,0);
        new Image(undefined,new SpriteImage(s_part,0,c_white,false));
        new Image(undefined,new SpriteImage(s_part,0,c_white,true));
        new Image(undefined,new SpriteImage(captured,0,c_white,false));
        new Image(undefined,new SpriteImage(captured,0,c_white,true));
    }`,{assets:{s_part:{width:2,height:2}}});clean(scene);
    assert.deepStrictEqual(scene.nodes.map(node=>node.sprite.alpha),[0,1,0,1]);
});

test("saved inherited methods keep their implementation through multiple overrides", () => {
    const source = preamble + `
    /* @goowee-preview setup
    var model = new LeafRecord();
    model.read({items: ["alpha", "beta"]});
    var second = new LeafRecord();
    second.read({items: ["gamma"]});
    preview_args([model,second]);
    */
    function BaseRecord() constructor {
        items=[]; trace="";
        static read=function(data){items=data.items; trace+="base";};
        static caption=function(){return trace+"/"+string(array_length(items));};
    }
    function MiddleRecord() : BaseRecord() constructor {
        static parent_read=read;
        static read=function(data){parent_read(data);trace+="/middle";};
    }
    function LeafRecord() : MiddleRecord() constructor {
        static parent_read=read;
        static read=function(data){parent_read(data);trace+="/leaf";};
    }
    function page(model,second){new Label(undefined,model.caption());new Label(undefined,second.caption());}`;
    const scene=engine.analyze(source,{entry:"page"});
    clean(scene);
    assert.deepStrictEqual(texts(scene),["base/middle/leaf/2","base/middle/leaf/1"]);
    assert(scene.stats.calls<30,"An inherited alias must not exhaust the call budget");
});

test("method aliases follow declaration order while literal methods remain callable early", () => {
    const scene=engine.analyze(preamble+`function BaseRecord() constructor {
        static caption=function(){return "base";};
    }
    function ChildRecord() : BaseRecord() constructor {
        value=caption();
        static previous=caption;
        static caption=function(){return "child";};
        static current=caption;
        static result=function(){return value+"/"+previous()+"/"+current();};
    }
    function page(){var record=new ChildRecord();new Label(undefined,record.result());}`);
    clean(scene);
    assert.deepStrictEqual(texts(scene),["child/base/child"]);
});

test("source numeric validation accepts finite data and rejects NaN and infinities", () => {
    const scene=engine.analyze(preamble+`function validate(value){
        if(!is_numeric(value) || is_nan(value) || is_infinity(value))return "invalid";
        return string(value);
    }
    /* @goowee-preview setup
    if(is_nan(3) || is_infinity(3))throw "Finite sample rejected";
    */
    function page(){
        var values=[0,-2,1.5,sqrt(-1),infinity,-infinity,"text"];
        for(var i=0;i<array_length(values);i++)new Label(undefined,validate(values[i]));
        new Label(undefined,string(is_nan("text"))+"/"+string(is_infinity("text")));
    }`);
    clean(scene);
    assert.deepStrictEqual(texts(scene),["0","-2","1.5","invalid","invalid","invalid","invalid","false/false"]);
});

test("constructor parameters still shadow inherited names when assigning aliases", () => {
    const scene=engine.analyze(preamble+`function BaseRecord() constructor {
        static caption=function(){return "base";};
    }
    function ParameterRecord(caption) : BaseRecord() constructor {
        static saved=caption;
        static result=function(){return saved();};
    }
    function page(){
        var record=new ParameterRecord(function(){return "argument";});
        new Label(undefined,record.result());
    }`);
    clean(scene);
    assert.deepStrictEqual(texts(scene),["argument"]);
});

test("failed fixture setup retains the requested entry and alternative entries", () => {
    const source=preamble+`/* @goowee-preview setup
    throw "Unavailable sample data";
    */
    function first_page(){new Label(undefined,"First");}
    function second_page(){new Label(undefined,"Second");}`;
    for(const entry of ["first_page","second_page"]){
        const scene=engine.analyze(source,{entry,sourcePath:"scripts/sample_pages.gml"});
        assert.strictEqual(scene.entry,entry);
        assert.deepStrictEqual(scene.entries.map(item=>item.name),["first_page","second_page"]);
        assert.strictEqual(scene.nodes.length,0);
        assert(scene.diagnostics.some(note=>/Unavailable sample data/.test(note.message)));
        const recovered=engine.analyze(source.replace('throw "Unavailable sample data";','preview_note("Ready");'),{entry});
        assert.strictEqual(recovered.entry,entry);
        assert.deepStrictEqual(texts(recovered),[entry==="first_page"?"First":"Second"]);
    }
});

test("generated arrays call an indexed generator with bound scope and distinct results", () => {
    const scene=engine.analyze(preamble+`function page(){
        global.generator_calls=0;
        var context={offset:7};
        var values=array_create_ext(3,method(context,function(index){
            global.generator_calls++;
            return {caption:string(offset+index)};
        }));
        values[0].caption="changed";
        for(var i=0;i<array_length(values);i++)new Label(undefined,values[i].caption);
        var empty=array_create_ext(0,method(context,function(index){global.generator_calls++;return index;}));
        new Label(undefined,string(global.generator_calls)+"/"+string(array_length(empty)));
    }`);
    clean(scene);
    assert.deepStrictEqual(texts(scene),["changed","8","9","3/0"]);
});

test("generated array creation stays within the preview item budget", () => {
    const scene=engine.analyze(preamble+`function page(){
        var values=array_create_ext(3000,function(index){return index;});
        new Label(undefined,string(array_length(values))+"/"+string(values[2047]));
    }`);
    assert.deepStrictEqual(texts(scene),["2048/2047"]);
    assert.strictEqual(scene.diagnostics.length,1);
    assert.match(scene.diagnostics[0].message,/Array creation capped at 2048 items/);
});

test("helper static catalogues initialize once per analysis and retain updates", () => {
    const source=preamble+`function caption(index){
        static values=array_create_ext(3,function(item){global.initialized++;return string(item);});
        static calls=0;
        calls++;
        if(calls==2)values[1]="updated";
        return values[index]+"/"+string(calls);
    }
    function page(){
        global.initialized=0;
        new Label(undefined,caption(0));
        new Label(undefined,caption(1));
        new Label(undefined,caption(2));
        new Label(undefined,string(global.initialized));
    }`;
    for(let run=0;run<2;run++){
        const scene=engine.analyze(source,{entry:"page"});
        clean(scene);
        assert.deepStrictEqual(texts(scene),["0/1","updated/2","2/3","3"]);
    }
});

console.log("GooWee universal preview: " + count + " tests passed.");
