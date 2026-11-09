(function(root, factory) {
    "use strict";
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.GooWeePreviewFonts = api;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";
    var nextFamily = 1;
    function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function smoothstep(min, max, value) {
        if (max <= min) return value >= max ? 1 : 0;
        var t = clamp((value - min) / (max - min), 0, 1);
        return t * t * (3 - 2 * t);
    }
    function create(resolveFont, invalidate) {
        var entries = new Map(), masks = new Map(), maskPixels = 0, revision = Date.now();
        var generation = 0, alive = true, notes = [], noteKeys = new Set();
        var measuring = document.createElement("canvas").getContext("2d");
        var colorCanvas = document.createElement("canvas"); colorCanvas.width = colorCanvas.height = 1;
        var colorContext = colorCanvas.getContext("2d", {willReadFrequently: true});
        function warn(key, message, asset) {
            if (noteKeys.has(key) || notes.length >= 50) return;
            noteKeys.add(key); notes.push({message: message, sourcePath: asset && asset.path || "", severity: "warning"});
        }
        function freshURL(value) {
            if (!/^(?:file|https?):/i.test(value)) return value;
            try { var url = new URL(value); url.searchParams.set("goowee-font", String(revision)); return url.href; } catch (_) { return value; }
        }
        function css(entry, size) {
            var asset = entry && entry.asset || {};
            return (asset.italic ? "italic " : "") + (asset.bold ? "bold " : "") + size + "px " +
                (entry && entry.family ? '"' + entry.family + '"' : "sans-serif");
        }
        function get(style) {
            if (!alive || !style || !style.fontResource) return null;
            var name = style.fontResource;
            if (entries.has(name)) return entries.get(name);
            var asset = resolveFont(name);
            if (!asset || !asset.url) {
                warn("missing:" + name, "Project font " + name + " could not be loaded; using a browser fallback.", asset);
                entries.set(name, null); return null;
            }
            var item = {asset: asset, ready: false, failed: false, kerning: Object.create(null)}, token = generation;
            item.pending = new Promise(function(resolve) { item.complete = resolve; });
            (asset.kerningPairs || []).forEach(function(pair) {
                item.kerning[pair.first + ":" + pair.second] = finite(pair.amount, 0);
            });
            entries.set(name, item);
            function changed() { item.complete(); if (alive && token === generation && typeof invalidate === "function") invalidate(); }
            function failed(error) {
                if (!alive || token !== generation) return;
                item.failed = true;
                warn("load:" + name, "Project font " + name + " could not be decoded; using a browser fallback.", asset);
                changed();
            }
            if (asset.kind === "file") {
                if (typeof FontFace !== "function" || !document.fonts) { failed(); return item; }
                item.family = "GooWeePreviewFont" + nextFamily++;
                try {
                    item.face = new FontFace(item.family, "url(" + JSON.stringify(freshURL(asset.url)) + ")", {
                        weight: asset.bold ? "700" : "400", style: asset.italic ? "italic" : "normal"
                    });
                    item.face.load().then(function(face) {
                        if (!alive || token !== generation) return;
                        document.fonts.add(face); item.ready = true; changed();
                    }, failed);
                } catch (error) { failed(error); }
            } else {
                var image = item.image = new Image();
                image.onload = function() {
                    if (!alive || token !== generation) return;
                    try {
                        var surface = document.createElement("canvas");
                        surface.width = image.naturalWidth; surface.height = image.naturalHeight;
                        if (!surface.width || !surface.height || surface.width * surface.height > 16 * 1024 * 1024) throw new Error("Font atlas is too large");
                        var context = surface.getContext("2d", {willReadFrequently: true}); context.drawImage(image, 0, 0);
                        item.pixels = context.getImageData(0, 0, surface.width, surface.height).data;
                        item.width = surface.width; item.height = surface.height;
                        item.ready = true; changed();
                    } catch (error) { failed(error); }
                };
                image.onerror = failed; image.src = freshURL(asset.url);
            }
            return item;
        }
        function fallbackMetrics(text, style, entry) {
            var size = clamp(finite(style.fontSize, 16), 1, 512), lines = String(text).split(/\r?\n/);
            measuring.font = entry ? css(entry, size) : (style.italic ? "italic " : "") + (style.bold ? "bold " : "") + size + "px sans-serif";
            var lineHeight = size * 1.25, widths = lines.map(function(line) { return measuring.measureText(line).width; });
            return {width: Math.max.apply(null, widths), height: lines.length * lineHeight, lineHeight: lineHeight,
                lineAdvance: lineHeight, lineWidths: widths, lines: lines, scale: 1, projectFont: false};
        }
        function glyph(entry, code) {
            var glyphs = entry.asset.glyphs || {}, result = glyphs[code];
            if (!result) {
                result = glyphs[9647] || glyphs[63] || glyphs[32];
                warn("glyph:" + entry.asset.name, "Some characters are absent from project font " + entry.asset.name + "; its replacement glyph is shown.", entry.asset);
            }
            return result || null;
        }
        function metrics(text, style, entry) {
            if (!entry || entry.failed) return fallbackMetrics(text, style, null);
            var asset = entry.asset, scale = clamp(finite(style.fontSize, 16), 1, 512) / Math.max(1, finite(asset.size, 12) * 1.3333);
            var lines = String(text).split(/\r?\n/), lineHeight = finite(style.sdfLineHeight, finite(asset.lineHeight, 0));
            var widths;
            if (asset.kind === "file") {
                var nominal = finite(asset.size, 32) * 1.3333;
                measuring.font = css(entry, nominal);
                var measured = measuring.measureText("Wq");
                if (!(lineHeight > 0)) lineHeight = (measured.fontBoundingBoxAscent || measured.actualBoundingBoxAscent || nominal) + (measured.fontBoundingBoxDescent || measured.actualBoundingBoxDescent || nominal * 0.2);
                lineHeight += finite(style.fontLineHeightAdjustment, 0);
                widths = lines.map(function(line) { return measuring.measureText(line).width * scale; });
            } else {
                if (!(lineHeight > 0)) lineHeight = Math.max.apply(null, Object.keys(asset.glyphs || {}).map(function(key) { return asset.glyphs[key].h || 0; }).concat([finite(asset.size, 12) * 1.3333]));
                widths = lines.map(function(line) {
                    var width = 0, previous = null;
                    Array.from(line).forEach(function(character) {
                        var code = character.codePointAt(0), current = glyph(entry, code);
                        if (asset.applyKerning && previous != null) width += entry.kerning[previous + ":" + code] || 0;
                        width += current ? finite(current.shift, current.w || 0) : 0; previous = code;
                    });
                    return width * scale;
                });
            }
            return {width: Math.max.apply(null, widths), height: (lineHeight + (lineHeight + 2) * (lines.length - 1)) * scale,
                lineHeight: lineHeight * scale, lineAdvance: (lineHeight + 2) * scale, lineWidths: widths, lines: lines, scale: scale, projectFont: true};
        }
        function rgb(color, blend) {
            function parse(value) {
                colorContext.clearRect(0, 0, 1, 1); colorContext.fillStyle = "#ffffff";
                colorContext.fillStyle = typeof value === "number" && Number.isFinite(value) ?
                    "rgb(" + (value & 255) + "," + ((value >> 8) & 255) + "," + ((value >> 16) & 255) + ")" :
                    typeof value === "string" ? value : "#ffffff"; colorContext.fillRect(0, 0, 1, 1);
                return colorContext.getImageData(0, 0, 1, 1).data;
            }
            var a = parse(color), b = parse(blend);
            return [Math.round(a[0] * b[0] / 255), Math.round(a[1] * b[1] / 255), Math.round(a[2] * b[2] / 255)];
        }
        function effectParameters(entry, style) {
            var effect = style.sdfEffect;
            if (!effect || typeof effect !== "object") return null;
            if (!entry.asset.usesSDF || !(entry.asset.sdfSpread > 0)) {
                warn("effects:" + entry.asset.name, "SDF effects require a project SDF font atlas with a positive spread: " + entry.asset.name + ".", entry.asset);
                return null;
            }
            function number(key, fallback, min, max) { return clamp(finite(effect[key], fallback), min, max); }
            function rgba(prefix, fallback) {
                var value = effect[prefix + "Colour"];
                if (value == null) value = effect[prefix + "Color"];
                return rgb(value == null ? fallback : value).concat(number(prefix + "Alpha", 1, 0, 1));
            }
            function enabled(key) { return effect[key] === true || typeof effect[key] === "number" && effect[key] > 0.5; }
            var distance = 1 / (2 * entry.asset.sdfSpread), thickness = number("thickness", 0, -32, 32);
            function threshold(pixels) { return clamp(0.5 - pixels * distance, 0.001, 0.9999); }
            var softness = number("dropShadowSoftness", 0, 0, 64) / 2;
            // GameMaker's native SDF uniforms use distances in source font pixels.
            // Keep this generic: project helpers supply the standard effect struct.
            return {core: rgba("core", "#ffffff"), coreThreshold: threshold(thickness),
                outline: enabled("outlineEnable"), outlineColor: rgba("outline", "#ffffff"),
                outlineThreshold: threshold(thickness + number("outlineDistance", 1, 0, 64)),
                glow: enabled("glowEnable"), glowColor: rgba("glow", "#ffffff"),
                glowMin: threshold(thickness + number("glowEnd", 32, 0, 64)),
                glowMax: threshold(thickness + number("glowStart", 0, 0, 64)),
                shadow: enabled("dropShadowEnable"), shadowColor: rgba("dropShadow", "#000000"),
                shadowMin: threshold(thickness + softness), shadowMax: 0.5 - (thickness - softness) * distance,
                shadowX: finite(effect.dropShadowOffsetX, 0), shadowY: finite(effect.dropShadowOffsetY, 0)};
        }
        function sample(entry, x, y, current) {
            var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
            function alpha(px, py) {
                return px < 0 || py < 0 || px >= entry.width || py >= entry.height || current &&
                    (px < current.x || py < current.y || px >= current.x + current.w || py >= current.y + current.h) ?
                    0 : entry.pixels[(py * entry.width + px) * 4 + 3] / 255;
            }
            return (alpha(ix, iy) * (1 - fx) + alpha(ix + 1, iy) * fx) * (1 - fy) +
                (alpha(ix, iy + 1) * (1 - fx) + alpha(ix + 1, iy + 1) * fx) * fy;
        }
        function sampleColor(entry, x, y, channel, alpha, current) {
            if (alpha <= 0) return 0;
            var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
            function component(px, py) {
                if (px < 0 || py < 0 || px >= entry.width || py >= entry.height || current &&
                    (px < current.x || py < current.y || px >= current.x + current.w || py >= current.y + current.h)) return 0;
                var offset = (py * entry.width + px) * 4;
                return entry.pixels[offset + channel] * entry.pixels[offset + 3] / 255;
            }
            // Interpolate premultiplied color so transparent atlas padding does
            // not add a dark fringe. Bitmap font outlines keep their actual RGB.
            return ((component(ix, iy) * (1 - fx) + component(ix + 1, iy) * fx) * (1 - fy) +
                (component(ix, iy + 1) * (1 - fx) + component(ix + 1, iy + 1) * fx) * fy) / alpha;
        }
        function glyphSurface(entry, current, scale, tint, effect, shadow) {
            var pixelScale = Math.max(0.02, Math.round(scale * 256) / 256);
            var key = [entry.asset.url, current.character, current.x, current.y, pixelScale, tint.join(","),
                effect ? JSON.stringify(effect) : "", !!shadow].join(":");
            var found = masks.get(key);
            if (found) { masks.delete(key); masks.set(key, found); return found.surface; }
            var width = Math.max(1, Math.ceil(current.w * pixelScale)), height = Math.max(1, Math.ceil(current.h * pixelScale));
            if (width * height > 1024 * 1024) return null;
            var surface = document.createElement("canvas"); surface.width = width; surface.height = height;
            var context = surface.getContext("2d"), data = context.createImageData(width, height), bytes = data.data;
            var sx = current.w / width, sy = current.h / height;
            for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
                var tx = current.x + (x + 0.5) * sx - 0.5, ty = current.y + (y + 0.5) * sy - 0.5;
                var alpha = sample(entry, tx, ty, current), pixelColor = tint;
                if (effect) {
                    // Reproduce the native blur/effect passes, including straight
                    // RGBA mixing followed by the text color/alpha multiplier.
                    var value = alpha, result;
                    if (shadow) {
                        result = effect.shadowColor.slice();
                        result[3] *= smoothstep(effect.shadowMin, effect.shadowMax, value);
                    } else {
                        result = null;
                        if (effect.glow && value > effect.glowMin) {
                            result = effect.glowColor.slice();
                            result[3] *= smoothstep(effect.glowMin, effect.glowMax, value);
                        }
                        var pixelSpread = 0.4 / (entry.asset.sdfSpread * pixelScale);
                        if (effect.outline) {
                            var outlineSpread = Math.min(pixelSpread, effect.outlineThreshold);
                            if (value > effect.outlineThreshold - outlineSpread) {
                                var factor = smoothstep(effect.outlineThreshold - outlineSpread, effect.outlineThreshold + outlineSpread, value);
                                if (!result) result = effect.outlineColor.slice(0, 3).concat(0);
                                result = result.map(function(v, i) { return v + (effect.outlineColor[i] - v) * factor; });
                            }
                        }
                        var coreSpread = Math.min(pixelSpread, effect.coreThreshold);
                        var coreFactor = smoothstep(effect.coreThreshold - coreSpread, effect.coreThreshold + coreSpread, value);
                        if (!result) result = effect.core.slice(0, 3).concat(0);
                        result = result.map(function(v, i) { return v + (effect.core[i] - v) * coreFactor; });
                    }
                    pixelColor = result.slice(0, 3).map(function(value, i) { return value * tint[i] / 255; });
                    alpha = result[3];
                } else if (entry.asset.usesSDF) {
                    // The project shader reconstructs coverage around alpha=.5
                    // using screen-space distance derivatives. Do the same on
                    // a cached glyph surface at the canvas's current pixel scale.
                    var gx = (sample(entry, tx + sx * 0.5, ty, current) - sample(entry, tx - sx * 0.5, ty, current));
                    var gy = (sample(entry, tx, ty + sy * 0.5, current) - sample(entry, tx, ty - sy * 0.5, current));
                    alpha = clamp(0.5 + (alpha - 0.5) / Math.max(0.0001, Math.hypot(gx, gy)), 0, 1);
                }
                var offset = (y * width + x) * 4;
                for (var channel = 0; channel < 3; channel++) bytes[offset + channel] = entry.asset.usesSDF ? pixelColor[channel] : sampleColor(entry, tx, ty, channel, alpha, current) * tint[channel] / 255;
                bytes[offset + 3] = Math.round(alpha * 255);
            }
            context.putImageData(data, 0, 0);
            var pixels = width * height;
            while (masks.size && (masks.size >= 1024 || maskPixels + pixels > 8 * 1024 * 1024)) {
                var oldest = masks.keys().next().value; maskPixels -= masks.get(oldest).pixels; masks.delete(oldest);
            }
            masks.set(key, {surface: surface, pixels: pixels}); maskPixels += pixels;
            return surface;
        }
        function eachGlyph(entry, data, x, y, style, visit) {
            var scale = data.scale, asset = entry.asset, spread = asset.usesSDF ? finite(asset.sdfSpread, 0) : 0;
            var viewScale = finite(style.baseFontSize, 0) > 0 ? finite(style.fontSize, style.baseFontSize) / style.baseFontSize : 1;
            y += finite(style.sdfLineYCorrection, 0) * viewScale;
            data.lines.forEach(function(line, index) {
                var align = style.alignH, left = x + (align === 1 || align === "center" ? (data.width - data.lineWidths[index]) / 2 : align === 2 || align === "right" ? data.width - data.lineWidths[index] : 0);
                var top = y + index * data.lineAdvance, pen = 0, previous = null;
                Array.from(line).forEach(function(character) {
                    var code = character.codePointAt(0), current = glyph(entry, code);
                    if (asset.applyKerning && previous != null) pen += entry.kerning[previous + ":" + code] || 0;
                    if (current && current.w > 0 && current.h > 0) visit(current,
                        left + (pen + finite(current.offset, 0) - spread) * scale,
                        top - (spread + finite(asset.ascenderOffset, 0)) * scale);
                    pen += current ? finite(current.shift, current.w || 0) : 0; previous = code;
                });
            });
        }
        function inkBounds(text, x, y, style) {
            style = style || {};
            var entry = get(style);
            if (!entry || entry.failed || entry.asset.kind === "file") return null;
            var data = metrics(text, style, entry), effect = effectParameters(entry, style), box = null;
            function include(left, top, width, height) {
                if (!box) box = {x: left, y: top, right: left + width, bottom: top + height};
                else { box.x = Math.min(box.x, left); box.y = Math.min(box.y, top); box.right = Math.max(box.right, left + width); box.bottom = Math.max(box.bottom, top + height); }
            }
            // Conservative glyph-quad bounds are available before the atlas loads.
            // Export trims their transparent pixels after drawing, without cutting
            // off overhangs, SDF padding, or a displaced shadow.
            eachGlyph(entry, data, x, y, style, function(current, left, top) {
                include(left, top, current.w * data.scale, current.h * data.scale);
                if (effect && effect.shadow && effect.shadowColor[3] > 0) include(left + effect.shadowX * data.scale,
                    top + effect.shadowY * data.scale, current.w * data.scale, current.h * data.scale);
            });
            return box && {x: box.x, y: box.y, width: box.right - box.x, height: box.bottom - box.y};
        }
        function draw(context, text, x, y, style) {
            style = style || {};
            var entry = get(style), data = metrics(text, style, entry);
            if (!entry || entry.failed) return false;
            if (!entry.ready) return true;
            var asset = entry.asset, tint = rgb(style.color == null ? "#e5e7eb" : style.color, style.additionalColorBlend), scale = data.scale;
            var effect = effectParameters(entry, style);
            context.save(); context.globalAlpha *= clamp(finite(style.fontAlpha, 1), 0, 1);
            context.imageSmoothingEnabled = true;
            var transform = context.getTransform(), deviceScale = Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d), 0.1);
            if (asset.kind !== "file") {
                function drawPass(shadow) {
                    eachGlyph(entry, data, x, y, style, function(current, left, top) {
                        var surface = glyphSurface(entry, current, scale * deviceScale, tint, effect, shadow);
                        if (surface) context.drawImage(surface, left + (shadow ? effect.shadowX * scale : 0),
                            top + (shadow ? effect.shadowY * scale : 0), current.w * scale, current.h * scale);
                    });
                }
                // Draw the whole shadow pass first, so later glyphs cannot lay
                // their shadows over the main text of earlier glyphs.
                if (effect && effect.shadow && effect.shadowColor[3] > 0) drawPass(true);
                drawPass(false);
                context.restore(); return true;
            }
            var viewScale = finite(style.baseFontSize, 0) > 0 ? finite(style.fontSize, style.baseFontSize) / style.baseFontSize : 1;
            y += finite(style.sdfLineYCorrection, 0) * viewScale;
            data.lines.forEach(function(line, index) {
                var align = style.alignH, left = x + (align === 1 || align === "center" ? (data.width - data.lineWidths[index]) / 2 : align === 2 || align === "right" ? data.width - data.lineWidths[index] : 0);
                var top = y + index * data.lineAdvance;
                context.font = css(entry, finite(style.fontSize, 16)); context.fillStyle = "rgb(" + tint.join(",") + ")";
                context.textAlign = "left"; context.textBaseline = "top";
                context.fillText(line, left, top + finite(style.fontYOffset, 0) * scale);
            });
            context.restore(); return true;
        }
        function clear() {
            generation++; revision = Math.max(Date.now(), revision + 1);
            entries.forEach(function(entry) {
                if (!entry) return;
                entry.complete();
                if (entry.image) entry.image.onload = entry.image.onerror = null;
                if (entry.face && document.fonts) document.fonts.delete(entry.face);
            });
            entries.clear(); masks.clear(); maskPixels = 0; notes = []; noteKeys.clear();
        }
        return {measure: function(text, style) { style = style || {}; return metrics(text, style, get(style)); },
            whenReady: function() { return Promise.all(Array.from(entries.values()).map(function(entry) { return entry && entry.pending; })); },
            draw: draw, inkBounds: inkBounds, diagnostics: function() { return notes.slice(); }, clear: clear,
            dispose: function() { clear(); alive = false; }};
    }
    return {create: create};
});
