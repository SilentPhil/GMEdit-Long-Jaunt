package ui;

import js.html.ButtonElement;
import js.html.DivElement;
import js.html.Element;
import js.html.UIEvent;
import tools.Dictionary;
using tools.HtmlTools;

/** Panels docked below the resource tree. */
@:keep class LeftBottomPanel {
	static var list:Array<LeftBottomPanelItem> = [];
	static var map:Dictionary<LeftBottomPanelItem> = new Dictionary();
	static var tabs:DivElement;
	static var panel:DivElement;
	static var sizer:DivElement;
	static var outer:DivElement;
	public static var available(default, null):Bool = false;

	static function dispatchResize() {
		var e:UIEvent = cast Main.document.createEvent('UIEvents');
		e.initUIEvent('resize', true, false, Main.window, 0);
		Main.window.dispatchEvent(e);
	}

	static function deferResize() {
		Main.window.requestAnimationFrame(function(_) dispatchResize());
	}

	static function sync() {
		if (!available) return;
		var n = list.length;
		var display = n == 0 ? "none" : "";
		if (sizer.style.display != display || outer.style.display != display) {
			sizer.style.display = display;
			outer.style.display = display;
			Splitter.syncMain();
			dispatchResize();
		}
		tabs.style.display = n <= 1 ? "none" : "";
	}

	public static function set(name:String) {
		if (!available) return;
		var item = map[name];
		if (item == null) return;
		var curr = panel.children[0];
		var changed = curr != item.el;
		for (other in list) {
			var active = other == item;
			other.tab.classList.setTokenFlag("active", active);
			other.tab.setAttribute("aria-selected", active ? "true" : "false");
			other.tab.tabIndex = active ? 0 : -1;
		}
		if (changed) {
			if (curr != null) panel.removeChild(curr);
			panel.appendChild(item.el);
			deferResize();
		}
	}

	public static function add(name:String, el:Element) {
		if (!available) return;
		var item = map[name];
		var wasActive = item != null && panel.children[0] == item.el;
		if (item != null) {
			list.remove(item);
			tabs.removeChild(item.tab);
		}
		item = new LeftBottomPanelItem(name, el);
		map.set(name, item);
		list.push(item);
		tabs.appendChild(item.tab);
		if (panel.children[0] == null || wasActive || panel.children[0] == el) set(name);
		sync();
	}

	public static function remove(name:String, ?el:Element):Bool {
		if (!available) return false;
		var item = map[name];
		if (item == null) return false;
		if (el != null && item.el != el) return false;
		var wasActive = panel.children[0] == item.el || item.tab.classList.contains("active");
		map.remove(name);
		list.remove(item);
		tabs.removeChild(item.tab);
		if (panel.children[0] == item.el) panel.removeChild(item.el);
		if (wasActive && list.length > 0) set(list[0].name);
		sync();
		return true;
	}

	public static function init() {
		tabs = cast Main.document.querySelector("#left-bottom-panel-tabs");
		panel = cast Main.document.querySelector("#left-bottom-panel-content");
		sizer = cast Main.document.querySelector("#left-bottom-panel-splitter-td");
		outer = cast Main.document.querySelector("#left-bottom-panel-td");
		available = tabs != null && panel != null && sizer != null && outer != null;
	}
}

private class LeftBottomPanelItem {
	public var el:Element;
	public var tab:ButtonElement;
	public var name:String;
	public function new(name:String, el:Element) {
		this.name = name;
		this.el = el;
		tab = Main.document.createButtonElement();
		tab.type = "button";
		tab.className = "left-bottom-panel-tab";
		tab.setAttribute("role", "tab");
		tab.setAttribute("aria-selected", "false");
		tab.tabIndex = -1;
		HtmlTools.setInnerText(tab, name);
		tab.onclick = function(_) LeftBottomPanel.set(name);
	}
}
