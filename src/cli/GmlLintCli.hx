package cli;

import electron.IPC;
import gml.Project;
import haxe.Json;
import ui.Problems.ProblemItem;

using tools.PathTools;

class GmlLintCli {
	public static function run():Void {
		ui.Problems.refreshProject(finish);
	}

	static function finish(allItems:Array<ProblemItem>):Void {
		var format = Main.moduleArgs["lint-format"];
		var errorsOnly = Main.moduleArgs.exists("lint-errors-only");
		var warningsAsErrors = Main.moduleArgs.exists("lint-warnings-as-errors");
		var requestedFiles:Array<String> = [];
		var encodedFiles = Main.moduleArgs["lint-files"];
		if (encodedFiles != null && encodedFiles != "") try {
			requestedFiles = Json.parse(encodedFiles);
		} catch (_:Dynamic) {}
		for (i in 0 ... requestedFiles.length) requestedFiles[i] = normalize(requestedFiles[i]);

		var items = [];
		for (item in allItems) {
			if (errorsOnly && item.type == "warning") continue;
			if (requestedFiles.length > 0 && !matchesAnyFile(item.path, requestedFiles)) continue;
			items.push(item);
		}

		var errors = 0;
		var warnings = 0;
		for (item in items) {
			if (item.type == "warning") warnings++; else errors++;
		}
		var code = errors > 0 || (warningsAsErrors && warnings > 0) ? 1 : 0;
		var output = format == "json"
			? formatJson(items, errors, warnings)
			: formatText(items, errors, warnings);
		IPC.send("gmedit-lint-result", {
			output: output,
			code: code,
		});
	}

	static function matchesAnyFile(path:String, requestedFiles:Array<String>):Bool {
		var absolute = normalize(path);
		var relative = normalize(Project.current.relPath(path) ?? path);
		for (requested in requestedFiles) {
			if (requested == absolute || requested == relative) return true;
			if (StringTools.endsWith(absolute, "/" + requested)) return true;
		}
		return false;
	}

	static function formatText(items:Array<ProblemItem>, errors:Int, warnings:Int):String {
		var lines = [];
		for (item in items) {
			var path = displayPath(item.path);
			var text = item.text.split("\r").join("").split("\n").join(" ");
			lines.push('$path:${item.row + 1}:${item.column + 1}: ${item.type}: $text');
		}
		if (lines.length == 0) lines.push("No problems found.");
		lines.push('$errors error(s), $warnings warning(s)');
		return lines.join("\n") + "\n";
	}

	static function formatJson(items:Array<ProblemItem>, errors:Int, warnings:Int):String {
		var problems = items.map(function(item) return {
			file: displayPath(item.path),
			line: item.row + 1,
			column: item.column + 1,
			severity: item.type,
			message: item.text,
		});
		return Json.stringify({
			errors: errors,
			warnings: warnings,
			problems: problems,
		}, null, "  ") + "\n";
	}

	static function displayPath(path:String):String {
		var relative = Project.current.relPath(path);
		return normalize(relative ?? path);
	}

	static function normalize(path:String):String {
		if (path == null) return "";
		var result = path.ptNoBS();
		if (js.Syntax.code("process.platform === 'win32'")) result = result.toLowerCase();
		while (StringTools.startsWith(result, "./")) result = result.substring(2);
		return result;
	}
}
