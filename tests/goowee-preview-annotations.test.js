"use strict";
const assert = require("assert");
const {extract} = require("../bin/resources/app/plugins/goowee-preview/preview-annotations.js");
let count = 0;
function test(name, run) { run(); count++; console.log("ok - " + name); }
function lineAt(source, offset) { return source.slice(0, offset).split("\n").length; }

test("ordinary comments, imports and strings remain byte-for-byte unchanged", () => {
    const source = `//!#import "games.keevee.gw"
        // Documentation about @goowee-preview setup is not an annotation.
        /* ordinary comment: @goowee-preview skip-next */
        var first = "/* @goowee-preview replace var x = 2; */";
        var second = '// @goowee-preview skip-next';
        var third = @"an ""escaped quote"" /* @goowee-preview code hi(); */";
        var fourth = "escaped \\";
        function menu() { return new Canvas(undefined); }`;
    const result = extract(source);
    assert.strictEqual(result.source, source);
    assert.deepStrictEqual(Object.keys(result.markers), []);
    assert.deepStrictEqual(result.setups, []);
    assert.deepStrictEqual(result.diagnostics, []);
});

test("setup code is separate and preserves original source offsets and lines", () => {
    const source = `// first\r\n/* @goowee-preview setup\r\nglobal.inventory = [1, 2, 3];\r\n*/\r\nfunction menu() { return 1; }`;
    const result = extract(source);
    assert.strictEqual(result.setups.length, 1);
    assert.strictEqual(result.setups[0].kind, "setup");
    assert.strictEqual(result.setups[0].line, 2);
    assert.strictEqual(result.setups[0].codeLine, 2);
    assert.strictEqual(result.setups[0].code, "\r\nglobal.inventory = [1, 2, 3];\r\n");
    assert.strictEqual(result.source.length, source.length);
    assert.strictEqual(result.source.indexOf("function menu"), source.indexOf("function menu"));
    assert.deepStrictEqual(result.source.match(/\r\n/g), source.match(/\r\n/g));
    assert.deepStrictEqual(Object.keys(result.markers), []);
});

test("escaped quotes and multiline verbatim text do not hide following real annotations", () => {
    const source = 'var caption = "escaped \\" /* @goowee-preview setup */";\n' +
        'var multiline = @"line one\n// @goowee-preview skip-next\n""quoted""";\n' +
        '// @goowee-preview skip-next\nordinary_call();';
    const result = extract(source), names = Object.keys(result.markers);
    assert.strictEqual(names.length, 1);
    assert.strictEqual(result.markers[names[0]].line, 5);
    assert.strictEqual(result.diagnostics.length, 0);
    assert.strictEqual(result.source.slice(0, source.indexOf('// @goowee-preview skip-next\nordinary_call')), source.slice(0, source.indexOf('// @goowee-preview skip-next\nordinary_call')));
});

test("inline code and replacement markers retain subsequent code on the same line", () => {
    const source = "/* @goowee-preview code a = 1; */var b = 2;\n/* @goowee-preview replace c = 3; */game_call();";
    const result = extract(source), names = Object.keys(result.markers);
    assert.strictEqual(names.length, 2);
    assert.strictEqual(result.markers[names[0]].kind, "code");
    assert.strictEqual(result.markers[names[1]].kind, "replace");
    assert.strictEqual(result.markers[names[1]].code, " c = 3; ");
    assert.strictEqual(result.source.indexOf("var b"), source.indexOf("var b"));
    assert.strictEqual(result.source.indexOf("game_call"), source.indexOf("game_call"));
    assert(result.source.trimStart().startsWith(names[0] + ";"));
    assert.strictEqual(lineAt(result.source, result.source.indexOf(names[1])), 2);
});

test("skip-next leaves statement parsing to the GML parser", () => {
    const statement = 'if (ready) { create_ui(); } else { fallback(); }';
    const source = "// @goowee-preview skip-next\n" + statement;
    const result = extract(source), names = Object.keys(result.markers);
    assert.strictEqual(result.markers[names[0]].kind, "skip-next");
    assert.strictEqual(result.source.slice(result.source.indexOf("\n") + 1), statement);
    assert.strictEqual(result.source.length, source.length);
});

test("marker identifiers never collide with names in project source", () => {
    const source = "var __gwp_0 = 5; var ___gwp_0 = 6; /* @goowee-preview code test(); */";
    const result = extract(source), name = Object.keys(result.markers)[0];
    assert(name && !source.includes(name));
    assert(result.source.includes("var __gwp_0 = 5; var ___gwp_0 = 6;"));
});

test("malformed annotations stay inert and report their actual line", () => {
    const samples = [
        ["/* @goowee-preview */", /Unknown/],
        ["/* @goowee-preview explode test(); */", /Unknown/],
        ["// @goowee-preview setup x = 1;", /block comment/],
        ["/* @goowee-preview replace */", /requires/],
        ["// @goowee-preview skip-next extra", /does not accept/],
        ["/* @goowee-preview setup x = 1;", /Unterminated/]
    ];
    for (const [sample, expected] of samples) {
        const source = "\n\n" + sample, result = extract(source);
        assert.strictEqual(result.source, source);
        assert.strictEqual(result.setups.length, 0);
        assert.strictEqual(Object.keys(result.markers).length, 0);
        assert.strictEqual(result.diagnostics.length, 1);
        assert.strictEqual(result.diagnostics[0].line, 3);
        assert.match(result.diagnostics[0].message, expected);
    }
});

test("a header after an opening newline reports code lines correctly", () => {
    const source = "/*\n @goowee-preview setup\nvar sample = 1;\n*/\nfunction main() {}";
    const result = extract(source), setup = result.setups[0];
    assert.strictEqual(setup.line, 2);
    assert.strictEqual(setup.codeLine, 2);
    assert.strictEqual(setup.code.split("\n")[1], "var sample = 1;");
    assert.strictEqual(result.source.length, source.length);
    assert.strictEqual(lineAt(result.source, result.source.indexOf("function")), 5);
    const inline = extract(source.replace("setup", "code")), marker = Object.keys(inline.markers)[0];
    assert(marker);
    assert.strictEqual(lineAt(inline.source, inline.source.indexOf(marker)), 2);
    assert.strictEqual(inline.diagnostics.length, 0);
});

test("nested directives are diagnosed but text inside annotation strings is allowed", () => {
    const text = extract('/* @goowee-preview setup var caption = "/* @goowee-preview code"; */');
    assert.strictEqual(text.setups.length, 1);
    assert.strictEqual(text.diagnostics.length, 0);
    const nested = extract('/* @goowee-preview setup\n// @goowee-preview skip-next\nrun();\n*/');
    assert.strictEqual(nested.setups.length, 0);
    assert.match(nested.diagnostics[0].message, /Nested/);
});

test("annotation code is returned as text and never executed by extraction", () => {
    delete global.__preview_annotation_test;
    const result = extract("/* @goowee-preview setup global.__preview_annotation_test = 123; */");
    assert.strictEqual(global.__preview_annotation_test, undefined);
    assert.strictEqual(result.setups[0].code, " global.__preview_annotation_test = 123; ");
});

test("annotation count and code size are bounded with visible diagnostics", () => {
    const one = "/* @goowee-preview code sample(); */\n";
    const result = extract(one.repeat(257));
    assert.strictEqual(Object.keys(result.markers).length, 256);
    assert.strictEqual(result.diagnostics.length, 1);
    assert.match(result.diagnostics[0].message, /limit/);
    const large = extract("/* @goowee-preview setup " + "x".repeat(262145) + " */");
    assert.strictEqual(large.setups.length, 0);
    assert.match(large.diagnostics[0].message, /limit/);
    assert.strictEqual(extract("// @goowee-preview invalid\n".repeat(1000)).diagnostics.length, 100);
});

test("compact tags preserve source and describe exact standalone or trailing positions", () => {
    const source = '/// @preview value 3\r\nvar count = load_count();\r\n' +
        'var caption/*:string*/ = load_caption(); // @preview value "Example"\r\n' +
        'var avatar = new Image(root, icon); /// @preview hide\r\n' +
        '// @preview init load_preview_data()\r\nfunction menu() {}\r\n' +
        '/// @preview set global.is_ready = true\r\nrun(); // @preview skip';
    const result = extract(source);
    assert.strictEqual(result.source, source, "Compact comments must not modify the parsed source");
    assert.deepStrictEqual(result.tags.map(tag => [tag.kind, tag.code, tag.line, tag.trailing]), [
        ["value", "3", 1, false], ["value", '"Example"', 3, true], ["hide", "", 4, true],
        ["init", "load_preview_data()", 5, false], ["set", "global.is_ready = true", 7, false], ["skip", "", 8, true]
    ]);
    for (const tag of result.tags) {
        assert.strictEqual(tag.line, tag.codeLine);
        assert.strictEqual(lineAt(source, tag.offset), tag.line);
        assert(source.slice(tag.offset, tag.endOffset).startsWith("//"));
        assert(!/[\r\n]/.test(source.slice(tag.offset, tag.endOffset)));
    }
    assert.deepStrictEqual(result.diagnostics, []);
});

test("compact trailing detection ignores comments but retains strings and typed code", () => {
    const source = '/* explanation */ /// @preview skip\n' +
        'var size/*:number*/ = 10; /* explanation */ // @preview value 20\n' +
        'var caption = @"first\nsecond"; // @preview value "Short"\n' +
        '// a preceding comment\n// @preview hide\nimage();';
    const result = extract(source);
    assert.deepStrictEqual(result.tags.map(tag => [tag.line, tag.trailing]), [[1, false], [2, true], [4, true], [6, false]]);
    assert.deepStrictEqual(result.diagnostics, []);
});

test("compact argument tags preserve their expression and consecutive attachment metadata", () => {
    const source = '/// @preview arg 1 = {caption: "Demo", nested: [1, 2]}\n' +
        '/// @preview arg 0 = undefined\n' +
        'var title = new Label(parent, expensive_caption()); // @preview hide';
    const result = extract(source);
    assert.strictEqual(result.source, source);
    assert.deepStrictEqual(result.tags.map(tag => [tag.kind, tag.code, tag.trailing]), [
        ["arg", '1 = {caption: "Demo", nested: [1, 2]}', false], ["arg", "0 = undefined", false], ["hide", "", true]
    ]);
    assert.strictEqual(result.diagnostics.length, 0);
    assert.match(extract("// @preview arg").diagnostics[0].message, /requires/);
});

test("compact tags in strings, prose and advanced setup payloads are not applied", () => {
    const source = 'var example = "// @preview value 42";\n' +
        'var escaped = @"/// @preview hide";\n' +
        '// Documentation: @preview skip\n' +
        '/* @goowee-preview setup var caption = "// @preview skip"; */';
    const result = extract(source);
    assert.deepStrictEqual(result.tags, []);
    assert.strictEqual(result.setups.length, 1);
    assert.deepStrictEqual(result.diagnostics, []);
    const nested = extract('/* @goowee-preview setup\n/// @preview skip\nrun();\n*/');
    assert.strictEqual(nested.setups.length, 0);
    assert.deepStrictEqual(nested.tags, []);
    assert.match(nested.diagnostics[0].message, /Nested/);
});

test("malformed compact tags are inert and report the annotation line", () => {
    const cases = [
        ["// @preview", /Unknown/], ["/// @preview unknown 2", /Unknown/],
        ["// @preview value", /requires/], ["// @preview init", /requires/], ["// @preview set", /requires/],
        ["// @preview hide target", /does not accept/], ["// @preview skip extra", /does not accept/],
        ["/* @preview value 2 */", /line comment/]
    ];
    for (const [comment, message] of cases) {
        const source = "\n\n" + comment + "\nvar untouched = 1;", result = extract(source);
        assert.strictEqual(result.source, source);
        assert.strictEqual(result.tags.length, 0);
        assert.strictEqual(result.diagnostics.length, 1);
        assert.strictEqual(result.diagnostics[0].line, 3);
        assert.match(result.diagnostics[0].message, message);
    }
});

test("compact and advanced hints share a single extraction budget", () => {
    const advanced = "/* @goowee-preview code sample(); */\n";
    const compact = "// @preview value 1\nvar item = 0;\n";
    const result = extract(advanced.repeat(128) + compact.repeat(129));
    assert.strictEqual(Object.keys(result.markers).length, 128);
    assert.strictEqual(result.tags.length, 128);
    assert.strictEqual(result.diagnostics.length, 1);
    assert.match(result.diagnostics[0].message, /limit/);
    const large = extract("// @preview value " + "x".repeat(262145));
    assert.strictEqual(large.tags.length, 0);
    assert.match(large.diagnostics[0].message, /limit/);
});

console.log("GooWee preview annotations: " + count + " tests passed.");
