package ui;

import electron.Menu;
import js.html.MouseEvent;
import ui.ChromeTabs.ChromeTab;

/** Context menu for the pin-layer markers shown to the left of multi-line tabs. */
class ChromePinLayerMenu {
	static var targetLayer:Int;
	static var menu:Menu;
	static var closeLayerItem:MenuItem;
	static var closeOtherLayersItem:MenuItem;
	static var unpinAllItem:MenuItem;
	static var moveItems:Array<MenuItem>;

	public static function init():Void {
		menu = new Menu();

		menu.append(closeLayerItem = new MenuItem({
			id: "close-pin-layer",
			label: "Close All in Pinned Layer",
			click: function() closeTabs(function(tab) return tab.pinLayer == targetLayer),
		}));
		menu.append(closeOtherLayersItem = new MenuItem({
			id: "close-except-pin-layer",
			label: "Close All Except Pinned Layer",
			click: function() closeTabs(function(tab) return tab.pinLayer != targetLayer),
		}));
		menu.appendSep("pin-layer-actions-sep");
		menu.append(unpinAllItem = new MenuItem({
			id: "unpin-all-in-layer",
			label: "Unpin All",
			icon: Menu.silkIcon("pin"),
			click: function() moveTabs(targetLayer, 0),
		}));

		var moveMenu = new Menu();
		moveItems = [];
		for (layer in 0...10) {
			var destination = layer;
			var item = new MenuItem({
				id: "move-pin-layer-to-" + destination,
				label: destination == 0 ? "Unpinned" : "Pin " + destination,
				click: function() moveTabs(targetLayer, destination),
			});
			moveItems.push(item);
			moveMenu.append(item);
		}
		menu.append(new MenuItem({
			id: "move-pin-layer",
			label: "Move All Tabs to...",
			icon: Menu.silkIcon("pin"),
			submenu: moveMenu,
		}));
	}

	public static function show(pinLayer:Int, event:MouseEvent):Void {
		targetLayer = pinLayer;
		var pinned = targetLayer > 0;
		closeLayerItem.label = pinned ? "Close All in Pinned Layer" : "Close All Unpinned";
		closeOtherLayersItem.label = pinned
			? "Close All Except Pinned Layer"
			: "Close All Except Unpinned";
		unpinAllItem.enabled = pinned;
		for (layer => item in moveItems) item.visible = layer != targetLayer;
		menu.popupAsync(event);
	}

	static function closeTabs(test:ChromeTab->Bool):Void {
		for (tab in ChromeTabs.impl.tabEls) {
			if (test(tab)) tab.closeButton.click();
		}
	}

	static function moveTabs(sourceLayer:Int, destinationLayer:Int):Void {
		if (sourceLayer == destinationLayer) return;
		var tabs = ChromeTabs.impl.tabEls;
		for (tab in tabs) {
			if (tab.pinLayer == sourceLayer) {
				ChromeTabs.impl.setTabPinLayer(tab, destinationLayer, true);
			}
		}
		ChromeTabs.impl.layoutTabs();
		ChromeTabs.impl.fixZIndexes();
	}
}
