"use strict";

// Production KGmlScript.preproc -> unsaved Ace buffer -> real plugin UI.
// Runs in its own hidden Electron process/profile; never opens or saves a game.
// node tests/run-goowee-editor-tests.js [--project C:\path\to\Strategy]
const fs = require("fs"), os = require("os"), path = require("path");
const { pathToFileURL } = require("url");
const { spawn, spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..");
const pluginDir = path.join(root, "bin/resources/app/plugins/goowee-preview");

if (!process.versions.electron) {
    const executable = path.join(root, "bin/resources/app/node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : "electron");
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [__filename, ...process.argv.slice(2)], {cwd: root, env, stdio: "inherit", windowsHide: true});
    child.on("error", error => { console.error(error); process.exitCode = 1; });
    child.on("exit", code => { process.exitCode = code == null ? 1 : code; });
} else {
    run().catch(error => { console.error(error.stack || error); require("electron").app.exit(1); });
}

async function run() {
    const {app, BrowserWindow} = require("electron");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmedit-goowee-editor-"));
    app.setPath("userData", path.join(directory, "profile"));
    const bridge = path.join(directory, "preprocess.js");
    const compiled = spawnSync("haxe", ["-cp", "src", "-cp", "tests/goowee-editor", "-main", "EditorPreprocess", "-D", "test", "-js", bridge], {cwd: root, encoding: "utf8", windowsHide: true});
    if (compiled.error || compiled.status !== 0) throw new Error("Haxe preprocessing bridge failed: " + (compiled.error || compiled.stderr));
    const flag = process.argv.indexOf("--project");
    const projectPath = flag < 0 ? path.join(directory, "fixture-project") : path.resolve(process.argv[flag + 1]);
    if (flag < 0) {
        fs.mkdirSync(path.join(projectPath, "#import"), {recursive: true});
        fs.writeFileSync(path.join(projectPath, "#import", "games.keevee.gw.gml"), "//!#import gw.*\n");
    }
    const fixture = `//!#import "games.keevee.gw"
/* @goowee-preview setup
preview_args([undefined]);
*/
function editor_first(parent/*:gw_Canvas*/)/*->gw_Canvas*/ {
    var canvas/*:gw_Canvas*/ = new gw_Canvas(parent);
    canvas.size(gw_ABS(400), gw_ABS(240));
    var heading = new gw_Label(canvas, "First unsaved view");
    heading.size(gw_REL(1), gw_ABSV(40));
    canvas.click.add(function(value/*:string*/) /*=>*/ { var dormant = new gw_Label(canvas, "Do not build callbacks"); });
    return canvas;
}
function editor_second(parent/*:gw_Canvas*/)/*->gw_Canvas*/ {
    var canvas = new gw_Canvas(parent); canvas.size(gw_ABS(220), gw_ABS(140));
    var heading = new gw_Label(canvas, "Second view");
    return canvas;
}`;
    const config = {projectPath, fixture, outputDir: directory, hasProject: flag >= 0,
        apiConfig: JSON.parse(fs.readFileSync(path.join(root, "bin/resources/app/api/v23/config.json"), "utf8")),
        symbols: ["gw_Canvas", "gw_Label", "gw_ABS", "gw_ABSV", "gw_REL"]};
    if (flag >= 0) config.symbols.push(...fs.readdirSync(path.join(projectPath, "scripts")));
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, "config.json"), "utf8"));
    const script = file => `<script src="${pathToFileURL(file).href}"></script>`;
    const html = `<!doctype html><meta charset="utf-8"><title>GooWee real editor regression</title>
      <link rel="stylesheet" href="${pathToFileURL(path.join(pluginDir, "goowee-preview.css")).href}">
      <style>html,body,#dock{height:100%;margin:0;background:#242b34;color:#eee;font:14px sans-serif}#dock{display:flex}.goowee-preview{flex:1;min-width:0}</style>
      <div id="dock"></div>
      <script>window.Electron_FS=require('fs'); window.Electron_API=null;</script>
      ${script(bridge)}
      <script>(${setup.toString()})(${JSON.stringify(config).replace(/</g, "\\u003c")});</script>
      ${manifest.scripts.map(file => script(path.join(pluginDir, file))).join("\n")}`;
    const htmlPath = path.join(directory, "editor.html"); fs.writeFileSync(htmlPath, html);
    await app.whenReady();
    const window = new BrowserWindow({width: 1100, height: 1000, show: false, webPreferences: {nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false, offscreen: true}});
    const errors = [];
    window.webContents.on("console-message", (_event, level, message) => { if (level >= 3) errors.push(message); });
    const timeout = setTimeout(() => { console.error("Production editor preprocessing test timed out."); app.exit(2); }, 60000);
    try {
        await window.loadFile(htmlPath);
        const result = await window.webContents.executeJavaScript(`(${verify.toString()})()`);
        if (errors.length) throw new Error(errors.join("\n"));
        await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const screenshot = path.join(directory, "editor-preview.png");
        fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
        fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
        console.log("GooWee production editor integration: " + result.tests + " checks passed.");
        console.log(JSON.stringify(result.samples));
        console.log("Screenshot: " + screenshot);
    } finally { clearTimeout(timeout); window.destroy(); }
    app.exit(0);
}

function setup(config) {
    const fs = require("fs"), path = require("path"), {EventEmitter} = require("events"), {pathToFileURL} = require("url");
    window.editorTest = {config, plugin: null, file: null, latest: null, propertySaves: []};
    const dock = {add(_name, node) { document.getElementById("dock").appendChild(node); }, set() {}, remove(_name, node) { node.remove(); }};
    window.GMEdit = new EventEmitter();
    Object.assign(GMEdit, {sidebar: dock, bottomPanel: dock, leftBottomPanel: dock, register(_name, plugin) { editorTest.plugin = plugin; }});
    window.AceCommands = {add() {}, remove() {}, addToPalette() {}, removeFromPalette() {}};
    window.$gmedit = {"ui.Preferences": {current: {}, save() {}}, "gml.file.GmlFile": {current: null}, "gml.Project": {current: null}, "gml.GmlAPI": {gmlMacros: {}, gmlMFuncs: {}, gmlLookup: {}, gmlEnums: {}}};
    $gmedit["ui.Preferences"].addInput = function(out, title, value, change) {
        const group = document.createElement("div"), label = document.createElement("label"), input = document.createElement("input");
        label.textContent = title; input.value = value; input.onchange = () => change(input.value);
        group.append(label,input); out.appendChild(group); return group;
    };
    $gmedit["ui.project.ProjectProperties"] = {save(project, properties) {
        // Exercise per-project settings without writing the real game's #config.
        editorTest.propertySaves.push({project, properties: JSON.parse(JSON.stringify(properties))});
    }};
    const yyResources = {}, yyResourceTypes = {}, lookup = $gmedit["gml.GmlAPI"].gmlLookup;
    function indexMacros(source) {
        const api = $gmedit["gml.GmlAPI"];
        for (const match of source.matchAll(/^\s*#macro\s+([A-Za-z_]\w*)\s+([^\r\n]*)/gm)) api.gmlMacros[match[1]] = {expr: match[2]};
        for (const match of source.matchAll(/^\s*\/\/!\s*#mfunc\s+(\w+)\s+(\{[^\r\n]*\})\s*$/gm)) api.gmlMFuncs[match[1]] = JSON.parse(match[2]);
    }
    if (config.hasProject) {
        for (const [folder, type] of [["sprites", "GMSprite"], ["scripts", "GMScript"], ["fonts", "GMFont"]]) {
            for (const item of fs.readdirSync(path.join(config.projectPath, folder), {withFileTypes: true})) if (item.isDirectory()) {
                yyResources[item.name] = {id: {path: `${folder}/${item.name}/${item.name}.yy`}}; yyResourceTypes[item.name] = type;
            }
        }
        for (const name of fs.readdirSync(path.join(config.projectPath,"scripts"),{withFileTypes:true}).filter(item=>item.isDirectory()).map(item=>item.name)) {
            const sourcePath = path.join(config.projectPath, "scripts", name, name + ".gml");
            if (!fs.existsSync(sourcePath)) continue;
            const source = fs.readFileSync(sourcePath, "utf8");
            for (const match of source.matchAll(/\bfunction\s+([A-Za-z_]\w*)\s*\(/g)) lookup[match[1]] = {path: sourcePath, row: source.slice(0, match.index).split("\n").length - 1};
            for (const match of source.matchAll(/\benum\s+([A-Za-z_]\w*)\s*\{/g)) $gmedit["gml.GmlAPI"].gmlEnums[match[1]] = {origin: sourcePath};
            indexMacros(source);
            if (name === "gui_Global") lookup.GuiTextStyles = {path: sourcePath, row: 0};
        }
        const objectRoot=path.join(config.projectPath,"objects");
        if(fs.existsSync(objectRoot)) for(const item of fs.readdirSync(objectRoot,{withFileTypes:true})) if(item.isDirectory()) {
            const objectDirectory=path.join(objectRoot,item.name);
            for(const file of fs.readdirSync(objectDirectory).filter(file=>file.endsWith(".gml"))) {
                const sourcePath=path.join(objectDirectory,file), source=fs.readFileSync(sourcePath,"utf8");
                for(const match of source.matchAll(/\benum\s+([A-Za-z_]\w*)\s*\{/g)) $gmedit["gml.GmlAPI"].gmlEnums[match[1]]={origin:sourcePath};
                indexMacros(source);
            }
        }
    }
    GooWeeEditorPreprocess.init({...config, macroFunctions: $gmedit["gml.GmlAPI"].gmlMFuncs});
    $gmedit["gml.Project"].current = {dir: config.projectPath, yyResources, yyResourceTypes, yyResourceGUIDs: {},
        properties: config.hasProject ? {gooWeePreview:{localeDirectory:"datafiles/localization",localeLanguage:"Russian"}} : {},
        fullPath(relative) { return path.join(config.projectPath, relative); },
        readTextFileSync(relative) { return fs.readFileSync(path.join(config.projectPath, relative), "utf8"); },
        readYyFileSync(relative) { return JSON.parse(fs.readFileSync(path.join(config.projectPath, relative), "utf8").replace(/,\s*([}\]])/g, "$1")); },
        getImageURL(relative) { return pathToFileURL(path.join(config.projectPath, relative)).href; }
    };
    editorTest.open = function(name, source, sourcePath) {
        const session = new EventEmitter(); session.source = source; session.getValue = () => session.source;
        session.edit = value => { session.source = value; session.emit("change"); };
        const file = {name, path: sourcePath, codeEditor: {session}};
        $gmedit["gml.file.GmlFile"].current = editorTest.file = file;
        GMEdit.emit("activeFileChange", {file});
        return file;
    };
}

async function verify() {
    const fs = require("fs"), path = require("path"), state = editorTest, config = state.config;
    let tests = 0;
    const samples = [];
    function visible(scene,node) {
        while(node) { if(node.hidden)return false; node=scene.nodes.find(parent=>parent.id===node.parentId); }
        return true;
    }
    function descendants(node) {
        const result=[],pending=[node];
        while(pending.length){const item=pending.shift();if(!item)continue;result.push(item);pending.push(...item.children);}
        return result;
    }
    function spriteLayers(sprite) {
        const result=[],pending=[sprite];
        while(pending.length){const item=pending.shift();if(!item || !item.layers)continue;for(const layer of item.layers){result.push(layer);pending.push(layer.sprite);}}
        return result;
    }
    const actorEntries=["gui_actor_1_new_new","gui_actor_3_person_create","gui_actor_4_social_create","gui_actor_5_logs_create"];
    function checkActorFrame(scene,entry,sample) {
        const main=scene.roots.find(node=>node.name==="canvas");
        check(scene.entry===entry && main && main.width===405 && main.height===495,"Actual editor "+entry+" must receive the shared menu initialization");
        const panel=scene.nodes.find(node=>node.type==="GuiRoughTabButtonAutoWidthPanel"),buttons=panel && panel.children.filter(node=>node.type==="Button");
        check(buttons && buttons.length===4 && buttons.every((button,i)=>button.width>80 && button.width<110 && (!i || button.x>=buttons[i-1].x+buttons[i-1].width-1)),"Actual editor "+entry+" must reuse the source tab layout");
        check(buttons.every((button,i)=>{const image=descendants(button).find(node=>node.sprite && node.sprite.name==="ns_tab_button_rough");return image && image.sprite.index===(i===actorEntries.indexOf(entry)?1:0);}),"Actual editor "+entry+" must activate its own tab through the shared source controller");
        check(scene.nodes.some(node=>node.text===sample.name && visible(scene,node)),"Actual editor "+entry+" must use the shared sample character");
        check(!scene.nodes.some(node=>visible(scene,node) && node.text && /\{[^{}]+\}/.test(node.text)),"Actual editor "+entry+" must resolve the configured sample text without placeholders");
        if(entry!==actorEntries[0])check(!scene.nodes.some(node=>node.name==="mood_label" || node.name==="button_mind"),"Actual editor tab changes must discard the general actor scene for "+entry);
        if(entry===actorEntries[1])check(scene.nodes.filter(node=>node.name==="stack_skill").length===Object.keys(sample.skills.levels).length,"Actual editor personality preview must render all sampled skills");
        if(entry===actorEntries[2]) {
            const names=scene.nodes.filter(node=>node.name==="label_name" && visible(scene,node)).map(node=>node.text);
            check(names.length===1 && names[0]===sample.important_person.name,"Actual editor social preview must render only the shared related character, excluding the main actor from their own relations");
            const marks=scene.nodes.filter(node=>node.sprite && node.sprite.name==="spr_checkbox_dot");
            check(marks.length===5 && marks.every((node,i)=>node.sprite.alpha===(i===0?1:0)),"Actual editor social filters must show only the selected radio mark and preserve false sprite opacity");
        }
        if(entry===actorEntries[3])check(scene.nodes.some(node=>node.name==="day_and_age_label" && visible(scene,node)) && scene.nodes.filter(node=>node.name==="label" && node.text && visible(scene,node)).length>4,"Actual editor history preview must render sample log bodies and dates");
    }
    function check(ok, message) {
        if (!ok) {
            const snapshot=path.join(config.outputDir,"failed-scene.json");
            if(state.latest) fs.writeFileSync(snapshot,JSON.stringify({entry:state.latest.entry,stats:state.latest.stats,diagnostics:state.latest.diagnostics,roots:state.latest.roots.map(node=>node.id),nodes:state.latest.nodes.map(node=>({id:node.id,parentId:node.parentId,name:node.name,type:node.type,x:node.x,y:node.y,width:node.width,height:node.height,hidden:node.hidden,text:node.text,sprite:node.sprite,style:node.style,children:node.children.map(child=>child.id)}))},null,2));
            throw new Error(message+"\nScene snapshot: "+snapshot);
        }
        tests++;
    }
    const settle = async () => { await new Promise(resolve => setTimeout(resolve, 400)); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); };
    const select = () => document.querySelector('select[aria-label="GooWee entry function"]');
    const originalAnalyze = GooWeePreviewEngine.analyze;
    GooWeePreviewEngine.analyze = function(source, options) { return state.latest = originalAnalyze(source, options); };
    const sourcePath = path.join(config.projectPath, "editor_fixture.gml");
    const source = GooWeeEditorPreprocess.process(config.fixture, sourcePath);
    fs.writeFileSync(path.join(config.outputDir, "fixture-editor-buffer.gml"), source);
    check(source.includes("parent:Canvas") && source.includes(")->Canvas"), "Production Import preprocessor must unwrap and alias typed signatures");
    check(source.includes("(value:string)=>") || /\(value:string\)\s*=>/.test(source), "Production Arrow preprocessor must produce a typed arrow callback");
    const file = state.open("editor_fixture", source, sourcePath);
    state.plugin.init(); await settle();
    check(select() && select().options.length === 2 && select().value === "editor_first", "Real editor source must populate and select the first dropdown entry");
    check(state.latest.roots.length === 1 && state.latest.nodes.length === 2, "Initial typed entry must have one canvas and no dormant callback content");
    select().value = "editor_second"; select().dispatchEvent(new Event("change")); await settle();
    check(state.latest.entry === "editor_second" && state.latest.roots.length === 1, "Switching entry must isolate the second canvas");
    check(state.latest.nodes.some(node => node.text === "Second view") && !state.latest.nodes.some(node => node.text === "First unsaved view"), "Switching must replace first entry content");
    document.querySelector('button[title="Reload sprites and rebuild the preview"]').click(); await settle();
    check(select().value === "editor_second" && state.latest.entry === "editor_second", "Refresh must preserve the selected function");
    file.codeEditor.session.edit(source.replace("Second view", "Edited in unsaved Ace buffer")); await settle();
    check(state.latest.nodes.some(node => node.text === "Edited in unsaved Ace buffer"), "Preview must follow unsaved editor changes");
    check(select().value === "editor_second", "Unsaved edits must retain the selected entry");
    samples.push({name: "typed editor fixture", entries: [...select().options].map(option => option.value), nodes: state.latest.nodes.length});
    if (config.hasProject) {
        const knowledgePath=path.join(config.projectPath,"scripts/gui_KnowledgeMenu/gui_KnowledgeMenu.gml");
        const knowledgeDisk=fs.readFileSync(knowledgePath,"utf8"), knowledgeEditor=GooWeeEditorPreprocess.process(knowledgeDisk,knowledgePath);
        fs.writeFileSync(path.join(config.outputDir,"gui_KnowledgeMenu-editor-buffer.gml"),knowledgeEditor);
        check(knowledgeEditor.includes("controller:gui_MenuControllerKnowledge") && knowledgeEditor.includes("->Canvas[]"),"Knowledge regression must run the production typed editor syntax");
        state.open("gui_KnowledgeMenu",knowledgeEditor,knowledgePath); await settle();
        check(["gui_knowledge_general_create","gui_knowledge_culture_create"].every(name=>[...select().options].some(option=>option.value===name)),"The production Knowledge buffer must expose both wrapper entry functions");
        const cultureCounts={gwelts:5,voruns:5,tanaya:5,makha:5}, generalCount=9;
        const cardAsset=$gmedit["gml.Project"].current.readYyFileSync("sprites/s_gui_knowledge_card/s_gui_knowledge_card.yy");
        const cardCode=fs.readFileSync(path.join(config.projectPath,"scripts/gw_KnowledgeCard/gw_KnowledgeCard.gml"),"utf8").replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\r\n]*/g,"");
        const costSetter=(cardCode.match(/static\s+__set_cost\s*=\s*function[^\{]*\{([\s\S]*?)\}/)||[])[1]||"";
        const writesCostText=/__cost_labels\s*\[[^\]]+\]\s*\.text\s*\(/.test(costSetter), writesCostSprites=/__cost_images\s*\[[^\]]+\]\s*\.sprite\s*\(/.test(costSetter);
        for(const kind of ["general","culture"]) {
            const entry="gui_knowledge_"+kind+"_create";
            select().value=entry;select().dispatchEvent(new Event("change"));await settle();
            const result=state.latest, main=result.roots[0], scroll=result.nodes.find(node=>node.type===(kind==="culture"?"Scroll":"DragScroll"));
            check(result.entry===entry && result.roots.length===1 && main.name==="canvas","Production "+entry+" must have one connected window and no orphan scroll content");
            const visited=new Set();let duplicate=false;
            (function walk(node){if(visited.has(node.id)){duplicate=true;return;}visited.add(node.id);node.children.forEach(walk);})(main);
            check(!duplicate && visited.size===result.nodes.length,"Production "+entry+" must attach every element exactly once");
            check(!!scroll && scroll.clipChildren===true && scroll.x>=main.x && scroll.y>main.y && scroll.x+scroll.width<=main.x+main.width+1 && scroll.y+scroll.height<=main.y+main.height+1,"Production "+entry+" must place a clipped scroll viewport inside the window");
            check(["Знания","Общие знания","Знания культур"].every(text=>result.nodes.some(node=>node.text===text)),"Production "+entry+" must localize the title and both tabs");
            check(result.nodes.filter(node=>node.type==="KnowledgeCard").every(card=>card.width===Math.round(cardAsset.width/2) && card.height===Math.round(cardAsset.height/2) && card.children.some(child=>child.name==="__content" && child.children.some(image=>image.name==="__background"))),"Production "+entry+" must fully construct every repeated card at its real sprite size");
            const appoint=result.nodes.find(node=>node.type==="SoulAppointPanel"),appointContents=appoint && appoint.children.filter(node=>node.name==="__content");
            check(appointContents && appointContents.length===1 && !appointContents[0].hidden && appointContents[0].x-appoint.x<20,"Production "+entry+" must remove stale researcher content instead of leaving hidden layout children");
            const goldImages=result.nodes.filter(node=>node.name==="gold_image" && /gw_KnowledgeCard\.gml$/.test(node.sourcePath||""));
            check(goldImages.length===result.nodes.filter(node=>node.type==="KnowledgeCard").length && goldImages.every(node=>node.sprite && node.sprite.name==="s_icon_resources_square" && node.sprite.index===0),"Production "+entry+" must resolve each card's static gold sprite factory");
            const columns=result.nodes.filter(node=>node.name==="column" && /gui_KnowledgeMenu\.gml$/.test(node.sourcePath||""));
            if(kind==="culture") {
                const content=result.nodes.find(node=>node.name==="scroll_content"),byId=new Map(result.nodes.map(node=>[node.id,node]));
                let ancestor=content;while(ancestor && ancestor!==scroll)ancestor=byId.get(ancestor.parentId);
                check(content && ancestor===scroll && content.x>=scroll.x-1 && content.y>=scroll.y,"Production culture columns must be attached through stack_content inside the viewport");
                check(columns.length===4 && columns.every(node=>node.width===270 && node.height>100),"Production culture entry must build four complete source-defined columns");
                check(columns.every(column=>{
                    const cards=column.children.filter(node=>node.type==="KnowledgeCard"),search=cards.find(node=>/^knowledge_search_/.test(node.codename||""));
                    const culture=search && search.codename.slice("knowledge_search_".length);
                    return search && cards.length===cultureCounts[culture]+1 && cards.every((card,i)=>card.width>0 && card.height>0 && (!i || card.y>=cards[i-1].y+cards[i-1].height+8));
                }),"Production culture entry must construct each declared demo slot without overlapping or incomplete cards");
                const costLabels=result.nodes.filter(node=>node.name==="sample_label" && visible(result,node));
                check(costLabels.length===8 && (writesCostText ? ["50","5"].every(text=>costLabels.some(node=>node.text===text)) : costLabels.every(node=>node.text==="")),"Production culture costs must follow the current project setter, including intentionally commented-out text assignments");
                const costImages=result.nodes.filter(node=>node.name==="sample_image" && visible(result,node));
                check(costImages.length===8 && (!writesCostSprites || costImages.some(node=>node.sprite && node.sprite.name==="s_icon_resources_square" && node.sprite.index===19)),"Production culture cost sprites must follow the current project setter");
            } else {
                check(columns.length===0 && !result.nodes.some(node=>node.type==="Scroll"),"Production general entry must not execute the culture branch");
                check(result.nodes.filter(node=>/^knowledge_general_/.test(node.codename||"")).length===generalCount,"Production general entry must construct every explicit sample card through the source tree algorithm");
                check(result.nodes.some(node=>node.text==="Forestry (demo)"),"Production general entry must keep sample labels through editor preprocessing");
            }
            check(["Alden","Borin","Celia"].every(name=>result.nodes.some(node=>node.text===name && visible(result,node))),"Production "+entry+" must visibly populate all three sample researchers");
            check(result.nodes.filter(node=>node.name==="cancel_image" && node.sprite && node.sprite.name==="s_gui_soul_appoint_panel_cancel_soul").every(node=>node.hidden),"Production researcher controls must leave cancellation overlays hidden until hover");
            check(result.nodes.some(node=>node.text==="37%") && result.diagnostics.some(note=>/Knowledge demo/.test(note.message)),"Production "+entry+" must display explicit demo progress and its preview note");
            const progressPanel=result.nodes.find(node=>node.type==="Float" && node.children.some(child=>child.name==="researching"));
            const selectedCaption=progressPanel && progressPanel.children.find(node=>node.name==="caption");
            check(selectedCaption && visible(result,selectedCaption) && (kind==="culture" ? /^Поиск знания \(/.test(selectedCaption.text) && !selectedCaption.text.includes("Forestry") : selectedCaption.text==="Forestry (demo)"),"Production "+entry+" must keep its own selected research category through preview globals");
            samples.push({name:entry,language:"Russian",nodes:result.nodes.length,roots:result.roots.length,columns:columns.length});
        }
        check(fs.readFileSync(knowledgePath,"utf8")===knowledgeDisk,"Production Knowledge preview must never save the game source");
        const familyPath = path.join(config.projectPath, "scripts/gui_Family/gui_Family.gml");
        const diskSource = fs.readFileSync(familyPath, "utf8");
        const familyRows=JSON.parse(fs.readFileSync(path.join(config.projectPath,".goowee-preview/family/family-restrictions.json"),"utf8"));
        const editorSource = GooWeeEditorPreprocess.process(diskSource, familyPath);
        fs.writeFileSync(path.join(config.outputDir, "gui_Family-editor-buffer.gml"), editorSource);
        check(editorSource.includes("controller:gui_MenuControllerFamily") && editorSource.includes(")->Canvas"), "Actual Family file must be production-preprocessed, not the saved disk syntax");
        state.open("gui_Family", editorSource, familyPath); await settle();
        const entries = [...select().options].map(option => option.value);
        check(entries.includes("gui_family_menu_tree_create") && entries.includes("gui_family_menu_restrictions_create"), "Actual Family buffer must expose both entry functions");
        for (const entry of ["gui_family_menu_tree_create", "gui_family_menu_restrictions_create"]) {
            select().value = entry; select().dispatchEvent(new Event("change")); await settle();
            check(state.latest.entry === entry && state.latest.roots.length === 1, "Actual " + entry + " must render one independent canvas");
            check(state.latest.nodes.filter(node => node.type === "Canvas").length === 1, "Actual " + entry + " must not combine both menus");
            check(["Династия","Семейное древо","Запреты"].every(text => state.latest.nodes.some(node => node.text === text)), "Actual " + entry + " must use Russian project localization for title and both tabs");
            check(!state.latest.nodes.some(node => /⟦menu\.(family|tools)/.test(node.text)), "Localized Family labels must not retain key placeholders");
            if(entry==="gui_family_menu_restrictions_create") {
                const result=state.latest, rows=result.nodes.filter(node=>node.name==="restriction_row"),cells=result.nodes.filter(node=>node.name==="checkbox_cell");
                check(rows.length===5 && cells.length===15 && rows.every(row=>row.height===38) && cells.every(cell=>cell.width===80 && cell.height===38),"Production editor compact tags must preserve the complete three-by-five restrictions table geometry");
                check(familyRows.every(row=>result.nodes.some(node=>node.text===row.name && visible(result,node))),"Production editor must keep visible JSON sample names from trailing value tags");
                check(familyRows.every(row=>result.nodes.some(node=>node.sprite && node.sprite.name===row.soul.avatar && node.sprite.color.toLowerCase()==="#d8b59c" && visible(result,node))),"Production editor must preserve tagged call arguments after GooWee import alias expansion");
                const marks=cells.map(cell=>cell.children.some(button=>button.children.some(image=>image.sprite && image.sprite.name==="spr_checkbox_cross" && visible(result,image))));
                check(JSON.stringify(marks)===JSON.stringify(familyRows.flatMap(row=>row.soul.restrictions)),"Production editor return tags must drive the existing checkbox binding with each sample Boolean");
                const familyLocale=GooWeePreviewLocalization.create($gmedit["gml.Project"].current,{language:"Russian"});
                check(["restrictions.eat.meat","restrictions.activity.alcohol","restrictions.ale","restrictions.activity.nectar","restrictions.activity.dice"].every(key=>result.nodes.some(node=>node.text===familyLocale.lookup(key) && visible(result,node))),"Production restrictions must display all source-defined Russian captions");
                familyLocale.dispose();
            } else {
                check(!state.latest.nodes.some(node=>familyRows.some(row=>row.name===node.text)),"Restriction samples must not leak into the production Family tree entry");
            }
            samples.push({name: entry, entries, nodes: state.latest.nodes.length, roots: state.latest.roots.length});
        }
        check(fs.readFileSync(familyPath, "utf8") === diskSource, "Integration must not save the game file");
        // Validate localization changes on the runtime surface example.
        select().value = "gui_family_menu_tree_create"; select().dispatchEvent(new Event("change")); await settle();
        const russianTitle = state.latest.nodes.find(node => node.text === "Династия");
        check(russianTitle.style.fontResource === "f_fontin_pt16_bold_sdf_huge_spread" && russianTitle.style.fontSizeUnit === "sdf", "The production editor title must use the project's selected bold SDF atlas and size mode");
        const settings = document.createElement("div"); settings.hidden = true; document.body.appendChild(settings);
        const project = $gmedit["gml.Project"].current;
        state.plugin.buildProjectProperties(settings, project);
        const language = settings.querySelector('select[aria-label="GooWee preview language"]');
        check(!!language && language.value === "Russian" && [...language.options].some(option=>option.value === "English"), "Project settings must expose the languages from the actual manifest and current Russian selection");
        language.value = "English"; language.dispatchEvent(new Event("change")); await settle();
        check(["Dynasty","Family Tree","Restrictions"].every(text => state.latest.nodes.some(node => node.text === text)), "Switching project language must immediately rebuild Family labels in English");
        const englishTitle = state.latest.nodes.find(node => node.text === "Dynasty");
        check(englishTitle && Math.abs(englishTitle.width-russianTitle.width)>1, "Language changes must remeasure AUTO label widths, not only replace the painted text");
        check(state.latest.entry === "gui_family_menu_tree_create" && state.latest.roots.length === 1, "Language switching must preserve the selected entry and its single canvas");
        check(state.propertySaves.length === 1 && state.propertySaves[0].project === project && state.propertySaves[0].properties.gooWeePreview.localeLanguage === "English", "Language selection must persist through ProjectProperties.save for the current project");
        language.value = "Russian"; language.dispatchEvent(new Event("change")); await settle();
        document.querySelector('button[title="Reload sprites and rebuild the preview"]').click(); await settle();
        check(state.latest.nodes.some(node => node.text === "Династия") && language.value === "Russian", "Refresh must retain the project's selected localization language");
        samples.push({name:"localized Family", language:"Russian", text:["Династия","Семейное древо","Запреты"], russianTitleWidth:russianTitle.width, englishTitleWidth:englishTitle.width});
        select().value="gui_family_menu_restrictions_create";select().dispatchEvent(new Event("change"));await settle();
        check(state.latest.nodes.filter(node=>node.name==="checkbox_cell").length===15,"Switching back to restrictions must rebuild the compact sample once after language changes");

        const actorPath = path.join(config.projectPath,"scripts/gui_actor_1_new_new/gui_actor_1_new_new.gml");
        const actorDisk = fs.readFileSync(actorPath,"utf8"), actorEditor = GooWeeEditorPreprocess.process(actorDisk,actorPath);
        const actorSample = JSON.parse(fs.readFileSync(path.join(config.projectPath,".goowee-preview/actor/actor.json"),"utf8"));
        fs.writeFileSync(path.join(config.outputDir,"gui_actor_1_new_new-editor-buffer.gml"),actorEditor);
        check(actorEditor.includes("controller:IMenuControllerSoul") && actorEditor.includes("->Canvas[]"),"Production actor preview must use the actual typed editor buffer");
        check(/bind_property\(\s*_soul\.get_minds\(\)\s*,\s*get_array_of_gui_data_minds\s*\)/.test(actorEditor) && !actorEditor.includes("bind_property_mf0"),"Production macro-function preprocessing must restore the editor property-binding shorthand");
        check($gmedit["gml.GmlAPI"].gmlMFuncs.bind_property.order.length===3,"Plugin UI must receive the indexed macro-function metadata used by the real editor");
        state.open("gui_actor_1_new_new",actorEditor,actorPath);await settle();
        select().value="gui_actor_1_new_new";select().dispatchEvent(new Event("change"));await settle();
        const actor = state.latest, mainActor = actor.roots.find(node=>node.name==="canvas");
        checkActorFrame(actor,"gui_actor_1_new_new",actorSample);
        check(actor.entry==="gui_actor_1_new_new" && mainActor && mainActor.width===405 && mainActor.height===495,"Production actor initialization must preserve the source-defined 405 by 495 menu");
        const left = actor.nodes.find(node=>node.name==="left_side_stack"), right = actor.nodes.find(node=>node.name==="right_side_stack");
        check(left && right && left.width===171 && right.x>=left.x+left.width && left.y===right.y,"Production actor content must keep the left and right columns beside each other");
        const tabPanel = actor.nodes.find(node=>node.type==="GuiRoughTabButtonAutoWidthPanel"), tabs = tabPanel && tabPanel.children.filter(node=>node.type==="Button");
        check(tabs && tabs.length===4 && tabs.every((tab,index)=>tab.width>80 && tab.width<110 && tab.y===tabs[0].y && (!index || tab.x>=tabs[index-1].x+tabs[index-1].width-1)),"Production source-defined custom layout must place four actor tabs with at most their shared one-pixel border");
        check(actor.nodes.some(node=>node.text===actorSample.name && visible(actor,node)) && actor.nodes.some(node=>node.name==="mood_label" && node.text===String(actorSample.mood) && visible(actor,node)),"Production actor header and mood must show their explicit sample values");
        const inventoryFrames=actor.nodes.filter(node=>node.name==="stack_item_frame");
        check(inventoryFrames.length>=8 && actor.nodes.some(node=>node.text===String(actorSample.inventory.money) && visible(actor,node)),"Production actor inventory must use its source component to build the resource row, equipment slots and sample money count");
        function hasItemSprite(node) { return node.sprite && node.sprite.name && node.sprite.name!=="s_empty" || node.children.some(hasItemSprite); }
        check(inventoryFrames.slice(-4).every(hasItemSprite),"Production actor equipment slots must retain their actual project sprites");
        const minds = actor.nodes.filter(node=>node.name==="button_mind");
        check(minds.length===actorSample.minds.length && minds.length===3 && minds.every((mind,index)=>visible(actor,mind) && mind.width>0 && mind.height>0 && (!index || mind.y>=minds[index-1].y+minds[index-1].height)),"Production editor property-binding macro must construct all three mood reasons");
        check(actorSample.minds.every(mind=>actor.nodes.some(node=>node.text==="+"+mind.value && visible(actor,node))),"Production actor mood reasons must retain their individual numeric modifiers");
        const avatar = actor.nodes.find(node=>node.name==="image_avatar"), layers = avatar && avatar.sprite && spriteLayers(avatar.sprite);
        check(avatar && avatar.width===128 && avatar.height===actorSample.portrait.height && avatar.y<mainActor.y && layers && layers.filter(layer=>layer.sprite && !layer.sprite.layers).length>4 && layers.every(layer=>(layer.fill || layer.sprite && layer.sprite.name) && [layer.x,layer.y,layer.width,layer.height].every(Number.isFinite)),"Production actor portrait must capture the source avatar pipeline at finite positions and extend above its menu");
        check(actor.nodes.some(node=>node.text===actorSample.important_person.name && visible(actor,node)),"Production actor important feelings must show the sample related person");
        check(fs.readFileSync(actorPath,"utf8")===actorDisk,"Production actor preview must never save the game source");
        samples.push({name:actor.entry,language:"Russian",nodes:actor.nodes.length,roots:actor.roots.length,tabs:tabs.length,moodReasons:minds.length,portraitLayers:layers.length});
        // Capture the actor view after exercising the same editor preprocessing and UI path.
        const approximate = document.querySelector('input[aria-label="Show approximate bounds"]');
        approximate.checked=false;approximate.dispatchEvent(new Event("change"));
        const zoom = document.querySelector('select[aria-label="Preview zoom"]');
        zoom.value="fit";zoom.dispatchEvent(new Event("change"));await settle();
        for(const entry of actorEntries.slice(1)) {
            const entryPath=path.join(config.projectPath,"scripts",entry,entry+".gml"), disk=fs.readFileSync(entryPath,"utf8");
            const editor=GooWeeEditorPreprocess.process(disk,entryPath);
            fs.writeFileSync(path.join(config.outputDir,entry+"-editor-buffer.gml"),editor);
            state.open(entry,editor,entryPath);await settle();
            select().value=entry;select().dispatchEvent(new Event("change"));await settle();
            checkActorFrame(state.latest,entry,actorSample);
            samples.push({name:entry,language:"Russian",nodes:state.latest.nodes.length,roots:state.latest.roots.length});
            fs.writeFileSync(path.join(config.outputDir,entry+"-canvas.png"),Buffer.from(document.querySelector("canvas").toDataURL("image/png").split(",")[1],"base64"));
            check(fs.readFileSync(entryPath,"utf8")===disk,"Production editor preview must not save "+entry);
        }
    }
    return {tests, samples};
}
