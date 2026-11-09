"use strict";

// Pixel and layout regressions in an isolated Chromium renderer.
// node tests/run-goowee-font-tests.js [--project C:\path\to\Strategy]
const fs = require("fs"), os = require("os"), path = require("path");
const {pathToFileURL} = require("url");
const root = path.resolve(__dirname, "..");
const pluginDir = path.join(root, "bin/resources/app/plugins/goowee-preview");

if (!process.versions.electron) {
    const executable = path.join(root, "bin/resources/app/node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : "electron");
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const child = require("child_process").spawn(executable, [__filename, ...process.argv.slice(2)], {cwd: root, env, stdio: "inherit", windowsHide: true});
    child.on("error", error => {console.error(error); process.exitCode = 1;});
    child.on("exit", code => {process.exitCode = code == null ? 1 : code;});
} else run().catch(error => {console.error(error.stack || error); require("electron").app.exit(1);});

async function run() {
    const {app, BrowserWindow} = require("electron");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmedit-goowee-fonts-"));
    app.setPath("userData", path.join(directory, "profile"));
    const flag = process.argv.indexOf("--project");
    const config = {projectPath: flag < 0 ? null : path.resolve(process.argv[flag + 1]), directory};
    const html = `<!doctype html><meta charset="utf-8"><title>GooWee font pixel checks</title>
        <style>body{margin:0;background:#20252d;color:#ddd;font:14px sans-serif}canvas{display:block}</style>
        <canvas id="preview" width="1100" height="700"></canvas>
        ${["project-resources.js", "preview-fonts.js", "preview-renderer.js"].map(file => `<script src="${pathToFileURL(path.join(pluginDir, file)).href}"></script>`).join("\n")}`;
    const htmlPath = path.join(directory, "fonts.html"); fs.writeFileSync(htmlPath, html);
    await app.whenReady();
    const window = new BrowserWindow({width: 1100, height: 700, show: false, webPreferences: {
        nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false, offscreen: true
    }});
    const errors = [];
    window.webContents.on("console-message", (_event, level, message) => {if (level >= 3) errors.push(message);});
    const timer = setTimeout(() => {console.error("GooWee font tests timed out."); app.exit(2);}, 60000);
    try {
        await window.loadFile(htmlPath);
        const result = await window.webContents.executeJavaScript(`(${verify.toString()})(${JSON.stringify(config)})`);
        if (errors.length) throw new Error(errors.join("\n"));
        fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
        console.log("GooWee font pixels: " + result.tests + " checks passed.");
        if (result.screenshot) console.log("Screenshot: " + result.screenshot);
        if (result.effectScreenshot) console.log("Effect screenshot: " + result.effectScreenshot);
        if (result.skipped.length) console.log("Skipped: " + result.skipped.join("; "));
    } finally {clearTimeout(timer); window.destroy();}
    app.exit(0);
}

async function verify(config) {
    const fs = require("fs"), path = require("path"), {pathToFileURL} = require("url");
    const canvas = document.getElementById("preview"), ctx = canvas.getContext("2d", {willReadFrequently: true});
    let tests = 0, currentAsset = null, notifications = 0;
    const skipped = [];
    const check = (condition, message) => {if (!condition) throw new Error(message); tests++;};
    const near = (a, b, tolerance = 0.001) => Math.abs(a - b) <= tolerance;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(test, message) {
        const deadline = performance.now() + 5000;
        while (!test()) {if (performance.now() > deadline) throw new Error(message); await sleep(10);}
    }
    function clear() {ctx.clearRect(0, 0, canvas.width, canvas.height);}
    function pixel(x, y) {return [...ctx.getImageData(x, y, 1, 1).data];}
    function inkBounds() {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = Infinity, top = Infinity, right = -1, bottom = -1, count = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 128) {
            const x = ((i - 3) / 4) % canvas.width, y = Math.floor((i - 3) / 4 / canvas.width);
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
        }
        return {left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, count};
    }
    function hashPixels() {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
        return hash >>> 0;
    }
    const atlas = document.createElement("canvas"); atlas.width = 12; atlas.height = 8;
    const atlasContext = atlas.getContext("2d"); atlasContext.fillStyle = "#ffffff";
    atlasContext.fillRect(1, 2, 1, 4); atlasContext.fillRect(1, 5, 3, 1);
    atlasContext.fillRect(8, 2, 1, 4); atlasContext.fillRect(6, 2, 3, 1);
    atlasContext.fillStyle = "rgba(255,255,255,0.5)"; atlasContext.fillRect(3, 3, 1, 1);
    atlasContext.fillStyle = "#204060"; atlasContext.fillRect(4, 6, 1, 1);
    const bitmap = {name: "bitmap_fixture", kind: "atlas", size: 6, fontName: "Unavailable Fixture Font", lineHeight: 8,
        ascenderOffset: 1, usesSDF: false, sdfSpread: 0, url: atlas.toDataURL(), kerningPairs: [],
        glyphs: {32: {character: 32, x: 0, y: 0, w: 0, h: 0, offset: 0, shift: 3},
            65: {character: 65, x: 0, y: 0, w: 5, h: 8, offset: 1, shift: 6},
            66: {character: 66, x: 6, y: 0, w: 5, h: 8, offset: 0, shift: 5}}};
    const service = GooWeePreviewFonts.create(() => currentAsset, () => {notifications++;});
    const nativeSize = bitmap.size * 1.3333;
    const basicStyle = {fontResource: bitmap.name, fontSize: nativeSize, color: "#ffffff", fontAlpha: 1};
    currentAsset = bitmap;
    let measured = service.measure("AB", basicStyle);
    check(near(measured.width, 11), "Bitmap label width must use resource advances, not browser family metrics");
    check(near(measured.height, 8), "Bitmap label height must use the resource line height");
    measured = service.measure("A\nBB", basicStyle);
    check(near(measured.width, 10) && near(measured.height, 18), "Multiline labels must use widest line and GooWee's two-pixel native line gap");
    measured = service.measure("AB", {...basicStyle, fontSize: nativeSize * 2});
    check(near(measured.width, 22) && near(measured.height, 16), "GUI scaling must multiply font advances and line height exactly once");
    clear(); service.draw(ctx, "AB", 20, 20, basicStyle);
    await until(() => notifications > 0, "Bitmap atlas failed to load");
    clear(); service.draw(ctx, "AB", 20, 20, basicStyle);
    check(pixel(22, 21)[3] === 255 && pixel(26, 21)[3] === 255, "Actual atlas glyph shapes must be copied with their offsets and ascender correction");
    check(pixel(23, 22)[3] === 0 && pixel(24, 22)[3] >= 126 && pixel(24, 22)[3] <= 129, "Bitmap glyphs must retain transparent holes and partial alpha");
    check(pixel(25, 25).join(",") === "32,64,96,255", "Bitmap font RGB must preserve baked outlines and colored glyphs instead of treating every atlas as an alpha mask");
    clear(); service.draw(ctx, "A", 20, 20, {...basicStyle, color: "#80c040", fontAlpha: 0.5});
    const tinted = pixel(22, 21);
    check(near(tinted[0], 128, 2) && near(tinted[1], 192, 2) && near(tinted[2], 64, 2) && near(tinted[3], 128, 2), "Font tint and style alpha must apply to cached bitmap pixels");

    const output = document.createElement("canvas");
    const renderer = GooWeePreviewRenderer.create(output, () => null, () => {}, service);
    const coldFonts = GooWeePreviewFonts.create(() => bitmap, () => {});
    const coldRenderer = GooWeePreviewRenderer.create(document.createElement("canvas"), () => null, () => {}, coldFonts);
    const exportLabel = {id: "export_label", type: "Label", x: 500, y: 600, width: 61, height: 40,
        children: [], text: "AB", style: basicStyle};
    const exportedLabel = await coldRenderer.exportImage({roots: [exportLabel], nodes: [exportLabel], width: 1920, height: 1080});
    const exportedPixels = exportedLabel.getContext("2d").getImageData(0, 0, exportedLabel.width, exportedLabel.height).data;
    check(exportedLabel.width === 7 && exportedLabel.height === 5,
        "Export must wait for a cold font atlas and crop the actual glyph pixels, without a browser-font substitute: " + exportedLabel.width + "x" + exportedLabel.height);
    check(exportedPixels[3] === 255 && exportedPixels.some((value, index) => index % 4 === 3 && value === 0),
        "Exported project glyphs must preserve their opaque strokes and transparent gaps");
    coldRenderer.dispose(); coldFonts.dispose();
    function renderLabel(guiScale, zoom) {
        const node = {id: "font_label", type: "Label", name: "font_label", x: 0, y: 0, width: 61 * guiScale, height: 40 * guiScale,
            children: [], text: "AB", style: {...basicStyle, fontSize: nativeSize * guiScale, alignH: "center", alignV: "center"}};
        renderer.render({roots: [node], nodes: [node], width: node.width, height: node.height, guiScale},
            {width: 154, height: 112, scale: zoom, outlines: false});
        return [...output.getContext("2d").getImageData(0, 0, output.width, output.height).data];
    }
    const scaledGui = renderLabel(2, 1), scaledView = renderLabel(1, 2);
    check(scaledGui.length === scaledView.length && scaledGui.every((value, index) => Math.abs(value - scaledView[index]) <= 1), "Production renderer must apply GUI font scale and preview zoom once, with identical centered text placement");
    renderer.dispose();

    const cachedPath = path.join(config.directory, "refresh-font.png");
    fs.writeFileSync(cachedPath, Buffer.from(atlas.toDataURL().split(",")[1], "base64"));
    const cachedAsset = {...bitmap, name: "refresh_font", url: pathToFileURL(cachedPath).href};
    currentAsset = cachedAsset;
    const cachedStyle = {...basicStyle, fontResource: cachedAsset.name};
    let beforeRefresh = notifications; service.draw(ctx, "A", 20, 20, cachedStyle);
    await until(() => notifications > beforeRefresh, "Refresh fixture failed to load");
    clear(); service.draw(ctx, "A", 20, 20, cachedStyle);
    check(pixel(22, 21)[3] === 255, "The font refresh fixture must load its original glyph mask");
    atlasContext.clearRect(1, 2, 1, 1);
    fs.writeFileSync(cachedPath, Buffer.from(atlas.toDataURL().split(",")[1], "base64"));
    service.clear(); beforeRefresh = notifications;
    clear(); service.draw(ctx, "A", 20, 20, cachedStyle);
    await until(() => notifications > beforeRefresh, "Refresh must reload the font at its existing URL");
    clear(); service.draw(ctx, "A", 20, 20, cachedStyle);
    check(pixel(22, 21)[3] === 0 && pixel(22, 22)[3] === 255, "Refresh must replace both browser image data and derived cached glyph pixels");

    // SDF alpha encodes distance, not visible opacity. A wide constant interior should be solid.
    const distance = document.createElement("canvas"); distance.width = distance.height = 12;
    const distanceContext = distance.getContext("2d");
    distanceContext.fillStyle = "rgba(255,255,255,0.25)"; distanceContext.fillRect(0, 0, 12, 12);
    distanceContext.fillStyle = "rgba(255,255,255,0.75)"; distanceContext.fillRect(3, 3, 6, 6);
    const sdf = {name: "sdf_fixture", kind: "atlas", size: 9, fontName: "Unavailable SDF Fixture", lineHeight: 10,
        ascenderOffset: 1, usesSDF: true, sdfSpread: 2, url: distance.toDataURL(), kerningPairs: [],
        glyphs: {65: {character: 65, x: 0, y: 0, w: 12, h: 12, offset: 0, shift: 8}}};
    currentAsset = sdf;
    const sdfStyle = {...basicStyle, fontResource: sdf.name, fontSize: sdf.size * 1.3333};
    const beforeSdf = notifications; clear(); service.draw(ctx, "A", 30, 30, sdfStyle);
    await until(() => notifications > beforeSdf, "SDF atlas failed to load");
    clear(); service.draw(ctx, "A", 30, 30, sdfStyle);
    check(pixel(33, 32)[3] >= 250 && pixel(28, 27)[3] <= 5, "SDF distance values must be decoded to crisp glyph coverage, not copied as a translucent rectangle");
    const bounds = inkBounds();
    check(near(bounds.left, 31, 1) && near(bounds.top, 30, 1), "SDF spread and native ascender offset must be removed from the glyph origin");

    // A generic signed-distance glyph with a deliberately opaque neighbour.
    // Effects must sample this glyph's distance field, never the next atlas cell.
    const effectAtlas=document.createElement("canvas");effectAtlas.width=64;effectAtlas.height=32;
    const effectAtlasContext=effectAtlas.getContext("2d"),effectData=effectAtlasContext.createImageData(64,32);
    for(let y=0;y<32;y++)for(let x=0;x<64;x++) {
        const offset=(y*64+x)*4;
        effectData.data[offset]=effectData.data[offset+1]=effectData.data[offset+2]=255;
        effectData.data[offset+3]=x>=32 ? 255 : Math.round(Math.max(0,Math.min(1,0.5+(5-Math.hypot(x+0.5-16,y+0.5-16))/16))*255);
    }
    effectAtlasContext.putImageData(effectData,0,0);
    const effectAsset={name:"distance_effect_fixture",kind:"atlas",size:12,lineHeight:16,ascenderOffset:0,
        usesSDF:true,sdfSpread:8,url:effectAtlas.toDataURL(),kerningPairs:[],
        glyphs:{65:{character:65,x:0,y:0,w:32,h:32,offset:0,shift:16}}};
    const effectFonts=GooWeePreviewFonts.create(()=>effectAsset,()=>{});
    const effectStyle={fontResource:effectAsset.name,fontSize:effectAsset.size*1.3333,color:"#ffffff",fontAlpha:1,nativeSdf:true};
    effectFonts.measure("A",effectStyle);await effectFonts.whenReady();
    const effectCanvas=document.createElement("canvas");effectCanvas.width=128;effectCanvas.height=96;
    const effectContext=effectCanvas.getContext("2d",{willReadFrequently:true});
    const effectPixel=(x,y)=>[...effectContext.getImageData(x,y,1,1).data];
    const effectBytes=()=>[...effectContext.getImageData(0,0,effectCanvas.width,effectCanvas.height).data];
    const paintEffect=(sdfEffect,extra={})=>{
        effectContext.setTransform(1,0,0,1,0,0);effectContext.clearRect(0,0,effectCanvas.width,effectCanvas.height);
        effectFonts.draw(effectContext,"A",40,32,{...effectStyle,...extra,sdfEffect});return effectBytes();
    };
    const sameBytes=(first,second,tolerance=0)=>first.length===second.length&&first.every((v,i)=>Math.abs(v-second[i])<=tolerance);
    const countTint=(bytes,channel)=>bytes.reduce((sum,value,index)=>sum+(index%4===3&&value>5&&bytes[index-3+channel]>180&&bytes[index-3+(channel+1)%3]<80?1:0),0);
    const plainEffect=paintEffect({}),plainMetrics=effectFonts.measure("AA",effectStyle);
    const shadow={dropShadowEnable:true,dropShadowSoftness:0,dropShadowOffsetX:8,dropShadowOffsetY:0,dropShadowColour:0x0000ff,dropShadowAlpha:1};
    const redShadow=paintEffect(shadow);
    check(countTint(redShadow,0)>20&&effectPixel(60,40)[0]>240&&effectPixel(60,40)[1]<10&&effectPixel(60,40)[3]>240,
        "An enabled SDF shadow must use numeric GML colour and offset, including pixels outside the glyph's layout advance");
    const shadowMetrics=effectFonts.measure("AA",{...effectStyle,sdfEffect:shadow});
    check(plainMetrics.width===shadowMetrics.width&&plainMetrics.height===shadowMetrics.height,
        "Font effects must not alter text advances, line height, or GooWee layout measurements");
    paintEffect({...shadow,dropShadowAlpha:0.5});
    check(near(effectPixel(60,40)[3],128,3),"Shadow alpha must apply to the shadow independently of the opaque text fill");
    paintEffect(shadow,{fontAlpha:0.5});
    check(near(effectPixel(48,40)[3],128,3)&&near(effectPixel(60,40)[3],128,3),
        "Text style alpha must multiply both the glyph fill and its font effects exactly once");
    const softerShadow=paintEffect({...shadow,dropShadowSoftness:12});
    check(!sameBytes(softerShadow,redShadow)&&countTint(softerShadow,0)>0,"Shadow softness must change the distance-field falloff rather than being ignored");
    check(sameBytes(paintEffect({...shadow,dropShadowEnable:false}),plainEffect),"Disabling a cached shadow must restore the original glyph pixels");
    check(sameBytes(paintEffect(shadow),redShadow),"Returning to a cached shadow must restore its own pixels without stale tint or alpha");
    check(sameBytes(paintEffect({...shadow,dropShadowEnable:1.2}),redShadow),
        "Numeric effect flags above 0.5 must follow GML boolean conversion");
    effectCanvas.width=192;
    paintEffect({...shadow,dropShadowOffsetX:96});
    check(effectPixel(144,40)[0]>240&&effectPixel(144,40)[1]<10&&effectPixel(144,40)[3]>240,
        "Finite shadow offsets must not be silently limited to the softness range");
    effectCanvas.width=128;
    const countOpaque=bytes=>bytes.reduce((sum,value,index)=>sum+(index%4===3&&value>=128?1:0),0);
    check(countOpaque(paintEffect({thickness:2}))>countOpaque(paintEffect({thickness:-2})),
        "SDF thickness must expand or contract the reconstructed glyph without changing its layout advance");
    paintEffect({coreColour:"#00ff00",coreAlpha:0.5});
    check(effectPixel(48,40)[1]>240&&effectPixel(48,40)[0]<10&&near(effectPixel(48,40)[3],128,3),
        "Core colour and alpha must affect the glyph fill itself");
    check(countTint(paintEffect({...shadow,dropShadowColour:undefined,dropShadowColor:"#0000ff"}),2)>20,
        "The documented Color spelling must behave like the Colour spelling for font effects");
    const outline={outlineEnable:true,outlineDistance:4,outlineColour:"#00ff00",outlineAlpha:1};
    const greenOutline=paintEffect(outline);
    check(countTint(greenOutline,1)>10,"SDF outline settings must produce the selected outline colour outside the text fill");
    const glow={glowEnable:true,glowStart:0,glowEnd:8,glowColour:"#0000ff",glowAlpha:0.75};
    const blueGlow=paintEffect(glow);
    check(countTint(blueGlow,2)>10,"SDF glow settings must produce a coloured distance-field halo");
    const combined=paintEffect({...shadow,...outline,...glow});
    check(countTint(combined,0)>0&&countTint(combined,1)>0&&countTint(combined,2)>0,
        "Shadow, glow and outline must coexist while preserving their independent colours");
    paintEffect({...shadow,dropShadowOffsetX:-16});
    check(effectPixel(63,40)[3]===0,"Shifted effect samples must not leak an adjacent opaque glyph into the current atlas cell");
    paintEffect(glow,{fontSize:effectStyle.fontSize*2,baseFontSize:effectStyle.fontSize});
    check(effectPixel(87,48)[3]===0,"Enlarged glyph filtering must not pull the neighbouring opaque atlas cell into a glow at the glyph edge");

    const effectOutput=document.createElement("canvas"),effectRenderer=GooWeePreviewRenderer.create(effectOutput,()=>null,()=>{},effectFonts);
    const effectNode={id:"effect_label",type:"Label",x:0,y:0,width:16,height:16,children:[],text:"A",style:{...effectStyle,sdfEffect:shadow}};
    const effectScene={roots:[effectNode],nodes:[effectNode],width:16,height:16,guiScale:1};
    const effectRenderOptions={width:128,height:96,scale:1,outlines:false,approximateOutlines:false};
    const imageBytes=surface=>[...surface.getContext("2d").getImageData(0,0,surface.width,surface.height).data];
    const renderEffect=(scene=effectScene,options={})=>{const camera=effectRenderer.render(scene,{...effectRenderOptions,...options});return {camera,bytes:imageBytes(effectOutput)};};
    const liveEffects=renderEffect();
    const liveEffectPixel=effectOutput.getContext("2d").getImageData(Math.round(liveEffects.camera.x+20),Math.round(liveEffects.camera.y+8),1,1).data;
    check(liveEffectPixel[0]>240&&liveEffectPixel[1]<10,"The live preview must not cut a label's shadow at its layout rectangle");
    // Compare ink, excluding the editor's separately stroked outer bounds.
    function fontRegion(rendered,width,height) {
        const region=[],left=Math.round(rendered.camera.x),top=Math.round(rendered.camera.y);
        for(let y=top;y<top+height;y++)for(let x=left;x<left+width;x++) {
            const offset=(y*effectOutput.width+x)*4;region.push(...rendered.bytes.slice(offset,offset+4));
        }
        return region;
    }
    const sharpEffects=renderEffect(effectScene,{sharpPixels:true});
    check(sameBytes(fontRegion(sharpEffects,24,16),fontRegion(liveEffects,24,16)),
        "Sharp sprite sampling must leave SDF font effects and text smoothing unchanged");
    const doubledNode={...effectNode,width:32,height:32,style:{...effectNode.style,fontSize:effectStyle.fontSize*2,baseFontSize:effectStyle.fontSize}};
    const doubledScene={roots:[doubledNode],nodes:[doubledNode],width:32,height:32,guiScale:2};
    const doubleGui=renderEffect(doubledScene),doubleZoom=renderEffect(effectScene,{scale:2});
    check(sameBytes(fontRegion(doubleGui,48,32),fontRegion(doubleZoom,48,32),1),"Font effect offsets and widths must scale once with GUI size and once with preview zoom");
    const exportedEffect=await effectRenderer.exportImage(effectScene);
    const exportedPlain=await effectRenderer.exportImage({...effectScene,roots:[{...effectNode,style:effectStyle}],nodes:[{...effectNode,style:effectStyle}]});
    check(exportedEffect.width>exportedPlain.width&&countTint(imageBytes(exportedEffect),0)>20,
        "Original-size export must include visible font effects beyond a label's layout rectangle");
    const clippedParent={id:"effect_clip",type:"Canvas",x:0,y:0,width:16,height:16,clipChildren:true,children:[effectNode],style:{}};
    const clippedScene={roots:[clippedParent],nodes:[clippedParent,effectNode],width:16,height:16,guiScale:1};
    const clipped=renderEffect(clippedScene),clippedPixel=effectOutput.getContext("2d").getImageData(Math.round(clipped.camera.x+20),Math.round(clipped.camera.y+8),1,1).data;
    check(clippedPixel[0]===32&&clippedPixel[1]===37&&clippedPixel[2]===45,
        "Font effects must respect the ancestor's clipping rectangle even when they exceed the label's own bounds");
    const clippedExport=await effectRenderer.exportImage(clippedScene);
    check(clippedExport.width<exportedEffect.width,"Export must preserve ancestor clipping for text effects");
    const explicitClipNode={...effectNode,style:{...effectNode.style,textClipWidth:16}};
    const explicitClipScene={...effectScene,roots:[explicitClipNode],nodes:[explicitClipNode]};
    const explicitClip=renderEffect(explicitClipScene),explicitClipPixel=effectOutput.getContext("2d").getImageData(Math.round(explicitClip.camera.x+20),Math.round(explicitClip.camera.y+8),1,1).data;
    check(explicitClipPixel[0]===32&&explicitClipPixel[1]===37&&explicitClipPixel[2]===45,
        "An explicit text_clip_width must still hide a shadow beyond the allowed horizontal text region");
    const explicitClipExport=await effectRenderer.exportImage(explicitClipScene);
    check(explicitClipExport.width===clippedExport.width,"Export must also honor an explicit label text_clip_width");
    effectRenderer.dispose();effectFonts.dispose();

    let orphanNotifications = 0;
    const orphan = GooWeePreviewFonts.create(() => ({...bitmap, name: "disposed_atlas"}), () => {orphanNotifications++;});
    orphan.draw(ctx, "A", 0, 0, {...basicStyle, fontResource: "disposed_atlas"}); orphan.dispose();
    await sleep(50);
    check(orphanNotifications === 0, "Disposed panels must ignore late atlas callbacks");

    let screenshot = null, effectScreenshot = null;
    if (config.projectPath) {
        const names = ["f_fontin_pt16_regular_sdf", "f_fontin_pt16_bold_sdf", "f_fontin_pt16_italic_sdf", "f_fontin_pt16_regular_sdf_huge_spread", "f_forum_pt30_regular_sdf", "f_fontin_pt16_bold_sdf_huge_spread"];
        const outlinedName = "f_fontin_pt14_bold_outlined", resourceNames = names.concat(outlinedName);
        const project = {
            dir: config.projectPath,
            yyResources: Object.fromEntries(resourceNames.map(name => [name, {id: {path: `fonts/${name}/${name}.yy`}}])), yyResourceGUIDs: {},
            yyResourceTypes: Object.fromEntries(resourceNames.map(name => [name, "GMFont"])),
            readYyFileSync(relative) {return JSON.parse(fs.readFileSync(path.join(config.projectPath, relative), "utf8").replace(/,\s*([}\]])/g, "$1"));},
            readTextFileSync(relative) {return fs.readFileSync(path.join(config.projectPath, relative), "utf8");},
            getImageURL(relative) {return pathToFileURL(path.join(config.projectPath, relative)).href;}
        };
        const resources = GooWeePreviewResources.create(project);
        const actual = GooWeePreviewFonts.create(name => resources.font(name), () => {notifications++;});
        const widths = [58, 62, 60], hashes = [], allBounds = [];
        for (let i = 0; i < names.length; i++) {
            const asset = resources.font(names[i]);
            check(!!asset && asset.kind === "atlas", names[i] + " must load the cached project atlas");
            const style = {fontResource: names[i], fontSize: asset.size * 1.3333, color: "#ffffff", fontAlpha: 1};
            if (i < 3) check(near(actual.measure("Wq", style).width, widths[i]), names[i] + " must retain its actual regular/bold/italic glyph advances");
            const before = notifications; clear(); actual.draw(ctx, "Wq Ag Русский текст", 40, 40, style);
            await until(() => notifications > before, names[i] + " failed to load");
            clear(); actual.draw(ctx, "Wq Ag Русский текст", 40, 40, style);
            const box = inkBounds(); check(box.count > 500, names[i] + " must paint readable Latin and Cyrillic glyphs");
            hashes.push(hashPixels()); allBounds.push(box);
            if (i === 0) {
                const at22 = actual.measure("Wq", {...style, fontSize: 22});
                check(near(at22.width, 58 * 22 / (32 * 1.3333)) && near(at22.height, 53 * 22 / (32 * 1.3333)), "Real GooWee SDF size 22 must use native point-to-pixel normalization for both axes");
            }
        }
        check(new Set(hashes.slice(0, 3)).size === 3, "Regular, bold, and italic must retain three distinct cached glyph shapes despite misleading font metadata");
        check(near(allBounds[0].left, allBounds[3].left, 1) && near(allBounds[0].top, allBounds[3].top, 1) && near(allBounds[0].right, allBounds[3].right, 1) && near(allBounds[0].bottom, allBounds[3].bottom, 1), "Normal and huge-spread atlases must align the same text after removing their SDF padding");
        const outlined = resources.font(outlinedName), outlinedStyle = {fontResource: outlinedName, fontSize: outlined.size * 1.3333, color: "#ffffff", fontAlpha: 1};
        const beforeOutlined = notifications; clear(); actual.draw(ctx, "A", 40, 40, outlinedStyle);
        await until(() => notifications > beforeOutlined, "The actual outlined bitmap font failed to load");
        clear(); actual.draw(ctx, "A", 40, 40, outlinedStyle);
        const outlinedImage = new Image(); outlinedImage.src = outlined.url;
        await new Promise((resolve, reject) => {outlinedImage.onload = resolve; outlinedImage.onerror = reject;});
        const sourceCanvas = document.createElement("canvas"); sourceCanvas.width = outlinedImage.naturalWidth; sourceCanvas.height = outlinedImage.naturalHeight;
        const sourceContext = sourceCanvas.getContext("2d"); sourceContext.drawImage(outlinedImage, 0, 0);
        const glyphA = outlined.glyphs[65], sourcePixels = sourceContext.getImageData(glyphA.x, glyphA.y, glyphA.w, glyphA.h).data;
        let foundDark = false, foundLight = false, matching = true;
        for (let i = 0; i < sourcePixels.length; i += 4) if (sourcePixels[i + 3] === 255) {
            const sourcePixel = [...sourcePixels.slice(i, i + 4)];
            if (sourcePixel[0] < 16 && sourcePixel[1] < 16 && sourcePixel[2] < 16) foundDark = true;
            if (sourcePixel[0] > 240 && sourcePixel[1] > 240 && sourcePixel[2] > 240) foundLight = true;
            const rendered = pixel(40 + glyphA.offset + (i / 4) % glyphA.w, 40 - outlined.ascenderOffset + Math.floor(i / 4 / glyphA.w));
            if (rendered.some((value, index) => Math.abs(value - sourcePixel[index]) > 2)) matching = false;
        }
        check(foundDark && foundLight && matching, "Actual outlined Fontin glyphs must retain their dark outline and light fill from the project bitmap");
        clear(); ctx.fillStyle = "#20252d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "14px sans-serif";
        names.forEach((name, index) => {
            ctx.fillStyle = "#9aa7b4"; ctx.fillText(name, 24, 24 + index * 120);
            actual.draw(ctx, "Family tree — Родословная Wq", 24, 40 + index * 120, {fontResource: name, fontSize: 32, color: "#e3e1cf", fontAlpha: 1});
        });
        screenshot = path.join(config.directory, "project-fonts.png");
        fs.writeFileSync(screenshot, Buffer.from(canvas.toDataURL("image/png").split(",")[1], "base64"));
        const exampleStyle={fontResource:"f_fontin_pt16_bold_sdf_huge_spread",fontSize:16,color:"#7DA9D5",fontAlpha:1,nativeSdf:true};
        const exampleShadow={dropShadowEnable:true,dropShadowSoftness:18,dropShadowOffsetX:0,dropShadowOffsetY:0,dropShadowColour:0,dropShadowAlpha:1};
        clear();actual.draw(ctx,"1200",40,40,exampleStyle);const noShadowHash=hashPixels();
        clear();actual.draw(ctx,"1200",40,40,{...exampleStyle,sdfEffect:exampleShadow});
        check(hashPixels()!==noShadowHash,"The project's bold Fontin 16-point sample must render its softness18 black shadow from the provided effect struct");
        clear();ctx.fillStyle="#464e5d";ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle="#ffffff";ctx.font="18px sans-serif";ctx.fillText("No effects",24,32);ctx.fillText("Shadow softness 18",570,32);
        [1,8].forEach((scale,index)=>{
            [false,true].forEach(enabled=>{
                ctx.save();ctx.translate(enabled?570:24,80+index*160);ctx.scale(scale,scale);
                actual.draw(ctx,"1200",0,0,{...exampleStyle,sdfEffect:enabled?exampleShadow:undefined});ctx.restore();
            });
        });
        effectScreenshot=path.join(config.directory,"project-font-effects.png");
        fs.writeFileSync(effectScreenshot,Buffer.from(canvas.toDataURL("image/png").split(",")[1],"base64"));
        actual.dispose(); resources.dispose();
    }

    const filePath = config.projectPath ? path.join(config.projectPath, "datafiles/fonts/NotoSansJP-Medium.ttf") :
        process.platform === "win32" ? path.join(process.env.WINDIR || "C:/Windows", "Fonts/arial.ttf") : null;
    if (filePath && fs.existsSync(filePath)) {
        const fileAsset = {name: "dynamic_font_fixture", kind: "file", size: 32, fontName: "Project Dynamic Fixture", family: "Project Dynamic Fixture", url: pathToFileURL(filePath).href};
        const fontCount = document.fonts.size;
        let fileNotifications = 0;
        const dynamic = GooWeePreviewFonts.create(() => fileAsset, () => {fileNotifications++;});
        const fileStyle = {fontResource: fileAsset.name, fontSize: 24, color: "#ffffff", fontAlpha: 1};
        dynamic.measure("Family 日本語", fileStyle);
        await until(() => fileNotifications > 0, "The project TTF failed to load through FontFace");
        check(document.fonts.size > fontCount, "A project TTF must register its own loaded font face");
        const small = dynamic.measure("Family 日本語", fileStyle), large = dynamic.measure("Family 日本語", {...fileStyle, fontSize: 48});
        check(small.width > 40 && near(large.width, small.width * 2, 0.1), "Dynamic project fonts must measure text at the requested size and GUI scale");
        clear(); dynamic.draw(ctx, "Family 日本語", 20, 20, fileStyle);
        check(inkBounds().count > 100, "Dynamic project font glyphs must be drawn after loading");
        dynamic.dispose();
        check(document.fonts.size === fontCount, "Closing a preview must release its registered project FontFace");

        const NativeFontFace = window.FontFace;
        let release, pendingCount = 0;
        window.FontFace = function(...args) {
            const face = new NativeFontFace(...args), load = face.load.bind(face);
            face.load = () => new Promise((resolve, reject) => {release = () => load().then(resolve, reject);});
            return face;
        };
        try {
            const pending = GooWeePreviewFonts.create(() => ({...fileAsset, name: "pending_font"}), () => {pendingCount++;});
            pending.measure("Pending", {...fileStyle, fontResource: "pending_font"});
            check(typeof release === "function", "The pending FontFace fixture must start an asynchronous load");
            pending.dispose(); release();
            await sleep(200);
            check(pendingCount === 0 && document.fonts.size === fontCount, "A font completing after disposal must neither redraw nor leak into document.fonts");
        } finally {window.FontFace = NativeFontFace;}
    } else skipped.push("No local TTF fixture available; use --project to test dynamic game fonts");

    service.dispose();
    return {tests, screenshot, effectScreenshot, skipped};
}
