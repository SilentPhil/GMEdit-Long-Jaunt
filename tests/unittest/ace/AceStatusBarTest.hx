package ace;

import gml.GmlFuncDoc;
import massive.munit.Assert;

@:access(ace.AceStatusBar)
class AceStatusBarTest {
	function doc(args:Array<String>):GmlFuncDoc {
		return new GmlFuncDoc("test", "test(", ")", args, false);
	}

	@Test public function unchangedHintKeepsItsDOM() {
		var bar = new AceStatusBar();
		bar.renderDoc(doc(["first", "second"]), 0);
		var hint = bar.statusHint.firstElementChild;
		bar.renderDoc(doc(["first", "second"]), 0);
		Assert.isTrue(hint == bar.statusHint.firstElementChild);
		Assert.areEqual("test(first, second)", bar.statusHint.title);
	}

	@Test public function changingArgumentReusesHintAndMovesHighlight() {
		var bar = new AceStatusBar();
		bar.renderDoc(doc(["first", "second"]), 0);
		var hint = bar.statusHint.firstElementChild;
		bar.renderDoc(doc(["first", "second"]), 1);
		Assert.isTrue(hint == bar.statusHint.firstElementChild);
		Assert.isFalse(hint.children[0].classList.contains("current"));
		Assert.isTrue(hint.children[1].classList.contains("current"));
		bar.renderDoc(doc(["first", "second"]), 5);
		Assert.isTrue(hint.children[1].classList.contains("current"));
	}

	@Test public function changedArgumentNamesRebuildHint() {
		var bar = new AceStatusBar();
		var fn = doc(["first"]);
		bar.renderDoc(fn, 0);
		var hint = bar.statusHint.firstElementChild;
		fn.args[0] = "renamed";
		bar.renderDoc(fn, 0);
		Assert.isFalse(hint == bar.statusHint.firstElementChild);
		Assert.areEqual("test(renamed)", bar.statusHint.textContent);
	}

	@Test public function sameTextWithDifferentArgumentsUpdatesHighlightSpans() {
		var bar = new AceStatusBar();
		bar.renderDoc(doc(["first, second"]), 0);
		bar.renderDoc(doc(["first", "second"]), 1);
		var hint = bar.statusHint.firstElementChild;
		Assert.areEqual(2, hint.children.length);
		Assert.isTrue(hint.children[1].classList.contains("current"));
	}

	@Test public function hintReturnsAfterLinterStatus() {
		var bar = new AceStatusBar();
		bar.renderDoc(doc(["first"]), 0);
		bar.setText("OK!");
		bar.renderDoc(doc(["first"]), 0);
		Assert.areEqual("test(first)", bar.statusHint.textContent);
		Assert.isNotNull(bar.statusHint.querySelector(".argument.current"));
	}
}
