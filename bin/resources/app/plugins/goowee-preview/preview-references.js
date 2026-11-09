(function(root, factory) {
    "use strict";
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.GooWeePreviewReferences = api;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";
    var paths = null;
    try { if (typeof require === "function") paths = require("path"); } catch (_) { }
    var token = "${projectDir}/", configFile = "goowee_preview.json";
    function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
    function own(value, key) { return value && Object.prototype.hasOwnProperty.call(value, key); }
    function get(value, key) { return own(value, key) ? value[key] : null; }
    function map(value) { return Object.assign(Object.create(null), object(value) || {}); }
    function windows(value) { return /^[A-Za-z]:[\\/]|^\\\\|^\/\//.test(value); }
    function flavor(value) { return paths && (windows(value) ? paths.win32 : paths.posix); }
    function absolute(value, path) {
        return typeof value === "string" && value.length > 0 && value.indexOf("\0") < 0 && path && path.isAbsolute(value) &&
            // A rooted Windows path without a drive would depend on the process cwd.
            (path !== paths.win32 || /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.test(value));
    }
    function normalized(value, path) { return path.normalize(value).replace(/\\/g, "/").replace(/\/$/, ""); }
    function identity(value, path) { var result = normalized(value, path); return path === paths.win32 ? result.toLowerCase() : result; }
    function relativeInside(directory, file, path) {
        var relative = path.relative(directory, file);
        return relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep) ? relative.replace(/\\/g, "/") : null;
    }
    function matchingKey(values, key, insensitive) {
        if (!object(values) || !key) return null;
        if (own(values, key)) return key;
        if (!insensitive) return null;
        var expected = key.toLowerCase();
        return Object.keys(values).find(function(candidate) { return candidate.replace(/\\/g, "/").toLowerCase() === expected; }) || null;
    }
    function coordinates(value) {
        return object(value) && typeof value.path === "string" && Number.isFinite(value.x) && Number.isFinite(value.y);
    }
    function entries(record, defaultEntry) {
        if (object(record) && own(record, "entries")) return map(record.entries);
        var result = Object.create(null);
        if (coordinates(record)) result[defaultEntry] = record;
        return result;
    }
    function mergeEntries(legacy, current, defaultEntry) {
        // A dedicated entries map has already assigned the former flat record
        // to a stable function name. Re-importing old flat properties would move
        // that image to a different function after the source is reordered.
        var migrated = object(current) && object(current.entries) && coordinates(legacy);
        return {entries: Object.assign(migrated ? Object.create(null) : entries(legacy, defaultEntry), entries(current, defaultEntry))};
    }
    function create(Preferences, ProjectProperties) {
        function context(project, filePath, entryName, defaultEntryName) {
            if (!paths || typeof filePath !== "string" || !filePath || filePath.indexOf("\0") >= 0) return null;
            var directory = project && project.dir;
            var path = flavor(directory || filePath);
            var projectDir = absolute(directory, path) ? path.normalize(directory) : null;
            if (!absolute(filePath, path)) {
                if (!projectDir || path.isAbsolute(filePath) || /^[A-Za-z]:/.test(filePath)) return null;
                filePath = path.resolve(projectDir, filePath);
            }
            if (!absolute(filePath, path)) return null;
            filePath = path.normalize(filePath);
            var localKey = JSON.stringify([projectDir ? identity(projectDir, path) : "", identity(filePath, path)]);
            var entry = typeof entryName === "string" ? entryName : "";
            return {project: project || null, projectDir: projectDir, filePath: filePath,
                scriptKey: projectDir ? relativeInside(projectDir, filePath, path) : null,
                localKey: localKey, entry: entry, defaultEntry: typeof defaultEntryName === "string" ? defaultEntryName : "",
                targetKey: JSON.stringify([localKey, entry]),
                pathAPI: path};
        }
        function localSettings() {
            var current = Preferences && Preferences.current;
            return object(current) && object(current.gooWeePreview);
        }
        function projectSettings(ctx) { return ctx.project && object(ctx.project.properties) && object(ctx.project.properties.gooWeePreview); }
        function readProject(ctx) {
            var project = ctx.project;
            if (!project || typeof project.readConfigJsonFileSync !== "function") return {};
            var data = project.readConfigJsonFileSync(configFile);
            if (data == null) {
                // GMEdit returns null for both an absent file and a parse error.
                // Never replace an existing file whose contents could not be read.
                if (typeof project.existsSync === "function" && project.existsSync("#config/" + configFile)) {
                    throw new Error("Could not read #config/" + configFile + ". Fix its JSON before saving references.");
                }
                return {};
            }
            if (!object(data) || own(data, "references") && !object(data.references)) {
                throw new Error("Invalid #config/" + configFile + ": expected an object with a references map.");
            }
            return data;
        }
        function projectRecords(ctx, data) {
            var legacy = projectSettings(ctx), records = map(legacy && legacy.references);
            // The standalone file takes precedence; old properties remain intact
            // for compatibility and are migrated when a shared reference is saved.
            Object.keys(data.references || {}).forEach(function(key) {
                var previous = matchingKey(records, key, ctx.pathAPI === paths.win32);
                var before = previous && records[previous], after = data.references[key];
                var currentScript = matchingKey({[key]: true}, ctx.scriptKey, ctx.pathAPI === paths.win32);
                if (previous && previous !== key) delete records[previous];
                // Only the current script has a known default entry. Leave flat
                // records for other scripts intact until their own first save.
                if (currentScript || object(before) && object(before.entries) && object(after) && object(after.entries)) {
                    records[key] = mergeEntries(before, after, ctx.defaultEntry);
                } else records[key] = after;
            });
            return records;
        }
        function decoded(ctx, record, scope) {
            if (!coordinates(record)) return null;
            var filePath, path = ctx.pathAPI;
            if (scope === "project") {
                if (!ctx.projectDir || !ctx.scriptKey || !record.path.startsWith(token)) return null;
                var relative = record.path.slice(token.length);
                if (!relative || path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative) || relative.indexOf("\0") >= 0) return null;
                filePath = path.resolve(ctx.projectDir, relative);
                if (!relativeInside(ctx.projectDir, filePath, path)) return null;
            } else {
                if (!absolute(record.path, flavor(record.path))) return null;
                filePath = flavor(record.path).normalize(record.path);
            }
            return {path: record.path, filePath: filePath, x: record.x, y: record.y, scope: scope};
        }
        function load(ctx) {
            if (!ctx) return null;
            var settings = localSettings(), localEntries = entries(get(settings && settings.localReferences, ctx.localKey), ctx.defaultEntry);
            var local = decoded(ctx, get(localEntries, ctx.entry), "local");
            if (local) return local;
            if (!ctx.scriptKey) return null;
            var records = projectRecords(ctx, readProject(ctx));
            var key = matchingKey(records, ctx.scriptKey, ctx.pathAPI === paths.win32);
            return key ? decoded(ctx, get(entries(records[key], ctx.defaultEntry), ctx.entry), "project") : null;
        }
        function writeLocal(records) {
            if (!Preferences || !object(Preferences.current) || typeof Preferences.save !== "function") throw new Error("Local GMEdit settings are unavailable.");
            var current = Preferences.current, hadSettings = own(current, "gooWeePreview"), previousSettings = current.gooWeePreview;
            var settings = object(previousSettings) || {}, hadReferences = own(settings, "localReferences"), previousReferences = settings.localReferences;
            current.gooWeePreview = settings;
            settings.localReferences = records;
            try { Preferences.save(); }
            catch (error) {
                if (hadReferences) settings.localReferences = previousReferences; else delete settings.localReferences;
                if (hadSettings) current.gooWeePreview = previousSettings; else delete current.gooWeePreview;
                throw error;
            }
        }
        function writeProject(ctx, data) {
            if (!ctx.project || typeof ctx.project.writeConfigJsonFileSync !== "function") throw new Error("Project reference settings are unavailable.");
            ctx.project.writeConfigJsonFileSync(configFile, data);
        }
        function save(ctx, imagePath, x, y) {
            if (!ctx) throw new Error("Save this script before saving its reference.");
            var imageAPI = flavor(imagePath);
            if (!absolute(imagePath, imageAPI)) throw new Error("A reference must have an absolute file path.");
            if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Reference offsets must be finite numbers.");
            imagePath = imageAPI.normalize(imagePath);
            var relative = ctx.scriptKey && ctx.projectDir && imageAPI === ctx.pathAPI ? relativeInside(ctx.projectDir, imagePath, imageAPI) : null;
            var record = {path: relative ? token + relative : imagePath, x: x, y: y};
            var settings = localSettings(), localRecords = map(settings && settings.localReferences);
            var previousLocal = get(localRecords, ctx.localKey), localEntries = entries(previousLocal, ctx.defaultEntry);
            if (!relative) {
                localEntries[ctx.entry] = record;
                localRecords[ctx.localKey] = {entries: localEntries};
                writeLocal(localRecords);
                return decoded(ctx, record, "local");
            }
            var data = readProject(ctx), sharedRecords = projectRecords(ctx, data);
            var oldKey = matchingKey(sharedRecords, ctx.scriptKey, ctx.pathAPI === paths.win32);
            var sharedEntries = entries(oldKey && sharedRecords[oldKey], ctx.defaultEntry);
            if (oldKey && oldKey !== ctx.scriptKey) delete sharedRecords[oldKey];
            sharedEntries[ctx.entry] = record;
            sharedRecords[ctx.scriptKey] = {entries: sharedEntries};
            var nextData = Object.assign({}, data, {references: sharedRecords});
            if (own(localEntries, ctx.entry) || coordinates(previousLocal)) {
                var previousReferences = settings.localReferences;
                delete localEntries[ctx.entry];
                if (Object.keys(localEntries).length) localRecords[ctx.localKey] = {entries: localEntries};
                else delete localRecords[ctx.localKey];
                // Clear the override before writing shared data. If preference
                // persistence fails, no new project config file is created.
                writeLocal(localRecords);
                try { writeProject(ctx, nextData); }
                catch (error) {
                    try { writeLocal(previousReferences); } catch (_) { /* Preserve the project write error. */ }
                    settings.localReferences = previousReferences;
                    throw error;
                }
            } else writeProject(ctx, nextData);
            return decoded(ctx, record, "project");
        }
        return {context: context, load: load, save: save};
    }
    return {create: create};
});
