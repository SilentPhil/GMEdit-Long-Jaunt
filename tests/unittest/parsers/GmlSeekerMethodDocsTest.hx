package parsers;

import file.kind.gml.KGmlScript;
import gml.GmlAPI;
import gml.GmlFuncDoc;
import gml.GmlLocals;
import gml.GmlVersion;
import gml.Project;
import massive.munit.Assert;

class GmlSeekerMethodDocsTest {
	var previousAPI:GmlVersion;
	var previousProject:GmlVersion;

	@Before public function before() {
		previousAPI = GmlAPI.version;
		previousProject = Project.current.version;
		GmlAPI.version = GmlVersion.map["v23"];
		Project.current.version = GmlAPI.version;
	}

	@After public function after() {
		GmlAPI.version = previousAPI;
		Project.current.version = previousProject;
	}

	function index(body:String):GmlSeekData {
		var out = new GmlSeekData(KGmlScript.inst);
		GmlSeeker.runSyncImpl("method-docs.gml", "function MethodDocsTest() constructor {\n" + body + "\n}",
			null, out, new GmlLocals(""), KGmlScript.inst);
		return out;
	}

	function method(out:GmlSeekData, name:String):GmlFuncDoc {
		var hint = out.fieldHints["MethodDocsTest:" + name];
		Assert.isNotNull(hint);
		Assert.isNotNull(hint.doc);
		return hint.doc;
	}

	@Test public function methodsDoNotInheritConstructorArguments() {
		var out = index("var prefix = argument[0];\n"
			+ "static empty = function() {};\n"
			+ "static identity = function(value) { return value; };\n");
		Assert.areEqual(0, method(out, "empty").args.length);
		Assert.isFalse(method(out, "empty").rest);
		Assert.areEqual(1, method(out, "identity").args.length);
		Assert.isFalse(method(out, "identity").rest);
		Assert.isTrue(method(out, "identity").hasReturn);
	}

	@Test public function methodsDoNotInheritOptionalArgumentChecks() {
		var out = index("if (is_undefined(value)) value = 0;\n"
			+ "static required = function(value) { return value; };\n"
			+ "static optional = function(value) { if (is_undefined(value)) value = 0; return value; };\n");
		Assert.areEqual(1, method(out, "required").minArgs);
		Assert.areEqual(0, method(out, "optional").minArgs);
	}

	@Test public function nestedMethodsKeepEnclosingBodyBounds() {
		var out = index("static outer = function() {\n"
			+ "static inner = function() { return 1; };\n"
			+ "return 2;\n};\n"
			+ "static empty = function() {};\n");
		Assert.isTrue(method(out, "outer").hasReturn);
		Assert.isFalse(method(out, "empty").hasReturn);
	}

	@Test public function methodJSDocKeepsArgumentsAndReturnType() {
		var out = index("/// @param {number} value\n"
			+ "/// @return {string}\n"
			+ "static documented = function(value) { return string(value); };\n");
		var doc = method(out, "documented");
		Assert.areEqual("value", doc.args[0]);
		Assert.areEqual("number", doc.argTypes[0].toString());
		Assert.areEqual("string", doc.returnTypeString);
	}

	@Test public function nestedFunctionBracesInCommentsAndStringsAreIgnored() {
		var out = index("static outer = function() {\n"
			+ "var inner = function() { var text = \"}\"; /* } */ return 1; };\n"
			+ "return 2;\n};\n"
			+ "static noReturn = function() { var inner = function() { return 1; }; };\n");
		Assert.isTrue(method(out, "outer").hasReturn);
		Assert.isFalse(method(out, "noReturn").hasReturn);
	}
}
