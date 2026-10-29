package ace;

import js.Browser;
import js.html.Element;
import massive.munit.Assert;

class AceTextLayerTest {
	function layer(invisibles:Bool = false):Dynamic {
		var Text:Dynamic = AceWrap.require("ace/layer/text").Text;
		var result:Dynamic = js.Syntax.code("Object.create({0}.prototype)", Text);
		result.dom = AceWrap.require("ace/lib/dom");
		result.element = Browser.document.createDivElement();
		result.config = {characterWidth: 8};
		result.session = {
			getTabSize: function() return 4,
			getScreenTabSize: function(column:Int) return 4 - column % 4
		};
		result.showInvisibles = invisibles;
		result.displayIndentGuides = false;
		result.$computeTabString();
		return result;
	}

	function render(textLayer:Dynamic, parent:Element, column:Int, type:String, text:String):Int {
		return textLayer.$renderToken(parent, column, {type: type, value: text}, text);
	}

	@Test public function alignedTabsUseOneTextNode() {
		var textLayer = layer();
		var parent = Browser.document.createDivElement();
		Assert.areEqual(13, render(textLayer, parent, 0, "text", "x\t\t\ty"));
		Assert.areEqual("x           y", parent.textContent);
		Assert.areEqual(1, parent.childNodes.length);
	}

	@Test public function tabStopsContinueAcrossTokens() {
		var textLayer = layer();
		var parent = Browser.document.createDivElement();
		var column = render(textLayer, parent, 0, "localfield", "value");
		column = render(textLayer, parent, column, "text", "\t\t");
		column = render(textLayer, parent, column, "string", "\"Привет\"");
		Assert.areEqual(20, column);
		Assert.areEqual('value       "Привет"', parent.textContent);
		Assert.areEqual(1, parent.querySelectorAll(".ace_localfield").length);
		Assert.areEqual(1, parent.querySelectorAll(".ace_string").length);
	}

	@Test public function sourceTextIsEscapedWithoutChangingTokenClasses() {
		var textLayer = layer();
		var parent = Browser.document.createDivElement();
		var text = '<img src="x"> & <script>';
		render(textLayer, parent, 0, "comment.meta", text);
		Assert.areEqual(text, parent.textContent);
		Assert.isNull(parent.querySelector("img, script"));
		Assert.isNotNull(parent.querySelector(".ace_comment.ace_meta"));
	}

	@Test public function invisibleTabsAndSpacesKeepTheirMarkers() {
		var textLayer = layer(true);
		var parent = Browser.document.createDivElement();
		Assert.areEqual(5, render(textLayer, parent, 0, "text", "a\t "));
		Assert.isNotNull(parent.querySelector(".ace_invisible_tab"));
		Assert.isNotNull(parent.querySelector(".ace_invisible_space"));
	}

	@Test public function wideCharactersAfterTabsKeepTheirWidths() {
		var textLayer = layer();
		var parent = Browser.document.createDivElement();
		Assert.areEqual(9, render(textLayer, parent, 0, "string", "\t中\tx"));
		Assert.areEqual("    中  x", parent.textContent);
		Assert.areEqual("16px", parent.querySelector(".ace_cjk").style.width);
	}

	@Test public function controlCharactersAfterTabsKeepTheirMarkers() {
		var textLayer = layer();
		var parent = Browser.document.createDivElement();
		Assert.areEqual(6, render(textLayer, parent, 0, "text", "\t\x01x"));
		Assert.areEqual("    ·x", parent.textContent);
		Assert.isNotNull(parent.querySelector(".ace_invalid"));
	}

	@Test public function foldsKeepTheirExplicitWidth() {
		var textLayer = layer();
		var parent = Browser.document.createDivElement();
		Assert.areEqual(3, render(textLayer, parent, 0, "fold", "..."));
		Assert.areEqual("24px", parent.querySelector(".ace_fold").style.width);
	}
}
