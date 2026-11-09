/* Preview-only GML lives in comments, so GameMaker never executes it. This
 * scanner extracts those comments; the bounded GML interpreter handles their
 * statements. It does not evaluate JavaScript or guess GML statement endings. */
(function(root, factory) {
    "use strict";
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.GooWeePreviewAnnotations = api;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";
    var supported = {setup: true, code: true, replace: true, "skip-next": true};
    var compactKinds = {value: true, arg: true, skip: true, hide: true, init: true, set: true};
    var maxDirectives = 256, maxCode = 262144;
    function lines(text) { var matches = text.match(/\n/g); return matches ? matches.length : 0; }
    function blank(text) { return text.replace(/[^\r\n]/g, " "); }
    function quotedEnd(source, index) {
        var verbatim = source[index] === "@", quote = verbatim ? source[++index] : source[index]; index++;
        while (index < source.length) {
            var c = source[index++];
            if (!verbatim && c === "\\") { index++; continue; }
            if (c === quote) { if (verbatim && source[index] === quote) { index++; continue; } break; }
        }
        return Math.min(index, source.length);
    }
    function hasNestedDirective(source) {
        for (var index = 0; index < source.length; index++) {
            var c = source[index], pair = source.substr(index, 2);
            if (c === '"' || c === "'" || c === "@" && /["']/.test(source[index + 1] || "")) { index = quotedEnd(source, index) - 1; continue; }
            if (pair === "/*" || pair === "//") {
                var end = pair === "/*" ? source.indexOf("*/", index + 2) : source.indexOf("\n", index + 2);
                if (end < 0) end = source.length;
                if (/^(?:\/)?\s*@(?:goowee-preview|preview)\b/.test(source.slice(index + 2, end))) return true;
                index = pair === "/*" ? end + 1 : end;
            }
        }
        return false;
    }

    // codeLine is the line at which `code` begins, including any leading newline.
    // A parsed token's original line is token.line + codeLine - 1.
    function extract(input) {
        var source = String(input), chunks = [], cursor = 0, index = 0, line = 1, lastCodeLine = 0;
        var markers = Object.create(null), setups = [], tags = [], diagnostics = [], count = 0, totalCode = 0;
        var prefix = "__gwp_";
        while (source.indexOf(prefix) !== -1) prefix = "_" + prefix;
        function note(at, message) { if (diagnostics.length < 100) diagnostics.push({line: at, severity: "warning", message: message}); }
        function comment(start, end, startLine, block, closed) {
            var inner = source.slice(start + 2, closed && block ? end - 2 : end);
            var compactHeader = /^(?:\/)?[ \t]*@preview\b/.exec(inner);
            if (compactHeader) {
                if (block) { note(startLine, "Use a // or /// line comment for a compact @preview tag."); return; }
                var compactRest = inner.slice(compactHeader[0].length), compactMatch = /^[ \t]+([a-z][\w-]*)(?=\s|$)/i.exec(compactRest);
                if (!compactMatch || !Object.prototype.hasOwnProperty.call(compactKinds, compactMatch[1])) {
                    note(startLine, "Unknown @preview tag; expected value, arg, skip, hide, init or set."); return;
                }
                var compactKind = compactMatch[1], compactCode = compactRest.slice(compactMatch[0].length).trim();
                var withoutCode = compactKind === "skip" || compactKind === "hide";
                if (withoutCode && compactCode) { note(startLine, "@preview " + compactKind + " does not accept an expression."); return; }
                if (!withoutCode && !compactCode) { note(startLine, "@preview " + compactKind + " requires an expression."); return; }
                if (count >= maxDirectives || totalCode + compactCode.length > maxCode) {
                    note(startLine, "GooWee Preview annotation limit reached; this tag was ignored."); return;
                }
                // The parser owns statement boundaries. Keep these comments intact
                // and supply offsets so a trailing tag cannot drift to the next line.
                tags.push({kind: compactKind, code: compactCode, line: startLine, codeLine: startLine,
                    offset: start, endOffset: end, trailing: lastCodeLine === startLine});
                count++; totalCode += compactCode.length;
                return;
            }
            var header = /^(\s*)@goowee-preview\b/.exec(inner);
            if (!header) return;
            var directiveLine = startLine + lines(header[1]);
            if (!closed) { note(directiveLine, "Unterminated GooWee Preview annotation."); return; }
            var rest = inner.slice(header[0].length), kindMatch = /^[ \t]+([a-z][\w-]*)(?=\s|$)/i.exec(rest);
            if (!kindMatch || !Object.prototype.hasOwnProperty.call(supported, kindMatch[1])) {
                note(directiveLine, "Unknown GooWee Preview annotation; expected setup, code, replace or skip-next."); return;
            }
            var kind = kindMatch[1], code = rest.slice(kindMatch[0].length);
            if (!block && kind !== "skip-next") { note(directiveLine, "Use a block comment for GooWee Preview " + kind + " code."); return; }
            if (kind === "skip-next" && code.trim()) { note(directiveLine, "GooWee Preview skip-next does not accept a code body."); return; }
            if (kind !== "skip-next" && !code.trim()) { note(directiveLine, "GooWee Preview " + kind + " requires a GML code body."); return; }
            if (count >= maxDirectives || totalCode + code.length > maxCode) {
                note(directiveLine, "GooWee Preview annotation limit reached; this annotation was ignored."); return;
            }
            if (hasNestedDirective(code)) {
                note(directiveLine, "Nested GooWee Preview annotations are not supported."); return;
            }
            var annotation = {kind: kind, line: directiveLine, codeLine: directiveLine, code: code};
            var replacement = blank(source.slice(start, end));
            if (kind === "setup") setups.push(annotation);
            else {
                var name = prefix + count, marker = name + ";";
                // An exceptionally long user identifier can force a longer prefix
                // than fits on this line. Keep the original source intact then.
                var markerOffset = 2 + header[1].length;
                var firstLine = replacement.slice(markerOffset).search(/[\r\n]/);
                if (firstLine < 0) firstLine = replacement.length - markerOffset;
                if (marker.length > firstLine) { note(directiveLine, "Could not place GooWee Preview annotation without changing source locations."); return; }
                markers[name] = annotation;
                replacement = replacement.slice(0, markerOffset) + marker + replacement.slice(markerOffset + marker.length);
            }
            count++; totalCode += code.length;
            chunks.push(source.slice(cursor, start), replacement); cursor = end;
        }
        while (index < source.length) {
            var c = source[index];
            if (c === "\n") { line++; index++; continue; }
            var verbatim = c === "@" && (source[index + 1] === '"' || source[index + 1] === "'");
            if (c === '"' || c === "'" || verbatim) {
                var stringEnd = quotedEnd(source, index);
                line += lines(source.slice(index, stringEnd)); index = stringEnd;
                lastCodeLine = line;
                continue;
            }
            if (source.substr(index, 2) === "//") {
                var lineStart = index, lineNumber = line;
                while (index < source.length && source[index] !== "\n" && source[index] !== "\r") index++;
                comment(lineStart, index, lineNumber, false, true); continue;
            }
            if (source.substr(index, 2) === "/*") {
                var blockStart = index, blockLine = line, close = source.indexOf("*/", index + 2);
                index = close < 0 ? source.length : close + 2;
                line += lines(source.slice(blockStart, index));
                comment(blockStart, index, blockLine, true, close >= 0); continue;
            }
            if (!/\s/.test(c)) lastCodeLine = line;
            index++;
        }
        chunks.push(source.slice(cursor));
        return {source: chunks.join(""), markers: markers, setups: setups, tags: tags, diagnostics: diagnostics};
    }
    return {extract: extract};
});
