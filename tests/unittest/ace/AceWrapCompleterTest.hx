package ace;

import ace.extern.AceAutoCompleteItem;
import ace.extern.AceAutoCompleteItems;
import ace.extern.AcePos;
import ace.gml.AceGmlHighlightIdents;
import gml.GmlAPI;
import gml.GmlFuncDoc;
import gml.type.GmlType;
import gml.type.GmlTypeDef;
import gml.type.GmlTypeTools;
import gml.type.GmlTypeTemplateItem;
import file.kind.gml.KGmlScript;
import massive.munit.Assert;
import test_helpers.GmlFileHelper;
import tools.Dictionary;

class AceWrapCompleterTest {
	@Test public function testRegionHighlightDoesNotPushRegionState() {
		var file = GmlFileHelper.makeGmlFile("#region @private\nvalue = 1;\n#endregion",
			KGmlScript.inst);
		var rules = AceGmlHighlight.makeRules(file.codeEditor, gml.GmlVersion.map["v23"]);
		var regionRule:Dynamic = null;
		for (rule in rules["start"]) {
			var regex:Dynamic = rule.regex;
			if (regex == null) continue;
			var regexText = Std.string(regex);
			if (regexText.indexOf("#region") >= 0 && regexText.indexOf("#endregion") < 0) {
				regionRule = rule;
				break;
			}
		}
		Assert.isNotNull(regionRule);
		Assert.isTrue(regionRule.push == null);
		Assert.isNotNull(regionRule.onMatch);

		var taggedTokens:Array<Dynamic> = regionRule.onMatch("#region @private", "start", [], "#region @private", 0);
		Assert.areEqual(3, taggedTokens.length);
		Assert.areEqual("preproc.region", taggedTokens[0].type);
		Assert.areEqual("regionname", taggedTokens[1].type);
		Assert.areEqual("comment.meta", taggedTokens[2].type);

		var plainTokens:Array<Dynamic> = regionRule.onMatch("#region", "start", [], "#region", 0);
		Assert.areEqual(1, plainTokens.length);
		Assert.areEqual("preproc.region", plainTokens[0].type);
	}

	@Test public function testEndRegionHighlightDoesNotPushRegionState() {
		var file = GmlFileHelper.makeGmlFile("#region @const\nvalue = 1;\n#endregion\nhint = \"ok\";",
			KGmlScript.inst);
		var rules = AceGmlHighlight.makeRules(file.codeEditor, gml.GmlVersion.map["v23"]);
		var endRegionRule:Dynamic = null;
		for (rule in rules["start"]) {
			var regex:Dynamic = rule.regex;
			if (regex == null) continue;
			if (Std.string(regex).indexOf("#endregion") >= 0) {
				var token:Dynamic = rule.token;
				var tokenText = Std.string(token);
				if (tokenText.indexOf("preproc.region") >= 0) {
					endRegionRule = rule;
					break;
				}
			}
		}
		Assert.isNotNull(endRegionRule);
		Assert.isTrue(endRegionRule.push == null);
	}

	function runCompleter(completer:AceWrapCompleter, line:String, column:Int, prefix:String):AceAutoCompleteItems {
		var out:AceAutoCompleteItems = null;
		var session:Dynamic = {
			modeId: "ace/mode/gml",
			getLine: function(row:Int) return line,
			getTokenAt: function(row:Int, column:Int) return { type: "field", value: prefix }
		};
		var editor:Dynamic = { completer: null };
		completer.getCompletions(cast editor, cast session, new AcePos(column, 0), prefix, function(_, items) {
			out = items;
		});
		return out;
	}

	function makeGeneralCompleter():AceWrapCompleter {
		var items:AceAutoCompleteItems = [
			new AceAutoCompleteItem("__additional_z", "variable"),
			new AceAutoCompleteItem("__add_points_if", "variable")
		];
		var completer = new AceWrapCompleter(items, new Dictionary<Bool>(), true, function(_) return true);
		completer.minLength = 1;
		return completer;
	}

	@Test public function testGeneralCompleterIsSuppressedAfterDotPrefix() {
		var completer = makeGeneralCompleter();
		var line = "open_map_menu_action.add";
		var items = runCompleter(completer, line, line.length, "add");
		Assert.areEqual(0, items.length);
	}

	@Test public function testGeneralCompleterStillWorksWithoutDotPrefix() {
		var completer = makeGeneralCompleter();
		var line = "add";
		var items = runCompleter(completer, line, line.length, "add");
		Assert.areEqual(2, items.length);
	}

	@Test public function testConstructorTemplateParameterHighlighting() {
		var name = "UnitTestGenericHighlight";
		var previous = GmlAPI.gmlDoc[name];
		var doc = GmlFuncDoc.create(name);
		doc.templateItems = [new GmlTypeTemplateItem("TPlayer", "Player")];
		GmlAPI.gmlDoc[name] = doc;
		Assert.areEqual(
			"variable",
			AceGmlHighlightIdents.getTemplateType(name, "TPlayer")
		);
		Assert.isNull(AceGmlHighlightIdents.getTemplateType(name, "Player"));
		var templateType = GmlType.TTemplate(
			"TPlayer", 0, GmlTypeDef.simple("UnitTestPlayer")
		);
		Assert.areEqual(
			"UnitTestPlayer",
			GmlTypeTools.getNamespace(templateType)
		);
		if (previous != null) {
			GmlAPI.gmlDoc[name] = previous;
		} else {
			GmlAPI.gmlDoc.remove(name);
		}
	}
}
