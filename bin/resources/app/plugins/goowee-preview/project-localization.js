(function(root, factory) {
    "use strict";
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.GooWeePreviewLocalization = api;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";
    var own = function(object, key) { return object != null && Object.prototype.hasOwnProperty.call(object, key); };
    var fs = null, path = null;
    try { if (typeof require === "function") { fs = require("fs"); path = require("path"); } } catch (_) { }

    // GameMaker definitions allow trailing commas. Leave commas, comment markers
    // and escaped quotes inside strings untouched; never evaluate configuration.
    function definitionJSON(source) {
        source = String(source).replace(/^\uFEFF/, "");
        var clean = "", quoted = false, escaped = false;
        for (var i = 0; i < source.length; i++) {
            var c = source[i];
            if (quoted) {
                clean += c;
                if (escaped) escaped = false;
                else if (c === "\\") escaped = true;
                else if (c === '"') quoted = false;
            } else if (c === '"') { quoted = true; clean += c; }
            else if (c === "/" && source[i + 1] === "/") {
                while (i < source.length && source[i] !== "\n") i++;
                clean += "\n";
            } else if (c === "/" && source[i + 1] === "*") {
                i += 2;
                while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { clean += source[i] === "\n" ? "\n" : " "; i++; }
                if (i >= source.length) throw new Error("Unterminated JSON comment");
                i++; clean += " ";
            } else clean += c;
        }
        var out = ""; quoted = false; escaped = false;
        for (var j = 0; j < clean.length; j++) {
            var value = clean[j];
            if (quoted) {
                out += value;
                if (escaped) escaped = false;
                else if (value === "\\") escaped = true;
                else if (value === '"') quoted = false;
            } else if (value === '"') { quoted = true; out += value; }
            else if (value === "," && /^[\s]*[}\]]/.test(clean.slice(j + 1))) out += " ";
            else out += value;
        }
        return JSON.parse(out);
    }

    // Stream rows instead of retaining the full multi-language CSV table. Only
    // the selected language and English columns survive in the cached lookup.
    function eachCSVRow(source, delimiter, quote, visit) {
        if (typeof delimiter !== "string" || delimiter.length !== 1 || typeof quote !== "string" || quote.length !== 1 || delimiter === quote) {
            throw new Error("CSV delimiter and quote must be distinct single characters");
        }
        source = source.replace(/^\uFEFF/, "");
        var row = [], cell = "", quoted = false, line = 1;
        for (var i = 0; i < source.length; i++) {
            var c = source[i];
            if (quoted) {
                if (c === quote) {
                    if (source[i + 1] === quote) { cell += quote; i++; }
                    else quoted = false;
                } else { cell += c; if (c === "\n") line++; }
            } else if (c === quote && cell.length === 0) quoted = true;
            else if (c === delimiter) { row.push(cell); cell = ""; }
            else if (c === "\r" || c === "\n") {
                row.push(cell); visit(row); row = []; cell = "";
                if (c === "\r" && source[i + 1] === "\n") i++;
                line++;
            } else cell += c;
        }
        if (quoted) throw new Error("Unterminated quoted CSV field near line " + line);
        if (cell.length || row.length) { row.push(cell); visit(row); }
    }

    function normalizeText(value) {
        return value.replace(/\r\n?/g, "\n").replace(/\n$/, "")
            .replace(/<icon_([^>]+)>/g, "<icon=$1></icon>").replace(/<nbsp>/g, "\u00a0");
    }

    /** Read-only Lexicanum adapter. Directory is project-relative or absolute.
     * info() reads only locale_definition.json; lookup lazily caches two language
     * columns. Explicit directory:"" disables localization; omitted directory
     * quietly probes datafiles/localization. Refresh calls clear(). */
    function create(project, settings) {
        settings = settings || {};
        var disposed = false, metadata = null, definitions = Object.create(null), tables = Object.create(null), fileTables = Object.create(null);
        var diagnostics = [], diagnosticKeys = Object.create(null), loaded = false, bytesRead = 0;
        function warn(message, sourcePath) {
            var key = sourcePath + ":" + message;
            if (own(diagnosticKeys, key) || diagnostics.length >= 50) return;
            diagnosticKeys[key] = true;
            diagnostics.push({message: message, sourcePath: sourcePath || "", severity: "warning"});
        }
        function readText(fullPath, limit) {
            var text, relative = project && typeof project.dir === "string" ? path.relative(project.dir, fullPath) : null;
            if (project && typeof project.readTextFileSync === "function" && relative != null && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) {
                text = project.readTextFileSync(relative.replace(/\\/g, "/"));
            } else {
                if (!fs) throw new Error("Local filesystem access is unavailable");
                if (fs.statSync(fullPath).size > limit) throw new Error("Localization file exceeds the preview size limit");
                text = fs.readFileSync(fullPath, "utf8");
            }
            if (typeof text !== "string") throw new Error("Localization file is not text");
            if (text.length > limit) throw new Error("Localization file exceeds the preview size limit");
            return text;
        }
        function info() {
            if (metadata) return metadata;
            metadata = {directory: "", definitionPath: "", languages: [], language: "", error: null, diagnostics: diagnostics, enabled: false};
            if (disposed || !project) return metadata;
            var explicit = own(settings, "directory") && settings.directory != null;
            var directory = explicit ? String(settings.directory).trim() : "datafiles/localization";
            if (!directory) return metadata;
            if (!path || (!path.isAbsolute(directory) && !project.dir)) {
                if (explicit) { metadata.error = "A local project is required to load localization."; warn(metadata.error, ""); }
                return metadata;
            }
            metadata.directory = path.resolve(project.dir || "", directory);
            metadata.definitionPath = path.join(metadata.directory, "locale_definition.json");
            var definition, definitionSource;
            try { definitionSource = readText(metadata.definitionPath, 1024 * 1024); }
            catch (error) {
                if (explicit) {
                    metadata.error = "Could not read locale_definition.json: " + error.message;
                    warn(metadata.error, metadata.definitionPath);
                }
                return metadata;
            }
            try { definition = definitionJSON(definitionSource); }
            catch (error) { metadata.error = "Invalid locale_definition.json: " + error.message; warn(metadata.error, metadata.definitionPath); return metadata; }
            if (!definition || typeof definition.locales !== "object" || !definition.locales || Array.isArray(definition.locales)) {
                metadata.error = "locale_definition.json must contain a locales object."; warn(metadata.error, metadata.definitionPath); return metadata;
            }
            var names = Object.keys(definition.locales), first = typeof definition.parseFirst === "string" ? definition.parseFirst : "English";
            names.sort(function(a, b) { return a === first ? -1 : b === first ? 1 : 0; });
            var lastFiles = [];
            names.forEach(function(name, index) {
                var entry = definition.locales[name];
                if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
                if (Array.isArray(entry.files)) lastFiles = entry.files;
                definitions[name] = {files: lastFiles};
                metadata.languages.push({id: name, name: name, caption: typeof entry.caption === "string" ? entry.caption : name,
                    locale: typeof entry.locale === "string" ? entry.locale : "", order: typeof entry.sort_order === "number" ? entry.sort_order : 999, index: index});
            });
            metadata.languages.sort(function(a, b) { return a.order - b.order || a.index - b.index; });
            var preferred = typeof settings.language === "string" ? settings.language : "";
            metadata.language = own(definitions, preferred) ? preferred : own(definitions, first) ? first : metadata.languages.length ? metadata.languages[0].id : "";
            // Font selection is part of the locale definition in GooWee projects.
            metadata.languageInfo = own(definition.locales, metadata.language) ? definition.locales[metadata.language] : null;
            metadata.enabled = !!metadata.language;
            if (!metadata.enabled) { metadata.error = "No languages are defined in locale_definition.json."; warn(metadata.error, metadata.definitionPath); }
            else if (preferred && preferred !== metadata.language) warn("Language " + preferred + " is not defined; using " + metadata.language + ".", metadata.definitionPath);
            return metadata;
        }
        function parseFile(spec) {
            if (!spec || typeof spec.filePath !== "string" || !spec.filePath) { warn("Localization entry has no filePath.", metadata.definitionPath); return null; }
            var extension = typeof spec.fileType === "string" ? spec.fileType.toLowerCase() : path.extname(spec.filePath).slice(1).toLowerCase();
            if (extension !== "csv") { warn("Unsupported localization file type: " + extension + ".", metadata.definitionPath); return null; }
            var args = Array.isArray(spec.arguments) ? spec.arguments : [], delimiter = args[0] == null ? "," : args[0], quote = args[1] == null ? '"' : args[1];
            var candidates = [path.resolve(metadata.directory, spec.filePath)];
            if (!path.isAbsolute(spec.filePath)) candidates.push(path.resolve(metadata.directory, "..", spec.filePath));
            var cacheKey = candidates[0] + ":" + JSON.stringify([delimiter, quote, !!spec.isHints]);
            if (own(fileTables, cacheKey)) return fileTables[cacheKey];
            var source, filePath = candidates[0], lastError;
            for (var candidate of candidates) {
                try { source = readText(candidate, 32 * 1024 * 1024); filePath = candidate; break; }
                catch (error) { lastError = error; if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) break; }
            }
            if (source == null) { warn("Could not read localization CSV " + spec.filePath + ": " + (lastError && lastError.message || "file not found"), filePath); return fileTables[cacheKey] = null; }
            bytesRead += source.length;
            if (bytesRead > 64 * 1024 * 1024) { warn("Localization exceeds the preview's 64 MiB read limit.", filePath); return fileTables[cacheKey] = null; }
            var result = Object.create(null), languages = metadata.language === "English" ? ["English"] : [metadata.language, "English"];
            languages.forEach(function(language) { result[language] = {text: Object.create(null), headers: Object.create(null)}; });
            var columns = null;
            try {
                eachCSVRow(source, delimiter, quote, function(row) {
                    if (!columns) {
                        columns = languages.map(function(language) { return row.indexOf(language); });
                        return;
                    }
                    var key = row[0]; if (!key) return;
                    languages.forEach(function(language, index) {
                        var column = columns[index], table = result[language];
                        if (column < 1 || column >= row.length || !row[column] || own(table.text, key)) return;
                        var value = row[column].replace(/\r\n?/g, "\n");
                        if (spec.isHints) {
                            var newline = value.indexOf("\n");
                            table.headers[key] = newline < 0 ? value : value.slice(0, newline);
                            value = newline < 0 ? "" : value.slice(newline + 1) + "\n";
                        }
                        table.text[key] = normalizeText(value);
                    });
                });
                if (!columns) warn("Localization CSV is empty: " + spec.filePath + ".", filePath);
            } catch (error) { warn("Could not parse localization CSV " + spec.filePath + ": " + error.message, filePath); return fileTables[cacheKey] = null; }
            return fileTables[cacheKey] = result;
        }
        function loadTables() {
            info();
            if (loaded || !metadata.enabled || disposed) return;
            loaded = true;
            var languages = metadata.language === "English" ? ["English"] : [metadata.language, "English"];
            languages.forEach(function(language) {
                var table = tables[language] = {text: Object.create(null), headers: Object.create(null)};
                var definition = definitions[language]; if (!definition) return;
                if (definition.files.length > 64) warn("Only the first 64 localization files are previewed.", metadata.definitionPath);
                definition.files.slice(0, 64).forEach(function(spec) {
                    var parsed = parseFile(spec), source = parsed && parsed[language];
                    if (!source) return;
                    ["text", "headers"].forEach(function(kind) { Object.keys(source[kind]).forEach(function(key) { if (!own(table[kind], key)) table[kind][key] = source[kind][key]; }); });
                });
            });
        }
        function find(key, englishOnly, kind) {
            if (typeof key !== "string" || disposed) return undefined;
            loadTables();
            var selected = tables[englishOnly ? "English" : metadata.language], english = tables.English;
            if (selected && own(selected[kind], key)) return selected[kind][key];
            if (english && own(english[kind], key)) return english[kind][key];
            return undefined;
        }
        function clear() {
            metadata = null; definitions = Object.create(null); tables = Object.create(null); fileTables = Object.create(null);
            diagnostics = []; diagnosticKeys = Object.create(null); loaded = false; bytesRead = 0;
        }
        return {info: info, lookup: function(key, englishOnly) { return find(key, englishOnly, "text"); },
            lookupHeader: function(key, englishOnly) { return find(key, englishOnly, "headers"); },
            clear: clear, dispose: function() { clear(); disposed = true; project = null; }};
    }
    return {create: create};
});
