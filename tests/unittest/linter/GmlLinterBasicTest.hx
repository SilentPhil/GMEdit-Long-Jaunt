package linter;
import file.FileKind;
import file.kind.gml.KGmlScript;
import gml.GmlAPI;
import gml.GmlImports;
import gml.GmlVersion;
import gml.Project;
import gml.type.GmlTypeTools;
import parsers.linter.GmlLinter;
import parsers.linter.GmlLinterPrefs;
import test_helpers.GmlFileHelper;
import test_helpers.LinterHelper;
import massive.munit.Assert;
import tools.Dictionary;

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

	@Test public function testPublicFieldOverridesPrivateConstructorDefault() {
		var t = runLinter23(
			"/// @private\n"
			+ "function LinterPrivateDefaultPublicMethod() constructor {\n"
			+ "\t__hidden = false;\n"
			+ "\t/// @public\n"
			+ "\tstatic visible = function()->bool {\n"
			+ "\t\treturn __hidden;\n"
			+ "\t}\n"
			+ "}\n"
			+ "function LinterPrivateDefaultPublicMethodOther() constructor {\n"
			+ "\tstatic check = function(item:LinterPrivateDefaultPublicMethod) {\n"
			+ "\t\titem.visible();\n"
			+ "\t\titem.__hidden = true;\n"
			+ "\t}\n"
			+ "}\n"
		, true, KGmlScript.inst);

		Assert.areEqual(1, t.warnings.length, problemTexts(t));
		Assert.isTrue(t.warnings[0].text.indexOf("private field `__hidden`") >= 0);

		var ns = GmlAPI.gmlNamespaces["LinterPrivateDefaultPublicMethod"];
		Assert.isFalse(ns.isInstPrivate("visible"));
		Assert.isNotNull(ns.getInstKind("visible", 0, "LinterPrivateDefaultPublicMethodOther"));
		Assert.isNotNull(ns.getInstCompItem("visible"));
	}
	
	@Test public function testPrivateRegionMarksFieldsPrivateByDefault() {
		runLinter23(
			"function LinterPrivateRegionBase() constructor {\n"
			+ "\t#region @private\n"
			+ "\t__hidden = false;\n"
			+ "\tstatic secret = function() {}\n"
			+ "\t#endregion\n"
			+ "\tpublic = true;\n"
			+ "}\n"
		, true, KGmlScript.inst);

		var ns = GmlAPI.gmlNamespaces["LinterPrivateRegionBase"];
		Assert.isTrue(ns.isInstPrivate("__hidden"));
		Assert.isTrue(ns.isInstPrivate("secret"));
		Assert.isFalse(ns.isInstPrivate("public"));
		Assert.isNull(ns.getInstCompItem("__hidden"));
		Assert.isNull(ns.getInstCompItem("secret"));
		Assert.isNotNull(ns.getInstCompItem("public"));
	}
	
	@Test public function testNamedProtectedRegionIsAvailableOnlyToChild() {
		runLinter23(
			"function LinterProtectedRegionBase() constructor {\n"
			+ "\t#region helpers @protected\n"
			+ "\tstatic inner = function() {}\n"
			+ "\t#endregion\n"
			+ "}\n"
			+ "function LinterProtectedRegionChild() : LinterProtectedRegionBase() constructor {\n"
			+ "\tstatic check = function() {\n"
			+ "\t\tinner();\n"
			+ "\t}\n"
			+ "}\n"
			+ "function LinterProtectedRegionOther() constructor {\n"
			+ "\tstatic check = function(v:LinterProtectedRegionBase) {\n"
			+ "\t\tv.inner();\n"
			+ "\t}\n"
			+ "}"
		, true, KGmlScript.inst);

		var base = GmlAPI.gmlNamespaces["LinterProtectedRegionBase"];
		var child = GmlAPI.gmlNamespaces["LinterProtectedRegionChild"];
		Assert.isNotNull(child.getInstKind("inner", 0, "LinterProtectedRegionChild"));
		Assert.isNull(base.getInstKind("inner", 0, "LinterProtectedRegionOther"));
		Assert.isNull(base.getInstCompItem("inner"));
	}
	
	@Test public function testExplicitAccessOverridesRegionAccess() {
		var t = runLinter23(
			"function LinterRegionExplicitAccessBase() constructor {\n"
			+ "\t#region @private\n"
			+ "\t__hidden = false;\n"
			+ "\t/// @public\n"
			+ "\tstatic visible = function()->bool {\n"
			+ "\t\treturn __hidden;\n"
			+ "\t}\n"
			+ "\t#endregion\n"
			+ "}\n"
			+ "function LinterRegionExplicitAccessOther() constructor {\n"
			+ "\tstatic check = function(item:LinterRegionExplicitAccessBase) {\n"
			+ "\t\titem.visible();\n"
			+ "\t\titem.__hidden = true;\n"
			+ "\t}\n"
			+ "}\n"
		, true, KGmlScript.inst);

		Assert.areEqual(1, t.warnings.length, problemTexts(t));
		Assert.isTrue(t.warnings[0].text.indexOf("private field `__hidden`") >= 0);

		var ns = GmlAPI.gmlNamespaces["LinterRegionExplicitAccessBase"];
		Assert.isFalse(ns.isInstPrivate("visible"));
		Assert.isNotNull(ns.getInstKind("visible", 0, "LinterRegionExplicitAccessOther"));
		Assert.isNotNull(ns.getInstCompItem("visible"));
	}
	
	@Test public function testNestedRegionAccessOverridesOuterRegionAccess() {
		runLinter23(
			"function LinterNestedRegionBase() constructor {\n"
			+ "\t#region @private\n"
			+ "\t__hidden = false;\n"
			+ "\t#region @public\n"
			+ "\tvisible = true;\n"
			+ "\t#endregion\n"
			+ "\t#endregion\n"
			+ "}\n"
		, true, KGmlScript.inst);

		var ns = GmlAPI.gmlNamespaces["LinterNestedRegionBase"];
		Assert.isTrue(ns.isInstPrivate("__hidden"));
		Assert.isFalse(ns.isInstPrivate("visible"));
		Assert.isNull(ns.getInstCompItem("__hidden"));
		Assert.isNotNull(ns.getInstCompItem("visible"));
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

	@Test public function testInlineIsUsesImportedTypeAlias() {
		var code = "canvas = undefined; /// @is {CanvasScroll}\n";
		var file = GmlFileHelper.makeGmlFile(code, KGmlScript.inst);
		var editor = file.codeEditor;
		editor.imports = new Dictionary();
		var imports = new GmlImports();
		imports.longen["CanvasScroll"] = "gw_CanvasScroll";
		editor.imports[""] = imports;

		var linter = new GmlLinter();
		var hasError = linter.run(code, editor, Project.current.version);
		Assert.isFalse(hasError, linter.errorText);
		Assert.areEqual(
			"gw_CanvasScroll",
			GmlTypeTools.toString(linter.getContextInstType("canvas"))
		);
	}

	@Test public function testTernaryUsesCommonParentType() {
		var stringNs = GmlAPI.ensureNamespace("string");
		var uuidNs = GmlAPI.ensureNamespace("UnitTestActorUUID");
		uuidNs.parent = stringNs;

		var t = runLinter23(
			"function UnitTestTernaryUUID(uuid/*:UnitTestActorUUID*/) {\n"
			+ "\tvar value = true ? uuid : \"\";\n"
			+ "}\n"
		, false, KGmlScript.inst);
		Assert.areEqual(0, t.problems.length, problemTexts(t));
	}

	@Test public function testInheritedFieldAccessIsKeptWhenChildAssignsField() {
		var t = runLinter23(
			"function LinterInheritedAccessBase() constructor {\n"
			+ "\t__caption = \"\"; /// @is {string} @protected\n"
			+ "\t__icon = noone; /// @is {asset.GMSprite} @private\n"
			+ "}\n"
			+ "function LinterInheritedAccessChild() : LinterInheritedAccessBase() constructor {\n"
			+ "\t__caption = \"child\";\n"
			+ "\t__icon = noone;\n"
			+ "}\n"
			+ "function LinterInheritedAccessOther() constructor {\n"
			+ "\tstatic check = function(item:LinterInheritedAccessChild) {\n"
			+ "\t\titem.__caption = \"other\";\n"
			+ "\t\titem.__icon = noone;\n"
			+ "\t}\n"
			+ "}\n"
		, true, KGmlScript.inst);

		Assert.areEqual(3, t.warnings.length, problemTexts(t));
		Assert.isTrue(problemTexts(t).indexOf("private field `__icon`") >= 0);
		Assert.isTrue(problemTexts(t).indexOf("protected field `__caption`") >= 0);

		var child = GmlAPI.gmlNamespaces["LinterInheritedAccessChild"];
		Assert.isNull(child.getInstCompItem("__caption"));
		Assert.isNull(child.getInstCompItem("__icon"));
		Assert.isNull(child.getInstKind("__caption", 0, "LinterInheritedAccessOther"));
		Assert.isNull(child.getInstKind("__icon", 0, "LinterInheritedAccessOther"));
	}

	@Test public function testInheritedFieldAccessOverridesPrivateConstructorDefault() {
		var t = runLinter23(
			"/// @private\n"
			+ "function LinterInheritedPrivateDefaultBase() constructor {\n"
			+ "\t__caption = \"\"; /// @is {string} @protected\n"
			+ "\t__hint = \"\"; /// @is {string} @protected\n"
			+ "\t__icon = noone; /// @is {asset.GMSprite} @private\n"
			+ "}\n"
			+ "function LinterInheritedPrivateDefaultChild() : LinterInheritedPrivateDefaultBase() constructor {\n"
			+ "\t__caption = \"child\";\n"
			+ "\t__hint = \"hint\";\n"
			+ "\t__icon = noone;\n"
			+ "}\n"
			+ "function LinterInheritedPrivateDefaultOther() constructor {\n"
			+ "\tstatic check = function(item:LinterInheritedPrivateDefaultChild) {\n"
			+ "\t\titem.__caption = \"other\";\n"
			+ "\t\titem.__hint = \"other\";\n"
			+ "\t\titem.__icon = noone;\n"
			+ "\t}\n"
			+ "}\n"
		, true, KGmlScript.inst);

		Assert.areEqual(4, t.warnings.length, problemTexts(t));
		Assert.isTrue(problemTexts(t).indexOf("private field `__icon`") >= 0);
		Assert.isTrue(problemTexts(t).indexOf("protected field `__caption`") >= 0);
		Assert.isTrue(problemTexts(t).indexOf("protected field `__hint`") >= 0);

		var child = GmlAPI.gmlNamespaces["LinterInheritedPrivateDefaultChild"];
		Assert.isNull(child.getInstCompItem("__caption"));
		Assert.isNull(child.getInstCompItem("__hint"));
		Assert.isNull(child.getInstCompItem("__icon"));
		Assert.isNull(child.getInstKind("__caption", 0, "LinterInheritedPrivateDefaultOther"));
		Assert.isNull(child.getInstKind("__hint", 0, "LinterInheritedPrivateDefaultOther"));
		Assert.isNull(child.getInstKind("__icon", 0, "LinterInheritedPrivateDefaultOther"));
	}

	@Test public function testLateInheritedAccessHidesImplicitPublicChildField() {
		var parent = GmlAPI.ensureNamespace("LinterLateAccessParent");
		var child = GmlAPI.ensureNamespace("LinterLateAccessChild");
		child.addFieldHint("__caption", true, new ace.extern.AceAutoCompleteItem("__caption", "variable"), null, null);
		parent.addFieldHint("__caption", true, null, null, null, false, null, Protected);
		child.parent = parent;

		Assert.isNotNull(child.getInstKind("__caption", 0, "LinterLateAccessChild"));
		Assert.isNull(child.getInstKind("__caption", 0, "LinterLateAccessOther"));
		Assert.isNull(child.getInstCompItem("__caption"));
	}

	@Test public function testEnumIntFieldCompletionStaysVariable() {
		runLinter23(
			"enum LinterAdviceTutorial {\n"
			+ "\tNONE,\n"
			+ "}\n"
			+ "function LinterAdviceMetaBase() constructor {\n"
			+ "\t__advanced_tutorial_to_launch = LinterAdviceTutorial.NONE; /// @is {int<LinterAdviceTutorial>}\n"
			+ "}\n"
		, true, KGmlScript.inst);

		var ns = GmlAPI.gmlNamespaces["LinterAdviceMetaBase"];
		Assert.areEqual("variable", ns.getInstCompItem("__advanced_tutorial_to_launch").meta);
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

	@Test public function testOverrideWithoutParentReportsMemberLineAfterEnum() {
		var t = runLinter23(
			"enum LinterOverrideMode {\n"
			+ "\tQueue,\n"
			+ "}\n"
			+ "\n"
			+ "function LinterOverrideNoParent() constructor {\n"
			+ "\t/// @override\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}"
		, true, KGmlScript.inst);
		Assert.areEqual(1, t.errors.length, problemTexts(t));
		Assert.isTrue(t.errors[0].text.indexOf("@override") >= 0);
		Assert.areEqual(6, t.errors[0].pos.row);
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

	@Test public function testAbstractClassDoesNotMakeFirstMemberAbstract() {
		var t = runLinter23(
			"/// @abstract\n"
			+ "function LinterAbstractConcreteBase() constructor {\n"
			+ "\tstatic run = function()->void {}\n"
			+ "}\n"
			+ "function LinterAbstractConcreteChild() : LinterAbstractConcreteBase() constructor {\n"
			+ "}"
		, true, KGmlScript.inst);
		Assert.areEqual(0, t.errors.length, problemTexts(t));
	}

	@Test public function testAbstractClassCannotBeInstantiated() {
		var t = runLinter23(
			"/// @abstract\n"
			+ "function LinterAbstractNoNew() constructor {\n"
			+ "}\n"
			+ "var inst = new LinterAbstractNoNew();"
		, true, KGmlScript.inst);
		Assert.areEqual(1, t.errors.length, problemTexts(t));
		Assert.isTrue(t.errors[0].text.indexOf("abstract") >= 0);
		Assert.isTrue(t.errors[0].text.indexOf("instantiated") >= 0);
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
