(function(root, factory) {
	"use strict";
	var api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	if (root) root.GooWeePreviewResources = api;
})(typeof window !== "undefined" ? window : null, function() {
	"use strict";
	var own = Object.prototype.hasOwnProperty;
	function get(map, key) { return map && own.call(map, key) ? map[key] : null; }
	function dimension(value) { return typeof value === "number" && isFinite(value) && value >= 0 ? value : null; }
	function identifier(value) { return typeof value === "string" && /^[A-Za-z_][A-Za-z_0-9]*$/.test(value); }

	/** Read-only resource adapter using GMEdit's project abstraction (also works with ZIP projects).
	 * sprite(name, index) returns {name,index,width,height,originX,originY,url,nineSlice,frameCount} or null.
	 * collect(source) returns an asset map for identifiers referring to project sprites.
	 * sourceFor(name) returns {name,path,source,row} using GMEdit's symbol index or a script asset.
	 * font(name) reads GMFont glyph metrics and atlas URLs.
	 * fontFileFor(path,size,bold,italic) registers a project font file.
	 * jsonFor(path)/jsonFiles(directory) provide bounded, project-relative fixture reads.
	 * Pass $gmedit['gml.GmlAPI'] as the optional second argument to resolve functions
	 * declared inside another script resource (for example gui_menu_title_add in gui_Common).
	 * The optional third argument readOpenSource(projectRelativePath) returns fresh
	 * editor text, or null/undefined to use disk. Editor text bypasses the disk cache.
	 * clear() invalidates metadata/URLs; dispose() also releases the project reference.
	 */
	function create(project, api, readOpenSource) {
		var metadata = Object.create(null), frames = Object.create(null), sources = Object.create(null);
		var objectEvents = Object.create(null);
		var fontMetadata = Object.create(null), jsonCache = Object.create(null), jsonBytes = 0;
		function projectPath(path) {
			if (!project || typeof path !== "string" || !path) return null;
			path = path.replace(/\\/g, "/");
			if (/^(?:[A-Za-z]:|\/)/.test(path)) {
				if (typeof project.relPath === "function") path = project.relPath(path);
				else if (typeof project.dir === "string") {
					var directory = project.dir.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
					path = path.slice(0, directory.length).toLowerCase() === directory.toLowerCase() ? path.slice(directory.length) : null;
				} else return null;
			}
			if (!path || /^(?:[A-Za-z]:|\/)/.test(path) || path.split("/").some(function(part) { return part === ".."; })) return null;
			path = path.replace(/^\.\//, "");
			return path;
		}
		function scriptPath(path) {
			path = projectPath(path);
			if (!path) return null;
			if (/(^|\/)scripts\//i.test(path)) path = path.replace(/\.yy$/i, ".gml");
			return /\.gml$/i.test(path) ? path : null;
		}
		function objectPath(path) {
			path = projectPath(path);
			return path && /^objects\/[^/]+\/[^/]+\.yy$/i.test(path) ? path : null;
		}
		function readSource(path) {
			if (typeof readOpenSource === "function") {
				var open = readOpenSource(path);
				if (open != null) return typeof open === "string" && open.length <= 2 * 1024 * 1024 ? open : null;
			}
			if (!own.call(sources, path)) {
				try {
					var source = project.readTextFileSync(path);
					sources[path] = typeof source === "string" && source.length <= 2 * 1024 * 1024 ? source : null;
				} catch (_) { sources[path] = null; }
			}
			return sources[path];
		}
		function objectSource(name, origin, row) {
			var path = objectPath(origin);
			if (!path) return null;
			// Object tabs contain combined #event sections; an open buffer is authoritative.
			if (typeof readOpenSource === "function") {
				var open = readOpenSource(path);
				if (open != null) return typeof open === "string" && open.length <= 2 * 1024 * 1024 ? {name:name,path:path,source:open,row:row || 0} : null;
			}
			if (!own.call(objectEvents, path)) {
				var files = [];
				try {
					var object = project.readYyFileSync(path), directory = path.replace(/\/[^/]+$/, "");
					var types = ["Create","Destroy","Alarm","Step","Collision","Keyboard","Mouse","Other","Draw","KeyPress","KeyRelease","Trigger","CleanUp","Gesture","event14","event15"];
					if ((!object.resourceType || object.resourceType === "GMObject") && Array.isArray(object.eventList) && object.eventList.length <= 128) {
						object.eventList.forEach(function(event) {
							if (event.isDnD || event.IsDnD) return;
							var legacy = event.eventType == null, type = legacy ? event.eventtype : event.eventType, index = legacy ? event.enumb : event.eventNum;
							if (!Number.isInteger(type) || !types[type]) return;
							if (type === 4) index = legacy ? event.id : event.collisionObjectId && event.collisionObjectId.name || object.name;
							else if (!Number.isInteger(index) || index < 0) return;
							if (!/^[A-Za-z_0-9-]+$/.test(String(index))) return;
							files.push(directory + "/" + types[type] + "_" + index + ".gml");
						});
					}
				} catch (_) { }
				objectEvents[path] = files;
			}
			var declaration = new RegExp("\\b(?:enum|function)\\s+" + name + "\\s*[({]"), bytes = 0;
			for (var i = 0; i < objectEvents[path].length; i++) {
				var eventPath = objectEvents[path][i], source = readSource(eventPath);
				if (source == null) continue;
				bytes += source.length; if (bytes > 2 * 1024 * 1024) break;
				// Ignore documentation and string literals when finding the declaring event.
				var code = source.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|@"[^"]*"|@'[^']*'|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, function(text) { return text.replace(/[^\r\n]/g, " "); });
				var match = declaration.exec(code);
				if (match) return {name:name,path:eventPath,source:source,row:source.slice(0,match.index).split("\n").length - 1};
			}
			return null;
		}
		function sourceFor(name) {
			if (!project || !identifier(name) || (typeof project.readTextFileSync !== "function" && typeof readOpenSource !== "function")) return null;
			var candidates = [name];
			if (!/^gw_/.test(name)) candidates.push("gw_" + name);
			for (var i = 0; i < candidates.length; i++) {
				var canonical = candidates[i], lookup = get(api && api.gmlLookup, canonical);
				if (objectPath(lookup && lookup.path)) return objectSource(canonical, lookup.path, lookup.row);
				var path = scriptPath(lookup && lookup.path), row = lookup && lookup.row;
				// GMEdit keeps enum declarations in a separate index. They may not
				// have a function lookup or share the declaring script's name.
				if (!path) {
					var enumeration = get(api && api.gmlEnums, canonical);
					if (objectPath(enumeration && enumeration.origin)) return objectSource(canonical, enumeration.origin, 0);
					path = scriptPath(enumeration && enumeration.origin);
				}
				if (!path) {
					var id = get(project.yyResourceGUIDs, canonical) || canonical;
					var entry = get(project.yyResources, id), type = get(project.yyResourceTypes, canonical);
					if (type && type !== "GMScript") continue;
					var resourcePath = entry && (entry.id && entry.id.path || entry.Value && entry.Value.resourcePath);
					if (!resourcePath || !/(^|[\\/])scripts[\\/]/i.test(resourcePath)) continue;
					path = scriptPath(resourcePath);
				}
				if (!path) continue;
				var source = readSource(path);
				if (source != null) return {name: canonical, path: path, source: source, row: Number.isFinite(row) ? row : 0};
			}
			return null;
		}
		function font(name) {
			if (!project || typeof name !== "string") return null;
			if (own.call(fontMetadata, name)) return fontMetadata[name];
			if (!identifier(name)) return null;
			var id = get(project.yyResourceGUIDs, name) || name, entry = get(project.yyResources, id);
			var resourcePath = entry && (entry.id && entry.id.path || entry.Value && entry.Value.resourcePath);
			var type = get(project.yyResourceTypes, name);
			if (!resourcePath || (type && type !== "GMFont") || (!type && !/(^|[\\/])fonts[\\/]/i.test(resourcePath))) return null;
			var result = null;
			try {
				var yy = project.readYyFileSync(resourcePath);
				if (yy && (!yy.resourceType || yy.resourceType === "GMFont")) {
					var glyphs = Object.create(null), sourceGlyphs = yy.glyphs || {};
					if (Array.isArray(sourceGlyphs)) sourceGlyphs = sourceGlyphs.reduce(function(all, item) { if (item && item.Value) all[item.Key] = item.Value; else if (item) all[item.character] = item; return all; }, Object.create(null));
					Object.keys(sourceGlyphs).forEach(function(key) {
						var glyph = sourceGlyphs[key];
						if (!/^\d+$/.test(key) || !glyph || ![glyph.x,glyph.y,glyph.w,glyph.h,glyph.shift,glyph.offset].every(Number.isFinite)) return;
						if (glyph.w < 0 || glyph.h < 0) return;
						glyphs[key] = {character: Number(key), x: glyph.x, y: glyph.y, w: glyph.w, h: glyph.h, shift: glyph.shift, offset: glyph.offset};
					});
					var lineHeight = dimension(yy.lineHeight) || Math.max.apply(null, [0].concat(Object.keys(glyphs).map(function(key) { return glyphs[key].h; })));
					var atlasPath = resourcePath.replace(/\.yy$/i, ".png");
					result = {name: name, kind: "atlas", path: resourcePath, url: typeof project.getImageURL === "function" ? project.getImageURL(atlasPath) : null,
						fontName: typeof yy.fontName === "string" ? yy.fontName : name, styleName: yy.styleName || "", size: dimension(yy.size) || 12,
						bold: !!yy.bold, italic: !!yy.italic, usesSDF: !!yy.usesSDF, sdfSpread: dimension(yy.sdfSpread) || 0,
						ascender: dimension(yy.ascender) || 0, ascenderOffset: Number.isFinite(yy.ascenderOffset) ? yy.ascenderOffset : 0,
						lineHeight: lineHeight, applyKerning: yy.applyKerning !== false && yy.applyKerning !== 0, glyphs: glyphs, kerningPairs: Array.isArray(yy.kerningPairs) ? yy.kerningPairs.filter(function(pair) { return pair && [pair.first,pair.second,pair.amount].every(Number.isFinite); }).map(function(pair) { return {first: pair.first, second: pair.second, amount: pair.amount}; }) : []};
				}
			} catch (_) { }
			fontMetadata[name] = result; return result;
		}
		function relativeFile(value) {
			if (typeof value !== "string" || !value || /[\x00-\x1f]/.test(value)) throw Error("Expected a project-relative file path");
			value = value.replace(/\\/g, "/").replace(/^\.\//, "");
			if (/^(?:[A-Za-z]:|\/)/.test(value) || value.indexOf(":") >= 0 || value.split("/").some(function(part) { return part === ".."; })) throw Error("Preview files must remain inside the project");
			return value;
		}
		function jsonFor(relative) {
			if (!project || typeof project.readTextFileSync !== "function") throw Error("Project file reading is unavailable");
			relative = relativeFile(relative);
			if (!/\.json$/i.test(relative)) throw Error("Preview data must be a JSON file");
			if (!own.call(jsonCache, relative)) {
				var text = project.readTextFileSync(relative);
				if (typeof text !== "string" || text.length > 512 * 1024 || jsonBytes + text.length > 8 * 1024 * 1024) throw Error("Preview JSON read limit exceeded");
				jsonBytes += text.length;
				JSON.parse(text.replace(/^\uFEFF/, ""));
				jsonCache[relative] = text.replace(/^\uFEFF/, "");
			}
			// Fresh values on each read prevent a preview run from changing its fixtures.
			return JSON.parse(jsonCache[relative]);
		}
		function previewSetup() {
			if (!project) return null;
			var file = ".goowee-preview.gml";
			if (typeof readOpenSource === "function") {
				var openSource = readOpenSource(file);
				if (openSource != null) {
					if (typeof openSource !== "string" || openSource.length > 256 * 1024) throw Error("Project preview setup exceeds the 256 KiB limit or is not text");
					return {path: file, source: openSource};
				}
			}
			if (typeof project.readTextFileSync !== "function") return null;
			if (typeof project.existsSync === "function" && !project.existsSync(file)) return null;
			try {
				var source = project.readTextFileSync(file);
				if (typeof source !== "string" || source.length > 256 * 1024) throw Error("Project preview setup exceeds the 256 KiB limit");
				return {path: file, source: source};
			} catch (error) {
				if (error.code === "ENOENT" || /^(?:Missing|Not found)/i.test(error.message)) return null;
				throw error;
			}
		}
		function previewSourceFor(relative) {
			if (!project) throw Error("No project is open");
			relative = relativeFile(relative);
			if (!/\.gml$/i.test(relative)) throw Error("Preview includes must be GML files");
			var source = typeof readOpenSource === "function" ? readOpenSource(relative) : null;
			if (source == null) {
				if (typeof project.readTextFileSync !== "function") throw Error("Project file reading is unavailable");
				source = project.readTextFileSync(relative);
			}
			if (typeof source !== "string" || source.length > 256 * 1024) throw Error("Preview include exceeds the 256 KiB limit or is not text");
			return {path: relative, source: source};
		}
		function jsonFiles(directory) {
			if (!project) throw Error("No project is open");
			directory = relativeFile(directory).replace(/\/+$/, "");
			var entries;
			if (typeof project.readdirSync === "function") entries = project.readdirSync(directory);
			else if (typeof require === "function" && project.dir) entries = require("fs").readdirSync(require("path").join(project.dir, directory), {withFileTypes:true});
			else throw Error("Project directory listing is unavailable");
			var files = entries.filter(function(item) { return typeof item === "string" || !(typeof item.isDirectory === "function" ? item.isDirectory() : item.isDirectory); }).map(function(item) { return typeof item === "string" ? item : item.fileName || item.name; }).filter(function(name) { return typeof name === "string" && /^[^\\/]+\.json$/i.test(name); }).sort();
			if (files.length > 1024) throw Error("Preview directory entry limit exceeded");
			return files.map(function(name) { return directory + "/" + name; });
		}
		function fontFileFor(file, size, bold, italic) {
			if (!project) return null;
			file = relativeFile(file);
			if (!/\.(?:ttf|otf|woff2?)$/i.test(file)) return null;
			if (!/^datafiles\//i.test(file)) file = "datafiles/" + file;
			size = Number(size); if (!Number.isFinite(size) || size <= 0 || size > 512) return null;
			var name = "file:" + file + ":" + size + ":" + !!bold + ":" + !!italic;
			if (!own.call(fontMetadata, name)) fontMetadata[name] = {name:name, kind:"file", path:file,
				url:typeof project.getImageURL === "function" ? project.getImageURL(file) : null,
				fontName:file.split("/").pop(), size:size, bold:!!bold, italic:!!italic, usesSDF:false, sdfSpread:0};
			return fontMetadata[name];
		}
		function resource(name) {
			if (!project || !identifier(name)) return null;
			var id = get(project.yyResourceGUIDs, name) || name;
			var entry = get(project.yyResources, id);
			var path = entry && (entry.id && entry.id.path || entry.Value && entry.Value.resourcePath);
			if (!path) return null;
			var type = get(project.yyResourceTypes, name);
			if (type && type !== "GMSprite") return null;
			if (!type && !/(^|[\\/])sprites[\\/]/i.test(path)) return null;
			return { path: path };
		}
		function read(name) {
			if (own.call(metadata, name)) return metadata[name];
			var result = null;
			var entry = resource(name);
			if (entry && typeof project.readYyFileSync === "function") {
				try {
					var yy = project.readYyFileSync(entry.path);
					if (yy && (!yy.resourceType || yy.resourceType === "GMSprite")) result = { path: entry.path, yy: yy };
				} catch (_) { /* A missing/corrupt asset should not prevent the rest of the preview. */ }
			}
			metadata[name] = result;
			return result;
		}
		function sprite(name, index) {
			if (!project || !identifier(name)) return null;
			var data = read(name);
			var count = data && Array.isArray(data.yy.frames) ? data.yy.frames.length : 0;
			index = typeof index === "number" && isFinite(index) ? Math.floor(index) : 0;
			index = count ? ((index % count) + count) % count : 0;
			var key = name + ":" + index;
			if (own.call(frames, key)) return frames[key];
			var result = null;
			try {
				var url = null;
				if (data) {
					var yy = data.yy, frame = count ? yy.frames[index] : null;
					var frameName = frame && (frame.name || frame.id || frame["%Name"]);
					if (typeof frameName === "string" && /^[A-Za-z_0-9-]+$/.test(frameName) && typeof project.getImageURL === "function") {
						var directory = data.path.replace(/[\\/][^\\/]*$/, "");
						url = project.getImageURL(directory + "/" + frameName + ".png");
					}
					var slice = yy.nineSlice;
					var nineSlice = slice && slice.enabled ? {
						left: dimension(slice.left) || 0, top: dimension(slice.top) || 0,
						right: dimension(slice.right) || 0, bottom: dimension(slice.bottom) || 0,
						tileMode: Array.isArray(slice.tileMode) ? slice.tileMode.slice(0, 5) : [0, 0, 0, 0, 0]
					} : null;
					var originX = yy.sequence ? yy.sequence.xorigin : yy.xorig;
					var originY = yy.sequence ? yy.sequence.yorigin : yy.yorig;
					result = { name: name, index: index, width: dimension(yy.width), height: dimension(yy.height),
						originX: typeof originX === "number" && isFinite(originX) ? originX : 0,
						originY: typeof originY === "number" && isFinite(originY) ? originY : 0,
						url: url, nineSlice: nineSlice, frameCount: count };
				} else if (!project.yyResources && typeof project.getSpriteURL === "function") {
					// Other project formats can supply the first-frame thumbnail, but no YY dimensions.
					url = project.getSpriteURL(name);
					if (url) result = { name: name, index: 0, width: null, height: null, originX: 0, originY: 0, url: url, nineSlice: null, frameCount: 1 };
				}
			} catch (_) { result = null; }
			frames[key] = result;
			return result;
		}
		function collect(source) {
			var assets = Object.create(null);
			// Match names through the project index, rather than assuming a naming prefix.
			var names = String(source || "").match(/[A-Za-z_][A-Za-z_0-9]*/g) || [];
			var seen = Object.create(null);
			for (var i = 0; i < names.length; i++) {
				var name = names[i];
				if (seen[name]) continue;
				seen[name] = true;
				if (!resource(name)) continue;
				var asset = sprite(name, 0);
				if (asset) assets[name] = asset;
			}
			return assets;
		}
		function clear() { metadata = Object.create(null); frames = Object.create(null); sources = Object.create(null); objectEvents = Object.create(null); fontMetadata = Object.create(null); jsonCache = Object.create(null); jsonBytes = 0; }
		return { sprite: sprite, font: font, collect: collect, sourceFor: sourceFor, relativeSourcePath: function(path) { return scriptPath(path) || objectPath(path); }, previewSetup: previewSetup, previewSourceFor: previewSourceFor, fontFileFor: fontFileFor, jsonFor: jsonFor, jsonFiles: jsonFiles, clear: clear, dispose: function() { clear(); project = null; api = null; readOpenSource = null; } };
	}
	return { create: create };
});
