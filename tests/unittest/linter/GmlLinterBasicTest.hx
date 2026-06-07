package linter;
import file.FileKind;
import file.kind.gml.KGmlScript;
import gml.GmlAPI;
import gml.GmlVersion;
import gml.Project;
import parsers.linter.GmlLinterPrefs;
import test_helpers.LinterHelper;
import massive.munit.Assert;

class GmlLinterBasicTest {
	function runLinter23(code:String, index:Bool = false, ?kind:FileKind) {
		var prevAPI = GmlAPI.version;
		var prevProject = Project.current.version;
		var v23 = GmlVersion.map["v23"];
		GmlAPI.version = v23;
		Project.current.version = v23;
		try {
			var out = LinterHelper.runLinter(code, index, kind);
			GmlAPI.version = prevAPI;
			Project.current.version = prevProject;
			return out;
		} catch (x:Dynamic) {
			GmlAPI.version = prevAPI;
			Project.current.version = prevProject;
			throw x;
		}
	}
	
	@Test public function testBasics() {
		var t = LinterHelper.runLinter("var a");
		Assert.areEqual(t.warnings.length, 0);
		t = LinterHelper.runLinter("if");
		Assert.areNotEqual(t.problems.length, 0);
	}

	@Test public function testConstructorStaticAllowsInheritedInstanceFields() {
		var parent = GmlAPI.ensureNamespace("LinterInheritedParent");
		parent.addFieldHint("__base_field", true, null, null, null);
		var child = GmlAPI.ensureNamespace("LinterInheritedChild");
		child.parent = parent;

		var t = LinterHelper.runLinter(
			"function LinterInheritedChild() : LinterInheritedParent() constructor {\n"
			+ "\tstatic apply = function() {\n"
			+ "\t\t__base_field = 1;\n"
			+ "\t\t__missing_field = 2;\n"
			+ "\t}\n"
			+ "}"
		);

		Assert.areEqual(1, t.warnings.length);
		Assert.isTrue(t.warnings[0].text.indexOf("__missing_field") >= 0);
	}

	@Test public function testDeprecatedFunctionWarnings() {
		var t = runLinter23(
			"/// @deprecated Use new_api instead\n"
			+ "function deprecated_test_old_api() {}\n"
			+ "deprecated_test_old_api();"
		, true, KGmlScript.inst);
		Assert.areEqual(1, t.warnings.length);
		Assert.isTrue(t.warnings[0].text.indexOf("deprecated_test_old_api") >= 0);
		Assert.isTrue(t.warnings[0].text.indexOf("Use new_api instead") >= 0);
	}

	@Test public function testDeprecatedMethodWarnings() {
		var t = runLinter23(
			"function DeprecatedTestHolder() constructor {\n"
			+ "\t/// @deprecated\n"
			+ "\tstatic old_method = function() {}\n"
			+ "}\n"
			+ "DeprecatedTestHolder.old_method();"
		, true, KGmlScript.inst);
		Assert.areEqual(1, t.warnings.length);
		Assert.isTrue(t.warnings[0].text.indexOf("old_method") >= 0);
	}

	@Test public function testPrivateStaticAliasInConstructor() {
		runLinter23(
			"function SoftTutorialObjective() : PubSubHandler() constructor {\n"
			+ "\t/// @private\n"
			+ "\tstatic pub_sub_unsubscribe_all_base = pub_sub_unsubscribe_all;\n"
			+ "\tstatic pub_sub_unsubscribe_all = function(_not_used_obj = undefined)->void {\n"
			+ "\t\tif (__is_subscribed) {\n"
			+ "\t\t\tpub_sub_unsubscribe_all_base(_not_used_obj);\n"
			+ "\t\t\t__is_subscribed = false;\n"
			+ "\t\t}\n"
			+ "\t}\n"
			+ "}"
		, true, KGmlScript.inst);
		var ns = GmlAPI.gmlNamespaces["SoftTutorialObjective"];
		Assert.isTrue(ns.isInstPrivate("pub_sub_unsubscribe_all_base"));
		Assert.isFalse(ns.isInstPrivate("pub_sub_unsubscribe_all"));
	}

	@Test public function testStaticFunctionOptionalArgKeepsFieldDoc() {
		var prefs = Project.current.properties.linterPrefs;
		if (prefs == null) prefs = Project.current.properties.linterPrefs = GmlLinterPrefs.defValue;
		var oldSpecTypeStatic = prefs.specTypeStatic;
		prefs.specTypeStatic = true;
		try {
			var t = LinterHelper.runLinter(
				"function LinterStaticOptionalArgs() constructor {\n"
				+ "\tstatic fire_guard = function(_guard/*:int*/, _reset/*:bool*/ = true)/*->void*/ {}\n"
				+ "\tstatic dismiss = function()/*->void*/ {\n"
				+ "\t\tfire_guard(1);\n"
				+ "\t}\n"
				+ "}"
			);
			Assert.areEqual(0, t.problems.length);
		} catch (x:Dynamic) {
			prefs.specTypeStatic = oldSpecTypeStatic;
			throw x;
		}
		prefs.specTypeStatic = oldSpecTypeStatic;
	}
}
