"use strict";
const assert = require("assert");
const {create} = require("../bin/resources/app/plugins/goowee-preview/preview-references");
let count = 0;
function test(name, callback) { callback(); count++; console.log("ok - " + name); }
function projectFixture(dir, properties = {}, config = null) {
    return {dir, properties, config, configWrites: [],
        readConfigJsonFileSync(name) { assert.strictEqual(name, "goowee_preview.json"); return this.config; },
        writeConfigJsonFileSync(name, data) { assert.strictEqual(name, "goowee_preview.json"); this.config = JSON.parse(JSON.stringify(data)); this.configWrites.push(this.config); },
        existsSync(name) { assert.strictEqual(name, "#config/goowee_preview.json"); return this.config !== null; }};
}
function fixture() {
    const preferences = {current: {gooWeePreview: {outlines: true}}, saves: [], save() { this.saves.push(JSON.parse(JSON.stringify(this.current))); }};
    const projectProperties = {saves: [], save(project, data) { this.saves.push({project, data: JSON.parse(JSON.stringify(data))}); }};
    const project = projectFixture("C:\\Work\\Example", {unrelated: 12, gooWeePreview: {localeLanguage: "English"}});
    const storage = create(preferences, projectProperties);
    return {preferences, projectProperties, project, storage, ctx: storage.context(project, "scripts/menu/menu.gml")};
}
test("project images store a portable token, offsets and script-relative key", () => {
    const f = fixture(), prefs = f.preferences.current.gooWeePreview, settings = f.project.properties.gooWeePreview;
    const saved = f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\menu #1.png", -12, 30.5);
    assert.deepStrictEqual(saved, {path: "${projectDir}/refs/menu #1.png", filePath: "C:\\Work\\Example\\refs\\menu #1.png", x: -12, y: 30.5, scope: "project"});
    assert.deepStrictEqual(f.project.config.references, {"scripts/menu/menu.gml": {entries: {"": {path: saved.path, x: -12, y: 30.5}}}}, "Only path and offsets belong in each entry record");
    assert.strictEqual(f.project.properties.unrelated, 12);
    assert.strictEqual(settings.localeLanguage, "English");
    assert.strictEqual(f.project.properties.gooWeePreview, settings);
    assert.strictEqual(f.preferences.current.gooWeePreview, prefs);
    assert.strictEqual(f.preferences.saves.length, 0);
    assert.strictEqual(f.projectProperties.saves.length, 0, "Reference persistence must never write properties.json");
    assert.strictEqual(f.project.properties.gooWeePreview.references, undefined);
    assert.strictEqual(f.project.configWrites.length, 1);
    assert.deepStrictEqual(f.storage.load(f.ctx), saved);
});
test("relocating a project resolves the same saved reference under the new root", () => {
    const f = fixture(); f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\preview.png", 8, -3);
    const copied = projectFixture("D:\\Team Member\\Clone", JSON.parse(JSON.stringify(f.project.properties)), JSON.parse(JSON.stringify(f.project.config)));
    const ctx = f.storage.context(copied, "D:/Team Member/Clone/scripts/menu/menu.gml");
    const loaded = f.storage.load(ctx);
    assert.strictEqual(loaded.filePath, "D:\\Team Member\\Clone\\refs\\preview.png");
    assert.deepStrictEqual([loaded.x, loaded.y, loaded.scope], [8, -3, "project"]);
    assert(!JSON.stringify(copied.config).includes("C:"));
});
test("Windows paths normalize casing and separators for matching scripts", () => {
    const f = fixture(); f.storage.save(f.ctx, "c:/work/example/Refs/Screen.PNG", 1, 2);
    f.project.dir = "c:/WORK/EXAMPLE/";
    const ctx = f.storage.context(f.project, "C:\\Work\\Example\\Scripts\\Menu\\MENU.GML");
    assert.strictEqual(ctx.localKey, f.ctx.localKey);
    assert.strictEqual(f.storage.load(ctx).scope, "project");
    f.storage.save(ctx, "c:/WORK/EXAMPLE/Refs/Other.png", 3, 4);
    assert.strictEqual(Object.keys(f.project.config.references).length, 1);
    assert.strictEqual(f.storage.load(f.ctx).x, 3);
});
test("a prefix sibling and dot-dot escape are external and stay local", () => {
    const f = fixture();
    f.storage.save(f.ctx, "C:\\Work\\Example-copy\\ref.png", 4, 5);
    assert.strictEqual(f.storage.load(f.ctx).scope, "local");
    f.storage.save(f.ctx, "C:\\Work\\Example\\..\\external.png", -1, 9);
    assert.strictEqual(f.storage.load(f.ctx).filePath, "C:\\Work\\external.png");
    assert.strictEqual(f.projectProperties.saves.length, 0);
    assert.strictEqual(f.project.configWrites.length, 0);
    assert.strictEqual(f.project.config, null, "Choosing only external images must not create a project config");
    assert.strictEqual(f.preferences.saves.length, 2);
    assert.strictEqual(f.preferences.current.gooWeePreview.outlines, true);
});
test("local overrides preserve the shared project reference for other users", () => {
    const f = fixture(); f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\shared.png", 1, 2);
    const shared = JSON.stringify(f.project.config), properties = JSON.stringify(f.project.properties);
    f.storage.save(f.ctx, "E:\\Personal\\external.png", 12, 13);
    assert.strictEqual(f.storage.load(f.ctx).scope, "local");
    assert.strictEqual(JSON.stringify(f.project.config), shared);
    assert.strictEqual(JSON.stringify(f.project.properties), properties);
    assert.strictEqual(f.projectProperties.saves.length, 0);
    assert.strictEqual(f.project.configWrites.length, 1);
    const other = create({current: {}, save() {}}, f.projectProperties);
    assert.strictEqual(other.load(other.context(f.project, f.ctx.filePath)).scope, "project");
});
test("choosing a project image clears the local override and saves future offsets to the project", () => {
    const f = fixture(); f.storage.save(f.ctx, "E:\\Personal\\external.png", 12, 13);
    f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\shared.png", 2, 3);
    assert.strictEqual(f.storage.load(f.ctx).scope, "project");
    assert(!Object.prototype.hasOwnProperty.call(f.preferences.current.gooWeePreview.localReferences, f.ctx.localKey));
    f.storage.save(f.ctx, f.storage.load(f.ctx).filePath, 50, -50);
    assert.deepStrictEqual([f.storage.load(f.ctx).x, f.storage.load(f.ctx).y], [50, -50]);
    assert.strictEqual(f.preferences.saves.length, 2);
});
test("scripts and projects have independent records, including same-named scripts", () => {
    const f = fixture(), second = f.storage.context(f.project, "scripts/second/menu.gml");
    f.storage.save(f.ctx, "E:\\first.png", 1, 1); f.storage.save(second, "E:\\second.png", 2, 2);
    assert.strictEqual(f.storage.load(f.ctx).x, 1); assert.strictEqual(f.storage.load(second).x, 2);
    const other = f.storage.context({dir: "D:\\OtherProject", properties: {}}, "scripts/menu/menu.gml");
    assert.strictEqual(f.storage.load(other), null);
    const linked = f.storage.context({dir: "D:\\OtherProject", properties: {}}, f.ctx.filePath);
    assert.notStrictEqual(linked.localKey, f.ctx.localKey);
});
test("unsaved scripts have no persistence context and outside-project scripts use local settings", () => {
    const f = fixture();
    assert.strictEqual(f.storage.context(f.project, null), null);
    assert.strictEqual(f.storage.context(null, "unsaved.gml"), null);
    assert.strictEqual(f.storage.context(f.project, "C:relative.gml"), null);
    assert.throws(() => f.storage.save(null, "C:\\image.png", 0, 0), /Save this script/);
    const outside = f.storage.context(f.project, "C:\\SharedScripts\\menu.gml");
    assert.strictEqual(outside.scriptKey, null);
    assert.strictEqual(f.storage.save(outside, "C:\\Work\\Example\\refs\\image.png", 0, 0).scope, "local");
});
test("malformed settings, unexpanded paths and escaping project tokens are ignored", () => {
    const f = fixture();
    const invalid = [null, [], {}, {path: "${projectDir}/refs/a.png", x: "0", y: 0},
        {path: "${projectDir}/../secret.png", x: 0, y: 0}, {path: "${projectDir}/C:/outside.png", x: 0, y: 0},
        {path: "${projectDir}//outside.png", x: 0, y: 0}, {path: "${projectDir}/", x: 0, y: 0},
        {path: "C:/absolute-shared.png", x: 0, y: 0}, {path: "${projectDir}/refs/a.png", x: Infinity, y: 0}];
    for (const record of invalid) {
        f.project.config = {references: {[f.ctx.scriptKey]: record}};
        assert.strictEqual(f.storage.load(f.ctx), null, JSON.stringify(record));
    }
    f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\ok.png", 0, 0);
    f.preferences.current.gooWeePreview.localReferences = {[f.ctx.localKey]: {path: "relative.png", x: 0, y: 0}};
    assert.strictEqual(f.storage.load(f.ctx).scope, "project", "Malformed local overrides must not hide valid shared records");
    assert.throws(() => f.storage.save(f.ctx, "image.png", 0, 0), /absolute/);
    assert.throws(() => f.storage.save(f.ctx, "C:\\image.png", NaN, 0), /finite/);
});
test("local settings write errors restore in-memory values", () => {
    const f = fixture(); f.storage.save(f.ctx, "E:\\old.png", 1, 2);
    const before = JSON.stringify(f.preferences.current);
    f.preferences.save = () => { throw new Error("disk full"); };
    assert.throws(() => f.storage.save(f.ctx, "E:\\new.png", 3, 4), /disk full/);
    assert.strictEqual(JSON.stringify(f.preferences.current), before);
    assert.strictEqual(f.storage.load(f.ctx).filePath, "E:\\old.png");
});
test("project settings write errors leave project and local override unchanged", () => {
    const f = fixture(); f.storage.save(f.ctx, "E:\\old.png", 1, 2);
    const before = JSON.stringify([f.project.properties, f.preferences.current, f.project.config]);
    f.project.writeConfigJsonFileSync = () => { throw new Error("read-only project"); };
    assert.throws(() => f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\new.png", 3, 4), /read-only/);
    assert.strictEqual(JSON.stringify([f.project.properties, f.preferences.current, f.project.config]), before);
});
test("failure to clear a local override rolls back the shared project record", () => {
    const f = fixture(); f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\old.png", 1, 2);
    f.storage.save(f.ctx, "E:\\personal.png", 3, 4);
    const before = JSON.stringify([f.project.properties, f.preferences.current, f.project.config]);
    f.preferences.save = () => { throw new Error("prefs unavailable"); };
    assert.throws(() => f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\new.png", 5, 6), /prefs unavailable/);
    assert.strictEqual(JSON.stringify([f.project.properties, f.preferences.current, f.project.config]), before);
    assert.strictEqual(f.project.configWrites.at(-1).references[f.ctx.scriptKey].entries[""].path, "${projectDir}/refs/old.png");
});
test("UNC paths are portable within their project share but other shares stay local", () => {
    const f = fixture(), project = projectFixture("\\\\server\\share\\project");
    const ctx = f.storage.context(project, "scripts/menu.gml");
    assert.strictEqual(f.storage.save(ctx, "\\\\SERVER\\SHARE\\project\\ref.png", 0, 0).path, "${projectDir}/ref.png");
    assert.strictEqual(f.storage.save(ctx, "\\\\server\\other\\ref.png", 0, 0).scope, "local");
});
test("POSIX paths preserve case-sensitive identities", () => {
    const f = fixture(), project = projectFixture("/work/example");
    const lower = f.storage.context(project, "scripts/menu.gml"), upper = f.storage.context(project, "scripts/Menu.gml");
    assert.notStrictEqual(lower.localKey, upper.localKey);
    assert.strictEqual(f.storage.save(lower, "/work/example/refs/image.png", 3, 4).scope, "project");
    assert.strictEqual(f.storage.load(upper), null);
    assert.strictEqual(f.storage.save(upper, "/work/Example/refs/image.png", 0, 0).scope, "local");
});
test("legacy records remain readable and migrate together without modifying properties.json", () => {
    const f = fixture();
    f.project.properties.gooWeePreview.references = {
        [f.ctx.scriptKey]: {path: "${projectDir}/refs/old.png", x: 1, y: 2},
        "scripts/second/second.gml": {path: "${projectDir}/refs/second.png", x: 3, y: 4}
    };
    const properties = JSON.stringify(f.project.properties);
    assert.strictEqual(f.storage.load(f.ctx).path, "${projectDir}/refs/old.png");
    assert.strictEqual(f.project.config, null, "Reading legacy settings must not write a migration");
    f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\new.png", 7, 8);
    assert.deepStrictEqual(Object.keys(f.project.config.references).sort(), [f.ctx.scriptKey, "scripts/second/second.gml"].sort());
    assert.strictEqual(f.project.config.references["scripts/second/second.gml"].x, 3);
    assert.strictEqual(f.storage.load(f.ctx).path, "${projectDir}/refs/new.png");
    assert.strictEqual(JSON.stringify(f.project.properties), properties);
    assert.strictEqual(f.projectProperties.saves.length, 0);
});
test("standalone config records override legacy records and unrelated config fields survive", () => {
    const f = fixture();
    f.project.properties.gooWeePreview.references = {
        [f.ctx.scriptKey]: {path: "${projectDir}/refs/legacy.png", x: 1, y: 2},
        "scripts/second/second.gml": {path: "${projectDir}/refs/legacy-second.png", x: 3, y: 4}
    };
    f.project.config = {version: 2, note: {keep: true}, references: {
        "SCRIPTS/SECOND/SECOND.GML": {path: "${projectDir}/refs/modern-second.png", x: 9, y: 10}
    }};
    const second = f.storage.context(f.project, "scripts/second/second.gml");
    assert.strictEqual(f.storage.load(second).path, "${projectDir}/refs/modern-second.png");
    assert.strictEqual(f.storage.load(f.ctx).path, "${projectDir}/refs/legacy.png");
    f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\new.png", 5, 6);
    assert.strictEqual(Object.keys(f.project.config.references).length, 2);
    assert.deepStrictEqual([f.project.config.version, f.project.config.note], [2, {keep: true}]);
    assert.strictEqual(f.storage.load(second).x, 9);
});
test("malformed config files are rejected without overwriting them or local overrides", () => {
    const f = fixture();
    for (const invalid of [false, [], "broken", {references: []}, {references: null}]) {
        f.project.config = invalid;
        assert.throws(() => f.storage.load(f.ctx), /Invalid.*goowee_preview/);
        assert.throws(() => f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\new.png", 0, 0), /Invalid.*goowee_preview/);
        assert.strictEqual(f.project.config, invalid);
    }
    f.project.config = null;
    f.project.existsSync = () => true; // GMEdit suppresses JSON parse errors and returns null.
    assert.throws(() => f.storage.load(f.ctx), /Could not read.*goowee_preview/);
    assert.throws(() => f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\new.png", 0, 0), /Could not read.*goowee_preview/);
    f.storage.save(f.ctx, "E:\\local.png", 1, 2);
    assert.strictEqual(f.storage.load(f.ctx).scope, "local", "A local override can be used even while shared config is corrupt");
    assert.strictEqual(f.project.configWrites.length, 0);
    assert.strictEqual(f.projectProperties.saves.length, 0);
});
test("read errors propagate and an unavailable config API cannot mutate legacy properties", () => {
    const f = fixture();
    f.project.readConfigJsonFileSync = () => { throw new Error("read denied"); };
    assert.throws(() => f.storage.load(f.ctx), /read denied/);
    assert.throws(() => f.storage.save(f.ctx, "C:\\Work\\Example\\refs\\new.png", 0, 0), /read denied/);
    const project = {dir: f.project.dir, properties: {gooWeePreview: {references: {
        [f.ctx.scriptKey]: {path: "${projectDir}/legacy.png", x: 2, y: 3}
    }}}};
    const ctx = f.storage.context(project, f.ctx.filePath), before = JSON.stringify(project.properties);
    assert.strictEqual(f.storage.load(ctx).x, 2);
    assert.throws(() => f.storage.save(ctx, "C:\\Work\\Example\\refs\\new.png", 0, 0), /unavailable/);
    assert.strictEqual(JSON.stringify(project.properties), before);
});
test("functions within the same script persist separate paths and offsets", () => {
    const f = fixture(), first = f.storage.context(f.project, f.ctx.filePath, "first_menu", "first_menu");
    const second = f.storage.context(f.project, f.ctx.filePath, "second_menu", "first_menu");
    assert.strictEqual(first.localKey, second.localKey);
    assert.notStrictEqual(first.targetKey, second.targetKey);
    f.storage.save(first, "C:\\Work\\Example\\refs\\first.png", 11, -12);
    f.storage.save(second, "C:\\Work\\Example\\refs\\second.png", -21, 22);
    assert.deepStrictEqual(f.project.config.references[f.ctx.scriptKey], {entries: {
        first_menu: {path: "${projectDir}/refs/first.png", x: 11, y: -12},
        second_menu: {path: "${projectDir}/refs/second.png", x: -21, y: 22}
    }});
    assert.strictEqual(f.storage.load(first).x, 11);
    assert.strictEqual(f.storage.load(second).x, -21);
    const reordered = f.storage.context(f.project, f.ctx.filePath, "first_menu", "second_menu");
    assert.strictEqual(reordered.targetKey, first.targetKey);
    assert.strictEqual(f.storage.load(reordered).x, 11, "Stored function names must not depend on source order or line numbers");
    assert.strictEqual(f.storage.load(f.ctx), null, "Script body must not inherit a function reference");
});
test("function names are case-sensitive even when Windows script paths are not", () => {
    const f = fixture(), lower = f.storage.context(f.project, f.ctx.filePath, "menu", "menu");
    const upper = f.storage.context(f.project, f.ctx.filePath.toUpperCase(), "Menu", "menu");
    assert.strictEqual(lower.localKey, upper.localKey);
    assert.notStrictEqual(lower.targetKey, upper.targetKey);
    f.storage.save(lower, "E:\\lower.png", 1, 2); f.storage.save(upper, "E:\\upper.png", 3, 4);
    assert.strictEqual(f.storage.load(lower).filePath, "E:\\lower.png");
    assert.strictEqual(f.storage.load(upper).filePath, "E:\\upper.png");
    assert.deepStrictEqual(Object.keys(f.preferences.current.gooWeePreview.localReferences[lower.localKey].entries).sort(), ["Menu", "menu"]);
});
test("local overrides and shared selections affect only the selected function", () => {
    const f = fixture(), first = f.storage.context(f.project, f.ctx.filePath, "one", "one");
    const second = f.storage.context(f.project, f.ctx.filePath, "two", "one");
    f.storage.save(first, "C:\\Work\\Example\\refs\\one.png", 1, 2);
    f.storage.save(second, "C:\\Work\\Example\\refs\\two.png", 3, 4);
    f.storage.save(first, "E:\\personal-one.png", 5, 6);
    assert.strictEqual(f.storage.load(second).scope, "project");
    f.storage.save(second, "E:\\personal-two.png", 7, 8);
    f.storage.save(first, "C:\\Work\\Example\\refs\\new-one.png", 9, 10);
    assert.strictEqual(f.storage.load(first).scope, "project");
    assert.strictEqual(f.storage.load(second).scope, "local");
    assert.strictEqual(f.storage.load(second).x, 7);
    assert.deepStrictEqual(Object.keys(f.preferences.current.gooWeePreview.localReferences[first.localKey].entries), ["two"]);
    assert.strictEqual(f.project.config.references[first.scriptKey].entries.two.path, "${projectDir}/refs/two.png");
});
test("flat shared legacy data applies only to the default function and migrates on first write", () => {
    const f = fixture(), first = f.storage.context(f.project, f.ctx.filePath, "first", "first");
    const second = f.storage.context(f.project, f.ctx.filePath, "second", "first");
    f.project.config = {references: {
        [f.ctx.scriptKey]: {path: "${projectDir}/refs/legacy.png", x: 6, y: 7},
        "scripts/unopened/unopened.gml": {path: "${projectDir}/refs/unopened.png", x: 8, y: 9}
    }};
    assert.strictEqual(f.storage.load(first).x, 6);
    assert.strictEqual(f.storage.load(second), null);
    assert.strictEqual(f.storage.load(f.storage.context(f.project, f.ctx.filePath, "", "first")), null);
    f.storage.save(second, "C:\\Work\\Example\\refs\\second.png", 10, 11);
    assert.deepStrictEqual(Object.keys(f.project.config.references[first.scriptKey].entries).sort(), ["first", "second"]);
    assert.strictEqual(f.storage.load(first).x, 6);
    assert.strictEqual(f.storage.load(second).x, 10);
    assert.strictEqual(f.project.config.references["scripts/unopened/unopened.gml"].path, "${projectDir}/refs/unopened.png",
        "An unopened script's unknown default function must not be guessed from the current script");
});
test("flat local data belongs only to the default function and survives another function's shared selection", () => {
    const f = fixture(), first = f.storage.context(f.project, f.ctx.filePath, "first", "first");
    const second = f.storage.context(f.project, f.ctx.filePath, "second", "first");
    f.preferences.current.gooWeePreview.localReferences = {[first.localKey]: {path: "E:\\legacy.png", x: 6, y: 7}};
    assert.strictEqual(f.storage.load(first).x, 6);
    assert.strictEqual(f.storage.load(second), null);
    f.storage.save(second, "C:\\Work\\Example\\refs\\second.png", 10, 11);
    assert.deepStrictEqual(f.preferences.current.gooWeePreview.localReferences[first.localKey].entries.first, {path: "E:\\legacy.png", x: 6, y: 7});
    assert.strictEqual(f.storage.load(first).scope, "local");
    assert.strictEqual(f.storage.load(second).scope, "project");
    f.storage.save(first, "C:\\Work\\Example\\refs\\first.png", 1, 2);
    assert(!Object.prototype.hasOwnProperty.call(f.preferences.current.gooWeePreview.localReferences, first.localKey));
    assert.strictEqual(f.storage.load(first).scope, "project");
});
test("saving another external reference migrates flat local data without losing the first function", () => {
    const f = fixture(), first = f.storage.context(f.project, f.ctx.filePath, "first", "first");
    const second = f.storage.context(f.project, f.ctx.filePath, "second", "first");
    f.preferences.current.gooWeePreview.localReferences = {[first.localKey]: {path: "E:\\legacy.png", x: 6, y: 7}};
    f.storage.save(second, "E:\\second.png", 10, 11);
    assert.deepStrictEqual(Object.keys(f.preferences.current.gooWeePreview.localReferences[first.localKey].entries).sort(), ["first", "second"]);
    assert.strictEqual(f.storage.load(first).x, 6);
    assert.strictEqual(f.storage.load(second).x, 10);
});
test("dedicated entries merge legacy properties per function and preserve new-file precedence", () => {
    const f = fixture(), first = f.storage.context(f.project, f.ctx.filePath, "first", "first");
    const second = f.storage.context(f.project, f.ctx.filePath, "second", "first");
    f.project.properties.gooWeePreview.references = {[first.scriptKey]: {entries: {first: {path: "${projectDir}/refs/legacy-first.png", x: 1, y: 2}}}};
    f.project.config = {references: {[first.scriptKey]: {entries: {second: {path: "${projectDir}/refs/new-second.png", x: 3, y: 4}}}}};
    assert.strictEqual(f.storage.load(first).x, 1);
    assert.strictEqual(f.storage.load(second).x, 3);
    f.storage.save(first, "C:\\Work\\Example\\refs\\new-first.png", 5, 6);
    assert.strictEqual(f.storage.load(first).x, 5);
    assert.strictEqual(f.storage.load(second).x, 3);
    assert.strictEqual(f.project.properties.gooWeePreview.references[first.scriptKey].entries.first.x, 1, "Migration must never edit legacy properties");
});
test("migrated flat properties cannot reappear on a new default function after reordering", () => {
    const f = fixture(), first = f.storage.context(f.project, f.ctx.filePath, "first", "first");
    f.project.properties.gooWeePreview.references = {[first.scriptKey]: {path: "${projectDir}/refs/legacy.png", x: 1, y: 2}};
    assert.strictEqual(f.storage.load(first).x, 1);
    f.storage.save(first, "C:\\Work\\Example\\refs\\first.png", 3, 4);
    const reorderedFirst = f.storage.context(f.project, f.ctx.filePath, "first", "second");
    const newDefault = f.storage.context(f.project, f.ctx.filePath, "second", "second");
    assert.strictEqual(f.storage.load(newDefault), null, "Old flat properties must not be assigned again after migration");
    assert.strictEqual(f.storage.load(reorderedFirst).path, "${projectDir}/refs/first.png");
    assert.strictEqual(f.storage.load(reorderedFirst).x, 3);
    f.storage.save(newDefault, "C:\\Work\\Example\\refs\\second.png", 5, 6);
    assert.strictEqual(f.storage.load(reorderedFirst).x, 3);
    assert.strictEqual(f.storage.load(newDefault).x, 5);
    assert.strictEqual(f.project.properties.gooWeePreview.references[first.scriptKey].path, "${projectDir}/refs/legacy.png");
});
test("script-body entries are distinct and malformed nested records do not leak across functions", () => {
    const f = fixture(), named = f.storage.context(f.project, f.ctx.filePath, "named", "named");
    f.storage.save(f.ctx, "E:\\body.png", 1, 2);
    f.storage.save(named, "E:\\named.png", 3, 4);
    assert.strictEqual(f.storage.load(f.ctx).filePath, "E:\\body.png");
    assert.strictEqual(f.storage.load(named).filePath, "E:\\named.png");
    f.preferences.current.gooWeePreview.localReferences[named.localKey] = {entries: {named: {path: "E:\\bad.png", x: "4", y: 5}, other: {path: "E:\\other.png", x: 6, y: 7}}};
    assert.strictEqual(f.storage.load(named), null);
    assert.strictEqual(f.storage.load(f.ctx), null);
});
test("a failed shared write restores all local function overrides without altering siblings", () => {
    const f = fixture(), first = f.storage.context(f.project, f.ctx.filePath, "first", "first");
    const second = f.storage.context(f.project, f.ctx.filePath, "second", "first");
    f.storage.save(first, "E:\\first.png", 1, 2);
    f.storage.save(second, "E:\\second.png", 3, 4);
    const before = JSON.stringify(f.preferences.current);
    f.project.writeConfigJsonFileSync = () => { throw new Error("project write failed"); };
    assert.throws(() => f.storage.save(first, "C:\\Work\\Example\\refs\\first.png", 5, 6), /project write failed/);
    assert.strictEqual(JSON.stringify(f.preferences.current), before);
    assert.strictEqual(f.storage.load(first).filePath, "E:\\first.png");
    assert.strictEqual(f.storage.load(second).filePath, "E:\\second.png");
    assert.strictEqual(f.project.config, null);
});
console.log("GooWee reference storage: " + count + " checks passed.");
