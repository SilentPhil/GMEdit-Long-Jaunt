package types;

import gml.GmlAPI;
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
	@Test public function testRawNamespaceHintCanCastWithImportedAliasContext() {
		var stringNs = GmlAPI.ensureNamespace("string");
		var uuidNs = GmlAPI.ensureNamespace("UnitTestUUID");
		uuidNs.parent = stringNs;

		var imports = new GmlImports();
		imports.longen["UnitTestUUID"] = "pkg_UnitTestUUID";
		Assert.isTrue(GmlTypeCanCastTo.canCastTo(
			GmlTypeDef.parse("UnitTestUUID"),
			GmlTypeDef.string,
			null,
			imports
		));
	}
	@Test public function testEnumIntegerUnionSpellingsAreEquivalent() {
		var outerUnion = GmlTypeDef.parse("int<PACKET_ID_SV>|int<PACKET_ID_CL>");
		var innerUnion = GmlTypeDef.parse("int<PACKET_ID_SV|PACKET_ID_CL>");
		var clientPacket = GmlTypeDef.parse("int<PACKET_ID_CL>");
		var serverPacket = GmlTypeDef.parse("int<PACKET_ID_SV>");

		Assert.isTrue(GmlTypeCanCastTo.canCastTo(clientPacket, outerUnion));
		Assert.isTrue(GmlTypeCanCastTo.canCastTo(serverPacket, outerUnion));
		Assert.isTrue(GmlTypeCanCastTo.canCastTo(clientPacket, innerUnion));
		Assert.isTrue(GmlTypeCanCastTo.canCastTo(serverPacket, innerUnion));
		Assert.isTrue(outerUnion.equals(innerUnion));

		// A value that may belong to either branch must remain wider than one branch.
		Assert.isFalse(GmlTypeCanCastTo.canCastTo(innerUnion, clientPacket));
	}
}
