"use strict";

// Standalone browser integration tests. No installed/running GMEdit instance is used.
// Run: node tests/run-goowee-preview-tests.js [--project C:\path\to\Strategy]
// Capture one project script quickly: --project C:\path\to\Strategy --sample script_name [--entry function_name]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const root = path.resolve(__dirname, "..");
const pluginDir = path.join(root, "bin/resources/app/plugins/goowee-preview");

if (!process.versions.electron) {
    const { spawn } = require("child_process");
    const electron = path.join(root, "bin/resources/app/node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : "electron");
    if (!fs.existsSync(electron)) throw new Error("Install the application's Electron dependency first.");
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [__filename, ...process.argv.slice(2)], { cwd: root, env, stdio: "inherit", windowsHide: true });
    child.on("error", error => { console.error(error); process.exitCode = 1; });
    child.on("exit", code => { process.exitCode = code == null ? 1 : code; });
} else {
    runElectron().catch(error => {
        console.error(error.stack || error);
        require("electron").app.exit(1);
    });
}

async function runElectron() {
    const { app, BrowserWindow, ipcMain } = require("electron");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmedit-goowee-preview-"));
    app.setPath("userData", path.join(directory, "electron-profile"));
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, "config.json"), "utf8"));
    manifest.scripts.forEach(script => {
        if (!fs.existsSync(path.join(pluginDir, script))) throw new Error("Missing plugin script: " + script);
    });
    const projectIndex = process.argv.indexOf("--project");
    const projectPath = projectIndex >= 0 ? path.resolve(process.argv[projectIndex + 1]) : null;
    const sampleIndex = process.argv.indexOf("--sample");
    const sampleName = sampleIndex >= 0 ? process.argv[sampleIndex + 1] : null;
    const entryIndex = process.argv.indexOf("--entry");
    const sampleEntry = entryIndex >= 0 ? process.argv[entryIndex + 1] : sampleName;
    if (sampleName && (!projectPath || !/^[A-Za-z_]\w*$/.test(sampleName))) throw new Error("--sample requires --project and a script resource name");
    const localizationProject = path.join(directory, "localization-project");
    const localizationDirectory = path.join(localizationProject, "datafiles", "localization");
    fs.mkdirSync(localizationDirectory, {recursive: true});
    fs.writeFileSync(path.join(localizationDirectory, "locale_definition.json"), JSON.stringify({locales: {
        English: {caption: "English", files: [{filePath: "localization/main.csv"}]}, Russian: {caption: "Русский"}
    }}));
    fs.writeFileSync(path.join(localizationDirectory, "main.csv"), "Key,English,Russian\nmenu.family.tree,Family Tree,Древо семьи\n");
    const config = { projectPath, localizationProject, sampleName, sampleEntry, cleanSample:process.argv.includes("--clean") };
    const escape = value => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const html = `<!doctype html><meta charset="utf-8"><title>GooWee integration test</title>
        <link rel="stylesheet" href="${escape(pathToFileURL(path.join(pluginDir, "goowee-preview.css")).href)}">
        <style>
        html,body{margin:0;height:100%;font:14px "Segoe UI",sans-serif;color:#d8e1eb;background:#232b35}
        body{display:grid;grid-template-columns:45% 55%;grid-template-rows:100%;--color-primary:#6cceff;--color-border:#485665;--background-color:#293440}
        #editor{padding:22px;overflow:auto;box-sizing:border-box}h1{margin:0 0 10px;font-size:21px;font-weight:500}p{color:#99afc5}
        #source{font:13px/1.55 Consolas,monospace;white-space:pre-wrap;color:#b9d4ec}
        .dock{min-width:0;min-height:0;border-left:1px solid #485665;display:flex;flex-direction:column}
        .dock[hidden]{display:none}.dock-tabs{display:flex;min-height:30px;background:#303c49;flex-shrink:0}
        .dock-tabs button{background:transparent;color:inherit;border:0;padding:7px 12px}.dock-tabs button[aria-selected=true]{background:#405166;border-bottom:2px solid #6cceff}
        .dock-content{display:flex;flex:1;min-height:0;min-width:0}.dock-content>div{flex:1;min-width:0}
        #preferences{display:none}.outline-placeholder{padding:16px}
        </style><section id="editor"><h1>GooWee Preview · integration fixture</h1><p>Active unsaved editor buffer</p><pre id="source"></pre><div id="preferences"></div></section>
        <section class="dock" id="right"></section><section class="dock" id="bottom" hidden></section><section class="dock" id="left-bottom" hidden></section>
        <script>(${setupFixture.toString()})(${JSON.stringify(config).replace(/</g, "\\u003c")});</script>
        ${manifest.scripts.map(script => `<script src="${escape(pathToFileURL(path.join(pluginDir, script)).href)}"></script>`).join("\n")}`;
    const htmlPath = path.join(directory, "fixture.html");
    fs.writeFileSync(htmlPath, html);
    await app.whenReady();
    const window = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: {
        nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false, offscreen: true
    } });
    const errors = [];
    window.webContents.on("console-message", (_event, level, message) => { if (level >= 3) errors.push(message); });
    const screenshots = [];
    let lastCheck = "Starting renderer";
    ipcMain.on("goowee-test-progress", (_event, message) => { lastCheck = message; });
    ipcMain.handle("goowee-test-capture", async (_event, name) => {
        const output = path.join(directory, name + ".png");
        fs.writeFileSync(output, (await window.webContents.capturePage()).toPNG());
        screenshots.push(output);
        return output;
    });
    const timeout = setTimeout(() => { console.error("GooWee integration tests timed out. Last completed check: " + lastCheck); app.exit(2); }, 60000);
    try {
        await window.loadFile(htmlPath);
        const result = await window.webContents.executeJavaScript(`(${runBrowserTests.toString()})()`);
        if (errors.length) throw new Error("Unexpected renderer errors:\n" + errors.join("\n"));
        console.log("GooWee Electron integration: " + result.tests + " checks passed.");
        result.samples.forEach(sample => {
            console.log("Strategy sample: " + sample.name + " — " + sample.elements + " elements");
            if (sample.snapshot) console.log("Scene: " + sample.snapshot);
            if (sample.canvas) console.log("Canvas: " + sample.canvas);
        });
        screenshots.forEach(output => console.log("Screenshot: " + output));
        fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
    } finally {
        clearTimeout(timeout);
        window.destroy();
    }
    app.exit(0);
}

function setupFixture(config) {
    const { EventEmitter } = require("events");
    const fs = require("fs"), path = require("path");
    const { pathToFileURL } = require("url");
    const state = window.testFixture = { config, commands: new Map(), palette: new Set(), saveCount: 0, projectSaves: [], navigations: [], externalNavigations: [], errors: [] };
    // Exercise native PNG conversion without ever replacing the user's clipboard.
    const electron = require("electron"), originalWriteImage = electron.clipboard.writeImage;
    state.clipboardImages = [];
    state.clipboardFailure = false;
    electron.clipboard.writeImage = function(image) {
        if (state.clipboardFailure) throw new Error("Fixture clipboard is unavailable");
        state.clipboardImages.push(image.toDataURL());
    };
    window.Electron_API = electron;
    state.restoreClipboard = function() { electron.clipboard.writeImage = originalWriteImage; };
    window.addEventListener("error", event => state.errors.push(event.message));
    window.addEventListener("unhandledrejection", event => state.errors.push(String(event.reason)));
    const addListener = window.addEventListener.bind(window), removeListener = window.removeEventListener.bind(window);
    state.resizeListeners = new Set();
    state.navigationListeners = new Map();
    const navigationEvents = new Set(["keydown","keyup","blur","visibilitychange","pointermove","pointerup","pointercancel"]);
    function trackNavigation(target,type,listener,adding) {
        if (!navigationEvents.has(type)) return;
        const key=target+":"+type;
        if (!state.navigationListeners.has(key)) state.navigationListeners.set(key,new Set());
        if (adding) state.navigationListeners.get(key).add(listener); else state.navigationListeners.get(key).delete(listener);
    }
    window.addEventListener = function(type, listener, options) { if (type === "resize") state.resizeListeners.add(listener); trackNavigation("window",type,listener,true); addListener(type, listener, options); };
    window.removeEventListener = function(type, listener, options) { if (type === "resize") state.resizeListeners.delete(listener); trackNavigation("window",type,listener,false); removeListener(type, listener, options); };
    const addDocumentListener=document.addEventListener.bind(document), removeDocumentListener=document.removeEventListener.bind(document);
    document.addEventListener=function(type,listener,options) {trackNavigation("document",type,listener,true);addDocumentListener(type,listener,options);};
    document.removeEventListener=function(type,listener,options) {trackNavigation("document",type,listener,false);removeDocumentListener(type,listener,options);};
    function makeDock(id) {
        const host = document.getElementById(id), tabs = document.createElement("div"), content = document.createElement("div"), panels = new Map();
        tabs.className = "dock-tabs"; content.className = "dock-content"; host.append(tabs, content);
        let selected;
        function update() {
            tabs.replaceChildren();
            panels.forEach((_element, name) => {
                const tab = document.createElement("button"); tab.textContent = name; tab.setAttribute("aria-selected", String(name === selected));
                tab.onclick = () => api.set(name); tabs.append(tab);
            });
            tabs.hidden = panels.size <= 1;
            host.hidden = !panels.size;
        }
        const api = { available: true, panels, tabs, content,
            add(name, element) { const wasActive = selected === name; panels.set(name, element); if (!selected || wasActive) api.set(name); update(); },
            set(name) { if (!panels.has(name)) return; selected = name; content.replaceChildren(panels.get(name)); update(); requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))); },
            remove(name, element) { if (!panels.has(name) || element && panels.get(name) !== element) return false; const old = panels.get(name); panels.delete(name); if (old.parentElement === content) old.remove(); if (selected === name) { selected = null; if (panels.size) api.set(panels.keys().next().value); } update(); return true; },
            get selected() { return selected; }
        };
        return api;
    }
    window.GMEdit = new EventEmitter();
    Object.assign(GMEdit, { sidebar: makeDock("right"), bottomPanel: makeDock("bottom"), leftBottomPanel: makeDock("left-bottom"),
        register(name, plugin) { if (name !== "goowee-preview") throw new Error("Unexpected plugin " + name); state.plugin = plugin; } });
    const outline = document.createElement("div"); outline.className = "outline-placeholder"; outline.textContent = "Outline View";
    GMEdit.sidebar.add("Outline View", outline);
    state.preferences = { current: {}, save() { state.saveCount++; },
        addInput(parent, label, value, changed) { const item = document.createElement("label"), input = document.createElement("input"); input.value = value; input.onchange = () => changed(input.value); item.append(document.createTextNode(label),input); parent.append(item); return item; },
        addCheckbox(parent, label, checked, changed) { const item = document.createElement("label"), input = document.createElement("input"); input.type = "checkbox"; input.checked = checked; input.onchange = () => changed(input.checked); item.append(input, document.createTextNode(label)); parent.append(item); return item; },
        addDropdown(parent, label, selected, options, changed) { const item = document.createElement("label"), input = document.createElement("select"); input.setAttribute("aria-label", label); options.forEach(value => { const option = document.createElement("option"); option.textContent = option.value = value; input.append(option); }); input.value = selected; input.onchange = () => changed(input.value); item.append(document.createTextNode(label), input); parent.append(item); return item; }
    };
    window.$gmedit = { "ui.Preferences": state.preferences, "gml.file.GmlFile": {current: null}, "gml.Project": {current: null},
        "gml.GmlAPI": {gmlMacros: {DIM: {expr: "sprite_get_width(s_preview_badge)"}}},
        "ui.project.ProjectProperties": {save(project,properties) {state.projectSaves.push({project,properties:JSON.parse(JSON.stringify(properties))});}},
        "electron.Dialog": {showOpenDialog(options,callback) {state.folderOptions=options;callback(state.folderSelection ? [state.folderSelection] : null);}} };
    $gmedit["gml.file.GmlFile"].open = function(name, sourcePath, navigation) { state.externalNavigations.push({name, path: sourcePath, navigation}); };
    window.AceCommands = { add(command) { state.commands.set(command.name, command); }, remove(command) { state.commands.delete(command.name); }, addToPalette(command) { state.palette.add(command); }, removeFromPalette(command) { state.palette.delete(command); } };
    window.aceEditor = { gotoLine(line) { state.navigations.push(line); }, focus() {} };
    state.newFile = function(name, source, sourcePath) { const session = new EventEmitter(); session.source = source; session.getValue = () => session.source; session.edit = source => { session.source = source; session.emit("change"); }; return {name, path: sourcePath || null, codeEditor: {session}}; };
    state.openFile = function(file) { $gmedit["gml.file.GmlFile"].current = file; document.getElementById("source").textContent = file ? file.codeEditor.session.source : ""; GMEdit.emit("activeFileChange", {file}); };
    state.fixtureSource = `#import "games.keevee.gw"
function preview_demo() {
    var panel = new gw_Panel(undefined);
    panel.size(gw_ABS(640), gw_ABS(370));
    var heading = new gw_Label(panel, "Council of the Long Jaunt");
    heading.style.text_style = new gw_TextStyle(-1, c_white);
    heading.size(gw_ABS(560), gw_ABS(42));
    heading.margin(24, 22, 0, 0);
    var body = new gw_Label(panel, "Choose the next research project");
    body.style.text_style = new gw_TextStyle(-1, c_white);
    body.size(gw_ABS(560), gw_ABS(40));
    body.margin(24, 72, 0, 0);
    var portrait = new gw_Image(panel, new gw_SpriteImage(s_preview_badge));
    portrait.size(gw_ABS(112), gw_ABS(112));
    portrait.margin(24, 132, 0, 0);
    var confirm = new gw_Button(panel);
    confirm.size(gw_ABS(220), gw_ABS(48));
    confirm.margin(24, 292, 0, 0);
    var caption = new gw_Label(confirm, "Begin research");
    caption.style.text_style = new gw_TextStyle(-1, c_white);
    caption.size(gw_REL(1), gw_REL(1));
    caption.style.text_alignment.horizontal = gw_Align.center;
    caption.style.text_alignment.vertical = gw_Align.center;
}
function alternate_view() {
    var alternate = new gw_Panel(undefined);
    alternate.size(gw_ABS(320), gw_ABS(200));
}`;
    const spriteCanvas = document.createElement("canvas"); spriteCanvas.width = spriteCanvas.height = 64;
    const context = spriteCanvas.getContext("2d"); context.fillStyle = "#406d8a"; context.fillRect(0, 0, 64, 64); context.strokeStyle = "#e7c77c"; context.lineWidth = 3; context.strokeRect(4, 4, 56, 56); context.fillStyle = "#e7c77c"; context.font = "40px serif"; context.textAlign = "center"; context.fillText("K", 32, 46);
    const spriteURL = spriteCanvas.toDataURL();
    $gmedit["gml.Project"].current = { yyResourceGUIDs: {}, yyResourceTypes: {s_preview_badge: "GMSprite"}, yyResources: {s_preview_badge: {id: {path: "sprites/s_preview_badge/s_preview_badge.yy"}}},
        readYyFileSync() { return {resourceType: "GMSprite", width: 64, height: 64, frames: [{name: "frame"}]}; }, getImageURL() { return spriteURL; } };
    state.loadProject = function(directory) {
        const yyResources = {}, yyResourceTypes = {};
        const spriteRoot = path.join(directory, "sprites");
        if (fs.existsSync(spriteRoot)) fs.readdirSync(spriteRoot, {withFileTypes: true}).filter(entry => entry.isDirectory()).forEach(entry => {
            yyResources[entry.name] = {id: {path: "sprites/" + entry.name + "/" + entry.name + ".yy"}}; yyResourceTypes[entry.name] = "GMSprite";
        });
        const fontRoot = path.join(directory, "fonts");
        if (fs.existsSync(fontRoot)) fs.readdirSync(fontRoot, {withFileTypes: true}).filter(entry => entry.isDirectory()).forEach(entry => {
            yyResources[entry.name] = {id: {path: "fonts/" + entry.name + "/" + entry.name + ".yy"}}; yyResourceTypes[entry.name] = "GMFont";
        });
        const scriptRoot = path.join(directory, "scripts"), lookup = {}, enums = {}, macros = {};
        if (fs.existsSync(scriptRoot)) fs.readdirSync(scriptRoot, {withFileTypes: true}).filter(entry => entry.isDirectory()).forEach(entry => {
            yyResources[entry.name] = {id: {path: "scripts/" + entry.name + "/" + entry.name + ".yy"}}; yyResourceTypes[entry.name] = "GMScript";
        });
        // Reproduce GMEdit's symbol index for shared construction helpers without
        // opening or modifying the user's running editor/project.
        for (const name of fs.readdirSync(scriptRoot, {withFileTypes:true}).filter(item=>item.isDirectory()).map(item=>item.name)) {
            const sourcePath = path.join(scriptRoot, name, name + ".gml");
            if (!fs.existsSync(sourcePath)) continue;
            const source = fs.readFileSync(sourcePath, "utf8");
            for (const match of source.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z_0-9]*)\s*\(/g)) {
                lookup[match[1]] = {path: sourcePath, row: source.slice(0, match.index).split("\n").length - 1};
            }
            for (const match of source.matchAll(/\benum\s+([A-Za-z_]\w*)\s*\{/g)) enums[match[1]] = {origin: sourcePath};
            for (const match of source.matchAll(/^\s*#macro\s+([A-Za-z_]\w*)\s+([^\r\n]*)/gm)) macros[match[1]] = {expr: match[2]};
            if (name === "gui_Global") lookup.GuiTextStyles = {path: sourcePath, row: 0};
        }
        const objectRoot=path.join(directory,"objects");
        if(fs.existsSync(objectRoot)) for(const item of fs.readdirSync(objectRoot,{withFileTypes:true})) if(item.isDirectory()) {
            const objectDirectory=path.join(objectRoot,item.name);
            for(const file of fs.readdirSync(objectDirectory).filter(file=>file.endsWith(".gml"))) {
                const sourcePath=path.join(objectDirectory,file), source=fs.readFileSync(sourcePath,"utf8");
                // Object symbols are indexed against the YY container in GMEdit.
                for(const match of source.matchAll(/\benum\s+([A-Za-z_]\w*)\s*\{/g)) enums[match[1]]={origin:path.join(objectDirectory,item.name+".yy")};
                for(const match of source.matchAll(/^\s*#macro\s+([A-Za-z_]\w*)\s+([^\r\n]*)/gm)) macros[match[1]]={expr:match[2]};
            }
        }
        $gmedit["gml.GmlAPI"].gmlLookup = lookup;
        $gmedit["gml.GmlAPI"].gmlEnums = enums;
        $gmedit["gml.GmlAPI"].gmlMacros = macros;
        return { dir: directory, properties: {}, yyResourceGUIDs: {}, yyResources, yyResourceTypes,
            fullPath(relative) { return path.join(directory, relative); },
            readTextFileSync(relative) { return fs.readFileSync(path.join(directory, relative), "utf8"); },
            readYyFileSync(relative) { return JSON.parse(fs.readFileSync(path.join(directory, relative), "utf8").replace(/,\s*([}\]])/g, "$1")); },
            getImageURL(relative) { return pathToFileURL(path.join(directory, relative)).href; }
        };
    };
}

async function runBrowserTests() {
    const state = window.testFixture, plugin = state.plugin;
    const { ipcRenderer } = require("electron");
    const fs = require("fs"), path = require("path");
    let tests = 0;
    const samples = [];
    let latestView, latestRenderOptions, latestExportOptions, latestScene, latestRenderer, latestTextDraws;
    const createRenderer = GooWeePreviewRenderer.create;
    GooWeePreviewRenderer.create = function(...args) {
        const renderer = createRenderer(...args), render = renderer.render, exportImage = renderer.exportImage;
        latestRenderer = renderer;
        renderer.render = function(scene, options) {
            const drawOffset = textDraws.length;
            latestScene = scene;
            latestRenderOptions = {...options};
            latestView = render.call(renderer, scene, options);
            latestTextDraws = textDraws.slice(drawOffset);
            return latestView;
        };
        renderer.exportImage = function(scene,reference,options) {
            latestExportOptions = options;
            return exportImage.call(renderer,scene,reference,options);
        };
        return renderer;
    };
    const textDraws = [], originalFillText = CanvasRenderingContext2D.prototype.fillText;
    const createFonts = GooWeePreviewFonts.create;
    GooWeePreviewFonts.create = function(...args) {
        const fonts = createFonts(...args), originalDraw = fonts.draw;
        fonts.draw = function(context,text,x,y,style) {
            textDraws.push({text,x,y,color:style.color,align:style.alignH,fontResource:style.fontResource});
            return originalDraw.call(fonts,context,text,x,y,style);
        };
        return fonts;
    };
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
        if (textDraws.length < 20000) textDraws.push({text: String(text), x, y, align: this.textAlign, color: this.fillStyle});
        return originalFillText.call(this, text, x, y, ...rest);
    };
    function check(condition, message) {
        if (!condition) throw new Error(message+(latestScene?"\nScene snapshot: "+writeScene("failed"):""));
        tests++;ipcRenderer.send("goowee-test-progress",message);
    }
    function visible(scene,node) {
        while(node) { if(node.hidden)return false; node=scene.nodes.find(parent=>parent.id===node.parentId); }
        return true;
    }
    function descendants(node) {
        const result=[], pending=[node];
        while(pending.length) { const item=pending.shift(); if(!item)continue; result.push(item); pending.push(...item.children); }
        return result;
    }
    function spriteLayers(sprite) {
        const result=[],pending=[sprite];
        while(pending.length) { const item=pending.shift();if(!item || !item.layers)continue;for(const layer of item.layers){result.push(layer);pending.push(layer.sprite);} }
        return result;
    }
    const actorEntries=["gui_actor_1_new_new","gui_actor_3_person_create","gui_actor_4_social_create","gui_actor_5_logs_create"];
    function checkActorFrame(scene,entry,sample) {
        const main=scene.roots.find(node=>node.name==="canvas");
        check(scene.entry===entry && main && main.width===405 && main.height===495,"Shared actor initialization must build the source-defined window for "+entry);
        const tabPanel=scene.nodes.find(node=>node.type==="GuiRoughTabButtonAutoWidthPanel"), buttons=tabPanel && tabPanel.children.filter(node=>node.type==="Button");
        check(buttons && buttons.length===4 && buttons.every((button,i)=>button.width>80 && button.width<110 && (!i || button.x>=buttons[i-1].x+buttons[i-1].width-1)),"Shared source-defined actor tabs must stay separate for "+entry);
        const tabBackgrounds=buttons.map(button=>descendants(button).find(node=>node.sprite && node.sprite.name==="ns_tab_button_rough"));
        check(tabBackgrounds.every((node,i)=>node && node.sprite.index===(i===actorEntries.indexOf(entry)?1:0)),"The current actor tab must follow the selected entry rather than always activating the first tab: "+entry);
        const expectedIcons=["s_icon_tab_info","s_icon_tab_person","s_icon_tab_social","s_icon_tab_log"];
        check(buttons.every((button,i)=>descendants(button).some(node=>node.sprite && node.sprite.name===expectedIcons[i])),"Actor tab icons must survive source-defined tab discovery for "+entry);
        check(scene.nodes.some(node=>node.text===sample.name && visible(scene,node)),"All actor tabs must receive the same sample identity: "+entry);
        check(!scene.nodes.some(node=>visible(scene,node) && node.text && /\{[^{}]+\}/.test(node.text)),"The configured actor scenario must not show unresolved text placeholders in "+entry);
        const seen=new Set(), pending=scene.roots.slice(); let duplicate=false;
        while(pending.length) { const node=pending.shift(); if(seen.has(node.id)){duplicate=true;break;}seen.add(node.id);pending.push(...node.children); }
        check(!duplicate && seen.size===scene.nodes.length,"Switching actor tabs must build one isolated hierarchy without retained or duplicated nodes: "+entry);
        if(entry!==actorEntries[0])check(!scene.nodes.some(node=>node.name==="mood_label" || node.name==="button_mind"),"Other actor tabs must not retain the general tab's mood contents: "+entry);
        if(entry===actorEntries[1])check(scene.nodes.filter(node=>node.name==="stack_skill").length===Object.keys(sample.skills.levels).length,"The personality tab must populate all sampled skills through the project's Skills formatter");
        if(entry===actorEntries[2]) {
            const relationNames=scene.nodes.filter(node=>node.name==="label_name" && visible(scene,node)).map(node=>node.text);
            check(relationNames.length===1 && relationNames[0]===sample.important_person.name,"The source current-location filter must show only the related character and exclude self even when action controls are hidden");
            const marks=scene.nodes.filter(node=>node.sprite && node.sprite.name==="spr_checkbox_dot");
            check(marks.length===5 && marks.every((node,i)=>node.sprite.alpha===(i===0?1:0)),"Only the source-selected social filter may show its radio mark; false opacity must remain transparent");
        }
        if(entry===actorEntries[3])check(scene.nodes.some(node=>node.name==="day_and_age_label" && visible(scene,node)) && scene.nodes.filter(node=>node.name==="label" && node.text && visible(scene,node)).length>4,"The history tab must render sampled log bodies as well as their dates");
        return main;
    }
    function currentPanel() { return [...GMEdit.sidebar.panels, ...GMEdit.bottomPanel.panels, ...GMEdit.leftBottomPanel.panels].find(pair => pair[0] === "GooWee Preview")[1]; }
    function emitChange(element, value) { element.value = value; element.dispatchEvent(new Event("change")); }
    function writeScene(name) {
        const snapshotPath=path.join(path.dirname(state.config.localizationProject),name+"-scene.json");
        fs.writeFileSync(snapshotPath,JSON.stringify({entry:latestScene.entry,stats:latestScene.stats,view:latestView,diagnostics:latestScene.diagnostics,roots:latestScene.roots.map(node=>node.id),nodes:latestScene.nodes.map(node=>({id:node.id,parentId:node.parentId,name:node.name,type:node.type,x:node.x,y:node.y,width:node.width,height:node.height,hidden:node.hidden,approximate:node.approximate,text:node.text,sourcePath:node.sourcePath,line:node.line,sprite:node.sprite,background:node.background,style:node.style,children:node.children.map(child=>child.id)}))},null,2));
        return snapshotPath;
    }
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function settle() { await wait(300); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
    check(!!plugin, "The plugin must register successfully");
    const file = state.newFile("preview_demo", state.fixtureSource);
    state.openFile(file);
    plugin.init();
    await settle();
    check(GMEdit.sidebar.selected === "Outline View" && GMEdit.sidebar.panels.size === 2, "Startup must register a shared right tab without stealing Outline selection");
    check(file.codeEditor.session.listenerCount("change") === 1, "The active unsaved buffer must have one change listener");
    GMEdit.sidebar.set("GooWee Preview");
    await settle();
    let panel = currentPanel();
    if (state.config.sampleName) {
        const sampleProject=state.loadProject(state.config.projectPath), name=state.config.sampleName;
        sampleProject.properties.gooWeePreview={localeLanguage:"Russian"};
        $gmedit["gml.Project"].current=sampleProject; GMEdit.emit("projectOpen",{});
        const sourcePath=path.join(state.config.projectPath,"scripts",name,name+".gml");
        state.openFile(state.newFile(name,fs.readFileSync(sourcePath,"utf8"),sourcePath)); await settle();
        emitChange(panel.querySelector(".gw-entry"),state.config.sampleEntry); await settle();
        emitChange(panel.querySelector('[aria-label="Preview zoom"]'),"fit");
        if(state.config.cleanSample){const bounds=panel.querySelector('[aria-label="Show approximate bounds"]');bounds.checked=false;bounds.dispatchEvent(new Event("change"));}
        await wait(800); await settle();
        check(latestScene && latestScene.nodes.length>0,"The selected project sample must produce a preview");
        const snapshot=writeScene(name);
        const canvasPath=path.join(path.dirname(state.config.localizationProject),name+"-canvas.png");
        fs.writeFileSync(canvasPath,Buffer.from(panel.querySelector("canvas").toDataURL("image/png").split(",")[1],"base64"));
        await ipcRenderer.invoke("goowee-test-capture",name);
        samples.push({name,elements:latestScene.nodes.length,roots:latestScene.roots.length,snapshot,canvas:canvasPath});
        plugin.cleanup(); CanvasRenderingContext2D.prototype.fillText=originalFillText; state.restoreClipboard();
        return {tests,samples};
    }
    check(panel.querySelectorAll(".gw-node").length >= 6, "The real engine must populate the element tree");
    const canvas = panel.querySelector("canvas");
    check(!canvas.hidden && canvas.width > 100 && canvas.height > 90, "The real canvas renderer must draw at dock dimensions");
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 128) colors.add(pixels[i] + "," + pixels[i + 1] + "," + pixels[i + 2]);
    check(colors.size > 10, "The canvas must contain rendered content, not a blank surface");
    const caption = GooWeePreviewEngine.analyze(state.fixtureSource, {width: 1920, height: 1080, entry: "preview_demo", assets: {}}).nodes.find(node => node.name === "caption");
    check(caption.style.alignH === 1 && caption.style.alignV === 1 && textDraws.some(draw => draw.text === "Begin research" && draw.align === "center" && draw.x === caption.x + caption.width / 2 && draw.y === caption.y + (caption.height - caption.style.fontSize * 1.25) / 2), "Numeric GooWee center alignment must paint text at the horizontal and vertical center of its label");
    const entry = panel.querySelector(".gw-entry");
    check(entry.options.length === 2 && entry.value === "preview_demo" && !entry.disabled, "The function selector must show a named, usable default entry");
    emitChange(entry, "alternate_view"); await settle();
    check(panel.querySelectorAll(".gw-node").length === 1, "Entry selector must rebuild the chosen function only");
    emitChange(entry, "preview_demo"); await settle();
    const node = panel.querySelector(".gw-node"); node.dispatchEvent(new MouseEvent("dblclick", {bubbles: true}));
    check(state.navigations.length === 1 && state.navigations[0] > 1, "Double-clicking an element must navigate to its GML source line");
    await ipcRenderer.invoke("goowee-test-capture", "fixture-preview");

    // Navigation must operate on the preview camera, even when Fit has no scrollbars.
    const stage = panel.querySelector(".gw-stage"), zoom = panel.querySelector('[aria-label="Preview zoom"]');
    const approximate = panel.querySelector('[aria-label="Show approximate bounds"]');
    check(!!approximate && approximate.checked && latestRenderOptions.approximateOutlines === true, "Approximate dashed bounds must have their own enabled checkbox");
    approximate.click(); await settle();
    check(state.preferences.current.gooWeePreview.approximateOutlines === false && latestRenderOptions.approximateOutlines === false, "The dashed-bounds checkbox must update rendering and save independently of Bounds");
    const sharpPixels=panel.querySelector('[aria-label="Sharp pixels"]');
    check(sharpPixels && !sharpPixels.checked && latestRenderOptions.sharpPixels === false,"Sharp pixels must have a distinct checkbox with ordinary sampling enabled by default");
    sharpPixels.click();await settle();
    check(state.preferences.current.gooWeePreview.sharpPixels === true && latestRenderOptions.sharpPixels === true,"Sharp pixels must immediately update renderer sampling and persist the global display preference");
    sharpPixels.click();await settle();
    check(state.preferences.current.gooWeePreview.sharpPixels === false && latestRenderOptions.sharpPixels === false,"Unchecking sharp pixels must restore normal renderer sampling");
    function pointer(target, type, x, y, buttons, button, ctrlKey) {
        const event = new PointerEvent(type, {bubbles:true, cancelable:true, pointerId:41, pointerType:"mouse", isPrimary:true, button:button == null ? 0 : button, buttons:buttons == null ? 1 : buttons, ctrlKey:!!ctrlKey, clientX:x, clientY:y});
        target.dispatchEvent(event); return event;
    }
    function space(target, type) {
        const event = new KeyboardEvent(type, {bubbles:true, cancelable:true, key:" ", code:"Space"});
        target.dispatchEvent(event); return event;
    }
    function wheel(target, x, y, deltaY, ctrlKey) {
        const event = new WheelEvent("wheel", {bubbles:true, cancelable:true, clientX:x, clientY:y, deltaY, ctrlKey});
        target.dispatchEvent(event); return event;
    }
    async function paint() { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
    function worldAt(x, y) {
        const rect = canvas.getBoundingClientRect();
        return {x:(x-rect.left-latestView.x)/latestView.scale, y:(y-rect.top-latestView.y)/latestView.scale};
    }
    function close(a,b) { return Math.abs(a-b)<0.05; }
    const copyButton=panel.querySelector(".gw-copy"), copyStatus=panel.querySelector(".gw-copy-status");
    check(copyButton && copyButton.querySelector("svg") && copyButton.getAttribute("aria-label") && !copyButton.disabled && copyStatus && copyStatus.getAttribute("role")==="status", "Preview image copying must have an accessible icon button and announced feedback");
    let originalCopyPixels=null, originalCopySize=null;
    async function waitForCopy() {
        const deadline=performance.now()+6000;
        while(copyButton.disabled && performance.now()<deadline)await wait(10);
        await paint();
    }
    async function checkCopiedInterface(label) {
        const previousCount=state.clipboardImages.length, previousView={...latestView};
        const previousCanvas=canvas.toDataURL(), previousScroll=[stage.scrollLeft,stage.scrollTop];
        copyButton.click(); await waitForCopy();
        check(state.clipboardImages.length===previousCount+1 && /^data:image\/png;base64,/.test(state.clipboardImages[previousCount]), label+" must send one PNG image to the mocked native clipboard");
        const copied=new Image();
        await new Promise((resolve,reject)=>{copied.onload=resolve;copied.onerror=reject;copied.src=state.clipboardImages[previousCount];});
        const width=copied.naturalWidth,height=copied.naturalHeight;
        const target=document.createElement("canvas");target.width=width;target.height=height;
        const context=target.getContext("2d");context.drawImage(copied,0,0);
        const actual=context.getImageData(0,0,width,height).data;
        if(!originalCopyPixels) {
            originalCopyPixels=actual;originalCopySize=[width,height];
            fs.writeFileSync(path.join(path.dirname(state.config.localizationProject),"fixture-interface-export.png"),Buffer.from(state.clipboardImages[previousCount].split(",")[1],"base64"));
            const alphaAt=(x,y)=>actual[(y*width+x)*4+3];
            const edgeHasInk=(length,point)=>Array.from({length},(_,i)=>point(i)).some(([x,y])=>alphaAt(x,y)>0);
            check(width<640 && height<370 && edgeHasInk(width,i=>[i,0]) && edgeHasInk(width,i=>[i,height-1]) && edgeHasInk(height,i=>[0,i]) && edgeHasInk(height,i=>[width-1,i]),"Copy must trim the empty root layout and every fully transparent outer row and column");
            check(Array.from({length:width*height},(_,i)=>actual[i*4+3]).some(alpha=>alpha===0),"Copy must retain transparent gaps between interface elements instead of the workspace background");
            const badgePixels=[];
            for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
                const i=(y*width+x)*4;
                if(actual[i]===64 && actual[i+1]===109 && actual[i+2]===138 && actual[i+3]===255)badgePixels.push([x,y]);
            }
            check(badgePixels.length>0 && Math.max(...badgePixels.map(p=>p[0]))-Math.min(...badgePixels.map(p=>p[0]))+1===112 && Math.max(...badgePixels.map(p=>p[1]))-Math.min(...badgePixels.map(p=>p[1]))+1===112,"Copy must include the complete loaded sprite at its original 112 by 112 layout pixels");
        }
        check(width===originalCopySize[0] && height===originalCopySize[1] && actual.length===originalCopyPixels.length && actual.every((value,index)=>value===originalCopyPixels[index]),label+" must copy the same complete original-size interface independently of viewport scale, pan, scroll and display density");
        check(canvas.toDataURL()===previousCanvas && stage.scrollLeft===previousScroll[0] && stage.scrollTop===previousScroll[1] && close(latestView.scale,previousView.scale) && close(latestView.x,previousView.x) && close(latestView.y,previousView.y) && !copyButton.disabled && /Copied/.test(copyStatus.textContent),label+" must report success without changing live preview pixels, camera or scrolling");
    }
    await checkCopiedInterface("Fit preview copy");
    check(latestExportOptions && latestExportOptions.sharpPixels === false,"Copy must explicitly forward the current normal sprite sampling preference");
    sharpPixels.click();await paint();
    const sharpCopiesBefore=state.clipboardImages.length;
    copyButton.click();await waitForCopy();
    check(state.clipboardImages.length===sharpCopiesBefore+1 && latestExportOptions && latestExportOptions.sharpPixels === true,"Copy must forward the selected sharp sprite sampling mode to the original-size renderer");
    sharpPixels.click();await paint();
    const nativePixelRatio=Object.getOwnPropertyDescriptor(window,"devicePixelRatio");
    Object.defineProperty(window,"devicePixelRatio",{configurable:true,value:1.5});
    window.dispatchEvent(new Event("resize"));await paint();
    await checkCopiedInterface("High-DPI preview copy");
    if(nativePixelRatio)Object.defineProperty(window,"devicePixelRatio",nativePixelRatio);else delete window.devicePixelRatio;
    window.dispatchEvent(new Event("resize"));await paint();
    const copiesBeforeFailure=state.clipboardImages.length;
    state.clipboardFailure=true;copyButton.click();await waitForCopy();state.clipboardFailure=false;
    check(state.clipboardImages.length===copiesBeforeFailure && /Copy failed:/.test(copyStatus.textContent) && !copyButton.disabled,"A native clipboard failure must remain visible and leave copying retryable");
    await checkCopiedInterface("Retry after clipboard failure");
    {
        // Refresh clears resources/fonts while an export may still be awaiting them.
        const copyRenderer=latestRenderer,exportImage=copyRenderer.exportImage;
        const staleImage=await exportImage.call(copyRenderer,latestScene),copiesBeforeRefresh=state.clipboardImages.length;
        let completePendingExport;
        copyRenderer.exportImage=()=>new Promise(resolve=>{completePendingExport=resolve;});
        try {
            copyButton.click();
            check(copyButton.disabled && typeof completePendingExport==="function","An unresolved export must keep the copy button busy until it finishes or is cancelled");
            [...panel.querySelectorAll(".gw-toolbar button")].find(button=>button.textContent==="Refresh").click();
            await settle();
            check(!copyButton.disabled && /cancel/i.test(copyStatus.textContent),"Refreshing resources during export must cancel the pending copy, announce cancellation and restore the button");
            completePendingExport(staleImage);await paint();
            check(state.clipboardImages.length===copiesBeforeRefresh && !copyButton.disabled && /cancel/i.test(copyStatus.textContent),"A stale export completing after Refresh must not overwrite the clipboard or its cancellation feedback");
        } finally {copyRenderer.exportImage=exportImage;}
        await checkCopiedInterface("Retry after cancelling a resource refresh copy");
    }
    const rect = stage.getBoundingClientRect(), px = rect.left+220, py = rect.top+170;
    stage.focus();
    check(space(stage,"keydown").defaultPrevented, "Space focused on the preview must enter pan mode without scrolling the page");
    const panStart = {...latestView}, inspectionBeforePan = panel.querySelector(".gw-inspection").textContent, navigationsBeforePan = state.navigations.length;
    pointer(canvas,"pointerdown",px,py); pointer(window,"pointermove",px+70,py-35); await paint();
    check(close(latestView.x,panStart.x+70) && close(latestView.y,panStart.y-35), "Space plus left drag must pan Fit view by the pointer displacement");
    pointer(window,"pointerup",px+70,py-35,0);
    canvas.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:px+70,clientY:py-35}));
    canvas.dispatchEvent(new MouseEvent("dblclick",{bubbles:true,clientX:px+70,clientY:py-35}));
    check(panel.querySelector(".gw-inspection").textContent === inspectionBeforePan && state.navigations.length === navigationsBeforePan, "A pan gesture must not select an element or navigate to its source");
    space(stage,"keyup");
    const held = {...latestView}; pointer(window,"pointermove",px+150,py+50,0); await paint();
    check(close(latestView.x,held.x) && close(latestView.y,held.y), "Releasing Space and the pointer must stop panning");
    await checkCopiedInterface("Panned preview copy");

    const middleStart = {...latestView};
    check(pointer(canvas,"pointerdown",px,py,4,1).defaultPrevented, "Middle-button dragging must consume pointerdown without requiring Space");
    const middleMouse = new MouseEvent("mousedown",{bubbles:true,cancelable:true,button:1,buttons:4,clientX:px,clientY:py});
    canvas.dispatchEvent(middleMouse);
    check(middleMouse.defaultPrevented, "Middle mousedown must suppress Chromium autoscroll inside the preview");
    pointer(window,"pointermove",px-45,py+25,4,1); await paint();
    check(close(latestView.x,middleStart.x-45) && close(latestView.y,middleStart.y+25), "Dragging the held wheel must pan by the pointer displacement");
    space(stage,"keydown"); space(stage,"keyup");
    pointer(window,"pointermove",px-65,py+45,4,1); await paint();
    check(close(latestView.x,middleStart.x-65) && close(latestView.y,middleStart.y+45), "Releasing Space must not cancel a middle-button drag");
    pointer(window,"pointerup",px-65,py+45,0,1);
    const middleAux = new MouseEvent("auxclick",{bubbles:true,cancelable:true,button:1,clientX:px-65,clientY:py+45});
    canvas.dispatchEvent(middleAux);
    check(middleAux.defaultPrevented && panel.querySelector(".gw-inspection").textContent === inspectionBeforePan && state.navigations.length === navigationsBeforePan, "A middle drag must suppress auxiliary clicks and leave selection/source navigation unchanged");
    const middleReleased={...latestView}; pointer(window,"pointermove",px+120,py+120,0,1); await paint();
    check(close(latestView.x,middleReleased.x) && close(latestView.y,middleReleased.y), "Releasing the wheel must stop its drag");
    pointer(canvas,"pointerdown",px,py,4,1); pointer(window,"pointercancel",px,py,0,1);
    pointer(window,"pointermove",px+100,py+100,4,1); await paint();
    check(close(latestView.x,middleReleased.x) && close(latestView.y,middleReleased.y), "Pointer cancellation must stop a wheel drag");
    pointer(canvas,"pointerdown",px,py,4,1); window.dispatchEvent(new Event("blur"));
    pointer(window,"pointermove",px+100,py+100,4,1); await paint();
    check(close(latestView.x,middleReleased.x) && close(latestView.y,middleReleased.y), "Window blur must stop a wheel drag without a release event");

    const normalScale = latestView.scale;
    check(!wheel(stage,px,py,100,false).defaultPrevented, "Ordinary wheel scrolling must keep its browser behavior");
    await paint(); check(latestView.scale === normalScale, "Ordinary wheel scrolling must not change preview zoom");
    const anchor = worldAt(px,py);
    check(wheel(stage,px,py,-100,true).defaultPrevented, "Ctrl plus wheel over the preview must consume browser zoom");
    await paint();
    const afterZoom = worldAt(px,py);
    check(latestView.scale > normalScale && Number(zoom.value) === latestView.scale && /%/.test(zoom.selectedOptions[0].textContent), "Ctrl plus wheel must increase the actual zoom and display its percentage");
    check(close(anchor.x,afterZoom.x) && close(anchor.y,afterZoom.y), "Wheel zoom must keep the world point under the cursor stationary after a pan");
    const inScale = latestView.scale;
    wheel(stage,px,py,100,true); await paint();
    check(latestView.scale < inScale, "The opposite wheel direction must zoom out");

    emitChange(zoom,"2"); await paint(); stage.scrollLeft=200; stage.scrollTop=80; await paint();
    check(stage.scrollLeft > 0, "The navigation fixture must exercise an actually scrolled preview");
    await checkCopiedInterface("Scrolled and zoomed preview copy");
    const scrolledAnchor = worldAt(px,py);
    wheel(stage,px,py,200,true); await paint();
    const afterScrolledZoom = worldAt(px,py);
    check(close(scrolledAnchor.x,afterScrolledZoom.x) && close(scrolledAnchor.y,afterScrolledZoom.y), "Cursor anchoring must account for scrolling and scroll clamping when zooming out");
    emitChange(zoom,"fit"); await paint();
    check(latestRenderOptions.panX === 0 && latestRenderOptions.panY === 0 && stage.scrollLeft === 0 && stage.scrollTop === 0, "Selecting Fit must reset pan and scrolling so the scene is recoverable");

    stage.focus(); space(stage,"keydown"); pointer(canvas,"pointerdown",px,py);
    window.dispatchEvent(new Event("blur"));
    const beforeBlurMove={...latestView}; pointer(window,"pointermove",px+100,py+100); await paint();
    check(close(latestView.x,beforeBlurMove.x) && close(latestView.y,beforeBlurMove.y), "Losing window focus must cancel a drag even without pointerup or keyup");
    const editable=document.createElement("textarea"); document.getElementById("editor").appendChild(editable); editable.focus();
    stage.dispatchEvent(new PointerEvent("pointerenter",{pointerType:"mouse"}));
    check(!space(editable,"keydown").defaultPrevented, "Space in an editor input must remain editable even when the pointer is over the preview");
    space(editable,"keyup"); editable.remove();
    const outsideWheel=wheel(document.getElementById("editor"),100,100,-100,true);
    check(!outsideWheel.defaultPrevented, "Ctrl wheel outside the preview must not be intercepted");

    // A fresh ordinary click must still hit the rendered element after all gestures.
    const canvasRect=canvas.getBoundingClientRect(), hitX=canvasRect.left+latestView.x+60*latestView.scale, hitY=canvasRect.top+latestView.y+35*latestView.scale;
    pointer(canvas,"pointerdown",hitX,hitY); pointer(window,"pointerup",hitX,hitY,0);
    canvas.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:hitX,clientY:hitY})); await paint();
    check(/^heading ·/.test(panel.querySelector(".gw-inspection").textContent), "Ordinary clicking after a drag must still select the element under the cursor");
    await checkCopiedInterface("Selected element preview copy");

    // Blob references without a disk path remain per-script session samples.
    const referenceToggle=panel.querySelector('[aria-label="Reference"]');
    const referenceToolbar=panel.querySelector(".gw-reference-toolbar");
    const referenceVisible=panel.querySelector('[aria-label="Show reference"]');
    const referenceFile=panel.querySelector(".gw-reference-file");
    const referenceName=panel.querySelector(".gw-reference-name");
    const referenceError=panel.querySelector(".gw-reference-error");
    const referenceX=panel.querySelector('[aria-label="Reference offset X"]');
    const referenceY=panel.querySelector('[aria-label="Reference offset Y"]');
    check(referenceToggle && !referenceToggle.checked && referenceToolbar && referenceToolbar.hidden && referenceVisible && referenceVisible.checked,
        "Reference controls must start with a hidden toolbar and a secondary visibility checkbox enabled for the first chosen image");
    check(referenceFile && referenceFile.type==="file" && referenceFile.accept.includes("image") && referenceName && /no.*file|not.*selected/i.test(referenceName.textContent),
        "The reference toolbar must expose an image file picker and an explicit empty filename state");
    const referenceSaveCount=state.saveCount,referenceProjectSaves=state.projectSaves.length;
    const referencePrefs=JSON.stringify(state.preferences.current);
    emitChange(zoom,"1"); await paint();
    referenceToggle.click(); await paint();
    check(!referenceToolbar.hidden && !latestRenderOptions.reference && !canvas.hidden,
        "The master reference checkbox must reveal the toolbar while leaving the GUI visible until an image is chosen");
    let pickerClicks=0;
    const preventPicker=event=>{event.preventDefault();pickerClicks++;};
    referenceFile.addEventListener("click",preventPicker);
    panel.querySelector(".gw-reference-choose").click();
    referenceFile.removeEventListener("click",preventPicker);
    check(pickerClicks===1,"Choose file must invoke the image picker from its button without writing project configuration");
    const referenceSource=document.createElement("canvas");referenceSource.width=160;referenceSource.height=96;
    const referenceContext=referenceSource.getContext("2d");
    referenceContext.fillStyle="#e13588";referenceContext.fillRect(0,0,160,96);
    referenceContext.fillStyle="#35a3e1";referenceContext.fillRect(25,18,110,60);
    referenceContext.fillStyle="#ffffff";referenceContext.font="bold 20px sans-serif";referenceContext.fillText("Reference",32,55);
    const referenceBlob=await new Promise(resolve=>referenceSource.toBlob(resolve,"image/png"));
    function setReferenceFiles(files) {
        const transfer=new DataTransfer();files.forEach(item=>transfer.items.add(item));
        referenceFile.files=transfer.files;referenceFile.dispatchEvent(new Event("change"));
    }
    async function waitForReference(test,message) {
        const deadline=performance.now()+3000;
        while(!test() && performance.now()<deadline)await wait(10);
        await paint();check(test(),message);
    }
    setReferenceFiles([new File([referenceBlob],"reference fixture.png",{type:"image/png"})]);
    await waitForReference(()=>!!latestRenderOptions.reference,"Selecting a decoded image must replace the GUI with the reference when both checkboxes are enabled");
    check(referenceName.textContent.includes("reference fixture.png") && !referenceError.textContent && latestRenderOptions.reference.image.naturalWidth===160 && latestRenderOptions.reference.image.naturalHeight===96,
        "The reference filename and decoded native dimensions must match the selected local image");
    function referencePixels() {
        const data=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
        let left=Infinity,top=Infinity,right=-1,bottom=-1;
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
            const i=(y*canvas.width+x)*4;
            if(data[i]!==225 || data[i+1]!==53 || data[i+2]!==136 || data[i+3]!==255)continue;
            left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
        return {left,top,right,bottom,width:right-left+1,height:bottom-top+1};
    }
    const referenceBasePixels=referencePixels(),referenceBaseView={...latestView};
    check(referenceBasePixels.width===160 && referenceBasePixels.height===96 && latestTextDraws.length===0,
        "Reference mode must draw the image at native dimensions at 100% and omit GUI text entirely");
    const referenceInspection=panel.querySelector(".gw-inspection").textContent,referenceNavigation=state.navigations.length;
    const referenceCanvasRect=canvas.getBoundingClientRect();
    const referenceClickX=referenceCanvasRect.left+referenceBasePixels.left+30,referenceClickY=referenceCanvasRect.top+referenceBasePixels.top+30;
    pointer(canvas,"pointerdown",referenceClickX,referenceClickY);pointer(window,"pointerup",referenceClickX,referenceClickY,0);
    canvas.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:referenceClickX,clientY:referenceClickY}));
    canvas.dispatchEvent(new MouseEvent("dblclick",{bubbles:true,clientX:referenceClickX,clientY:referenceClickY,ctrlKey:true}));await paint();
    check(panel.querySelector(".gw-inspection").textContent===referenceInspection && state.navigations.length===referenceNavigation,
        "Clicking or Ctrl-double-clicking a reference must not select or navigate hidden GUI elements");
    emitChange(referenceX,"37");emitChange(referenceY,"29");await paint();
    const referenceShiftedPixels=referencePixels();
    check(referenceShiftedPixels.left===referenceBasePixels.left+37 && referenceShiftedPixels.top===referenceBasePixels.top+29 && close(latestView.x,referenceBaseView.x) && close(latestView.y,referenceBaseView.y),
        "Reference X/Y offsets must move image pixels on the existing GUI camera instead of recentering the fitted bounds");
    emitChange(referenceX,"-8");emitChange(referenceY,"-7");await paint();
    const referenceNegativePixels=referencePixels();
    check(referenceNegativePixels.left===referenceBasePixels.left-8 && referenceNegativePixels.top===referenceBasePixels.top-7,
        "Reference offsets must support negative positions in GUI pixel coordinates");
    const referenceBeforePan={...latestView};
    pointer(canvas,"pointerdown",referenceClickX,referenceClickY,4,1);pointer(window,"pointermove",referenceClickX+24,referenceClickY+18,4,1);pointer(window,"pointerup",referenceClickX+24,referenceClickY+18,0,1);await paint();
    check(close(latestView.x,referenceBeforePan.x+24) && close(latestView.y,referenceBeforePan.y+18) && referencePixels().left===referenceNegativePixels.left+24,
        "Middle-button panning must continue to move the visible reference with the preview camera");
    const referenceBeforeZoom=latestView.scale;
    wheel(stage,referenceClickX+50,referenceClickY+40,-100,true);await paint();
    check(latestView.scale>referenceBeforeZoom && referencePixels().width>160 && latestRenderOptions.reference.x===-8 && latestRenderOptions.reference.y===-7,
        "Ctrl-wheel zoom must scale the reference without modifying its logical offsets");
    emitChange(zoom,"1");await paint();
    referenceVisible.click();await paint();
    check(!referenceToolbar.hidden && !latestRenderOptions.reference && latestTextDraws.length>0 && referencePixels().right<0,
        "Turning off only Show reference must restore the GUI while keeping all reference controls available");
    referenceToggle.click();await paint();
    check(referenceToolbar.hidden && !latestRenderOptions.reference,"The master checkbox must hide the entire reference toolbar and leave the GUI visible");
    referenceToggle.click();await paint();
    check(!referenceToolbar.hidden && !referenceVisible.checked && !latestRenderOptions.reference,
        "Re-enabling the master checkbox must respect the secondary checkbox's previous off state");
    referenceVisible.click();await paint();
    const referenceImage=latestRenderOptions.reference.image;
    check(referenceName.textContent.includes("reference fixture.png") && latestRenderOptions.reference.x===-8 && latestRenderOptions.reference.y===-7 && referencePixels().right>=0,
        "Toggling reference visibility must preserve the loaded image and offsets within the session");
    referenceToggle.click();await paint();
    check(!latestRenderOptions.reference && referencePixels().right<0 && latestTextDraws.some(draw=>draw.text==="Council of the Long Jaunt") && latestTextDraws.some(draw=>draw.text==="Begin research"),
        "Disabling the master checkbox while Show reference is enabled must restore the GUI contents");
    referenceToggle.click();await paint();
    await ipcRenderer.invoke("goowee-test-capture","reference-preview");
    setReferenceFiles([]);await paint();
    check(latestRenderOptions.reference.image===referenceImage && referenceName.textContent.includes("reference fixture.png"),
        "Cancelling the file picker must preserve the current reference");
    setReferenceFiles([new File(["not a decoded image"],"broken.png",{type:"image/png"})]);
    await waitForReference(()=>!!referenceError.textContent,"An invalid image must report a visible reference-loading error");
    check(latestRenderOptions.reference.image===referenceImage && referenceName.textContent.includes("reference fixture.png"),
        "A failed image replacement must retain the last usable reference and its filename");
    emitChange(entry,"alternate_view");await settle();
    check(!latestRenderOptions.reference && /no.*file|not.*selected/i.test(referenceName.textContent) && referenceX.value==="0" && referenceY.value==="0",
        "A second function in an unnamed script must not inherit the first function's temporary reference");
    setReferenceFiles([new File([referenceBlob],"alternate session reference.png",{type:"image/png"})]);
    await waitForReference(()=>referenceName.textContent==="alternate session reference.png" && !!latestRenderOptions.reference,
        "An alternate function must accept its own temporary reference");
    emitChange(referenceX,"21");emitChange(referenceY,"34");await paint();
    emitChange(entry,"preview_demo");await settle();
    check(referenceName.textContent==="reference fixture.png" && referenceX.value==="-8" && referenceY.value==="-7" && latestRenderOptions.reference,
        "Switching back to the first function must restore its own Blob image and offsets");
    emitChange(entry,"alternate_view");await settle();
    check(referenceName.textContent==="alternate session reference.png" && referenceX.value==="21" && referenceY.value==="34" && latestRenderOptions.reference,
        "Temporary reference offsets must be retained separately for each entry function");
    emitChange(entry,"preview_demo");await settle();
    const referenceNotes=state.newFile("reference_notes","function notes_without_gui() { return 1; }");
    state.openFile(referenceNotes);await settle();
    check(canvas.hidden && !panel.querySelector(".gw-empty").hidden && copyButton.disabled && /no.*file|not.*selected/i.test(referenceName.textContent),
        "Switching to another script must clear the previous script's reference rather than showing it on a non-GooWee tab");
    state.openFile(file);await settle();
    check(!canvas.hidden && latestRenderOptions.reference && referenceName.textContent.includes("reference fixture.png") && referenceX.value==="-8" && referenceY.value==="-7",
        "Returning to a GooWee tab must preserve the session reference and its logical offsets");
    check(state.saveCount===referenceSaveCount && state.projectSaves.length===referenceProjectSaves && JSON.stringify(state.preferences.current)===referencePrefs,
        "An unnamed script's Blob reference and checkbox states must remain in memory without global or project preference writes");
    referenceToggle.click();emitChange(zoom,"fit");await paint();

    // Actual disk files persist by script; project-owned paths are portable.
    let referencePersistence;
    {
        const previousProject=$gmedit["gml.Project"].current;
        const referenceDirectory=path.join(state.config.localizationProject,"reference-project");
        const relocatedDirectory=path.join(state.config.localizationProject,"relocated-reference-project");
        const alphaRelative="scripts/alpha/alpha.gml",betaRelative="scripts/beta/beta.gml",legacyRelative="scripts/legacy/legacy.gml";
        const sharedA=path.join(referenceDirectory,"art/shared-a.png");
        const sharedB=path.join(referenceDirectory,"art/shared-b.png");
        const privatePath=path.join(state.config.localizationProject,"private-reference.png");
        const privateAlternatePath=path.join(state.config.localizationProject,"private-alternate.png");
        const draftImagePath=path.join(state.config.localizationProject,"draft-reference.png");
        const svgPath=path.join(relocatedDirectory,"art/diagram.svg");
        const pngBytes=Buffer.from(await referenceBlob.arrayBuffer());
        for(const imagePath of [sharedA,sharedB,privatePath,privateAlternatePath,draftImagePath,path.join(relocatedDirectory,"art/shared-a.png"),path.join(relocatedDirectory,"art/shared-b.png")]) {
            fs.mkdirSync(path.dirname(imagePath),{recursive:true});fs.writeFileSync(imagePath,pngBytes);
        }
        const relocatedSource=document.createElement("canvas");relocatedSource.width=80;relocatedSource.height=48;
        relocatedSource.getContext("2d").drawImage(referenceSource,0,0,80,48);
        fs.writeFileSync(path.join(relocatedDirectory,"art/shared-a.png"),Buffer.from(relocatedSource.toDataURL().split(",")[1],"base64"));
        fs.writeFileSync(svgPath,'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><rect width="60" height="40" fill="#e13588"/></svg>');
        function makeReferenceProject(directory,properties) {
            return {...previousProject,dir:directory,properties:properties || {},configWrites:[],
                fullPath(relative){return path.join(directory,relative);},
                existsSync(relative){return fs.existsSync(path.join(directory,relative));},
                readTextFileSync(relative){return fs.readFileSync(path.join(directory,relative),"utf8");},
                readConfigJsonFileSync(name){try{return JSON.parse(fs.readFileSync(path.join(directory,"#config",name),"utf8"));}catch(_){return null;}},
                writeConfigJsonFileSync(name,value){fs.mkdirSync(path.join(directory,"#config"),{recursive:true});fs.writeFileSync(path.join(directory,"#config",name),JSON.stringify(value));this.configWrites.push({name,value:JSON.parse(JSON.stringify(value))});}};
        }
        const referenceProject=makeReferenceProject(referenceDirectory,{gooWeePreview:{localeLanguage:"English",references:{[legacyRelative]:{path:"${projectDir}/art/shared-a.png",x:5,y:6}}}});
        const originalReferenceProperties=JSON.stringify(referenceProject.properties);
        const alpha=state.newFile("alpha",state.fixtureSource,path.join(referenceDirectory,alphaRelative));
        const beta=state.newFile("beta",state.fixtureSource,path.join(referenceDirectory,betaRelative));
        async function chooseDiskReference(imagePath) {
            const picked=new File([fs.readFileSync(imagePath)],path.basename(imagePath),{type:imagePath.endsWith(".svg")?"image/svg+xml":"image/png"});
            Object.defineProperty(picked,"path",{value:imagePath});
            setReferenceFiles([picked]);
            await waitForReference(()=>referenceName.textContent===path.basename(imagePath) && !!latestRenderOptions.reference,
                "The selected disk reference must finish loading for "+path.basename(imagePath));
        }
        function projectReferences(project,entryName="preview_demo") {
            const records=(project.readConfigJsonFileSync("goowee_preview.json") || {}).references || {};
            return Object.fromEntries(Object.entries(records).map(([script,record])=>[script,record.entries ? record.entries[entryName] : entryName==="preview_demo" ? record : undefined]));
        }
        function localReference(pathname) {
            return Object.values(state.preferences.current.gooWeePreview.localReferences || {}).flatMap(value=>value.entries ? Object.values(value.entries) : [value]).find(value=>value.path===pathname);
        }
        $gmedit["gml.Project"].current=referenceProject;GMEdit.emit("projectOpen",{});state.openFile(alpha);await settle();
        referenceToggle.click();await paint();
        check(/no.*file|not.*selected/i.test(referenceName.textContent) && referenceX.value==="0" && referenceY.value==="0",
            "A new saved script must begin with its own empty reference and zero offsets");
        const legacy=state.newFile("legacy",state.fixtureSource,path.join(referenceDirectory,legacyRelative));
        state.openFile(legacy);await settle();
        check(latestRenderOptions.reference && referenceName.textContent==="shared-a.png" && referenceX.value==="5" && referenceY.value==="6" && !referenceProject.existsSync("#config/goowee_preview.json"),
            "Legacy project-property references must remain readable without rewriting settings merely by opening the script");
        emitChange(entry,"alternate_view");await settle();
        check(!latestRenderOptions.reference && /no.*file|not.*selected/i.test(referenceName.textContent) && referenceX.value==="0" && referenceY.value==="0",
            "A legacy script-wide reference must apply only to the default first function, never every function in that script");
        emitChange(entry,"preview_demo");await settle();
        legacy.codeEditor.session.edit(state.fixtureSource.replace("function preview_demo() {","function newly_first() { var first = new gw_Panel(undefined); first.size(100,70); }\nfunction preview_demo() {"));await settle();
        check(entry.value==="preview_demo" && !latestRenderOptions.reference && /no.*file|not.*selected/i.test(referenceName.textContent),
            "Changing the first declared function must invalidate a cached flat legacy reference on the formerly-first selected entry");
        emitChange(entry,"newly_first");await settle();
        check(referenceName.textContent==="shared-a.png" && referenceX.value==="5" && referenceY.value==="6" && latestRenderOptions.reference,
            "An unmigrated flat legacy reference must follow the currently identified default function");
        legacy.codeEditor.session.edit(state.fixtureSource);await settle();
        state.openFile(alpha);await settle();
        const draft=state.newFile("draft",state.fixtureSource),beforeDraftSaves=state.saveCount;
        state.openFile(draft);await settle();await chooseDiskReference(draftImagePath);
        emitChange(referenceX,"7");emitChange(referenceY,"-9");await paint();
        state.openFile(alpha);await settle();state.openFile(draft);await settle();
        check(latestRenderOptions.reference && referenceName.textContent==="draft-reference.png" && referenceX.value==="7" && referenceY.value==="-9" && state.saveCount===beforeDraftSaves && !localReference(draftImagePath),
            "A real image chosen for an unsaved script must remain available in that script's session without being written to a missing script key");
        draft.path=path.join(referenceDirectory,"scripts/draft/draft.gml");GMEdit.emit("fileSave",{file:draft});await settle();
        check(localReference(draftImagePath) && localReference(draftImagePath).x===7 && localReference(draftImagePath).y===-9 && referenceName.textContent==="draft-reference.png",
            "Saving a new script for the first time must bind and persist its existing reference without choosing the image again");
        state.openFile(alpha);await settle();
        await chooseDiskReference(sharedA);emitChange(referenceX,"12");emitChange(referenceY,"-4");await paint();
        const referenceLock=panel.querySelector('.gw-reference-lock[aria-label="Lock reference offset"]');
        check(referenceLock && referenceLock.querySelector("svg") && referenceLock.getAttribute("aria-pressed")==="false",
            "Reference positioning must have an accessible unlocked icon button");
        function arrow(target,key,shiftKey) {
            const event=new KeyboardEvent("keydown",{bubbles:true,cancelable:true,key,code:key,shiftKey:!!shiftKey});
            target.dispatchEvent(event);return event;
        }
        emitChange(zoom,"2");await paint();
        let refPoint=stage.getBoundingClientRect();refPoint={x:refPoint.left+120,y:refPoint.top+120};
        const beforeReferenceDrag={...latestView},inspectionBeforeReferenceDrag=panel.querySelector(".gw-inspection").textContent;
        check(pointer(canvas,"pointerdown",refPoint.x,refPoint.y,1,0).defaultPrevented,
            "Plain left drag in an unlocked reference view must begin positioning the reference");
        pointer(window,"pointermove",refPoint.x+31,refPoint.y-17,1,0);pointer(window,"pointerup",refPoint.x+31,refPoint.y-17,0,0);await paint();
        const draggedX=Math.round(12+31/beforeReferenceDrag.scale),draggedY=Math.round(-4-17/beforeReferenceDrag.scale);
        check(Number(referenceX.value)===draggedX && Number(referenceY.value)===draggedY && projectReferences(referenceProject)[alphaRelative].x===draggedX && projectReferences(referenceProject)[alphaRelative].y===draggedY && close(latestView.x,beforeReferenceDrag.x) && close(latestView.y,beforeReferenceDrag.y),
            "Left dragging must convert display displacement to rounded GUI-pixel offsets, persist them, and leave the preview camera unchanged");
        pointer(window,"pointermove",refPoint.x+100,refPoint.y+100,0,0);await paint();
        check(Number(referenceX.value)===draggedX && Number(referenceY.value)===draggedY && panel.querySelector(".gw-inspection").textContent===inspectionBeforeReferenceDrag,
            "Releasing a reference drag must stop its movement without selecting the hidden GUI");
        stage.focus();
        const rightArrow=arrow(stage,"ArrowRight"),upArrow=arrow(stage,"ArrowUp"),shiftDown=arrow(stage,"ArrowDown",true),shiftLeft=arrow(stage,"ArrowLeft",true);await paint();
        check([rightArrow,upArrow,shiftDown,shiftLeft].every(event=>event.defaultPrevented) && Number(referenceX.value)===draggedX-9 && Number(referenceY.value)===draggedY+9,
            "Focused reference arrows must move one GUI pixel, or ten with Shift, independently of zoom");
        await settle();
        check(projectReferences(referenceProject)[alphaRelative].x===draggedX-9 && projectReferences(referenceProject)[alphaRelative].y===draggedY+9,
            "Arrow-key reference adjustments must persist to the dedicated project config after the debounce");
        const beforeEditableOffsets=[referenceX.value,referenceY.value];referenceX.focus();
        check(!arrow(referenceX,"ArrowRight").defaultPrevented && referenceX.value===beforeEditableOffsets[0],
            "Reference arrow shortcuts must not steal arrow keys from an offset input");
        const referenceEditorInput=document.createElement("textarea");document.getElementById("editor").appendChild(referenceEditorInput);referenceEditorInput.focus();
        check(!arrow(referenceEditorInput,"ArrowDown",true).defaultPrevented && referenceY.value===beforeEditableOffsets[1],
            "Reference arrow shortcuts must not steal editor navigation while another input has focus");
        referenceEditorInput.remove();
        const referenceAce=document.createElement("div");referenceAce.className="ace_editor";referenceAce.tabIndex=0;document.getElementById("editor").appendChild(referenceAce);referenceAce.focus();
        check(!arrow(referenceAce,"ArrowLeft").defaultPrevented && referenceX.value===beforeEditableOffsets[0],
            "Reference positioning must not intercept Ace editor arrow navigation");
        referenceAce.remove();referenceLock.click();await paint();
        const lockedCamera={...latestView},lockedOffsets=[referenceX.value,referenceY.value];
        pointer(canvas,"pointerdown",refPoint.x,refPoint.y,1,0);pointer(window,"pointermove",refPoint.x+50,refPoint.y+20,1,0);pointer(window,"pointerup",refPoint.x+50,refPoint.y+20,0,0);stage.focus();
        const lockedArrow=arrow(stage,"ArrowRight");await paint();
        check(referenceLock.getAttribute("aria-pressed")==="true" && lockedArrow.defaultPrevented && referenceX.value===lockedOffsets[0] && referenceY.value===lockedOffsets[1] && close(latestView.x,lockedCamera.x) && close(latestView.y,lockedCamera.y),
            "Locking the reference must block plain left dragging and arrow positioning");
        emitChange(referenceX,"44");await paint();
        check(referenceX.value==="44" && projectReferences(referenceProject)[alphaRelative].x===44,
            "Manual offset fields must remain editable and persist while reference positioning is locked");
        stage.focus();space(stage,"keydown");pointer(canvas,"pointerdown",refPoint.x,refPoint.y,1,0);pointer(window,"pointermove",refPoint.x+20,refPoint.y+10,1,0);pointer(window,"pointerup",refPoint.x+20,refPoint.y+10,0,0);space(stage,"keyup");await paint();
        pointer(canvas,"pointerdown",refPoint.x,refPoint.y,4,1);pointer(window,"pointermove",refPoint.x-10,refPoint.y+4,4,1);pointer(window,"pointerup",refPoint.x-10,refPoint.y+4,0,1);await paint();
        check(close(latestView.x,lockedCamera.x+10) && close(latestView.y,lockedCamera.y+14) && referenceX.value==="44" && referenceY.value===lockedOffsets[1],
            "Space-left and middle-button camera panning must keep working while the reference offset is locked");
        referenceLock.click();await paint();
        pointer(canvas,"pointerdown",refPoint.x,refPoint.y,1,0);pointer(window,"pointermove",refPoint.x+14,refPoint.y+8,1,0);await paint();
        window.dispatchEvent(new Event("blur"));
        const blurOffsets=[referenceX.value,referenceY.value];pointer(window,"pointermove",refPoint.x+100,refPoint.y+100,1,0);await paint();
        check(referenceX.value===blurOffsets[0] && referenceY.value===blurOffsets[1] && projectReferences(referenceProject)[alphaRelative].x===Number(blurOffsets[0]) && projectReferences(referenceProject)[alphaRelative].y===Number(blurOffsets[1]),
            "Losing focus during reference dragging must stop the gesture and save its final offsets");
        pointer(canvas,"pointerdown",refPoint.x,refPoint.y,1,0);pointer(window,"pointermove",refPoint.x+6,refPoint.y+8,1,0);await paint();
        referenceVisible.click();const hiddenOffsets=[referenceX.value,referenceY.value];pointer(window,"pointermove",refPoint.x+300,refPoint.y+300,1,0);await paint();
        check(referenceX.value===hiddenOffsets[0] && referenceY.value===hiddenOffsets[1] && projectReferences(referenceProject)[alphaRelative].x===Number(hiddenOffsets[0]),
            "Hiding a reference during dragging must stop the gesture and persist its completed displacement");
        referenceVisible.click();await paint();
        pointer(canvas,"pointerdown",refPoint.x,refPoint.y,1,0);pointer(window,"pointermove",refPoint.x+4,refPoint.y+2,1,0);await paint();
        referenceLock.click();const lockEndOffsets=[referenceX.value,referenceY.value];pointer(window,"pointermove",refPoint.x+200,refPoint.y+100,1,0);await paint();
        check(referenceX.value===lockEndOffsets[0] && referenceY.value===lockEndOffsets[1] && projectReferences(referenceProject)[alphaRelative].y===Number(lockEndOffsets[1]),
            "Locking a reference during an active drag must finish and persist that gesture");
        referenceLock.click();await paint();
        pointer(canvas,"pointerdown",refPoint.x,refPoint.y,1,0);pointer(window,"pointermove",refPoint.x+6,refPoint.y+4,1,0);await paint();
        const switchOffsets=[referenceX.value,referenceY.value];state.openFile(beta);await settle();pointer(window,"pointermove",refPoint.x+200,refPoint.y+100,1,0);state.openFile(alpha);await settle();
        check(referenceX.value===switchOffsets[0] && referenceY.value===switchOffsets[1] && projectReferences(referenceProject)[alphaRelative].x===Number(switchOffsets[0]),
            "Switching scripts during dragging must persist the old script's offsets and stop its pointer gesture");
        pointer(window,"pointerup",refPoint.x,refPoint.y,0,0);
        emitChange(referenceX,"12");emitChange(referenceY,"-4");emitChange(zoom,"1");await paint();
        const initialShared={...projectReferences(referenceProject)[alphaRelative]};
        check(initialShared.path==="${projectDir}/art/shared-a.png" && initialShared.x===12 && initialShared.y===-4 && referenceProject.properties.gooWeePreview.localeLanguage==="English",
            "A project image must save its script mapping and offsets with a portable projectDir token while preserving existing settings");
        check(referenceProject.existsSync("#config/goowee_preview.json") && referenceProject.configWrites.every(write=>write.name==="goowee_preview.json") && projectReferences(referenceProject)[legacyRelative].x===5 && JSON.stringify(referenceProject.properties)===originalReferenceProperties && !state.projectSaves.some(save=>save.project===referenceProject),
            "Shared references must save through the dedicated project config JSON, migrate legacy mappings, and leave ordinary project properties untouched");
        emitChange(entry,"alternate_view");await settle();
        check(!latestRenderOptions.reference && /no.*file|not.*selected/i.test(referenceName.textContent),
            "Saving a reference for one function must leave another function's reference unset");
        await chooseDiskReference(sharedB);emitChange(referenceX,"30");emitChange(referenceY,"40");await paint();
        check(projectReferences(referenceProject,"alternate_view")[alphaRelative].path==="${projectDir}/art/shared-b.png" && projectReferences(referenceProject,"alternate_view")[alphaRelative].x===30 && JSON.stringify(projectReferences(referenceProject)[alphaRelative])===JSON.stringify(initialShared),
            "Shared references must store separate images and offsets under the script's entry names");
        await chooseDiskReference(privateAlternatePath);emitChange(referenceX,"41");emitChange(referenceY,"-32");await paint();
        const bodyGuardConfig=referenceProject.readConfigJsonFileSync("goowee_preview.json");
        bodyGuardConfig.references[alphaRelative].entries[""]={path:"${projectDir}/art/shared-a.png",x:81,y:82};
        referenceProject.writeConfigJsonFileSync("goowee_preview.json",bodyGuardConfig);
        alpha.codeEditor.session.edit('#import "games.keevee.gw"\nfunction alternate_view(');await settle();
        check(referenceName.textContent==="private-alternate.png" && referenceX.value==="41" && referenceY.value==="-32" && latestRenderOptions.reference,
            "Incomplete source while typing must retain the selected function's reference instead of rebinding to Script body");
        emitChange(referenceX,"45");await paint();
        check(localReference(privateAlternatePath).x===45 && projectReferences(referenceProject,"")[alphaRelative].x===81,
            "Reference changes made while source is incomplete must save to the known function and leave Script body settings untouched");
        alpha.codeEditor.session.edit(state.fixtureSource);await settle();
        check(entry.value==="alternate_view" && referenceName.textContent==="private-alternate.png" && referenceX.value==="45",
            "Completing the source must restore the same selected entry and its latest reference offset");
        emitChange(referenceX,"41");await paint();
        referenceX.value="47";referenceX.dispatchEvent(new Event("input"));emitChange(entry,"preview_demo");await settle();
        check(localReference(privateAlternatePath).x===47 && referenceName.textContent==="shared-a.png" && referenceX.value==="12",
            "Switching functions must flush a pending offset edit to the old function before loading the next one");
        emitChange(entry,"alternate_view");await settle();
        check(referenceX.value==="47" && referenceName.textContent==="private-alternate.png",
            "Returning to an entry must restore the offset flushed during its previous switch");
        emitChange(referenceX,"41");await paint();
        emitChange(entry,"preview_demo");await settle();
        check(referenceName.textContent==="shared-a.png" && referenceX.value==="12" && referenceY.value==="-4" && localReference(privateAlternatePath).x===41,
            "An alternate function's private override must not replace the default function's shared image");
        const projectSavesBeforePrivate=state.projectSaves.length,configSavesBeforePrivate=referenceProject.configWrites.length;
        const normalPreferenceSave=state.preferences.save;
        state.preferences.save=function(){throw new Error("Reference save fixture unavailable");};
        try {
            await chooseDiskReference(privatePath);emitChange(referenceX,"99");emitChange(referenceY,"4");await paint();
            check(/could not save/i.test(referenceError.textContent) && !localReference(privatePath),
                "A failed preference write must report the failure and roll back the persisted local mapping");
            state.openFile(beta);await settle();state.openFile(alpha);await settle();
            check(latestRenderOptions.reference && referenceName.textContent==="private-reference.png" && referenceX.value==="99" && referenceY.value==="4" && /could not save/i.test(referenceError.textContent),
                "A failed reference save must retain the chosen image and offsets when switching away and back, with its error still visible");
        } finally {state.preferences.save=normalPreferenceSave;}
        emitChange(referenceX,"99");await paint();
        check(localReference(privatePath) && localReference(privatePath).x===99 && localReference(privatePath).y===4,
            "An external reference and its offsets must be stored in local preferences under the current script");
        check(JSON.stringify(projectReferences(referenceProject)[alphaRelative])===JSON.stringify(initialShared) && state.projectSaves.length===projectSavesBeforePrivate && referenceProject.configWrites.length===configSavesBeforePrivate && !JSON.stringify(referenceProject.readConfigJsonFileSync("goowee_preview.json")).includes(privatePath),
            "Choosing a private external reference must retain the shared project reference without putting the absolute private path in project settings");
        state.openFile(beta);await settle();
        check(!latestRenderOptions.reference && /no.*file|not.*selected/i.test(referenceName.textContent) && referenceX.value==="0" && referenceY.value==="0",
            "Switching scripts must restore an independent empty reference instead of inheriting another script's file or offsets");
        await chooseDiskReference(sharedB);emitChange(referenceX,"-23");emitChange(referenceY,"18");await paint();
        state.openFile(alpha);await settle();
        await waitForReference(()=>referenceName.textContent==="private-reference.png" && !!latestRenderOptions.reference,
            "Returning to a script must restore its local override before its shared reference");
        check(referenceX.value==="99" && referenceY.value==="4" && projectReferences(referenceProject)[betaRelative].x===-23 && projectReferences(referenceProject)[betaRelative].y===18,
            "Restoring one script's reference must preserve both scripts' distinct offsets");
        panel.querySelector(".gw-lock").click();state.openFile(beta);await settle();
        emitChange(referenceX,"123");await paint();
        check(!entry.disabled && entry.value==="preview_demo" && referenceName.textContent==="private-reference.png" && localReference(privatePath).x===123 && projectReferences(referenceProject)[betaRelative].x===-23 && localReference(privateAlternatePath).x===41,
            "A pinned preview must keep and update the pinned script's reference while another source tab is active");
        emitChange(entry,"alternate_view");await settle();
        await waitForReference(()=>referenceName.textContent==="private-alternate.png" && !!latestRenderOptions.reference,
            "Changing a pinned function must restore that function's reference from the pinned script");
        check(panel.querySelector(".gw-lock").getAttribute("aria-pressed")==="true" && !entry.disabled && $gmedit["gml.file.GmlFile"].current===beta && referenceX.value==="41",
            "Pinned function selection must keep the file locked and leave the actual editor tab unchanged");
        emitChange(entry,"preview_demo");await settle();
        await waitForReference(()=>referenceName.textContent==="private-reference.png" && !!latestRenderOptions.reference,
            "Returning to the first pinned function must restore its independent reference");
        panel.querySelector(".gw-lock").click();await settle();
        await waitForReference(()=>referenceName.textContent==="shared-b.png" && !!latestRenderOptions.reference,
            "Unlocking must restore the active script's own saved reference");
        state.openFile(alpha);await settle();await chooseDiskReference(sharedA);
        emitChange(referenceX,"14");emitChange(referenceY,"-6");await paint();
        check(!localReference(privatePath) && projectReferences(referenceProject)[alphaRelative].path==="${projectDir}/art/shared-a.png" && projectReferences(referenceProject)[alphaRelative].x===14,
            "Choosing a project image again must replace the shared mapping and clear the script's private override");
        check(localReference(privateAlternatePath) && localReference(privateAlternatePath).x===41 && projectReferences(referenceProject,"alternate_view")[alphaRelative].x===30,
            "Clearing one function's private override must preserve another function's private and shared references");
        emitChange(entry,"alternate_view");await settle();
        const ordinaryReadFile=fs.promises.readFile;let completeEntryRead;
        fs.promises.readFile=function(filename,...args) {
            if(path.resolve(String(filename))===path.resolve(sharedA))return new Promise(resolve=>{completeEntryRead=resolve;});
            return ordinaryReadFile.call(this,filename,...args);
        };
        try {
            emitChange(entry,"preview_demo");await settle();
            check(typeof completeEntryRead==="function","The entry-switch race fixture must defer the default reference's disk read");
            emitChange(entry,"alternate_view");await settle();completeEntryRead(pngBytes);await paint();
            check(entry.value==="alternate_view" && referenceName.textContent==="private-alternate.png" && referenceX.value==="41" && referenceY.value==="-32" && latestRenderOptions.reference,
                "A delayed image read from the previous function must not replace the newly selected function's reference");
        } finally {fs.promises.readFile=ordinaryReadFile;if(completeEntryRead)completeEntryRead(pngBytes);}
        emitChange(entry,"preview_demo");await settle();
        const relocated=makeReferenceProject(relocatedDirectory,JSON.parse(JSON.stringify(referenceProject.properties)));
        relocated.writeConfigJsonFileSync("goowee_preview.json",referenceProject.readConfigJsonFileSync("goowee_preview.json"));
        const relocatedAlpha=state.newFile("alpha",state.fixtureSource,path.join(relocatedDirectory,alphaRelative));
        $gmedit["gml.Project"].current=relocated;GMEdit.emit("projectOpen",{});state.openFile(relocatedAlpha);await settle();
        await waitForReference(()=>referenceName.textContent==="shared-a.png" && !!latestRenderOptions.reference,
            "A moved project must resolve its saved reference relative to its new directory");
        check(referenceX.value==="14" && referenceY.value==="-6" && latestRenderOptions.reference.image.naturalWidth===80 && latestRenderOptions.reference.image.naturalHeight===48,
            "Portable references must load from the moved project and retain saved offsets");
        emitChange(entry,"alternate_view");await settle();
        check(referenceName.textContent==="shared-b.png" && referenceX.value==="30" && referenceY.value==="40" && latestRenderOptions.reference,
            "Moving the project must retain the alternate function's shared reference without reusing an override from another project location");
        await chooseDiskReference(privateAlternatePath);emitChange(referenceX,"43");emitChange(referenceY,"-35");await paint();
        emitChange(entry,"preview_demo");await settle();
        const missingRelative="scripts/missing/missing.gml";
        const missingConfig=relocated.readConfigJsonFileSync("goowee_preview.json");
        missingConfig.references[missingRelative]={path:"${projectDir}/art/missing.png",x:21,y:-13};
        relocated.writeConfigJsonFileSync("goowee_preview.json",missingConfig);
        const missingFile=state.newFile("missing",state.fixtureSource,path.join(relocatedDirectory,missingRelative));
        state.openFile(missingFile);await settle();
        await waitForReference(()=>!!referenceError.textContent,"A missing saved reference must show an actionable loading error");
        check(!latestRenderOptions.reference && !canvas.hidden && referenceX.value==="21" && referenceY.value==="-13" && projectReferences(relocated)[missingRelative].path==="${projectDir}/art/missing.png",
            "A missing reference must leave the GUI usable and preserve its saved path and offsets for repair");
        const relocatedBeta=state.newFile("beta",state.fixtureSource,path.join(relocatedDirectory,betaRelative));
        state.openFile(relocatedBeta);await settle();await chooseDiskReference(svgPath);
        state.openFile(relocatedAlpha);await settle();state.openFile(relocatedBeta);await settle();
        await waitForReference(()=>!!latestRenderOptions.reference && !referenceError.textContent,
            "A saved SVG reference must decode again after switching away and restoring it from disk");
        check(referenceName.textContent==="diagram.svg" && latestRenderOptions.reference.image.naturalWidth===60 && latestRenderOptions.reference.image.naturalHeight===40,
            "Restoring an SVG reference must preserve its native dimensions and image MIME type");
        await chooseDiskReference(privatePath);
        emitChange(referenceX,"52");emitChange(referenceY,"-31");await paint();
        referencePersistence={project:relocated,file:relocatedAlpha,privateFile:relocatedBeta};
        referenceToggle.click();
        $gmedit["gml.Project"].current=previousProject;GMEdit.emit("projectOpen",{});state.openFile(file);await settle();
    }

    function pointOn(node) {
        const box=canvas.getBoundingClientRect();
        return {x:box.left+latestView.x+(node.x+node.width/2)*latestView.scale,
            y:box.top+latestView.y+(node.y+node.height/2)*latestView.scale};
    }
    async function clickOn(point, ctrlKey, double) {
        pointer(canvas,"pointerdown",point.x,point.y,1,0,ctrlKey); pointer(window,"pointerup",point.x,point.y,0,0,ctrlKey);
        canvas.dispatchEvent(new MouseEvent(double ? "dblclick" : "click",{bubbles:true,cancelable:true,button:0,ctrlKey,clientX:point.x,clientY:point.y}));
        await paint();
    }
    async function hoverAt(point, ctrlKey) {
        pointer(stage,"pointerenter",point.x,point.y,0,-1,ctrlKey);
        pointer(canvas,"pointermove",point.x,point.y,0,-1,ctrlKey);
        await paint();
    }
    function control(type) {
        const event=new KeyboardEvent(type,{bubbles:true,cancelable:true,key:"Control",code:"ControlLeft",ctrlKey:type==="keydown"});
        window.dispatchEvent(event); return event;
    }
    const deepFile=state.newFile("deep_selection", `#import "games.keevee.gw"
function deep_selection() {
    var content = new gw_Canvas(undefined); content.size(400,250);
    var header = new gw_Container(content); header.size(400,60);
    var title = new gw_Label(header,"Deep title"); title.size(160,40); title.margin(100,10,0,0);
    var frameRoot = new gw_Canvas(undefined); frameRoot.size(400,250);
    var frameCanvas = new gw_Canvas(frameRoot); frameCanvas.size(400,250);
    var frame = new gw_Image(frameCanvas,undefined); frame.size(400,250);
}`);
    state.openFile(deepFile); await settle();
    const deepTitle=latestScene.nodes.find(node=>node.name==="title"), deepFrame=latestScene.nodes.find(node=>node.name==="frame");
    check(deepTitle && deepFrame && latestScene.roots.length===2,"Deep-selection fixture must include a nested title beneath an equally deep frame in a separate canvas");
    const hoverInspection=panel.querySelector(".gw-inspection").textContent, hoverNavigation=state.navigations.length, hoverSelection=latestRenderOptions.selected;
    await hoverAt(pointOn(deepTitle),false);
    check(latestRenderOptions.hovered===deepFrame.id,"Ordinary hover must preview the same topmost frame as an ordinary click");
    deepFile.codeEditor.session.edit(deepFile.codeEditor.session.source+"\n// rebuild beneath a stationary preview pointer");await settle();
    check(latestRenderOptions.hovered===latestScene.nodes.find(node=>node.name==="frame").id,
        "A source refresh under a stationary pointer must retain the hover target while reference mode is disabled");
    check(latestRenderOptions.selected===hoverSelection && panel.querySelector(".gw-inspection").textContent===hoverInspection && state.navigations.length===hoverNavigation,"Hover must not change selection, inspector text or source navigation");
    check(!control("keydown").defaultPrevented,"Tracking Control for hover must not consume the keyboard event"); await paint();
    check(latestRenderOptions.hovered===deepTitle.id,"Pressing Ctrl without pointer movement must immediately highlight the nested title");
    control("keyup"); await paint();
    check(latestRenderOptions.hovered===deepFrame.id,"Releasing Ctrl without pointer movement must restore the ordinary hover target");
    await clickOn(pointOn(deepTitle),false);
    check(latestRenderOptions.selected===deepFrame.id,"Ordinary clicking must retain the existing topmost frame selection");
    const frameInspection=panel.querySelector(".gw-inspection").textContent;
    await hoverAt(pointOn(deepTitle),true);
    check(latestRenderOptions.hovered===deepTitle.id && latestRenderOptions.selected===deepFrame.id && panel.querySelector(".gw-inspection").textContent===frameInspection,"Nested hover must coexist with a different persistent selection");
    await clickOn(pointOn(deepTitle),true);
    check(latestRenderOptions.selected===deepTitle.id && latestRenderOptions.selected===latestRenderOptions.hovered,"Ctrl-click must select exactly the nested label shown by hover");
    pointer(stage,"pointerleave",0,0,0,-1); await paint();
    check(latestRenderOptions.hovered==null,"Leaving the preview must remove hover without clearing selection");
    await hoverAt(pointOn(deepTitle),false); window.dispatchEvent(new Event("blur")); await paint();
    check(latestRenderOptions.hovered==null && latestRenderOptions.selected===deepTitle.id,"Window blur must clear hover while preserving the selected element");
    await hoverAt(pointOn(deepTitle),false); stage.focus(); space(stage,"keydown"); await paint();
    check(latestRenderOptions.hovered==null,"Space pan mode must hide selection-preview outlines");
    space(stage,"keyup"); await paint();
    check(latestRenderOptions.hovered===deepFrame.id,"Releasing Space must restore hover at the stationary pointer");
    const middleHoverPoint=pointOn(deepTitle);
    pointer(canvas,"pointerdown",middleHoverPoint.x,middleHoverPoint.y,4,1); await paint();
    check(latestRenderOptions.hovered==null,"Middle-button panning must hide selection-preview outlines");
    pointer(window,"pointerup",middleHoverPoint.x,middleHoverPoint.y,0,1); await paint();
    check(latestRenderOptions.hovered===deepFrame.id,"Ending a middle drag must restore hover under the pointer");
    pointer(canvas,"pointerdown",px,py,4,1); pointer(window,"pointermove",px+35,py+20,4,1); pointer(window,"pointerup",px+35,py+20,0,1); await paint();
    const deepZoomPoint=pointOn(deepTitle); wheel(stage,deepZoomPoint.x,deepZoomPoint.y,-100,true); await paint();
    await hoverAt(pointOn(deepTitle),true);
    check(latestRenderOptions.hovered===deepTitle.id,"Hover hit testing must follow the panned and zoomed scene");
    await clickOn(pointOn(deepTitle),true);
    check(latestRenderOptions.selected===deepTitle.id,"Ctrl deep selection must stay accurate after middle-button pan and wheel zoom");
    const beforeDeepNavigation=state.navigations.length;
    await clickOn(pointOn(deepTitle),true,true);
    check(state.navigations.length===beforeDeepNavigation+1 && state.navigations[state.navigations.length-1]===deepTitle.line,"Ctrl-double-click must navigate to the nested label's source line");

    // With the pointer stationary, a scroll must hit the newly exposed content.
    emitChange(zoom,"2"); await paint();
    const scrollHoverPoint=pointOn(deepTitle); await hoverAt(scrollHoverPoint,true);
    wheel(stage,scrollHoverPoint.x,scrollHoverPoint.y,-500,true); await paint();
    check(latestRenderOptions.hovered===deepTitle.id,"Cursor-anchored wheel zoom must preserve the nested hover target without a pointermove");
    const beforeScroll=stage.scrollTop; stage.scrollTop+=200; await paint();
    const scrollCanvas=canvas.getBoundingClientRect(), scrollHit=latestRenderer.hitTest(scrollHoverPoint.x-scrollCanvas.left,scrollHoverPoint.y-scrollCanvas.top,{deep:true});
    check(stage.scrollTop>beforeScroll && latestRenderOptions.hovered===(scrollHit ? scrollHit.id : null) && latestRenderOptions.hovered!==deepTitle.id,"Scrolling must recompute hover from the same screen pointer and the new canvas offset");

    // Manual visibility is editor state: it never changes the GML or its layout.
    {
        const hideButton=panel.querySelector('[aria-label="Hide selected element"]');
        const showAllButton=panel.querySelector('[aria-label="Show all hidden elements"]');
        check(hideButton && showAllButton && hideButton.querySelector("svg") && showAllButton.querySelector("svg"),
            "Manual visibility must expose accessible hide and show-all icon buttons");
        const hideSource=`#import "games.keevee.gw"
function hide_window() {
    var frame=new Canvas(undefined); frame.size(400,240);
    var group=new Panel(frame); group.size(220,100); group.margin(20,20,0,0);
    var caption=new Label(group,"Hide target"); caption.size(120,25);
    var marker=new Label(frame,"Retained target"); marker.size(160,25); marker.margin(20,140,0,0);
    var game_hidden=new Label(frame,"Game hidden"); game_hidden.draw_set_enable(false);
}
function other_hide_window() { var alternate=new Canvas(undefined); alternate.size(80,40); var caption=new Label(alternate,"Other function"); }
`;
        const hideFile=state.newFile("manual_visibility",hideSource);
        state.openFile(hideFile);await settle();emitChange(zoom,"1");await paint();
        panel.querySelector(".gw-tree").closest("details").open=true;
        const byName=name=>latestScene.nodes.find(item=>item.name===name);
        const manuallyHidden=name=>!!latestRenderOptions.hiddenNodeIds && latestRenderOptions.hiddenNodeIds.has(byName(name).id);
        function selectVisibilityNode(name) {
            const button=[...panel.querySelectorAll(".gw-node")].find(item=>item.dataset.id===byName(name).id);
            button.click();button.focus();return button;
        }
        function visibilityKey(target,key,ctrlKey=false,extra={}) {
            const event=new KeyboardEvent("keydown",{bubbles:true,cancelable:true,key,code:"Key"+key.toUpperCase(),ctrlKey,...extra});
            target.dispatchEvent(event);return event;
        }
        const group=byName("group"),marker=byName("marker"),caption=byName("caption");
        const unchangedGeometry=latestScene.nodes.map(item=>[item.id,item.x,item.y,item.width,item.height,item.hidden]);
        const beforeHideView={...latestView},beforeHideSource=hideFile.codeEditor.session.source;
        selectVisibilityNode("group");hideButton.click();await paint();
        check(manuallyHidden("group") && !latestTextDraws.some(draw=>draw.text==="Hide target") && latestTextDraws.some(draw=>draw.text==="Retained target"),
            "The hide button must hide the selected element and descendants while preserving other content");
        check(JSON.stringify(unchangedGeometry)===JSON.stringify(latestScene.nodes.map(item=>[item.id,item.x,item.y,item.width,item.height,item.hidden])) && hideFile.codeEditor.session.source===beforeHideSource && close(latestView.x,beforeHideView.x) && close(latestView.y,beforeHideView.y) && close(latestView.scale,beforeHideView.scale),
            "Manual hiding must preserve original visibility flags, source text, layout rectangles and live camera bounds");
        const hiddenHit=latestRenderer.hitTest(latestView.x+(caption.x+5)*latestView.scale,latestView.y+(caption.y+5)*latestView.scale,{deep:true});
        check(hiddenHit && hiddenHit.id!==group.id && hiddenHit.id!==caption.id,
            "A manually hidden subtree must no longer intercept selection in the canvas");
        const hideCopies=state.clipboardImages.length;copyButton.click();await waitForCopy();
        check(state.clipboardImages.length===hideCopies+1 && latestExportOptions.hiddenNodeIds && latestExportOptions.hiddenNodeIds.has(group.id),
            "Copy must include the current manual visibility mask when exporting the GUI");
        const hiddenTreeNode=selectVisibilityNode("group");visibilityKey(hiddenTreeNode,"h");await paint();
        selectVisibilityNode("marker");stage.focus();
        check(visibilityKey(stage,"h").defaultPrevented,"H focused on the preview must hide the selected element");await paint();
        check(manuallyHidden("group") && manuallyHidden("marker"),"Separate H actions must accumulate hidden elements");
        check(visibilityKey(stage,"h",true).defaultPrevented,"Ctrl+H inside the preview must undo the most recent hide");await paint();
        check(manuallyHidden("group") && !manuallyHidden("marker") && latestTextDraws.some(draw=>draw.text==="Retained target"),
            "Undo hide must reveal only the most recently hidden element");
        visibilityKey(stage,"h",true);await paint();
        check(!manuallyHidden("group") && !manuallyHidden("marker") && latestTextDraws.some(draw=>draw.text==="Hide target"),
            "Repeated hiding of an already hidden selection must not insert duplicate undo entries");
        selectVisibilityNode("group");stage.focus();visibilityKey(stage,"h");await paint();
        selectVisibilityNode("marker");stage.focus();visibilityKey(stage,"h");await paint();
        check(visibilityKey(stage,"u").defaultPrevented,"U focused on the preview must restore every manually hidden element");await paint();
        check(!manuallyHidden("group") && !manuallyHidden("marker") && byName("game_hidden").hidden && !latestTextDraws.some(draw=>draw.text==="Game hidden"),
            "Show all must clear only manual visibility, never reveal elements hidden by the project");
        visibilityKey(stage,"h",true);await paint();
        check(!manuallyHidden("group") && !manuallyHidden("marker"),"Show all must discard obsolete hide undo history");

        selectVisibilityNode("group");
        const protectedInput=panel.querySelector('input[type="number"]');protectedInput.focus();
        check(!visibilityKey(protectedInput,"h").defaultPrevented && !visibilityKey(protectedInput,"h",true).defaultPrevented && !visibilityKey(protectedInput,"u").defaultPrevented,
            "Visibility shortcuts must not intercept typing or Ctrl+H in preview input fields");
        entry.focus();check(!visibilityKey(entry,"h").defaultPrevented,"Visibility shortcuts must leave the function dropdown's native keyboard handling alone");
        const contentEditor=document.createElement("div");contentEditor.contentEditable="true";stage.append(contentEditor);contentEditor.focus();
        check(!visibilityKey(contentEditor,"h").defaultPrevented,"Visibility shortcuts must not intercept contenteditable controls");contentEditor.remove();
        const externalEditor=document.createElement("textarea");document.getElementById("editor").append(externalEditor);externalEditor.focus();
        check(!visibilityKey(externalEditor,"h").defaultPrevented && !visibilityKey(externalEditor,"h",true).defaultPrevented && !visibilityKey(externalEditor,"u").defaultPrevented && !manuallyHidden("group"),
            "H, U and Ctrl+H must remain available to the code editor even if an element is selected");externalEditor.remove();
        const focusedTreeNode=selectVisibilityNode("group");
        check(visibilityKey(focusedTreeNode,"h").defaultPrevented,"H must also work after keyboard selection in the Elements tree");await paint();
        const visibilityRefresh=[...panel.querySelectorAll(".gw-toolbar button")].find(button=>button.textContent==="Refresh");
        visibilityRefresh.click();await settle();
        check(manuallyHidden("group") && !latestTextDraws.some(draw=>draw.text==="Hide target"),"Refresh must preserve manual visibility for the same entry");
        emitChange(entry,"other_hide_window");await settle();
        check(!latestRenderOptions.hiddenNodeIds || latestRenderOptions.hiddenNodeIds.size===0,"Manual hidden state must not leak into another function with reused node ids");
        emitChange(entry,"hide_window");await settle();
        check(manuallyHidden("group"),"Returning to a function must restore its own manual hidden state");
        const anotherHideFile=state.newFile("other_manual_visibility",hideSource);state.openFile(anotherHideFile);await settle();
        check(!manuallyHidden("group"),"Manual visibility must be isolated between different scripts using identical source");
        state.openFile(hideFile);await settle();
        check(manuallyHidden("group"),"Returning to a script must restore the hidden elements in its selected function");
        const originalGroupId=byName("group").id,originalGroupLine=byName("group").line;
        const shiftedHideSource="\n\n"+hideSource.replace("    var group=",'    var inserted=new Label(frame,"Inserted sibling"); inserted.size(20,20);\n    var group=');
        hideFile.codeEditor.session.edit(shiftedHideSource);await settle();
        check(byName("group").id!==originalGroupId && byName("group").line>originalGroupLine && manuallyHidden("group") && !manuallyHidden("inserted") && !latestTextDraws.some(draw=>draw.text==="Hide target"),
            "Inserting a sibling and leading blank lines must remap a named hidden element to its new creation id");
        stage.focus();
        check(visibilityKey(stage,"р",true,{code:"KeyH"}).defaultPrevented,"Ctrl+H must use the physical key on a Russian keyboard layout");await paint();
        check(!manuallyHidden("group") && latestTextDraws.some(draw=>draw.text==="Hide target"),"Undo must restore the remapped element after its creation id changes");
        hideFile.codeEditor.session.edit(hideSource);await settle();
        selectVisibilityNode("group");hideButton.click();await paint();
        showAllButton.click();await paint();
        check(!manuallyHidden("group") && showAllButton.disabled,"The show-all icon button must restore the GUI and disable when no manual hides remain");
        selectVisibilityNode("frame");hideButton.click();await paint();
        check(manuallyHidden("frame") && !latestTextDraws.length && !showAllButton.disabled,"Hiding the entire root must retain a usable show-all recovery button");
        showAllButton.click();await paint();

        const duplicateSource=`#import "games.keevee.gw"
function duplicate_window() {
    var frame=new Canvas(undefined); frame.size(400,100);
    for (var i=0;i<2;i++) {
        var repeated=new Label(frame,string(i)); repeated.size(100,25); repeated.margin(i*100,0,0,0);
    }
}`;
        const duplicateFile=state.newFile("duplicate_visibility",duplicateSource);
        state.openFile(duplicateFile);await settle();
        const duplicateNodes=latestScene.nodes.filter(node=>node.name==="repeated");
        check(duplicateNodes.length===2,"The visibility fixture must produce repeated sibling instances from one source declaration");
        [...panel.querySelectorAll(".gw-node")].find(button=>button.dataset.id===duplicateNodes[1].id).click();
        hideButton.click();await paint();
        check(latestRenderOptions.hiddenNodeIds.has(duplicateNodes[1].id),"A single repeated sibling must be independently hideable");
        duplicateFile.codeEditor.session.edit(duplicateSource.replace("i<2","i<3"));await settle();
        check(latestScene.nodes.filter(node=>node.name==="repeated").length===3 && latestRenderOptions.hiddenNodeIds.size===0 && showAllButton.disabled,
            "Changing an ambiguous sibling count must discard its old hide instead of transferring it to another instance");
        duplicateFile.codeEditor.session.edit(duplicateSource);await settle();stage.focus();visibilityKey(stage,"h",true);await paint();
        check(latestRenderOptions.hiddenNodeIds.size===0 && showAllButton.disabled,
            "Discarded ambiguous hide identities and undo history must not return when the previous sibling count is restored");
    }

    // Refresh must rebuild the actual current buffer and preserve only a still-valid choice.
    const refreshFile = state.newFile("refresh_preview", state.fixtureSource);
    state.openFile(refreshFile); await settle();
    check(latestRenderOptions.hovered==null,"Switching scripts must clear the previous hover target");
    emitChange(zoom,"fit"); await paint();
    emitChange(entry, "alternate_view"); await settle();
    const refreshButton = [...panel.querySelectorAll(".gw-toolbar button")].find(button => button.textContent === "Refresh");
    refreshFile.codeEditor.session.source = state.fixtureSource.replace("320", "432");
    refreshButton.click(); await settle();
    panel.querySelector(".gw-node").click();
    check(entry.value === "alternate_view" && panel.querySelectorAll(".gw-node").length === 1 && panel.querySelector(".gw-inspection").textContent.includes("432 × 200"), "Refresh must read the latest unsaved buffer and preserve the selected valid function");
    refreshFile.codeEditor.session.source = state.fixtureSource.replace("alternate_view", "renamed_view");
    refreshButton.click(); await settle();
    check(entry.value === "preview_demo" && entry.selectedIndex >= 0 && panel.querySelectorAll(".gw-node").length === 6, "Renaming the selected function must choose an existing entry and never leave a blank selector or combined scene");
    emitChange(entry, "renamed_view"); await settle();
    refreshFile.codeEditor.session.source = state.fixtureSource.replace("function alternate_view() {\n    var alternate = new gw_Panel(undefined);\n    alternate.size(gw_ABS(320), gw_ABS(200));\n}", "function renamed_view() { return 42; }");
    refreshButton.click(); await settle();
    check(entry.value === "preview_demo" && entry.options.length === 1 && panel.querySelectorAll(".gw-node").length === 6, "A remembered function that no longer constructs GooWee elements must not replace a valid preview entry");

    // A locked entry keeps its live root buffer while another tab edits a helper.
    // The helper's unsaved buffer must win over the cached source on disk.
    {
        const lock = panel.querySelector('.gw-lock[aria-label="Lock preview"]');
        check(!!lock && lock.getAttribute("aria-pressed") === "false" && !lock.disabled && lock.querySelector("svg"),
            "The toolbar must expose an accessible unlocked icon button beside Refresh");
        const savedProject=$gmedit["gml.Project"].current, savedLookup=$gmedit["gml.GmlAPI"].gmlLookup;
        const savedTabs=$gmedit["ui.ChromeTabs"], lockDirectory=path.join(state.config.localizationProject,"lock-project");
        const helperPath="scripts/preview_parts/preview_parts.gml", rootPath=path.join(lockDirectory,"scripts/preview_shell/preview_shell.gml");
        const helperSource='function add_preview_child(parent) { var child = new Label(parent, "Saved child"); child.size(100,30); }';
        const rootSource='#import "games.keevee.gw"\nfunction other_window() { var other=new Canvas(undefined); other.size(80,40); }\nfunction locked_window() { var frame=new Canvas(undefined); frame.size(400,200); add_preview_child(frame); }';
        const lockedRoot=state.newFile("preview_shell",rootSource,rootPath);
        const helper=state.newFile("preview_parts",helperSource,path.join(lockDirectory,helperPath));
        const ordinary=state.newFile("editing_notes","function notes() { return 7; }",path.join(lockDirectory,"notes.gml"));
        const tabs={impl:{tabEls:[{gmlFile:lockedRoot},{gmlFile:helper},{gmlFile:ordinary}]}};
        $gmedit["ui.ChromeTabs"]=tabs;
        const lockProject={...savedProject,dir:lockDirectory,
            fullPath(relative) {return path.join(lockDirectory,relative);},
            readTextFileSync(relative) {if(relative.replace(/\\/g,"/")===helperPath)return helperSource;const error=new Error("No fixture file: "+relative);error.code="ENOENT";throw error;}};
        $gmedit["gml.Project"].current=lockProject;
        $gmedit["gml.GmlAPI"].gmlLookup={add_preview_child:{path:helper.path,row:0}};
        GMEdit.emit("projectOpen",{}); state.openFile(lockedRoot); await settle();
        emitChange(entry,"locked_window"); await settle();
        check(latestScene.entry==="locked_window" && latestScene.nodes.some(node=>node.text==="Saved child"),"The pin fixture must initially construct its indexed helper from project source: "+JSON.stringify({status:panel.querySelector(".gw-status").textContent,empty:panel.querySelector(".gw-empty").textContent,options:[...entry.options].map(option=>option.value),entry:latestScene.entry,nodes:latestScene.nodes.map(node=>({name:node.name,text:node.text})),notes:latestScene.diagnostics}));
        lock.click(); await settle();
        check(lock.getAttribute("aria-pressed")==="true" && !entry.disabled && entry.value==="locked_window","Lock must pin the source file while retaining a usable function selector");
        state.openFile(helper); await settle();
        check(entry.value==="locked_window" && !canvas.hidden && panel.querySelector(".gw-status").textContent.includes("preview_shell"),"Switching to an ordinary helper tab must keep the locked root preview visible");
        check(lockedRoot.codeEditor.session.listenerCount("change")===1 && helper.codeEditor.session.listenerCount("change")===1,"A locked root and the actively edited helper must each have one change listener");
        check([...entry.options].map(option=>option.value).join(",")==="other_window,locked_window","A pinned selector must list functions from its source file, not the currently edited helper");
        [...panel.querySelectorAll(".gw-node")].find(button=>button.dataset.id===latestScene.nodes.find(item=>item.name==="child").id).click();
        panel.querySelector('[aria-label="Hide selected element"]').click();await paint();
        check(latestRenderOptions.hiddenNodeIds.has(latestScene.nodes.find(item=>item.name==="child").id),
            "Manual hide must target the pinned scene while a different source tab is active");
        emitChange(entry,"other_window");await settle();
        check(entry.value==="other_window" && latestScene.entry==="other_window" && latestScene.roots[0].width===80 && lock.getAttribute("aria-pressed")==="true" && $gmedit["gml.file.GmlFile"].current===helper && latestRenderOptions.hiddenNodeIds.size===0,
            "Selecting another function inside a pinned file must update the preview while keeping its pin and the active helper tab");
        emitChange(entry,"locked_window");await settle();
        check(latestRenderOptions.hiddenNodeIds.has(latestScene.nodes.find(item=>item.name==="child").id),
            "Returning to the pinned function must restore its own manual hide mask");
        panel.querySelector('[aria-label="Show all hidden elements"]').click();await paint();
        helper.codeEditor.session.edit(helperSource.replace("Saved child","Unsaved child")); await settle();
        check(latestScene.entry==="locked_window" && latestScene.nodes.some(node=>node.text==="Unsaved child") && !latestScene.nodes.some(node=>node.text==="Saved child"),"Unsaved nested helper edits must rebuild the locked preview without saving");
        lockedRoot.codeEditor.session.edit(rootSource.replace("400,200","430,200")); await settle();
        check(latestScene.roots[0].width===430 && latestScene.nodes.some(node=>node.text==="Unsaved child"),"The pinned root buffer must remain live while another tab is active");
        state.openFile(ordinary); await settle();
        check(helper.codeEditor.session.listenerCount("change")===0 && ordinary.codeEditor.session.listenerCount("change")===1 && lockedRoot.codeEditor.session.listenerCount("change")===1,"Switching nested tabs must release the previous active listener while retaining the pinned root listener");
        refreshButton.click(); await settle();
        check(entry.value==="locked_window" && latestScene.roots[0].width===430 && latestScene.nodes.some(node=>node.text==="Unsaved child"),"Refresh must rebuild the pinned root with unsaved data from an inactive open helper");
        await ipcRenderer.invoke("goowee-test-capture","fixture-locked-preview");
        const externalBefore=state.externalNavigations.length;
        const rootButton=[...panel.querySelectorAll(".gw-node")].find(button=>button.textContent.startsWith("frame ·"));
        rootButton.dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));
        check(state.externalNavigations.length===externalBefore+1 && state.externalNavigations.at(-1).path===rootPath,"Double-clicking the pinned root must navigate back to its file from another active tab");
        const childButton=[...panel.querySelectorAll(".gw-node")].find(button=>button.textContent.startsWith("child ·"));
        childButton.dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));
        check(state.externalNavigations.length===externalBefore+2 && state.externalNavigations.at(-1).path===helper.path,"Double-clicking a pinned nested element must navigate to its helper source");
        lockedRoot.codeEditor.session.edit(rootSource.replace("function locked_window(","function renamed_window(")); await settle();
        check(lock.getAttribute("aria-pressed")==="true" && !lock.disabled && canvas.hidden && /locked_window/.test(panel.querySelector(".gw-empty").textContent),"A missing locked function must report the pinned name instead of silently selecting another entry");
        lockedRoot.codeEditor.session.edit(rootSource); await settle();
        check(entry.value==="locked_window" && !canvas.hidden,"Restoring a temporarily incomplete pinned function must restore that preview automatically");
        lockedRoot.codeEditor.session.edit(rootSource.replace("function locked_window(","function renamed_window(")); await settle();
        check(!entry.disabled && [...entry.options].some(option=>option.value==="other_window" && !option.disabled),
            "A missing pinned function must retain available alternatives from its pinned file");
        emitChange(entry,"other_window");await settle();
        check(!canvas.hidden && latestScene.entry==="other_window" && lock.getAttribute("aria-pressed")==="true" && $gmedit["gml.file.GmlFile"].current===ordinary,
            "A missing pinned function must be replaceable through the dropdown without unlocking or changing the active editor tab");
        lockedRoot.codeEditor.session.edit(rootSource);await settle();emitChange(entry,"locked_window");await settle();
        lock.click(); await settle();
        check(lock.getAttribute("aria-pressed")==="false" && canvas.hidden && lockedRoot.codeEditor.session.listenerCount("change")===0,"Unlock must immediately follow the current ordinary tab and release the pinned root listener");
        check(lock.disabled,"An ordinary script without a valid GooWee preview must not be lockable");
        state.openFile(lockedRoot); await settle(); lock.click(); state.openFile(helper); await settle();
        const closedSession=lockedRoot.codeEditor.session;
        tabs.impl.tabEls=tabs.impl.tabEls.filter(tab=>tab.gmlFile!==lockedRoot); lockedRoot.codeEditor=null;
        GMEdit.emit("fileClose",{file:lockedRoot}); await settle();
        check(lock.getAttribute("aria-pressed")==="false" && closedSession.listenerCount("change")===0 && canvas.hidden,"Closing the pinned document after its editor is destroyed must unlock safely and follow the active tab");
        lockedRoot.codeEditor={session:closedSession}; tabs.impl.tabEls.push({gmlFile:lockedRoot});
        state.openFile(lockedRoot); await settle(); lock.click(); await settle();
        $gmedit["gml.Project"].current={...lockProject}; GMEdit.emit("projectOpen",{}); await settle();
        check(lock.getAttribute("aria-pressed")==="false","Opening a different project must release the previous project's pin");
        lock.click(); await settle(); $gmedit["gml.Project"].current=null; GMEdit.emit("projectClose",{}); state.openFile(null); await settle();
        check(lock.getAttribute("aria-pressed")==="false" && lock.disabled && closedSession.listenerCount("change")===0,"Closing a project must clear the pin and release its session");
        $gmedit["ui.ChromeTabs"]=savedTabs; $gmedit["gml.GmlAPI"].gmlLookup=savedLookup;
        $gmedit["gml.Project"].current=savedProject; GMEdit.emit("projectOpen",{}); state.openFile(refreshFile); await settle();
    }

    const noEntryFile = state.newFile("no_preview", '#import "games.keevee.gw"\nfunction helper() { return 42; }');
    state.openFile(noEntryFile); await settle();
    check(entry.disabled && entry.options.length === 1 && /No preview function/.test(entry.selectedOptions[0].textContent) && entry.title.length > 0, "A script with no preview entry must explain why the selector is unavailable");
    check(panel.querySelector("canvas").hidden && /no preview function/.test(panel.querySelector(".gw-status").textContent) && /current editor buffer/.test(panel.querySelector(".gw-empty").textContent), "Missing entry functions must be prominent and clear the previous scene");
    const malformedFile = state.newFile("incomplete_preview", '#import "games.keevee.gw"\nfunction broken(parent:) { var leaked = new Canvas(undefined); }');
    state.openFile(malformedFile); await settle();
    check(entry.disabled && entry.selectedOptions[0].textContent === "Preview waits for valid source" && panel.querySelector("canvas").hidden && panel.querySelectorAll(".gw-node").length === 0, "Incomplete function headers must never leave a blank dropdown or render their leaked body");
    check(/L2:.*Incomplete type annotation/.test(panel.querySelector(".gw-empty").textContent) && panel.querySelectorAll(".gw-diagnostic").length > 0, "Source parse errors must show their line and cause prominently, even with Preview notes collapsed");
    const scriptBodyFile = state.newFile("script_body", '#import "games.keevee.gw"\nvar direct_panel = new gw_Panel(undefined); direct_panel.size(80, 40);');
    state.openFile(scriptBodyFile); await settle();
    check(entry.disabled && entry.selectedOptions[0].textContent === "Script body" && panel.querySelectorAll(".gw-node").length === 1 && !panel.querySelector("canvas").hidden, "Top-level GooWee scripts must have an explicit Script body selection");

    // The sprite identifier exists only in the indexed macro, never in this buffer.
    const macroFile = state.newFile("macro_preview", '#import "games.keevee.gw"\nfunction macro_preview() { var sized = new gw_Panel(undefined); sized.size(gw_ABS(DIM), gw_ABS(40)); }');
    state.openFile(macroFile); await settle();
    panel.querySelector(".gw-node").click();
    check(panel.querySelector(".gw-inspection").textContent.includes("64 × 40"), "Indexed project macros must resolve lazy sprite dimensions absent from the current script: " + panel.querySelector(".gw-inspection").textContent);
    const scaleFile = state.newFile("scale_preview", '#import "games.keevee.gw"\nfunction scale_preview() { var root = new gw_Canvas(undefined); root.size(400, 200); var absolute = new gw_Button(root); absolute.size(gw_ABS(40), gw_ABS(30)); var scaled = new gw_Button(root); scaled.size(gw_ABSV(40), gw_ABSV(30)); scaled.margin(100, 0, 0, 0); }');
    state.openFile(scaleFile); await settle();
    const guiScale = panel.querySelector('input[aria-label="GooWee GUI scale"]');
    check(!!guiScale, "The GUI scale control must be separate from canvas zoom");
    emitChange(guiScale, "2"); await settle();
    [...panel.querySelectorAll(".gw-node")].find(button => /^scaled ·/.test(button.textContent)).click();
    check(panel.querySelector(".gw-inspection").textContent.includes("80 × 60") && state.preferences.current.gooWeePreview.guiScale === 2, "GUI scale 2 must double ABSV dimensions and persist");
    [...panel.querySelectorAll(".gw-node")].find(button => /^absolute ·/.test(button.textContent)).click();
    check(panel.querySelector(".gw-inspection").textContent.includes("40 × 30"), "Changing GUI scale must leave ABS dimensions unchanged");
    emitChange(guiScale, "1"); await settle();
    state.openFile(file); await settle();

    const beforeCount = panel.querySelectorAll(".gw-node").length;
    const edited = state.fixtureSource.replace("    var confirm", "    var unsaved = new gw_Label(panel, \"Unsaved edit\");\n    var confirm");
    file.codeEditor.session.edit(edited);
    check(panel.querySelectorAll(".gw-node").length === beforeCount, "Unsaved edits should debounce rather than render synchronously");
    await settle();
    check(panel.querySelectorAll(".gw-node").length === beforeCount + 1, "The preview must refresh from the unsaved buffer after debounce");

    const unsupported = state.newFile("ordinary_script", "function ordinary_script() { return 42; }");
    state.openFile(unsupported); await settle();
    const copiesBeforeEmpty=state.clipboardImages.length;
    panel.querySelector(".gw-copy").click();await paint();
    check(panel.querySelector(".gw-copy").disabled && state.clipboardImages.length===copiesBeforeEmpty,"An unsupported or empty preview must disable image copying without touching the clipboard");
    check(file.codeEditor.session.listenerCount("change") === 0 && unsupported.codeEditor.session.listenerCount("change") === 1, "Switching files must move the session listener");
    check(panel.querySelector("canvas").hidden && panel.querySelector(".gw-empty").textContent.includes("does not import"), "Non-GooWee scripts must clear the previous preview");
    check(entry.disabled && entry.selectedOptions[0].textContent === "GooWee import not found", "Non-GooWee scripts must show a reason instead of a blank function dropdown");
    const empty = state.newFile("empty", ""); state.openFile(empty); await settle();
    check(panel.querySelectorAll(".gw-node").length === 0 && panel.querySelector("canvas").hidden, "An empty buffer must clear stale elements");
    state.openFile(null); await settle();
    check(panel.querySelector(".gw-status").textContent === "No active GML script", "Closing all files must show the no-script state");
    check(entry.disabled && entry.selectedOptions[0].textContent === "Open a GooWee script", "Closing all files must keep an explanatory selector placeholder");
    state.openFile(file); await settle();
    check(panel.querySelector(".gw-entry").value === "preview_demo", "Returning to a file must restore its selected entry function");

    const preferences = document.getElementById("preferences"); plugin.buildPreferences(preferences);
    const position = preferences.querySelector('select[aria-label="Preview panel position"]');
    emitChange(position, "Bottom"); await settle();
    check(!GMEdit.sidebar.panels.has("GooWee Preview") && GMEdit.bottomPanel.panels.has("GooWee Preview"), "Bottom preference must move the existing panel");
    emitChange(position, "Below resource tree"); await settle();
    check(!GMEdit.bottomPanel.panels.has("GooWee Preview") && GMEdit.leftBottomPanel.panels.has("GooWee Preview"), "Resource-tree preference must use the shared left-bottom dock");
    emitChange(position, "Right"); await settle();
    check(GMEdit.sidebar.panels.has("GooWee Preview") && !GMEdit.bottomPanel.panels.has("GooWee Preview") && !GMEdit.leftBottomPanel.panels.has("GooWee Preview") && state.preferences.current.gooWeePreview.position === "right", "Right preference must move back and persist");
    const toggle = state.commands.get("toggleGooWeePreview"); toggle.exec();
    check(!GMEdit.sidebar.panels.has("GooWee Preview"), "Toggle command must hide the docked panel");
    toggle.exec(); await settle();
    check(GMEdit.sidebar.panels.has("GooWee Preview"), "Toggle command must reveal the panel again");

    // Project-specific localization uses the real filesystem loader and UI settings.
    const previousProject=$gmedit["gml.Project"].current;
    const localeProject={...previousProject,dir:state.config.localizationProject,properties:{}};
    $gmedit["gml.Project"].current=localeProject; GMEdit.emit("projectOpen",{});
    const localeFile=state.newFile("localized_preview",'#import "games.keevee.gw"\n/* @goowee-preview setup\npreview_override("LOCALE.text", function(key){return preview_text(key);});\n*/\nfunction localized_preview(){var label=new Label(undefined,LOCALE.text("menu.family.tree"));label.size(AUTO(1),AUTO(1));}');
    state.openFile(localeFile); await settle();
    const projectSettings=document.createElement("div"); preferences.appendChild(projectSettings);
    plugin.buildProjectProperties(projectSettings,localeProject);
    const localeDirectory=projectSettings.querySelector('[aria-label="GooWee localization directory"]');
    const localeLanguage=projectSettings.querySelector('[aria-label="GooWee preview language"]');
    check(localeLanguage.options.length===2 && localeLanguage.value==="English" && textDraws.some(draw=>draw.text==="Family Tree"),"Project localization must auto-discover locale_definition.json and paint the default language");
    const languagePaint=textDraws.length;
    emitChange(localeLanguage,"Russian"); await settle();
    check(textDraws.slice(languagePaint).some(draw=>draw.text==="Древо семьи"),"Changing the project language must immediately rebuild localized labels");
    check(localeProject.properties.gooWeePreview.localeLanguage==="Russian" && state.projectSaves.at(-1).project===localeProject && !state.preferences.current.gooWeePreview.localeLanguage,"Localization choices must save through ProjectProperties without leaking into global plugin preferences");
    projectSettings.replaceChildren(); plugin.buildProjectProperties(projectSettings,localeProject);
    check(projectSettings.querySelector('[aria-label="GooWee preview language"]').value==="Russian","Reopening project properties must restore the saved language");
    state.folderSelection=path.join(state.config.localizationProject,"datafiles","localization");
    projectSettings.querySelector('[aria-label="Browse GooWee localization directory"]').click(); await settle();
    check(localeProject.properties.gooWeePreview.localeDirectory==="datafiles/localization" && state.folderOptions.properties.includes("openDirectory"),"Directory browsing must persist a portable project-relative path");
    const csvPath=path.join(state.folderSelection,"main.csv");
    fs.writeFileSync(csvPath,"Key,English,Russian\nmenu.family.tree,Family Tree,Обновлённый перевод\n");
    const changedLocalePaint=textDraws.length;
    refreshButton.click(); await settle();
    check(textDraws.slice(changedLocalePaint).some(draw=>draw.text==="Обновлённый перевод"),"Refresh must reload changed CSV translations from disk");
    const invalidDirectory=projectSettings.querySelector('[aria-label="GooWee localization directory"]');
    emitChange(invalidDirectory,"missing/localization"); await settle();
    check(projectSettings.querySelector(".gw-localization-state").textContent.includes("locale_definition.json") && projectSettings.querySelector('[aria-label="GooWee preview language"]').disabled,"An invalid directory must explain the missing definition and disable language choices");
    check(!panel.querySelector("canvas").hidden && panel.querySelectorAll(".gw-node").length===1 && panel.querySelectorAll(".gw-diagnostic").length>0,"Localization read errors must preserve the UI preview and produce a note");
    emitChange(invalidDirectory,"datafiles/localization"); await settle();
    const otherProject={...previousProject,dir:state.config.localizationProject+"-other",properties:{}};
    const otherPaint=textDraws.length;
    $gmedit["gml.Project"].current=otherProject; GMEdit.emit("projectOpen",{}); await settle();
    check(textDraws.slice(otherPaint).some(draw=>draw.text.includes("menu.family.tree")) && !otherProject.properties.gooWeePreview,"Switching projects must clear translations and preserve independent project settings");
    const returnPaint=textDraws.length;
    $gmedit["gml.Project"].current=localeProject; GMEdit.emit("projectOpen",{}); await settle();
    check(textDraws.slice(returnPaint).some(draw=>draw.text==="Обновлённый перевод"),"Returning to a project must restore its own configured locale");
    $gmedit["gml.Project"].current=previousProject; GMEdit.emit("projectOpen",{}); state.openFile(file); await settle();

    if (state.config.projectPath) {
        $gmedit["gml.Project"].current = state.loadProject(state.config.projectPath); GMEdit.emit("projectOpen", {});
        const actorPath=path.join(state.config.projectPath,"scripts/gui_actor_1_new_new/gui_actor_1_new_new.gml");
        if (fs.existsSync(actorPath)) {
            const actorProject=$gmedit["gml.Project"].current;
            actorProject.properties.gooWeePreview={localeLanguage:"Russian"}; GMEdit.emit("projectOpen",{});
            state.openFile(state.newFile("gui_actor_1_new_new",fs.readFileSync(actorPath,"utf8"),actorPath)); await settle();
            panel=currentPanel();
            emitChange(panel.querySelector(".gw-entry"),"gui_actor_1_new_new"); await settle();
            emitChange(zoom,"fit"); await paint();
            check(latestScene.entry==="gui_actor_1_new_new" && latestScene.nodes.length>0,"The actor menu must construct a preview from the actual project entry");
            const actorFixturePath=path.join(state.config.projectPath,".goowee-preview/actor/actor.json");
            const actorFixtureSource=fs.readFileSync(actorFixturePath,"utf8"), actorFixture=JSON.parse(actorFixtureSource);
            checkActorFrame(latestScene,"gui_actor_1_new_new",actorFixture);
            const actorMain=latestScene.roots.find(node=>node.name==="canvas");
            check(actorMain && actorMain.width===405 && actorMain.height===495,"Actor window dimensions must come from initialized project source instead of placeholder defaults");
            const actorColumns=latestScene.nodes.filter(node=>node.name==="left_side_stack" || node.name==="right_side_stack");
            check(actorColumns.length===2 && actorColumns[0].width===171 && actorColumns[1].x>=actorColumns[0].x+actorColumns[0].width && actorColumns.every(node=>node.height>300 && node.y>actorMain.y),"Actor contents must occupy two nonoverlapping columns beneath the header");
            const actorTabs=latestScene.nodes.find(node=>node.type==="GuiRoughTabButtonAutoWidthPanel");
            const actorButtons=actorTabs && actorTabs.children.filter(node=>node.type==="Button");
            check(actorButtons && actorButtons.length===4 && actorButtons.every((node,i)=>node.width>80 && node.width<110 && (!i || node.x>=actorButtons[i-1].x+actorButtons[i-1].width-1)),"The source-defined custom tab layout must allocate four separate slots, allowing at most the final one-pixel rounding overlap");
            const actorTexts=()=>latestScene.nodes.filter(node=>node.text && visible(latestScene,node)).map(node=>String(node.text).replace(/\s+/g," ").trim());
            const actorLocale=GooWeePreviewLocalization.create(actorProject,{language:"Russian"});
            check([actorFixture.name,actorLocale.lookup(actorFixture.culture_key),actorLocale.lookup(actorFixture.status_key),actorFixture.important_person.name].every(text=>actorTexts().includes(text)),"Actor identity, culture, activity and important person must come from editable project samples and localization");
            check(latestScene.nodes.some(node=>node.name==="mood_label" && node.text===String(actorFixture.mood)) && latestScene.nodes.filter(node=>node.name==="button_mind").length===actorFixture.minds.length,"Actor mood and mind rows must resolve their real DataBind getter macros");
            const mindRows=latestScene.nodes.filter(node=>node.name==="button_mind");
            check(actorFixture.minds.every((mind,index)=>{
                const descendants=[], pending=[mindRows[index]];
                while(pending.length){const node=pending.shift();if(!node)continue;descendants.push(node);pending.push(...node.children);}
                const caption=descendants.filter(node=>node.name==="label_left").map(node=>node.text).join(" ").replace(/\s+/g," ").trim();
                return caption===actorLocale.lookup(mind.caption_key).replace(/\s+/g," ").trim() && descendants.some(node=>node.name==="label_right" && node.text===(mind.value>=0?"+":"")+mind.value);
            }),"Every sample mind must display its localized words and signed value through the wrapping layout");
            check(actorTexts().includes(String(actorFixture.inventory.money)) && latestScene.nodes.filter(node=>node.name==="stack_item_frame").length>=8,"Actor inventory must build its money, empty resource slots and equipment through the actual component method");
            const mainPortrait=latestScene.nodes.find(node=>node.name==="image_avatar" && node.sprite && node.sprite.layers);
            const portraitLayers=mainPortrait?spriteLayers(mainPortrait.sprite):[];
            check(mainPortrait && mainPortrait.sprite.width===128 && mainPortrait.sprite.height===actorFixture.portrait.height && portraitLayers.filter(layer=>layer.sprite && !layer.sprite.layers).length>4 && portraitLayers.every(layer=>(layer.fill || layer.sprite && layer.sprite.name) && [layer.x,layer.y,layer.width,layer.height].every(Number.isFinite)),"Actor portraits must capture finite sprite draws from the source avatar pipeline at its requested dimensions");
            check(actorTexts().includes("ДЕЙСТВИЕ") && actorTexts().includes("Назначить Телохранителей") && !actorTexts().some(text=>/\{(?:expression|string|.*\(\.\.\.\))/.test(text)),"Actor actions and ordinary displayed text must resolve without expression placeholders");
            actorLocale.dispose();
            writeScene("actor");
            samples.push({name:"gui_actor_1_new_new",elements:latestScene.nodes.length,roots:latestScene.roots.length});
            await ipcRenderer.invoke("goowee-test-capture","gui_actor_1_new_new");
            const actorFullBounds={...latestView.bounds};
            // Change the read-only project adapter, never the real sample file.
            const originalActorRead=actorProject.readTextFileSync;
            const alternateActor={...actorFixture,name:"Проверка настроек",mood:54,is_show_actions:false,
                inventory:{...actorFixture.inventory,money:1234},minds:actorFixture.minds.slice(0,1)};
            actorProject.readTextFileSync=function(relative){
                return relative.replace(/\\/g,"/")===".goowee-preview/actor/actor.json"?JSON.stringify(alternateActor):originalActorRead.call(this,relative);
            };
            panel.querySelectorAll(".gw-toolbar button")[1].click(); await settle();
            check(actorTexts().includes(alternateActor.name) && actorTexts().includes("1234") && latestScene.nodes.some(node=>node.name==="mood_label" && node.text==="54"),"Editing actor sample fields must update the same real GUI without changing production source");
            check(latestScene.nodes.filter(node=>node.name==="button_mind").length===1 && !latestScene.nodes.some(node=>visible(latestScene,node) && (node.name==="appoint_label" || node.name==="bodyguard_apooint_stack")),"Actor display settings must control list contents and hide the action section");
            const alternateMain=latestScene.roots.find(node=>node.name==="canvas");
            check(alternateMain && alternateMain.width===actorMain.width && alternateMain.height===actorMain.height && latestView.bounds.width<=actorFullBounds.width+1,"Hiding actor actions must preserve the menu geometry and cannot enlarge the fitted content bounds");
            writeScene("actor-actions-hidden");
            for(const actorEntry of actorEntries.slice(1)) {
                const sourcePath=path.join(state.config.projectPath,"scripts",actorEntry,actorEntry+".gml");
                state.openFile(state.newFile(actorEntry,fs.readFileSync(sourcePath,"utf8"),sourcePath));await settle();
                emitChange(panel.querySelector(".gw-entry"),actorEntry);await settle();
                checkActorFrame(latestScene,actorEntry,alternateActor);
                check(!latestScene.nodes.some(node=>visible(latestScene,node) && (node.name==="appoint_label" || node.name==="bodyguard_apooint_stack")),"The shared display settings must hide actions on "+actorEntry);
                writeScene(actorEntry+"-alternate");
            }
            actorProject.readTextFileSync=originalActorRead;
            panel.querySelectorAll(".gw-toolbar button")[1].click(); await settle();
            check(fs.readFileSync(actorFixturePath,"utf8")===actorFixtureSource,"Actor settings verification must not write the game fixture");
            for(const actorEntry of actorEntries.slice(1)) {
                const sourcePath=path.join(state.config.projectPath,"scripts",actorEntry,actorEntry+".gml");
                const source=fs.readFileSync(sourcePath,"utf8");
                state.openFile(state.newFile(actorEntry,source,sourcePath));await settle();
                emitChange(panel.querySelector(".gw-entry"),actorEntry);await settle();
                checkActorFrame(latestScene,actorEntry,actorFixture);
                check(!actorTexts().includes(alternateActor.name),"Restoring the shared actor fixture must remove the previous test identity from "+actorEntry);
                writeScene(actorEntry);
                samples.push({name:actorEntry,elements:latestScene.nodes.length,roots:latestScene.roots.length});
                await ipcRenderer.invoke("goowee-test-capture",actorEntry);
                check(fs.readFileSync(sourcePath,"utf8")===source,"Previewing "+actorEntry+" must not modify game source");
            }
            const soulSourcePath=path.join(state.config.projectPath,"scripts/SoulBasic/SoulBasic.gml");
            const soulSource=fs.readFileSync(soulSourcePath,"utf8");
            actorProject.readTextFileSync=function(relative){
                const source=originalActorRead.call(this,relative);
                return relative.replace(/\\/g,"/")==="scripts/SoulBasic/SoulBasic.gml" ? source.replace(/(static get_menu_tabs\s*=\s*function[\s\S]*?\bicon\s*:\s*)s_icon_tab_info/,"$1s_button_close") : source;
            };
            panel.querySelectorAll(".gw-toolbar button")[1].click();await settle();
            const sourceTabPanel=latestScene.nodes.find(node=>node.type==="GuiRoughTabButtonAutoWidthPanel");
            const sourceFirstTab=sourceTabPanel && sourceTabPanel.children.find(node=>node.type==="Button");
            check(sourceFirstTab && descendants(sourceFirstTab).some(node=>node.sprite && node.sprite.name==="s_button_close") && !descendants(sourceFirstTab).some(node=>node.sprite && node.sprite.name==="s_icon_tab_info"),"Editing the source SoulBasic tab method must update the preview icon without editing the shared sample adapter");
            actorProject.readTextFileSync=originalActorRead;
            panel.querySelectorAll(".gw-toolbar button")[1].click();await settle();
            checkActorFrame(latestScene,actorEntries[3],actorFixture);
            check(fs.readFileSync(soulSourcePath,"utf8")===soulSource,"Source-method variation must remain in memory and leave the game's SoulBasic script unchanged");
            actorProject.properties.gooWeePreview.localeLanguage="English"; GMEdit.emit("projectOpen",{}); await settle();
        }
        for (const name of ["gw_SoulAppointPanel", "gw_KnowledgeCard"]) {
            const sourcePath = path.join(state.config.projectPath, "scripts", name, name + ".gml");
            if (!fs.existsSync(sourcePath)) continue;
            state.openFile(state.newFile(name, fs.readFileSync(sourcePath, "utf8"), sourcePath)); await settle();
            panel = currentPanel();
            const count = panel.querySelectorAll(".gw-node").length;
            check(count > 0, "Strategy " + name + " should produce a real preview");
            samples.push({name, elements: count});
            await ipcRenderer.invoke("goowee-test-capture", name);
        }
        const knowledgePath=path.join(state.config.projectPath,"scripts/gui_KnowledgeMenu/gui_KnowledgeMenu.gml");
        if (fs.existsSync(knowledgePath)) {
            const diskKnowledge=fs.readFileSync(knowledgePath,"utf8");
            state.openFile(state.newFile("gui_KnowledgeMenu",diskKnowledge,knowledgePath)); await settle();
            emitChange(panel.querySelector(".gw-entry"),"gui_knowledge_general_create"); await settle();
            emitChange(zoom,"0.5"); await paint();
            const knowledgeTitle=latestScene.nodes.find(node=>node.type==="Label" && node.text==="Knowledge");
            check(!!knowledgeTitle && latestScene.roots.length===1,"The actual Knowledge menu must expose its localized title in one connected scene, including its frame");
            // The previous samples can leave a custom zoom behind. Bring the
            // real heading into the viewport before dispatching pointer input.
            const titlePoint=pointOn(knowledgeTitle), knowledgeStage=stage.getBoundingClientRect();
            stage.scrollLeft+=titlePoint.x-knowledgeStage.left-stage.clientWidth/2;
            stage.scrollTop+=titlePoint.y-knowledgeStage.top-stage.clientHeight/2;
            await paint();
            async function clickKnowledge(ctrlKey,double) {
                const point=pointOn(knowledgeTitle), box=stage.getBoundingClientRect();
                check(point.x>=box.left && point.x<box.left+stage.clientWidth && point.y>=box.top && point.y<box.top+stage.clientHeight,"Knowledge pointer input must land inside the visible preview viewport");
                await clickOn(point,ctrlKey,double);
            }
            await clickKnowledge(false);
            const ordinaryKnowledge=latestScene.nodes.find(node=>node.id===latestRenderOptions.selected);
            check(ordinaryKnowledge && /frame/.test(ordinaryKnowledge.name) && ordinaryKnowledge.id!==knowledgeTitle.id && ordinaryKnowledge.width>knowledgeTitle.width,"The actual Knowledge title must reproduce the overlay-frame selection with an ordinary click: "+JSON.stringify(ordinaryKnowledge && {name:ordinaryKnowledge.name,type:ordinaryKnowledge.type,width:ordinaryKnowledge.width}));
            const knowledgeInspection=panel.querySelector(".gw-inspection").textContent;
            await hoverAt(pointOn(knowledgeTitle),false);
            check(latestRenderOptions.hovered===ordinaryKnowledge.id,"The actual Knowledge hover must match the frame chosen by an ordinary click");
            control("keydown"); await paint();
            check(latestRenderOptions.hovered===knowledgeTitle.id && latestRenderOptions.selected===ordinaryKnowledge.id && panel.querySelector(".gw-inspection").textContent===knowledgeInspection,"Ctrl must highlight the real Knowledge label immediately while its frame remains selected");
            await ipcRenderer.invoke("goowee-test-capture","gui_KnowledgeMenu-ctrl-hover");
            control("keyup"); await paint();
            check(latestRenderOptions.hovered===ordinaryKnowledge.id,"Releasing Ctrl over the real Knowledge title must restore frame hover without moving the mouse");
            await hoverAt(pointOn(knowledgeTitle),true);
            await clickKnowledge(true);
            check(latestRenderOptions.selected===knowledgeTitle.id && latestRenderOptions.hovered===knowledgeTitle.id,"Ctrl-click on the actual Knowledge heading must select the Label highlighted by hover");
            const beforeKnowledgeNavigation=state.externalNavigations.length;
            await clickKnowledge(true,true);
            const knowledgeNavigation=state.externalNavigations[state.externalNavigations.length-1];
            check(state.externalNavigations.length===beforeKnowledgeNavigation+1 && knowledgeNavigation.path.replace(/\\/g,"/").endsWith("/gui_Common.gml") && knowledgeNavigation.navigation.pos.row===knowledgeTitle.line-1,"Ctrl-double-click on Knowledge must navigate to its real shared title declaration");
            check(fs.readFileSync(knowledgePath,"utf8")===diskKnowledge,"Knowledge selection checks must not write the game's script");
            samples.push({name:"gui_KnowledgeMenu/deep title",elements:latestScene.nodes.length});
            await ipcRenderer.invoke("goowee-test-capture","gui_KnowledgeMenu-deep-title");
            const knowledgeProject=$gmedit["gml.Project"].current;
            // Explicit project-owned sample setup is independent of live catalogue sizes.
            const cultureCounts={gwelts:5,voruns:5,tanaya:5,makha:5}, generalCount=9;
            const cardAsset=knowledgeProject.readYyFileSync("sprites/s_gui_knowledge_card/s_gui_knowledge_card.yy");
            // The live game source can deliberately disable cost setters. The
            // preview must follow those edits rather than invent old demo values.
            const cardSource=knowledgeProject.readTextFileSync("scripts/gw_KnowledgeCard/gw_KnowledgeCard.gml");
            const costMethod=(cardSource.match(/static\s+__set_cost\s*=\s*function[\s\S]*?(?=static\s+__set_visible)/)||[""])[0].replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,"");
            const writesCostLabels=/__cost_labels\[[^\]]+\]\.text\s*\(/.test(costMethod);
            const writesCostSprites=/__cost_images\[[^\]]+\]\.sprite\s*\(/.test(costMethod);
            knowledgeProject.properties.gooWeePreview={localeLanguage:"Russian"}; GMEdit.emit("projectOpen",{}); await settle();
            for (const kind of ["general","culture"]) {
                emitChange(panel.querySelector(".gw-entry"),"gui_knowledge_"+kind+"_create"); await settle();
                emitChange(zoom,"fit"); await paint();
                const main=latestScene.roots[0], scroll=latestScene.nodes.find(node=>node.type===(kind==="culture"?"Scroll":"DragScroll"));
                const snapshotPath=path.join(path.dirname(state.config.localizationProject),"knowledge-"+kind+"-scene.json");
                fs.writeFileSync(snapshotPath,JSON.stringify({entry:latestScene.entry,view:latestView,roots:latestScene.roots.map(node=>node.id),diagnostics:latestScene.diagnostics,nodes:latestScene.nodes.map(node=>({id:node.id,parentId:node.parentId,name:node.name,type:node.type,x:node.x,y:node.y,width:node.width,height:node.height,hidden:node.hidden,clipChildren:node.clipChildren,text:node.text,codename:node.codename,background:node.background,sprite:node.sprite,children:node.children.map(child=>child.id)}))},null,2));
                check(latestScene.entry==="gui_knowledge_"+kind+"_create" && latestScene.roots.length===1 && main.name==="canvas","The "+kind+" Knowledge wrapper must build one connected menu with no detached content roots");
                const visited=new Set(); let duplicate=false;
                (function walk(node){if(visited.has(node.id)){duplicate=true;return;}visited.add(node.id);node.children.forEach(walk);})(main);
                check(!duplicate && visited.size===latestScene.nodes.length,"The "+kind+" Knowledge scene must contain each element exactly once in its hierarchy");
                check(!!scroll && scroll.clipChildren===true && scroll.x>=main.x && scroll.y>main.y && scroll.x+scroll.width<=main.x+main.width+1 && scroll.y+scroll.height<=main.y+main.height+1,"The "+kind+" Knowledge scroll viewport must lie inside the window and clip its contents");
                check(latestScene.nodes.some(node=>node.text==="Знания") && latestScene.nodes.some(node=>node.text==="Общие знания") && latestScene.nodes.some(node=>node.text==="Знания культур"),"The "+kind+" Knowledge menu must resolve its title and both tab captions from the project");
                check(latestTextDraws.filter(draw=>draw.text==="Знания").length===1,"The "+kind+" Knowledge heading must be painted once per render, never doubled");
                check(latestScene.nodes.filter(node=>node.type==="KnowledgeCard").every(card=>card.width===Math.round(cardAsset.width/2) && card.height===Math.round(cardAsset.height/2) && card.children.some(child=>child.name==="__content" && child.children.some(image=>image.name==="__background"))),"Every "+kind+" KnowledgeCard instance must expand its real constructor and sprite dimensions, including instances after the first");
                const appoint=latestScene.nodes.find(node=>node.type==="SoulAppointPanel"), appointContents=appoint && appoint.children.filter(node=>node.name==="__content");
                check(appointContents && appointContents.length===1 && !appointContents[0].hidden && appointContents[0].x-appoint.x<20,"The "+kind+" researcher header must remove its previous content before rebuilding so hidden children cannot shift the layout");
                const goldImages=latestScene.nodes.filter(node=>node.name==="gold_image" && /gw_KnowledgeCard\.gml$/.test(node.sourcePath||""));
                check(goldImages.length===latestScene.nodes.filter(node=>node.type==="KnowledgeCard").length && goldImages.every(node=>node.sprite && node.sprite.name==="s_icon_resources_square" && node.sprite.index===0),"Every "+kind+" card must resolve the actual gold sprite factory instead of painting a missing-portrait placeholder");
                check(latestView.bounds.width<=main.width+20 && latestView.bounds.height<=main.height+20,"Fit content must use the clipped "+kind+" window bounds instead of overflowing scroll items: "+JSON.stringify({bounds:latestView.bounds,width:main.width,height:main.height,snapshot:snapshotPath}));
                const cultureColumns=latestScene.nodes.filter(node=>node.name==="column" && /gui_KnowledgeMenu\.gml$/.test(node.sourcePath||""));
                if(kind==="culture") {
                    const content=latestScene.nodes.find(node=>node.name==="scroll_content"), byId=new Map(latestScene.nodes.map(node=>[node.id,node]));
                    let ancestor=content; while(ancestor && ancestor!==scroll) ancestor=byId.get(ancestor.parentId);
                    check(!!content && ancestor===scroll && content.y>=scroll.y && content.x>=scroll.x-1,"Culture columns must belong to the scroll content and begin inside its viewport");
                    check(cultureColumns.length===4 && cultureColumns.every(node=>node.width===270 && node.height>100),"Culture Knowledge must create the four source-defined columns with complete card-height layouts");
                    check(cultureColumns.every(column=>{
                        const cards=column.children.filter(node=>node.type==="KnowledgeCard"), search=cards.find(node=>/^knowledge_search_/.test(node.codename||""));
                        const culture=search && search.codename.slice("knowledge_search_".length);
                        return search && cards.length===cultureCounts[culture]+1 && cards.every((card,i)=>card.width>0 && card.height>0 && (!i || card.y>=cards[i-1].y+cards[i-1].height+8));
                    }),"Each culture column must create the declared sample slots plus its search card, with nonoverlapping complete card layouts");
                    if(writesCostLabels) check(latestScene.nodes.some(node=>node.name==="sample_label" && node.text==="50" && visible(latestScene,node)) && latestScene.nodes.some(node=>node.name==="sample_label" && node.text==="5" && visible(latestScene,node)),"Enabled project cost setters must visibly display the supplied gold and paper costs");
                    else check(latestScene.nodes.filter(node=>node.name==="sample_label").every(node=>node.text===""),"Commented-out project cost setters must leave the sample labels empty instead of fabricating values");
                    if(writesCostSprites) check(latestScene.nodes.some(node=>node.name==="sample_image" && node.sprite && node.sprite.name==="s_icon_resources_square" && node.sprite.index===19 && visible(latestScene,node)),"Enabled project cost setters must select the initialized paper sprite rather than a missing asset");
                } else {
                    check(cultureColumns.length===0 && !latestScene.nodes.some(node=>node.type==="Scroll"),"General Knowledge must use its graph branch without culture columns");
                    check(latestScene.nodes.filter(node=>/^knowledge_general_/.test(node.codename||"")).length===generalCount,"General Knowledge must construct all project-declared sample cards through the actual tree layout");
                    check(latestScene.nodes.some(node=>node.text==="Forestry (demo)"),"The general preview must use labels supplied by the project setup");
                }
                check(["Alden","Borin","Celia"].every(name=>latestScene.nodes.some(node=>node.text===name && visible(latestScene,node))),"The "+kind+" preview must visibly populate the researcher controls from project-owned sample data");
                check(latestScene.nodes.filter(node=>node.name==="cancel_image" && node.sprite && node.sprite.name==="s_gui_soul_appoint_panel_cancel_soul").every(node=>node.hidden),"Researcher hover-only cancellation overlays must stay hidden in an idle preview");
                check(latestScene.nodes.some(node=>node.text==="37%") && latestScene.diagnostics.some(note=>/Knowledge demo/.test(note.message)),"The "+kind+" preview must show sample progress and identify its explicit demo setup");
                const progressPanel=latestScene.nodes.find(node=>node.type==="Float" && node.children.some(child=>child.name==="researching"));
                const selectedCaption=progressPanel && progressPanel.children.find(node=>node.name==="caption");
                check(selectedCaption && visible(latestScene,selectedCaption) && (kind==="culture" ? /^Поиск знания \(/.test(selectedCaption.text) && !selectedCaption.text.includes("Forestry") : selectedCaption.text==="Forestry (demo)"),"The "+kind+" preview must select research from its own category in the shared progress panel");
                samples.push({name:"gui_KnowledgeMenu/"+kind,elements:latestScene.nodes.length,roots:latestScene.roots.length});
                await ipcRenderer.invoke("goowee-test-capture","gui_KnowledgeMenu-"+kind);
            }
            knowledgeProject.properties.gooWeePreview.localeLanguage="English"; GMEdit.emit("projectOpen",{}); await settle();
            check(fs.readFileSync(knowledgePath,"utf8")===diskKnowledge,"Knowledge previews must leave the actual game source unchanged");
        }
        const familyPath = path.join(state.config.projectPath, "scripts/gui_Family/gui_Family.gml");
        if (fs.existsSync(familyPath)) {
            const drawOffset = textDraws.length;
            state.openFile(state.newFile("gui_Family", fs.readFileSync(familyPath, "utf8"), familyPath)); await settle();
            panel = currentPanel();
            emitChange(panel.querySelector(".gw-entry"), "gui_family_menu_tree_create"); await settle();
            const painted = textDraws.slice(drawOffset), buttons = [...panel.querySelectorAll(".gw-node")];
            check(painted.some(draw => draw.text==="Dynasty"), "Family must paint the localized title from gui_Common through the project's symbol index");
            check(painted.some(draw => draw.text==="Family Tree") && painted.some(draw => draw.text==="Restrictions"), "Family must localize both externally constructed rough tabs");
            check(painted.some(draw => draw.text==="Dynasty" && draw.color.toLowerCase() === "#a09ea4"), "Family title must use the actual indexed GuiTextStyles color");
            const lordRow = buttons.find(button => /player_faction_lords_stack/.test(button.textContent));
            check(!!lordRow && buttons.some(button => /label_name/.test(button.textContent)), "Initial DataBind.update must populate the Family lord row");
            lordRow.click();
            check(/\d+ × 105/.test(panel.querySelector(".gw-inspection").textContent), "The Family lord row must retain its fixed 105px height");
            check(painted.some(draw => /FAMILY_TREE.*runtime|runtime.*FAMILY_TREE/i.test(draw.text)), "The runtime-drawn Family graph must have a visible explanatory canvas placeholder");
            const familyRows=JSON.parse(fs.readFileSync(path.join(state.config.projectPath,".goowee-preview/family/family-restrictions.json"),"utf8"));
            check(!latestScene.nodes.some(node=>familyRows.some(row=>row.name===node.text)),"Restrictions-only inline samples must not populate the Family tree entry");
            const externalTitle = buttons.find(button => /gui_Common/.test(button.title) && /label · Label/.test(button.textContent));
            check(!!externalTitle, "Shared helper elements must retain their external source location");
            externalTitle.dispatchEvent(new MouseEvent("dblclick", {bubbles: true}));
            const externalNavigation = state.externalNavigations[state.externalNavigations.length - 1];
            check(externalNavigation && /gui_Common\.gml$/.test(externalNavigation.path) && externalNavigation.navigation.pos.row > 600, "Double-clicking a shared title must open gui_Common at its source line");
            samples.push({name: "gui_Family/tree", elements: buttons.length});
            await ipcRenderer.invoke("goowee-test-capture", "gui_Family-tree");
            emitChange(panel.querySelector(".gw-entry"), "gui_family_menu_restrictions_create"); await settle();
            const checkboxCell = [...panel.querySelectorAll(".gw-node")].find(button => /checkbox_cell/.test(button.textContent));
            check(!!checkboxCell, "Restrictions must construct a checkbox cell through initial binding update");
            checkboxCell.click();
            check(/80 × 38/.test(panel.querySelector(".gw-inspection").textContent), "Restrictions checkbox must use the row's REL height rather than the viewport height");
            const restrictionRows=latestScene.nodes.filter(node=>node.name==="restriction_row");
            const checkboxCells=latestScene.nodes.filter(node=>node.name==="checkbox_cell");
            check(latestScene.roots.length===1 && restrictionRows.length===5 && checkboxCells.length===15,"Compact Family hints must build three sample columns and all five source-defined restriction rows inside one window");
            check(familyRows.every(row=>latestScene.nodes.some(node=>node.text===row.name && visible(latestScene,node))),"Family sample names must be visibly rendered from the JSON value tag");
            check(familyRows.every(row=>latestScene.nodes.some(node=>node.sprite && node.sprite.name===row.soul.avatar && node.sprite.color.toLowerCase()==="#d8b59c" && visible(latestScene,node))),"The portrait argument tag must preserve the source helper and supply each real project sprite");
            const marks=checkboxCells.map(cell=>cell.children.some(button=>button.children.some(image=>image.sprite && image.sprite.name==="spr_checkbox_cross" && visible(latestScene,image))));
            check(JSON.stringify(marks)===JSON.stringify(familyRows.flatMap(row=>row.soul.restrictions)),"Each return-value tag must supply its own checked state through the existing DataBind callback");
            check(restrictionRows.every(row=>row.height===38) && checkboxCells.every(cell=>cell.width===80 && cell.height===38),"Sample table cells must retain the real GML row and column dimensions");
            check(latestScene.nodes.filter(node=>node.name==="label_name" && restrictionRows.some(row=>row.children.some(cell=>cell.id===node.parentId))).length===5,"Restriction captions must come from the initialized project catalogue");
            const familyLocale=GooWeePreviewLocalization.create($gmedit["gml.Project"].current,{language:"English"});
            check(["restrictions.eat.meat","restrictions.activity.alcohol","restrictions.ale","restrictions.activity.nectar","restrictions.activity.dice"].every(key=>latestScene.nodes.some(node=>node.text===familyLocale.lookup(key) && visible(latestScene,node))),"All five restriction captions must use the real English project translations");
            familyLocale.dispose();
            const familyScenePath=path.join(path.dirname(state.config.localizationProject),"family-restrictions-scene.json");
            fs.writeFileSync(familyScenePath,JSON.stringify({entry:latestScene.entry,diagnostics:latestScene.diagnostics,roots:latestScene.roots.map(node=>node.id),nodes:latestScene.nodes.map(node=>({id:node.id,parentId:node.parentId,name:node.name,type:node.type,x:node.x,y:node.y,width:node.width,height:node.height,hidden:node.hidden,text:node.text,sprite:node.sprite,children:node.children.map(child=>child.id)}))},null,2));
            samples.push({name: "gui_Family/restrictions", elements: panel.querySelectorAll(".gw-node").length});
            await ipcRenderer.invoke("goowee-test-capture", "gui_Family-restrictions");
        }
    }
    state.openFile(file); await settle();
    const cleanupOther=state.newFile("cleanup_helper","function helper() { return 1; }");
    if(referenceToggle.checked){referenceToggle.click();await paint();}
    panel.querySelector(".gw-node").click();panel.querySelector('[aria-label="Hide selected element"]').click();await paint();
    check(latestRenderOptions.hiddenNodeIds && latestRenderOptions.hiddenNodeIds.size>0,"The cleanup fixture must retain a manual hide before disabling the plugin");
    panel.querySelector(".gw-reference-lock").click();
    panel.querySelector(".gw-lock").click(); state.openFile(cleanupOther); await settle();
    file.codeEditor.session.edit(edited + "\n// pending edit at disable time");
    sharpPixels.checked=true;sharpPixels.dispatchEvent(new Event("change"));await paint();
    plugin.cleanup();
    await settle();
    check(GMEdit.listenerCount("activeFileChange") === 0 && GMEdit.eventNames().length === 0 && file.codeEditor.session.listenerCount("change") === 0 && cleanupOther.codeEditor.session.listenerCount("change")===0, "Cleanup must remove all GMEdit, pinned and active session listeners");
    check(!GMEdit.sidebar.panels.has("GooWee Preview") && !GMEdit.bottomPanel.panels.has("GooWee Preview") && !document.getElementById("goowee-preview"), "Cleanup must remove its dock and DOM");
    check(state.commands.size === 0 && state.palette.size === 0 && state.resizeListeners.size === 0, "Cleanup must release commands, palette entries and resize listener");
    check([...state.navigationListeners.values()].every(listeners=>listeners.size===0), "Cleanup must release global keyboard, pointer and focus listeners");
    preferences.replaceChildren(); plugin.buildPreferences(preferences);
    check(!!preferences.querySelector("select"), "Preferences must remain usable while the plugin is disabled");
    state.openFile(file);
    plugin.init(); await settle();
    check(GMEdit.listenerCount("activeFileChange") === 1 && file.codeEditor.session.listenerCount("change") === 1 && state.resizeListeners.size === 1, "Reload must install only one copy of each listener");
    check(currentPanel().querySelector('[aria-label="Show approximate bounds"]').checked === false, "The dashed-bounds preference must survive plugin reload");
    check(currentPanel().querySelector('[aria-label="Sharp pixels"]').checked === true && latestRenderOptions.sharpPixels === true,"The sharp pixel preference must survive plugin reload and apply on the first render");
    check(currentPanel().querySelector(".gw-lock").getAttribute("aria-pressed")==="false","Reload must start unlocked rather than retaining a stale file or session");
    check((!latestRenderOptions.hiddenNodeIds || latestRenderOptions.hiddenNodeIds.size===0) && currentPanel().querySelector('[aria-label="Show all hidden elements"]').disabled,
        "Reload must clear temporary manual hides and their undo history");
    check(currentPanel().querySelector(".gw-reference-lock").getAttribute("aria-pressed")==="false",
        "Reload must reset the reference positioning lock instead of saving it in project or global preferences");
    check(!currentPanel().querySelector('[aria-label="Reference"]').checked && currentPanel().querySelector(".gw-reference-toolbar").hidden && currentPanel().querySelector('[aria-label="Show reference"]').checked && currentPanel().querySelector('[aria-label="Reference offset X"]').value==="0" && currentPanel().querySelector('[aria-label="Reference offset Y"]').value==="0" && /no.*file|not.*selected/i.test(currentPanel().querySelector(".gw-reference-name").textContent) && !latestRenderOptions.reference,
        "Reload must release an unnamed script's temporary Blob reference and start with the reference panel disabled");
    $gmedit["gml.Project"].current=referencePersistence.project;GMEdit.emit("projectOpen",{});state.openFile(referencePersistence.file);await settle();
    const reloadedPanel=currentPanel();
    check(!reloadedPanel.querySelector('[aria-label="Reference"]').checked && reloadedPanel.querySelector(".gw-reference-toolbar").hidden && reloadedPanel.querySelector('[aria-label="Reference offset X"]').value==="14" && reloadedPanel.querySelector('[aria-label="Reference offset Y"]').value==="-6" && reloadedPanel.querySelector(".gw-reference-name").textContent==="shared-a.png" && !latestRenderOptions.reference,
        "After plugin reload the saved project file and offsets must restore while reference visibility remains disabled by default");
    GMEdit.sidebar.set("GooWee Preview");await settle();
    reloadedPanel.querySelector('[aria-label="Reference"]').click();await settle();
    check(latestRenderOptions.reference && latestRenderOptions.reference.image.naturalWidth===80 && latestRenderOptions.reference.x===14 && latestRenderOptions.reference.y===-6,
        "A restored reference must be decoded and ready to display after re-enabling its session checkbox");
    emitChange(reloadedPanel.querySelector(".gw-entry"),"alternate_view");await settle();
    check(latestRenderOptions.reference && reloadedPanel.querySelector(".gw-reference-name").textContent==="private-alternate.png" && latestRenderOptions.reference.x===43 && latestRenderOptions.reference.y===-35,
        "Reload must restore the alternate function's private image and offsets independently from its script's default entry");
    emitChange(reloadedPanel.querySelector(".gw-entry"),"preview_demo");await settle();
    check(latestRenderOptions.reference && reloadedPanel.querySelector(".gw-reference-name").textContent==="shared-a.png" && latestRenderOptions.reference.image.naturalWidth===80 && latestRenderOptions.reference.x===14 && latestRenderOptions.reference.y===-6,
        "Switching entries after reload must restore the default function's shared reference without the alternate's local override");
    state.openFile(referencePersistence.privateFile);await settle();
    check(latestRenderOptions.reference && reloadedPanel.querySelector(".gw-reference-name").textContent==="private-reference.png" && latestRenderOptions.reference.x===52 && latestRenderOptions.reference.y===-31,
        "A private absolute-path reference must also restore from local preferences after a complete plugin reload");
    const finalStage=reloadedPanel.querySelector(".gw-stage"),finalCanvas=reloadedPanel.querySelector("canvas"),finalStageBox=finalStage.getBoundingClientRect();
    const finalX=finalStageBox.left+100,finalY=finalStageBox.top+100;
    const normalCleanupSave=state.preferences.save;let cleanupSaveAttempts=0;
    state.preferences.save=function(){if(++cleanupSaveAttempts===1)throw new Error("Transient cleanup save failure");return normalCleanupSave.call(this);};
    pointer(finalCanvas,"pointerdown",finalX,finalY,1,0);pointer(window,"pointermove",finalX+23,finalY+11,1,0);
    const finalOffsets=[Number(reloadedPanel.querySelector('[aria-label="Reference offset X"]').value),Number(reloadedPanel.querySelector('[aria-label="Reference offset Y"]').value)];
    try {plugin.cleanup();} finally {state.preferences.save=normalCleanupSave;}
    const privateContext=GooWeePreviewReferences.create(state.preferences,$gmedit["ui.project.ProjectProperties"]).context(referencePersistence.project,referencePersistence.privateFile.path,"preview_demo","preview_demo");
    const cleanupRecord=state.preferences.current.gooWeePreview.localReferences[privateContext.localKey].entries.preview_demo;
    check(cleanupSaveAttempts>=2 && finalOffsets[0]!==52 && cleanupRecord.x===finalOffsets[0] && cleanupRecord.y===finalOffsets[1],
        "Cleanup during dragging must retry a transient save with the final reference offsets before clearing runtime state, never overwriting them with zero");
    check([...state.navigationListeners.values()].every(listeners=>listeners.size===0), "Repeated initialization and cleanup must not leak navigation listeners");
    CanvasRenderingContext2D.prototype.fillText = originalFillText;
    state.restoreClipboard();
    check(state.errors.length === 0, "The renderer must have no uncaught errors: " + state.errors.join("; "));
    return {tests, samples};
}
