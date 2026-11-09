"use strict";
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const {create} = require("../bin/resources/app/plugins/goowee-preview/project-localization");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "goowee-localization-unit-"));
let count = 0, fixtureIndex = 0;
function test(name, fn) { fn(); count++; console.log("ok - " + name); }
function fixture(definition, files, external) {
    const dir = path.join(temporary, "project-" + ++fixtureIndex), localeDir = external ? path.join(temporary,"external-"+fixtureIndex) : path.join(dir,"datafiles/localization");
    fs.mkdirSync(localeDir,{recursive:true}); fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(localeDir,"locale_definition.json"),typeof definition === "string" ? definition : JSON.stringify(definition));
    for(const [name,source] of Object.entries(files || {})) { const file=path.join(localeDir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source); }
    const reads = Object.create(null), project={dir,readTextFileSync(relative) {
        const full=path.join(dir,relative), text=fs.readFileSync(full,"utf8"); reads[full]=(reads[full]||0)+1; return text;
    }};
    return {project,dir:localeDir,reads};
}
function common(files) {return {locales:{English:{locale:"en-US",caption:"English",files:files || [{filePath:"localization/main.csv"}]},Russian:{locale:"ru-RU",caption:"Русский",fallbackLocale:"ru"}}};}

test("definition metadata is lazy, supports trailing commas and preserves string contents",()=>{
    const f=fixture('\uFEFF{ // definition\n "locales": { "English": {"caption":"A,] https://example.test/*literal*/", "files":[{"filePath":"main.csv"},],}, "Russian":{"caption":"Русский",},},}',{"main.csv":"Key,English,Russian\nhello,Hello,Привет\n"});
    const adapter=create(f.project,{language:"Russian"}), info=adapter.info();
    assert.deepStrictEqual(info.languages.map(x=>x.id),["English","Russian"]);
    assert.strictEqual(info.languages[0].caption,"A,] https://example.test/*literal*/");
    assert.strictEqual(Object.keys(f.reads).length,1,"Reading language choices must not parse the CSV tables");
    assert.strictEqual(adapter.lookup("hello"),"Привет");
    assert.strictEqual(adapter.lookup("hello",true),"Hello");
    assert.strictEqual(info.error,null);
});

test("project-relative directory, datafiles-style paths and shared-file caching work together",()=>{
    const f=fixture(common(),{"main.csv":"Key,English,Russian\nhello,Hello,Привет\n"});
    const adapter=create(f.project,{directory:"datafiles/localization",language:"Russian"});
    assert.strictEqual(adapter.lookup("hello"),"Привет");
    for(let i=0;i<20;i++) assert.strictEqual(adapter.lookup("hello",true),"Hello");
    assert.strictEqual(f.reads[path.join(f.dir,"main.csv")],1,"Shared CSV is read once for both selected and English columns");
    assert.strictEqual(adapter.info().directory,f.dir);
});

test("an absolute external directory works with definition-relative CSV files",()=>{
    const f=fixture(common([{filePath:"main.csv"}]),{"main.csv":"Key,English,Russian\nhello,External,Внешний\n"},true);
    const adapter=create(f.project,{directory:f.dir,language:"Russian"});
    assert.strictEqual(adapter.lookup("hello"),"Внешний");
    assert.strictEqual(adapter.info().definitionPath,path.join(f.dir,"locale_definition.json"));
});

test("quoted commas, escaped quotes, multiline cells and BOM retain the original text",()=>{
    const f=fixture(common(),{"main.csv":'\uFEFFKey,English,Russian\r\nquote,"Hello, ""friend""","Привет, ""друг"""\r\nmulti,"First\r\nSecond","Первая\r\nВторая"\r\nlast,Final,Последняя'});
    const adapter=create(f.project,{language:"Russian"});
    assert.strictEqual(adapter.lookup("quote"),'Привет, "друг"');
    assert.strictEqual(adapter.lookup("multi"),"Первая\nВторая");
    assert.strictEqual(adapter.lookup("last"),"Последняя");
});

test("empty cells fall back to English and duplicate keys keep the first nonempty entry",()=>{
    const f=fixture(common([{filePath:"main.csv"},{filePath:"extra.csv"}]),{
        "main.csv":"Key,English,Russian,English - final\nblank,English fallback,,Wrong final column\ndup,First,Первый,Final\ndup,Second,Второй,Final\nlate,Base,,Final\nlate,Later,Поздний,Final\n",
        "extra.csv":"Key,English,Russian\ndup,Third,Третий\n"
    });
    const adapter=create(f.project,{language:"Russian"});
    assert.strictEqual(adapter.lookup("blank"),"English fallback");
    assert.strictEqual(adapter.lookup("dup"),"Первый");
    assert.strictEqual(adapter.lookup("late"),"Поздний");
    assert.strictEqual(adapter.lookup("missing"),undefined);
});

test("parseFirst and the last explicit files list determine inheritance",()=>{
    const definition={parseFirst:"English",locales:{Russian:{caption:"Русский"},English:{files:[{filePath:"base.csv"}]},Czech:{files:[{filePath:"other.csv"}]},French:{}}};
    const f=fixture(definition,{"base.csv":"Key,English,Russian,French\nx,Base English,Базовый,Wrong French\n","other.csv":"Key,Czech,French\nx,Česky,Français\n"});
    assert.strictEqual(create(f.project,{language:"Russian"}).lookup("x"),"Базовый");
    assert.strictEqual(create(f.project,{language:"French"}).lookup("x"),"Français");
});

test("custom CSV delimiters and quotes follow the file arguments",()=>{
    const f=fixture(common([{filePath:"custom.csv",arguments:[";","'"]}]),{"custom.csv":"Key;English;Russian\nx;'one; two';'один; два'\nq;English;'it''s quoted'\n"});
    const adapter=create(f.project,{language:"Russian"});
    assert.strictEqual(adapter.lookup("x"),"один; два");
    assert.strictEqual(adapter.lookup("q"),"it's quoted");
});

test("hint headers and bodies are separate and both support English fallback",()=>{
    const f=fixture(common([{filePath:"hints.csv",isHints:true}]),{"hints.csv":'Key,English,Russian\nhint,"Header\nBody one\nBody two","Заголовок\nТело"\nempty,Only header,\n'});
    const adapter=create(f.project,{language:"Russian"});
    assert.strictEqual(adapter.lookupHeader("hint"),"Заголовок");
    assert.strictEqual(adapter.lookup("hint"),"Тело");
    assert.strictEqual(adapter.lookup("hint",true),"Body one\nBody two");
    assert.strictEqual(adapter.lookupHeader("empty"),"Only header");
    assert.strictEqual(adapter.lookup("empty"),"");
});

test("text normalization preserves format tokens and literal safe dictionary keys",()=>{
    const f=fixture(common(),{"main.csv":"Key,English,Russian\nformat,Hello {who},Привет<nbsp>{who}\nicon,<icon_gold>,<icon_gold>\n__proto__,Prototype,Прототип\nconstructor,Constructor,Конструктор\n"});
    const adapter=create(f.project,{language:"Russian"});
    assert.strictEqual(adapter.lookup("format"),"Привет\u00a0{who}");
    assert.strictEqual(adapter.lookup("icon"),"<icon=gold></icon>");
    assert.strictEqual(adapter.lookup("__proto__"),"Прототип");
    assert.strictEqual(adapter.lookup("constructor"),"Конструктор");
});

test("Refresh invalidates table and definition caches while ordinary lookup stays cached",()=>{
    const f=fixture(common(),{"main.csv":"Key,English,Russian\nx,Before,До\n"});
    const adapter=create(f.project,{language:"Russian"});
    assert.strictEqual(adapter.lookup("x"),"До");
    fs.writeFileSync(path.join(f.dir,"main.csv"),"Key,English,Russian\nx,After,После\n");
    assert.strictEqual(adapter.lookup("x"),"До");
    adapter.clear(); assert.strictEqual(adapter.lookup("x"),"После");
    adapter.dispose(); assert.strictEqual(adapter.lookup("x"),undefined);assert.deepStrictEqual(adapter.info().languages,[]);
});

test("missing automatic directories stay quiet while explicit invalid paths explain the problem",()=>{
    const project={dir:path.join(temporary,"no-locales")};
    const automatic=create(project,{});
    assert.strictEqual(automatic.info().error,null);assert.deepStrictEqual(automatic.info().diagnostics,[]);assert.strictEqual(automatic.lookup("x"),undefined);
    const explicit=create(project,{directory:"translations"});
    assert.match(explicit.info().error,/locale_definition\.json/);
    assert(explicit.info().diagnostics[0].sourcePath.endsWith("locale_definition.json"));
    assert.deepStrictEqual(create(project,{directory:""}).info().diagnostics,[]);
});

test("malformed definitions and CSVs report diagnostics without executing or leaking partial text",()=>{
    const bad=fixture('{"locales": {"English": (() => { throw Error("never execute") })()}}',{});
    assert.match(create(bad.project,{}).info().error,/Invalid locale_definition/);
    const f=fixture(common(),{"main.csv":'Key,English,Russian\nx,English,"broken\n'}), adapter=create(f.project,{language:"Russian"});
    assert.strictEqual(adapter.lookup("x"),undefined);
    assert(adapter.info().diagnostics.some(x=>/Unterminated quoted CSV field/.test(x.message)));
});

test("stale language choices fall back to a defined language and report the choice",()=>{
    const f=fixture(common(),{"main.csv":"Key,English,Russian\nx,English,Русский\n"}), adapter=create(f.project,{language:"Removed"});
    assert.strictEqual(adapter.info().language,"English");assert.strictEqual(adapter.lookup("x"),"English");
    assert(adapter.info().diagnostics.some(x=>/Removed.*English/.test(x.message)));
});

const flag=process.argv.indexOf("--project");
if(flag>=0) test("actual Strategy definition resolves Family captions in Russian and English",()=>{
    const adapter=create({dir:path.resolve(process.argv[flag+1])},{language:"Russian"});
    assert(adapter.info().languages.some(x=>x.id==="Russian" && x.caption==="Русский"));
    assert.strictEqual(adapter.lookup("menu.family.tree"),"Семейное древо");
    assert.strictEqual(adapter.lookup("menu.tools.hint.clan"),"Династия");
    assert.strictEqual(adapter.lookup("menu.family.restrictions"),"Запреты");
    assert.strictEqual(adapter.lookup("menu.family.tree",true),"Family Tree");
    assert.deepStrictEqual(adapter.info().diagnostics,[]);
});
console.log(count+" GooWee localization tests passed.");
