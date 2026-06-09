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
	function problemTexts(t:LinterHelper):String {
		return [for (p in t.problems) p.text].join("\n");
	}
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

		var t = runLinter23(
			"function LinterInheritedChild() : LinterInheritedParent() constructor {\n"
			+ "\tstatic apply = function() {\n"
			+ "\t\t__base_field = 1;\n"
			+ "\t\t__missing_field = 2;\n"
			+ "\t}\n"
			+ "}"
		);

		Assert.areEqual(1, t.warnings.length, problemTexts(t));
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

	@Test public function testPrivateFieldIsNotAvailableToChild() {
		runLinter23(
			"function LinterPrivateBase() constructor {\n"
			+ "\t/// @private\n"
			+ "\tstatic secret = function() {}\n"
			+ "}\n"
			+ "function LinterPrivateChild() : LinterPrivateBase() constructor {\n"
			+ "\tstatic check = function() {\n"
			+ "\t\tsecret();\n"
			+ "\t}\n"
			+ "}"
		, true, KGmlScript.inst);

		var base = GmlAPI.gmlNamespaces["LinterPrivateBase"];
		var child = GmlAPI.gmlNamespaces["LinterPrivateChild"];
		Assert.isNull(child.getInstKind("secret", 0, "LinterPrivateChild"));
		Assert.isNotNull(base.getInstKind("secret", 0, "LinterPrivateBase"));
	}

	@Test public function testPrivateConstructorMarksFieldsPrivateByDefault() {
		runLinter23(
			"/// @private\n"
			+ "function LinterPrivateDefaultBase() constructor {\n"
			+ "\t__hidden = false;\n"
			+ "\tstatic secret = function() {}\n"
			+ "}\n"
		, true, KGmlScript.inst);

		var ns = GmlAPI.gmlNamespaces["LinterPrivateDefaultBase"];
		Assert.isTrue(ns.isInstPrivate("__hidden"));
		Assert.isTrue(ns.isInstPrivate("secret"));
		Assert.isNull(ns.getInstCompItem("__hidden"));
		Assert.isNull(ns.getInstCompItem("secret"));
	}

	@Test public function testPrivateConstructorDefaultWarnsInChild() {
		var t = runLinter23(
			"/// @private\n"
			+ "function LinterPrivateDefaultWarnBase() constructor {\n"
			+ "\t__hidden = false;\n"
			+ "\t/// @protected\n"
			+ "\t__protected = true;\n"
			+ "}\n"
			+ "function LinterPrivateDefaultWarnChild() : LinterPrivateDefaultWarnBase() constructor {\n"
			+ "\t__hidden = true;\n"
			+ "\t__protected = false;\n"
			+ "}\n"
		, true, KGmlScript.inst);

		Assert.areEqual(1, t.warnings.length, problemTexts(t));
		Assert.isTrue(t.warnings[0].text.indexOf("private field `__hidden`") >= 0);

		var base = GmlAPI.gmlNamespaces["LinterPrivateDefaultWarnBase"];
		Assert.isFalse(base.isInstPrivate("__protected"));
		Assert.isNull(base.getInstKind("__protected", 0, "LinterProtectedOther"));
	}

	@Test public function testPrivateInlineIsFieldWarnsInChildConstructor() {
		var t = runLinter23(
			"function LinterPrivateInlineBase() constructor {\n"
			+ "\t__hidden = false; /// @is {bool} @private\n"
			+ "}\n"
			+ "function LinterPrivateInlineChild() : LinterPrivateInlineBase() constructor {\n"
			+ "\t__hidden = true;\n"
			+ "}"
		, true, KGmlScript.inst);

		Assert.areEqual(1, t.warnings.length, problemTexts(t));
		Assert.isTrue(t.warnings[0].text.indexOf("private field `__hidden`") >= 0);
	}

	@Test public function testProtectedFieldIsAvailableOnlyToChild() {
		runLinter23(
			"function LinterProtectedBase() constructor {\n"
			+ "\t/// @protected\n"
			+ "\tstatic inner = function() {}\n"
			+ "}\n"
			+ "function LinterProtectedChild() : LinterProtectedBase() constructor {\n"
			+ "\tstatic check = function() {\n"
			+ "\t\tinner();\n"
			+ "\t}\n"
			+ "}\n"
			+ "function LinterProtectedOther() constructor {\n"
			+ "\tstatic check = function(v:LinterProtectedBase) {\n"
			+ "\t\tv.inner();\n"
			+ "\t}\n"
			+ "}"
		, true, KGmlScript.inst);

		var base = GmlAPI.gmlNamespaces["LinterProtectedBase"];
		var child = GmlAPI.gmlNamespaces["LinterProtectedChild"];
		Assert.isNotNull(child.getInstKind("inner", 0, "LinterProtectedChild"));
		Assert.isNotNull(child.getInstCompItem("inner", 0, "LinterProtectedChild"));
		Assert.isNull(child.getInstCompItem("inner"));
		Assert.isNull(base.getInstKind("inner", 0, "LinterProtectedOther"));
	}

	@Test public function testStaticFunctionOptionalArgKeepsFieldDoc() {
		var prefs = Project.current.properties.linterPrefs;
		if (prefs == null) prefs = Project.current.properties.linterPrefs = GmlLinterPrefs.defValue;
		var oldSpecTypeStatic = prefs.specTypeStatic;
		prefs.specTypeStatic = true;
		try {
			var t = runLinter23(
				"function LinterStaticOptionalArgs() constructor {\n"
				+ "\tstatic fire_guard = function(_guard/*:int*/, _reset/*:bool*/ = true)/*->void*/ {}\n"
				+ "\tstatic dismiss = function()/*->void*/ {\n"
				+ "\t\tfire_guard(1);\n"
				+ "\t}\n"
				+ "}"
			);
			Assert.areEqual(0, t.problems.length, problemTexts(t));
		} catch (x:Dynamic) {
			prefs.specTypeStatic = oldSpecTypeStatic;
			throw x;
		}
		prefs.specTypeStatic = oldSpecTypeStatic;
	}

	@Test public function testOverrideFindsBaseMethod() {
		var t = runLinter23(
			"function LinterOverrideBase() constructor {\n"
			+ "\t/// @virtual\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}\n"
			+ "function LinterOverrideChild() : LinterOverrideBase() constructor {\n"
			+ "\t/// @override\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}"
		, true, KGmlScript.inst);
		Assert.areEqual(0, t.errors.length, problemTexts(t));
	}

	@Test public function testOverrideRequiresBaseMethod() {
		var t = runLinter23(
			"function LinterOverrideMissingBase() constructor {\n"
			+ "}\n"
			+ "function LinterOverrideMissingChild() : LinterOverrideMissingBase() constructor {\n"
			+ "\t/// @override\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}"
		, true, KGmlScript.inst);
		Assert.areEqual(1, t.errors.length, problemTexts(t));
		Assert.isTrue(t.errors[0].text.indexOf("@override") >= 0);
		Assert.isTrue(t.errors[0].text.indexOf("run") >= 0);
	}

	@Test public function testAbstractRequiresChildMethod() {
		var t = runLinter23(
			"function LinterAbstractBase() constructor {\n"
			+ "\t/// @abstract\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}\n"
			+ "function LinterAbstractChild() : LinterAbstractBase() constructor {\n"
			+ "}"
		, true, KGmlScript.inst);
		Assert.areEqual(1, t.errors.length, problemTexts(t));
		Assert.isTrue(t.errors[0].text.indexOf("abstract member `run`") >= 0);
	}

	@Test public function testAbstractImplementedByChildMethod() {
		var t = runLinter23(
			"function LinterAbstractImplementedBase() constructor {\n"
			+ "\t/// @abstract\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}\n"
			+ "function LinterAbstractImplementedChild() : LinterAbstractImplementedBase() constructor {\n"
			+ "\t/// @override\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}"
		, true, KGmlScript.inst);
		Assert.areEqual(0, t.errors.length, problemTexts(t));
	}

	@Test public function testAbstractImplementedByIntermediateParent() {
		var t = runLinter23(
			"function LinterAbstractChainBase() constructor {\n"
			+ "\t/// @abstract\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}\n"
			+ "function LinterAbstractChainMiddle() : LinterAbstractChainBase() constructor {\n"
			+ "\t/// @override\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}\n"
			+ "function LinterAbstractChainLeaf() : LinterAbstractChainMiddle() constructor {\n"
			+ "\tstatic check = function()->bool { return true; }\n"
			+ "}"
		, true, KGmlScript.inst);
		Assert.areEqual(0, t.errors.length, problemTexts(t));
	}

	@Test public function testInterfaceImplementsStillWorksWithNewTagsNearby() {
		var t = runLinter23(
			"/// @interface {LinterTagInterface}\n"
			+ "function LinterTagInterface() constructor {\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}\n"
			+ "/// @implements {LinterTagInterface}\n"
			+ "function LinterTagImpl() constructor {\n"
			+ "\t/// @virtual\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}"
		, true, KGmlScript.inst);
		Assert.areEqual(0, t.errors.length, problemTexts(t));
	}
}
