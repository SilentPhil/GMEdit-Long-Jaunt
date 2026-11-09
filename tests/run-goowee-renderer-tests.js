"use strict";

// Pixel regressions through the production renderer in an isolated Chromium canvas.
// node tests/run-goowee-renderer-tests.js [--project C:\path\to\Strategy]
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
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmedit-goowee-renderer-"));
    app.setPath("userData", path.join(directory, "profile"));
    const flag = process.argv.indexOf("--project");
    const config = {projectPath: flag < 0 ? null : path.resolve(process.argv[flag + 1]), directory};
    const html = `<!doctype html><meta charset="utf-8"><title>GooWee NineSlice pixel checks</title>
        <style>body{margin:0;background:#20252d;color:#ddd;font:14px sans-serif}canvas{display:block}</style>
        <canvas id="preview"></canvas>
        <script src="${pathToFileURL(path.join(pluginDir, "project-resources.js")).href}"></script>
        <script src="${pathToFileURL(path.join(pluginDir, "preview-renderer.js")).href}"></script>`;
    const htmlPath = path.join(directory, "renderer.html"); fs.writeFileSync(htmlPath, html);
    await app.whenReady();
    const window = new BrowserWindow({width: 1100, height: 960, show: false, webPreferences: {
        nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false, offscreen: true
    }});
    const errors = [];
    window.webContents.on("console-message", (_event, level, message) => {if (level >= 3) errors.push(message);});
    const timer = setTimeout(() => {console.error("GooWee renderer pixel tests timed out."); app.exit(2);}, 60000);
    try {
        await window.loadFile(htmlPath);
        const result = await window.webContents.executeJavaScript(`(${verify.toString()})(${JSON.stringify(config)})`);
        if (errors.length) throw new Error(errors.join("\n"));
        fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(result, null, 2));
        console.log("GooWee renderer pixels: " + result.tests + " checks passed.");
        if (result.sharpPixelsScreenshot) console.log("Sharp pixel comparison: " + result.sharpPixelsScreenshot);
        if (result.screenshot) console.log("Screenshot: " + result.screenshot);
        if (result.tabScreenshot) console.log("Tab screenshot: " + result.tabScreenshot);
    } finally {clearTimeout(timer); window.destroy();}
    app.exit(0);
}

async function verify(config) {
    const canvas = document.getElementById("preview"), ctx = canvas.getContext("2d");
    const background = [32,37,45,255];
    let tests = 0, currentAsset = null, currentURL = null, loaded = null, notifyLoaded = null, zoom = 1;
    const check = (condition, message) => {if (!condition) throw new Error(message); tests++;};
    const eq = (a, b, tolerance = 0) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
    const colorAt = (x, y) => [20+x*15,20+y*15,80,255];
    const fixture = document.createElement("canvas"); fixture.width = fixture.height = 12;
    const fixtureContext = fixture.getContext("2d");
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
        fixtureContext.fillStyle = `rgb(${colorAt(x,y).slice(0,3).join(",")})`; fixtureContext.fillRect(x,y,1,1);
    }
    const synthetic = {name:"asymmetric_fixture",width:12,height:12,originX:0,originY:0,url:fixture.toDataURL(),
        nineSlice:{left:2,top:2,right:2,bottom:2,tileMode:[1,1,1,1,1]}};
    const renderer = GooWeePreviewRenderer.create(canvas, () => currentAsset, () => {if (notifyLoaded) notifyLoaded();});
    async function draw(asset, changes = {}) {
        currentAsset = asset;
        const spec = {name:asset.name,color:"#ffffff",alpha:1,...changes.spec};
        const node = {id:1,type:"Canvas",name:"panel",x:0,y:0,width:changes.width || 29,height:changes.height || 27,
            children:[],style:changes.style || {},background:changes.foreground ? null : spec,sprite:changes.foreground ? spec : null};
        const scene = {roots:[node],nodes:[node],width:node.width,height:node.height,guiScale:changes.guiScale || 1};
        zoom = changes.zoom || 1;
        const options = {width:node.width*zoom+32,height:node.height*zoom+32,scale:zoom,outlines:false,sharpPixels:changes.sharpPixels === true};
        if (currentURL !== asset.url) {
            currentURL = asset.url;
            loaded = new Promise(resolve => {notifyLoaded = resolve;});
            renderer.render(scene, options);
            await Promise.race([loaded,new Promise((_,reject) => setTimeout(() => reject(new Error("Sprite did not load: " + asset.name)),5000))]);
        }
        renderer.render(scene,options);
        return node;
    }
    function pixel(x,y) {return [...ctx.getImageData(Math.floor(16+x*zoom),Math.floor(16+y*zoom),1,1).data];}
    function mode(value, regions = [0,1,2,3,4]) {const tileMode = [0,0,0,0,0]; regions.forEach(index => {tileMode[index] = value;}); return {...synthetic,nineSlice:{...synthetic.nineSlice,tileMode}};}

    // Clipboard export is an independent, original-size render with a tight alpha crop.
    const exportSource=document.createElement("canvas");exportSource.width=10;exportSource.height=8;
    const exportSourceContext=exportSource.getContext("2d");
    exportSourceContext.fillStyle="#d02040";exportSourceContext.fillRect(2,1,3,3);
    exportSourceContext.fillStyle="#20c060";exportSourceContext.fillRect(6,5,2,2);
    const solidSource=document.createElement("canvas");solidSource.width=solidSource.height=1;
    solidSource.getContext("2d").fillStyle="#3040d0";solidSource.getContext("2d").fillRect(0,0,1,1);
    const exportAssets={
        transparent:{name:"transparent",width:10,height:8,originX:0,originY:0,url:exportSource.toDataURL()},
        solid:{name:"solid",width:1,height:1,originX:0,originY:0,url:solidSource.toDataURL()}
    };
    const exportCanvas=document.createElement("canvas"), exportRenderer=GooWeePreviewRenderer.create(exportCanvas,name=>exportAssets[name],()=>{});
    const exportIcon={id:"export_icon",type:"Image",x:-50,y:80,width:10,height:8,children:[],style:{},approximate:true,sprite:{name:"transparent",color:"#ffffff",alpha:1}};
    const exportRoot={id:"export_root",type:"Canvas",x:0,y:0,width:1920,height:1080,children:[exportIcon],style:{}};
    const exportScene={roots:[exportRoot],nodes:[exportRoot,exportIcon],width:1920,height:1080,guiScale:1};
    const pixelsOf=surface=>surface.getContext("2d").getImageData(0,0,surface.width,surface.height).data;
    const exportPixel=(surface,x,y)=>[...surface.getContext("2d").getImageData(x,y,1,1).data];
    const firstExport=await exportRenderer.exportImage(exportScene);
    check(firstExport!==exportCanvas && firstExport.width===6 && firstExport.height===6,"Export must load actual sprite pixels before its first paint, discard empty root layout and crop transparent asset borders at 1:1");
    check(eq(exportPixel(firstExport,0,0),[208,32,64,255]) && eq(exportPixel(firstExport,4,4),[32,192,96,255]),"Export must preserve the loaded sprite's original color and pixel positions");
    check(eq(exportPixel(firstExport,5,0),[0,0,0,0]) && eq(exportPixel(firstExport,0,5),[0,0,0,0]) && eq(exportPixel(firstExport,3,3),[0,0,0,0]),"Export must retain truly transparent corners and internal gaps without workspace paint or diagnostic outlines");
    const baselineExport=pixelsOf(firstExport);
    const exportDpr=Object.getOwnPropertyDescriptor(window,"devicePixelRatio");
    for(const view of [{scale:0.35,panX:47,panY:-15,dpr:1},{scale:2,panX:-100,panY:60,dpr:2}]) {
        Object.defineProperty(window,"devicePixelRatio",{configurable:true,value:view.dpr});
        const liveView=exportRenderer.render(exportScene,{width:300,height:220,scale:view.scale,panX:view.panX,panY:view.panY,outlines:true,approximateOutlines:true,selected:exportIcon.id,hovered:exportRoot.id});
        const livePixels=pixelsOf(exportCanvas), liveSize=[exportCanvas.width,exportCanvas.height,exportCanvas.style.width,exportCanvas.style.height];
        const hitX=liveView.x+(exportIcon.x+5)*liveView.scale,hitY=liveView.y+(exportIcon.y+4)*liveView.scale;
        const previousHit=exportRenderer.hitTest(hitX,hitY);
        const copied=await exportRenderer.exportImage(exportScene);
        check(copied.width===6 && copied.height===6 && eq(pixelsOf(copied),baselineExport),"Export must ignore zoom, pan, DPR, selection, hover and both outline options: "+JSON.stringify(view));
        check(eq(pixelsOf(exportCanvas),livePixels) && [exportCanvas.width,exportCanvas.height,exportCanvas.style.width,exportCanvas.style.height].every((value,index)=>value===liveSize[index]) && exportRenderer.hitTest(hitX,hitY)===previousHit && previousHit===exportIcon,"Export must leave live canvas size, pixels and hit-test transform unchanged");
    }
    if(exportDpr)Object.defineProperty(window,"devicePixelRatio",exportDpr);else delete window.devicePixelRatio;
    const secondIcon={...exportIcon,id:"second_export_icon",x:exportIcon.x+30};
    exportRoot.children.push(secondIcon);exportScene.nodes.push(secondIcon);
    const spacedExport=await exportRenderer.exportImage(exportScene);
    check(spacedExport.width===36 && spacedExport.height===6 && eq(exportPixel(spacedExport,12,3),[0,0,0,0]) && eq(exportPixel(spacedExport,30,0),[208,32,64,255]),"Tight export must include all separated interface elements while keeping their actual transparent spacing");
    exportRoot.children.pop();exportScene.nodes.pop();
    exportRoot.width=exportRoot.height=100000;
    const emptyLayoutExport=await exportRenderer.exportImage(exportScene);
    check(emptyLayoutExport.width===6 && emptyLayoutExport.height===6,"A huge nonpainting root canvas must not enlarge or prevent the tight interface export");
    exportRoot.width=1920;exportRoot.height=1080;
    exportIcon.sprite.alpha=0.5;
    const translucentExport=await exportRenderer.exportImage(exportScene);
    check(eq(exportPixel(translucentExport,0,0),[208,32,64,128],1),"Export must retain sprite opacity in the PNG alpha channel instead of flattening it onto a background");
    exportIcon.sprite.alpha=1;
    exportIcon.width=20;exportIcon.height=16;exportScene.guiScale=2;
    const guiScaledExport=await exportRenderer.exportImage(exportScene);
    check(guiScaledExport.width>=12 && guiScaledExport.width<=14 && guiScaledExport.height>=12 && guiScaledExport.height<=14,"Export must retain dimensions already produced by GUI scale rather than resetting scene layout to unscaled asset size");
    exportIcon.width=10;exportIcon.height=8;exportScene.guiScale=1;
    const backgroundNode={id:"project_background",type:"Canvas",x:250,y:-40,width:25,height:20,children:[],style:{},background:{name:"solid",color:"#ffffff",alpha:1}};
    const backgroundExport=await exportRenderer.exportImage({roots:[backgroundNode],nodes:[backgroundNode],width:1920,height:1080});
    check(backgroundExport.width===25 && backgroundExport.height===20 && eq(exportPixel(backgroundExport,0,0),[48,64,208,255]) && eq(exportPixel(backgroundExport,24,19),[48,64,208,255]),"Transparent export must preserve a background explicitly drawn by the project");
    const overflowNode={id:"overflow",type:"Image",x:45,y:65,width:40,height:40,children:[],style:{},sprite:{name:"solid",color:"#ffffff",alpha:1}};
    const clipNode={id:"clip",type:"Canvas",x:50,y:70,width:8,height:6,children:[overflowNode],style:{},clipChildren:true};
    const clipExport=await exportRenderer.exportImage({roots:[clipNode],nodes:[clipNode,overflowNode],width:1920,height:1080});
    const clipExportPixels=pixelsOf(clipExport);
    check(clipExport.width===8 && clipExport.height===6 && Array.from({length:48},(_,i)=>i*4).every(i=>eq([...clipExportPixels.slice(i,i+4)],[48,64,208,255])),"Export bounds and painting must preserve ancestor scroll clipping instead of revealing off-viewport child content");
    exportAssets.repeat=synthetic;
    const repeatNode={...backgroundNode,width:29,height:27,background:{name:"repeat",color:"#ffffff",alpha:1}};
    const repeatExport=await exportRenderer.exportImage({roots:[repeatNode],nodes:[repeatNode],width:1920,height:1080,guiScale:1});
    check(repeatExport.width===29 && repeatExport.height===27 && eq(exportPixel(repeatExport,11,4),colorAt(3,4)) && eq(exportPixel(repeatExport,19,12),colorAt(3,4)),"Export must preserve native NineSlice repeat periods throughout the complete interface background");
    exportAssets.transformed={...synthetic,nineSlice:null,originX:3,originY:5};
    const transformedNode={id:"transformed",type:"Image",x:100,y:50,width:12,height:12,children:[],style:{angle:90,flipHorizontal:true},sprite:{name:"transformed",color:"#ffffff",alpha:1,scale:2}};
    const anchorNode={...backgroundNode,id:"transform_anchor",x:90,y:45,width:1,height:1};
    const transformedExport=await exportRenderer.exportImage({roots:[anchorNode,transformedNode],nodes:[anchorNode,transformedNode],width:1920,height:1080});
    check(transformedExport.width===27 && transformedExport.height===28 && eq(exportPixel(transformedExport,0,0),[48,64,208,255]) && eq(exportPixel(transformedExport,3,4),colorAt(0,0)) && eq(exportPixel(transformedExport,26,27),colorAt(11,11)),"Export must include scaled, rotated and flipped pixels outside the element rectangle, positioned around the sprite's nonzero origin");
    async function rejectsExport(scene,pattern,message) {
        let error=null;try{await exportRenderer.exportImage(scene);}catch(caught){error=caught;}
        check(error && pattern.test(error.message),message);
    }
    exportIcon.sprite.alpha=0;
    await rejectsExport(exportScene,/visible|empty|nothing/i,"A fully transparent interface must fail clearly instead of copying a blank image");
    exportIcon.sprite.alpha=1;exportRoot.hidden=true;
    await rejectsExport(exportScene,/visible|empty|nothing/i,"Hidden interface content must not create an export from editing outlines");
    exportRoot.hidden=false;
    for(const size of [[8193,1],[4097,4097]]) {
        const largeNode={...backgroundNode,width:size[0],height:size[1]};
        await rejectsExport({roots:[largeNode],nodes:[largeNode],width:size[0],height:size[1]},/large|limit|8192|pixel|size/i,"Oversized export must fail explicitly instead of silently shrinking original pixels: "+size.join("x"));
    }
    exportRenderer.dispose();

    // References replace scene pixels while sharing the scene's comparison camera.
    const referenceImage = new Image();
    await new Promise((resolve, reject) => {referenceImage.onload=resolve;referenceImage.onerror=reject;referenceImage.src=exportSource.toDataURL();});
    const referenceCanvas=document.createElement("canvas");
    let referenceAssetReads=0;
    const referenceRenderer=GooWeePreviewRenderer.create(referenceCanvas,()=>{referenceAssetReads++;return exportAssets.solid;},()=>{});
    const referenceScene={roots:[backgroundNode],nodes:[backgroundNode],width:1920,height:1080,guiScale:3};
    const referenceOptions={width:132,height:102,scale:1,outlines:true,approximateOutlines:true,selected:backgroundNode.id,hovered:backgroundNode.id};
    const guiView=referenceRenderer.render(referenceScene,referenceOptions);
    check(referenceRenderer.hitTest(20,20)===backgroundNode,"Reference fixture must first expose an ordinary selectable interface");
    const readsBeforeReference=referenceAssetReads;
    const reference={image:referenceImage,x:0,y:0};
    const referenceView=referenceRenderer.render(referenceScene,{...referenceOptions,reference});
    check(referenceView.x===guiView.x && referenceView.y===guiView.y && referenceView.scale===guiView.scale && referenceAssetReads===readsBeforeReference,
        "Reference mode must preserve the GUI camera and avoid drawing or resolving scene assets");
    check(eq(exportPixel(referenceCanvas,18,17),[208,32,64,255]) && eq(exportPixel(referenceCanvas,22,21),[32,192,96,255]),
        "Reference pixels must retain original dimensions relative to the content origin, independent of GUI scale");
    check(eq(exportPixel(referenceCanvas,16,16),background) && eq(exportPixel(referenceCanvas,39,34),background) && !referenceRenderer.hitTest(20,20,{deep:true}),
        "Transparent reference regions must reveal only the workspace, with no hidden GUI, outlines or selection targets");
    const offsetView=referenceRenderer.render(referenceScene,{...referenceOptions,reference:{...reference,x:7,y:-3}});
    check(offsetView.x===referenceView.x && offsetView.y===referenceView.y && eq(exportPixel(referenceCanvas,25,14),[208,32,64,255]) && eq(exportPixel(referenceCanvas,18,17),background),
        "Reference offsets must move image pixels without recentering the comparison camera");
    const fitOptions={...referenceOptions,scale:0};
    const fitBefore=referenceRenderer.render(referenceScene,fitOptions);
    const fitAfter=referenceRenderer.render(referenceScene,{...fitOptions,reference:{...reference,x:180,y:150}});
    check(fitBefore.scale===fitAfter.scale && fitBefore.x===fitAfter.x && fitBefore.y===fitAfter.y && parseFloat(referenceCanvas.style.width)>132 && parseFloat(referenceCanvas.style.height)>102,
        "Fit mode must keep the same scale while allowing a shifted reference to extend the scrollable surface");
    const viewportRef=referenceRenderer.render(referenceScene,{...referenceOptions,viewport:true,reference});
    check(viewportRef.x===16 && viewportRef.y===16 && viewportRef.bounds.width===1920,
        "Fit viewport camera must remain rooted in GUI viewport coordinates while reference placement uses content origin");
    const referenceDpr=Object.getOwnPropertyDescriptor(window,"devicePixelRatio");
    Object.defineProperty(window,"devicePixelRatio",{configurable:true,value:2});
    const zoomedReference=referenceRenderer.render(referenceScene,{...referenceOptions,scale:2,panX:30,panY:40,reference});
    check(zoomedReference.scale===2 && zoomedReference.x===16-250*2+30 && zoomedReference.y===16+40*2+40 && eq(exportPixel(referenceCanvas,102,118),[208,32,64,255]),
        "Reference rendering must use normal camera zoom, pan and display DPI");
    const exportedReference=await referenceRenderer.exportImage(referenceScene,{...reference,x:10000.5,y:-20000.5});
    check(exportedReference.width===6 && exportedReference.height===6 && eq(pixelsOf(exportedReference),baselineExport),
        "Copying a visible reference must preserve original pixels, transparent crop and ignore offsets, GUI scale, zoom, pan and DPI");
    if(referenceDpr)Object.defineProperty(window,"devicePixelRatio",referenceDpr);else delete window.devicePixelRatio;
    const standaloneReference=referenceRenderer.render(null,{...referenceOptions,reference});
    check(standaloneReference.bounds.x===0 && standaloneReference.bounds.y===0 && standaloneReference.bounds.width===10 && standaloneReference.bounds.height===8 && eq(exportPixel(referenceCanvas,18,17),[208,32,64,255]),
        "A reference must remain viewable with no analyzed GUI scene");
    const standaloneExport=await referenceRenderer.exportImage(null,reference);
    check(standaloneExport.width===6 && standaloneExport.height===6 && eq(pixelsOf(standaloneExport),baselineExport),
        "A standalone reference must also support original-size transparent export");
    referenceRenderer.render(referenceScene,referenceOptions);
    check(referenceRenderer.hitTest(20,20)===backgroundNode,"Leaving reference mode must restore normal interface selection");
    referenceRenderer.dispose();

    // Manual visibility filters paint/selection/export without relaying out or
    // editing the game's own hidden flags. Separate canvas roots still belong
    // to their logical parent for this purpose.
    const hideRed=document.createElement("canvas");hideRed.width=hideRed.height=1;
    hideRed.getContext("2d").fillStyle="#d02040";hideRed.getContext("2d").fillRect(0,0,1,1);
    const hideAssets={blue:exportAssets.solid,red:{name:"hide_red",width:1,height:1,url:hideRed.toDataURL()}};
    const hideCanvas=document.createElement("canvas"),hideRenderer=GooWeePreviewRenderer.create(hideCanvas,name=>hideAssets[name],()=>{});
    const hideNode=(id,x,y,width,height,asset,children=[])=>({id,type:asset?"Image":"Canvas",x,y,width,height,children,style:{},sprite:asset?{name:asset,color:"#ffffff",alpha:1}:null});
    const hideUnder=hideNode("hide_under",10,15,12,10,"blue");
    const hideLeaf=hideNode("hide_leaf",10,15,12,10,"red");
    const hideGroup=hideNode("hide_group",10,15,20,20,null,[hideLeaf]);
    const hideDetached=hideNode("hide_detached",70,65,6,8,"red");hideDetached.parentId=hideGroup.id;
    const sourceHidden=hideNode("source_hidden",90,10,4,4,"red");sourceHidden.hidden=true;
    const hideRoot=hideNode("hide_root",0,0,100,100,null,[hideUnder,hideGroup,sourceHidden]);
    const hideScene={roots:[hideRoot,hideLeaf,hideDetached],nodes:[hideRoot,hideUnder,hideGroup,hideLeaf,hideDetached,sourceHidden],width:100,height:100};
    const hideOptions={width:232,height:232,scale:1,outlines:false,approximateOutlines:false};
    // Cold export waits for the same fixture's images independently of live caches.
    const completeHideExport=await hideRenderer.exportImage(hideScene);
    hideRenderer.render(hideScene,hideOptions);
    await new Promise(resolve=>setTimeout(resolve,50));
    const beforeHide=hideRenderer.render(hideScene,hideOptions),hideSceneSnapshot=JSON.stringify(hideScene);
    const hideAt=(view,x,y)=>exportPixel(hideCanvas,Math.round(view.x+x*view.scale),Math.round(view.y+y*view.scale));
    check(eq(hideAt(beforeHide,14,19),[208,32,64,255])&&hideRenderer.hitTest(beforeHide.x+14,beforeHide.y+19,{deep:true})===hideLeaf,
        "Manual visibility fixture must begin with a painted selectable front child");
    const hiddenIds=new Set([hideGroup.id]);
    const afterHide=hideRenderer.render(hideScene,{...hideOptions,hiddenNodeIds:hiddenIds,selected:hideLeaf.id,hovered:hideDetached.id});
    check(eq(hideAt(afterHide,14,19),[48,64,208,255])&&hideRenderer.hitTest(afterHide.x+14,afterHide.y+19,{deep:true})===hideUnder,
        "Hiding a container must hide its descendants and expose selection of the content behind it");
    check(eq(hideAt(afterHide,72,68),background)&&hideRenderer.hitTest(afterHide.x+72,afterHide.y+68,{deep:true})===hideRoot,
        "A manually hidden parent must suppress a separately rooted child linked only through parentId");
    check(JSON.stringify(beforeHide)===JSON.stringify(afterHide)&&JSON.stringify(hideScene)===hideSceneSnapshot,
        "Manual hiding must preserve the camera, content bounds, coordinates and source visibility flags");
    const hiddenFirstRoots={...hideScene,roots:[hideLeaf,hideDetached,hideRoot]};
    hideRenderer.render(hiddenFirstRoots,{...hideOptions,hiddenNodeIds:hiddenIds});
    check(eq(hideAt(afterHide,14,19),[48,64,208,255])&&eq(hideAt(afterHide,72,68),background),
        "Duplicate roots must not escape a hidden parent even when they precede it in paint order");
    const fitHideBefore=hideRenderer.render(hideScene,{...hideOptions,scale:0});
    const fitHideAfter=hideRenderer.render(hideScene,{...hideOptions,scale:0,hiddenNodeIds:new Set([hideRoot.id])});
    check(JSON.stringify(fitHideBefore)===JSON.stringify(fitHideAfter)&&!hideRenderer.hitTest(40,40,{deep:true}),
        "Hiding the entire interface must preserve Fit framing while removing all hit targets");
    const filteredExport=await hideRenderer.exportImage(hideScene,null,{hiddenNodeIds:hiddenIds});
    check(filteredExport.width===12&&filteredExport.height===10&&eq(exportPixel(filteredExport,5,5),[48,64,208,255])&&completeHideExport.width>filteredExport.width,
        "GUI export must crop to the remaining visible interface and omit manually hidden subtrees");
    let hiddenExportError=null;
    try{await hideRenderer.exportImage(hideScene,null,{hiddenNodeIds:new Set([hideRoot.id])});}catch(error){hiddenExportError=error;}
    check(hiddenExportError&&/visible|empty|nothing/i.test(hiddenExportError.message),
        "Copying a fully manually hidden interface must fail clearly instead of exporting a blank image");
    const changingFilter=new Set([hideGroup.id]);
    const capturedExportPromise=hideRenderer.exportImage(hideScene,null,{hiddenNodeIds:changingFilter});
    changingFilter.clear();
    const capturedExport=await capturedExportPromise;
    check(capturedExport.width===filteredExport.width&&capturedExport.height===filteredExport.height&&eq(pixelsOf(capturedExport),pixelsOf(filteredExport)),
        "An in-flight copy must preserve the visibility filter captured before awaiting assets");
    const referenceBeforeHide=hideRenderer.render(hideScene,{...hideOptions,reference});
    const referencePixelsBeforeHide=pixelsOf(hideCanvas);
    const referenceAfterHide=hideRenderer.render(hideScene,{...hideOptions,reference,hiddenNodeIds:new Set([hideRoot.id])});
    check(JSON.stringify(referenceBeforeHide)===JSON.stringify(referenceAfterHide)&&eq(referencePixelsBeforeHide,pixelsOf(hideCanvas)),
        "Manually hiding interface elements must not move or hide the displayed reference");
    const hideReferenceExport=await hideRenderer.exportImage(hideScene,reference,{hiddenNodeIds:new Set([hideRoot.id])});
    check(eq(pixelsOf(hideReferenceExport),baselineExport),"Reference export must ignore the GUI's manual visibility filter");
    const restoredHideView=hideRenderer.render(hideScene,{...hideOptions,hiddenNodeIds:new Set()});
    await new Promise(resolve=>setTimeout(resolve,50));
    hideRenderer.render(hideScene,{...hideOptions,hiddenNodeIds:new Set()});
    check(eq(hideAt(restoredHideView,14,19),[208,32,64,255])&&eq(hideAt(restoredHideView,91,11),background)&&sourceHidden.hidden,
        "Clearing manual hides must restore UI pixels while preserving elements hidden by project code");
    hideRenderer.dispose();

    // Nearest-neighbor sprite sampling must survive every intermediate surface,
    // without changing the rasterization of separately drawn preview text.
    const sharpSource=document.createElement("canvas");sharpSource.width=sharpSource.height=4;
    const sharpSourceContext=sharpSource.getContext("2d");
    sharpSourceContext.fillStyle="#e02040";sharpSourceContext.fillRect(0,0,2,4);
    sharpSourceContext.fillStyle="#20c080";sharpSourceContext.fillRect(2,0,2,4);
    const sharpColors=[[224,32,64,255],[32,192,128,255]];
    const sharpAsset={name:"sharp_pixel_fixture",width:4,height:4,url:sharpSource.toDataURL()};
    const isSourceColor=value=>sharpColors.some(color=>eq(value,color));
    const spriteScan=(width,y)=>Array.from({length:width},(_,x)=>[...ctx.getImageData(16+x,16+y,1,1).data]);
    await draw(sharpAsset,{width:8,height:8,zoom:4});
    const smoothSpriteScan=spriteScan(32,16);
    check(smoothSpriteScan.some(value=>!isSourceColor(value)),"Ordinary zoom must retain interpolated sprite sampling by default");
    await draw(sharpAsset,{width:8,height:8,zoom:4,sharpPixels:true});
    check(spriteScan(32,16).every(isSourceColor) && eq(spriteScan(32,16)[15],sharpColors[0]) && eq(spriteScan(32,16)[16],sharpColors[1]),
        "Sharp sprite zoom must show exact source colors with a single crisp boundary after both GUI sizing and preview zoom");
    await draw(sharpAsset,{width:8,height:8,zoom:4});
    check(spriteScan(32,16).every((value,index)=>eq(value,smoothSpriteScan[index])),"Turning sharp pixels off must restore the original filtered sprite pixels");
    for(const tileMode of [0,1,2]) {
        const slicedSharp={...sharpAsset,nineSlice:{left:1,top:1,right:1,bottom:1,tileMode:[tileMode,tileMode,tileMode,tileMode,tileMode]}};
        await draw(slicedSharp,{width:10,height:8,zoom:4,sharpPixels:true});
        check(spriteScan(40,16).every(isSourceColor),"Sharp NineSlice must keep exact source colors through its stitched surface in mode "+tileMode);
    }
    const sharpComposite={width:8,height:8,layers:[{sprite:{name:sharpAsset.name,color:"#ffffff",alpha:1},x:0,y:0,width:8,height:8}]};
    await draw(sharpAsset,{width:8,height:8,zoom:4,spec:sharpComposite});
    const smoothCompositeScan=spriteScan(32,16);
    check(smoothCompositeScan.some(value=>!isSourceColor(value)),"The composite fixture must cache a scaled layer with filtered source pixels");
    await draw(sharpAsset,{width:8,height:8,zoom:4,spec:sharpComposite,sharpPixels:true});
    check(spriteScan(32,16).every(isSourceColor),"Sharp composite drawing must rebuild filtered layer caches and preserve nearest-neighbor pixels inside the capture");
    await draw(sharpAsset,{width:8,height:8,zoom:4,spec:sharpComposite});
    check(spriteScan(32,16).every((value,index)=>eq(value,smoothCompositeScan[index])),"Switching composite sampling back must recover its smooth pixels without retaining a sharp cache");

    const sharpReference=new Image();
    await new Promise((resolve,reject)=>{sharpReference.onload=resolve;sharpReference.onerror=reject;sharpReference.src=sharpAsset.url;});
    const samplingCanvas=document.createElement("canvas");
    const glyphSampling=[];
    const samplingFonts={
        measure(){return {width:8,height:8};},
        draw(context,text,x,y){glyphSampling.push(context.imageSmoothingEnabled);context.drawImage(sharpSource,x,y,8,8);return true;}
    };
    let samplingLoadResolve,samplingResolvedAsset=sharpAsset;
    const samplingRenderer=GooWeePreviewRenderer.create(samplingCanvas,()=>samplingResolvedAsset,()=>{if(samplingLoadResolve)samplingLoadResolve();},samplingFonts);
    const samplingOptions={width:64,height:64,scale:8,outlines:false,approximateOutlines:false};
    const samplingPixel=(x,y)=>[...samplingCanvas.getContext("2d").getImageData(x,y,1,1).data];
    samplingRenderer.render(null,{...samplingOptions,reference:{image:sharpReference,x:0,y:0}});
    const smoothReferenceScan=Array.from({length:32},(_,x)=>samplingPixel(16+x,32));
    samplingRenderer.render(null,{...samplingOptions,sharpPixels:true,reference:{image:sharpReference,x:0,y:0}});
    check(smoothReferenceScan.some(value=>!isSourceColor(value)) && Array.from({length:32},(_,x)=>samplingPixel(16+x,32)).every(isSourceColor),
        "Sharp reference zoom must enlarge each original image pixel without blending it with adjacent pixels");
    const fontNode={id:"sampling_font",type:"Label",x:0,y:0,width:32,height:16,text:"A",style:{fontResource:"fixture_font",fontSize:10},children:[]};
    const fontScene={roots:[fontNode],nodes:[fontNode],width:32,height:16};
    const fontPixels=()=>samplingCanvas.getContext("2d").getImageData(18,18,120,56).data;
    samplingRenderer.render(fontScene,{...samplingOptions,scale:4});
    const smoothFontPixels=fontPixels();
    samplingRenderer.render(fontScene,{...samplingOptions,scale:4,sharpPixels:true});
    check(glyphSampling.length===2 && glyphSampling.every(Boolean) && eq(fontPixels(),smoothFontPixels),
        "Project bitmap/SDF font draws must retain smoothing and identical glyph pixels when sharp sprites are enabled");
    delete fontNode.style.fontResource;fontNode.style.fontSize=11;fontNode.text="Aa";
    samplingRenderer.render(fontScene,{...samplingOptions,scale:4});
    const smoothNativeText=fontPixels();
    samplingRenderer.render(fontScene,{...samplingOptions,scale:4,sharpPixels:true});
    check(eq(fontPixels(),smoothNativeText),"Native preview font glyphs must keep their antialiasing when sharp sprite sampling changes");
    const samplingNode={id:"sampling_sprite",type:"Image",x:0,y:0,width:8,height:8,children:[],style:{},sprite:{name:sharpAsset.name,alpha:1,color:"#ffffff"}};
    const samplingScene={roots:[samplingNode],nodes:[samplingNode],width:8,height:8};
    const smoothExport=await samplingRenderer.exportImage(samplingScene);
    const sharpExport=await samplingRenderer.exportImage(samplingScene,null,{sharpPixels:true});
    check(smoothExport.width===8 && sharpExport.width===8 && !isSourceColor(exportPixel(smoothExport,3,4)) && isSourceColor(exportPixel(sharpExport,3,4)),
        "Original-size export must honor sharp sprite sampling without changing layout dimensions");

    // A large interface at 800% must not be downsampled merely to fit the
    // backing-store budget. Its visible scroll viewport stays at screen density.
    const samplingViewport=document.createElement("div"),samplingSurface=document.createElement("div");
    samplingViewport.style.cssText="position:absolute;left:0;top:0;width:300px;height:200px;overflow:auto;scrollbar-width:none";
    samplingCanvas.style.position="sticky";samplingCanvas.style.left="0";samplingCanvas.style.top="0";
    samplingSurface.appendChild(samplingCanvas);samplingViewport.appendChild(samplingSurface);document.body.appendChild(samplingViewport);
    samplingNode.x=1200;samplingNode.y=700;
    const samplingRoot={id:"sampling_large_root",type:"Canvas",x:0,y:0,width:2000,height:1000,children:[samplingNode],style:{}};
    const largeSamplingScene={roots:[samplingRoot],nodes:[samplingRoot,samplingNode],width:2000,height:1000};
    const largeSamplingOptions={width:300,height:200,scale:8,sharpPixels:true,outlines:false,approximateOutlines:false,
        surface:{container:samplingSurface,viewport:samplingViewport}};
    const samplingLoaded=new Promise(resolve=>{samplingLoadResolve=resolve;});
    samplingRenderer.render(largeSamplingScene,largeSamplingOptions);
    await Promise.race([samplingLoaded,new Promise((_,reject)=>setTimeout(()=>reject(new Error("High-zoom sampling sprite did not load")),5000))]);
    samplingLoadResolve=null;
    const canvasPosition=samplingCanvas.getBoundingClientRect();
    check(parseFloat(samplingSurface.style.width)===16032 && parseFloat(samplingSurface.style.height)===8032 &&
        parseFloat(samplingCanvas.style.width)===300 && parseFloat(samplingCanvas.style.height)===200 &&
        samplingCanvas.width>=300 && samplingCanvas.width<=600 && samplingCanvas.height>=200 && samplingCanvas.height<=400,
        "800% rendering must retain the full scrollable extent while keeping a small viewport canvas at native display density");
    samplingViewport.scrollLeft=9600;samplingViewport.scrollTop=5600;
    const scrolledSampling=samplingRenderer.render(largeSamplingScene,largeSamplingOptions);
    const backingScale=samplingCanvas.width/300;
    const largePixel=(x,y)=>samplingPixel(Math.floor(x*backingScale),Math.floor(y*backingScale));
    check(samplingCanvas.getBoundingClientRect().left===canvasPosition.left && samplingCanvas.getBoundingClientRect().top===canvasPosition.top &&
        scrolledSampling.x===-9584 && scrolledSampling.y===-5584 && samplingRenderer.hitTest(32,32,{deep:true})===samplingNode,
        "A scrolled high-zoom canvas must remain attached to the viewport with matching local paint and hit-test coordinates");
    check(Array.from({length:64},(_,x)=>largePixel(16+x,48)).every(isSourceColor) && eq(largePixel(47,48),sharpColors[0]) && eq(largePixel(48,48),sharpColors[1]),
        "A sprite deep inside a large scrolled interface must preserve crisp source pixels at 800% rather than a blurred reduced backing store");
    samplingRenderer.render(largeSamplingScene,{...largeSamplingOptions,reference:{image:sharpReference,x:1200,y:700}});
    check(Array.from({length:32},(_,x)=>largePixel(16+x,32)).every(isSourceColor) && eq(largePixel(31,32),sharpColors[0]) && eq(largePixel(32,32),sharpColors[1]),
        "A reference deep inside the high-zoom scrollable surface must retain native nearest-neighbor pixels too");
    samplingResolvedAsset={...sharpAsset,nineSlice:{left:1,top:1,right:1,bottom:1,tileMode:[1,1,1,1,1]}};
    const largeSlicedNode={...samplingRoot,type:"Image",children:[],sprite:{name:sharpAsset.name,alpha:1,color:"#ffffff"}};
    const largeSlicedScene={roots:[largeSlicedNode],nodes:[largeSlicedNode],width:2000,height:1000};
    samplingRenderer.render(largeSlicedScene,largeSamplingOptions);
    check(Array.from({length:280},(_,x)=>eq(largePixel(x,48),sharpColors[Math.floor(x/8)%2===0?1:0])).every(Boolean),
        "A large repeated NineSlice at 800% must keep each source texel exactly eight screen pixels wide after scrolling");
    samplingResolvedAsset={...samplingResolvedAsset,originX:2,originY:2};
    largeSlicedNode.style={angle:90,flipHorizontal:true};
    samplingRenderer.render(largeSlicedScene,largeSamplingOptions);
    const rotatedSliceScan=Array.from({length:160},(_,y)=>largePixel(48,y));
    check(rotatedSliceScan.every(isSourceColor) && rotatedSliceScan.every((value,y)=>eq(value,rotatedSliceScan[Math.floor(y/8)*8])) &&
        !eq(rotatedSliceScan[0],rotatedSliceScan[8]) && eq(rotatedSliceScan[0],rotatedSliceScan[16]),
        "Clipped large NineSlice sampling must retain full-resolution repeated texels after rotation and horizontal flipping");
    samplingResolvedAsset=sharpAsset;
    samplingViewport.remove();
    const comparison=document.createElement("canvas");comparison.width=992;comparison.height=528;
    const comparisonContext=comparison.getContext("2d");comparisonContext.fillStyle="#20252d";comparisonContext.fillRect(0,0,992,528);
    const comparisonSprite={...samplingNode,x:2,y:6,width:8,height:8};
    const comparisonText={...fontNode,x:12,y:6,width:40,height:10,text:"Text 12",style:{fontSize:8}};
    const comparisonRoot={id:"comparison_root",type:"Canvas",x:0,y:0,width:58,height:22,children:[comparisonSprite,comparisonText],style:{}};
    const comparisonScene={roots:[comparisonRoot],nodes:[comparisonRoot,comparisonSprite,comparisonText],width:58,height:22};
    const referenceFixture=document.createElement("canvas");referenceFixture.width=58;referenceFixture.height=22;
    const referenceFixtureContext=referenceFixture.getContext("2d");referenceFixtureContext.drawImage(sharpSource,2,6,8,8);
    referenceFixtureContext.fillStyle="#e5e7eb";referenceFixtureContext.font="8px sans-serif";referenceFixtureContext.textBaseline="top";referenceFixtureContext.fillText("Text 12",12,6);
    const comparisonReference=new Image();
    await new Promise((resolve,reject)=>{comparisonReference.onload=resolve;comparisonReference.onerror=reject;comparisonReference.src=referenceFixture.toDataURL();});
    for(const [column,sharp] of [[0,false],[1,true]]) {
        const comparisonOptions={width:496,height:208,scale:8,sharpPixels:sharp,outlines:false,approximateOutlines:false};
        samplingRenderer.render(comparisonScene,comparisonOptions);
        comparisonContext.drawImage(samplingCanvas,column*496,40,496,208);
        samplingRenderer.render(comparisonScene,{...comparisonOptions,reference:{image:comparisonReference,x:0,y:0}});
        comparisonContext.drawImage(samplingCanvas,column*496,304,496,208);
        comparisonContext.fillStyle="#e5e7eb";comparisonContext.font="15px sans-serif";
        comparisonContext.fillText((sharp?"Sharp pixels":"Smooth")+" — sprites and live text, 800%",column*496+16,24);
        comparisonContext.fillText((sharp?"Sharp pixels":"Smooth")+" — reference image, 800%",column*496+16,288);
    }
    const sharpPixelsScreenshot=require("path").join(config.directory,"sharp-pixels-comparison.png");
    require("fs").writeFileSync(sharpPixelsScreenshot,Buffer.from(comparison.toDataURL().split(",")[1],"base64"));
    samplingRenderer.dispose();

    // Navigation transforms and diagnostic overlays must agree with hit testing.
    const navigationCanvas = document.createElement("canvas"), navigationContext = navigationCanvas.getContext("2d");
    const navigationRenderer = GooWeePreviewRenderer.create(navigationCanvas, () => null, () => {});
    const approximateChild = {id:"approximate_child",type:"Container",x:20,y:25,width:30,height:20,approximate:true,children:[],style:{}};
    const navigationRoot = {id:"navigation_root",type:"Canvas",x:0,y:0,width:200,height:200,children:[approximateChild],style:{}};
    const navigationScene = {roots:[navigationRoot],nodes:[navigationRoot,approximateChild],width:200,height:200};
    const navigationOptions = {width:232,height:232,scale:1,outlines:false};
    const edgePixels = () => Array.from({length:26},(_,i)=>[...navigationContext.getImageData(38+i,41,1,1).data]);
    navigationRenderer.render(navigationScene,navigationOptions);
    const dashedEdge = edgePixels();
    check(dashedEdge.some(value=>!eq(value,background)) && dashedEdge.some(value=>eq(value,background)), "Approximate outlines must be dashed and visible by default");
    navigationRenderer.render(navigationScene,{...navigationOptions,approximateOutlines:false});
    check(edgePixels().every(value=>eq(value,background)), "Disabling approximate outlines must remove the amber dashed rectangle");
    navigationRenderer.render(navigationScene,{...navigationOptions,approximateOutlines:false,outlines:true});
    check(edgePixels().every(value=>!eq(value,background)), "Bounds must still show a solid rectangle when approximate outlines are disabled");
    navigationRenderer.render(navigationScene,{...navigationOptions,approximateOutlines:false,selected:approximateChild.id});
    check(edgePixels().every(value=>eq(value,[85,204,255,255])), "Disabling approximate outlines must preserve the selected element's solid highlight");
    approximateChild.sprite={name:"missing_navigation_sprite",color:"#ffffff",alpha:1};
    navigationRenderer.render(navigationScene,{...navigationOptions,approximateOutlines:false});
    const missingEdge=edgePixels(), missingFill=[...navigationContext.getImageData(45,47,1,1).data];
    check(missingEdge.every(value=>eq(value,missingEdge[0]) && !eq(value,missingFill)), "A missing sprite must retain a solid diagnostic border without amber dashes");
    delete approximateChild.sprite;
    const previousSize=[navigationCanvas.style.width,navigationCanvas.style.height];
    const panned=navigationRenderer.render(navigationScene,{...navigationOptions,panX:30,panY:-12});
    check(panned.x===46 && panned.y===4 && panned.scale===1 && panned.bounds.width===200, "Renderer must return the actual CSS transform after panning");
    check(navigationRenderer.hitTest(81,39)===approximateChild && navigationRenderer.hitTest(51,51)===navigationRoot, "Panning must move element hit targets together with their visible rectangles");
    check(navigationCanvas.style.width===previousSize[0] && navigationCanvas.style.height===previousSize[1], "Panning must not change canvas scroll dimensions");
    const scaledPan=navigationRenderer.render(navigationScene,{...navigationOptions,scale:2,panX:30,panY:-12});
    check(scaledPan.x===46 && scaledPan.y===4 && navigationRenderer.hitTest(116,74)===approximateChild, "Pan offsets stay in CSS pixels independently of zoom");
    const invalidPan=navigationRenderer.render(navigationScene,{...navigationOptions,panX:NaN,panY:Infinity});
    check(invalidPan.x===16 && invalidPan.y===16, "Nonfinite pan offsets must not corrupt the renderer transform");

    // Hover predicts the click target without changing the persistent selection.
    const cleanOptions={...navigationOptions,approximateOutlines:false};
    const navigationPixel=(x,y)=>[...navigationContext.getImageData(x,y,1,1).data];
    const navigationPixels=()=>navigationContext.getImageData(0,0,navigationCanvas.width,navigationCanvas.height).data;
    const hoverPixels=()=>navigationContext.getImageData(32,37,38,28).data;
    navigationRenderer.render(navigationScene,cleanOptions);
    const withoutHover=hoverPixels();
    navigationRenderer.render(navigationScene,{...cleanOptions,hovered:approximateChild.id});
    const hoveredEdge=edgePixels(), hoverEdgeColor=hoveredEdge[0];
    check(hoveredEdge.every(value=>eq(value,hoverEdgeColor) && !eq(value,background)), "Hover must show a solid blue outline even when both bounds options are disabled");
    check(eq(navigationPixel(45,46),background), "Hover must leave the element interior transparent");
    navigationRenderer.render(navigationScene,{...cleanOptions,hovered:approximateChild.id,selected:navigationRoot.id});
    check(eq(navigationPixel(16,16),[85,204,255,255]) && eq(edgePixels()[0],hoverEdgeColor), "Hovering another element must preserve the selected element's thicker highlight");
    navigationRenderer.render(navigationScene,{...cleanOptions,selected:approximateChild.id});
    const selectedOnly=navigationPixels();
    navigationRenderer.render(navigationScene,{...cleanOptions,selected:approximateChild.id,hovered:approximateChild.id});
    check(eq(navigationPixels(),selectedOnly), "Hovering the selected element must not double its outline or alter selection pixels");
    navigationRenderer.render(navigationScene,cleanOptions);
    check(eq(hoverPixels(),withoutHover), "Clearing hover must remove its previous outline completely");
    navigationRenderer.render(navigationScene,{...cleanOptions,hovered:"absent_node"});
    check(eq(hoverPixels(),withoutHover), "Stale hover IDs must not produce an outline");
    approximateChild.hidden=true;
    navigationRenderer.render(navigationScene,{...cleanOptions,hovered:approximateChild.id});
    check(eq(hoverPixels(),withoutHover), "Hidden elements must not receive hover outlines");
    approximateChild.hidden=false; navigationRoot.hidden=true;
    navigationRenderer.render(navigationScene,{...cleanOptions,hovered:approximateChild.id});
    check(eq(edgePixels()[0],background), "An element below a hidden ancestor must not retain hover highlighting");
    navigationRoot.hidden=false;
    navigationRenderer.render(navigationScene,{...cleanOptions,hovered:approximateChild.id,scale:2,panX:30,panY:-12});
    check(eq(navigationPixel(92,54),hoverEdgeColor) && eq(navigationPixel(92,55),background) && eq(navigationPixel(42,41),background), "Hover must follow pan/zoom while retaining its one CSS-pixel line width");
    navigationRenderer.dispose();

    // Scroll contents affect layout, but only their viewport is painted or hit.
    const clippedCanvas=document.createElement("canvas"), clippedContext=clippedCanvas.getContext("2d");
    const clippedRenderer=GooWeePreviewRenderer.create(clippedCanvas,()=>null,()=>{});
    const clippedLeaf={id:"scroll_leaf",type:"Container",x:10,y:20,width:120,height:440,children:[],style:{},background:{name:"missing_scroll_background"}};
    const nestedViewport={id:"nested_viewport",type:"Float",x:30,y:40,width:40,height:25,children:[clippedLeaf],style:{},clipChildren:true};
    const viewport={id:"viewport",type:"Float",x:20,y:30,width:80,height:60,children:[clippedLeaf],style:{},clipChildren:true};
    const clippedRoot={id:"clipped_root",type:"Canvas",x:0,y:0,width:200,height:200,children:[viewport],style:{}};
    const clippedScene={roots:[clippedRoot],nodes:[clippedRoot,viewport,clippedLeaf],width:200,height:200};
    const clippedOptions={width:232,height:232,scale:1,approximateOutlines:false};
    const clippedPixel=(x,y)=>[...clippedContext.getImageData(16+x,16+y,1,1).data];
    let clippedView=clippedRenderer.render(clippedScene,clippedOptions);
    check(clippedView.bounds.height===200,"Offscreen scroll content must not enlarge Fit content bounds");
    check(!eq(clippedPixel(40,50),background) && eq(clippedPixel(40,110),background) && eq(clippedPixel(15,50),background),"Scroll content must paint only inside its viewport");
    check(clippedRenderer.hitTest(56,66,{deep:true})===clippedLeaf && clippedRenderer.hitTest(56,126,{deep:true})===clippedRoot,"Clipped-away content must not intercept selection or hover");
    clippedRenderer.render(clippedScene,{...clippedOptions,hovered:clippedLeaf.id,selected:clippedLeaf.id});
    check(eq(clippedPixel(10,110),background),"Selected and hovered outlines must obey the scroll clip");
    viewport.children=[nestedViewport];clippedScene.nodes.push(nestedViewport);
    clippedRenderer.render(clippedScene,clippedOptions);
    check(!eq(clippedPixel(40,50),background) && eq(clippedPixel(80,50),background) && clippedRenderer.hitTest(96,66,{deep:true})===viewport,"Nested scroll viewports must intersect their paint and hit-test regions");
    viewport.children=[clippedLeaf];
    clippedRenderer.render(clippedScene,clippedOptions);
    const once=clippedContext.getImageData(0,0,clippedCanvas.width,clippedCanvas.height).data;
    clippedScene.roots.push(viewport,clippedLeaf);
    clippedRenderer.render(clippedScene,clippedOptions);
    check(eq(clippedContext.getImageData(0,0,clippedCanvas.width,clippedCanvas.height).data,once),"A separately referenced canvas subtree must not paint twice or escape its clip");
    clippedView=clippedRenderer.render(clippedScene,{...clippedOptions,scale:2,panX:23,panY:-9});
    check(clippedRenderer.hitTest(clippedView.x+40*2,clippedView.y+50*2,{deep:true})===clippedLeaf && clippedRenderer.hitTest(clippedView.x+40*2,clippedView.y+110*2,{deep:true})===clippedRoot,"Scroll clipping and hit testing must stay aligned after pan and zoom");
    clippedRenderer.dispose();

    // A later root frame must not block Ctrl-selection of nested content.
    const deepCanvas=document.createElement("canvas"), deepRenderer=GooWeePreviewRenderer.create(deepCanvas,()=>null,()=>{});
    const deepNode=(id,type,x,y,width,height,children=[])=>({id,type,x,y,width,height,children,style:{}});
    const deepLabel=deepNode("knowledge_title","Label",60,20,80,25);deepLabel.text="Knowledge";
    const hiddenLabel=deepNode("hidden_title","Label",60,20,80,25);hiddenLabel.hidden=true;
    const hiddenGroup=deepNode("hidden_group","Container",50,10,100,45,[deepNode("hidden_descendant","Label",60,20,80,25)]);hiddenGroup.hidden=true;
    const deepHeader=deepNode("header","Container",50,10,100,45,[deepLabel,hiddenLabel,hiddenGroup]);
    const deepRoot=deepNode("content","Canvas",0,0,200,200,[deepHeader]);
    const overlay=deepNode("frame_overlay","Canvas",0,0,200,200);
    const deepScene={roots:[deepRoot,overlay],nodes:[deepRoot,deepHeader,deepLabel,hiddenLabel,hiddenGroup,overlay],width:200,height:200};
    let deepView=deepRenderer.render(deepScene,{width:232,height:232,scale:1});
    const hitDeep=(x,y,deep)=>deepRenderer.hitTest(deepView.x+x*deepView.scale,deepView.y+y*deepView.scale,{deep});
    check(hitDeep(90,30,false)===overlay,"Ordinary clicking must preserve the topmost frame selection");
    check(hitDeep(90,30,true)===deepLabel,"Deep selection must reach the text behind a separate frame canvas, ignoring hidden nodes and hidden descendants");
    check(hitDeep(55,15,true)===deepHeader,"Deep selection over empty container padding must still select that container");
    check(hitDeep(180,180,true)===overlay,"Deep selection on a frame without nested content must fall back to the topmost frame");
    check(hitDeep(250,250,true)===null,"Deep selection outside every painted rectangle must return no element");
    const laterLabel=deepNode("later_title","Label",60,20,80,25);laterLabel.text="Front";deepHeader.children.push(laterLabel);
    deepView=deepRenderer.render(deepScene,{width:232,height:232,scale:1});
    check(hitDeep(90,30,true)===laterLabel,"Equally nested overlapping elements must retain their reverse paint order");
    deepView=deepRenderer.render(deepScene,{width:232,height:232,scale:2,panX:37,panY:-11});
    check(hitDeep(90,30,true)===laterLabel && hitDeep(90,30,false)===overlay,"Deep and ordinary hit tests must use the same panned and zoomed transform");
    // Knowledge uses sibling branches: canvas -> stack -> title and
    // canvas -> frame canvas -> frame image. Both leaves are at depth two.
    const frameImage=deepNode("frame_image","Image",0,0,200,200);
    const frameCanvas=deepNode("frame_canvas","Canvas",0,0,200,200,[frameImage]);
    deepRoot.children.push(frameCanvas); deepScene.roots=[deepRoot];
    deepView=deepRenderer.render(deepScene,{width:232,height:232,scale:2,panX:37,panY:-11});
    check(hitDeep(90,30,false)===frameImage && hitDeep(90,30,true)===laterLabel,"Deep selection must prefer the tighter title bounds over an equally nested broad frame image");
    check(hitDeep(180,180,true)===frameImage,"A broad frame image remains selectable where it does not overlap more specific nested content");
    deepRenderer.dispose();
    check(deepRenderer.hitTest(100,100,{deep:true})===null,"Disposal must clear deep-selection candidates");

    // Transparent controls must not add a synthetic backing behind child icons.
    async function alphaHierarchy(asset, tint = false, checkMissing = false) {
        const backing = document.createElement("canvas"); backing.width = backing.height = 64;
        const backingContext = backing.getContext("2d");
        for (let y=0;y<64;y++) for (let x=0;x<64;x++) {
            backingContext.fillStyle = `rgb(${35+x%7*12},${45+y%5*13},${65+(x+y)%9*9})`;
            backingContext.fillRect(x,y,1,1);
        }
        const source = new Image(); source.src = asset.url;
        await new Promise((resolve,reject) => {source.onload=resolve;source.onerror=reject;});
        const icon = document.createElement("canvas"); icon.width=asset.width; icon.height=asset.height;
        const iconContext=icon.getContext("2d"); iconContext.drawImage(source,0,0);
        const data=iconContext.getImageData(0,0,icon.width,icon.height), alpha=data.data;
        const transparent=[], partial=[];
        for(let i=0;i<alpha.length;i+=4) {
            const point=[(i/4)%icon.width,Math.floor(i/4/icon.width)];
            if(alpha[i+3]===0) transparent.push(point);
            else if(alpha[i+3]<255) partial.push(point);
        }
        check(transparent.length>0 && partial.length>0, asset.name+" fixture must contain transparent and partially transparent source pixels");
        if(tint) {
            for(let i=0;i<alpha.length;i+=4) {
                alpha[i]*=128/255; alpha[i+1]*=192/255; alpha[i+2]*=96/255;
            }
            iconContext.putImageData(data,0,0);
        }
        const expected=document.createElement("canvas"); expected.width=expected.height=64;
        const expectedContext=expected.getContext("2d"); expectedContext.drawImage(backing,0,0);
        expectedContext.globalAlpha=tint ? 0.6 : 1; expectedContext.drawImage(icon,8,8);
        const backingAsset={name:"alpha_backdrop",width:64,height:64,url:backing.toDataURL()};
        const output=document.createElement("canvas");
        let ready=0, completed;
        const loaded=new Promise(resolve => {completed=resolve;});
        const alphaRenderer=GooWeePreviewRenderer.create(output, name=>name===backingAsset.name ? backingAsset : name===asset.name ? asset : null,()=>{if(++ready===2) completed();});
        const makeNode=(id,type,x,y,width,height)=>({id,type,name:id,x,y,width,height,children:[],style:{},sprite:null,background:null});
        const root=makeNode("alpha_root","Canvas",0,0,64,64);
        root.background={name:backingAsset.name,color:"#ffffff",alpha:1};
        let parent=root;
        const nodes=[root];
        for(const type of ["Canvas","Container","Control","Float","Panel","StackPanel","WrapPanel","Button"]) {
            const next=makeNode("unstyled_"+type,type,8,8,asset.width,asset.height);
            parent.children.push(next);nodes.push(next);parent=next;
        }
        const image=makeNode("alpha_icon","Image",8,8,asset.width,asset.height);
        image.sprite={name:asset.name,color:tint ? "#80c060" : "#ffffff",alpha:tint ? 0.6 : 1};
        parent.children.push(image);nodes.push(image);
        const emptyButton=makeNode("empty_button","Button",42,8,12,12);root.children.push(emptyButton);nodes.push(emptyButton);
        const scene={roots:[root],nodes,width:64,height:64}, options={width:96,height:96,scale:1,outlines:false};
        alphaRenderer.render(scene,options);
        await Promise.race([loaded,new Promise((_,reject)=>setTimeout(()=>reject(new Error("Alpha fixture images did not load")),5000))]);
        alphaRenderer.render(scene,options);
        const outputContext=output.getContext("2d");
        const actual=(x,y)=>[...outputContext.getImageData(16+x,16+y,1,1).data];
        const wanted=(x,y)=>[...expectedContext.getImageData(x,y,1,1).data];
        check(transparent.every(([x,y])=>eq(actual(8+x,8+y),wanted(8+x,8+y),1)),asset.name+" transparent holes must show the original background through every unstyled ancestor"+(tint ? " with tint/alpha" : ""));
        check(partial.every(([x,y])=>eq(actual(8+x,8+y),wanted(8+x,8+y),2)),asset.name+" partial-alpha pixels must composite against the original background without a parent rectangle"+(tint ? " with tint/alpha" : ""));
        check(eq(actual(46,12),wanted(46,12)),"An empty Button with no explicit background must remain transparent");
        if(checkMissing) {
            image.sprite.name="missing_alpha_icon"; alphaRenderer.render(scene,options);
            const base=[...backingContext.getImageData(12,12,1,1).data];
            check(!eq(actual(12,12),base),"An explicitly missing sprite must retain its visual placeholder");
        }
        alphaRenderer.dispose();
    }

    const alphaFixture=document.createElement("canvas");alphaFixture.width=alphaFixture.height=12;
    const alphaContext=alphaFixture.getContext("2d");
    alphaContext.fillStyle="rgba(210,100,50,0.5)";alphaContext.fillRect(3,3,6,6);
    alphaContext.fillStyle="rgb(80,170,220)";alphaContext.fillRect(5,5,2,2);
    const alphaAsset={name:"transparent_icon",width:12,height:12,url:alphaFixture.toDataURL()};
    await alphaHierarchy(alphaAsset,false,true);
    await alphaHierarchy(alphaAsset,true);
    const slicedAlphaAsset={...alphaAsset,name:"transparent_sliced_icon",
        nineSlice:{left:3,top:3,right:3,bottom:3,tileMode:[1,1,1,1,1]}};
    await alphaHierarchy(slicedAlphaAsset);
    await alphaHierarchy(slicedAlphaAsset,true);

    // Project preview layers compose into one sprite before overall alpha/tint.
    const layerSource=document.createElement("canvas");layerSource.width=layerSource.height=4;
    const layerContext=layerSource.getContext("2d");layerContext.fillStyle="#fff";layerContext.fillRect(0,0,4,4);
    const layerAsset={name:"layer_fixture",width:4,height:4,url:layerSource.toDataURL()};
    const layerSpec={width:8,height:4,alpha:0.5,layers:[
        {sprite:{name:"layer_fixture",color:"#ff0000",alpha:1},x:0,y:0,width:4,height:4},
        {sprite:{name:"layer_fixture",color:"#0000ff",alpha:0.5},x:2,y:0,width:4,height:4}
    ]};
    await draw(layerAsset,{width:8,height:4,spec:layerSpec});
    check(eq(pixel(1,2),[144,19,23,255],2) && eq(pixel(3,2),[80,19,87,255],2),"Layer order and tint must compose before applying the whole sprite opacity");
    check(eq(pixel(5,2),[24,28,98,255],2) && eq(pixel(6,2),background),"Layer alpha and transparent padding must be preserved");
    await draw(layerAsset,{width:8,height:4,spec:{...layerSpec,color:"#00ff00"}});
    check(eq(pixel(1,2),[16,19,23,255],2),"A composed sprite must support overall tint without changing its alpha");

    const packed={width:8,height:4,layers:[
        {sprite:{name:"layer_fixture",color:"#ff0000",alpha:1},x:0,y:0,width:4,height:4},
        {sprite:{name:"layer_fixture",color:"#0000ff",alpha:1},x:4,y:0,width:4,height:4}
    ]};
    const captured={width:8,height:8,layers:[{sprite:packed,x:3,y:2,width:4,height:4,
        originX:1,originY:1,scaleX:1,scaleY:1,crop:{x:4,y:0,width:4,height:4},matrix:[1,0,0,1,1,1]}]};
    await draw(layerAsset,{width:8,height:8,spec:captured});
    check(eq(pixel(3,2),[0,0,255,255]) && eq(pixel(2,2),background),"Nested surface frame crop uses source coordinates and captured origin/matrix");
    await draw(layerAsset,{width:8,height:8,spec:{width:8,height:8,layers:[{sprite:packed,x:6,y:2,width:4,height:4,
        scaleX:-1,scaleY:1,crop:{x:0,y:0,width:4,height:4}}]}});
    check(eq(pixel(2,3),[255,0,0,255]) && eq(pixel(6,3),background),"Captured negative sprite scale mirrors about its draw origin");

    // Shared snapshots form a DAG: traverse each distinct object once per frame.
    let sharedReads=0;
    let sharedCapture={width:4,height:4,layers:[{fill:"#ff0000",alpha:1,x:0,y:0,width:4,height:4}]};
    for(let level=0;level<14;level++){
        const child=sharedCapture,layers=Array.from({length:8},()=>({sprite:child,x:0,y:0,width:4,height:4}));
        sharedCapture={width:4,height:4};
        Object.defineProperty(sharedCapture,"layers",{enumerable:true,get(){sharedReads++;return layers;}});
    }
    await draw(layerAsset,{width:4,height:4,spec:sharedCapture});
    check(eq(pixel(1,1),[255,0,0,255]) && sharedReads<2000,"Shared capture subgraphs are visited once per frame without exponential recursion");
    const cyclicCapture={width:4,height:4,layers:[]};
    cyclicCapture.layers.push({sprite:cyclicCapture,x:0,y:0,width:4,height:4});
    await draw(layerAsset,{width:4,height:4,spec:cyclicCapture});
    await draw(layerAsset,{width:4,height:4,spec:sharedCapture});
    check(eq(pixel(1,1),[255,0,0,255]),"A cyclic capture is rejected without preventing the next render");
    let fillReads=0;
    const wideCapture={width:1,height:1,layers:Array.from({length:128},(_,index)=>({
        sprite:{width:1,height:1,layers:Array.from({length:256},()=>({
            get fill(){fillReads++;return index%2?"#ff0000":"#0000ff";},alpha:1,x:0,y:0,width:1,height:1
        }))},x:0,y:0,width:1,height:1
    }))};
    await draw(layerAsset,{width:1,height:1,spec:wideCapture});
    check(fillReads<80000,"Aggregate capture traversal is bounded across distinct subgraphs in one frame");

    // Adjacent patches belong to one sprite, including at subpixel boundaries.
    // Independent source-over antialiasing must not expose the backdrop at cuts.
    const solid = document.createElement("canvas"); solid.width = solid.height = 9;
    const solidContext = solid.getContext("2d");
    solidContext.fillStyle = "rgb(160,110,70)"; solidContext.fillRect(0,0,9,9);
    const solidAsset = {name:"continuous_slices",width:9,height:9,url:solid.toDataURL(),
        nineSlice:{left:3,top:3,right:3,bottom:3,tileMode:[1,1,1,1,1]}};
    for (const seamZoom of [1,0.73,1.37,2]) {
        await draw(solidAsset,{width:29,height:27,zoom:seamZoom,spec:{scale9:0.5,alpha:0.6}});
        const expected = [160,110,70].map((value,i)=>Math.round(value*0.6+background[i]*0.4)).concat(255);
        for (let y=1;y<Math.floor(27*seamZoom)-1;y++) for(let x=1;x<Math.floor(29*seamZoom)-1;x++) {
            const actual = [...ctx.getImageData(16+x,16+y,1,1).data];
            if(!eq(actual,expected,2)) throw new Error(`NineSlice joins must be continuous at zoom ${seamZoom}, pixel ${x},${y}: ${actual} vs ${expected}`);
        }
        check(true,"Subpixel NineSlice joins preserve coverage and sprite alpha at zoom "+seamZoom);
    }

    // Native PNG alpha must survive the intermediate NineSlice surface as well
    // as global sprite alpha, without dark or over-opaque bands along the cuts.
    const translucent=document.createElement("canvas");translucent.width=translucent.height=9;
    const translucentContext=translucent.getContext("2d");
    translucentContext.fillStyle="rgba(160,110,70,0.5)";translucentContext.fillRect(0,0,9,9);
    const translucentPixel=[...translucentContext.getImageData(4,4,1,1).data],combinedAlpha=translucentPixel[3]/255*0.6;
    const translucentExpected=translucentPixel.slice(0,3).map((value,i)=>Math.round(value*combinedAlpha+background[i]*(1-combinedAlpha))).concat(255);
    for(const sliceMode of [0,1,2]) for(const seamZoom of [0.73,1.37]) {
        const translucentAsset={...solidAsset,name:"translucent_slices",url:translucent.toDataURL(),
            nineSlice:{...solidAsset.nineSlice,tileMode:[sliceMode,sliceMode,sliceMode,sliceMode,sliceMode]}};
        await draw(translucentAsset,{width:29,height:27,zoom:seamZoom,spec:{scale9:0.5,alpha:0.6}});
        for(let y=1;y<Math.floor(27*seamZoom)-1;y++) for(let x=1;x<Math.floor(29*seamZoom)-1;x++) {
            const actual=[...ctx.getImageData(16+x,16+y,1,1).data];
            if(!eq(actual,translucentExpected,2)) throw new Error(`Native-alpha NineSlice joins must be continuous in mode ${sliceMode}, zoom ${seamZoom}, pixel ${x},${y}: ${actual} vs ${translucentExpected}`);
        }
        check(true,"Native-alpha NineSlice joins remain continuous in mode "+sliceMode+" at zoom "+seamZoom);
    }

    await draw(mode(1));
    check(eq(pixel(3,4),colorAt(3,4)) && eq(pixel(11,4),colorAt(3,4)) && eq(pixel(19,12),colorAt(3,4)), "Repeat center must preserve the native asymmetric motif in both axes");
    check(eq(pixel(26,24),colorAt(2,8)), "The final repeat tiles must crop instead of stretching to fit the remainder");
    check(eq(pixel(3,1),colorAt(3,1)) && eq(pixel(11,1),colorAt(3,1)), "Top strip must repeat horizontally");
    check(eq(pixel(1,3),colorAt(1,3)) && eq(pixel(1,11),colorAt(1,3)), "Left strip must repeat vertically");
    check(eq(pixel(27,3),colorAt(10,3)) && eq(pixel(27,11),colorAt(10,3)), "Right strip must repeat vertically without changing its source edge");
    check(eq(pixel(3,25),colorAt(3,10)) && eq(pixel(11,25),colorAt(3,10)), "Bottom strip must repeat horizontally without changing its source edge");
    check(eq(pixel(1,1),colorAt(1,1)) && eq(pixel(27,25),colorAt(10,10)), "Repeat modes must preserve fixed corner pixels");
    await draw(mode(1),{zoom:2});
    check(eq(pixel(3,4),pixel(11,4)) && eq(pixel(3,4),pixel(19,12)) && !eq(pixel(3,4),pixel(7,4)), "Canvas zoom must scale the whole repeated pattern without changing its layout-space period");

    // Filtering a repeated edge must not wrap its fixed thickness. In particular,
    // the top source row must never pick up the bottom row of the top strip.
    const edgeReference=document.createElement("canvas");edgeReference.width=edgeReference.height=24;
    const edgeReferenceContext=edgeReference.getContext("2d");
    edgeReferenceContext.drawImage(fixture,0,0,24,24);
    const edgeExpected=(x,y)=>[...edgeReferenceContext.getImageData(x,y,1,1).data];
    const edgeActual=(x,y)=>[...ctx.getImageData(16+x,16+y,1,1).data];
    for(const [edge,actualX,actualY,referenceX,referenceY] of [
        ["top",6,0,6,0],["bottom",6,53,6,23],
        ["left",0,6,0,6],["right",57,6,23,6]
    ]) {
        check(eq(edgeActual(actualX,actualY),edgeExpected(referenceX,referenceY),1),
            "Repeat "+edge+" strip must preserve its outer edge under filtering, without wrapping across its thickness: "+
            edgeActual(actualX,actualY)+" vs "+edgeExpected(referenceX,referenceY));
    }

    await draw(mode(2));
    check(eq(pixel(3,4),colorAt(3,4)) && eq(pixel(11,4),colorAt(8,4)) && eq(pixel(19,4),colorAt(3,4)), "Mirror repeat must alternate complete columns");
    check(eq(pixel(3,12),colorAt(3,7)) && eq(pixel(11,12),colorAt(8,7)), "Mirror repeat must alternate rows independently from columns");
    check(eq(pixel(26,24),colorAt(9,8)), "A clipped mirrored final tile must start at the mirrored edge, not rescale the fragment");
    check(eq(pixel(11,1),colorAt(8,1)) && eq(pixel(1,11),colorAt(1,8)), "Mirror-repeat edges must flip only along their repeating axis");

    await draw(mode(3));
    check(eq(pixel(3,4),colorAt(3,4)) && eq(pixel(11,4),background) && eq(pixel(3,12),background), "Blank repeat must paint one native center tile and leave the remainder empty");
    check(eq(pixel(3,1),colorAt(3,1)) && eq(pixel(11,1),background) && eq(pixel(1,11),background), "Blank repeat must leave unfilled edge-strip remainders empty");
    check(eq(pixel(27,25),colorAt(10,10)), "Blank repeat must not remove fixed corners");

    await draw(mode(4));
    check(eq(pixel(3,4),background) && eq(pixel(1,3),background) && eq(pixel(3,1),background), "Hide mode must skip center and edge regions");
    check(eq(pixel(1,1),colorAt(1,1)), "Hide mode must preserve fixed corners");
    await draw(mode(4,[4]));
    check(eq(pixel(3,4),background) && !eq(pixel(1,3),background), "Modes must apply independently to each named region");

    await draw(mode(0),{width:28,height:28});
    check(eq(pixel(6,6),colorAt(3,3),1), "Stretch mode must still scale the source center across the entire target region");
    check(eq(pixel(1,1),colorAt(1,1)), "Stretch must retain fixed corner dimensions");
    await draw(mode(1),{width:3,height:3});
    check(eq(pixel(1,1),colorAt(1,1)) && eq(pixel(2,2),colorAt(10,10)), "Targets smaller than both borders must clip the right/bottom corners after preserving left/top pixels");
    await draw(mode(1),{width:1,height:1});
    check(eq(pixel(0,0),colorAt(0,0)), "A target smaller than its first border must clip the first corner instead of squeezing every corner into it");

    await draw(mode(1),{width:55,height:51,spec:{scale9:2}});
    check(eq(pixel(7,9),pixel(23,9)) && eq(pixel(7,9),pixel(23,25)), "Nine-slice scale must also scale the repeat period, exactly once");
    check(!eq(pixel(7,9),pixel(15,9)), "A scaled repeat tile must not retain its unscaled period");
    await draw(mode(1),{width:55,height:51,guiScale:2});
    check(eq(pixel(7,9),pixel(23,9)) && eq(pixel(7,9),pixel(23,25)) && !eq(pixel(7,9),pixel(15,9)), "GUI scale must scale NineSlice borders and repeat tiles together");
    await draw(mode(1),{width:107,height:99,guiScale:2,spec:{scale9:2}});
    check(eq(pixel(13,17),pixel(45,17)) && eq(pixel(13,17),pixel(45,49)) && !eq(pixel(13,17),pixel(29,17)), "GUI scale and SpriteImage scale9 must multiply exactly once");
    await draw(mode(1),{spec:{color:"#808080",alpha:0.5}});
    const tinted = colorAt(3,4).slice(0,3).map((value,index) => Math.round(Math.round(value*128/255)*0.5+background[index]*0.5));
    check(eq(pixel(11,4),[...tinted,255],2), "Repeating patches must preserve SpriteImage tint and alpha");
    await draw(mode(1),{style:{spriteAlpha:0,additionalColorBlend:"#000000"}});
    check(eq(pixel(11,4),colorAt(3,4)), "Background-image repeat must ignore foreground-only style alpha and tint");
    await draw(mode(1),{foreground:true,style:{spriteAlpha:0.5,additionalColorBlend:"#808080"}});
    check(eq(pixel(11,4),[...tinted,255],2), "Foreground repeated sprites must apply their own style alpha and additional tint");

    // Refresh must invalidate derived tint/tile surfaces as well as loaded images.
    const fs = require("fs"), path = require("path"), {pathToFileURL} = require("url");
    const cachePath = path.join(config.directory,"refresh-source.png");
    fs.writeFileSync(cachePath,Buffer.from(fixture.toDataURL().split(",")[1],"base64"));
    const cachedAsset = {...synthetic,name:"refresh_fixture",url:pathToFileURL(cachePath).href};
    await draw(cachedAsset,{spec:{color:"#808080"}});
    const oldTint = colorAt(3,4).slice(0,3).map(value=>Math.round(value*128/255));
    check(eq(pixel(11,4),[...oldTint,255],1), "The refresh fixture must warm both its tinted source and repeated tile cache");
    const replacement = document.createElement("canvas"); replacement.width = replacement.height = 12;
    const replacementContext = replacement.getContext("2d"); replacementContext.fillStyle="rgb(160,220,60)"; replacementContext.fillRect(0,0,12,12);
    fs.writeFileSync(cachePath,Buffer.from(replacement.toDataURL().split(",")[1],"base64"));
    renderer.clearImages(); currentURL = null;
    await draw(cachedAsset,{spec:{color:"#808080"}});
    check(eq(pixel(11,4),[80,110,30,255],1) && eq(pixel(19,12),[80,110,30,255],1), "Refresh must reload changed source pixels at the same URL and discard stale tinted/repeated cells; got " + pixel(11,4));

    const tiny = document.createElement("canvas"); tiny.width = tiny.height = 3;
    tiny.getContext("2d").drawImage(fixture,0,0,3,3,0,0,3,3);
    const before = performance.now();
    await draw({...synthetic,name:"tiny_center",width:3,height:3,url:tiny.toDataURL(),
        nineSlice:{left:1,top:1,right:1,bottom:1,tileMode:[1,1,1,1,1]}},{width:2048,height:1536});
    check(eq(pixel(700,700),colorAt(1,1)), "A one-pixel center must fill a large repeated region without gaps");
    check(performance.now()-before < 5000, "Millions of logical repeat tiles must not stall the preview with one draw per tile");

    let screenshot = null, tabScreenshot = null;
    if (config.projectPath) {
        const name = "ns_menu_background_dark";
        const iconNames=["s_button_close","s_button_question_mark"];
        const tabNames=["ns_tab_button_rough","ns_tab_button_rough_gradient"];
        const spriteNames=[name,...iconNames,...tabNames];
        const resources = GooWeePreviewResources.create({
            yyResources:Object.fromEntries(spriteNames.map(name=>[name,{id:{path:`sprites/${name}/${name}.yy`}}])),yyResourceGUIDs:{},
            yyResourceTypes:Object.fromEntries(spriteNames.map(name=>[name,"GMSprite"])),
            readYyFileSync(relative) {return JSON.parse(fs.readFileSync(path.join(config.projectPath,relative),"utf8").replace(/,\s*([}\]])/g,"$1"));},
            getImageURL(relative) {return pathToFileURL(path.join(config.projectPath,relative)).href;}
        });
        const asset = resources.sprite(name,0);
        check(!!asset && asset.nineSlice.tileMode.every(value=>value===1), "The real dark-menu background must load repeat modes from the project resource adapter");
        await draw(asset,{width:1040,height:900});
        const ns = asset.nineSlice, periodX = asset.width-ns.left-ns.right, periodY = asset.height-ns.top-ns.bottom;
        const points = [[ns.left+5,ns.top+9],[ns.left+37,ns.top+53],[ns.left+81,ns.top+97]];
        check(points.every(([x,y]) => eq(pixel(x,y),pixel(x+periodX,y)) && eq(pixel(x,y),pixel(x,y+periodY))), "Real ns_menu_background_dark must repeat its center at the original tile period");
        check(points.some(([x,y]) => !eq(pixel(x,y),pixel(x+23,y+17))), "The real-background periodicity check must cover a nonuniform texture");
        screenshot = path.join(config.directory,"ns_menu_background_dark.png");
        fs.writeFileSync(screenshot,Buffer.from(canvas.toDataURL("image/png").split(",")[1],"base64"));
        for(const iconName of iconNames) {
            const iconAsset=resources.sprite(iconName,0);
            check(!!iconAsset,"The real "+iconName+" must load through the project resource adapter");
            await alphaHierarchy(iconAsset);
        }

        const tabBase=resources.sprite(tabNames[0],1),tabGradient=resources.sprite(tabNames[1],0);
        check(!!tabBase && tabBase.nineSlice.tileMode.every(value=>value===1),"The real tab must load its repeat NineSlice settings");
        check(!!tabGradient && tabGradient.nineSlice.tileMode.every(value=>value===0),"The real tab overlay must load its stretch NineSlice settings");
        const tabZooms=[0.73,1,1.37,2], tabSheet=document.createElement("canvas");
        tabSheet.width=420;tabSheet.height=tabZooms.reduce((sum,value)=>sum+Math.ceil(38*value+32)+24,0);
        const tabSheetContext=tabSheet.getContext("2d");
        tabSheetContext.fillStyle="#20252d";tabSheetContext.fillRect(0,0,tabSheet.width,tabSheet.height);
        let tabSheetY=0;
        for(const tabZoom of tabZooms) {
            const tabCanvas=document.createElement("canvas");
            let tabLoadedCount=0,tabLoadedResolve;
            const tabLoaded=new Promise(resolve=>{tabLoadedResolve=resolve;});
            const tabRenderer=GooWeePreviewRenderer.create(tabCanvas,(spriteName,index)=>resources.sprite(spriteName,index),()=>{
                if(++tabLoadedCount===2)tabLoadedResolve();
            });
            const gradient={id:"tab_gradient",type:"Image",x:0,y:0,width:180,height:38,style:{},children:[],
                sprite:{name:tabNames[1],index:0,color:"#ffffff",alpha:0.09,scale9:0.5}};
            const tab={id:"tab_base",type:"Image",x:0,y:0,width:180,height:38,style:{},children:[gradient],
                sprite:{name:tabNames[0],index:1,color:"#ffffff",alpha:1,scale9:0.5}};
            const tabScene={roots:[tab],nodes:[tab,gradient],width:180,height:38,guiScale:1};
            const tabOptions={width:180*tabZoom+32,height:38*tabZoom+32,scale:tabZoom,outlines:false,approximateOutlines:false};
            tabRenderer.render(tabScene,tabOptions);
            await Promise.race([tabLoaded,new Promise((_,reject)=>setTimeout(()=>reject(new Error("Real tab sprites did not load")),5000))]);
            tabRenderer.render(tabScene,tabOptions);
            tabSheetContext.fillStyle="#e5e7eb";tabSheetContext.font="13px sans-serif";
            tabSheetContext.fillText("NineSlice 0.5 / zoom "+Math.round(tabZoom*100)+"%",16,tabSheetY+16);
            tabSheetContext.drawImage(tabCanvas,0,tabSheetY+24);
            tabSheetY+=Math.ceil(38*tabZoom+32)+24;
            tabRenderer.dispose();
        }
        tabScreenshot=path.join(config.directory,"ns_tab_button_rough.png");
        fs.writeFileSync(tabScreenshot,Buffer.from(tabSheet.toDataURL("image/png").split(",")[1],"base64"));
        resources.dispose();
    }
    renderer.dispose();
    return {tests,screenshot,tabScreenshot,sharpPixelsScreenshot};
}
