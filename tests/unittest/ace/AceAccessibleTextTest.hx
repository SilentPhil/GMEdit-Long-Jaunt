package ace;

import js.Browser;
import js.html.Element;
import massive.munit.Assert;

class AceAccessibleTextTest {
	function fixture(lines:Array<String>):{editor:Dynamic, source:Element, input:Element} {
		var container = Browser.document.createDivElement();
		var input = Browser.document.createTextAreaElement();
		container.appendChild(input);
		var source = Browser.document.createDivElement();
		container.appendChild(source);
		for (text in lines) {
			var line = Browser.document.createDivElement();
			line.className = "ace_line";
			line.textContent = text;
			source.appendChild(line);
		}
		var events = AceWrap.require("ace/lib/event_emitter").EventEmitter;
		var renderer:Dynamic = {$textLayer: {element: source}};
		js.lib.Object.assign(renderer, events);
		var editor:Dynamic = {container: container, renderer: renderer};
		js.lib.Object.assign(editor, events);
		return {editor: editor, source: source, input: input};
	}

	@Test public function tokenSpansBecomeOneReadableTextNode() {
		var f = fixture(["", "return value;"]);
		f.source.firstElementChild.innerHTML = '<span class="ace_keyword">var</span> '
			+ '<span class="ace_local">value</span> = <span class="ace_numeric">1</span>;';
		var view = new AceAccessibleText(f.editor);
		Assert.areEqual("var value = 1;\nreturn value;", view.element.textContent);
		Assert.areEqual(1, view.element.childNodes.length);
		Assert.areEqual("true", f.source.getAttribute("aria-hidden"));
		Assert.isNull(f.input.closest('[aria-hidden="true"]'));
		Assert.isNull(view.element.querySelector("textarea"));
		view.dispose();
	}

	@Test public function scrollingAndEditingRefreshVisibleText() {
		var f = fixture(["first", "second"]);
		var view = new AceAccessibleText(f.editor);
		f.source.removeChild(f.source.firstChild);
		f.source.firstChild.textContent = "changed <&>";
		f.editor.renderer._signal("afterRender");
		Assert.areEqual("changed <&>", view.element.textContent);
		Assert.areEqual(1, view.element.childNodes.length);
		view.dispose();
	}

	@Test public function cursorOnlyRendersKeepTheSameTextNode() {
		var f = fixture(["unchanged"]);
		var view = new AceAccessibleText(f.editor);
		var node = view.element.firstChild;
		f.editor.renderer._signal("afterRender");
		Assert.isTrue(node == view.element.firstChild);
		view.dispose();
	}

	@Test public function foldsExposeOnlyTheRenderedPlaceholder() {
		var f = fixture(["function test() { ... }"]);
		var view = new AceAccessibleText(f.editor);
		Assert.areEqual("function test() { ... }", view.element.textContent);
		view.dispose();
	}

	@Test public function wrappedRowsKeepTheirDocumentLineBoundary() {
		var f = fixture(["", "next"]);
		f.source.firstElementChild.className = "ace_line_group";
		f.source.firstElementChild.innerHTML = '<div class="ace_line">long </div>'
			+ '<div class="ace_line">line</div>';
		var view = new AceAccessibleText(f.editor);
		Assert.areEqual("long line\nnext", view.element.textContent);
		view.dispose();
	}

	@Test public function destroyRemovesTheMirrorAndListener() {
		var f = fixture(["first"]);
		var view = new AceAccessibleText(f.editor);
		f.editor._signal("destroy");
		Assert.isNull(view.element.parentElement);
		Assert.isNull(f.source.getAttribute("aria-hidden"));
		f.source.firstChild.textContent = "after destruction";
		f.editor.renderer._signal("afterRender");
		Assert.areEqual("first", view.element.textContent);
		view.dispose();
	}

	@Test public function disposeRestoresThePreviousAriaState() {
		var f = fixture(["first"]);
		f.source.setAttribute("aria-hidden", "false");
		var view = new AceAccessibleText(f.editor);
		view.dispose();
		Assert.areEqual("false", f.source.getAttribute("aria-hidden"));
	}
}
