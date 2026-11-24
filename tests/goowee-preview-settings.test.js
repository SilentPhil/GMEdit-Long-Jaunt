const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../bin/resources/app/plugins/goowee-preview/goowee-preview.js'),'utf8');
const preferences={current:{gooWeePreview:{outlines:true,localReferences:{keep:1}}},save(){this.saved=JSON.stringify(this.current);}};
const a={dir:'C:/Work/A'},b={dir:'C:/Work/B'};
const context={require,Preferences:preferences,Project:{current:a},prefs:null,status:null,pinned:null,scene:null,currentFile:null,sceneFile:null,
    entryByFile:new WeakMap(),$gmedit:{},GmlFile:{current:null,open(){throw Error('Unexpected open');}}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('    var settingsProjectKey'),source.indexOf('    function listen(')),context);
context.loadPreferences();context.prefs.sharpPixels=true;context.prefs.showReferenceControls=true;
const file={path:'C:/Work/A/scripts/view/view.gml',name:'view',codeEditor:{session:{}}};
context.currentFile=context.sceneFile=file;context.scene={entry:'details'};context.pinned={file};context.rememberSource();
context.Project.current=b;context.loadPreferences();
assert.strictEqual(context.prefs.sharpPixels,false);assert.strictEqual(context.prefs.source,undefined);
context.prefs.outlines=false;context.save();
context.Project.current={dir:'c:\\WORK\\a\\'};context.loadPreferences();
assert(context.prefs.sharpPixels && context.prefs.showReferenceControls && context.prefs.outlines);
assert.strictEqual(context.prefs.source.entry,'details');
context.GmlFile.current=file;context.pinned=null;context.restoreSource();
assert.strictEqual(context.pinned.file,file);assert.strictEqual(context.entryByFile.get(file),'details');
assert.strictEqual(context.pinned.project,context.Project.current);
assert.deepStrictEqual(preferences.current.gooWeePreview.localReferences,{keep:1});
// Simulate a fresh preference load and a newly constructed editor tab.
preferences.current=JSON.parse(preferences.saved);
context.entryByFile=new WeakMap();context.pinned=null;context.GmlFile.current={...file,codeEditor:{session:{}}};
context.loadPreferences();context.restoreSource();assert.strictEqual(context.pinned.file,context.GmlFile.current);
context.Project.current=b;context.loadPreferences();assert.strictEqual(context.prefs.outlines,false);
context.loadPreferences(null);assert.strictEqual(context.prefs.outlines,true);assert.strictEqual(context.prefs.source,undefined);
// Missing saved files do not create a stale pin or throw.
context.prefs.source={path:'C:/missing-preview-fixture-784315.gml',entry:'gone',locked:true};context.pinned=null;context.restoreSource();assert.strictEqual(context.pinned,null);
// Persistence failure must not break rendering; a later attempt can recover.
const normalSave=preferences.save;preferences.save=()=>{throw Error('read only');};
assert.doesNotThrow(()=>context.save());assert(context.settingsSaveError.includes('read only'));
preferences.save=normalSave;context.save();assert.strictEqual(context.settingsSaveError,'');
console.log('GooWee project settings: isolation, reload, source pin, missing files and save recovery passed.');
