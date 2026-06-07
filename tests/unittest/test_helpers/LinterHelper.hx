package test_helpers;

import file.FileKind;
import gml.file.GmlFileInMemory;
import parsers.GmlSeekData;
import parsers.GmlSeeker;
import parsers.linter.GmlLinter;
import file.kind.KGml;
import editors.EditCode;

class LinterHelper {

	public static function runLinter(code:String, index:Bool = false, ?kind:FileKind) {
		var file = GmlFileHelper.makeGmlFile(code, kind);
		if (index) GmlSeeker.runSync(file.path, code, null, file.kind);
		var editor = file.codeEditor;
		var linter = new GmlLinter();
		var ok = !linter.run(code, editor, gml.Project.current.version);
		return new LinterHelper(linter, ok);
	}

	public var linter:GmlLinter;
	public var problems:Array<GmlLinterProblem>;
	public var warnings:Array<GmlLinterProblem>;
	public var errors:Array<GmlLinterProblem>;
	public var isValid:Bool;
	public function new(linter:GmlLinter, isValid:Bool) {
		this.linter = linter;
		this.isValid = isValid;
		warnings = linter.warnings;
		errors = linter.errors;
		problems = linter.warnings.concat(linter.errors);
	}
}

