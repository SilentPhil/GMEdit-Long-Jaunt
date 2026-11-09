"use strict";

// Construction fidelity regressions: these assert visible content and parentage,
// not just that a parser accepts a file without throwing.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const engine = require("../bin/resources/app/plugins/goowee-preview/preview-engine.js");
const resourceAPI = require("../bin/resources/app/plugins/goowee-preview/project-resources.js");
const preamble = '#import "games.keevee.gw"\n';
let count = 0;
function test(name, fn) { fn(); count++; console.log("ok - " + name); }
function named(scene, name) {
    const result = scene.nodes.find(node => node.name === name);
    assert(result, "Missing visible element " + name);
    return result;
}
function preview(source, options) { return engine.analyze(preamble + source, options || {}); }
function sources(items) {
    return function(name) {
        const item = items[name];
        return item ? {source: preamble + item.source, path: item.path, name: item.name || name} : null;
    };
}

test("custom child layouts use live bounds, children and scaled margin measurements", () => {
    const source=`function EqualSlots(parent, gap) : Container(parent) constructor {
        spacing=ABSV(gap);
        static get_base_layout=function(child, result=undefined) {
            if(result==undefined)result=new Rectangle(0,0,0,0);
            var index=-1;
            var count=child_count();
            for(var i=0;i<count;i++) { if(children[i]==child) { index=i;break; } }
            var gap_width=_measure_margin(spacing,Orientation.horizontal);
            var width=(layout.width-padding_actual.left-padding_actual.right-gap_width*(count-1))/count;
            result.x=layout.x+padding_actual.left+(width+gap_width)*index;
            result.y=layout.y+padding_actual.top;
            result.width=width;
            result.height=layout.height-padding_actual.top-padding_actual.bottom;
            return result;
        };
    }
    function menu() {
        var root=new Canvas(undefined);root.size(ABSV(420),ABSV(200));root.margin(23,31,0,0);
        var slots=new EqualSlots(root,4);slots.size(REL(1),ABSV(50));slots.padding(ABSV(10),ABSV(4),ABSV(10),ABSV(6));
        for(var i=0;i<4;i++){var button=new Button(slots);button.size(REL(1),REL(1));}
    }`;
    for(const scale of [1,2]) {
        const scene=preview(source,{entry:"menu",scale});
        const buttons=scene.nodes.filter(node=>node.name==="button");
        assert.strictEqual(buttons.length,4);
        buttons.forEach((button,index)=>assert.deepStrictEqual([button.x,button.y,button.width,button.height],
            [23+(10+101*index)*scale,31+4*scale,97*scale,40*scale]));
        assert.deepStrictEqual(scene.diagnostics,[]);
    }
});

test("custom margin measurement uses the parent's base rectangle for REL values", () => {
    const scene=preview(`function Split(parent) : Container(parent) constructor {
        static get_base_layout=function(child) {
            var gap=self._measure_margin(REL(0.1),Orientation.horizontal);
            var index=self.children[0]==child ? 0 : 1;
            return new Rectangle(self.layout.x+index*(70+gap),self.layout.y,70,30);
        };
    }
    function menu() {
        var root=new Canvas(undefined);root.size(400,100);
        var split=new Split(root);split.size(200,30);
        var first=new Button(split);first.size(REL(1),REL(1));
        var second=new Button(split);second.size(REL(1),REL(1));
    }`,{entry:"menu"});
    assert.deepStrictEqual([named(scene,"first").x,named(scene,"second").x],[0,110]);
    assert.deepStrictEqual(scene.diagnostics,[]);
});

test("external UI helpers preserve the passed parent and source location", () => {
    const externalPath = "scripts/shared_ui/shared_ui.gml";
    const scene = preview(`function menu() {
        var canvas = new Canvas(undefined); canvas.size(400, 200);
        gui_add_heading(canvas, "Clan");
    }`, {sourceFor: sources({gui_add_heading: {path: externalPath, source: `function gui_add_heading(parent, text) {
        var heading = new Label(parent, text);
        heading.margin(10, 8, 0, 0); heading.size(160, 30);
        return heading;
    }`}})});
    const canvas = named(scene, "canvas"), heading = named(scene, "heading");
    assert.strictEqual(heading.parentId, canvas.id);
    assert.strictEqual(heading.text, "Clan");
    assert.strictEqual(heading.sourcePath, externalPath);
    assert(heading.line > 1, "External source lines must refer to that source, not the caller");
    assert.deepStrictEqual([heading.x - canvas.x, heading.y - canvas.y, heading.width, heading.height], [10, 8, 160, 30]);
});

test("plain constructor objects can configure and spawn UI without creating phantom roots", () => {
    const scene = preview(`function menu() {
        var root = new Canvas(undefined); root.size(300, 200);
        var tab = new RoughTab(163);
        tab.set_label("Family");
        tab.spawn(root);
    }`, {sourceFor: sources({RoughTab: {path: "scripts/rough/rough.gml", source: `function RoughTab(width) constructor {
        __width = width; __caption = "";
        static set_label = function(value) { __caption = value; }
        static spawn = function(parent) {
            var tab_button = new Button(parent); tab_button.size(__width, 38);
            var caption = new Label(tab_button, __caption);
            caption.alignment(Align.center, Align.center);
            return tab_button;
        }
    }`}})});
    assert.strictEqual(scene.roots.length, 1, "Configuration structs are not scene nodes");
    assert.strictEqual(scene.nodes.length, 3);
    assert.strictEqual(named(scene, "tab_button").width, 163);
    assert.strictEqual(named(scene, "caption").text, "Family");
    assert.strictEqual(named(scene, "caption").parentId, named(scene, "tab_button").id);
});

test("an explicitly updated DataBind constructs its current content but leaves event callbacks dormant", () => {
    const scene = preview(`function menu() {
        var row = new StackPanel(undefined); row.size(AUTO(1), AUTO(1));
        var bind = new DataBind(method({target: row}, function() {
            var current = new Button(target); current.size(70, 70);
            current.click.add(function() { var future = new Label(target, "Opened after click"); });
        }));
        bind.update();
    }`);
    assert.strictEqual(scene.nodes.length, 2);
    assert.strictEqual(named(scene, "current").parentId, named(scene, "row").id);
    assert.deepStrictEqual([named(scene, "row").width, named(scene, "row").height], [70, 70]);
    assert(!scene.nodes.some(node => node.name === "future"));
});

test("scope shorthand and tokenized scope macros bind the same construction callback", () => {
    const bindings = ["scope1(row)", "scope1_mf0 row scope1_mf1 row scope1_mf2"];
    for (const binding of bindings) {
        const scene = preview(`function menu() {
            var row = new StackPanel(undefined); row.size(AUTO(1), AUTO(1));
            var bind = new DataBind(method(${binding}, function() {
                var card = new Button(row); card.size(70, 70);
            }));
            bind.update();
        }`);
        assert.strictEqual(named(scene, "card").parentId, named(scene, "row").id, binding);
        assert.strictEqual(scene.nodes.length, 2, binding);
    }
});

test("enum values select the intended UI state instead of the dynamic first branch", () => {
    const scene = preview(`enum Tabs { FIRST, SECOND }
    function menu() {
        var label = new Label(undefined, Tabs.SECOND == 1 ? "Second selected" : "Wrong state");
    }`);
    assert.strictEqual(named(scene, "label").text, "Second selected");
    assert(!scene.diagnostics.some(note => /Dynamic condition/.test(note.message)));
});

test("runtime-drawn surfaces expose their missing content instead of silently looking empty", () => {
    const scene = preview(`function menu() {
        var surface = new CanvasSurface(undefined); surface.size(400, 300);
        surface.add_surface_render_callback(function() { FAMILY_TREE.draw(); });
    }`);
    const surface = named(scene, "surface");
    assert(surface.runtimePlaceholder, "A runtime surface needs a visible explanatory placeholder");
    assert(scene.diagnostics.some(note => /surface|runtime|draw/i.test(note.message)));
});

test("indexed external enums choose wrapper branches without executing their declaring constructor", () => {
    const supplied = [];
    const scene = preview(`function general() { return shared(RemoteCategory.GENERAL); }
        function shared(category) { var root = new Canvas(undefined); root.size(200,100);
            var caption = new Label(root, category == RemoteCategory.CULTURE ? "Culture" : "General"); }`, {
        entry:"general", sourceFor(name) {
            supplied.push(name);
            if(name !== "RemoteCategory") return null;
            return {path:"scripts/data/data.gml",source:`#macro FIRST_CATEGORY 4
                function Data() constructor { enum RemoteCategory { GENERAL = FIRST_CATEGORY, CULTURE }
                    var should_not_exist = new Label(undefined,"Not UI construction"); }`};
        }
    });
    assert.strictEqual(named(scene,"caption").text,"General");
    assert.strictEqual(scene.nodes.length,2);
    assert.strictEqual(supplied.filter(name=>name==="RemoteCategory").length,1);
    assert(!scene.diagnostics.some(note=>/Dynamic condition/.test(note.message)));
});

test("Scroll viewport aliases retain content parentage, margins and the fixed scrollbar", () => {
    const scene=preview(`function menu() { var root=new Canvas(undefined); root.size(400,240);
        var scroll=new Scroll(root,REL(1),REL(1),0,27,2,false);
        scroll.viewport.margin(4,10,2,1);
        var row=new StackPanel(scroll.stack_content); row.size(REL(1),AUTO(1));
        var card=new Button(row); card.size(REL(1),600);
        scroll.image_scroll_bar.margin(2,2,2,2);
    }`);
    const root=named(scene,"root"),scroll=named(scene,"scroll"),content=named(scene,"content"),row=named(scene,"row");
    const canvas=named(scene,"scroll_canvas"),bar=named(scene,"canvas_scroll_bar"),thumb=named(scene,"image_scroll_bar");
    assert.strictEqual(scene.roots.length,1);
    assert.strictEqual(scroll.parentId,root.id);
    assert.strictEqual(canvas.parentId,scroll.id);
    assert.strictEqual(content.parentId,canvas.id);
    assert.strictEqual(row.parentId,content.id);
    assert.strictEqual(scroll.clipChildren,true);
    assert.deepStrictEqual([scroll.x,scroll.y,scroll.width,scroll.height],[4,10,394,229]);
    assert.strictEqual(content.width,367);
    assert.strictEqual(bar.height,scroll.height);
    assert.strictEqual(bar.x+bar.width,scroll.x+scroll.width);
    assert(thumb.height>0 && thumb.height<bar.height);
    assert(named(scene,"card").y>=scroll.y && named(scene,"card").height>scroll.height);
});

test("ordinary source structs preserve identity and count collections before constructing columns", () => {
    const scene=preview(`function Group(caption) constructor { static get_caption=function(){return caption;}; }
    function Item(group) constructor {static get_group=function(){return group;};}
    function menu() { var root=new StackPanel(undefined); root.size(400,AUTO(1));
        var groups=[new Group("Group A"),new Group("Group B")], counts=array_create(2,0), items=[];
        for(var index=0;index<30;index++)array_push(items,new Item(groups[index<15?0:1]));
        for(var i=0;i<array_length(items);i++){ var index=array_get_index(groups,items[i].get_group()); counts[index]++; }
        for(var j=0;j<array_length(groups);j++){ var title=new Label(root,groups[j].get_caption());
            for(var k=0;k<counts[j];k++){ var card=new Button(root);card.size(80,20); } }
    }`,{entry:"menu"});
    assert.strictEqual(scene.nodes.filter(node=>node.name==="card").length,30);
    assert.deepStrictEqual(scene.nodes.filter(node=>node.name==="title").map(node=>node.text),["Group A","Group B"]);
    assert(!scene.diagnostics.some(note=>/capped|complexity|call limit/.test(note.message)));
});

test("visibility queries let custom controls hide inactive overlays during construction", () => {
    const scene=preview(`function menu() { var button=new StateButton(undefined); }
        function StateButton(parent):Button(parent) constructor {
            var glow=new Image(self,new SpriteImage(s_glow)); glow.size(20,20);
            var icons=[];
            static set_visible=function(control,visible){ if(control.is_draw_disabled()==visible)control.draw_set_enable(visible); };
            set_visible(glow,array_length(icons)>0);
        }`);
    assert.strictEqual(named(scene,"glow").hidden,true);
});

test("repeated imported constructors reuse their gw-prefixed definition for every instance", () => {
    let loads=0;
    const scene=preview(`function menu(){ var root=new StackPanel(undefined); root.size(400,AUTO(1));
        for(var i=0;i<16;i++){var card=new KnowledgeCard(root);} }`,{sourceFor(name){
        if(name!=="KnowledgeCard")return null;loads++;
        return {path:"scripts/gw_KnowledgeCard/gw_KnowledgeCard.gml",source:`function gw_KnowledgeCard(parent):gw_Button(parent) constructor {
            size(gw_ABS(244),gw_ABS(64));var background=new gw_Image(self,new gw_SpriteImage(s_background));background.size(gw_REL(1),gw_REL(1));
        }`};
    }});
    const cards=scene.nodes.filter(node=>node.type==="KnowledgeCard");
    assert.strictEqual(cards.length,16);
    assert(cards.every(card=>card.width===244 && card.height===64 && card.children.length===1),"Every imported constructor must execute, not only the first one");
    assert.strictEqual(loads,1);
    assert(!scene.diagnostics.some(note=>/outer bounds|call limit/.test(note.message)));
});

test("loading a scroll enum cannot execute the real constructor beside the modelled viewport", () => {
    const scene=preview(`function menu(){var root=new StackPanel(undefined);root.size(400,300);
        var scroll=new gw_Scroll(root,REL(1),REL(1),GUI_SCROLL_PARAMS.NO);
        var rows=new StackPanel(scroll.stack_content);rows.size(REL(1),AUTO(1));
        var child=new Button(rows);child.size(100,800);
    }`,{sourceFor(name){return name==="GUI_SCROLL_PARAMS" ? {
        path:"scripts/gw_Scroll/gw_Scroll.gml",source:`function gw_Scroll(parent,width,height,params) constructor {
            enum GUI_SCROLL_PARAMS { NO=0, HIDE_SCROLL=2 }
            viewport=new Float(parent);viewport.size(width,height);
            stack_content=new StackPanel(viewport);
            var duplicated=new Label(viewport,"Should not run twice");
        }`
    }:null;}});
    const root=named(scene,"root"),scroll=named(scene,"scroll");
    assert.strictEqual(scene.roots.length,1);
    assert.deepStrictEqual(root.children.map(node=>node.id),[scroll.id]);
    assert.strictEqual(named(scene,"rows").parentId,named(scene,"content").id);
    assert.strictEqual(named(scene,"content").parentId,named(scene,"scroll_canvas").id);
    assert.strictEqual(scroll.clipChildren,true);
    assert(!scene.nodes.some(node=>node.name==="duplicated"));
});

test("retiring a rebuilt panel removes the old hidden subtree from AUTO layout", () => {
    for(const namespace of ["GooWee","gw_GooWee"]){
        const scene=preview(`function menu(){var root=new StackPanel(undefined);root.size(AUTO(1),AUTO(1));root.orientation(Orientation.horizontal);
            var old=new StackPanel(root);old.size(AUTO(1),AUTO(1));
            var retired=new Button(old);retired.size(120,30);
            var nested=new Label(retired,"Old caption");
            old.draw_disable();${namespace}.element_remove(old);
            var fresh=new StackPanel(root);fresh.size(AUTO(1),AUTO(1));
            var current=new Button(fresh);current.size(40,20);
        }`);
        const root=named(scene,"root");
        assert.deepStrictEqual([root.width,root.height],[40,20],namespace);
        assert.strictEqual(root.children.length,1);
        assert.strictEqual(root.children[0].name,"fresh");
        assert.strictEqual(scene.nodes.length,3);
        assert(!scene.nodes.some(node=>["old","retired","nested"].includes(node.name)));
    }
});

test("indexed sprite factories resolve their actual asset and branch without running top-level setup", () => {
    const scene=preview(`function menu(){var root=new Canvas(undefined);root.size(200,100);
        var icon=new Image(root,cost_get_square_sprite(true));
        var unavailable=new Image(root,cost_get_square_sprite(false));
    }`,{sourceFor(name){return name==="cost_get_square_sprite" ? {
        path:"scripts/resources/resources.gml",source:`var not_a_preview=new Label(undefined,"Do not execute setup");
        function cost_get_square_sprite(available){static bright=new SpriteImage(s_cost,3);static dim=new SpriteImage(s_cost_empty,3);
            if(available)return bright;return dim;
        }`
    }:null;}});
    assert.strictEqual(scene.nodes.length,3);
    assert.deepStrictEqual([named(scene,"icon").sprite.name,named(scene,"icon").sprite.index],["s_cost",3]);
    assert.deepStrictEqual([named(scene,"unavailable").sprite.name,named(scene,"unavailable").sprite.index],["s_cost_empty",3]);
});

const projectFlag = process.argv.indexOf("--project");
if (projectFlag >= 0) {
    const directory = path.resolve(process.argv[projectFlag + 1]);
    const functions = Object.create(null), macros=Object.create(null), cachedFiles = new Map();
    function addSource(name) {
        const relative = "scripts/" + name + "/" + name + ".gml";
        const absolute = path.join(directory, relative);
        if (!fs.existsSync(absolute)) return null;
        let source = cachedFiles.get(absolute);
        if (!source) { source = fs.readFileSync(absolute, "utf8"); cachedFiles.set(absolute, source); }
        const record = {name, path: absolute, source};
        for (const match of source.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z_0-9]*)\s*\(/g)) functions[match[1]] = record;
        for (const match of source.matchAll(/\benum\s+([A-Za-z_]\w*)\s*\{/g)) functions[match[1]]=record;
        for (const match of source.matchAll(/^\s*#macro\s+([A-Za-z_]\w*)\s+([^\r\n]+)/gm)) macros[match[1]]=match[2];
        return record;
    }
    fs.readdirSync(path.join(directory,"scripts"),{withFileTypes:true}).filter(item=>item.isDirectory()).forEach(item=>addSource(item.name));
    const yyResources = Object.create(null), yyResourceTypes = Object.create(null);
    for (const name of fs.readdirSync(path.join(directory, "sprites"))) {
        yyResources[name] = {id: {path: "sprites/" + name + "/" + name + ".yy"}};
        yyResourceTypes[name] = "GMSprite";
    }
    for(const name of fs.readdirSync(path.join(directory,"fonts"))){yyResources[name]={id:{path:"fonts/"+name+"/"+name+".yy"}};yyResourceTypes[name]="GMFont";}
    const resources = resourceAPI.create({yyResources, yyResourceTypes,dir:directory,
        readYyFileSync(relative) { return JSON.parse(fs.readFileSync(path.join(directory, relative), "utf8").replace(/,\s*([}\]])/g, "$1")); },
        readTextFileSync(relative){return fs.readFileSync(path.join(directory,relative),"utf8");},
        existsSync(relative){return fs.existsSync(path.join(directory,relative));},
        readdirSync(relative){return fs.readdirSync(path.join(directory,relative));},
        getImageURL(relative) { return path.join(directory, relative); }
    });
    const assets = new Proxy(Object.create(null), {get(target, name) {
        if (typeof name !== "string") return undefined;
        if (!Object.prototype.hasOwnProperty.call(target, name)) target[name] = resources.sprite(name, 0);
        return target[name];
    }});
    const commonOptions={width:1920,height:1080,assets,macros,fontFor:resources.font,fontFileFor:resources.fontFileFor,
        localeLanguage:"English",localeInfo:{language:"English"},jsonFor:resources.jsonFor,jsonFiles:resources.jsonFiles,
        setupSources:[resources.previewSetup()].filter(Boolean),sourceFor(name){return functions[name] || addSource(name);}};
    const source = fs.readFileSync(path.join(directory, "scripts/gui_Family/gui_Family.gml"), "utf8");
    const scene = engine.analyze(source, Object.assign({entry:"gui_family_menu_tree_create"},commonOptions));
    test("Strategy Family tree builds its shared title, tabs, sampled lord card and remaining surface", () => {
        const canvas = named(scene, "canvas"), surface = named(scene, "family_tree_canvas"), row = named(scene, "player_faction_lords_stack");
        assert.deepStrictEqual([canvas.width, canvas.height], [1040, 900]);
        assert(scene.nodes.some(node => node.type === "Label" && /menu\.tools\.hint\.clan/.test(node.text)), "Shared title helper must be expanded");
        const familyTabCaption = scene.nodes.find(node => node.type === "Label" && /menu\.family\.tree/.test(node.text));
        const restrictionsTabCaption = scene.nodes.find(node => node.type === "Label" && /menu\.family\.restrictions/.test(node.text));
        assert(familyTabCaption, "Rough Family tab must be constructed");
        assert(restrictionsTabCaption, "Rough Restrictions tab must be constructed");
        const header = named(scene, "stack_top");
        for (const caption of [familyTabCaption, restrictionsTabCaption]) {
            const button = scene.nodes.find(node => node.id === caption.parentId);
            assert.strictEqual(button.width, 163);
            assert(button.y >= header.y + header.height - 1, "Tabs must follow the 58px header instead of overlapping its title");
        }
        const tabBackgrounds = scene.nodes.filter(node => node.sprite && node.sprite.name === "ns_tab_button_rough");
        assert.strictEqual(tabBackgrounds.length, 2);
        assert(tabBackgrounds.every(node => node.width >= 163 && node.height === 38), "Forwarded get_base_layout must give tab backgrounds full button width and AUTOV half-height");
        const pattern = named(scene, "image_pattern");
        assert.deepStrictEqual([pattern.width, pattern.height], [1024, 68], "Custom header get_base_layout must measure against the canvas, despite its zero-size Float parent");
        const card = scene.nodes.find(node => node.type === "Button" && node.width === 70 && node.height === 70);
        assert(card, "Initial DataBind.update() must produce a sampled lord card");
        assert(row.width > 70 && row.width < canvas.width);
        assert(Math.abs(row.x + row.width / 2 - (canvas.x + canvas.width / 2)) <= 1, "AUTO lord row must remain centered");
        assert(surface.height > 100 && surface.height < canvas.height - 58);
        assert(surface.y >= row.y + row.height - 1, "REL surface must follow the fixed-height lord row");
        assert(surface.y + surface.height <= canvas.y + canvas.height - 7, "REL surface must fit inside canvas bottom padding");
        assert(surface.runtimePlaceholder, "Family graph is runtime drawn and must be labeled as such");
    });
    test("Strategy restrictions keep sampled table cells inside their rows instead of creating full-height roots", () => {
        const restrictions = engine.analyze(source,Object.assign({entry:"gui_family_menu_restrictions_create"},commonOptions));
        assert.strictEqual(restrictions.roots.length, 1, "Unknown collection lengths must not detach checkbox cells from their sampled rows");
        const table = named(restrictions, "restrictions_table"), row = named(restrictions, "restriction_row"), checkbox = named(restrictions, "checkbox_cell");
        assert.strictEqual(table.width, 274, "One sampled lord plus the 194px caption column must reserve 194 + 80 pixels");
        assert.strictEqual(checkbox.parentId, row.id);
        assert.strictEqual(checkbox.height, 38, "The checkbox's REL height must use its 38px row, not the1080px viewport");
        assert(checkbox.x >= table.x && checkbox.x + checkbox.width <= table.x + table.width);
    });
    resources.dispose();
}

console.log(count + " GooWee project construction tests passed.");
