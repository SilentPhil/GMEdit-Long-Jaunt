/* Geometry port of GooWee's Control/Container/StackPanel/WrapPanel resize and
 * placement passes. Do not replace these with CSS/flexbox rules: REL uses the
 * parent's per-child base rectangle, and AUTO includes measured REL children. */
(function(root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.GooWeePreviewLayout = api;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";
    var AXES = ["width", "height"], POS = ["x", "y"];
    function kind(value) { return value && value.unit || "ABS"; }
    function isAuto(value) { return kind(value) === "AUTO" || kind(value) === "AUTOV"; }
    function factor(value) { return typeof value === "number" ? value : value && value.value; }
    function layout(nodes, options) {
        options = options || {};
        var scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
        var roots = nodes.filter(function(node) { return !node.parentId; });
        var parentBases = new WeakMap();
        var warned = Object.create(null);
        function warn(node, message) {
            node.approximate = true;
            var key = node.id + message;
            if (warned[key]) return;
            warned[key] = true;
            if (options.warn) options.warn(node.line, message);
        }
        function limited(node, value, dimension) {
            var limit = dimension ? 32768 : 1000000;
            if (!Number.isFinite(value) || Math.abs(value) > limit) {
                warn(node, (dimension ? "Size" : "Position") + " exceeds preview bounds and was clamped.");
                value = Number.isNaN(value) ? 0 : Math.max(-limit, Math.min(limit, value));
            }
            return dimension ? Math.max(0, value) : value;
        }
        function metric(node, value, fallback) {
            var v = factor(value);
            if (typeof v !== "number" || Number.isNaN(v)) { warn(node, "Unresolved layout unit: using a preview fallback."); return fallback; }
            return v;
        }
        function nodeScale(node) {
            var s = node.renderScale;
            return Number.isFinite(s) && s > 0 ? s : node._unitScale;
        }
        function considered(parent, child) { return !(parent.ignoreHiddenChildren && child.hidden); }
        function extent(parent, child, axis) {
            if (!considered(parent, child)) return 0;
            return child.marginActual[axis] + child._sizeActual[axis] + child.marginActual[axis + 2];
        }
        function margin(node, value, axis, base) {
            var v = metric(node, value, 0), k = kind(value);
            if (k === "REL") return v * base[AXES[axis]];
            if (k === "ABSV") return v * nodeScale(node);
            if (k === "AUTO" || k === "AUTOV") { warn(node, "GooWee does not support AUTO/AUTOV margins."); return 0; }
            return v;
        }
        function padding(node, value, axis) {
            var v = metric(node, value, 0), k = kind(value);
            if (k === "REL") { warn(node, "GooWee does not support REL padding."); return 0; }
            if (k === "ABSV" || k === "AUTOV") v *= nodeScale(node);
            return k === "AUTO" || k === "AUTOV" ? node[AXES[axis]] * v : v;
        }
        function inner(parent) {
            var p = parent.paddingActual;
            return {x: parent.x + p[0], y: parent.y + p[1], width: parent.width - p[0] - p[2], height: parent.height - p[1] - p[3]};
        }
        function wrapLines(parent) {
            var main = parent.orientation || 0, cross = 1 - main;
            // This is the outer layout extent in GooWee, not inner extent.
            var available = parent[AXES[main]], lines = [], line = {items: [], main: 0, cross: 0}, offset = 0;
            parent.children.forEach(function(child) {
                var m = extent(parent, child, main), c = extent(parent, child, cross);
                if (line.main + m > available) {
                    line.offset = offset; lines.push(line); offset += line.cross;
                    line = {items: [], main: 0, cross: 0};
                }
                line.items.push({node: child, offset: line.main, main: m, cross: c});
                line.main += m; line.cross = Math.max(line.cross, c);
            });
            line.offset = offset; lines.push(line);
            return {lines: lines, cross: offset + line.cross};
        }
        function wrapBases(parent) {
            var main = parent.orientation || 0, cross = 1 - main, grouped = wrapLines(parent), result = new Map();
            var content = inner(parent);
            grouped.lines.forEach(function(line) {
                line.items.forEach(function(item) {
                    var child = item.node, free = line.cross - item.cross;
                    var alignment = child.alignment[cross] || 0, justify = child.justify == null ? 1 : child.justify;
                    var rect = {x: content.x, y: content.y, width: content.width, height: content.height};
                    rect[POS[main]] += item.offset;
                    rect[POS[cross]] += line.offset + (justify - alignment) * free / 2;
                    rect[AXES[main]] -= line.main - item.main;
                    rect[AXES[cross]] -= grouped.cross - line.cross;
                    result.set(child, rect);
                });
            });
            return result;
        }
        function baseFor(parent, child, phase, wrapCache) {
            var base;
            if (!parent) base = {x: 0, y: 0, width: options.width || 1920, height: options.height || 1080};
            else {
                base = inner(parent);
                var type = parent.layoutType || parent.type;
                if (type === "StackPanel") {
                    var axis = parent.orientation === 0 ? 0 : 1, prefix = 0, others = 0, before = true;
                    parent.children.forEach(function(sibling) {
                        if (sibling === child) { before = false; return; }
                        var size = extent(parent, sibling, axis);
                        if (before) prefix += size;
                        others += size;
                    });
                    base[POS[axis]] += prefix;
                    base[AXES[axis]] -= others;
                } else if (type === "WrapPanel") {
                    if (!child._sizeActual[0] || !child._sizeActual[1]) {
                        base = {x: parent.x, y: parent.y, width: parent.width, height: parent.height};
                    } else base = (wrapCache || wrapBases(parent)).get(child) || base;
                }
                if (options.getBaseLayout) {
                    var override = options.getBaseLayout(parent, child, base, phase, function(node,value,axis) {
                        return margin(node,value,axis,parentBases.get(node) || {width:options.width || 1920,height:options.height || 1080});
                    });
                    if (override && ["x", "y", "width", "height"].every(function(key) { return Number.isFinite(override[key]); })) base = override;
                }
            }
            return base;
        }
        function intrinsic(node, axis) {
            var type = node.layoutType || node.type;
            if (type === "Label" || type === "Textbox") {
                if (!node._textMetrics) {
                    var style = node.style || {}, size = style.baseFontSize || (style.fontSize || 16) / scale;
                    if (options.measureText) node._textMetrics = options.measureText(String(node.text || ""), Object.assign({}, style, {fontSize: size}));
                    if (!node._textMetrics) {
                        var lines = String(node.text || "").split("\n"), height = size * 1.25;
                        node._textMetrics = {width: Math.max.apply(null, lines.map(function(line) { return line.length; })) * size * 0.55,
                            height: height + (height + 2) * (lines.length - 1)};
                    }
                }
                return node._textMetrics[AXES[axis]];
            }
            if (type === "Image") {
                var sprite = node.sprite, asset = sprite && (options.assets || {})[sprite.name];
                if (sprite && sprite.layers && Number.isFinite(sprite[AXES[axis]])) return sprite[AXES[axis]];
                if (asset && Number.isFinite(asset[AXES[axis]])) return asset[AXES[axis]];
                if (!sprite || !sprite.name) return 0;
                warn(node, "Sprite dimensions are unavailable; using a 48 px preview placeholder.");
                return 48;
            }
            var total = 0, maximum = 0;
            node.children.forEach(function(child) { var size = extent(node, child, axis); total += size; maximum = Math.max(maximum, size); });
            var content = type === "StackPanel" && node.orientation === axis ? total : maximum;
            if (type === "WrapPanel" && node.orientation !== axis) content = wrapLines(node).cross;
            if (!node.children.length && node.approximate && !/^(Canvas|CanvasSurface|CanvasScroll|CanvasDragScroll|Float|Panel|StackPanel|WrapPanel|Container|Button|Control)$/.test(type)) content = axis ? 40 : 120;
            return content + node.paddingActual[axis] + node.paddingActual[axis + 2];
        }
        function measureUnit(node, value, axis, base, fallback) {
            var k = kind(value), v = metric(node, value, fallback);
            if (k === "ABSV" || k === "AUTOV") v *= nodeScale(node);
            if (k === "AUTO" || k === "AUTOV") return intrinsic(node, axis) * v;
            if (k === "REL") return base[AXES[axis]] * v - node.marginActual[axis] - node.marginActual[axis + 2];
            return v;
        }
        function measureAxis(node, axis, base) {
            var min = node.size_min ? measureUnit(node, node.size_min[axis], axis, base, 0) : 0;
            var max = node.size_max ? measureUnit(node, node.size_max[axis], axis, base, Infinity) : Infinity;
            var value = measureUnit(node, node.size[axis], axis, base, axis ? 40 : 120);
            value = limited(node, Math.min(max, Math.max(min, value)), true);
            node._sizeActual[axis] = value; node[AXES[axis]] = value;
        }
        function autoRequired(node, axis) {
            return isAuto(node.size[axis]) || node.size_min && isAuto(node.size_min[axis]) || node.size_max && isAuto(node.size_max[axis]);
        }
        function relativeRequired(node, axis) {
            return kind(node.size[axis]) === "REL" || node.size_min && kind(node.size_min[axis]) === "REL" || node.size_max && kind(node.size_max[axis]) === "REL";
        }
        function hasAspect(node) { return node.aspectratio && typeof node.aspectratio[1] === "number" && node.aspectratio[1] >= 0; }
        function measureAspect(node, base) {
            var dependent = node.aspectratio[0] === 0 ? 0 : 1, driver = 1 - dependent, ratio = node.aspectratio[1];
            measureAxis(node, driver, base);
            if (ratio === 0) {
                var driverIntrinsic = intrinsic(node, driver);
                ratio = driverIntrinsic ? intrinsic(node, dependent) / driverIntrinsic : 0;
                if (!driverIntrinsic) warn(node, "Automatic aspect ratio has no intrinsic dimensions.");
            }
            node._sizeActual[dependent] = limited(node, node._sizeActual[driver] * ratio, true);
            node[AXES[dependent]] = node._sizeActual[dependent];
        }
        function resize(node, parent, depth) {
            if (depth > 80) { warn(node, "Layout nesting limit reached."); return; }
            var base = baseFor(parent, node, "resize");
            parentBases.set(node,base);
            node._sizeActual = [0, 0]; node.x = base.x; node.y = base.y;
            for (var axis = 0; axis < 2; axis++) if (!isAuto(node.size[axis])) node[AXES[axis]] = base[AXES[axis]];
            for (var edge = 0; edge < 4; edge++) {
                node.paddingActual[edge] = padding(node, node.padding[edge], edge % 2);
                node.marginActual[edge] = margin(node, node.margin[edge], edge % 2, base);
            }
            if (!hasAspect(node)) {
                for (axis = 0; axis < 2; axis++) if (!isAuto(node.size[axis])) measureAxis(node, axis, base);
            } else if (!isAuto(node.size[1 - node.aspectratio[0]])) measureAspect(node, base);
            node.children.forEach(function(child) { resize(child, node, depth + 1); });
            if (!hasAspect(node)) {
                for (axis = 0; axis < 2; axis++) if (autoRequired(node, axis)) measureAxis(node, axis, base);
            } else if (node.aspectratio[1] === 0 || autoRequired(node, 1 - node.aspectratio[0])) measureAspect(node, base);
            node.width = node._sizeActual[0]; node.height = node._sizeActual[1];
        }
        function place(node, parent, depth, wrapCache) {
            if (depth > 80) return;
            var autoPaddingChanged = false;
            for (var edge = 0; edge < 4; edge++) if (isAuto(node.padding[edge])) {
                node.paddingActual[edge] = padding(node, node.padding[edge], edge % 2);
                autoPaddingChanged = true;
            }
            var base = baseFor(parent, node, "place", wrapCache);
            parentBases.set(node,base);
            for (edge = 0; edge < 4; edge++) if (kind(node.margin[edge]) === "REL") node.marginActual[edge] = margin(node, node.margin[edge], edge % 2, base);
            function required(axis) { return relativeRequired(node, axis) || autoPaddingChanged && autoRequired(node, axis); }
            if (!hasAspect(node)) {
                for (var axis = 0; axis < 2; axis++) if (required(axis)) measureAxis(node, axis, base);
            } else if (required(1 - node.aspectratio[0]) || autoPaddingChanged && node.aspectratio[1] === 0) measureAspect(node, base);
            for (axis = 0; axis < 2; axis++) {
                var align = node.alignment[axis] || 0, m = node.marginActual;
                var offset = align === 1 ? (base[AXES[axis]] - node._sizeActual[axis] + m[axis] - m[axis + 2]) / 2
                    : align === 2 ? base[AXES[axis]] - node._sizeActual[axis] - m[axis + 2] : m[axis];
                node[POS[axis]] = limited(node, base[POS[axis]] + offset, false);
                if (node.positionRound !== false) {
                    node[POS[axis]] = Math.round(node[POS[axis]]);
                    node[AXES[axis]] = Math.round(node[AXES[axis]]);
                }
            }
            var childWrap = (node.layoutType || node.type) === "WrapPanel" ? wrapBases(node) : null;
            node.children.forEach(function(child) { place(child, node, depth + 1, childWrap); });
        }
        nodes.forEach(function(node) {
            node.children = node.children || []; node.size = node.size || [{unit: "REL", value: 1}, {unit: "REL", value: 1}];
            node.padding = node.padding || [0, 0, 0, 0]; node.margin = node.margin || [0, 0, 0, 0];
            node.alignment = node.alignment || [0, 0]; node.orientation = node.orientation === 0 ? 0 : 1;
            node.x = node.y = node.width = node.height = 0;
            node._sizeActual = [0, 0]; node.marginActual = [0, 0, 0, 0]; node.paddingActual = [0, 0, 0, 0];
            delete node._textMetrics;
        });
        // gw_Control.init preserves the first root canvas across ordinary nested
        // canvases. A separately rendered canvas resets this link. Its own bounds
        // are measured in view units, while its descendants use its render scale.
        function assignScale(node, rootCanvas, depth) {
            if (depth > 80) return;
            if (node.separateRender) rootCanvas = null;
            var canvasScale = rootCanvas && Number.isFinite(rootCanvas.canvasScale) ? Math.max(0, rootCanvas.canvasScale) : 1;
            node._unitScale = rootCanvas ? (rootCanvas.ignoreGuiScale ? 1 : scale) * canvasScale : scale;
            if (node.style) {
                if (!Number.isFinite(node.style.baseFontSize)) node.style.baseFontSize = (node.style.fontSize || 16) / scale;
                node.style.fontSize = Math.max(1, Math.min(512, node.style.baseFontSize * node._unitScale));
                if (Number.isFinite(node.style.baseTextClipWidth)) node.style.textClipWidth = node.style.baseTextClipWidth * node._unitScale;
                if (Number.isFinite(node.style.baseTextDrawOffsetX)) node.style.textDrawOffsetX = node.style.baseTextDrawOffsetX * node._unitScale;
            }
            var childRoot = rootCanvas;
            if (!childRoot && /^Canvas/.test(node.layoutType || node.type)) childRoot = node;
            node.children.forEach(function(child) { assignScale(child, childRoot, depth + 1); });
        }
        roots.forEach(function(node) { assignScale(node, null, 0); });
        roots.forEach(function(node) { resize(node, null, 0); place(node, null, 0); });
        nodes.forEach(function(node) { delete node._sizeActual; delete node._textMetrics; delete node._unitScale; });
        return roots;
    }
    return {layout: layout};
});
