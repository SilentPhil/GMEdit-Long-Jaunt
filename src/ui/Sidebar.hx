package ui;
import js.html.CustomEvent;
import js.html.ButtonElement;
import js.html.DivElement;
import js.html.Element;
import js.html.Event;
import js.html.OptionElement;
import js.html.SelectElement;
import js.html.UIEvent;
import tools.Dictionary;
using tools.HtmlTools;

/**
 * The secondary sidebar for plugins.
 * If there's more than one panel shown, a tab bar appears.
 * @author YellowAfterlife
 */
@:keep class Sidebar {
	static var list:Array<SidebarItem> = [];
	static var map:Dictionary<SidebarItem> = new Dictionary();
	static var select:SelectElement;
	static var tabs:DivElement;
	static var panel:DivElement;
	static var sizer:DivElement;
	static var outer:DivElement;
	private static function sync() {
		var n = list.length;
		var v = n == 0 ? "none" : "";
		if (sizer.style.display != v) {
			sizer.style.display = v;
			outer.style.display = v;
			Splitter.syncMain();
			// force Ace to note changes:
			var e:UIEvent = cast Main.document.createEvent('UIEvents');
			e.initUIEvent('resize', true, false, Main.window, 0); 
			Main.window.dispatchEvent(e);
		}
		select.style.display = "none";
		tabs.style.display = n <= 1 ? "none" : "";
	}
	public static function set(name:String) {
		var item = map[name];
		if (item == null) return;
		var curr = panel.children[0];
		var fn = select.onchange;
		select.onchange = null;
		select.value = name;
		for (other in list) {
			var active = other == item;
			other.tab.classList.setTokenFlag("active", active);
			other.tab.setAttribute("aria-selected", active ? "true" : "false");
			other.tab.tabIndex = active ? 0 : -1;
		}
		if (curr != item.el) {
			if (curr != null) panel.removeChild(curr);
			panel.appendChild(item.el);
		}
		select.onchange = fn;
		/*
		if (panel.children[0] != null) {
			panel.removeChild(panel.children[0]);
		}
		panel.appendChild(item.el);*/
	}
	public static function add(name:String, el:Element) {
		var item = map[name];
		var wasActive = item != null && panel.children[0] == item.el;
		if (item != null) {
			list.remove(item);
			select.removeChild(item.opt);
			tabs.removeChild(item.tab);
		}
		item = new SidebarItem(name, el);
		map.set(name, item);
		list.push(item);
		select.appendChild(item.opt);
		tabs.appendChild(item.tab);
		if (panel.children[0] == null || wasActive || panel.children[0] == el) {
			set(name);
		}
		sync();
	}
	public static function remove(name:String, ?el:Element):Bool {
		var item = map[name];
		if (item == null) return false;
		if (el != null && item.el != el) return false;
		map.remove(name);
		list.remove(item);
		select.removeChild(item.opt);
		tabs.removeChild(item.tab);
		if (panel.children[0] == item.el) {
			panel.removeChild(item.el);
			if (list.length > 0) set(list[0].name);
		}
		sync();
		return true;
	}
	public static function init() {
		select = Main.document.querySelectorAuto("#misc-select");
		tabs = Main.document.querySelectorAuto("#misc-tabs");
		panel = Main.document.querySelectorAuto("#misc-panel");
		sizer = Main.document.querySelectorAuto("#misc-splitter-td");
		outer = Main.document.querySelectorAuto("#misc-td");
		select.onchange = function(_) {
			set(select.value);
		};
	}
}
private class SidebarItem {
	public var el:Element;
	public var opt:OptionElement;
	public var tab:ButtonElement;
	public var name:String;
	public function new(name:String, el:Element) {
		this.name = name;
		this.el = el;
		opt = Main.document.createOptionElement();
		HtmlTools.setInnerText(opt, name);
		tab = Main.document.createButtonElement();
		tab.type = "button";
		tab.className = "misc-tab";
		tab.setAttribute("role", "tab");
		tab.setAttribute("aria-selected", "false");
		tab.tabIndex = -1;
		HtmlTools.setInnerText(tab, name);
		tab.onclick = function(_) Sidebar.set(name);
	}
}

