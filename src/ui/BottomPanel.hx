package ui;

import js.html.ButtonElement;
import js.html.DivElement;
import js.html.Element;
import js.html.MutationObserver;
import js.html.UIEvent;
import tools.Dictionary;
using tools.HtmlTools;

/**
 * Panels docked below the editor. Plugins should feature-detect
 * `GMEdit.bottomPanel` so that they remain compatible with vanilla GMEdit.
 */
@:keep class BottomPanel {
	static inline var legacyName = "Job Output";
	static var list:Array<BottomPanelItem> = [];
	static var map:Dictionary<BottomPanelItem> = new Dictionary();
	static var tabs:DivElement;
	static var panel:DivElement;
	static var sizer:DivElement;
	static var outer:DivElement;
	static var workspace:DivElement;
	static var observer:MutationObserver;
	static var legacyElement:Element;

	static function dispatchResize() {
		var e:UIEvent = cast Main.document.createEvent('UIEvents');
		e.initUIEvent('resize', true, false, Main.window, 0);
		Main.window.dispatchEvent(e);
	}

	static function sync() {
		var n = list.length;
		var v = n == 0 ? "none" : "";
		if (sizer.style.display != v || outer.style.display != v) {
			sizer.style.display = v;
			outer.style.display = v;
			Splitter.syncMain();
			dispatchResize();
		}
		tabs.style.display = n <= 1 ? "none" : "";
	}

	public static function set(name:String) {
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
		}
		if (changed && name == "Problems") Problems.onShown();
	}

	public static function add(name:String, el:Element) {
		var item = map[name];
		var wasActive = item != null && panel.children[0] == item.el;
		if (item != null) {
			list.remove(item);
			tabs.removeChild(item.tab);
		}
		item = new BottomPanelItem(name, el);
		map.set(name, item);
		list.push(item);
		tabs.appendChild(item.tab);
		if (panel.children[0] == null || wasActive || panel.children[0] == el) set(name);
		sync();
	}

	public static function remove(name:String, ?el:Element):Bool {
		var item = map[name];
		if (item == null) return false;
		if (el != null && item.el != el) return false;
		var wasActive = panel.children[0] == item.el || item.tab.classList.contains("active");
		map.remove(name);
		list.remove(item);
		tabs.removeChild(item.tab);
		if (panel.children[0] == item.el) panel.removeChild(item.el);
		if (wasActive && list.length > 0) set(list[0].name);
		if (item.el == legacyElement) legacyElement = null;
		sync();
		return true;
	}

	static function isLegacyBottomPanel(node:Element):Bool {
		return node != null && node.id == "bottom-panel";
	}

	static function syncLegacyPanel() {
		var found:Element = cast workspace.querySelector("#bottom-panel");
		if (found != null) {
			if (legacyElement == null) {
				legacyElement = found;
				observer.observe(found, { childList: true, subtree: true });
				add(legacyName, found);
				// The first insertion comes from BottomPane.show(), so treat it as
				// an intentional request to reveal newly-created job output.
				set(legacyName);
			} else {
				// Constructor removes and re-appends its pane on every
				// activeFileChange to keep it at the bottom in vanilla GMEdit.
				// Preserve our selected tab during that housekeeping operation.
				var item = map[legacyName];
				var wasActive = item != null && item.tab.classList.contains("active");
				if (wasActive) {
					if (panel.children[0] != found) {
						var curr = panel.children[0];
						if (curr != null) panel.removeChild(curr);
						panel.appendChild(found);
					}
				} else found.remove();
			}
			return;
		}
		if (legacyElement == null) return;
		var tabList = legacyElement.querySelector("nav > .tab-list");
		var hasTabs = tabList != null && tabList.children.length > 0;
		if (!hasTabs && legacyElement.parentElement == null) remove(legacyName, legacyElement);
	}

	public static function init() {
		tabs = Main.document.querySelectorAuto("#bottom-panel-tabs");
		panel = Main.document.querySelectorAuto("#bottom-panel-content");
		sizer = Main.document.querySelectorAuto("#bottom-panel-splitter-td");
		outer = Main.document.querySelectorAuto("#bottom-panel-td");
		workspace = Main.document.querySelectorAuto(".bottom.gml > .tabview");
		observer = new MutationObserver(function(_, _) syncLegacyPanel());
		observer.observe(workspace, { childList: true });
		observer.observe(panel, { childList: true });
	}
}

private class BottomPanelItem {
	public var el:Element;
	public var tab:ButtonElement;
	public var name:String;
	public function new(name:String, el:Element) {
		this.name = name;
		this.el = el;
		tab = Main.document.createButtonElement();
		tab.type = "button";
		tab.className = "bottom-panel-tab";
		tab.setAttribute("role", "tab");
		tab.setAttribute("aria-selected", "false");
		tab.tabIndex = -1;
		HtmlTools.setInnerText(tab, name);
		tab.onclick = function(_) BottomPanel.set(name);
	}
}
