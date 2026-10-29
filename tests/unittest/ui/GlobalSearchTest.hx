package ui;

import js.html.Element;
import js.html.Event;
import js.html.KeyboardEvent;
import js.lib.RegExp;
import massive.munit.Assert;

@:access(ui.GlobalSearch)
class GlobalSearchTest {
	var fixture:Element;

	@Before public function before() {
		fixture = Main.document.createDivElement();
		fixture.innerHTML = '<form id="global-search"></form><form id="global-search-info"></form>';
		Main.document.body.appendChild(fixture);
		GlobalSearch.init();
	}

	@After public function after() {
		fixture.remove();
	}

	@Test public function emptyInputDisablesSearchAndReplaceButtons() {
		Assert.isTrue(GlobalSearch.btFind.disabled);
		Assert.isTrue(GlobalSearch.btReplace.disabled);
		Assert.isTrue(GlobalSearch.btPreview.disabled);
		GlobalSearch.fdFind.dispatchEvent(new KeyboardEvent("keydown", {keyCode: 13}));
		Assert.isNull(GlobalSearch.searchRun);

		GlobalSearch.fdFind.value = " ";
		GlobalSearch.fdFind.dispatchEvent(new Event("input"));
		Assert.isFalse(GlobalSearch.btFind.disabled);
		Assert.isFalse(GlobalSearch.btReplace.disabled);
		Assert.isFalse(GlobalSearch.btPreview.disabled);

		GlobalSearch.fdFind.value = "";
		GlobalSearch.fdFind.dispatchEvent(new Event("input"));
		GlobalSearch.setSearchControlsEnabled(true);
		Assert.isTrue(GlobalSearch.btFind.disabled);
		Assert.isTrue(GlobalSearch.btReplace.disabled);
		Assert.isTrue(GlobalSearch.btPreview.disabled);
	}

	@Test public function emptyInputCannotStartAnySearchAction() {
		GlobalSearch.cbUnique.checked = true;
		for (regex in [false, true]) {
			GlobalSearch.cbRegExp.checked = regex;
			Assert.isNull(GlobalSearch.getOptions());
			GlobalSearch.findAuto();
			GlobalSearch.replaceAuto();
			GlobalSearch.previewAuto();
			Assert.isNull(GlobalSearch.searchRun);
			Assert.isFalse(GlobalSearch.fdFind.disabled);
		}
	}

	@Test public function explicitEmptyOptionsCannotLockSearchControls() {
		GlobalSearch.runAuto({find: ""});
		GlobalSearch.runAuto({find: new RegExp("", "g")});
		Assert.isNull(GlobalSearch.searchRun);
		Assert.isFalse(GlobalSearch.fdFind.disabled);
	}

	@Test public function emptyDirectSearchCompletesWithoutStarting() {
		var finished = 0;
		GlobalSearch.run({find: ""}, function() finished++);
		GlobalSearch.run({find: new RegExp("", "g")}, function() finished++);
		Assert.areEqual(2, finished);
	}
}
