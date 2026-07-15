package electron;
import electron.Menu;
import haxe.Constraints.Function;
import haxe.extern.EitherType;
import js.html.DivElement;
import js.html.Element;
import Main.document;
import js.html.LIElement;
import js.html.MouseEvent;
import js.html.SpanElement;
import js.html.UListElement;
import js.html.Event;
using tools.HtmlTools;

/**
 * ...
 * @author YellowAfterlife
 */
@:keep class MenuFallback {
	public static var contextEvent:MouseEvent = null;
	private static var popupElement:UListElement = null;
	private static var popupBackdrop:DivElement = null;
	private static var popupCallback:Void->Void = null;
	public var items:Array<MenuItemFallback> = [];
	public var __element:UListElement;
	public var __then:Void->Void;
	//
	public function new() {
		__element = document.createUListElement();
		(cast __element).gmlMenu = this;
		__element.classList.add("popout-menu");
	}
	//
	public function clear():Void {
		tools.NativeArray.clear(items);
		HtmlTools.clearInner(__element);
	}
	
	public function append(item:MenuItemFallback):Void {
		item.__parent = this;
		items.push(item);
		__element.appendChild(item.__element);
	}
	
	public static function appendOpt(menu:Menu, opt:MenuItemOptions):MenuItem {
		var item = new MenuItem(opt);
		menu.append(item);
		return item;
	}
	
	public static function appendSep(menu:Menu, ?id:String):MenuItem {
		var item = new MenuItem({ type:Sep, id:id });
		menu.append(item);
		return item;
	}
	
	public function insert(pos:Int, item:MenuItemFallback):Void {
		item.__parent = this;
		items.insert(pos, item);
	}
	
	public function __hide() {
		var par = __element.parentElement;
		if (par != null && par.tagName == "LI") { // ul > li > ul - we're a sub-menu!
			((cast par.parentElement).gmlMenu:MenuFallback).__hide();
			return;
		}
		
		document.removeEventListener("mousedown", __outerClick);
		
		if (par != null) par.removeChild(__element);
		
		var cb = __then;
		if (cb != null) {
			__then = null;
			cb();
		}
	}
	
	private function __outerClick(e:MouseEvent) {
		var el:Element = cast e.target;
		while (el != null) {
			if (el == __element) return;
			el = el.parentElement;
		}
		__hide();
	}
	
	public function __update() {
		__element.clearInner();
		for (item in items) {
			item.__parent = this;
			item.__update();
			__element.appendChild(item.__element);
		}
	}
	
	public function popup(?opt:MenuPopupOptions):Void {
		__then = opt != null ? opt.callback : null;
		if (contextEvent != null) {
			__element.style.left = contextEvent.pageX + "px";
			__element.style.top = contextEvent.pageY + "px";
		}
		__update();
		
		document.addEventListener("mousedown", __outerClick);
		document.body.appendChild(__element);
	}

	/**
	 * Renders an Electron menu in the page so that context menus have the same
	 * appearance on every platform. The Menu itself remains native because it
	 * is still needed for the macOS application menu.
	 */
	public static function popupMenu(menu:Menu, ?opt:MenuPopupOptions):Void {
		// hidePopup clears contextEvent, so keep the event that triggered this menu.
		var triggerEvent = contextEvent;
		hidePopup();
		popupCallback = opt != null ? opt.callback : null;
		var root = buildPopup(menu);
		popupElement = root;
		popupBackdrop = document.createDivElement();
		popupBackdrop.className = "popout-menu-backdrop";
		document.body.appendChild(popupBackdrop);
		document.body.appendChild(root);

		var x:Float = 0;
		var y:Float = 0;
		if (opt != null && opt.x != null) x = opt.x;
		else if (triggerEvent != null) x = triggerEvent.clientX;
		if (opt != null && opt.y != null) y = opt.y;
		else if (triggerEvent != null) y = triggerEvent.clientY;
		var maxX = Main.window.innerWidth - root.offsetWidth - 4;
		var maxY = Main.window.innerHeight - root.offsetHeight - 4;
		root.style.left = Std.int(Math.max(4, Math.min(x, maxX))) + "px";
		root.style.top = Std.int(Math.max(4, Math.min(y, maxY))) + "px";

		// Some editor and chrome elements stop bubbling mouse events. Listen in
		// the capture phase so every left click outside the menu closes it.
		document.addEventListener("mousedown", popupOuterClick, true);
		document.addEventListener("keydown", popupKeyDown);
	}

	private static function buildPopup(menu:Menu):UListElement {
		var list = document.createUListElement();
		list.className = "popout-menu";
		for (item in menu.items) {
			if (item.visible == false) continue;
			var row = document.createLIElement();
			var type:MenuItemType = item.type;
			if (type == null) type = Normal;
			row.className = "popout-menu-" + type;
			if (type == Sep) {
				list.appendChild(row);
				continue;
			}
			if (item.enabled == false) row.setAttribute("disabled", "disabled");
			if ((type == Check || type == Radio) && item.checked == true) {
				row.setAttribute("checked", "checked");
			}
			var icon = menuIcon(item.icon);
			if (icon != null && icon != "") row.style.backgroundImage = 'url("$icon")';

			var label = document.createSpanElement();
			label.className = "popout-menu-label";
			label.innerText = item.label != null ? item.label : "";
			row.appendChild(label);
			if (item.accelerator != null) {
				var accel = document.createSpanElement();
				accel.className = "popout-menu-accelerator";
				accel.innerText = formatAccelerator(Std.string(item.accelerator));
				row.appendChild(accel);
			}

			if (item.submenu != null) {
				row.classList.add("popout-menu-submenu");
				var child = buildPopup(item.submenu);
				row.appendChild(child);
				row.addEventListener("mouseenter", function(_) positionSubmenu(row, child));
			} else if (item.click != null) {
				row.addEventListener("click", function(e:MouseEvent) {
					e.stopPropagation();
					if (item.enabled == false) return;
					var click = item.click;
					hidePopup();
					if (click != null) click(item);
				});
			}
			list.appendChild(row);
		}
		return list;
	}

	private static function menuIcon(icon:Dynamic):String {
		if (icon == null) return null;
		if (Std.is(icon, String)) {
			var path:String = cast icon;
			path = path.split("\\").join("/");
			// Electron accepts an absolute Windows path for native menu icons, while
			// CSS treats the drive letter as a URL scheme and needs a file URL.
			if (~/^[A-Za-z]:\//.match(path)) path = "file:///" + path;
			return path;
		}
		try {
			if (icon.isEmpty != null && icon.isEmpty()) return null;
			if (icon.toDataURL != null) return icon.toDataURL();
		} catch (_:Dynamic) {}
		return null;
	}

	private static function formatAccelerator(value:String):String {
		return value
			.split("CommandOrControl").join(FileWrap.isMac ? "Cmd" : "Ctrl")
			.split("Command").join("Cmd")
			.split("Control").join("Ctrl");
	}

	private static function positionSubmenu(row:LIElement, submenu:UListElement):Void {
		submenu.classList.remove("open-left");
		submenu.style.top = "-5px";
		var rect = submenu.getBoundingClientRect();
		if (rect.right > Main.window.innerWidth - 4) submenu.classList.add("open-left");
		rect = submenu.getBoundingClientRect();
		var top = -5.0;
		if (rect.bottom > Main.window.innerHeight - 4) {
			top -= rect.bottom - (Main.window.innerHeight - 4);
		}
		var rowRect = row.getBoundingClientRect();
		if (rowRect.top + top < 4) top = 4 - rowRect.top;
		submenu.style.top = Std.int(top) + "px";
	}

	private static function popupOuterClick(e:MouseEvent):Void {
		if (popupElement == null) return;
		var target:Element = cast e.target;
		if (!popupElement.contains(target)) hidePopup();
	}

	private static function popupKeyDown(e:Event):Void {
		if (untyped e.key == "Escape") hidePopup();
	}

	private static function hidePopup():Void {
		document.removeEventListener("mousedown", popupOuterClick, true);
		document.removeEventListener("keydown", popupKeyDown);
		if (popupElement != null && popupElement.parentElement != null) {
			popupElement.parentElement.removeChild(popupElement);
		}
		if (popupBackdrop != null && popupBackdrop.parentElement != null) {
			popupBackdrop.parentElement.removeChild(popupBackdrop);
		}
		popupElement = null;
		popupBackdrop = null;
		contextEvent = null;
		var callback = popupCallback;
		popupCallback = null;
		if (callback != null) callback();
	}
}
@:keep class MenuItemFallback {
	public var enabled:Bool;
	public var visible:Bool;
	public var checked:Bool;
	public var label:String;
	public var click:Function;
	public var submenu:MenuFallback;
	public var type:MenuItemType;
	public var accelerator:Dynamic;
	public var icon:Dynamic;
	public var role:String;
	//
	public var __element:LIElement;
	public var __icon:SpanElement;
	public var __label:SpanElement;
	public var __parent:MenuFallback = null;
	//
	public function new(opt:MenuItemOptions) {
		enabled = opt.enabled != false;
		visible = opt.visible != false;
		checked = opt.checked;
		label = opt.label;
		click = opt.click;
		type = opt.type;
		accelerator = opt.accelerator;
		icon = opt.icon;
		role = opt.role;
		if (type == null) type = MenuItemType.Normal;
		//
		__element = document.createLIElement();
		__element.classList.add("popout-menu-" + (opt.type != null ? opt.type : MenuItemType.Normal));
		if (opt.icon != null && Std.is(opt.icon, String)) {
			__element.style.backgroundImage = "url(" + opt.icon + ")";
		}
		if (opt.label != null) {
			__label = document.createSpanElement();
			__label.appendChild(document.createTextNode(opt.label));
			__element.appendChild(__label);
		}
		if (click != null) __element.addEventListener("click", function(e:MouseEvent) {
			if (!enabled) return;
			if (__parent != null) __parent.__hide();
			if (click != null) click();
		});
		if (opt.submenu != null) {
			if (Std.is(opt.submenu, Array)) {
				var opts:Array<MenuItemOptions> = opt.submenu;
				submenu = new MenuFallback();
				for (init in opts) submenu.append(new MenuItemFallback(init));
			} else submenu = cast opt.submenu;
		}
	}
	
	public function __update() {
		__element.style.display = visible ? "" : "none";
		
		if (__label != null) {
			if (__label.parentElement == null) {
				// labels somehow go missing in IE11..?
				__element.prepend(__label);
			}
			if (label != __label.innerText) {
				__label.setInnerText(label);
			}
		}
		__element.setAttributeFlag("disabled", !enabled);
		
		if (checked != null) {
			__element.setAttributeFlag("checked", checked);
		}
		
		if (submenu != null) {
			submenu.__update();
			var submenuNode = submenu.__element;
			if (submenuNode.parentElement != __element) {
				if (submenuNode.parentElement != null) {
					submenuNode.parentElement.removeChild(submenuNode);
				}
				__element.appendChild(submenuNode);
			}
		}
	}
}
