package gmk;
import electron.FileWrap;
import gmk.GmkObject;
import gml.Project;
import gmx.SfGmx;
import haxe.io.Path;
import js.lib.Error;
import parsers.GmlReader;
import tools.StringBuilder;
import ui.GlobalSearch;
import tools.Aliases;
using tools.NativeString;

/**
 * ...
 * @author YellowAfterlife
 */
class GmkSearcher {
	public static function run(
		project:Project, fn:ProjectSearcher, done:Void->Void, opt:GlobalSearchOpt
	):Void {
		var pjDir = project.dir;
		var pjGmx = FileWrap.readGmxFileSync(project.path);
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
		//
		function seekRec(dir:FullPath, kind:String, suffix:String):Void {
			if (isCancelled()) return;
			var rxml = '$dir/_resources.list.xml';
			if (!project.existsSync(rxml)) return;
			var xml = project.readGmxFileSync(rxml);
			for (item in xml.children) {
				if (isCancelled()) return;
				var name = item.get("name");
				var fname = item.get("filename");
				if (fname == null) fname = name;
				var rel = '$dir/$fname';
				if (item.get("type") == "GROUP") {
					seekRec(rel, kind, suffix);
					continue;
				}
				rel += suffix;
				switch (kind) {
					case "script": {
						filesLeft += 1;
						addProgress(name);
						project.readTextFile(rel, function(e, gml0) {
							if (e != null) { next(name); return; }
							if (!isCancelled()) {
								var gml1 = fn(name, rel, gml0);
								if (gml1 != null && gml1 != gml0) {
									project.writeTextFileSync(rel, gml1);
								}
							}
							next(name);
						});
					};
					case "object": {
						filesLeft += 1;
						addProgress(name);
						project.readGmxFile(rel, function(e, xml) {
							if (xml == null) { next(name); return; }
							var gml0 = GmkObject.getCode(xml, rel);
							if (gml0 == null) { next(name); return; }
							if (!isCancelled()) {
								var gml1 = fn(name, rel, gml0);
								if (gml1 != null && gml1 != gml0) {
									if (GmkObject.setCode(xml, rel, gml1)) {
										project.writeGmkSplitFileSync(rel, xml);
									} else {
										addError("Failed to modify " + name
											+ ":\n" + GmkObject.errorText);
									}
								}
							}
							next(name);
						});
					};
				}
			}
		}
		function seekRecRoot(dir:FullPath, kind:String, suffix:String = ""):Void {
			seekRec(dir, kind, suffix);
		}
		var baseDir = project.dir;
		if (opt.checkScripts) seekRecRoot("Scripts", "script", ".gml");
		if (opt.checkObjects) seekRecRoot("Objects", "object", ".xml");
		//
		next();
	}
}
