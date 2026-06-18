package ace;

import ace.extern.AceAutoCompleteItem;
import ace.extern.AceAutoCompleteItems;
import ace.extern.AcePos;
import massive.munit.Assert;
import tools.Dictionary;

class AceWrapCompleterTest {
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
}
