"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const {spawn, spawnSync} = require("child_process");
const {pathToFileURL} = require("url");
const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "bin/resources/app");
if (!process.versions.electron) {
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const executable = path.join(appDir, "node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : "electron");
    const child = spawn(executable, [__filename], {cwd: root, env, windowsHide: true, stdio: "inherit"});
    child.on("error", error => {console.error(error); process.exitCode = 1;});
    child.on("exit", code => {process.exitCode = code == null ? 1 : code;});
} else run().catch(error => {console.error(error); require("electron").app.exit(1);});

async function run() {
    const {app, BrowserWindow, ipcMain} = require("electron");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmedit-colors-"));
    app.setPath("userData", path.join(directory, "profile"));
    const bridge = path.join(directory, "bridge.js");
    const build = spawnSync("haxe", ["-cp", "src", "-cp", "tests/color-picker", "-main", "ColorPickerTestBridge", "-D", "test", "-js", bridge], {cwd: root, encoding: "utf8", windowsHide: true});
    if (build.error || build.status !== 0) throw new Error("Test bridge build failed: " + (build.error || build.stderr));
    const url = file => pathToFileURL(file).href;
    const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="${url(path.join(appDir, "css/main.css"))}">
<style>body{margin:0;background:#20252d;color:#ddd;font:14px sans-serif}.ace_editor{height:260px;width:800px}.color-dialog{color:#222}</style>
<div id="editor"></div><div id="second"></div>
<script src="${url(path.join(appDir, "ace/src-noconflict/ace.js"))}"></script>
<script>window.addEventListener('error', event => console.error(event.error?.stack || event.message));
window.Electron_API=null; window.GMEdit={_signal(){}};
window.AceRange=ace.require('ace/range').Range;</script>
<script src="${url(bridge)}"></script>`;
    const file = path.join(directory, "test.html"); fs.writeFileSync(file, html);
    await app.whenReady();
    const window = new BrowserWindow({width: 900, height: 650, show: false, webPreferences: {nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false, offscreen: true}});
    ipcMain.handle("color-test-right-click", (_event, point) => {
        window.webContents.sendInputEvent({type: "mouseMove", ...point});
        window.webContents.sendInputEvent({type: "mouseDown", button: "right", clickCount: 1, ...point});
        window.webContents.sendInputEvent({type: "mouseUp", button: "right", clickCount: 1, ...point});
    });
    window.webContents.on("console-message", (_event, level, message) => {if (level >= 3) console.error(message);});
    const timeout = setTimeout(() => {console.error("Color picker tests timed out"); app.exit(2);}, 60000);
    try {
        await window.loadFile(file);
        const result = await window.webContents.executeJavaScript(`(${verify.toString()})()`);
        await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const screenshot = path.join(directory, "color-dialog.png");
        fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
        console.log(`Color picker: ${result} checks passed. Screenshot: ${screenshot}`);
    } finally {clearTimeout(timeout); ipcMain.removeHandler("color-test-right-click"); window.destroy();}
    app.exit(0);
}

async function verify() {
    let checks = 0;
    function assert(value, message) {if (!value) throw new Error(message); checks++;}
    const wait = () => new Promise(resolve => setTimeout(resolve, 30));
    // Real Ace hit testing, selections, anchors and Undo. The fixture mode marks
    // numeric literals, comments and strings with the same token types as GML.
    function create(id) {
        const editor = ace.edit(id);
        const Mode = ace.require("ace/mode/text").Mode;
        const mode = new Mode();
        const Tokenizer = ace.require("ace/tokenizer").Tokenizer;
        mode.$tokenizer = new Tokenizer({start: [
            {token: "comment", regex: "//.*$"},
            {token: "string", regex: '"[^"\\n]*"'},
            {token: "numeric", regex: "(?:#|0x|\\$)[0-9a-fA-F]+\\b"},
            {token: "numeric", regex: "[0-9]+"},
            {token: "text", regex: "\\s+"},
            {token: "identifier", regex: "[a-zA-Z_][a-zA-Z_0-9]*"},
            {token: "punctuation.operator", regex: "."}
        ]});
        editor.session.setMode(mode);
        editor.setOptions({fontSize: 15, showPrintMargin: false});
        return editor;
    }
    const editor = create("editor");
    ColorPickerTestBridge.init(editor);
    const second = create("second"); ColorPickerTestBridge.bind(second);
    const dialog = () => document.querySelector(".color-dialog");
    const hex = () => dialog().querySelector('input[type="text"]');
    const swatch = () => dialog().querySelector('input[type="color"]');
    function button(label) {return Array.from(dialog().querySelectorAll('input[type="button"]')).find(el => el.value === label);}
    function input(value) {hex().value = value; hex().dispatchEvent(new Event("input", {bubbles: true}));}
    async function reset(text, target = editor) {
        target.setValue(text, -1); target.session.getUndoManager().reset(); target.renderer.updateFull(true); await wait();
    }
    function menuAt(column, target = editor, row = 0) {
        const point = target.renderer.textToScreenCoordinates(row, column);
        target.renderer.scroller.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true, clientX: point.pageX, clientY: point.pageY + 5, button: 2}));
        return Array.from(document.querySelectorAll("body > .popout-menu > li"));
    }
    function open(column, target = editor) {
        const rows = menuAt(column, target);
        assert(rows[0].textContent === "Change color...", "Color action must be first");
        rows[0].click(); assert(dialog(), "Color action opens the shared dialog");
    }
    function closeMenu() {document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", keyCode: 27, bubbles: true}));}
    // Exercise the complete browser mouse sequence: Ace moves its hidden textarea
    // under the pointer on mousedown, so contextmenu can target that sibling of
    // the scroller rather than the code element itself.
    await reset("var first = #9D4B52; var second = #ABCDEF;");
    editor.selection.setSelectionRange(new AceRange(0, 0, 0, 3));
    const firstPoint = editor.renderer.textToScreenCoordinates(0, 15);
    await require("electron").ipcRenderer.invoke("color-test-right-click", {
        x: Math.round(firstPoint.pageX), y: Math.round(firstPoint.pageY + 5)
    });
    await wait();
    const firstMenuItem = document.querySelector("body > .popout-menu > li");
    assert(firstMenuItem?.textContent === "Change color...", "First physical right-click offers Change color with selection elsewhere");
    firstMenuItem.click();
    assert(hex().value === "#9D4B52", "First right-click resolves the pointed color");
    button("Cancel").click();
    for (const [literal, expected] of [["#9D4B52", "#123456"], ["0x524B9D", "0x563412"], ["$524B9D", "$563412"]]) {
        await reset(`var a = ${literal}; var b = #ABCDEF;`);
        editor.selection.setSelectionRange(new AceRange(0, 0, 0, 3));
        open(8);
        assert(hex().value === "#9D4B52", "RGB initial value for " + literal);
        input("#123456");
        assert(swatch().value === "#123456", "HEX updates color input");
        assert(editor.getValue().includes(literal), "Code remains unchanged before Apply");
        button("Apply").click(); await wait();
        assert(editor.getValue() === `var a = ${expected}; var b = #ABCDEF;`, "Only clicked literal is replaced, with original prefix/channel order");
        editor.undo();
        assert(editor.getValue() === `var a = ${literal}; var b = #ABCDEF;`, "One Undo restores literal");
        editor.redo(); assert(editor.getValue().includes(expected), "Redo restores selected color");
    }
    await reset("var a = #aabbcc;");
    open(10); button("Apply").click();
    assert(editor.getValue() === "var a = #aabbcc;" && !editor.session.getUndoManager().hasUndo(), "Unchanged Apply preserves case and undo history");
    for (const dismiss of [() => button("Cancel").click(), () => dialog().querySelector(".overlay").click(), () => hex().dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))]) {
        open(10); input("#112233"); dismiss();
        assert(!dialog() && editor.getValue() === "var a = #aabbcc;", "Cancel/overlay/Escape leave code unchanged");
    }
    open(10); input("#12zzzz"); button("Apply").click();
    assert(dialog() && !hex().checkValidity(), "Invalid HEX cannot apply");
    swatch().value = "#123abc"; swatch().dispatchEvent(new Event("input", {bubbles: true}));
    assert(hex().value === "#123ABC" && hex().checkValidity(), "Picker repairs invalid HEX and synchronizes field");
    hex().dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}));
    assert(editor.getValue() === "var a = #123ABC;", "Enter applies HEX");
    for (const [text, column] of [['"#AABBCC"', 2], ['// #AABBCC', 4], ['123456', 1], ['#ABCDE', 2], ['#AABBCCDD', 2], ['#AABBCC;', 7], ['#AABBCC  ', 8]]) {
        await reset(text);
        assert(!menuAt(column).some(row => row.textContent === "Change color..."), "No color action outside supported literal: " + text);
        closeMenu();
    }
    await reset("#AABBCC"); editor.setReadOnly(true);
    assert(!menuAt(2).some(row => row.textContent === "Change color..."), "Read-only editor has no color action");
    closeMenu(); editor.setReadOnly(false);
    await reset("#AABBCC", second); open(1, second); input("#998877"); button("Apply").click();
    assert(second.getValue() === "#998877" && editor.getValue() === "#AABBCC", "Uses clicked secondary editor");
    open(1); input("#112233"); editor.session.doc.insert({row: 0, column: 0}, "prefix "); button("Apply").click();
    assert(editor.getValue() === "prefix #112233", "Anchors follow literal when document shifts");
    open(9); input("#445566"); editor.session.doc.replace(new AceRange(0, 7, 0, 14), "#FFFFFF"); button("Apply").click();
    assert(editor.getValue() === "prefix #FFFFFF", "Does not overwrite a literal changed while dialog is open");
    let clipboard = "#102030";
    window.Electron_API = {clipboard: {readText: () => clipboard, writeText: text => {clipboard = text;}}};
    open(9); button("Paste").click();
    assert(hex().value === "#102030" && swatch().value === "#102030", "Paste updates both inputs");
    input("#aabbcc"); button("Copy").click(); assert(clipboard === "#AABBCC", "Copy uses current HEX value"); button("Cancel").click();
    window.Electron_API = null;
    const tab = document.createElement("div"); document.body.appendChild(tab);
    ColorPickerTestBridge.tabColor(tab); input("#112233");
    assert(tab.dataset.tabColor === "#112233", "Tab dialog previews HEX"); button("Cancel").click();
    assert(!tab.dataset.tabColor, "Cancel restores uncolored tab");
    ColorPickerTestBridge.tabColor(tab); input("#445566"); button("Apply").click();
    assert(tab.dataset.tabColor === "#445566", "Tab color Apply");
    ColorPickerTestBridge.tabColor(tab);
    assert(hex().value === "#445566", "Tab dialog loads existing color");
    input("#778899"); button("Cancel").click(); assert(tab.dataset.tabColor === "#445566", "Tab Cancel restores previous color");
    await reset("var color = #9D4B52;"); open(13);
    const colorBounds = swatch().getBoundingClientRect(), hexBounds = hex().getBoundingClientRect();
    assert(hexBounds.left > colorBounds.right && hexBounds.top < colorBounds.bottom, "HEX field appears to the right of color swatch");
    return checks;
}
