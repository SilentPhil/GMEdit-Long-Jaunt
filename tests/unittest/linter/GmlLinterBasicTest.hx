package linter;
import gml.GmlAPI;
import test_helpers.LinterHelper;
import massive.munit.Assert;

class GmlLinterBasicTest {
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
}
