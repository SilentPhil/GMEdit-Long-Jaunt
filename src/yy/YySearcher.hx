package yy;
import electron.FileSystem;
import electron.FileWrap;
import gml.Project;
import haxe.io.Path;
import js.lib.Error;
import js.html.Console;
import synext.GmlExtLambda;
import tools.Aliases;
import tools.NativeString;
import ui.GlobalSearch;
import yy.YyTimeline;

/**
 * ...
 * @author YellowAfterlife
 */
class YySearcher {
	var queue:Array<{ fn:Any->Void, arg:Any }> = [];
	var count = 0;
	var done:Void->Void;
	var opt:GlobalSearchOpt;
	function new(done:Void->Void = null, opt:GlobalSearchOpt = null) {
		this.done = done;
		this.opt = opt;
	}
	function cancelled():Bool {
		if (opt == null) return false;
		if (opt.searchWasCancelled == true) return true;
		if (opt.searchCancelled != null && opt.searchCancelled()) {
			opt.searchWasCancelled = true;
			return true;
		}
		return false;
	}
	function procSync<T>(arg:T, fn:T->Void):Void {
		count++;
		fn(arg);
	}
	function procNext() {
		count--;
		if (cancelled()) queue.resize(0);
		var pair = queue.shift();
		if (pair != null && !cancelled()) {
			procSync(pair.arg, pair.fn);
		} else if (count <= 0) done();
	}
	function proc<T>(arg:T, fn:T->Void):Void {
		if (cancelled()) return;
		if (count < ui.Preferences.current.assetIndexBatchSize) {
			procSync(arg, fn);
		} else queue.push({ fn: cast fn, arg: arg });
	}
	
	public static function run(
		_project:Project, fn:ProjectSearcher, done:Void->Void, opt:GlobalSearchOpt
	):Void {
		var ctx = new YySearcher(done, opt);
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
		inline function next():Void {
			ctx.procNext();
		}
		
		var yyProject:YyProject = _project.readYyFileSync(_project.name);
		var scriptLambdas = _project.properties.lambdaMode == Scripts;
		var rxName = Project.rxName;
		
		function addError(s:String) {
			if (opt.errors != null) {
				opt.errors += "\n" + s;
			} else opt.errors = s;
		}
		var v22 = yyProject.resourceType != "GMProject";
		ctx.count++;
		for (resPair in yyProject.resources) {
			var _resName:String, _resPath:RelPath, _resFull:String, _resType:String;
			if (v22) {
				var resVal = resPair.Value;
				_resPath = resVal.resourcePath;
				_resType = resVal.resourceType;
				_resName = null;
			} else {
				_resPath = resPair.id.path;
				_resType = _project.yyResourceTypes[resPair.id.name];
			}
			_resFull = _project.fullPath(_resPath);
			inline function ensureName():Void {
				if (v22) {
					_resName = rxName.replace(_resPath, "$1");
				} else _resName = resPair.id.name;
			}
			inline function packResCtx() {
				return {
					project: _project,
					resName: _resName,
					resPath: _resPath,
					resFull: _resFull,
				};
			}
			switch (_resType) {
				case "GMScript": if (opt.checkScripts) {
					if (isCancelled()) continue;
					ensureName();
					if (!scriptLambdas
						|| !opt.expandLambdas
						|| !NativeString.startsWith(_resName, GmlExtLambda.lfPrefix)
					) {
						addProgress(_resName);
						ctx.proc(packResCtx(), function(resCtx) {
							var gmlPath = Path.withExtension(resCtx.resPath, "gml");
							var gmlFull = Path.withExtension(resCtx.resFull, "gml");
							resCtx.project.readTextFile(gmlPath, function(error, code) {
								if (error == null && !isCancelled()) {
									var gml1 = fn(resCtx.resName, gmlFull, code);
									if (gml1 != null && gml1 != code) {
										resCtx.project.writeTextFileSync(gmlPath, gml1);
									}
								} else if (error != null) {
									Console.warn(error);
								}
								doneProgress(resCtx.resName);
								next();
							});
						});
					}
				};
				case "GMObject": if (opt.checkObjects) {
					if (isCancelled()) continue;
					ensureName();
					addProgress(_resName);
					ctx.proc(packResCtx(), function(resCtx) {
						var resPath = resCtx.resPath;
						resCtx.project.readYyFile(resPath, function(error, obj:YyObject) {
							if (error == null && !isCancelled()) try {
								var code = obj.getCode(resPath);
								var gml1 = fn(resCtx.resName, resCtx.resFull, code);
								if (gml1 != null && gml1 != code) {
									if (obj.setCode(resPath, gml1)) {
										resCtx.project.writeYyFileSync(resPath, obj);
									} else addError("Failed to modify " + resCtx.resName
										+ ":\n" + YyObject.errorText);
								}
							} catch (x:Dynamic) {
								addError("Failed to modify " + resCtx.resName + ":\n" + x);
							} else if (error != null) Console.warn(error);
							doneProgress(resCtx.resName);
							next();
						});
					});
				};
				case "GMTimeline": if (opt.checkTimelines) {
					if (isCancelled()) continue;
					ensureName();
					addProgress(_resName);
					ctx.proc(packResCtx(), function(resCtx) {
						resCtx.project.readYyFile(resCtx.resPath, function(error, _tl:YyTimelineImpl) {
							var tl:YyTimeline = _tl;
							if (error == null && !isCancelled()) try {
								var code = tl.getCode(resCtx.resFull);
								var gml1 = fn(resCtx.resName, resCtx.resFull, code);
								if (gml1 != null && gml1 != code) {
									if (tl.setCode(resCtx.resPath, gml1)) {
										resCtx.project.writeYyFileSync(resCtx.resPath, tl);
									} else addError("Failed to modify " + resCtx.resName
										+ ":\n" + YyObject.errorText);
								}
							} catch (x:Dynamic) {
								addError("Failed to modify " + resCtx.resName + ":\n" + x);
							} else if (error != null) Console.warn(error);
							doneProgress(resCtx.resName);
							next();
						});
					});
				};
				case "GMShader": if (opt.checkShaders) {
					if (isCancelled()) continue;
					ensureName();
					inline function procShader(ext:String, type:String) {
						addProgress(_resName + '($type)');
						ctx.proc({
							project: _project,
							resName: _resName + '($type)',
							shPath: Path.withExtension(_resPath, ext),
							shFull: Path.withExtension(_resFull, ext),
						}, function(shCtx) {
							shCtx.project.readTextFile(shCtx.shPath, function(err, code) {
								if (err == null && !isCancelled()) {
									var gml1 = fn(shCtx.resName, shCtx.shFull, code);
									if (gml1 != null && gml1 != code) {
										shCtx.project.writeTextFileSync(shCtx.shPath, gml1);
									}
								} else if (err != null) Console.warn(err);
								doneProgress(shCtx.resName);
								next();
							});
						});
					}
					procShader("fsh", "fragment");
					procShader("vsh", "vertex");
				};
				case "GMExtension": if (opt.checkExtensions) {
					if (isCancelled()) continue;
					ensureName();
					if (opt.expandLambdas && _resName == GmlExtLambda.extensionName) continue;
					addProgress(_resName);
					ctx.proc(packResCtx(), function(resCtx) resCtx.project.readYyFile(resCtx.resPath,
					function(err, ext:YyExtension) {
						if (err != null || isCancelled()) {
							if (err != null) Console.warn(err);
							doneProgress(resCtx.resName);
							next();
							return;
						}
						var extDir = Path.directory(resCtx.resPath);
						var extDirFull = Path.directory(resCtx.resFull);
						for (file in ext.files) if (
							tools.PathTools.ptExt(file.filename) == "gml"
						) {
							addProgress(file.filename);
							ctx.proc({
								project: resCtx.project,
								fileName: file.filename,
								filePath: Path.join([extDir, file.filename]),
								fileFull: Path.join([extDirFull, file.filename]),
							}, function(extCtx) {
								var fileName = extCtx.fileName;
								var filePath = extCtx.filePath;
								extCtx.project.readTextFile(filePath, function(err, code) {
									if (err != null) {
										Console.warn(err);
										doneProgress(fileName);
										next();
										return;
									}
									if (!isCancelled()) {
										var gml1 = fn(fileName, extCtx.fileFull, code);
										if (gml1 != null && gml1 != code) {
											extCtx.project.writeTextFileSync(filePath, gml1);
										}
									}
									doneProgress(fileName);
									next();
								});
							});
						}
						doneProgress(resCtx.resName);
						next();
					}));
				};
				case "GMRoom": if (opt.checkRooms) {
					if (isCancelled()) continue;
					ensureName();
					addProgress(_resName);
					ctx.proc(packResCtx(), function(resCtx) {
						var rccName = "roomCreationCodes(" + resCtx.resName + ")";
						var rccPath = Path.directory(resCtx.resPath) + "\\RoomCreationCode.gml";
						if (resCtx.project.existsSync(rccPath)) {
							resCtx.project.readTextFile(rccPath, function(error, code) {
								if (error == null && !isCancelled()) {
									var gml1 = fn(rccName, rccPath, code);
									if (gml1 != null && gml1 != code) {
										FileWrap.writeTextFileSync(rccPath, gml1);
									}
								} else if (error != null) Console.warn(error);
								doneProgress(resCtx.resName);
								next();
							});
						} else {
							doneProgress(resCtx.resName);
							next();
						}
					});
				};
			} // switch (can continue)
		} // for
		if (--ctx.count == 0 && ctx.queue.length == 0) done();
	}
}
