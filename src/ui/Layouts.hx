package ui;

import electron.Dialog;
import electron.Menu;
import gml.Project;
import gml.project.ProjectState.ProjectTabState;
import js.html.MouseEvent;
import ui.ChromeTabs.ChromeTab;

/** Project-local sets of open tabs, stored in #layouts. */
class Layouts {
	static inline var directory = "#layouts";
	static var menu:Menu;

	public static function init():Void {
		var button = Main.document.querySelector(".system-button.layouts");
		if (button == null) return;
		button.addEventListener("click", function(e:MouseEvent) {
			buildMenu();
			menu.popupAsync(e);
		});
	}

	static function buildMenu():Void {
		menu = new Menu();
		var project = Project.current;
		var available = project != null && project.path != "";
		var layouts = available ? readLayouts(project) : [];
		var active:LayoutFile = null;
		if (available && project.activeLayoutPath != null) {
			for (layout in layouts) if (layout.path == project.activeLayoutPath) {
				active = layout;
				break;
			}
			if (active == null) clearActiveLayout(project);
		}
		menu.append(new MenuItem({
			id: "create-layout",
			label: "Create layout...",
			enabled: available,
			click: function() createLayout(project)
		}));
		if (active != null) menu.append(new MenuItem({
			id: "save-layout",
			label: "Save layout",
			click: function() saveLayout(project, active)
		}));
		if (active != null) menu.append(new MenuItem({
			id: "close-layout",
			label: "Close layout",
			click: function() closeLayout(project)
		}));
		var deleteMenu = new Menu();
		if (layouts.length == 0) {
			deleteMenu.append(new MenuItem({label: "No saved layouts", enabled: false}));
		} else for (layout in layouts) {
			deleteMenu.append(new MenuItem({
				label: layout.data.name,
				click: function() deleteLayout(project, layout)
			}));
		}
		menu.append(new MenuItem({
			id: "delete-layout",
			label: "Delete layout...",
			enabled: available && layouts.length > 0,
			submenu: deleteMenu
		}));
		menu.appendSep("layout-separator");
		if (!available) {
			menu.append(new MenuItem({label: "Open a project first", enabled: false}));
		} else if (layouts.length == 0) {
			menu.append(new MenuItem({label: "No layouts yet", enabled: false}));
		} else for (layout in layouts) {
			menu.append(new MenuItem({
				label: layout.data.name,
				type: MenuItemType.Check,
				checked: layout.path == project.activeLayoutPath,
				click: function() openLayout(project, layout)
			}));
		}
	}

	static function readLayouts(project:Project):Array<LayoutFile> {
		var result:Array<LayoutFile> = [];
		if (!project.existsSync(directory)) return result;
		for (entry in project.readdirSync(directory)) {
			if (entry.isDirectory || !StringTools.endsWith(entry.fileName.toLowerCase(), ".json")) continue;
			try {
				var data:LayoutData = project.readJsonFileSync(entry.relPath);
				if (data != null && data.name != null && data.tabs != null) {
					result.push({path: entry.relPath, data: data});
				}
			} catch (error:Dynamic) {
				js.Browser.console.warn("Could not read layout " + entry.relPath, error);
			}
		}
		result.sort(function(a, b) {
			var an = a.data.name.toLowerCase();
			var bn = b.data.name.toLowerCase();
			return an < bn ? -1 : an > bn ? 1 : 0;
		});
		return result;
	}

	static function createLayout(project:Project):Void {
		Dialog.showPrompt("Layout name?", "", function(name) {
			if (name == null) return;
			name = StringTools.trim(name);
			if (name == "") {
				Dialog.showWarning("Layout name cannot be empty.");
				return;
			}
			try {
				var existing:LayoutFile = null;
				for (layout in readLayouts(project)) {
					if (layout.data.name.toLowerCase() == name.toLowerCase()) {
						existing = layout;
						break;
					}
				}
				if (existing != null && !Dialog.showConfirmWarn(
					'A layout named "$name" already exists. Overwrite it?'
				)) return;
				if (!project.existsSync(directory)) project.mkdirSync(directory);
				var path = existing != null ? existing.path : nextPath(project);
				writeLayout(project, path, name);
				rememberReturnState(project);
				project.activeLayoutPath = path;
			} catch (error:Dynamic) {
				Dialog.showError("Could not save layout:\n" + Std.string(error));
			}
		});
	}

	static function saveLayout(project:Project, layout:LayoutFile):Void {
		if (project != Project.current) return;
		try {
			writeLayout(project, layout.path, layout.data.name);
		} catch (error:Dynamic) {
			Dialog.showError("Could not save layout:\n" + Std.string(error));
		}
	}

	static function writeLayout(project:Project, path:String, name:String):Void {
		var state = project.captureTabState();
		var data:LayoutData = {
			version: 1,
			name: name,
			tabs: state.tabs,
			activeTab: state.activeTab
		};
		project.writeJsonFileSync(path, data);
	}

	static function rememberReturnState(project:Project):Void {
		if (project.activeLayoutPath != null || project.layoutReturnTabs != null) return;
		var state = project.captureTabState();
		project.layoutReturnTabs = state.tabs;
		project.layoutReturnActiveTab = state.activeTab;
	}

	static function clearActiveLayout(project:Project):Void {
		project.activeLayoutPath = null;
		project.layoutReturnTabs = null;
		project.layoutReturnActiveTab = null;
	}

	static function nextPath(project:Project):String {
		var index = 1;
		while (project.existsSync(directory + "/layout-" + index + ".json")) index++;
		return directory + "/layout-" + index + ".json";
	}

	static function deleteLayout(project:Project, layout:LayoutFile):Void {
		if (!Dialog.showConfirmWarn('Delete layout "${layout.data.name}"?')) return;
		try {
			project.unlinkSync(layout.path);
			if (project.activeLayoutPath == layout.path) clearActiveLayout(project);
		} catch (error:Dynamic) {
			Dialog.showError("Could not delete layout:\n" + Std.string(error));
		}
	}

	static function openLayout(project:Project, layout:LayoutFile):Void {
		if (project != Project.current) return;
		if (!confirmChangedTabs()) return;
		rememberReturnState(project);
		closeAllTabs();
		project.restoreTabState(layout.data.tabs, layout.data.activeTab);
		project.activeLayoutPath = layout.path;
	}

	static function closeLayout(project:Project):Void {
		if (project != Project.current || project.activeLayoutPath == null) return;
		if (!confirmChangedTabs()) return;
		var tabs = project.layoutReturnTabs != null ? project.layoutReturnTabs : [];
		var activeTab = project.layoutReturnActiveTab;
		closeAllTabs();
		clearActiveLayout(project);
		project.restoreTabState(tabs, activeTab);
	}

	static function closeAllTabs():Void {
		var tabs = ChromeTabs.impl.tabEls.copy();
		for (tab in tabs) {
			tab.classList.add("chrome-tab-force-close");
			tab.closeButton.click();
		}
	}

	static function confirmChangedTabs():Bool {
		for (tab in ChromeTabs.impl.tabEls) {
			var file = tab.gmlFile;
			if (file == null || !file.changed) continue;
			if (file.path != null) {
				var choice = Dialog.showMessageBox({
					buttons: ["Yes", "No", "Cancel"],
					message: "Do you want to save the current changes?",
					title: "Unsaved changes in " + file.name,
					cancelId: 2
				});
				switch (choice) {
					case 0: file.save();
					case 1:
					default: return false;
				}
			} else {
				var choice = Dialog.showMessageBox({
					buttons: ["Yes", "No"],
					message: "Changes cannot be saved (not a file). Stay here?",
					title: "Unsaved changes in " + file.name,
					cancelId: 0
				});
				if (choice != 1) return false;
			}
		}
		return true;
	}
}

private typedef LayoutData = {
	var version:Int;
	var name:String;
	var tabs:Array<ProjectTabState>;
	@:optional var activeTab:Int;
}

private typedef LayoutFile = {
	var path:String;
	var data:LayoutData;
}
