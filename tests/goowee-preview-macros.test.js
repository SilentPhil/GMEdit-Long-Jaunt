"use strict";
const assert=require("assert");
const engine=require("../bin/resources/app/plugins/goowee-preview/preview-engine.js");
let count=0;
function test(name,body){body();count++;console.log("ok - "+name);}
const preamble='#import "games.keevee.gw"\n';
const fragments={take_member_mf0:"method(",take_member_mf1:",",take_member_mf2:".",take_member_mf3:")"};
const model='function SampleRecord(value) constructor { stored=value; static read=function() { return stored; }; }\n';
function preview(source,options={}){return engine.analyze(preamble+source,{entry:"menu",...options});}
function texts(scene){return scene.nodes.filter(node=>node.type==="Label").map(node=>node.text);}
function clean(scene){assert.deepStrictEqual(scene.diagnostics,[]);}

test("indexed token macros construct real bound callbacks without project names",()=>{
    const scene=preview(model+`function menu() {
        var owner=new SampleRecord("From indexed fragments");
        var callback=take_member_mf0 owner take_member_mf1 owner take_member_mf2 read take_member_mf3;
        new Label(undefined,callback());
    }`,{macros:fragments});
    assert.deepStrictEqual(texts(scene),["From indexed fragments"]);clean(scene);
});

test("editor macro-function calls use indexed argument order and nested arguments",()=>{
    const scene=preview(model+`function menu() {
        var owner=new SampleRecord("From editor macro");
        var callback=take_member(owner,read);
        new Label(undefined,callback());
        var later=make_getter(string([10,20][1]));
        new Label(undefined,later());
    }`,{macros:{...fragments,make_getter_mf0:"function() { return ",make_getter_mf1:"; }"},
        macroFunctions:{take_member:{args:["object","member"],order:[0,0,1]},make_getter:{args:["value"],order:[0]}}});
    assert.deepStrictEqual(texts(scene),["From editor macro","20"]);clean(scene);
});

test("local saved macro definitions and metadata apply before their declaration",()=>{
    const scene=preview(`function menu() {
        var get_value=local_getter("Local metadata");
        new Label(undefined,get_value());
    }
    //!#mfunc local_getter {"args":["value"],"order":[0]}
    #macro local_getter_mf0 function() { return
    #macro local_getter_mf1 ; }
    `);
    assert.deepStrictEqual(texts(scene),["Local metadata"]);clean(scene);
});

test("macro expansion preserves compact-tag attachment and original source lines",()=>{
    const source=`function menu() {
        var value=wrap_mf0 "original" wrap_mf1; // @preview value "Tagged"
        new Label(undefined,value);
        var callback=make_getter("ignored"); // @preview value function() { return "After call"; }
        new Label(undefined,callback());
    }`;
    const scene=preview(source,{macros:{wrap_mf0:"(",wrap_mf1:")",make_getter_mf0:"function() { return",make_getter_mf1:";}"},macroFunctions:{make_getter:{args:["value"],order:[0]}}});
    assert.deepStrictEqual(texts(scene),["Tagged","After call"]);clean(scene);
    assert.strictEqual(scene.nodes[0].line,4);assert.strictEqual(scene.nodes[1].line,6);
});

test("nested fragment expansion skips strings and ordinary comments",()=>{
    const scene=preview(`function menu() {
        // inner_mf0 does not expand here.
        new Label(undefined,outer_mf0 "text" outer_mf1);
        new Label(undefined,"outer_mf0 literal");
    }`,{macros:{outer_mf0:"inner_mf0",outer_mf1:"inner_mf1",inner_mf0:"(",inner_mf1:")"}});
    assert.deepStrictEqual(texts(scene),["text","outer_mf0 literal"]);clean(scene);
});

test("nested calls to the same editor macro are distinct bounded expansions",()=>{
    const scene=preview('function menu() { new Label(undefined,join_text(join_text("a","b"),"c")); }',{
        macros:{join_text_mf0:"(",join_text_mf1:"+",join_text_mf2:")"},macroFunctions:{join_text:{args:["first","second"],order:[0,1]}}
    });
    assert.deepStrictEqual(texts(scene),["abc"]);clean(scene);
});

test("dependency parsing and preview hints share indexed token macros",()=>{
    const dependency={path:"scripts/components.gml",source:model+`function shared_widget(parent) {
        var owner=new SampleRecord("Dependency");
        var callback=take_member_mf0 owner take_member_mf1 owner take_member_mf2 read take_member_mf3;
        return new Label(parent,callback());
    }`};
    const scene=preview(`function menu() {
        var root=new Canvas(undefined);
        shared_widget(root);
        var label=new Label(root,"runtime"); // @preview arg 1 = wrap_mf0 "Hint" wrap_mf1
    }`,{macros:{...fragments,wrap_mf0:"(",wrap_mf1:")"},sourceFor:name=>name==="shared_widget"?dependency:null});
    assert.deepStrictEqual(texts(scene),["Dependency","Hint"]);clean(scene);
    assert.strictEqual(scene.nodes.find(node=>node.text==="Dependency").sourcePath,dependency.path);
});

test("recursive or incomplete macro definitions produce bounded source diagnostics",()=>{
    const recursive=preview('function menu() { new Label(undefined,bad_mf0); }',{sourcePath:"scripts/loop.gml",macros:{bad_mf0:"other_mf0",other_mf0:"bad_mf0"}});
    assert.strictEqual(recursive.nodes.length,0);
    assert(recursive.diagnostics.some(note=>/Recursive token macro/.test(note.message) && note.line===2 && note.sourcePath==="scripts/loop.gml"));
    const missing=preview('function menu() { new Label(undefined,missing("value")); }',{macroFunctions:{missing:{args:["value"],order:[0]}}});
    assert(missing.diagnostics.some(note=>/Missing token macro missing_mf0/.test(note.message)));
});

test("ordinary statement macros share caller locals, loops and return control flow",()=>{
    const scene=preview(`function collect(items) {
        PICK_BEGIN
            if (item.amount > 0) { PICK_ITEM }
        PICK_END
    }
    function menu() {
        var items=collect([{caption:"Compass",amount:2},{caption:"Empty",amount:0},{caption:"Lantern",amount:1}]);
        for(var i=0;i<array_length(items);i++) new Label(undefined,items[i]);
    }
    #macro PICK_BEGIN var selected=[]; for(var j=0;j<array_length(items);j++) { var item=items[j];
    #macro PICK_ITEM array_push(selected,item.caption);
    #macro PICK_END } return selected;
    `);
    assert.deepStrictEqual(texts(scene),["Compass","Lantern"]);clean(scene);
});

test("statement aliases and indexed expression objects expand transitively",()=>{
    const scene=preview(`function menu() {
        INITIALIZE
        CHECK_VISIBLE
        new Label(undefined,caption);
    }`,{macros:{INITIALIZE:{expr:"MAKE_STATE"},MAKE_STATE:'var caption="Shared state"; var is_visible=true;',CHECK_VISIBLE:"if (is_visible)"}});
    assert.deepStrictEqual(texts(scene),["Shared state"]);clean(scene);
});

test("ordinary expression macros preserve exact call-path overrides",()=>{
    const scene=preview(`/* @goowee-preview setup
        preview_override("DATA_SERVICE.caption",function(){return "Overridden";});
    */
    function menu() {
        DECLARE_TITLE
        new Label(undefined,title);
    }`,{macros:{DATA_SERVICE:"global.unavailable_service",DECLARE_TITLE:"var title=DATA_SERVICE.caption();"}});
    assert.deepStrictEqual(texts(scene),["Overridden"]);clean(scene);
});

test("statement macro nodes preserve call-site locations and compact annotations",()=>{
    const scene=preview(`function menu() {
        CREATE_CAPTION // @preview arg 1 = "Tagged macro"
        new Label(undefined,"Following");
    }`,{macros:{CREATE_CAPTION:'new Label(undefined,"Original");'}});
    assert.deepStrictEqual(texts(scene),["Tagged macro","Following"]);clean(scene);
    assert.strictEqual(scene.nodes[0].line,3);assert.strictEqual(scene.nodes[1].line,4);
});

test("statement expansion ignores punctuation and identifiers inside strings",()=>{
    const scene=preview(`function menu() {
        // DECLARE does not expand in comments.
        DECLARE
        new Label(undefined,"DECLARE");
        new Label(undefined,STRING_VALUE);
    }`,{macros:{DECLARE:'new Label(undefined,"Literal ; { return }");',STRING_VALUE:'"if; { DECLARE }"'}});
    assert.deepStrictEqual(texts(scene),["Literal ; { return }","DECLARE","if; { DECLARE }"]);clean(scene);
});

test("statement macros defined in dependency source expand its method bodies",()=>{
    const dependency={path:"scripts/selection.gml",source:`function choose_label(parent) {
        SET_CAPTION
        return new Label(parent,caption);
    }
    #macro SET_CAPTION var caption="Dependency statement";
    `};
    const scene=preview('function menu() { choose_label(undefined); }',{sourceFor:name=>name==="choose_label"?dependency:null});
    assert.deepStrictEqual(texts(scene),["Dependency statement"]);clean(scene);
    assert.strictEqual(scene.nodes[0].sourcePath,dependency.path);
});

test("statement macro cycles, depth and output size remain bounded",()=>{
    const recursive=preview('function menu() { START }',{sourcePath:"scripts/cycle.gml",macros:{START:"NEXT",NEXT:"START;"}});
    assert(recursive.diagnostics.some(note=>/Recursive token macro/.test(note.message) && note.line===2 && note.sourcePath==="scripts/cycle.gml"));
    const aliases={STEP_35:'new Label(undefined,"Never reached");'};
    for(let i=0;i<35;i++)aliases["STEP_"+i]="STEP_"+(i+1);
    const deep=preview('function menu() { STEP_0 }',{macros:aliases});
    assert(deep.diagnostics.some(note=>/Macro expansion depth limit/.test(note.message)));
    const doubles={DOUBLE_0:"1;"};
    for(let i=1;i<=17;i++)doubles["DOUBLE_"+i]="DOUBLE_"+(i-1)+" DOUBLE_"+(i-1);
    const wide=preview('function menu() { DOUBLE_17 }',{macros:doubles});
    assert(wide.diagnostics.some(note=>/Macro expansion token limit/.test(note.message)));
});

console.log(count+" GooWee macro expansion tests passed.");
