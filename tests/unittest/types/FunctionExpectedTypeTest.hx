package types;

import gml.GmlImports;
import gml.type.GmlTypeCanCastTo;
import gml.type.GmlTypeDef;
import ui.Preferences;
import test_helpers.LinterHelper;
import massive.munit.Assert;

class FunctionExpectedTypeTest {
	@Test public function testValidTypes() {
		var result = LinterHelper.runLinter("buffer_create(1, buffer_grow, 1);");
		Assert.isTrue(result.problems.length == 0);

		result = LinterHelper.runLinter("buffer_create(1, buffer_u8, 1);");
		//Assert.isTrue(result.problems.length > 1);
	}
	@Test public function testImplicitType() {
		Preferences.current.linterPrefs.specTypeVar = true;
		var result = LinterHelper.runLinter("var a = string(\"hello\");");
		//Assert.areEqual("string", result.localVariables["a"].type);
	}
	@Test public function testImportedTypeAliasCanCast() {
		var imports = new GmlImports();
		imports.longen["Unit"] = "gw_Unit";
		Assert.isTrue(GmlTypeCanCastTo.canCastTo(
			GmlTypeDef.parse("Unit"),
			GmlTypeDef.parse("gw_Unit|number"),
			null,
			imports
		));
	}
}
