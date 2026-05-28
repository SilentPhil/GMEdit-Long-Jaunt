package gmx;
import electron.FileWrap;
import gml.Project;
import haxe.io.Path;
import js.lib.Error;
import parsers.GmlReader;
import synext.GmlExtLambda;
import tools.StringBuilder;
import ui.GlobalSearch;

/**
 * ...
 * @author YellowAfterlife
 */
class GmxSearcher {
	public static function run(
		pj:Project, fn:ProjectSearcher, done:Void->Void, opt:GlobalSearchOpt
	):Void {
		var isRepl = opt.replaceBy != null;
		var pjDir = pj.dir;
		var pjGmx = FileWrap.readGmxFileSync(pj.path);
		var rxName = GmxLoader.rxAssetName;
		var filesLeft = 1;
		var progressDone = 0;
		var progressTotal = 0;
		function isCancelled():Bool {
			if (opt.searchWasCancelled == true) return true;
			if (opt.searchCancelled != null && opt.searchCancelled()) {
				opt.searchWasCancelled = true;
				return true;
			}
			return false;
		}
		function reportProgress(name:String):Void {
			if (opt.searchProgress != null) opt.searchProgress({
				done: progressDone,
				total: progressTotal,
				name: name,
				cancelled: isCancelled(),
			});
		}
		function addProgress(name:String):Void {
			progressTotal += 1;
			reportProgress(name);
		}
		function doneProgress(name:String):Void {
			progressDone += 1;
			reportProgress(name);
		}
		function next(?name:String):Void {
			if (name != null) doneProgress(name);
			if (--filesLeft <= 0) done();
		}
		function addError(s:String) {
			if (opt.errors != null) {
				opt.errors += "\n" + s;
			} else opt.errors = s;
		}
		function findrec(node:SfGmx, one:String) {
			if (isCancelled()) return;
			if (node.name == one) {
				var name = rxName.replace(node.text, "$1");
				var full = Path.join([pjDir, node.text]);
				switch (one) {
					case "object": {
						full += '.$one.gmx';
						filesLeft += 1;
						addProgress(name);
						FileWrap.readTextFile(full, function(err:Error, xml:String) {
							if (err == null && !isCancelled()) {
								var gmx = SfGmx.parse(xml);
								var gml0 = GmxObject.getCode(gmx);
								if (gml0 != null) {
									var gml1 = fn(name, full, gml0);
									if (gml1 != null && gml1 != gml0) {
										if (GmxObject.setCode(gmx, gml1)) {
											FileWrap.writeTextFileSync(full, gmx.toGmxString());
										} else {
											addError("Failed to modify " + name
												+ ":\n" + GmxObject.errorText);
										}
									}
								}
							}
							next(name);
						});
					};
					case "room": {
						full += '.$one.gmx';
						filesLeft += 1;
						addProgress(name);
						FileWrap.readTextFile(full, function(err:Error, xml:String) {
							if (err != null) {
								next(name);
								return;
							}
							var room = SfGmx.parse(xml);
							var node = room.find("code");
							var curr = node.text;
							if (curr != null && !isCancelled()) {
								var next = fn(name, full, curr);
								if (next != null && next != curr) {
									node.text = next;
									FileWrap.writeTextFileSync(full, room.toGmxString());
								}
							}
							next(name);
						});
					};
					case "timeline": {
						full += '.$one.gmx';
						filesLeft += 1;
						addProgress(name);
						FileWrap.readTextFile(full, function(err:Error, xml:String) {
							if (err == null && !isCancelled()) {
								var gmx = SfGmx.parse(xml);
								var gml0 = GmxTimeline.getCode(gmx);
								if (gml0 != null) {
									var gml1 = fn(name, full, gml0);
									if (gml1 != null && gml1 != gml0) {
										if (GmxTimeline.setCode(gmx, gml1)) {
											FileWrap.writeTextFileSync(full, gmx.toGmxString());
										} else {
											addError("Failed to modify " + name
												+ ":\n" + GmxTimeline.errorText);
										}
									}
								}
							}
							next(name);
						});
					};
					case "script", "shader": {
						filesLeft += 1;
						addProgress(name);
						FileWrap.readTextFile(full, function(err:Error, code:String) {
							if (err == null && !isCancelled()) {
								var gml1 = fn(name, full, code);
								if (gml1 != null && gml1 != code) {
									FileWrap.writeTextFileSync(full, gml1);
								}
							}
							next(name);
						});
					};
				}
			} else {
				for (child in node.children) findrec(child, one);
			}
		}
		if (opt.checkScripts) for (q in pjGmx.findAll("scripts")) findrec(q, "script");
		if (opt.checkObjects) for (q in pjGmx.findAll("objects")) findrec(q, "object");
		if (opt.checkTimelines) for (q in pjGmx.findAll("timelines")) findrec(q, "timeline");
		if (opt.checkShaders) for (q in pjGmx.findAll("shaders")) findrec(q, "shader");
		if (opt.checkRooms) for (q in pjGmx.findAll("rooms")) findrec(q, "room");
		if (opt.checkExtensions) {
			for (q in pjGmx.findAll("NewExtensions")) for (extNode in q.findAll("extension")) {
				if (isCancelled()) continue;
				var extPath = extNode.text + ".extension.gmx";
				if (opt.expandLambdas && extNode.text == synext.GmlExtLambda.extensionName) continue;
				filesLeft += 1;
				addProgress(extNode.text);
				pj.readGmxFile(extPath, function(extError, extGmx:SfGmx) {
					if (extError == null && !isCancelled()) {
						for (extFiles in extGmx.findAll("files"))
						for (extFile in extFiles.findAll("file")) {
							var extFileName = extFile.findText("filename");
							if (Path.extension(extFileName).toLowerCase() != "gml") continue;
							var extFilePath = Path.join([extNode.text, extFileName]);
							filesLeft += 1;
							addProgress(extFileName);
							pj.readTextFile(extFilePath, function(err, code) {
								if (err == null && !isCancelled()) {
									var gml1 = fn(extFilePath, extFilePath, code);
									if (gml1 != null && gml1 != code) {
										pj.writeTextFileSync(extFilePath, gml1);
									}
								}
								next(extFileName);
							});
						}
					}
					next(extNode.text);
				});
			}
		}
		//
		function findMcr(name:String, full:String, pjGmx:SfGmx) {
			function procMcr(gmx:SfGmx) {
				if (isCancelled()) return;
				var notePath = GmxProject.getNotePath(full);
				var notes = FileWrap.existsSync(notePath)
					? new GmlReader(FileWrap.readTextFileSync(notePath)) : null;
				var gml0 = GmxProject.getMacroCode(gmx, notes, pjGmx == null);
				var gml1 = fn(name, full, gml0);
				if (gml1 != null && gml1 != gml0) {
					var notes1 = new StringBuilder();
					if (GmxProject.setMacroCode(gmx, gml1, notes1, pjGmx == null)) {
						if (notes1.length > 0) {
							FileWrap.writeTextFileSync(notePath, notes1.toString());
						} else if (FileWrap.existsSync(notePath)) {
							FileWrap.unlinkSync(notePath);
						}
						FileWrap.writeTextFileSync(full, gmx.toGmxString());
					} else {
						addError("Failed to modify " + name
							+ ":\n" + GmxTimeline.errorText);
					}
				}
			}
			//
			if (pjGmx == null) {
				filesLeft += 1;
				addProgress(name);
				FileWrap.readTextFile(full, function(err:Error, xml:String) {
					if (err == null && !isCancelled()) procMcr(SfGmx.parse(xml));
					next(name);
				});
			} else {
				addProgress(name);
				procMcr(pjGmx);
				doneProgress(name);
			}
		}
		if (opt.checkMacros) {
			for (configs in pjGmx.findAll("Configs"))
			for (config in configs.findAll("Config")) {
				var configPath = config.text;
				var configName = rxName.replace(configPath, "$1");
				var configFull = Path.join([pjDir, configPath + ".config.gmx"]);
				findMcr(configName, configFull, null);
			}
		}
		findMcr(GmxLoader.allConfigs, pj.path, pjGmx);
		//
		next();
	}
}
