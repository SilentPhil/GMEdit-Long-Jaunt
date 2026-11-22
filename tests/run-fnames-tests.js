"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const {spawn, spawnSync} = require("child_process");
const {pathToFileURL} = require("url");
const root = path.resolve(__dirname, ".."), appDir = path.join(root, "bin/resources/app");
const option = name => {const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1];};
if (!process.versions.electron) {
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const executable = path.join(appDir, "node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : "electron");
    const child = spawn(executable, [__filename, ...process.argv.slice(2)], {cwd: root, env, windowsHide: true, stdio: "inherit"});
    child.on("error", error => {console.error(error); process.exitCode = 1;});
    child.on("exit", code => {process.exitCode = code == null ? 1 : code;});
} else run().catch(error => {console.error(error); require("electron").app.exit(1);});

async function run() {
    const {app, BrowserWindow} = require("electron");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmedit-fnames-"));
    app.setPath("userData", path.join(directory, "profile"));
    const bridge = path.join(directory, "bridge.js");
    const build = spawnSync("haxe", ["-cp", "src", "-cp", "tests/fnames", "-main", "FnamesTestBridge", "-D", "test", "-js", bridge], {cwd: root, encoding: "utf8", windowsHide: true});
    if (build.error || build.status !== 0) throw new Error("Test bridge build failed: " + (build.error || build.stderr));
    const apiDir = path.join(directory, "api"), userPath = path.join(directory, "user");
    fs.mkdirSync(path.join(apiDir, "custom_fnames", "Alternative"), {recursive: true});
    fs.mkdirSync(path.join(apiDir, "custom_fnames", "Find in selected runtime"), {recursive: true});
    fs.mkdirSync(path.join(userPath, "config"), {recursive: true});
    fs.writeFileSync(path.join(apiDir, "fnames"), "default_only()\npatched(value)\n");
    fs.writeFileSync(path.join(apiDir, "custom_fnames", "Alternative", "fnames"), "custom_only()\n");
    fs.writeFileSync(path.join(apiDir, "custom_fnames", "Find in selected runtime", "fnames"), "collision_only()\n");
    fs.writeFileSync(path.join(apiDir, "extra.gml"), "extra_only()\n");
    fs.writeFileSync(path.join(apiDir, "replace.gml"), "patched(replacement)\n");
    fs.writeFileSync(path.join(apiDir, "noret.gml"), "");
    const runtimeA = path.join(directory, "runtime-a"), runtimeB = path.join(directory, "runtime-b");
    for (const runtime of [runtimeA, runtimeB]) fs.mkdirSync(runtime);
    fs.writeFileSync(path.join(runtimeA, "fnames"), "runtime_a_only()\r\npatched(old)\r\n");
    fs.writeFileSync(path.join(runtimeB, "fnames"), "runtime_b_only()\n");
    const url = file => pathToFileURL(file).href;
    const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${url(path.join(appDir, "css/main.css"))}">
<style>body{background:#222;color:#ddd;font:14px sans-serif;padding:20px}.select select{width:100%;background:#333;color:#eee;padding:8px;margin:5px 0}fieldset{border:1px solid #555}.plaintext{margin:8px 0;overflow-wrap:anywhere}</style>
<script>window.Electron_API=null; window.Electron_FS=require('fs'); window.alert=message=>{throw Error(message)};
window.addEventListener('error', event => console.error(event.error?.stack || event.message));</script>
<script src="${url(bridge)}"></script>`;
    const file = path.join(directory, "test.html"); fs.writeFileSync(file, html);
    await app.whenReady();
    const window = new BrowserWindow({width: 1100, height: 450, show: false, webPreferences: {nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false, offscreen: true}});
    const errors = [];
    window.webContents.on("console-message", (_event, level, message) => {if (level >= 3) errors.push(message);});
    const timeout = setTimeout(() => {console.error("Fnames tests timed out"); app.exit(2);}, 60000);
    try {
        await window.loadFile(file);
        const config = {apiDir, userPath, runtimeA, runtimeB,
            pluginURL: option("--constructor") ? url(path.join(option("--constructor"), "js/RuntimeFnamesIntegration.js")) : null,
            realRuntime: option("--runtime"), realAPI: path.join(appDir, "api/v23")};
        const result = await window.webContents.executeJavaScript(`(${verify.toString()})(${JSON.stringify(config)})`);
        if (errors.length) throw new Error(errors.join("\n"));
        await window.webContents.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const screenshot = path.join(directory, "fnames-preferences.png");
        fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
        console.log(`Runtime fnames: ${result} checks passed. Screenshot: ${screenshot}`);
    } finally {clearTimeout(timeout); window.destroy();}
    app.exit(0);
}

async function verify(config) {
    const fs = require("fs"), path = require("path"), {EventEmitter} = require("events");
    let checks = 0;
    function assert(value, message) {if (!value) throw new Error(message); checks++;}
    const {loader, prefs, version} = FnamesTestBridge.init(config.apiDir, config.userPath);
    const dropdown = () => document.querySelectorAll("select")[1];
    const labels = () => Array.from(dropdown().options, option => option.textContent);
    const choose = label => {dropdown().value = label; dropdown().dispatchEvent(new Event("change", {bubbles: true}));};
    const has = name => FnamesTestBridge.hasFunction(name);
    assert(has("default_only"), "Default fnames loads");
    assert(!labels().includes("Find in selected runtime"), "Runtime option absent without plugin");
    choose("Alternative"); assert(has("custom_only") && !has("default_only"), "Custom sets still load");
    choose("Find in selected runtime (custom)"); assert(has("collision_only"), "Custom set named like runtime option stays distinct");
    let selectedPath = path.join(config.runtimeA, "fnames");
    const provider = {supportsVersion: name => name === "v23", getPath: () => selectedPath};
    loader.registerRuntimeFnamesProvider(provider);
    assert(labels().includes("Find in selected runtime"), "Enabling provider updates an already open preferences page");
    const group = document.getElementById("pref-api-fnames"); group.remove();
    loader.unregisterRuntimeFnamesProvider(provider);
    assert(!Array.from(group.querySelectorAll("select")[1].options).some(option => option.value === "Find in selected runtime"), "Disabling provider removes option from detached preferences");
    loader.registerRuntimeFnamesProvider(provider);
    assert(Array.from(group.querySelectorAll("select")[1].options).some(option => option.value === "Find in selected runtime"), "Provider refresh updates detached preferences");
    document.body.appendChild(group);
    assert(!Array.from(document.querySelectorAll("select")[0].options).some(option => option.value === "Find in selected runtime"), "Legacy API has no incompatible runtime option");
    choose("Find in selected runtime");
    assert(prefs.apiFnamesRuntime.v23 === true, "Runtime choice persists in preferences");
    const saved = JSON.parse(fs.readFileSync(path.join(config.userPath, "config/user-preferences.json"), "utf8"));
    assert(saved.apiFnamesRuntime.v23 === true, "Runtime choice is saved to disk");
    assert(has("runtime_a_only") && !has("collision_only"), "Runtime replaces bundled/custom fnames");
    assert(has("extra_only"), "Existing API extras remain active");
    const raw = FnamesTestBridge.loadRaw(config.apiDir, "v23");
    assert(raw.includes("patched(replacement)") && !raw.includes("patched(old)"), "Existing patches apply to runtime fnames");
    assert(!raw.includes("\r"), "Runtime CRLF normalizes");
    assert(document.body.textContent.includes(selectedPath), "Preferences show selected fnames path");
    selectedPath = path.join(config.runtimeB, "fnames"); loader.refreshRuntimeFnames();
    assert(has("runtime_b_only") && !has("runtime_a_only"), "Runtime switch replaces old API symbols");
    selectedPath = path.join(config.runtimeB, "missing"); loader.refreshRuntimeFnames();
    assert(has("default_only") && !has("runtime_b_only"), "Missing runtime file falls back to Default");
    assert(document.body.textContent.includes("Using Default"), "Fallback is visible in preferences");
    selectedPath = config.runtimeA; loader.refreshRuntimeFnames();
    assert(has("default_only"), "Directory is not accepted as fnames");
    selectedPath = path.join(config.runtimeA, "fnames");
    const originalRead = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {if (file === selectedPath) throw Error("Permission denied (test)"); return originalRead.call(this, file, ...args);};
    try {
        loader.refreshRuntimeFnames(); assert(has("default_only"), "Unreadable file falls back without crashing");
        assert(document.body.textContent.includes("Using Default"), "Unreadable runtime fallback is shown in preferences");
    }
    finally {fs.readFileSync = originalRead;}
    loader.unregisterRuntimeFnamesProvider(provider);
    assert(!labels().includes("Find in selected runtime") && has("default_only"), "Disabling plugin removes option and resets loaded API");
    assert(prefs.apiFnamesRuntime.v23 === true, "Preference retained for re-enable");
    loader.registerRuntimeFnamesProvider(provider);
    assert(has("runtime_a_only") && dropdown().value === "Find in selected runtime", "Re-enable restores runtime mode");
    choose("Default");
    assert(!prefs.apiFnamesRuntime.v23 && has("default_only"), "Default disables runtime mode");
    selectedPath = path.join(config.runtimeB, "fnames"); loader.refreshRuntimeFnames();
    assert(has("default_only"), "Runtime changes do not override Default mode");
    loader.unregisterRuntimeFnamesProvider(provider);
    if (config.pluginURL) {
        const {RuntimeFnamesIntegration} = await import(config.pluginURL);
        const properties = {events: new EventEmitter(), project: {version}, runtimeReleaseChannel: "LTS 2026", getRuntimeVersion: () => "chosen"};
        let currentProject = properties.project, runtimePath = config.runtimeA;
        const preferences = {events: new EventEmitter(), getRuntimeInfo: () => ({ok: true, data: {path: runtimePath}})};
        const integration = new RuntimeFnamesIntegration(loader, preferences, {joinPath: path.join}, () => currentProject, properties);
        choose("Find in selected runtime");
        assert(has("runtime_a_only"), "Real Constructor bridge loads selected runtime");
        runtimePath = config.runtimeB; properties.events.emit("setRuntimeVersion");
        assert(has("runtime_b_only") && !has("runtime_a_only"), "Constructor runtime event refreshes API");
        runtimePath = config.runtimeA; preferences.events.emit("runtimeListChanged");
        assert(has("runtime_a_only"), "Runtime search directory refreshes API");
        currentProject = {version}; loader.refreshRuntimeFnames();
        assert(has("default_only"), "Switching project never loads stale Constructor selection");
        integration.setProject(undefined);
        assert(has("default_only"), "Closing project resets runtime API");
        currentProject = properties.project; integration.setProject(properties);
        assert(has("runtime_a_only"), "Opening project reloads runtime API");
        integration.destroy();
        assert(has("default_only") && !labels().includes("Find in selected runtime"), "Constructor cleanup restores defaults and removes menu option");
    }
    if (config.realRuntime) {
        selectedPath = path.join(config.realRuntime, "fnames");
        loader.registerRuntimeFnamesProvider(provider);
        choose("Find in selected runtime");
        FnamesTestBridge.useRealAPI(config.realAPI);
        assert(has("draw_text") && has("show_debug_message"), "Installed runtime loads through production parser with real v23 patches");
        const runtimeText = fs.readFileSync(selectedPath, "utf8");
        const bundledText = fs.readFileSync(path.join(config.realAPI, "fnames"), "utf8");
        const added = [...runtimeText.matchAll(/^([a-z_]\w*)\(/gm)].map(match => match[1])
            .find(name => !new RegExp("^" + name + "\\b", "m").test(bundledText) && has(name));
        assert(added, "At least one runtime-only function is available in the parsed API");
        console.log("Verified runtime-only API function: " + added);
    }
    return checks;
}
