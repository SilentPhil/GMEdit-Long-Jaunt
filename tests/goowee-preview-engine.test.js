"use strict";
const assert = require("assert");
const engine = require("../bin/resources/app/plugins/goowee-preview/preview-engine.js");
const preamble = '//!#import "games.keevee.gw"\n';
let count = 0;
function test(name, fn) { fn(); count++; console.log("ok - " + name); }
function preview(source, options) {
	options=Object.assign({},options);
	// Explicit project-owned bindings, rather than language/API names in the engine.
	if(options.localize || options.localizeHeader)options.setupSources=[{path:"fixtures/locale-preview.gml",source:`/* @goowee-preview setup
		preview_override("LOCALE.text", function(key){return preview_text(key);});
		preview_override("locale_text", function(key){return preview_text(key);});
		preview_override("LOCALE.text_english", function(key){return preview_text_english(key);});
		preview_override("LOCALE.text_format", function(){return method_call(preview_text_format,argument);});
		preview_override("LOCALE.text_format_from_struct", function(key,values){return preview_text_format_from_struct(key,values);});
		preview_override("LOCALE.get_language_name", function(){return preview_locale().language;});
		preview_override("LOCALE.hints(...).get_header_by_hint_name", function(key){return preview_hint_header(key);});
		preview_override("LOCALE.hints(...).get_hint_by_hint_name", function(key){return preview_hint(key);});
	*/`}];
	return engine.analyze(preamble + source, options);
}
function node(result, name) { const found = result.nodes.find(n => n.name === name); assert(found, "Missing " + name); return found; }

test("import directives are recognized only outside strings and ordinary comments", () => {
	assert(engine.analyze('#import "games.keevee.gw"\n').supported);
	assert(engine.analyze(preamble).supported);
	assert(!engine.analyze('// #import "games.keevee.gw"\n').supported);
	assert(!engine.analyze('/*\n#import "games.keevee.gw"\n*/').supported);
	assert(!engine.analyze('var x = @\'\n#import "games.keevee.gw"\n\';').supported);
	assert(!engine.analyze('var x = "//!#import \\\"games.keevee.gw\\\"";').supported);
});

test("canvas sizing, padding, margin and alignment use GooWee semantics", () => {
	const r = preview(`function ui() {
		var canvas = new gw_Canvas(gw_GooWee.view);
		canvas.size(gw_ABSV(400), gw_ABSV(200));
		canvas.alignment(gw_Align.center, gw_Align.bottom);
		canvas.margin(0,0,0,20); canvas.padding(10,10,10,10);
		var label = new gw_Label(canvas, "Caption");
		label.size(gw_REL(1), 30); label.margin(5,0,5,0);
	}`, {width:1000,height:600});
	assert.deepStrictEqual([node(r,"canvas").x,node(r,"canvas").y], [300,380]);
	assert.deepStrictEqual([node(r,"label").x,node(r,"label").width], [315,370]);
});

test("aliases and fixed preview scale work independently of viewport resolution", () => {
	const r = preview('function ui() { var a = new Canvas(GooWee.view); a.size(ABSV(120), ABS(90)); }', {width:800,height:600,scale:2});
	assert.deepStrictEqual([node(r,"a").width,node(r,"a").height], [240,90]);
	assert.strictEqual(r.guiScale,2,"The renderer needs the global GUI scale for native NineSlice borders and repeat tiles");
});

test("GMEdit typed editor source has the same entries, parents, units and bounds as saved GML", () => {
	const saved = `function first(parent/*:gw_Container*/, width/*:real*/=240)/*->gw_Canvas*/ {
		var canvas/*:gw_Canvas*/ = new gw_Canvas(parent); canvas.size(gw_ABSV(width),gw_ABS(100));
		var stack/*:gw_StackPanel*/ = new gw_StackPanel(canvas); stack.size(gw_REL(1),gw_AUTO(1));
		var label/*:gw_Label*/ = new gw_Label(stack,"Typed"); label.size(gw_REL(1),gw_ABSV(20));
		var decorate = function(p/*:gw_Container*/)/*->void*/ { var icon/*:gw_Image*/=new gw_Image(p);icon.size(16,16); };
		decorate(stack); return canvas;
	}
	function second(parent/*:gw_Container*/)/*->gw_Canvas[]*/ { var other = new gw_Canvas(parent); other.size(80,60);return [other]; }`;
	const edited = saved.replace(/\/\*(:[^*]*|->[^*]*)\*\//g,"$1").replace(/\bgw_/g,"");
	const rootOptions={scale:2,setupSources:[{path:"fixtures/root.gml",source:"/* @goowee-preview setup preview_args([undefined]); */"}]};
	for (const entry of ["first","second"]) {
		const disk = preview(saved,Object.assign({entry},rootOptions)), buffer = preview(edited,Object.assign({entry},rootOptions));
		assert.deepStrictEqual(buffer.entries,disk.entries);
		assert.deepStrictEqual(buffer.nodes,disk.nodes);
		assert.strictEqual(buffer.roots.length,1);
		assert.strictEqual(buffer.entry,entry);
		assert.deepStrictEqual(buffer.diagnostics,disk.diagnostics);
	}
	assert.strictEqual(node(preview(edited,rootOptions),"canvas").width,480);
});

test("nested generic, union, tuple and struct annotations leave defaults and declarations intact", () => {
	const r = preview(`function ui(data:Map<string,Array<Thing>>, tuple:[real,real], config:{size:real,flags:bool[]}, parent:(Container|undefined)?)->Canvas[] {
		var unused:Array<Map<string,Thing>>=[], canvas:Canvas=new Canvas(parent), width:real=90;
		static height:real=70;
		canvas.size(width,height); return [canvas];
	}`,{setupSources:[{path:"fixtures/root.gml",source:"/* @goowee-preview setup preview_args([undefined,undefined,undefined,undefined]); */"}]});
	assert.strictEqual(r.entry,"ui");
	assert.deepStrictEqual([node(r,"canvas").width,node(r,"canvas").height],[90,70]);
	assert.deepStrictEqual(r.diagnostics,[]);
});

test("typed constructor inheritance and new-expression generics preserve the base control", () => {
	const r = preview(`function gw_Card(parent:Container):Button<Array<string>>(parent) constructor {
		size(180,80); var label:Label=new Label<string>(self,"Card");
	}`);
	assert.strictEqual(r.entry,"gw_Card");
	assert.deepStrictEqual([r.roots[0].width,r.roots[0].height],[180,80]);
	assert.strictEqual(node(r,"label").parentId,r.roots[0].id);
});

test("qualified constructor bases remain parseable with editor generic annotations", () => {
	const r = preview(`function gw_Card(parent:Container):UI.Button<Array<string>>(parent) constructor {
		var label:Label=new Label(undefined,"Qualified base");label.size(180,80);
	}`);
	assert.strictEqual(r.entry,"gw_Card");
	assert.strictEqual(node(r,"label").text,"Qualified base");
	assert(!r.diagnostics.some(d=>/Expected function body/.test(d.message)));
});

test("GMEdit arrow callbacks remain scoped and explicit helper calls bind typed arguments", () => {
	const r = preview(`function ui()->Canvas {
		var canvas:Canvas=new Canvas(undefined); canvas.size(240,100);
		var width=(value:real)=>value*2; var resize=(p:Canvas)=>;p.size(width(120),100); resize(canvas);
		var add=(p:Container,text:string=")")=>{ var label:Label=new Label(p,text); }; add(canvas,"Arrow");
		canvas.click.add(method(scope1(canvas),()=>{ var future=new Canvas(undefined); future.size(999,999); }));
		return canvas;
	}`);
	assert.strictEqual(r.nodes.length,2);
	assert.strictEqual(r.roots.length,1);
	assert.strictEqual(node(r,"canvas").width,240);
	assert.strictEqual(node(r,"label").text,"Arrow");
	assert.strictEqual(node(r,"label").parentId,node(r,"canvas").id);
});

test("editor casts preserve values and do not consume following expressions", () => {
	const r=preview(`function ui()->Canvas { var canvas:Canvas=new Canvas(undefined); var width=cast 80;
		var parent=canvas as Container; var label=new Label(parent,"Cast"); canvas.size(width+20,60); }`);
	assert.strictEqual(node(r,"canvas").width,100);
	assert.strictEqual(node(r,"label").parentId,node(r,"canvas").id);
});

test("incomplete editor function headers cannot leak controls from different functions", () => {
	for (const header of ["function broken(parent:)","function broken(parent:Canvas", "function broken(parent)->", "function broken(parent:Map<string,Thing)"]) {
		const r=preview(header+" { var leaked=new Canvas(undefined); }\nfunction second(){var other=new Canvas(undefined);}");
		assert.deepStrictEqual(r.entries,[]);
		assert.strictEqual(r.nodes.length,0);
		assert(r.diagnostics.some(d=>d.line>=2 && d.line<=3 && /Preview waits for valid source/.test(d.message)));
	}
});

test("an incomplete dependency reports its own source path and line", () => {
	const r = preview("function ui(){var canvas=new Canvas(undefined);gui_helper(canvas);}",{
		sourcePath:"scripts/main.gml",
		sourceFor(name){return name==="gui_helper" ? {path:"scripts/helper.gml",source:"// dependency\nfunction gui_helper(parent:) {var bad=new Canvas(undefined);}"} : null;}
	});
	assert(r.diagnostics.some(d=>d.sourcePath==="scripts/helper.gml" && d.line===2 && /Incomplete type/.test(d.message)));
	assert.strictEqual(r.nodes.length,1);
});

test("a remembered function that no longer builds UI falls back to a visual entry", () => {
	const r=preview("function old(){return 42;} function current(){var canvas=new Canvas(undefined);canvas.size(100,50);}",{entry:"old"});
	assert.strictEqual(r.entry,"current");
	assert.strictEqual(r.roots.length,1);
});

test("localized labels use real text before AUTO measurement and preserve English overrides", () => {
	const translations={"menu.family.tree":"Семейное древо","menu.tools.hint.clan":"Династия"};
	const options={localeLanguage:"Russian",localize:(key,english)=>english ? "Family Tree" : translations[key]};
	const r=preview(`function ui(){
		var label=new Label(undefined,LOCALE.text("menu.family.tree"));
		var title=new Label(undefined,locale_text("menu.tools.hint.clan"));
		var english=new Label(undefined,LOCALE.text_english("menu.family.tree"));
		var language=new Label(undefined,LOCALE.get_language_name());
	}`,options);
	assert.strictEqual(node(r,"label").text,"Семейное древо");
	assert.strictEqual(node(r,"title").text,"Династия");
	assert.strictEqual(node(r,"english").text,"Family Tree");
	assert.strictEqual(node(r,"language").text,"Russian");
	const literal=preview('function ui(){var label=new Label(undefined,"Семейное древо");}');
	assert.strictEqual(node(r,"label").width,node(literal,"label").width);
	assert.deepStrictEqual(r.diagnostics,[]);
});

test("localized formatting replaces named parameters literally and retains dynamic parameters", () => {
	const r=preview(`function ui(actor){
		var label=new Label(undefined,LOCALE.text_format("branch","name","$&","age",actor.age));
		var details=new Label(undefined,LOCALE.text_format_from_struct("branch",{name:"Анна",age:30}));
		var age=new Label(undefined,string("{0}. {1}",actor.role,LOCALE.text_format("age","age",28)));
	}`,{localize:key=>key==="branch" ? "{name}, {name}, {age} лет" : "{age} лет"});
	assert.strictEqual(node(r,"label").text,"$&, $&, {age} лет");
	assert.strictEqual(node(r,"details").text,"Анна, Анна, 30 лет");
	assert.strictEqual(node(r,"age").text,"{0}. 28 лет");
	assert(r.diagnostics.some(d=>/Dynamic text replacement \{age\}/.test(d.message)));
});

test("localization lookup failures retain visible keys and source diagnostics without aborting layout", () => {
	const r=preview(`function ui(){var missing=new Label(undefined,LOCALE.text("absent"));
		var broken=new Label(undefined,LOCALE.text("broken")); var fine=new Label(undefined,"Still visible");
	}`,{sourcePath:"scripts/menu.gml",localize:key=>{if(key==="broken")throw Error("invalid file");}});
	assert.strictEqual(node(r,"missing").text,"⟦absent⟧");
	assert.strictEqual(node(r,"broken").text,"⟦broken⟧");
	assert.strictEqual(node(r,"fine").text,"Still visible");
	assert(r.diagnostics.some(d=>d.sourcePath==="fixtures/locale-preview.gml" && d.line===2 && /Missing localization key absent/.test(d.message)));
});

test("hint headers and body translations use separate lookup callbacks", () => {
	const r=preview(`function ui(){
		var header=new Label(undefined,LOCALE.hints().get_header_by_hint_name("hint"));
		var body=new Label(undefined,LOCALE.hints().get_hint_by_hint_name("hint"));
	}`,{localize:key=>"Hint body",localizeHeader:key=>"Hint title"});
	assert.strictEqual(node(r,"header").text,"Hint title");
	assert.strictEqual(node(r,"body").text,"Hint body");
});

test("TextStyle retains the font resource, native size, alpha and SDF overrides", () => {
	const r=preview(`function ui(){
		var native=new Label(undefined,"Native"); native.style.text_style=new TextStyle(f_project, c_white, 0.5);
		var sdf=new Label(undefined,"SDF"); var style=new TextStyle(f_project, c_white, 0.8, false, 22, true);
		style.sdf_line_height=37; style.sdf_spread_size=12; style.sdf_line_y_correction=-2;
		sdf.style.text_style=style; sdf.alpha(0.5);
	}`,{scale:2,fontFor:name=>name==="f_project" ? {size:30} : null});
	assert.strictEqual(node(r,"native").style.fontResource,"f_project");
	assert.strictEqual(node(r,"native").style.fontSize,30*1.3333*2);
	assert.strictEqual(node(r,"native").style.fontSizeUnit,"native");
	const s=node(r,"sdf").style;
	assert.strictEqual(s.fontSize,44);assert.strictEqual(s.fontAlpha,0.4);
	assert.deepStrictEqual([s.sdfLineHeight,s.sdfSpread,s.sdfLineYCorrection],[37,12,-2]);
});

test("project font helpers preserve italic resources and isolated style clones", () => {
	const options={
		fontFor:name=>({size:32,italic:name==="font_italic",bold:name==="font_bold"}),
		setupSources:[{path:"fixtures/fonts-preview.gml",source:'/* @goowee-preview setup\nTheme={title:new TextStyle(font_bold,c_white,1,false,22)};\n*/'}],
		sourceFor:name=>name==="choose_typeface"?{path:"scripts/typeface.gml",source:'function choose_typeface(size,color){return new TextStyle(font_italic,color,1,false,size);}'}:null
	};
	const r=preview(`function ui(){
		var italic=new Label(undefined,"Italic");italic.style.text_style=choose_typeface(18,c_white);
		var clone=Theme.title.clone(c_red);clone.sdf_size_pt=30;clone.font=font_alternate;
		var copied=new Label(undefined,"Copy");copied.style.text_style=clone;
		var original=new Label(undefined,"Original");original.style.text_style=Theme.title;
	}`,options);
	assert.strictEqual(node(r,"italic").style.fontResource,"font_italic");
	assert.strictEqual(node(r,"italic").style.italic,true);
	assert.deepStrictEqual([node(r,"copied").style.fontResource,node(r,"copied").style.fontSize,node(r,"copied").style.color],["font_alternate",30,"#ff0000"]);
	assert.deepStrictEqual([node(r,"original").style.fontResource,node(r,"original").style.fontSize,node(r,"original").style.color],["font_bold",22,"#ffffff"]);
});

test("project source supplies SDF effect settings without helper-name recognition", () => {
	const helper=`function make_halo(radius,opacity=1) {
		return {dropShadowEnable:true,dropShadowSoftness:radius,dropShadowOffsetX:0,dropShadowOffsetY:2,
			dropShadowColour:c_black,dropShadowAlpha:opacity,custom_gain:clamp(radius/25,0.1,1)};
	}
	function choose_lettering(size,tint,effect) {
		var style=new TextStyle(font_soft,tint,0.75,false,size,true,effect);
		style.sdf_spread_size=12; return style;
	}`;
	const r=preview(`function ui(){
		var text=new Label(undefined,"Sample");
		text.style.text_style=choose_lettering(16,#7DA9D5,make_halo(18,0.6));
	}`,{sourceFor:name=>/^(?:make_halo|choose_lettering)$/.test(name)?{path:"fixtures/lettering.gml",source:helper}:null});
	const style=node(r,"text").style;
	assert.deepStrictEqual(style.sdfEffect,{dropShadowEnable:true,dropShadowSoftness:18,dropShadowOffsetX:0,
		dropShadowOffsetY:2,dropShadowColour:0,dropShadowAlpha:0.6,custom_gain:0.72});
	assert.deepStrictEqual([style.fontResource,style.fontSize,style.color,style.fontAlpha,style.nativeSdf,style.sdfSpread],
		["font_soft",16,"#7DA9D5",0.75,true,12]);
	assert(!r.diagnostics.some(d=>/SDF effect/.test(d.message)));
});

test("TextStyle effect getters, setters and clones retain project reference semantics", () => {
	const r=preview(`function ui(){
		var effect={glowEnable:true,glowStart:0,glowEnd:6,glowColour:Color.black};
		var style=new TextStyle(font_soft,c_white,1,false,16,true,effect);
		var clone=style.clone(c_red); clone.sdf_effect.glowEnd=9;
		var original=new Label(undefined,"Original");original.style.text_style=style;
		var shared=new Label(undefined,"Shared");shared.style.text_style=clone;
		var detached=clone.clone(); detached.sdf_effect={outlineEnable:true,outlineDistance:4};detached.is_native_sdf=false;
		var other=new Label(undefined,"Other");other.style.text_style=detached;
		var cleared=detached.clone();cleared.sdf_effect=undefined;
		var plain=new Label(undefined,"Plain");plain.style.text_style=cleared;
		var state=new Label(undefined,string(style.is_native_sdf)+":"+string(detached.is_native_sdf));
	}`);
	assert.deepStrictEqual(node(r,"original").style.sdfEffect,{glowEnable:true,glowStart:0,glowEnd:9,glowColour:"#000000"});
	assert.deepStrictEqual(node(r,"shared").style.sdfEffect,node(r,"original").style.sdfEffect);
	assert.strictEqual(node(r,"original").style.color,"#ffffff");assert.strictEqual(node(r,"shared").style.color,"#ff0000");
	assert.deepStrictEqual(node(r,"other").style.sdfEffect,{outlineEnable:true,outlineDistance:4});
	assert.strictEqual(node(r,"other").style.nativeSdf,false);
	assert.strictEqual(node(r,"plain").style.sdfEffect,undefined);
	assert.strictEqual(node(r,"state").text,"true:false");
});

test("constructor effect structs serialize scalar values and unresolved fields produce diagnostics", () => {
	const r=preview(`function Effect() constructor {
		dropShadowEnable=true;dropShadowColour=c_black;dropShadowSoftness=5;
		static calculate=function(){return 2;};
	}
	function ui(){
		var effect=new Effect();effect.dropShadowSoftness=effect.calculate();
		var text=new Label(undefined,"Effect");text.style.text_style=new TextStyle(font_soft,c_white,1,false,16,true,effect);
		var unresolved=new Label(undefined,"Unresolved");
		unresolved.style.text_style=new TextStyle(font_soft,c_white,1,false,16,true,{glowEnable:true,glowEnd:live_amount});
	}`);
	assert.deepStrictEqual(node(r,"text").style.sdfEffect,{dropShadowEnable:true,dropShadowColour:0,dropShadowSoftness:2});
	assert.strictEqual(node(r,"text").approximate,false);
	assert.deepStrictEqual(node(r,"unresolved").style.sdfEffect,{glowEnable:true});
	assert(r.diagnostics.some(d=>/SDF effect field glowEnd/.test(d.message)));
	assert(node(r,"unresolved").approximate);
	assert.doesNotThrow(()=>JSON.stringify(r));
});

test("label horizontal text clipping and draw offsets use their canvas render scale", () => {
	const r=preview(`function ui(){
		var root=new Canvas(undefined);root.size(200,100);root.set_render_scale(1.5);
		var text=new Label(root,"Sample");text.size(100,30);text.text_clip_width=11;text.text_draw_offset_x=-3;
		var fixed=new Canvas(undefined);fixed.size(200,100);fixed.set_render_scale(1.5);fixed.disable_affect_by_gui_scale();
		var fixed_text=new Label(fixed,"Sample");fixed_text.size(100,30);fixed_text.text_clip_width=11;fixed_text.text_draw_offset_x=4;
	}`,{scale:2});
	assert.deepStrictEqual([node(r,"text").style.textClipWidth,node(r,"text").style.textDrawOffsetX],[33,-9]);
	assert.deepStrictEqual([node(r,"fixed_text").style.textClipWidth,node(r,"fixed_text").style.textDrawOffsetX],[16.5,6]);
	assert.deepStrictEqual([node(r,"text").width,node(r,"fixed_text").width],[100,100]);
});

test("horizontal stack measures AUTO children and preserves their order", () => {
	const r = preview(`function ui() {
		var stack = new StackPanel(undefined); stack.size(AUTO(1),AUTO(1)); stack.orientation(Orientation.horizontal); stack.padding(4,2,4,2);
		var first = new Button(stack); first.size(30,20); first.margin(0,0,6,0);
		var second = new Button(stack); second.size(40,25);
	}`);
	assert.deepStrictEqual([node(r,"stack").width,node(r,"stack").height], [84,29]);
	assert.deepStrictEqual([node(r,"first").x,node(r,"second").x], [4,40]);
});

test("wrapping starts a new row at the available width", () => {
	const r = preview(`function ui() {
		var wrap = new WrapPanel(undefined); wrap.size(100,100); wrap.orientation(Orientation.horizontal);
		for(var i=0;i<3;i++){ var item = new Button(wrap); item.size(60,20); }
	}`);
	assert.deepStrictEqual(r.nodes.slice(1).map(n => [n.x,n.y]), [[0,0],[0,20],[0,40]]);
});

test("same-file helper calls bind parent arguments and select entries", () => {
	const r = preview(`function first() { var a = new Canvas(undefined); a.size(200,100); add_label(a); }
	function add_label(parent) { var caption = new Label(parent,"helper"); }
	function second() { var b = new Button(undefined); b.size(75,50); }`, {entry:"first"});
	assert.strictEqual(node(r,"caption").parentId, node(r,"a").id);
	assert(r.entries.some(e=>e.name === "second"));
	assert(!r.nodes.some(n=>n.name === "b"));
});

test("constructor self methods and deferred build helpers affect the root", () => {
	const r = preview(`function gw_Card(parent) : gw_Button(parent) constructor {
		static build = function() { size(180,80); var text = new Label(self,"Card"); text.margin(8,8,0,0); }
		build();
	}`);
	assert.deepStrictEqual([r.roots[0].width,r.roots[0].height],[180,80]);
	assert.strictEqual(node(r,"text").parentId,r.roots[0].id);
});

test("constructor static methods are callable before declaration and retain each receiver", () => {
	const r = preview(`function CaptionButton(parent, value) : Button(parent) constructor {
		caption = value;
		var text = new Label(self, read_caption());
		static read_caption = function() { return caption; };
	}
	function menu() {
		var root = new Canvas(undefined); root.size(400,200);
		var first = new CaptionButton(root, "First");
		var second = new CaptionButton(root, "Second");
		first.caption = "Updated";
		var after = new Label(root, first.read_caption() + "/" + second.read_caption());
	}`, {entry:"menu"});
	assert.deepStrictEqual(r.nodes.filter(n=>n.name==="text").map(n=>n.text),["First","Second"]);
	assert.strictEqual(node(r,"after").text,"Updated/Second");
	assert.deepStrictEqual(r.diagnostics,[]);
});

test("derived constructor methods override inherited methods before body calls", () => {
	const r = preview(`function BasePart(parent) : Button(parent) constructor {
		caption = "Base";
		var base_text = new Label(self, read_caption());
		static read_caption = function() { return caption; };
	}
	function DerivedPart(parent) : BasePart(parent) constructor {
		caption = "Child";
		var child_text = new Label(self, read_caption());
		static read_caption = function() { return "Derived " + caption; };
	}
	function menu() { var part = new DerivedPart(undefined); }`, {entry:"menu"});
	assert.strictEqual(node(r,"base_text").text,"Base");
	assert.strictEqual(node(r,"child_text").text,"Derived Child");
	assert.deepStrictEqual(r.diagnostics,[]);
});

test("forward static binding does not replay declarations or hoist ordinary work", () => {
	const r = preview(`function Widget(parent) : Button(parent) constructor {
		caption = "Ready";
		read_caption = function() { return "Instance " + caption; };
		var before = new Label(self, read_caption());
		static read_caption = function() { return "Default"; };
		var after = new Label(self, read_caption());
		if (false) { static conditional = function() { var leaked = new Label(self,"Hidden"); }; }
	}
	function menu() { var part = new Widget(undefined); }`, {entry:"menu"});
	assert.strictEqual(node(r,"before").text,"Instance Ready");
	assert.strictEqual(node(r,"after").text,"Instance Ready");
	assert(!r.nodes.some(n=>n.name==="leaked"));
	assert.deepStrictEqual(r.diagnostics,[]);
});

test("sprite metadata supplies intrinsic size and macro expressions", () => {
	const r = preview(`#macro CARD_W (sprite_get_width(s_card)*0.5)\r
	function ui() { var card = new Image(undefined,new SpriteImage(s_card,2,c_white,0.4)); card.size(ABSV(CARD_W),AUTOV(0.5)); }`, {assets:{s_card:{width:300,height:200}}});
	assert.deepStrictEqual([node(r,"card").width,node(r,"card").height],[150,100]);
	assert.deepStrictEqual([node(r,"card").sprite.name,node(r,"card").sprite.index,node(r,"card").sprite.alpha], ["s_card",2,0.4]);
});

test("project macros resolve lazily and cycles remain bounded", () => {
	const r = preview('function ui(){var a=new Button(undefined); a.size(ABSV(WIDTH),ABSV(CYCLE_A));}', {macros:{WIDTH:"BASE * 2",BASE:"60",CYCLE_A:"CYCLE_B",CYCLE_B:"CYCLE_A"}});
	assert.strictEqual(node(r,"a").width,120);
	assert(r.diagnostics.some(d=>/Dynamic size/.test(d.message)));
});

test("unit getters return named structs and image clones retain dimensions", () => {
	const r = preview(`function ui(){
	var image = new SpriteImage(s_card,1,c_white,1,false,2);
	var first = new Image(undefined,image.clone());
	first.size(ABSV(100),ABSV(60));
	var second = new Image(undefined,image); second.size(first.size().width,AUTO(1));
	}`,{assets:{s_card:{width:300,height:200}}});
	assert.strictEqual(node(r,"first").sprite.name,"s_card");
	assert.deepStrictEqual([node(r,"second").width,node(r,"second").height],[100,200]);
});

test("label view scale applies once, black text and sprite style fields survive", () => {
	const r=preview(`function ui(){var text=new Label(undefined,"abcd");text.style.text_style=new TextStyle(fnt_ui,0,1,false,20);
	text.style.sprite_is_flip_horizontal=true;text.style.angle=30;}`,{scale:2});
	const n=node(r,"text"); assert.strictEqual(n.width,88); assert.strictEqual(n.height,50);
	assert.strictEqual(n.style.color,"#000000"); assert.strictEqual(n.style.fontSize,40); assert.strictEqual(n.style.flipHorizontal,true);assert.strictEqual(n.style.angle,30);
});

test("callbacks do not leak future or hidden controls into construction", () => {
	const r = preview(`function ui() {
		var b = new Button(undefined); b.size(100,30);
		b.click.add(method({b}, function() { var future = new Label(b,"do not render"); }));
		var bind = new DataBind(function() { b.size(500,500); });
	}`);
	assert.strictEqual(r.nodes.length,1); assert.strictEqual(r.nodes[0].width,100);
});

test("dynamic loops show one exemplar with a diagnostic and static loops are capped", () => {
	const r = preview('function ui(data){for(var i=0;i<array_length(data);i++){var item=new Label(undefined,data[i]);}}');
	assert.strictEqual(r.nodes.length,1);
	assert(r.diagnostics.some(d=>/one example/.test(d.message)));
	const capped = preview('function ui(){repeat(1000000){var item=new Button(undefined);}}');
	assert.strictEqual(capped.nodes.length,64);
	assert(capped.diagnostics.some(d=>/capped/.test(d.message)));
});

test("scroll content creates an attached child container", () => {
	const r = preview('function ui(){ var scroll=new DragScroll(undefined,ABSV(400),ABSV(250)); var b=new Button(scroll.content);b.size(50,30); }');
	assert.strictEqual(node(r,"b").parentId,node(r,"content").id);
	assert.deepStrictEqual([node(r,"scroll").width,node(r,"scroll").height],[400,250]);
});

test("a static loop exactly at the preview budget is complete rather than reported as truncated", () => {
	for(const statement of ["repeat(64)","for(var i=0;i<64;i++)"]){
		const result=preview('function ui(){'+statement+'{var item=new Button(undefined);}}');
		assert.strictEqual(result.nodes.length,64);
		assert(!result.diagnostics.some(note=>/capped/.test(note.message)),statement);
	}
	const overflow=preview('function ui(){for(var i=0;i<65;i++){var item=new Button(undefined);}}');
	assert.strictEqual(overflow.nodes.length,64);
	assert(overflow.diagnostics.some(note=>/capped/.test(note.message)));
});

test("colors, visibility and source lines survive analysis", () => {
	const r = preview(`function ui(){
	var text = new Label(undefined,"hello");
	text.style.text_style=new TextStyle(f_label,#7DA9D5,1,false,22);
	text.style.text_alignment.horizontal=Align.right;
	text.draw_disable();
	}`);
	const label=node(r,"text");
	assert.strictEqual(label.style.color,"#7DA9D5"); assert.strictEqual(label.style.fontSize,22);
	assert.strictEqual(label.style.alignH,2); assert.strictEqual(label.hidden,true); assert.strictEqual(label.line,3);
	const aliases=preview('function ui(){var a=new Image(undefined,new SpriteImage(s_icon,0,Color.red,1,false,1,0.5));}');
	assert.strictEqual(aliases.nodes[0].sprite.color,"#ff0000");assert.strictEqual(aliases.nodes[0].sprite.scale9,0.5);
});

test("arbitrary JavaScript, property constructors and filesystem names cannot execute", () => {
	global.__gooweeEngineProbe = false;
	const r = preview('function ui(){var x=new Button(undefined); require("fs").writeFileSync("not-created","x"); global.__gooweeEngineProbe=true; x.__proto__.polluted=true; x.constructor("return process")(); }');
	assert.strictEqual(global.__gooweeEngineProbe,false); assert.strictEqual({}.polluted,undefined); assert.strictEqual(r.nodes.length,1);
	delete global.__gooweeEngineProbe;
});

test("recursive helpers and partial editor syntax remain bounded", () => {
	const start=Date.now();
	const r=preview('function ui(){ var b=new Button(undefined); recurse(); } function recurse(){recurse();}');
	assert(Date.now()-start<2000); assert(r.diagnostics.some(d=>/Recursive/.test(d.message)));
	assert.doesNotThrow(()=>preview('function ui(){var a=new Button(undefined); a.size(ABS(10), '));
});

test("extreme layout positions stay finite through resolved custom layout callbacks", () => {
	const r=preview('function ui(){var a=new Canvas(undefined);a.size(200,100);a.margin(1e308,-1e308,0,0);var b=new Image(a);b.margin(1e308,1e308,0,0);a.get_base_layout=method({a},function(){return a.layout;});}');
	assert(r.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&Math.abs(n.x)<=1000000&&Math.abs(n.y)<=1000000));
	assert(r.diagnostics.some(d=>/clamped/.test(d.message)));
	assert(!r.diagnostics.some(d=>/Custom get_base_layout/.test(d.message)), "A resolved layout callback must not be reported as omitted");
});

test("project setup finishes before active hints even when it loads another source", () => {
	const r=preview(`/* @goowee-preview setup
		preview_args([ready]);
	*/
	function menu(caption){var label=new Label(undefined,caption);}`,{
		setupSources:[{path:".goowee-preview.gml",source:`/* @goowee-preview setup
			ready="partial";var values=new Settings();ready="complete";
		*/`}],
		sourceFor:name=>name==="Settings"?{path:"scripts/settings.gml",source:"function Settings() constructor {value=1;}"}:null
	});
	assert.strictEqual(node(r,"label").text,"complete");
	assert.strictEqual(r.previewHints,2);
	assert.deepStrictEqual(r.diagnostics,[]);
});

test("macros read initialized and subsequently changed preview globals", () => {
	const r=preview(`#macro CURRENT global.current
	/* @goowee-preview setup global.current="First"; */
	function menu(){var first=new Label(undefined,CURRENT);
		/* @goowee-preview code global.current="Second"; */
		var second=new Label(undefined,CURRENT);
	}`);
	assert.strictEqual(node(r,"first").text,"First");
	assert.strictEqual(node(r,"second").text,"Second");
});

test("GooWee input defaults do not make every button appear hovered or pressed", () => {
	const r=preview(`function menu(){var button=new Button(undefined);button.size(120,40);
		var caption=new Label(button,"Visible caption");
		var close=new Image(button,new SpriteImage(s_close));
		caption.draw_set_enable(!button.is_hover && !button.is_down && !button.is_down_right && button.is_enabled);
		close.draw_set_enable(button.is_hover || button.is_disabled_to_press);
		button.disable();var disabled=new Label(button,string(button.is_enabled));
	}`);
	assert.strictEqual(node(r,"caption").hidden,false);
	assert.strictEqual(node(r,"close").hidden,true);
	assert.strictEqual(node(r,"disabled").text,"false");
});

test("active source aliases cannot replay saved hints or overwrite unsaved functions", () => {
	const r=preview(`/* @goowee-preview setup preview_note("active setup"); */
	function caption(){return "Unsaved";}
	function menu(){var dependency=Missing.VALUE;var label=new Label(undefined,caption());}`,{
		entry:"menu",sourcePath:"C:/Project/scripts/menu.gml",sourceAliases:["scripts/menu.gml"],
		sourceFor:name=>name==="Missing"?{path:"scripts\\menu.gml",source:`/* @goowee-preview setup preview_note("saved setup"); */
			function caption(){return "Saved";} enum Missing {VALUE}`}:null
	});
	assert.strictEqual(node(r,"label").text,"Unsaved");
	assert.strictEqual(r.previewHints,1);
	assert.strictEqual(r.diagnostics.filter(note=>note.message==="active setup").length,1);
	assert(!r.diagnostics.some(note=>note.message==="saved setup"));
});

test("switch cases preserve fallthrough, break, default and enclosing return", () => {
    const source = `#import "games.keevee.gw"
    function caption(choice) {
        var text="";
        switch(choice) {
            case 1: text="One";
            case 2: text+="Two"; break;
            default: return "Fallback";
        }
        return text;
    }
    function menu() {
        var first=new Label(undefined,caption(1));
        var second=new Label(undefined,caption(2));
        var third=new Label(undefined,caption(9));
    }`;
    const scene=engine.analyze(source,{entry:"menu"});
    assert.deepStrictEqual(scene.nodes.map(node=>node.text),["OneTwo","Two","Fallback"]);
    assert.deepStrictEqual(scene.diagnostics,[]);
});

test("coalescing assignment is lazy and string helpers preserve caption words", () => {
    const scene=engine.analyze(`#import "games.keevee.gw"
    function menu() {
        var color=undefined; color ??= #123456; color ??= unavailable_call();
        var words=string_split("A  B", " ", false);
        var label=new Label(undefined,string_insert("!",words[0],2)+words[1]+words[2]+string(sign(-10)));
        label.style.text_style=new TextStyle(undefined,color);
    }`);
    assert.strictEqual(scene.nodes[0].text,"A!B-1");
    assert.strictEqual(scene.nodes[0].style.color,"#123456");
    assert(!scene.diagnostics.some(note=>/unavailable_call/.test(note.message)));
});

test("direct GooWee image replacement updates its rendered sprite", () => {
    const scene=engine.analyze(`#import "games.keevee.gw"
    function menu() {var image=new Image(undefined,s_original); image._sprite_image=new SpriteImage(s_replacement,2);}`,
        {assets:{s_original:{width:10,height:10},s_replacement:{width:20,height:30}}});
    assert.strictEqual(scene.nodes[0].sprite.name,"s_replacement");
    assert.strictEqual(scene.nodes[0].sprite.index,2);
    assert.deepStrictEqual([scene.nodes[0].width,scene.nodes[0].height],[20,30]);
    const changed=engine.analyze(`#import "games.keevee.gw"
    function menu() {var image=new Image(undefined,s_original); image._sprite_image.sprite=s_replacement; image.size(ABS(sprite_get_width(image.sprite().sprite)),AUTO(1));}`,
        {assets:{s_original:{width:10,height:10},s_replacement:{width:20,height:30}}});
    assert.strictEqual(changed.nodes[0].sprite.name,"s_replacement");
    assert.deepStrictEqual([changed.nodes[0].width,changed.nodes[0].height],[20,30]);
});

test("source text wrapping can measure the selected font and edit characters", () => {
    const scene=engine.analyze(`#import "games.keevee.gw"
    function menu() {
        draw_set_font(f_demo);
        var text=string_delete("AB CD",3,1);
        var label=new Label(undefined,string_char_at(text,3));
        label.size(ABS(string_width(text)),ABS(string_height(text)));
    }`, {fontFor:name=>({name,size:18}),measureText:(text,style)=>({width:text.length*(style.fontResource==="f_demo"?10:1),height:18})});
    assert.strictEqual(scene.nodes[0].text,"C");
    assert.deepStrictEqual([scene.nodes[0].width,scene.nodes[0].height],[40,18]);
    assert.deepStrictEqual(scene.diagnostics,[]);
});

console.log(count + " GooWee engine tests passed.");
