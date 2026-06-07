package test_helpers;

import file.FileKind;
import file.kind.KGml;
import tools.Aliases.GmlCode;
import gml.file.GmlFileInMemory;

class GmlFileHelper {
	private static var testCounter : Int = 0;

	public static function makeGmlFile(code : GmlCode, ?kind:FileKind) {
		var name = "test" + testCounter++;
		return new GmlFileInMemory(name, kind ?? KGml.inst, code);
	}

}
