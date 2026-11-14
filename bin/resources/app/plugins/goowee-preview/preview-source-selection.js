(function(root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.GooWeePreviewSourceSelection = api;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";
    function codeOnly(source) {
        return source.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|@"[^"]*"|@'[^']*'|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
            function(text) { return text.replace(/[^\r\n]/g, " "); });
    }
    function find(nodes, source, range, path, selectedId) {
        if (!range || range.start.row !== range.end.row) return null;
        var lines = codeOnly(source).split(/\r?\n/), row = range.start.row;
        var line = lines[row] || "", start = range.start.column, end = range.end.column;
        var name = line.slice(start, end);
        if (!/^[A-Za-z_]\w*$/.test(name) || /[\w]/.test(line[start - 1] || "") || /[\w]/.test(line[end] || "")) return null;
        // Match the containing named function, including its nested callbacks.
        // Identically named locals in another function must not select a node.
        var code = lines.join("\n"), declarations = [], pattern = /\bfunction\s+[A-Za-z_]\w*\s*\(/g, match;
        while ((match = pattern.exec(code))) {
            var brace = code.indexOf("{", pattern.lastIndex);
            if (brace < 0) continue;
            var depth = 1, stop = brace + 1;
            while (stop < code.length && depth) { var ch = code[stop++]; if (ch === "{") depth++; else if (ch === "}") depth--; }
            declarations.push({start: code.slice(0, match.index).split("\n").length, end: code.slice(0, stop).split("\n").length});
        }
        function scope(lineNumber) {
            return declarations.filter(function(d) { return d.start <= lineNumber && d.end >= lineNumber; }).pop();
        }
        var owner = scope(row + 1);
        var candidates = nodes.filter(function(node) {
            return node.name === name && path(node.sourcePath) === path(null) && scope(node.line) === owner;
        });
        candidates.sort(function(a, b) { return Math.abs(a.line - row - 1) - Math.abs(b.line - row - 1); });
        if (!candidates.length) return null;
        return candidates.find(function(n) { return n.line === candidates[0].line && n.id === selectedId; }) || candidates[0];
    }
    function centerOffset(node, view, width, height) {
        return {x: width / 2 - ((node.x + node.width / 2) * view.scale + view.x),
            y: height / 2 - ((node.y + node.height / 2) * view.scale + view.y)};
    }
    return {find: find, centerOffset: centerOffset};
});
