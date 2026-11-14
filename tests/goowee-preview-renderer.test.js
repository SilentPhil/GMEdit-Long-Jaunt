"use strict";

// Renderer contract checks in Node: recorded canvas operations, no Electron or windows.
const assert = require("assert");
const {create} = require("../bin/resources/app/plugins/goowee-preview/preview-renderer");
const assets = new Map(), loadedURLs = [];
const identity = () => [1, 0, 0, 1, 0, 0];
const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const intersection = (a, b) => a ? {x:Math.max(a.x,b.x),y:Math.max(a.y,b.y),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)} : b;
function rgba(value) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if(hex)return [parseInt(hex[1].slice(0,2),16),parseInt(hex[1].slice(2,4),16),parseInt(hex[1].slice(4,6),16),255];
    const rgb=/^rgba?\(([\d.,\s]+)\)$/i.exec(value);
    if(rgb) { const channels=rgb[1].split(",").map(Number); return [...channels.slice(0,3),channels.length===4?Math.round(channels[3]*255):255]; }
    return [255,255,255,255];
}
class RecordingContext {
    constructor(canvas) { this.canvas=canvas; this.reset(); }
    reset() { this.matrix=identity(); this.globalAlpha=1; this.fillStyle="#000000"; this.draws=[]; this.stack=[]; this.clipBox=null; this.pathBox=null; }
    save() { this.stack.push({matrix:this.matrix.slice(),globalAlpha:this.globalAlpha,fillStyle:this.fillStyle,clipBox:this.clipBox}); }
    restore() { Object.assign(this,this.stack.pop()); }
    setTransform(...values) { this.matrix=values; }
    transform(...values) { this.matrix=multiply(this.matrix,values); }
    translate(x,y) { this.transform(1,0,0,1,x,y); }
    scale(x,y) { this.transform(x,0,0,y,0,0); }
    rotate(angle) { this.transform(Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0); }
    getTransform() {
        const [a,b,c,d,e,f]=this.matrix;
        return {a,b,c,d,e,f,inverse() { const det=a*d-b*c; return {a:d/det,b:-b/det,c:-c/det,d:a/det,e:(c*f-d*e)/det,f:(b*e-a*f)/det}; }};
    }
    box(x,y,w,h) {
        const m=this.matrix, points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([px,py])=>[m[0]*px+m[2]*py+m[4],m[1]*px+m[3]*py+m[5]]);
        return {x:Math.min(...points.map(p=>p[0])),y:Math.min(...points.map(p=>p[1])),right:Math.max(...points.map(p=>p[0])),bottom:Math.max(...points.map(p=>p[1]))};
    }
    record(kind,x,y,w,h,extra={}) { this.draws.push({kind,box:intersection(this.clipBox,this.box(x,y,w,h)),alpha:this.globalAlpha,matrix:this.matrix.slice(),color:rgba(this.fillStyle),...extra}); }
    drawImage(source,...args) {
        const dest=args.length===8?args.slice(4):args.length===4?args:[args[0],args[1],source.naturalWidth||source.width,source.naturalHeight||source.height];
        this.record("image",...dest,{source,args,color:source.pixels||[255,255,255,255]});
    }
    fillRect(x,y,w,h) { this.record("fill",x,y,w,h); }
    clearRect() { this.draws=[]; }
    beginPath() { this.pathBox=null; }
    rect(x,y,w,h) { this.pathBox=this.box(x,y,w,h); }
    clip() { if(this.pathBox)this.clipBox=intersection(this.clipBox,this.pathBox); }
    strokeRect() {}
    setLineDash() {}
    arc() {}
    ellipse() {}
    fill() {}
    fillText(text,x,y) { this.record("text",x,y,String(text).length*8,20); }
    createPattern() { return {}; }
    putImageData(data) { this.canvas.pixels=Array.from(data.data.slice(0,4)); }
    getImageData(x,y,w,h) {
        const data=new Uint8ClampedArray(w*h*4);
        for(let py=0;py<h;py++)for(let px=0;px<w;px++) {
            const draw=this.draws.findLast(item=>x+px+0.5>=item.box.x && x+px+0.5<item.box.right && y+py+0.5>=item.box.y && y+py+0.5<item.box.bottom && item.alpha>0);
            if(draw)data.set([...draw.color.slice(0,3),Math.round(draw.alpha*255)],(py*w+px)*4);
        }
        return {data};
    }
}
class RecordingCanvas {
    constructor() { this.style={}; this._width=this._height=0; this.context=new RecordingContext(this); }
    set width(value) { this._width=value; if(this.context)this.context.reset(); }
    get width() { return this._width; }
    set height(value) { this._height=value; if(this.context)this.context.reset(); }
    get height() { return this._height; }
    getContext() { return this.context; }
}
global.window={devicePixelRatio:1};
global.document={createElement(type) { assert.strictEqual(type,"canvas"); return new RecordingCanvas(); }};
global.Image=class {
    set src(url) {
        this.url=url; loadedURLs.push(url);
        const asset=assets.get(url);
        this.naturalWidth=asset&&asset.width; this.naturalHeight=asset&&asset.height;
        queueMicrotask(()=>{ if(asset) { if(this.onload)this.onload(); } else if(this.onerror)this.onerror(); });
    }
};
function asset(name, extras={}) { const value={name,url:"mock:"+name,width:8,height:4,originX:0,originY:0,...extras}; assets.set(value.url,value); return value; }
function fixture() {
    const canvas=new RecordingCanvas(), reads=[];
    const renderer=create(canvas,(name)=>{ reads.push(name); return assets.get("mock:"+name); },()=>{});
    return {canvas,renderer,reads,async render(scene,options={}) {
        const settings={width:200,height:200,scale:1,outlines:false,approximateOutlines:false,...options};
        renderer.render(scene,settings); await Promise.resolve(); return renderer.render(scene,settings);
    }};
}
function scene(node) { return {roots:[node],nodes:[node],width:400,height:300,guiScale:1}; }
function node(changes={}) { return {id:"fixture",type:"Image",x:100,y:200,width:3,height:5,children:[],style:{},sprite:{name:"intrinsic",alpha:1,color:"#ffffff"},...changes}; }
function layer(changes={}) { return {sprite:{name:"ink",alpha:1,color:"#ffffff"},x:0,y:0,width:8,height:4,originX:0,originY:0,scaleX:1,scaleY:1,angle:0,...changes}; }
function near(actual,expected,message) { assert.strictEqual(actual.length,expected.length); actual.forEach((value,i)=>assert(Math.abs(value-expected[i])<1e-8,(message||"coordinates")+": "+actual+" != "+expected)); }
function logicalBox(draw,view) { return [(draw.box.x-view.x)/view.scale,(draw.box.y-view.y)/view.scale,(draw.box.right-draw.box.x)/view.scale,(draw.box.bottom-draw.box.y)/view.scale]; }
let count=0;
async function test(name,callback) { await callback(); count++; console.log("ok - "+name); }
async function run() {
    asset("ink"); asset("intrinsic");
    await test("source selection outlines hidden controls without revealing pixels or hit targets",async()=>{
        const f=fixture(), parent=node({id:"parent",hidden:true}), child=node({id:"child",x:120,y:210,parentId:"parent"});
        parent.children=[child];
        const model={roots:[parent],nodes:[parent,child],width:400,height:300}, strokes=[];
        f.canvas.context.strokeRect=function(x,y,w,h) { strokes.push({x,y,w,h,color:this.strokeStyle}); };
        const view=await f.render(model,{selected:child.id});
        assert(strokes.some(s=>s.color==="#55ccff" && s.x===120 && s.y===210 && s.w===3 && s.h===5));
        assert(!f.canvas.context.draws.some(d=>d.kind==="image"),"Hidden content must remain hidden");
        assert.strictEqual(f.renderer.hitTest(view.x+121,view.y+211),null);
        strokes.length=0;
        await f.render(model,{hovered:child.id});
        assert(!strokes.some(s=>s.color==="#73baff"),"Hover must not reveal hidden controls");
        f.renderer.dispose();
    });
    await test("captured commands replace intrinsic pixels and apply style transforms only once",async()=>{
        const f=fixture(), item=node({alpha:0.5,style:{angle:270,flipHorizontal:true,spriteAlpha:0.1,additionalColorBlend:"#000000"},spriteDraws:[layer({x:12,y:20,width:16,height:6,angle:90,sprite:{name:"ink",alpha:0.4,color:"#ffffff"}})]});
        const view=await f.render(scene(item)), draws=f.canvas.context.draws.filter(draw=>draw.kind==="image");
        assert.strictEqual(draws.length,1); assert.strictEqual(draws[0].source.url,"mock:ink"); assert.strictEqual(draws[0].alpha,0.2);
        near(logicalBox(draws[0],view),[112,204,6,16]);
        assert(!f.reads.includes("intrinsic"),"The source image is retained for layout identity only");
        near([view.bounds.x,view.bounds.y,view.bounds.width,view.bounds.height],[100,200,18,20]);
        assert.strictEqual(f.renderer.hitTest(view.x+115,view.y+217),item,"Overflow draw commands remain selectable");
        f.renderer.dispose();
    });
    await test("captured numeric and CSS tints multiply white source pixels without style tinting again",async()=>{
        const f=fixture(), item=node({style:{additionalColorBlend:"#000000"},spriteDraws:[
            layer({sprite:{name:"ink",color:0x816B63,alpha:1}}),
            layer({x:10,sprite:{name:"ink",color:"#313540",alpha:0.5}})
        ]});
        await f.render(scene(item));
        const draws=f.canvas.context.draws.filter(draw=>draw.kind==="image");
        assert.deepStrictEqual(draws.map(draw=>draw.color),[[99,107,129,255],[49,53,64,255]]);
        near(draws.map(draw=>draw.alpha),[1,0.5]);
        assert(draws.every(draw=>draw.source instanceof RecordingCanvas),"Non-white tints must use multiplied source pixels");
        f.renderer.dispose();
    });
    await test("matrix, origin, signed scale and crop agree between drawing and bounds",async()=>{
        const f=fixture(), crop={x:2,y:1,width:4,height:2}, item=node({x:20,y:30,spriteDraws:[layer({matrix:[2,0,0,3,7,-5],x:4,y:6,originX:1,originY:2,scaleX:-1,scaleY:2,crop})]});
        const view=await f.render(scene(item)), draw=f.canvas.context.draws.find(draw=>draw.kind==="image");
        near(logicalBox(draw,view),[21,31,16,24]); assert.deepStrictEqual(draw.args,[2,1,4,2,-1,-2,8,4]);
        near([view.bounds.x,view.bounds.y,view.bounds.width,view.bounds.height],[20,30,17,25]);
        f.renderer.dispose();
    });
    await test("background captures paint before foreground and share node opacity",async()=>{
        const f=fixture(), item=node({alpha:0.5,background:{name:"intrinsic"},backgroundDraws:[{fill:"#ff0000",alpha:0.6,x:-4,y:-3,width:20,height:12}],spriteDraws:[layer()]});
        await f.render(scene(item));
        const draws=f.canvas.context.draws.slice(1);
        assert.deepStrictEqual(draws.map(draw=>draw.kind),["fill","image"]); near(draws.map(draw=>draw.alpha),[0.3,0.5]);
        assert(!f.reads.includes("intrinsic")); f.renderer.dispose();
    });
    await test("text opacity already resolved by layout is not multiplied by node alpha again",async()=>{
        const f=fixture(), item=node({x:0,y:0,width:100,height:40,sprite:null,text:"Opacity",alpha:0.5,style:{fontSize:16,fontAlpha:0.5}});
        await f.render(scene(item));
        const draws=f.canvas.context.draws.filter(draw=>draw.kind==="text");
        assert.strictEqual(draws.length,1); assert.strictEqual(draws[0].alpha,0.5);
        f.renderer.dispose();
    });
    await test("empty captures suppress fallback sprites, placeholders and exports",async()=>{
        const f=fixture(), item=node({width:50,height:50,background:{name:"intrinsic"},backgroundDraws:[],spriteDraws:[]});
        await f.render(scene(item)); assert.strictEqual(f.canvas.context.draws.length,1,"Only the editor workspace may paint"); assert.deepStrictEqual(f.reads,[]);
        await assert.rejects(f.renderer.exportImage(scene(item)),/no visible interface/i); f.renderer.dispose();
    });
    await test("first export preloads command-only assets and keeps pixels outside element bounds",async()=>{
        asset("export_ink"); const f=fixture(), item=node({x:100,y:100,width:2,height:2,spriteDraws:[layer({sprite:{name:"export_ink",alpha:1,color:"#ffffff"},x:-20,y:30,width:10,height:8})]});
        const before=loadedURLs.length, exported=await f.renderer.exportImage(scene(item));
        assert.deepStrictEqual([exported.width,exported.height],[10,8]); assert(loadedURLs.slice(before).includes("mock:export_ink"));
        assert(!f.reads.includes("intrinsic")); f.renderer.dispose();
    });
    await test("ancestor clipping restricts captured overflow for export and hit tests",async()=>{
        const f=fixture(), child=node({x:20,y:20,width:2,height:2,spriteDraws:[layer({x:-18,y:-18,width:10,height:8})]});
        const parent=node({id:"clip",type:"Canvas",x:0,y:0,width:5,height:5,sprite:null,clipChildren:true,children:[child]});
        const value=scene(parent); value.nodes.push(child);
        const view=await f.render(value), exported=await f.renderer.exportImage(value);
        assert.deepStrictEqual([exported.width,exported.height],[3,3]);
        assert.strictEqual(f.renderer.hitTest(view.x+3,view.y+3),child); assert.strictEqual(f.renderer.hitTest(view.x+6,view.y+3),null);
        f.renderer.dispose();
    });
    await test("manual visibility preserves decoded command assets when restoring a node",async()=>{
        asset("retained_ink"); const f=fixture(), item=node({spriteDraws:[layer({sprite:{name:"retained_ink",alpha:1,color:"#ffffff"}})]});
        await f.render(scene(item)); const before=loadedURLs.length;
        await f.render(scene(item),{hiddenNodeIds:new Set([item.id])}); await f.render(scene(item));
        assert.strictEqual(loadedURLs.length,before); assert(!f.reads.includes("intrinsic")); f.renderer.dispose();
    });
    await test("captured NineSlice draws keep target size and GUI border scaling",async()=>{
        asset("nine",{width:12,height:12,nineSlice:{left:2,top:2,right:2,bottom:2,tileMode:[0,0,0,0,0]}});
        const f=fixture(), item=node({x:0,y:0,width:29,height:27,spriteDraws:[layer({sprite:{name:"nine",color:"#ffffff",alpha:1},width:12,height:12,scaleX:29/12,scaleY:27/12})]});
        const view=await f.render(scene(item)), draw=f.canvas.context.draws.find(draw=>draw.kind==="image");
        assert(draw.source instanceof RecordingCanvas,"NineSlice must use its bounded raster surface instead of stretching the source bitmap");
        near(logicalBox(draw,view),[0,0,29,27]); f.renderer.dispose();
    });
    await test("quarter-turn NineSlice commands retain half-scale caps without applying source scale twice",async()=>{
        asset("stroke",{width:638,height:12,nineSlice:{left:6,top:0,right:6,bottom:0,tileMode:[0,0,0,0,1]}});
        const f=fixture();
        for(const [angle,x,y,width,height] of [[0,0,0,40,6],[90,0,40,6,40],[180,40,6,40,6],[270,6,0,6,40]]) {
            const item=node({x:10,y:20,width,height,spriteDraws:[layer({sprite:{name:"stroke",color:"#ffffff",alpha:1,scale:7,scale9:0.5},
                x,y,width:638,height:12,scaleX:40/638,scaleY:0.5,angle})]});
            const view=await f.render(scene(item)), draw=f.canvas.context.draws.find(draw=>draw.kind==="image");
            near(logicalBox(draw,view),[10,20,width,height],"Rotated stroke bounds at "+angle);
            assert(draw.source instanceof RecordingCanvas);
            assert.deepStrictEqual([draw.source.width,draw.source.height],[40,6]);
            const parts=draw.source.context.draws.filter(part=>part.kind==="fill");
            assert.strictEqual(parts.length,3,"Zero top/bottom slices leave only left cap, repeated center and right cap");
            near(parts.map(part=>part.box.right-part.box.x),[3,34,3],"Half-scale cap widths at "+angle);
        }
        f.renderer.dispose();
    });
    console.log("GooWee renderer Node contracts: "+count+" checks passed.");
}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
