package ui;

import js.html.DivElement;
import massive.munit.Assert;
import tools.Dictionary;

@:access(ui.Sidebar)
class SidebarTest {
	var fixture:DivElement;
	var originalSplitter:Dynamic;
	var originalRequestAnimationFrame:Dynamic;
	var frames:Array<Float->Void>;
	var resizeCount:Int;
	var resizeListener:js.html.Event->Void;

	@Before public function setup() {
		fixture = Main.document.createDivElement();
		fixture.innerHTML = '<div id="misc-splitter-td" style="display:none"></div>'
			+ '<div id="misc-td" style="display:none">'
			+ '<div id="misc-tabs" style="display:none"></div>'
			+ '<select id="misc-select"></select><div id="misc-panel"></div></div>';
		Main.document.body.appendChild(fixture);
		Sidebar.list = [];
		Sidebar.map = new Dictionary();
		Sidebar.init();
		originalSplitter = untyped Main.window.GMEdit_Splitter;
		untyped Main.window.GMEdit_Splitter = { syncMain: function() {} };
		originalRequestAnimationFrame = untyped Main.window.requestAnimationFrame;
		frames = [];
		untyped Main.window.requestAnimationFrame = function(callback:Float->Void):Int {
			frames.push(callback);
			return frames.length;
		};
		resizeCount = 0;
		resizeListener = function(_) resizeCount++;
		Main.window.addEventListener("resize", resizeListener);
	}

	@After public function tearDown() {
		Main.window.removeEventListener("resize", resizeListener);
		untyped Main.window.requestAnimationFrame = originalRequestAnimationFrame;
		untyped Main.window.GMEdit_Splitter = originalSplitter;
		Sidebar.list = [];
		Sidebar.map = new Dictionary();
		fixture.remove();
	}

	@Test public function sharesRightDockWithoutStealingSelection() {
		var outline = Main.document.createDivElement();
		var preview = Main.document.createDivElement();
		Sidebar.add("Outline View", outline);
		Assert.areEqual("none", Sidebar.tabs.style.display);
		Assert.areEqual("", Sidebar.outer.style.display);
		Sidebar.add("GooWee Preview", preview);
		Assert.areEqual("", Sidebar.tabs.style.display);
		Assert.areEqual(outline, Sidebar.panel.children[0]);
		Assert.isNull(preview.parentElement);
		Sidebar.set("GooWee Preview");
		Assert.areEqual(preview, Sidebar.panel.children[0]);
		Assert.isNull(outline.parentElement);
		Assert.areEqual("false", Sidebar.tabs.children[0].getAttribute("aria-selected"));
		Assert.areEqual("true", Sidebar.tabs.children[1].getAttribute("aria-selected"));
		Sidebar.set("Outline View");
		Assert.areEqual(outline, Sidebar.panel.children[0]);
	}

	@Test public function replacesAndRemovesPanelsSafelyOnPluginReload() {
		var outline = Main.document.createDivElement();
		var preview = Main.document.createDivElement();
		var reloaded = Main.document.createDivElement();
		Sidebar.add("Outline View", outline);
		Sidebar.add("GooWee Preview", preview);
		Sidebar.set("GooWee Preview");
		Sidebar.add("GooWee Preview", reloaded);
		Assert.areEqual(2, Sidebar.tabs.children.length);
		Assert.areEqual(reloaded, Sidebar.panel.children[0]);
		Assert.isNull(preview.parentElement);
		Assert.isFalse(Sidebar.remove("GooWee Preview", preview));
		Assert.isTrue(Sidebar.remove("GooWee Preview", reloaded));
		Assert.areEqual(outline, Sidebar.panel.children[0]);
		Assert.areEqual("none", Sidebar.tabs.style.display);
		Assert.isTrue(Sidebar.remove("Outline View", outline));
		Assert.areEqual("none", Sidebar.outer.style.display);
		Assert.areEqual("none", Sidebar.sizer.style.display);
	}

	@Test public function resizesPreviewAfterTabReattachment() {
		Sidebar.add("Outline View", Main.document.createDivElement());
		Sidebar.add("GooWee Preview", Main.document.createDivElement());
		frames = [];
		resizeCount = 0;
		Sidebar.set("GooWee Preview");
		Assert.areEqual(0, resizeCount);
		Assert.areEqual(1, frames.length);
		frames.shift()(0);
		Assert.areEqual(1, resizeCount);
		Sidebar.set("GooWee Preview");
		Assert.areEqual(0, frames.length);
	}
}
