package raw;
import gml.Project;
import haxe.io.Path;
import ui.GlobalSearch;
using tools.PathTools;

/**
 * ...
 * @author YellowAfterlife
 */
class RawSearcher {
	public static function run(
		pj:Project, fn:ProjectSearcher, done:Void->Void, opt:GlobalSearchOpt
	):Void {
		//
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
		//
		function searchRec(dirPath:String):Void {
			if (isCancelled()) return;
			for (pair in pj.readdirSync(dirPath)) {
				if (isCancelled()) return;
				var relPath = pair.relPath;
				var fullPath = pair.fullPath;
				if (pair.isDirectory) {
					searchRec(relPath);
				} else if (fullPath.ptExt() == "gml") {
					filesLeft += 1;
					addProgress(relPath);
					pj.readTextFile(relPath, function(err, code) {
						if (err == null && !isCancelled()) {
							var name:String;
							if (pj.version.config.indexingMode == Local) {
								name = relPath;
							} else name = relPath.ptName();
							var gml1 = fn(name, relPath, code);
							if (gml1 != null && gml1 != code) {
								pj.writeTextFileSync(relPath, gml1);
							}
						}
						next(relPath);
					});
				}
			}
		}
		searchRec("");
		next();
	}
}
