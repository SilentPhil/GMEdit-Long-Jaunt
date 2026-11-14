(function(root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.GooWeePreviewRenderer = api;
})(typeof window !== "undefined" ? window : null, function() {
    "use strict";

    function color(value, fallback) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return "rgb(" + (value & 255) + "," + ((value >> 8) & 255) + "," + ((value >> 16) & 255) + ")";
        }
        return typeof value === "string" && /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([\d., %]+\)|[a-z]+)$/i.test(value) ? value : fallback;
    }

    function create(canvas, resolveSprite, invalidate, fonts, exportContext) {
        var ctx = canvas.getContext("2d");
        var images = new Map(), usedImages = new Set(), tints = new Map(), tintPixels = 0;
        var tiles = [], tilePixels = 0, nineSliceScale = 1, imageRevision = exportContext ? exportContext.revision : Date.now();
        var composites = new Map(), compositePixels = 0, compositeId = 0;
        var compositeFrame = new WeakMap(), compositeFrameSurfaces = new WeakSet(), compositeWork = 0, compositeFramePixels = 0;
        var alive = true, sharpPixels = false, painted = [], paintedDepths = [], paintedClips = [], paintedBounds = [], transform = {scale: 1, x: 0, y: 0};
        var colorCanvas = document.createElement("canvas");
        var sliceCanvas = document.createElement("canvas"), sliceContext = sliceCanvas.getContext("2d");
        colorCanvas.width = colorCanvas.height = 1;
        var colorContext = colorCanvas.getContext("2d", {willReadFrequently: true});
        function rgb(value) {
            colorContext.clearRect(0, 0, 1, 1);
            colorContext.fillStyle = "#ffffff";
            colorContext.fillStyle = color(value, "#ffffff");
            colorContext.fillRect(0, 0, 1, 1);
            return colorContext.getImageData(0, 0, 1, 1).data;
        }
        function imageFor(asset) {
            if (!asset || !asset.url) return null;
            usedImages.add(asset.url);
            var item = images.get(asset.url);
            if (!item) {
                var img = new Image();
                item = {image: img, ready: false};
                item.pending = new Promise(function(resolve) { item.complete = resolve; });
                images.set(asset.url, item);
                img.onload = function() { item.ready = true; item.complete(); if (alive) invalidate(); };
                img.onerror = function() { item.failed = true; item.complete(); if (alive) invalidate(); };
                var imageURL = asset.url;
                if (/^(?:file|https?):/i.test(imageURL)) {
                    // Refresh must also bypass Chromium's decoded-image cache when
                    // a sprite file changes without changing its resource URL.
                    try { var freshURL = new URL(imageURL); freshURL.searchParams.set("goowee-preview", String(imageRevision)); imageURL = freshURL.href; } catch (_) { }
                }
                img.src = imageURL;
            }
            return item.ready ? item.image : null;
        }
        function tinted(image, asset, tint, blend) {
            var a = rgb(tint), b = rgb(blend);
            var red = a[0] * b[0] / 255, green = a[1] * b[1] / 255, blue = a[2] * b[2] / 255;
            if (red === 255 && green === 255 && blue === 255) return image;
            var key = asset.url + ":" + red + "," + green + "," + blue;
            if (tints.has(key)) return tints.get(key);
            var width = image.naturalWidth || image.width, height = image.naturalHeight || image.height, pixels = width * height;
            if (!pixels || pixels > 8 * 1024 * 1024) return image;
            try {
                var surface = document.createElement("canvas");
                surface.width = width; surface.height = height;
                var target = surface.getContext("2d", {willReadFrequently: true});
                target.drawImage(image, 0, 0);
                var data = target.getImageData(0, 0, width, height), bytes = data.data;
                // Multiply straight RGB; preserve alpha, including antialiased edges.
                for (var i = 0; i < bytes.length; i += 4) {
                    bytes[i] *= red / 255; bytes[i + 1] *= green / 255; bytes[i + 2] *= blue / 255;
                }
                target.putImageData(data, 0, 0);
                while (tints.size && (tintPixels + pixels > 8 * 1024 * 1024 || tints.size >= 64)) {
                    var oldest = tints.keys().next().value, previous = tints.get(oldest);
                    tintPixels -= previous.width * previous.height;
                    tints.delete(oldest);
                }
                tints.set(key, surface); tintPixels += pixels;
                return surface;
            } catch (_) { return image; } // Images inaccessible to canvas still render without tint.
        }
        function tileFor(image, url, sx, sy, sw, sh, repeatX, repeatY, mirror) {
            var key = [sx, sy, sw, sh, repeatX, repeatY, mirror].join(":");
            var index = tiles.findIndex(function(item) { return item.image === image && item.key === key; });
            if (index >= 0) {
                var found = tiles.splice(index, 1)[0]; tiles.push(found);
                return found.surface;
            }
            // Only the middle column/row repeats. Along a fixed axis, provide
            // neighboring source texels for filtering, clamped at the sprite edge.
            // Repeating that axis would blend the opposite outside edge into a cut.
            var px = repeatX ? 0 : 1, py = repeatY ? 0 : 1;
            var cell = document.createElement("canvas");
            cell.width = sw + px * 2; cell.height = sh + py * 2;
            var target = cell.getContext("2d");
            var iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
            var left = Math.min(px, sx), top = Math.min(py, sy);
            var right = Math.min(px, iw - sx - sw), bottom = Math.min(py, ih - sy - sh);
            target.drawImage(image, sx - left, sy - top, sw + left + right, sh + top + bottom,
                px - left, py - top, sw + left + right, sh + top + bottom);
            if (left < px) target.drawImage(cell, px, 0, 1, cell.height, 0, 0, px, cell.height);
            if (right < px) target.drawImage(cell, px + sw - 1, 0, 1, cell.height, px + sw, 0, px, cell.height);
            if (top < py) target.drawImage(cell, 0, py, cell.width, 1, 0, 0, cell.width, py);
            if (bottom < py) target.drawImage(cell, 0, py + sh - 1, cell.width, 1, 0, py + sh, cell.width, py);
            var surface = cell;
            if (mirror && (repeatX || repeatY)) {
                surface = document.createElement("canvas");
                var nx = repeatX ? 2 : 1, ny = repeatY ? 2 : 1;
                surface.width = cell.width * nx; surface.height = cell.height * ny;
                target = surface.getContext("2d");
                for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) {
                    target.save();
                    target.translate(x ? cell.width * 2 : 0, y ? cell.height * 2 : 0);
                    target.scale(x ? -1 : 1, y ? -1 : 1);
                    target.drawImage(cell, 0, 0);
                    target.restore();
                }
            }
            var pixels = surface.width * surface.height;
            if (pixels <= 8 * 1024 * 1024) {
                while (tiles.length && (tilePixels + pixels > 8 * 1024 * 1024 || tiles.length >= 96)) tilePixels -= tiles.shift().pixels;
                tiles.push({image: image, url: url, key: key, surface: surface, pixels: pixels}); tilePixels += pixels;
            }
            return surface;
        }
        function slice(target, image, url, sx, sy, sw, sh, dx, dy, dw, dh, mode, scale, middleX, middleY, fixedScaleX, fixedScaleY) {
            if (!(sw > 0 && sh > 0 && dw > 0 && dh > 0) || mode === 4) return;
            var tiled = mode === 1 || mode === 2, blank = mode === 3;
            var repeatX = tiled && middleX, repeatY = tiled && middleY;
            var scaleX = middleX ? (!tiled && !blank ? dw / sw : scale) : fixedScaleX;
            var scaleY = middleY ? (!tiled && !blank ? dh / sh : scale) : fixedScaleY;
            if (!(scaleX > 0 && scaleY > 0)) return;
            if (blank) {
                dw = Math.min(dw, sw * scaleX); dh = Math.min(dh, sh * scaleY);
            }
            // CanvasPattern keeps tiny repeat regions cheap even in large panels.
            var tile = tileFor(image, url, sx, sy, sw, sh, repeatX, repeatY, mode === 2);
            var pattern = target.createPattern(tile, repeatX ? (repeatY ? "repeat" : "repeat-x") : (repeatY ? "repeat-y" : "no-repeat"));
            if (!pattern) return;
            var px = repeatX ? 0 : 1, py = repeatY ? 0 : 1;
            target.save();
            target.translate(dx - px * scaleX, dy - py * scaleY); target.scale(scaleX, scaleY);
            target.fillStyle = pattern; target.fillRect(px, py, dw / scaleX, dh / scaleY);
            target.restore();
        }
        function compositeFor(spec, depth) {
            depth=depth || 0;
            if(!spec || typeof spec!=="object")return null;
            if(compositeFrame.has(spec))return compositeFrame.get(spec);
            // Mark before visiting children: surface snapshots can share whole
            // subgraphs, and malformed project data must not create a cycle.
            compositeFrame.set(spec,null);
            if(depth>16 || !Array.isArray(spec.layers) || spec.layers.length>256 || !Number.isFinite(spec.width) || !Number.isFinite(spec.height) || spec.width<=0 || spec.height<=0 || spec.width>2048 || spec.height>2048)return null;
            compositeWork+=1+spec.layers.length;if(compositeWork>16384)return null;
            var ready=true;
            var layers=spec.layers.map(function(layer){
                if(!layer || typeof layer!=="object"){ready=false;return null;}
                if(layer.fill)return {layer:layer};
                if(!layer.sprite || typeof layer.sprite!=="object"){ready=false;return null;}
                var child=layer.sprite.layers?compositeFor(layer.sprite,depth+1):null;
                var asset=child?child.asset:layer.sprite.layers?null:resolveSprite(layer.sprite.name,layer.sprite.index || 0), source=child?child.image:imageFor(asset);
                if(!source)ready=false;
                return {layer:layer,asset:asset,source:source};
            });
            if(!ready)return null;
            var key=JSON.stringify([sharpPixels,spec.width,spec.height,spec.originX,spec.originY,layers.map(function(item){
                var layer=Object.assign({},item.layer);if(layer.sprite)layer.sprite={url:item.asset.url,index:layer.sprite.index,color:layer.sprite.color,alpha:layer.sprite.alpha};return layer;
            })]);
            var pixels=Math.ceil(spec.width)*Math.ceil(spec.height);
            if(composites.has(key)){
                var cached=composites.get(key);
                if(!compositeFrameSurfaces.has(cached.image)){
                    if(compositeFramePixels+pixels>8*1024*1024)return null;
                    compositeFrameSurfaces.add(cached.image);compositeFramePixels+=pixels;
                }
                compositeFrame.set(spec,cached);return cached;
            }
            if(compositeFramePixels+pixels>8*1024*1024)return null;
            var surface=document.createElement("canvas");surface.width=Math.ceil(spec.width);surface.height=Math.ceil(spec.height);
            var target=surface.getContext("2d");
            target.imageSmoothingEnabled = !sharpPixels;
            layers.forEach(function(item){
                var layer=item.layer;
                if(layer.fill){target.globalAlpha=layer.alpha;target.fillStyle=layer.fill;target.fillRect(layer.x,layer.y,layer.width,layer.height);return;}
                target.save();
                target.globalAlpha=Number.isFinite(layer.sprite.alpha)?Math.max(0,Math.min(1,layer.sprite.alpha)):1;
                if(layer.matrix)target.transform.apply(target,layer.matrix);
                target.translate(layer.x,layer.y);target.rotate(-(layer.angle || 0)*Math.PI/180);
                target.scale(layer.scaleX==null?1:layer.scaleX,layer.scaleY==null?1:layer.scaleY);
                var source=tinted(item.source,item.asset,layer.sprite.color,"#ffffff"),crop=layer.crop;
                if(crop)target.drawImage(source,crop.x,crop.y,crop.width,crop.height,-(layer.originX || 0),-(layer.originY || 0),layer.width,layer.height);
                else target.drawImage(source,-(layer.originX || 0),-(layer.originY || 0),layer.width,layer.height);
                target.restore();
            });
            var value={image:surface,asset:{url:"preview-layers:"+(++compositeId),width:spec.width,height:spec.height,originX:spec.originX || 0,originY:spec.originY || 0}};
            while(composites.size && (compositePixels+pixels>8*1024*1024 || composites.size>=64)){
                var oldest=composites.keys().next().value, previous=composites.get(oldest);
                compositePixels-=previous.image.width*previous.image.height;composites.delete(oldest);
            }
            composites.set(key,value);compositePixels+=pixels;compositeFrame.set(spec,value);
            compositeFrameSurfaces.add(surface);compositeFramePixels+=pixels;return value;
        }
        function sprite(spec, node, foreground) {
            if (!spec) return false;
            var composite=spec.layers ? compositeFor(spec) : null;
            var asset = composite ? composite.asset : spec.layers ? null : resolveSprite(spec.name, spec.index || 0);
            var source = composite ? composite.image : imageFor(asset);
            if (!source) return false;
            // GooWee draws background_image without passing the element style.
            var style = foreground ? node.style || {} : {};
            var img = tinted(source, asset, spec.color, style.additionalColorBlend);
            ctx.save();
            ctx.imageSmoothingEnabled = !sharpPixels;
            ctx.globalAlpha *= Number.isFinite(spec.alpha) ? Math.max(0, Math.min(1, spec.alpha)) : 1;
            if (Number.isFinite(style.spriteAlpha) && style.spriteAlpha >= 0) ctx.globalAlpha *= Math.min(1, style.spriteAlpha);
            // GooWee offsets draw_sprite_ext by the asset origin before applying its
            // extra scale, horizontal flip and GameMaker's counterclockwise angle.
            var extraScale = Number.isFinite(spec.scale) ? spec.scale : 1;
            var angle = Number.isFinite(style.angle) ? style.angle : 0;
            if (extraScale !== 1 || style.flipHorizontal || angle) {
                var originX = Number.isFinite(asset.originX) ? asset.originX : 0;
                var originY = Number.isFinite(asset.originY) ? asset.originY : 0;
                var pivotX = node.x + originX * node.width / (asset.width || source.naturalWidth);
                var pivotY = node.y + originY * node.height / (asset.height || source.naturalHeight);
                ctx.translate(pivotX, pivotY);
                ctx.rotate(-angle * Math.PI / 180);
                ctx.scale(style.flipHorizontal ? -extraScale : extraScale, extraScale);
                ctx.translate(-pivotX, -pivotY);
            }
            // Border and tile sizes follow GooWee's global GUI NineSlice scale.
            var ns = asset.nineSlice;
            if (ns && ns.enabled !== false && node.width > 0 && node.height > 0) {
                var sw = source.naturalWidth, sh = source.naturalHeight;
                var l = Math.max(0, Math.min(ns.left || 0, sw)), r = Math.max(0, Math.min(ns.right || 0, sw - l));
                var t = Math.max(0, Math.min(ns.top || 0, sh)), b = Math.max(0, Math.min(ns.bottom || 0, sh - t));
                var sx = [0, l, sw - r], sy = [0, t, sh - b];
                var borderScale = nineSliceScale * (Number.isFinite(spec.scale9) && spec.scale9 >= 0 ? spec.scale9 : 1);
                // When smaller than its borders, GameMaker clips left/top first,
                // then right/bottom, instead of shrinking the source corners.
                var dl = Math.min(node.width, l * borderScale), dr = Math.min(node.width - dl, r * borderScale);
                var dt = Math.min(node.height, t * borderScale), db = Math.min(node.height - dt, b * borderScale);
                var dx = [0, dl, node.width - dr, node.width];
                var dy = [0, dt, node.height - db, node.height];
                var nativeWidths = [l, sw - l - r, r], nativeHeights = [t, sh - t - b, b];
                // Rasterize shared cuts on one pixel grid, then transform and
                // composite the complete sprite once. Separately antialiased
                // rectangles create gaps/overlap at fractional NineSlice cuts.
                // A bounded surface also keeps rotated/flipped sprites seamless.
                var matrix = ctx.getTransform();
                var desiredScale = Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d));
                var rasterBox = {left: 0, top: 0, right: node.width, bottom: node.height};
                if (sharpPixels && desiredScale > 0) {
                    // Crop the intermediate to the visible part, rather than
                    // downsampling a whole zoomed panel. Otherwise the second
                    // nearest-neighbor resize gives source pixels uneven widths.
                    // Inverse corners also cover rotated and flipped sprites.
                    var inverse = matrix.inverse();
                    var corners = [[0,0],[canvas.width,0],[0,canvas.height],[canvas.width,canvas.height]].map(function(point) {
                        return {x: inverse.a*point[0]+inverse.c*point[1]+inverse.e-node.x,
                            y: inverse.b*point[0]+inverse.d*point[1]+inverse.f-node.y};
                    });
                    rasterBox.left = Math.max(0,Math.min.apply(null,corners.map(function(point) { return point.x; })));
                    rasterBox.top = Math.max(0,Math.min.apply(null,corners.map(function(point) { return point.y; })));
                    rasterBox.right = Math.min(node.width,Math.max.apply(null,corners.map(function(point) { return point.x; })));
                    rasterBox.bottom = Math.min(node.height,Math.max.apply(null,corners.map(function(point) { return point.y; })));
                }
                var rasterWidth = rasterBox.right-rasterBox.left, rasterHeight = rasterBox.bottom-rasterBox.top;
                if (!(rasterWidth > 0 && rasterHeight > 0)) { ctx.restore(); return true; }
                var rasterScale = Math.min(desiredScale,8192/rasterWidth,8192/rasterHeight,Math.sqrt(8*1024*1024/(rasterWidth*rasterHeight)));
                if (!(rasterScale > 0)) { ctx.restore(); return true; }
                var rasterLeft = Math.floor(rasterBox.left*rasterScale), rasterTop = Math.floor(rasterBox.top*rasterScale);
                sliceCanvas.width = Math.max(1,Math.ceil(rasterBox.right*rasterScale)-rasterLeft);
                sliceCanvas.height = Math.max(1,Math.ceil(rasterBox.bottom*rasterScale)-rasterTop);
                sliceContext.imageSmoothingEnabled = !sharpPixels;
                sliceContext.translate(-rasterLeft,-rasterTop);
                var rasterX = dx.map(function(value, i) { return i === 0 || i === 3 ? value*rasterScale : Math.round(value*rasterScale); });
                var rasterY = dy.map(function(value, i) { return i === 0 || i === 3 ? value*rasterScale : Math.round(value*rasterScale); });
                // A rounded cut may not extend beyond a very small target.
                for (var cut = 1; cut < 3; cut++) {
                    rasterX[cut] = Math.min(rasterX[3],rasterX[cut]); rasterY[cut] = Math.min(rasterY[3],rasterY[cut]);
                }
                for (var iy = 0; iy < 3; iy++) for (var ix = 0; ix < 3; ix++) {
                    // Tile modes are left, top, right, bottom, centre; corners stretch.
                    var region = ix === 1 ? (iy === 0 ? 1 : iy === 2 ? 3 : 4) : iy === 1 ? (ix === 0 ? 0 : 2) : -1;
                    var mode = region >= 0 && ns.tileMode ? ns.tileMode[region] : 0;
                    var dw = rasterX[ix+1]-rasterX[ix], dh = rasterY[iy+1]-rasterY[iy];
                    slice(sliceContext, img, asset.url, sx[ix], sy[iy], nativeWidths[ix], nativeHeights[iy],
                        rasterX[ix],rasterY[iy],dw,dh,mode,borderScale*rasterScale,ix === 1,iy === 1,
                        borderScale*dw/(dx[ix+1]-dx[ix]),borderScale*dh/(dy[iy+1]-dy[iy]));
                }
                ctx.drawImage(sliceCanvas,node.x+rasterLeft/rasterScale,node.y+rasterTop/rasterScale,sliceCanvas.width/rasterScale,sliceCanvas.height/rasterScale);
            } else ctx.drawImage(img, node.x, node.y, node.width, node.height);
            ctx.restore();
            return true;
        }
        function intersect(a, b) {
            if (!a) return {x:b.x,y:b.y,width:b.width,height:b.height};
            var x = Math.max(a.x,b.x), y = Math.max(a.y,b.y);
            return {x:x,y:y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)};
        }
        function applyClip(rect) {
            ctx.beginPath(); ctx.rect(rect.x,rect.y,rect.width,rect.height); ctx.clip();
        }
        function drawCommands(commands, node) {
            var ready = true;
            ctx.save();
            ctx.translate(node.x, node.y);
            commands.forEach(function(layer) {
                if (!layer) return;
                var spec = layer.sprite, composite = spec && spec.layers ? compositeFor(spec) : null;
                var asset = composite ? composite.asset : spec && !spec.layers ? resolveSprite(spec.name, spec.index || 0) : null;
                var source = composite ? composite.image : asset && imageFor(asset);
                if (!layer.fill && !source) { ready = false; return; }
                ctx.save();
                ctx.imageSmoothingEnabled = !sharpPixels;
                if (layer.matrix) ctx.transform.apply(ctx, layer.matrix);
                ctx.translate(layer.x || 0, layer.y || 0);
                ctx.rotate(-(layer.angle || 0) * Math.PI / 180);
                var sx = layer.scaleX == null ? 1 : layer.scaleX, sy = layer.scaleY == null ? 1 : layer.scaleY;
                var ox = layer.originX || 0, oy = layer.originY || 0;
                if (layer.fill) {
                    ctx.scale(sx, sy);
                    ctx.globalAlpha *= Number.isFinite(layer.alpha) ? Math.max(0, Math.min(1, layer.alpha)) : 1;
                    ctx.fillStyle = color(layer.fill, "#ffffff");
                    ctx.fillRect(-ox, -oy, layer.width, layer.height);
                } else if (asset.nineSlice && !layer.crop && sx && sy) {
                    // draw_sprite_ext stretches NineSlice geometry, while its
                    // borders retain the current GUI scale before world transforms.
                    ctx.scale(Math.sign(sx), Math.sign(sy));
                    sprite(Object.assign({}, spec, {scale: 1}), {x: -ox * Math.abs(sx), y: -oy * Math.abs(sy),
                        width: layer.width * Math.abs(sx), height: layer.height * Math.abs(sy)}, false);
                } else {
                    ctx.scale(sx, sy);
                    ctx.globalAlpha *= Number.isFinite(spec.alpha) ? Math.max(0, Math.min(1, spec.alpha)) : 1;
                    var image = tinted(source, asset, spec.color, "#ffffff"), crop = layer.crop;
                    if (crop) ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, -ox, -oy, layer.width, layer.height);
                    else ctx.drawImage(image, -ox, -oy, layer.width, layer.height);
                }
                ctx.restore();
            });
            ctx.restore();
            return ready;
        }
        function commandBounds(layer, node) {
            if (!layer || (!layer.fill && !layer.sprite)) return null;
            var alpha = layer.fill ? layer.alpha : layer.sprite.alpha;
            if (Number.isFinite(alpha) && alpha <= 0 || Number.isFinite(node.alpha) && node.alpha <= 0) return null;
            var sx = layer.scaleX == null ? 1 : layer.scaleX, sy = layer.scaleY == null ? 1 : layer.scaleY;
            var angle = -(layer.angle || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
            var matrix = layer.matrix || [1, 0, 0, 1, 0, 0], points = [];
            [0, layer.width].forEach(function(x) { [0, layer.height].forEach(function(y) {
                var dx = (x - (layer.originX || 0)) * sx, dy = (y - (layer.originY || 0)) * sy;
                var px = (layer.x || 0) + dx * cos - dy * sin, py = (layer.y || 0) + dx * sin + dy * cos;
                points.push({x: node.x + matrix[0] * px + matrix[2] * py + matrix[4],
                    y: node.y + matrix[1] * px + matrix[3] * py + matrix[5]});
            }); });
            var left = Math.min.apply(null, points.map(function(p) { return p.x; }));
            var top = Math.min.apply(null, points.map(function(p) { return p.y; }));
            var right = Math.max.apply(null, points.map(function(p) { return p.x; }));
            var bottom = Math.max.apply(null, points.map(function(p) { return p.y; }));
            return Number.isFinite(left + top + right + bottom) && right > left && bottom > top ? {x: left, y: top, width: right - left, height: bottom - top} : null;
        }
        function capturedBounds(node) {
            var result = [];
            [node.backgroundDraws, node.spriteDraws].forEach(function(commands) {
                if (Array.isArray(commands)) commands.forEach(function(layer) {
                    var rect = commandBounds(layer, node);
                    if (rect) result.push(rect);
                });
            });
            return result;
        }
        function unionBounds(rects) {
            var left = Math.min.apply(null, rects.map(function(rect) { return rect.x; }));
            var top = Math.min.apply(null, rects.map(function(rect) { return rect.y; }));
            return {x: left, y: top,
                width: Math.max.apply(null, rects.map(function(rect) { return rect.x + rect.width; })) - left,
                height: Math.max.apply(null, rects.map(function(rect) { return rect.y + rect.height; })) - top};
        }
        function spriteBounds(spec, node, foreground) {
            var asset = spec.layers ? spec : resolveSprite(spec.name, spec.index || 0);
            if (!asset) return node;
            var style = foreground ? node.style || {} : {};
            var scale = Number.isFinite(spec.scale) ? spec.scale : 1;
            var angle = Number.isFinite(style.angle) ? -style.angle * Math.PI / 180 : 0;
            if (scale === 1 && !style.flipHorizontal && !angle) return node;
            var image = images.get(asset.url), source = image && image.ready && image.image;
            var width = asset.width || source && source.naturalWidth || node.width;
            var height = asset.height || source && source.naturalHeight || node.height;
            var px = node.x + (asset.originX || 0) * node.width / width;
            var py = node.y + (asset.originY || 0) * node.height / height;
            var cos = Math.cos(angle), sin = Math.sin(angle), points = [];
            [0, node.width].forEach(function(x) { [0, node.height].forEach(function(y) {
                var dx = (node.x + x - px) * scale * (style.flipHorizontal ? -1 : 1);
                var dy = (node.y + y - py) * scale;
                points.push({x: px + dx * cos - dy * sin, y: py + dx * sin + dy * cos});
            }); });
            var left = Math.min.apply(null, points.map(function(p) { return p.x; }));
            var top = Math.min.apply(null, points.map(function(p) { return p.y; }));
            return {x: left, y: top,
                width: Math.max.apply(null, points.map(function(p) { return p.x; })) - left,
                height: Math.max.apply(null, points.map(function(p) { return p.y; })) - top};
        }
        function textOrigin(node, metrics) {
            var style = node.style || {};
            return {x: node.x + (Number.isFinite(style.textDrawOffsetX) ? style.textDrawOffsetX : 0) +
                (style.alignH === 1 || style.alignH === "center" ? (node.width - metrics.width) / 2 : style.alignH === 2 || style.alignH === "right" ? node.width - metrics.width : 0),
                y: node.y + (style.alignV === 1 || style.alignV === "center" ? (node.height - metrics.height) / 2 : style.alignV === 2 || style.alignV === "bottom" ? node.height - metrics.height : 0)};
        }
        function textBounds(node) {
            var style = node.style || {}, rect = node;
            if (fonts && fonts.inkBounds && style.fontResource) {
                var origin = textOrigin(node, fonts.measure(String(node.text), style));
                rect = fonts.inkBounds(String(node.text), origin.x, origin.y, style) || node;
            }
            if (Number.isFinite(style.textClipWidth)) {
                var left = Math.max(rect.x, node.x), right = Math.min(rect.x + rect.width, node.x + Math.max(0, style.textClipWidth));
                rect = {x: left, y: rect.y, width: Math.max(0, right - left), height: rect.height};
            }
            return rect;
        }
        function manuallyHiddenNodes(scene, ids) {
            var hidden = new Set();
            if (!ids || !ids.size) return hidden;
            var all = new Set(), byId = new Map(), children = new Map();
            var pending = (scene.nodes || []).concat(scene.roots || []);
            while (pending.length) {
                var node = pending.pop();
                if (!node || all.has(node)) continue;
                all.add(node); byId.set(node.id, node);
                children.set(node, new Set(node.children || []));
                (node.children || []).forEach(function(child) { pending.push(child); });
            }
            // Some separately rendered canvases are also roots. Their logical
            // parent still owns their visibility, irrespective of paint order.
            all.forEach(function(node) {
                var parent = byId.get(node.parentId);
                if (parent) children.get(parent).add(node);
                if (ids.has(node.id)) pending.push(node);
            });
            while (pending.length) {
                var current = pending.pop();
                if (!current || hidden.has(current)) continue;
                hidden.add(current);
                var nested = children.get(current);
                if (nested) nested.forEach(function(child) { pending.push(child); });
            }
            return hidden;
        }
        function bounds(scene, contentOnly, excluded) {
            var nodes = [], visited = new Set();
            function include(rect, clip) {
                var visible = intersect(clip, rect);
                if (visible.width > 0 && visible.height > 0) nodes.push(visible);
            }
            function visit(n, clip) {
                if (n.hidden || excluded && excluded.has(n) || visited.has(n)) return;
                visited.add(n);
                var visible = intersect(clip,n);
                if (!contentOnly) include(n, clip);
                else {
                    if (n.background && !Array.isArray(n.backgroundDraws)) include(spriteBounds(n.background, n, false), clip);
                    if (n.sprite && !Array.isArray(n.spriteDraws)) include(spriteBounds(n.sprite, n, true), clip);
                    if (n.runtimePlaceholder) include(n, clip);
                }
                capturedBounds(n).forEach(function(rect) { include(rect, clip); });
                if (n.text != null && n.text !== "") include(textBounds(n), clip);
                var childClip = n.clipChildren ? visible : clip;
                if (childClip && !(childClip.width > 0 && childClip.height > 0)) return;
                (n.children || []).forEach(function(child) { visit(child,childClip); });
            }
            scene.roots.forEach(function(node) { visit(node,null); });
            if (!nodes.length) {
                if (contentOnly) throw new Error("There is no visible interface to copy.");
                return {x: 0, y: 0, width: scene.width, height: scene.height};
            }
            var x = Math.min.apply(null, nodes.map(function(n) { return n.x; }));
            var y = Math.min.apply(null, nodes.map(function(n) { return n.y; }));
            return {x: x, y: y,
                width: Math.max(1, Math.max.apply(null, nodes.map(function(n) { return n.x + n.width; })) - x),
                height: Math.max(1, Math.max.apply(null, nodes.map(function(n) { return n.y + n.height; })) - y)};
        }
        function render(scene, options) {
            sharpPixels = options.sharpPixels === true;
            compositeFrame=new WeakMap();compositeFrameSurfaces=new WeakSet();compositeWork=0;compositeFramePixels=0;
            var reference = options.reference, referenceImage = reference && reference.image;
            var referenceWidth = referenceImage && (referenceImage.naturalWidth || referenceImage.width);
            var referenceHeight = referenceImage && (referenceImage.naturalHeight || referenceImage.height);
            reference = referenceWidth > 0 && referenceHeight > 0 ? reference : null;
            var hasScene = scene && scene.roots && scene.roots.length;
            if (!hasScene && reference) scene = {roots: [], width: referenceWidth, height: referenceHeight};
            var manuallyHidden = manuallyHiddenNodes(scene, options.hiddenNodeIds);
            nineSliceScale = Number.isFinite(scene.guiScale) && scene.guiScale > 0 ? scene.guiScale : 1;
            var exporting = !!exportContext;
            var contentBox = reference ? bounds(scene) : null;
            var referenceBox = reference ? {x: exporting ? 0 : contentBox.x + (Number.isFinite(reference.x) ? reference.x : 0),
                y: exporting ? 0 : contentBox.y + (Number.isFinite(reference.y) ? reference.y : 0), width: referenceWidth, height: referenceHeight} : null;
            // Hiding is a view filter: layout, Fit and reference alignment stay
            // fixed. The exported image is cropped to the remaining visible UI.
            var box = exporting ? referenceBox || bounds(scene, true, manuallyHidden) : options.viewport ? {x: 0, y: 0, width: scene.width, height: scene.height} : contentBox || bounds(scene);
            if (exporting) {
                var right = Math.ceil(box.x + box.width), bottom = Math.ceil(box.y + box.height);
                box = {x: Math.floor(box.x), y: Math.floor(box.y), width: right - Math.floor(box.x), height: bottom - Math.floor(box.y)};
            }
            var pad = exporting ? 0 : 16;
            var scale = exporting ? 1 : options.scale || Math.min((options.width - 2 * pad) / box.width, (options.height - 2 * pad) / box.height, 2);
            scale = Math.max(0.02, scale);
            var w = exporting ? box.width : Math.max(options.width, Math.ceil(box.width * scale + 2 * pad));
            var h = exporting ? box.height : Math.max(options.height, Math.ceil(box.height * scale + 2 * pad));
            // Keep comparison aligned with the original camera, even when the
            // reference is larger or shifted. Only extend the scrollable surface.
            if (reference && !exporting) {
                w = Math.max(w, Math.ceil((referenceBox.x + referenceBox.width - box.x) * scale + 2 * pad));
                h = Math.max(h, Math.ceil((referenceBox.y + referenceBox.height - box.y) * scale + 2 * pad));
            }
            if (exporting && (!Number.isFinite(w * h) || w > 8192 || h > 8192 || w * h > 16777216)) {
                throw new Error("The interface is too large to copy at original size (maximum 8192 px per side and 16 megapixels).");
            }
            // The editor supplies a scrollable spacer and a sticky canvas. Draw
            // only its visible viewport at display resolution: shrinking a huge
            // zoomed backing store and stretching it with CSS blurs both the
            // sprites and the text, even with image smoothing disabled.
            var surface = !exporting && options.surface;
            var rasterWidth = w, rasterHeight = h, scrollX = 0, scrollY = 0;
            if (surface) {
                surface.container.style.width = w + "px";
                surface.container.style.height = h + "px";
                rasterWidth = Math.min(w, options.width); rasterHeight = Math.min(h, options.height);
            }
            // Standalone renders and very large displays still have bounded memory.
            var dpr = exporting ? 1 : Math.min(window.devicePixelRatio || 1, 2, 8192 / rasterWidth, 8192 / rasterHeight, Math.sqrt(16777216 / (rasterWidth * rasterHeight)));
            canvas.width = Math.max(1, Math.ceil(rasterWidth * dpr));
            canvas.height = Math.max(1, Math.ceil(rasterHeight * dpr));
            canvas.style.width = rasterWidth + "px";
            canvas.style.height = rasterHeight + "px";
            if (surface) {
                // Read after resizing: zooming out can clamp the scroll position.
                scrollX = surface.viewport.scrollLeft; scrollY = surface.viewport.scrollTop;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (!exporting) { ctx.fillStyle = "#20252d"; ctx.fillRect(0, 0, rasterWidth, rasterHeight); }
            transform = {scale: scale,
                x: pad - box.x * scale + (!exporting && Number.isFinite(options.panX) ? options.panX : 0) - scrollX,
                y: pad - box.y * scale + (!exporting && Number.isFinite(options.panY) ? options.panY : 0) - scrollY};
            ctx.translate(transform.x, transform.y);
            ctx.scale(scale, scale);
            ctx.strokeStyle = "#4b535f";
            ctx.lineWidth = 1 / scale;
            if (!exporting && !reference) ctx.strokeRect(box.x, box.y, box.width, box.height);
            painted = []; paintedDepths = []; paintedClips = []; paintedBounds = [];
            if (reference) {
                ctx.imageSmoothingEnabled = !sharpPixels;
                ctx.drawImage(referenceImage, referenceBox.x, referenceBox.y, referenceBox.width, referenceBox.height);
                // Preserve decoded GUI assets for switching back, but expose no
                // hidden scene elements to hover/selection while comparing.
                return {scale: scale, bounds: box, x: transform.x, y: transform.y};
            }
            var visited = new Set();
            usedImages.clear();
            function drawNode(node, depth, clip) {
                if (node.hidden || manuallyHidden.has(node) || visited.has(node)) return;
                visited.add(node);
                ctx.save();
                if (Number.isFinite(node.alpha)) ctx.globalAlpha *= Math.max(0, Math.min(1, node.alpha));
                var hasBackground = Array.isArray(node.backgroundDraws) ? drawCommands(node.backgroundDraws, node) : sprite(node.background, node, false);
                var hasSprite = Array.isArray(node.spriteDraws) ? drawCommands(node.spriteDraws, node) : sprite(node.sprite, node, true);
                ctx.restore();
                // GooWee containers (including an icon's Button parent) are
                // transparent unless they explicitly draw a background or sprite.
                // Only a requested asset that could not be loaded needs a fill.
                var placeholder = !hasBackground && !hasSprite && (node.background || node.sprite);
                if (placeholder) {
                    ctx.fillStyle = /Button|Textbox|Progress/.test(node.type) ? "#52647866" : "#5a789512";
                    ctx.fillRect(node.x, node.y, node.width, node.height);
                }
                if (node.sprite && !hasSprite && node.width > 24 && node.height > 24) {
                    // Unknown runtime portraits/icons retain an explicit neutral placeholder.
                    ctx.save();
                    ctx.beginPath();ctx.rect(node.x,node.y,node.width,node.height);ctx.clip();
                    var radius=Math.min(node.width,node.height)*0.16;
                    ctx.fillStyle="#93a4b488";
                    ctx.beginPath();ctx.arc(node.x+node.width/2,node.y+node.height*0.34,radius,0,Math.PI*2);ctx.fill();
                    ctx.beginPath();ctx.ellipse(node.x+node.width/2,node.y+node.height*0.82,radius*2.1,radius*1.8,0,Math.PI,0);ctx.fill();
                    ctx.restore();
                }
                var approximateOutline = node.approximate && options.approximateOutlines !== false;
                if (!exporting && (options.outlines || approximateOutline || (node.sprite && !hasSprite) || (node.background && !hasBackground))) {
                    ctx.save();
                    ctx.strokeStyle = approximateOutline ? "#d2a665" : "#8196aa88";
                    ctx.setLineDash(approximateOutline ? [4 / scale, 3 / scale] : []);
                    ctx.lineWidth = 1 / scale;
                    ctx.strokeRect(node.x, node.y, node.width, node.height);
                    ctx.restore();
                }
                if (node.text != null && node.text !== "") {
                    var style = node.style || {}, fontSize = Math.max(1, Math.min(512, style.fontSize || 16));
                    ctx.save();
                    // Project bitmap/SDF fonts retain their normal filtering.
                    ctx.imageSmoothingEnabled = true;
                    if (Number.isFinite(style.textClipWidth)) {
                        // GooWee's explicit text clip is horizontal. Vertical
                        // clipping comes from ancestors, not the Label's bounds.
                        var textMatrix = ctx.getTransform(), clipY = -textMatrix.f / textMatrix.d;
                        ctx.beginPath(); ctx.rect(node.x, clipY - 1, Math.max(0, style.textClipWidth), canvas.height / textMatrix.d + 2); ctx.clip();
                    }
                    var handled = false;
                    if (fonts && style.fontResource) {
                        var metrics = fonts.measure(String(node.text), style);
                        var origin = textOrigin(node, metrics);
                        handled = fonts.draw(ctx, String(node.text), origin.x, origin.y, style);
                    }
                    if (!handled) {
                    // Browser fallbacks keep their bounded placeholder layout.
                    ctx.beginPath(); ctx.rect(node.x, node.y, node.width, node.height); ctx.clip();
                    ctx.font = (style.italic ? "italic " : "") + (style.bold ? "bold " : "") + fontSize + "px sans-serif";
                    ctx.fillStyle = color(style.color, "#e5e7eb");
                    if (Number.isFinite(style.fontAlpha)) ctx.globalAlpha *= Math.max(0, Math.min(1, style.fontAlpha));
                    ctx.textBaseline = "top";
                    var lines = String(node.text).split(/\r?\n/);
                    var lineHeight = fontSize * 1.25;
                    var ty = node.y + (style.alignV === 1 || style.alignV === "center" ? (node.height - lines.length * lineHeight) / 2 : style.alignV === 2 || style.alignV === "bottom" ? node.height - lines.length * lineHeight : 0);
                    ctx.textAlign = style.alignH === 1 || style.alignH === "center" ? "center" : style.alignH === 2 || style.alignH === "right" ? "right" : "left";
                    var tx = node.x + (Number.isFinite(style.textDrawOffsetX) ? style.textDrawOffsetX : 0) + (ctx.textAlign === "center" ? node.width / 2 : ctx.textAlign === "right" ? node.width : 0);
                    lines.forEach(function(line, i) { ctx.fillText(line, tx, ty + i * lineHeight); });
                    }
                    ctx.restore();
                }
                if (node.runtimePlaceholder && node.width > 80 && node.height > 80) {
                    ctx.save();
                    ctx.beginPath();ctx.rect(node.x,node.y,node.width,node.height);ctx.clip();
                    ctx.textAlign="center";ctx.textBaseline="middle";
                    ctx.font="bold "+Math.max(16,12/scale)+"px sans-serif";ctx.fillStyle="#b9c6d2";
                    ctx.fillText(node.runtimePlaceholder,node.x+node.width/2,node.y+node.height/2);
                    ctx.font=Math.max(13,10/scale)+"px sans-serif";ctx.fillStyle="#90a0af";
                    ctx.fillText("Needs live game data",node.x+node.width/2,node.y+node.height/2+Math.max(24,18/scale));
                    ctx.restore();
                }
                var visible = intersect(clip,node), hitBounds = unionBounds([node].concat(capturedBounds(node)));
                var hitVisible = intersect(clip, hitBounds);
                if (hitVisible.width > 0 && hitVisible.height > 0) {
                    painted.push(node); paintedDepths.push(depth); paintedClips.push(clip); paintedBounds.push(hitBounds);
                }
                var childClip = node.clipChildren ? visible : clip;
                if (childClip && !(childClip.width > 0 && childClip.height > 0)) return;
                if (node.clipChildren) { ctx.save(); applyClip(childClip); }
                (node.children || []).forEach(function(child) { drawNode(child, depth + 1, childClip); });
                if (node.clipChildren) ctx.restore();
            }
            scene.roots.forEach(function(node) { drawNode(node, 0, null); });
            // Keep already decoded assets for hidden elements of this scene, so
            // undoing a hide is immediate without retaining unrelated old scenes.
            var retainedSpecs = new Set();
            function retainHiddenAsset(spec) {
                if (!spec || typeof spec !== "object" || retainedSpecs.has(spec)) return;
                retainedSpecs.add(spec);
                if (Array.isArray(spec.layers)) spec.layers.forEach(function(layer) { if (layer) retainHiddenAsset(layer.sprite); });
                else {
                    var asset = resolveSprite(spec.name, spec.index || 0);
                    if (asset && asset.url) usedImages.add(asset.url);
                }
            }
            manuallyHidden.forEach(function(node) {
                if (!Array.isArray(node.backgroundDraws)) retainHiddenAsset(node.background);
                if (!Array.isArray(node.spriteDraws)) retainHiddenAsset(node.sprite);
                [node.backgroundDraws, node.spriteDraws].forEach(function(commands) {
                    if (Array.isArray(commands)) commands.forEach(function(layer) { if (layer) retainHiddenAsset(layer.sprite); });
                });
            });
            // Keep all images in the current scene, including pending loads. A fixed
            // entry cap could evict visible images and cause an endless load/redraw cycle.
            images.forEach(function(item, url) {
                if (!usedImages.has(url)) {
                    item.image.onload = item.image.onerror = null;
                    item.complete();
                    images.delete(url);
                }
            });
            tiles = tiles.filter(function(item) {
                if (usedImages.has(item.url)) return true;
                tilePixels -= item.pixels; return false;
            });
            function highlight(id, color, width, includeHidden) {
                var index = painted.findIndex(function(node) { return node.id === id; });
                var node = index >= 0 ? painted[index] : includeHidden && (scene.nodes || []).find(function(node) { return node.id === id; });
                if (!node) return;
                ctx.save();
                if (index >= 0 && paintedClips[index]) applyClip(paintedClips[index]);
                ctx.strokeStyle = color;
                // Hidden controls retain an inspectable layout, without painting
                // their content or making them mouse hit-test targets.
                ctx.setLineDash(index < 0 ? [4 / scale, 3 / scale] : []);
                ctx.lineWidth = width / scale;
                ctx.strokeRect(node.x, node.y, node.width, node.height);
                ctx.restore();
            }
            if (!exporting) {
                if (options.hovered !== options.selected) highlight(options.hovered,"#73baff",1);
                highlight(options.selected,"#55ccff",2,true);
            }
            return {scale: scale, bounds: box, x: transform.x, y: transform.y};
        }
        async function exportImage(scene, reference, options) {
            if (!alive) throw new Error("The preview was closed.");
            // Snapshot the view filter before loading assets asynchronously.
            // Undo/show-all in the editor must not change an in-flight copy.
            var hiddenNodeIds = new Set(options && options.hiddenNodeIds || []);
            var renderOptions = {reference: reference, sharpPixels: options && options.sharpPixels === true, hiddenNodeIds: hiddenNodeIds};
            if (!exportContext) {
                // Export has its own canvas, caches and camera: copying never
                // resizes the live view or changes its hit-test coordinates.
                var output = document.createElement("canvas");
                var renderer = create(output, resolveSprite, function() {}, fonts, {revision: imageRevision});
                try { return await renderer.exportImage(scene, reference, renderOptions); }
                finally { renderer.dispose(); }
            }
            render(scene, renderOptions);
            var pending = Array.from(images.values()).map(function(item) { return item.pending; });
            if (!reference && fonts && fonts.whenReady) pending.push(fonts.whenReady());
            var timer;
            try {
                await Promise.race([Promise.all(pending), new Promise(function(_, reject) {
                    timer = setTimeout(function() { reject(new Error("Timed out waiting for preview images or fonts.")); }, 10000);
                })]);
            } finally { clearTimeout(timer); }
            render(scene, renderOptions);
            // Trim transparent sprite padding as well as empty layout margins.
            var width = canvas.width, height = canvas.height;
            var bytes = ctx.getImageData(0, 0, width, height).data;
            var left = width, top = height, right = -1, bottom = -1;
            for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
                if (!bytes[(y * width + x) * 4 + 3]) continue;
                left = Math.min(left, x); right = Math.max(right, x);
                top = Math.min(top, y); bottom = y;
            }
            if (right < left) throw new Error("There is no visible interface to copy.");
            if (left === 0 && top === 0 && right === width - 1 && bottom === height - 1) return canvas;
            var cropped = document.createElement("canvas");
            cropped.width = right - left + 1; cropped.height = bottom - top + 1;
            cropped.getContext("2d").drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
            return cropped;
        }
        return {
            render: render,
            exportImage: exportImage,
            hitTest: function(x, y, options) {
                x = (x - transform.x) / transform.scale;
                y = (y - transform.y) / transform.scale;
                var deepest = null, depth = -1, area = Infinity;
                for (var i = painted.length - 1; i >= 0; i--) {
                    var n = painted[i];
                    var clip = paintedClips[i];
                    if (clip && !(x >= clip.x && y >= clip.y && x < clip.x + clip.width && y < clip.y + clip.height)) continue;
                    var rect = paintedBounds[i];
                    if (!(x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height)) continue;
                    if (!options || !options.deep) return n;
                    // A separate frame canvas can cover the whole UI. Deep
                    // selection searches all painted roots for nested content.
                    // Prefer the tighter rectangle at equal depth: a frame's
                    // image can be just as nested as the title it surrounds.
                    // Equal-depth, equal-area ties keep front-to-back order.
                    var candidateArea = rect.width * rect.height;
                    if (paintedDepths[i] > depth || (paintedDepths[i] === depth && candidateArea < area)) {
                        deepest = n; depth = paintedDepths[i]; area = candidateArea;
                    }
                }
                return deepest;
            },
            clearImages: function() {
                imageRevision = Math.max(Date.now(), imageRevision + 1);
                images.forEach(function(item) { item.image.onload = item.image.onerror = null; item.complete(); });
                images.clear();
                usedImages.clear();
                tints.clear(); tintPixels = 0;
                tiles = []; tilePixels = 0;
                composites.clear(); compositePixels=0;
                compositeFrame=new WeakMap();compositeFrameSurfaces=new WeakSet();compositeWork=0;compositeFramePixels=0;
                sliceCanvas.width = sliceCanvas.height = 1;
            },
            dispose: function() { alive = false; this.clearImages(); painted = []; paintedDepths = []; paintedClips = []; paintedBounds = []; }
        };
    }
    return {create: create, color: color};
});
