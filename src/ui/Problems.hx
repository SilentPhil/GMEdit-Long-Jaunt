package ui;

import ace.AceTools;
import ace.extern.AceAnnotation;
import ace.extern.AceSession;
import editors.EditCode;
import file.FileKind;
import file.kind.KGml;
import file.kind.gml.KGmlExtension;
import file.kind.gml.KGmlScript;
import file.kind.gmx.KGmxEvents;
import file.kind.yy.KYyEvents;
import electron.Electron;
import gml.GmlImports;
import gml.GmlLocals;
import gml.Project;
import gml.file.GmlFile;
import haxe.DynamicAccess;
import haxe.io.Path;
import js.html.ButtonElement;
import js.html.DivElement;
import js.html.Element;
import js.html.InputElement;
import js.html.MouseEvent;
import js.html.SpanElement;
import js.html.Console;
import parsers.GmlSeekData;
import parsers.linter.GmlLinter;
import synext.GmlExtLambda;
import tools.Dictionary;
import ui.GlobalSearch.GlobalSearchOpt;
using tools.HtmlTools;
using tools.PathTools;

class Problems {
	static var element:DivElement;
	static var list:DivElement;
	static var summary:SpanElement;
	static var refreshButton:ButtonElement;
	static var searchButton:ButtonElement;
	static var searchBox:DivElement;
	static var fileFilterInput:js.html.InputElement;
	static var textFilterInput:js.html.InputElement;
	static var searchVisible:Bool = false;
	static var showErrorsButton:ButtonElement;
	static var showWarningsButton:ButtonElement;
	static var showCurrentFileButton:ButtonElement;
	static var moreButton:ButtonElement;
	static var showErrors:Bool = true;
	static var showWarnings:Bool = true;
	static var showCurrentFileOnly:Bool = false;
	static var isRunning:Bool = false;
	static var items:Array<ProblemItem> = [];
	static var config:ProblemsConfig = null;
	static var editorElement:DivElement = null;
	static var editorProject:Project = null;
	static var menu:DivElement;
	static var menuTarget:ProblemItem;
	
	public static function init():Void {
		element = Main.document.createDivElement();
		element.className = "problems-panel";
		var toolbar = Main.document.createDivElement();
		toolbar.className = "problems-toolbar";
		refreshButton = Main.document.createButtonElement();
		refreshButton.type = "button";
		refreshButton.className = "problems-refresh";
		refreshButton.title = "Refresh project problems";
		refreshButton.innerText = "Refresh";
		refreshButton.onclick = function(_) refreshProject();
		summary = Main.document.createSpanElement();
		summary.className = "problems-summary";
		var filters = Main.document.createDivElement();
		filters.className = "problems-filters";
		searchButton = makeSearchButton();
		searchBox = Main.document.createDivElement();
		searchBox.className = "problems-search";
		searchBox.style.display = "none";
		fileFilterInput = makeSearchInput("File");
		textFilterInput = makeSearchInput("Problem text");
		var clearButton = Main.document.createButtonElement();
		clearButton.type = "button";
		clearButton.className = "problems-search-clear";
		clearButton.title = "Clear problem search";
		clearButton.innerText = "Clear";
		clearButton.onclick = function(_) {
			fileFilterInput.value = "";
			textFilterInput.value = "";
			render();
		};
		searchBox.appendChild(fileFilterInput);
		searchBox.appendChild(textFilterInput);
		searchBox.appendChild(clearButton);
		showErrorsButton = makeFilterButton("error", "Errors");
		showWarningsButton = makeFilterButton("warning", "Warnings");
		showCurrentFileButton = makeFilterButton("current-file", "Current file only");
		moreButton = makeMoreButton();
		filters.appendChild(searchBox);
		filters.appendChild(searchButton);
		filters.appendChild(showErrorsButton);
		filters.appendChild(showWarningsButton);
		filters.appendChild(showCurrentFileButton);
		filters.appendChild(moreButton);
		toolbar.appendChild(refreshButton);
		toolbar.appendChild(summary);
		toolbar.appendChild(filters);
		list = Main.document.createDivElement();
		list.className = "problems-list";
		element.appendChild(toolbar);
		element.appendChild(list);
		initMenu();
		Sidebar.add("Problems", element);
		renderMessage("No project problems checked yet.");
	}
	
	public static function show():Void {
		Sidebar.set("Problems");
	}
	
	static function renderMessage(text:String):Void {
		summary.innerText = text;
		list.innerHTML = "";
		var msg = Main.document.createDivElement();
		msg.className = "problems-message";
		msg.innerText = text;
		list.appendChild(msg);
	}
	
	static function render():Void {
		list.innerHTML = "";
		var errors = 0;
		var warnings = 0;
		for (item in items) {
			if (isExcluded(item)) continue;
			if (item.type == "warning") warnings++; else errors++;
			if (isVisibleItem(item)) list.appendChild(makeRow(item));
		}
		if (items.length == 0) {
			renderMessage("No problems found.");
			return;
		}
		var parts = [];
		if (errors > 0) parts.push(errors + " error" + (errors == 1 ? "" : "s"));
		if (warnings > 0) parts.push(warnings + " warning" + (warnings == 1 ? "" : "s"));
		summary.innerText = parts.join(", ");
		updateFilterButtons(errors, warnings);
		if (list.children.length == 0) {
			var msg = Main.document.createDivElement();
			msg.className = "problems-message";
			msg.innerText = "No problems match the current filters.";
			list.appendChild(msg);
		}
	}
	
	static function makeFilterButton(type:String, title:String):ButtonElement {
		var button = Main.document.createButtonElement();
		button.type = "button";
		button.className = 'problems-filter $type active';
		button.title = title;
		button.setAttribute("aria-label", title);
		if (type == "warning") button.innerText = "!";
		if (type == "current-file") button.innerText = "\u25c9";
		button.onclick = function(_) {
			switch (type) {
				case "warning":
					showWarnings = !showWarnings;
				case "current-file":
					showCurrentFileOnly = !showCurrentFileOnly;
				default:
					showErrors = !showErrors;
			}
			render();
		};
		return button;
	}
	
	static function makeSearchButton():ButtonElement {
		var button = Main.document.createButtonElement();
		button.type = "button";
		button.className = "problems-filter search";
		button.title = "Search problems";
		button.setAttribute("aria-label", "Search problems");
		button.onclick = function(_) {
			searchVisible = !searchVisible;
			searchBox.style.display = searchVisible ? "" : "none";
			button.classList.setTokenFlag("active", searchVisible);
			if (searchVisible) fileFilterInput.focus();
			render();
		};
		return button;
	}
	
	static function makeSearchInput(placeholder:String):js.html.InputElement {
		var input = Main.document.createInputElement();
		input.type = "text";
		input.className = "problems-search-input";
		input.placeholder = placeholder;
		input.oninput = function(_) render();
		return input;
	}
	
	static function makeMoreButton():ButtonElement {
		var button = Main.document.createButtonElement();
		button.type = "button";
		button.className = "problems-filter more";
		button.title = "More";
		button.setAttribute("aria-label", "More");
		button.innerText = "...";
		button.onclick = function(e:MouseEvent) showMoreMenu(e);
		return button;
	}
	
	static function updateFilterButtons(errors:Int, warnings:Int):Void {
		showErrorsButton.classList.setTokenFlag("active", showErrors);
		showWarningsButton.classList.setTokenFlag("active", showWarnings);
		showErrorsButton.disabled = errors == 0;
		showWarningsButton.disabled = warnings == 0;
		showCurrentFileButton.classList.setTokenFlag("active", showCurrentFileOnly);
		showCurrentFileButton.disabled = currentFilePath() == null;
		showErrorsButton.title = "Show errors (" + errors + ")";
		showWarningsButton.title = "Show warnings (" + warnings + ")";
		showCurrentFileButton.title = showCurrentFileOnly ? "Showing current file only" : "Show current file only";
	}
	
	static function isVisibleType(type:String):Bool {
		return type == "warning" ? showWarnings : showErrors;
	}
	
	static function isVisibleItem(item:ProblemItem):Bool {
		if (!isVisibleType(item.type)) return false;
		if (isExcluded(item)) return false;
		if (showCurrentFileOnly && item.path != currentFilePath()) return false;
		return matchesSearch(item);
	}
	
	static function matchesSearch(item:ProblemItem):Bool {
		if (!searchVisible) return true;
		var fileNeedle = fileFilterInput.value.toLowerCase();
		if (fileNeedle != "" && item.name.toLowerCase().indexOf(fileNeedle) < 0) return false;
		var textNeedle = textFilterInput.value.toLowerCase();
		if (textNeedle != "" && cleanProblemText(item.text).toLowerCase().indexOf(textNeedle) < 0) return false;
		return true;
	}
	
	public static function onActiveFileChange():Void {
		if (showCurrentFileOnly) render();
		else if (showCurrentFileButton != null) updateFilterButtons(countErrors(), countWarnings());
	}
	
	static function makeRow(item:ProblemItem):Element {
		var row = Main.document.createDivElement();
		row.className = "problem-row " + (item.type == "warning" ? "warning" : "error");
		row.title = item.path + ":" + (item.row + 1) + ":" + (item.column + 1) + "\n" + item.text;
		row.onclick = function(_) {
			GmlFile.open(item.name, item.path, {
				pos: { row: item.row, column: item.column },
				noExtern: true,
			});
		};
		row.oncontextmenu = function(e:MouseEvent) {
			e.preventDefault();
			showMenu(e, item);
			return false;
		};
		var icon = Main.document.createSpanElement();
		icon.className = "problem-icon";
		icon.innerText = item.type == "warning" ? "!" : "x";
		var loc = Main.document.createSpanElement();
		loc.className = "problem-location";
		loc.innerText = problemLocation(item);
		var text = Main.document.createSpanElement();
		text.className = "problem-text";
		text.innerText = cleanProblemText(item.text);
		row.appendChild(icon);
		row.appendChild(loc);
		row.appendChild(text);
		return row;
	}
	
	static function initMenu():Void {
		menu = Main.document.createDivElement();
		menu.className = "problems-context-menu";
		menu.style.display = "none";
		addMenuItem("Copy problem text", "page_copy", function() {
			if (menuTarget != null) copyText(cleanProblemText(menuTarget.text));
		});
		addMenuItem("Copy problem text and location", "page_white_copy", function() {
			if (menuTarget != null) {
				copyText(problemLocation(menuTarget) + " " + cleanProblemText(menuTarget.text));
			}
		});
		addMenuItem("Copy location", "tag_blue", function() {
			if (menuTarget != null) copyText(problemLocation(menuTarget));
		});
		addMenuItem("Copy file name", "page", function() {
			if (menuTarget != null) copyText(menuTarget.name);
		});
		addMenuSubmenu("Add to exclusions...", "delete", [
			{ label: "For entire project", action: function() {
				if (menuTarget != null) addExclusion(menuTarget, false);
			}},
			{ label: "For this file", action: function() {
				if (menuTarget != null) addExclusion(menuTarget, true);
			}},
			{ label: "Ignore this file", action: function() {
				if (menuTarget != null) addFileExclusion(menuTarget);
			}},
		]);
		Main.document.body.appendChild(menu);
		Main.document.addEventListener("mousedown", function(e) {
			if (menu.style.display == "none") return;
			var target:Element = cast e.target;
			if (menu.contains(target)) return;
			hideMenu();
		});
	}
	
	static function addMenuItem(label:String, icon:String, action:Void->Void):Void {
		var button = Main.document.createButtonElement();
		button.type = "button";
		button.className = "problems-context-menu-item";
		button.style.backgroundImage = 'url("${Main.modulePath}/icons/silk/$icon.png")';
		button.innerText = label;
		button.onclick = function(e) {
			e.stopPropagation();
			hideMenu();
			action();
		};
		menu.appendChild(button);
	}
	
	static function addMenuSubmenu(label:String, icon:String, items:Array<{label:String, action:Void->Void}>):Void {
		var outer = Main.document.createDivElement();
		outer.className = "problems-context-menu-item has-submenu";
		outer.style.backgroundImage = 'url("${Main.modulePath}/icons/silk/$icon.png")';
		outer.innerText = label;
		var submenu = Main.document.createDivElement();
		submenu.className = "problems-context-submenu";
		for (item in items) {
			var button = Main.document.createButtonElement();
			button.type = "button";
			button.className = "problems-context-menu-item";
			button.innerText = item.label;
			button.onclick = function(e) {
				e.stopPropagation();
				item.action();
				hideMenu();
			};
			submenu.appendChild(button);
		}
		outer.onmouseenter = function(_) positionSubmenu(outer, submenu);
		outer.onmouseleave = function(_) submenu.style.display = "none";
		outer.appendChild(submenu);
		menu.appendChild(outer);
	}
	
	static function positionSubmenu(outer:DivElement, submenu:DivElement):Void {
		submenu.style.display = "block";
		submenu.style.left = "100%";
		submenu.style.right = "auto";
		submenu.style.top = "-5px";
		var rect = submenu.getBoundingClientRect();
		if (rect.right > Main.window.innerWidth - 4) {
			submenu.style.left = "auto";
			submenu.style.right = "100%";
			rect = submenu.getBoundingClientRect();
		}
		var outerRect = outer.getBoundingClientRect();
		var top = -5.0;
		if (rect.bottom > Main.window.innerHeight - 4) {
			top -= rect.bottom - (Main.window.innerHeight - 4);
		}
		if (outerRect.top + top < 4) {
			top = 4 - outerRect.top;
		}
		submenu.style.top = Std.int(top) + "px";
	}
	
	static function showMenu(e:MouseEvent, item:ProblemItem):Void {
		rebuildProblemMenu();
		menuTarget = item;
		menu.style.display = "";
		var left = e.clientX;
		var top = e.clientY;
		var maxLeft = Main.window.innerWidth - menu.offsetWidth - 4;
		var maxTop = Main.window.innerHeight - menu.offsetHeight - 4;
		if (left > maxLeft) left = Std.int(Math.max(4, maxLeft));
		if (top > maxTop) top = Std.int(Math.max(4, maxTop));
		menu.style.left = left + "px";
		menu.style.top = top + "px";
	}
	
	static function hideMenu():Void {
		menu.style.display = "none";
		menuTarget = null;
		rebuildProblemMenu();
	}
	
	static function showMoreMenu(e:MouseEvent):Void {
		e.preventDefault();
		menuTarget = null;
		menu.innerHTML = "";
		addMenuItem("Exclusions", "page_white_find", function() openExclusions());
		menu.style.display = "";
		var left = e.clientX;
		var top = e.clientY;
		var maxLeft = Main.window.innerWidth - menu.offsetWidth - 4;
		var maxTop = Main.window.innerHeight - menu.offsetHeight - 4;
		if (left > maxLeft) left = Std.int(Math.max(4, maxLeft));
		if (top > maxTop) top = Std.int(Math.max(4, maxTop));
		menu.style.left = left + "px";
		menu.style.top = top + "px";
		// Restore the row menu after this popup closes.
		Main.window.setTimeout(function() {
			if (menu.style.display == "none") rebuildProblemMenu();
		}, 0);
	}
	
	static function rebuildProblemMenu():Void {
		menu.innerHTML = "";
		addMenuItem("Copy problem text", "page_copy", function() {
			if (menuTarget != null) copyText(cleanProblemText(menuTarget.text));
		});
		addMenuItem("Copy problem text and location", "page_white_copy", function() {
			if (menuTarget != null) {
				copyText(problemLocation(menuTarget) + " " + cleanProblemText(menuTarget.text));
			}
		});
		addMenuItem("Copy location", "tag_blue", function() {
			if (menuTarget != null) copyText(problemLocation(menuTarget));
		});
		addMenuItem("Copy file name", "page", function() {
			if (menuTarget != null) copyText(menuTarget.name);
		});
		addMenuSubmenu("Add to exclusions...", "delete", [
			{ label: "For entire project", action: function() {
				if (menuTarget != null) addExclusion(menuTarget, false);
			}},
			{ label: "For this file", action: function() {
				if (menuTarget != null) addExclusion(menuTarget, true);
			}},
			{ label: "Ignore this file", action: function() {
				if (menuTarget != null) addFileExclusion(menuTarget);
			}},
		]);
	}
	
	public static function refreshProject():Void {
		if (isRunning) return;
		var project = Project.current;
		if (project == null || project.version == gml.GmlVersion.none) {
			renderMessage("Open a project to scan problems.");
			return;
		}
		loadConfig(project);
		isRunning = true;
		items = [];
		refreshButton.disabled = true;
		summary.innerText = "Checking project...";
		list.innerHTML = "";
		var opt:GlobalSearchOpt = {
			find: "",
			checkObjects: true,
			checkScripts: true,
			checkHeaders: true,
			checkComments: true,
			checkTimelines: true,
			checkMacros: true,
			checkRooms: true,
			checkShaders: false,
			checkExtensions: true,
			checkLibResources: true,
			expandLambdas: true,
			searchProgress: function(progress) {
				if (progress.total > 0) {
					summary.innerText = 'Checking ${progress.done}/${progress.total}: ${progress.name}';
				} else {
					summary.innerText = 'Checking ${progress.done} files';
				}
			},
		};
		project.search(function(name:String, path:String, code:String):String {
			try {
				lintCode(name, path, code);
			} catch (x:Dynamic) {
				Console.error('Failed to check $name:', x);
				items.push({
					name: name,
					path: normalizeOpenPath(path),
					row: 0,
					column: 0,
					type: "error",
					text: "Could not check this file: " + Std.string(x),
				});
			}
			return code;
		}, function() {
			isRunning = false;
			refreshButton.disabled = false;
			sortItems();
			render();
		}, opt);
	}
	
	public static function updateFile(file:GmlFile, ?code:String):Void {
		if (isRunning || file == null || file.path == null || items.length == 0) return;
		var path = normalizeOpenPath(file.path);
		var hadItems = false;
		var nextItems:Array<ProblemItem> = [];
		for (item in items) {
			if (item.path == path) {
				hadItems = true;
			} else nextItems.push(item);
		}
		if (!hadItems) return;
		items = nextItems;
		try {
			if (code == null && file.codeEditor != null) code = file.codeEditor.session.getValue();
			if (code == null) code = file.code;
			if (code != null) lintCode(file.name, file.path, code);
		} catch (x:Dynamic) {
			Console.error('Failed to refresh problems for ${file.name}:', x);
			items.push({
				name: file.name,
				path: path,
				row: 0,
				column: 0,
				type: "error",
				text: "Could not check this file: " + Std.string(x),
			});
		}
		sortItems();
		render();
	}
	
	public static function openExclusions():Void {
		openExclusionsFile();
	}
	
	public static function openExclusionsFile():GmlFile {
		var project = Project.current;
		if (project == null || project.version == gml.GmlVersion.none) return null;
		loadConfig(project);
		var kind = file.kind.misc.KProblems.inst;
		for (tab in ChromeTabs.getTabs()) {
			if (tab.gmlFile.kind != kind) continue;
			var editor:Dynamic = tab.gmlFile.editor;
			if (editor.project != project) continue;
			tab.click();
			return tab.gmlFile;
		}
		return kind.create("Problem exclusions", null, project, null);
	}
	
	public static function buildExclusionsEditor(project:Project, out:DivElement):Void {
		editorElement = out;
		editorProject = project;
		loadConfig(project);
		out.innerHTML = "";
		out.className = "popout-window problems-exclusions-editor";
		var title = Main.document.createElement("h2");
		title.innerText = "Problem exclusions";
		out.appendChild(title);
		buildGlobalExclusions(out);
		buildIgnoredFiles(out);
		buildFileExclusions(out);
	}
	
	static function buildGlobalExclusions(out:DivElement):Void {
		var section = makeExclusionSection("Project-wide exclusions");
		out.appendChild(section);
		buildAddRow(section, "Problem text", function(text) {
			addText(config.globalExclusions, text);
			saveConfig(Project.current);
		});
		for (text in config.globalExclusions.copy()) {
			section.appendChild(makeExclusionRow(text, function() {
				config.globalExclusions.remove(text);
				saveConfig(Project.current);
			}));
		}
	}
	
	static function buildFileExclusions(out:DivElement):Void {
		var section = makeExclusionSection("File-specific exclusions");
		out.appendChild(section);
		buildAddRow(section, "file/path.gml", function(fileKey) {
			fileKey = StringTools.trim(fileKey);
			if (fileKey == "") return;
			if (config.fileExclusions[fileKey] == null) config.fileExclusions[fileKey] = [];
			saveConfig(Project.current);
		}, "Create file entry");
		for (fileKey in config.fileExclusions.keys()) {
			var fileSection = makeExclusionSection(fileKey, true);
			section.appendChild(fileSection);
			var removeFileButton = Main.document.createButtonElement();
			removeFileButton.type = "button";
			removeFileButton.className = "problems-exclusion-remove-file";
			removeFileButton.innerText = "Remove file entry";
			removeFileButton.onclick = function(_) {
				config.fileExclusions.remove(fileKey);
				saveConfig(Project.current);
			};
			fileSection.appendChild(removeFileButton);
			var arr = config.fileExclusions[fileKey];
			buildAddRow(fileSection, "Problem text", function(text) {
				addText(arr, text);
				saveConfig(Project.current);
			});
			for (text in arr.copy()) {
				fileSection.appendChild(makeExclusionRow(text, function() {
					arr.remove(text);
					if (arr.length == 0) config.fileExclusions.remove(fileKey);
					saveConfig(Project.current);
				}));
			}
		}
	}
	
	static function buildIgnoredFiles(out:DivElement):Void {
		var section = makeExclusionSection("Ignored files");
		out.appendChild(section);
		buildAddRow(section, "file/path.gml", function(fileKey) {
			addText(config.ignoredFiles, normalizeFileKey(fileKey));
			saveConfig(Project.current);
		}, "Ignore file");
		for (fileKey in config.ignoredFiles.copy()) {
			section.appendChild(makeExclusionRow(fileKey, function() {
				config.ignoredFiles.remove(fileKey);
				saveConfig(Project.current);
			}));
		}
	}
	
	static function makeExclusionSection(title:String, nested:Bool = false):DivElement {
		var section = Main.document.createDivElement();
		section.className = nested ? "problems-exclusion-section nested" : "problems-exclusion-section";
		var heading = Main.document.createElement(nested ? "h4" : "h3");
		heading.innerText = title;
		section.appendChild(heading);
		return section;
	}
	
	static function buildAddRow(section:DivElement, placeholder:String, add:String->Void, buttonText:String = "Add"):Void {
		var row = Main.document.createDivElement();
		row.className = "problems-exclusion-add";
		var input:InputElement = Main.document.createInputElement();
		input.type = "text";
		input.placeholder = placeholder;
		var button = Main.document.createButtonElement();
		button.type = "button";
		button.innerText = buttonText;
		function commit():Void {
			var text = StringTools.trim(input.value);
			if (text == "") return;
			add(text);
			input.value = "";
		}
		button.onclick = function(_) commit();
		input.onkeydown = function(e) {
			if (e.keyCode == js.html.KeyboardEvent.DOM_VK_RETURN) commit();
		};
		row.appendChild(input);
		row.appendChild(button);
		section.appendChild(row);
	}
	
	static function makeExclusionRow(text:String, remove:Void->Void):DivElement {
		var row = Main.document.createDivElement();
		row.className = "problems-exclusion-row";
		var label = Main.document.createSpanElement();
		label.innerText = text;
		var button = Main.document.createButtonElement();
		button.type = "button";
		button.innerText = "Remove";
		button.onclick = function(_) remove();
		row.appendChild(label);
		row.appendChild(button);
		return row;
	}
	
	static function loadConfig(project:Project):ProblemsConfig {
		if (project == null) return null;
		if (config != null && editorProject == project) return config;
		editorProject = project;
		config = project.readConfigJsonFileSync("problems.json");
		if (config == null) {
			config = {
				globalExclusions: [],
				ignoredFiles: [],
				fileExclusions: new DynamicAccess<Array<String>>(),
			};
		}
		if (config.globalExclusions == null) config.globalExclusions = [];
		if (config.ignoredFiles == null) config.ignoredFiles = [];
		if (config.fileExclusions == null) config.fileExclusions = new DynamicAccess<Array<String>>();
		return config;
	}
	
	static function saveConfig(project:Project):Void {
		if (project == null || config == null) return;
		project.writeConfigJsonFileSync("problems.json", config);
		render();
		if (editorElement != null && editorProject == project) {
			buildExclusionsEditor(project, editorElement);
		}
	}
	
	static function addExclusion(item:ProblemItem, fileOnly:Bool):Void {
		var project = Project.current;
		loadConfig(project);
		var text = cleanProblemText(item.text);
		if (fileOnly) {
			var key = fileKey(item.path);
			var arr = config.fileExclusions[key];
			if (arr == null) {
				arr = [];
				config.fileExclusions[key] = arr;
			}
			addText(arr, text);
		} else addText(config.globalExclusions, text);
		saveConfig(project);
	}
	
	static function addFileExclusion(item:ProblemItem):Void {
		var project = Project.current;
		loadConfig(project);
		addText(config.ignoredFiles, fileKey(item.path));
		saveConfig(project);
	}
	
	static function addText(arr:Array<String>, text:String):Void {
		text = StringTools.trim(text);
		if (text != "" && arr.indexOf(text) < 0) arr.push(text);
	}
	
	static function isExcluded(item:ProblemItem):Bool {
		loadConfig(Project.current);
		if (config == null) return false;
		if (config.ignoredFiles.indexOf(fileKey(item.path)) >= 0) return true;
		var text = cleanProblemText(item.text);
		if (config.globalExclusions.indexOf(text) >= 0) return true;
		var arr = config.fileExclusions[fileKey(item.path)];
		return arr != null && arr.indexOf(text) >= 0;
	}
	
	static function fileKey(path:String):String {
		if (path == null) return "";
		var rel = Project.current != null ? Project.current.relPath(path) : null;
		return rel != null ? rel.ptNoBS() : path.ptNoBS();
	}
	
	static function normalizeFileKey(path:String):String {
		path = StringTools.trim(path);
		if (path == "") return "";
		if (Path.isAbsolute(path)) return fileKey(path);
		return path.ptNoBS();
	}
	
	static function lintCode(name:String, path:String, code:String):Void {
		var kind = getKind(name, path);
		if (!Std.is(kind, KGml) || !(cast kind:KGml).canSyntaxCheck) return;
		var seekPath = path != null ? path + "#problems" : "#problems/" + name;
		var file:GmlFile = cast {};
		file.name = name;
		file.path = seekPath;
		file.kind = kind;
		file.code = code;
		var tempData = new GmlSeekData(kind);
		GmlSeekData.map.set(seekPath, tempData);
		var editor:EditCode = cast {};
		editor.file = file;
		editor.kind = cast kind;
		editor.locals = new Dictionary<GmlLocals>();
		editor.imports = new Dictionary<GmlImports>();
		editor.lambdaList = [];
		editor.lambdaMap = new Dictionary();
		editor.lambdas = new Dictionary<GmlExtLambda>();
		file.codeEditor = editor;
		var displayCode = code;
		if (Std.is(kind, KGml)) {
			displayCode = (cast kind:KGml).preproc(editor, code);
			if (displayCode == null) displayCode = code;
		}
		file.code = displayCode;
		var data = GmlSeekData.map[seekPath];
		if (data != null && data.imports != null) editor.imports = data.imports;
		GmlSeekData.map.remove(seekPath);
		var session:AceSession = AceTools.createSession(displayCode, {
			path: "ace/mode/gml",
			version: Project.current.version,
		});
		editor.session = session;
		AceTools.bindSession(session, editor);
		var annotations:Array<AceAnnotation> = [];
		GmlLinter.runFor(editor, {
			session: session,
			setLocals: true,
			updateStatusBar: false,
			annotations: annotations,
		});
		for (ann in annotations) {
			items.push({
				name: name,
				path: normalizeOpenPath(path),
				row: ann.row,
				column: ann.column,
				type: ann.type == "warning" ? "warning" : "error",
				text: ann.text,
			});
		}
	}
	
	static function getKind(name:String, path:String):FileKind {
		var resType = Project.current.resourceTypes[name];
		var ext = path != null ? Path.extension(path).toLowerCase() : "";
		return switch (resType) {
			case "object":
				ext == "yy" ? KYyEvents.inst : KGmxEvents.inst;
			case "extension":
				KGmlExtension.inst;
			default:
				KGmlScript.inst;
		}
	}
	
	static function normalizeOpenPath(path:String):String {
		if (path == null) return path;
		if (Path.isAbsolute(path)) return path.ptNoBS();
		return Project.current.fullPath(path).ptNoBS();
	}
	
	static function cleanProblemText(text:String):String {
		var p = text.indexOf("\nfrom ");
		if (p < 0) p = text.indexOf("\r\nfrom ");
		return p >= 0 ? text.substring(0, p) : text;
	}
	
	static function problemLocation(item:ProblemItem):String {
		return item.name + ":" + (item.row + 1) + ":" + (item.column + 1);
	}
	
	static function copyText(text:String):Void {
		if (Electron != null) {
			Electron.clipboard.writeText(text);
		} else {
			(Main.window.navigator:Dynamic).clipboard.writeText(text);
		}
	}
	
	static function currentFilePath():String {
		var file = GmlFile.current;
		if (file == null || file.path == null) return null;
		return normalizeOpenPath(file.path);
	}
	
	static function countErrors():Int {
		var n = 0;
		for (item in items) if (item.type != "warning" && !isExcluded(item)) n++;
		return n;
	}
	
	static function countWarnings():Int {
		var n = 0;
		for (item in items) if (item.type == "warning" && !isExcluded(item)) n++;
		return n;
	}
	
	static function sortItems():Void {
		items.sort(function(a, b) {
			var c = Reflect.compare(a.path, b.path);
			if (c != 0) return c;
			c = a.row - b.row;
			if (c != 0) return c;
			return a.column - b.column;
		});
	}
}

typedef ProblemItem = {
	name:String,
	path:String,
	row:Int,
	column:Int,
	type:String,
	text:String,
}

typedef ProblemsConfig = {
	var globalExclusions:Array<String>;
	var ignoredFiles:Array<String>;
	var fileExclusions:DynamicAccess<Array<String>>;
}
