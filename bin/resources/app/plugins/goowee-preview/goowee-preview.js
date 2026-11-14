(function() {
    "use strict";
    var Preferences = $gmedit["ui.Preferences"];
    var GmlFile = $gmedit["gml.file.GmlFile"];
    var Project = $gmedit["gml.Project"];
    var ProjectProperties = $gmedit["ui.project.ProjectProperties"];
    var title = "GooWee Preview";
    var outer, stage, canvasSurface, canvas, empty, status, entrySelect, lockButton, copyButton, copyStatus, zoomSelect, tree, diagnosticList, selection;
    var treeSummary, diagnosticSummary, renderer, fonts, observer, session, currentFile, resources, resourceProject;
    var prefs, dock, scene, selectedId, timer, frame, textContext, active = false, visible = false;
    var entryByFile = new WeakMap();
    var entryChoices = [], entryChoiceFile = null;
    var hideSelectedButton, showAllButton, visibilityByFile = new WeakMap(), visibilityState = null;
    var nodeKeys = new Map(), nodesById = new Map(), hiddenNodeIds = new Set(), effectiveHiddenIds = new Set();
    var listeners = [], command, paletteCommand, hideCheckbox;
    var localization, localizationProject, localizationSignature;
    var view, panX = 0, panY = 0, zoomAnchor, spaceDown = false, stageHovered = false, drag, suppressCanvasClick = false;
    var hoveredId = null, hoverPointer = null, ctrlDown = false;
    var pinned = null, sceneFile = null, editingSession = null;
    var sourceSelection, sourceSelectionTimer, followSelectionButton, centerNodeId = null;
    var copying = false, copyFeedbackTimer, copyVersion = 0;
    // Images stay in memory; paths and offsets are keyed by script and entry function.
    var referenceToggle, referenceToolbar, referenceShow, referenceFile, referenceName, referenceError, referenceLockButton;
    var referenceImage = null, referenceURL = null, referencePending = null, referenceX = 0, referenceY = 0, referenceVersion = 0;
    var referenceStore, referenceContext = null, referenceTargetFile = null, referenceTargetProject = null;
    var referenceTargetEntry = null, referenceDefaultEntry = "";
    var referencePath = "", referenceInputs = [], referenceDirty = false, referenceSaveTimer;
    var referenceSession = new WeakMap();
    var referenceLocked = false;

    function element(tag, className, text, parent) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        if (parent) parent.appendChild(el);
        return el;
    }
    function save() { Preferences.current.gooWeePreview = prefs; Preferences.save(); }
    function loadPreferences() {
        prefs = Preferences.current.gooWeePreview || (Preferences.current.gooWeePreview = {});
        prefs.position = ["right", "bottom", "left-bottom"].includes(prefs.position) ? prefs.position : "right";
        prefs.width = dimension(prefs.width, 1920); prefs.height = dimension(prefs.height, 1080);
        prefs.guiScale = Number(prefs.guiScale) >= 0.25 && Number(prefs.guiScale) <= 4 ? Number(prefs.guiScale) : 1;
        prefs.outlines = prefs.outlines === true;
        prefs.approximateOutlines = prefs.approximateOutlines !== false;
        prefs.sharpPixels = prefs.sharpPixels === true;
        prefs.followSelection = prefs.followSelection !== false;
    }
    function dimension(value, fallback) {
        var n = Number(value);
        return Number.isFinite(n) && n >= 64 && n <= 8192 ? Math.round(n) : fallback;
    }
    function listen(object, event, callback) {
        object.on(event, callback);
        listeners.push(function() { object.off(event, callback); });
    }
    function listenDOM(object, event, callback, options) {
        object.addEventListener(event, callback, options);
        listeners.push(function() { object.removeEventListener(event, callback, options); });
    }
    function dockAPI() {
        if (prefs.position === "bottom" && GMEdit.bottomPanel) return GMEdit.bottomPanel;
        if (prefs.position === "left-bottom" && GMEdit.leftBottomPanel && GMEdit.leftBottomPanel.available !== false) return GMEdit.leftBottomPanel;
        return GMEdit.sidebar;
    }
    function detach() { cancelNavigation(); if (dock) dock.remove(title, outer); dock = null; }
    function attach(reveal) {
        if (!visible) return;
        dock = dockAPI();
        dock.add(title, outer);
        if (reveal) dock.set(title);
        requestDraw();
    }
    function setVisible(value, reveal) {
        prefs.hide = !value;
        if (hideCheckbox) hideCheckbox.checked = !value;
        if (!active) return;
        visible = value;
        if (visible) { if (!dock) attach(reveal); else if (reveal) dock.set(title); refresh(); }
        else { detach(); clearTimeout(timer); }
    }
    function changePosition(value) {
        detach(); prefs.position = value; save(); if (active) attach(true);
    }
    function getResources() {
        var project = Project.current;
        if (project !== resourceProject || !resources) {
            cancelCopy();
            if (resources) resources.dispose();
            resourceProject = project;
            resources = GooWeePreviewResources.create(project, $gmedit["gml.GmlAPI"], readOpenSource);
            if (renderer) renderer.clearImages();
            if (fonts) fonts.clear();
        }
        return resources;
    }
    function readOpenSource(path) {
        var tabs = $gmedit["ui.ChromeTabs"], files = [];
        if (tabs && tabs.impl && tabs.impl.tabEls) {
            Array.prototype.forEach.call(tabs.impl.tabEls, function(tab) { if (tab.gmlFile) files.push(tab.gmlFile); });
        }
        // Include the pinned buffer and current tab even before a tab-list update.
        if (pinned) files.push(pinned.file);
        if (GmlFile.current) files.push(GmlFile.current);
        for (var i = files.length - 1; i >= 0; i--) {
            var file = files[i], buffer = file.codeEditor && file.codeEditor.session;
            if (buffer && resources.relativeSourcePath(file.path) === path) return buffer.getValue();
        }
        return null;
    }
    function localizationSettings(project) {
        var settings = project && project.properties && project.properties.gooWeePreview || {};
        var options = {};
        if (typeof settings.localeDirectory === "string" && settings.localeDirectory.trim()) options.directory = settings.localeDirectory.trim();
        if (typeof settings.localeLanguage === "string" && settings.localeLanguage) options.language = settings.localeLanguage;
        return options;
    }
    function resetLocalization() {
        cancelCopy();
        if (localization) localization.dispose();
        localization = null; localizationProject = null; localizationSignature = null;
        if (fonts) fonts.clear();
    }
    function getLocalization() {
        var project = Project.current, options = localizationSettings(project), signature = JSON.stringify(options);
        if (!localization || localizationProject !== project || localizationSignature !== signature) {
            resetLocalization();
            localizationProject = project; localizationSignature = signature;
            localization = GooWeePreviewLocalization.create(project, options);
        }
        return localization;
    }
    function projectMacros() {
        var api = $gmedit["gml.GmlAPI"], indexed = api && api.gmlMacros, macros = Object.create(null);
        Object.keys(indexed || {}).forEach(function(name) {
            if (indexed[name] && typeof indexed[name].expr === "string") macros[name] = indexed[name].expr;
        });
        return macros;
    }
    function projectAssets() {
        var index = getResources(), cache = Object.create(null);
        // A size macro may reference a sprite absent from the current script.
        // Resolve only assets requested by the analyzer, including macro dependencies.
        return new Proxy(cache, {get: function(target, name) {
            if (typeof name !== "string") return undefined;
            if (!Object.prototype.hasOwnProperty.call(target, name)) target[name] = index.sprite(name, 0);
            return target[name];
        }});
    }
    function resetResources() {
        if (resources) resources.dispose();
        resources = null; resourceProject = null;
        resetLocalization();
        if (renderer) renderer.clearImages();
        schedule();
    }
    function updateLock() {
        if (!lockButton) return;
        var locked = !!pinned;
        lockButton.disabled = !locked && !(sceneFile === currentFile && scene && (scene.entries.length || scene.nodes.length));
        lockButton.setAttribute("aria-pressed", String(locked));
        lockButton.title = locked ? "Unlock preview file: " + (pinned.file.name || "Script") + " · " + (pinned.entry || "Script body") : "Lock this file while editing other tabs; its function selector remains available";
        lockButton.querySelector(".gw-lock-shackle").setAttribute("d", locked ? "M5 7V5a3 3 0 0 1 6 0v2" : "M5 7V5a3 3 0 0 1 6 0");
        if (locked) {
            entrySelect.title = "Locked to file " + (pinned.file.name || "Script") + ". Choose a function from this file.";
        }
    }
    function bindFile(excludedFile) {
        if (!active) return;
        if (pinned && pinned.project !== Project.current) pinned = null;
        var editingFile = GmlFile.current === excludedFile ? null : GmlFile.current;
        if (sourceSelection) sourceSelection.off("changeSelection", scheduleSourceSelection);
        sourceSelection = editingFile && editingFile.codeEditor && editingFile.codeEditor.session.selection;
        if (sourceSelection) sourceSelection.on("changeSelection", scheduleSourceSelection);
        var file = pinned ? pinned.file : editingFile;
        var next = file && file.codeEditor ? file.codeEditor.session : null;
        // The pinned root still updates, while edits to the active nested script
        // trigger a rebuild against its live buffer instead of its saved source.
        if (editingSession) editingSession.off("change", schedule);
        editingSession = null;
        if (session !== next) {
            if (session) session.off("change", schedule);
            session = next;
            if (session) session.on("change", schedule);
        }
        var editing = editingFile && editingFile.codeEditor && editingFile.codeEditor.session;
        if (editing && editing !== session) { editingSession = editing; editingSession.on("change", schedule); }
        if (currentFile !== file) { currentFile = file; selectedId = null; resetView(); }
        // Wait for analysis before choosing a reference for an unfamiliar file.
        // Rebinding the same file still handles its first save / changed path.
        bindReference(referenceTargetFile === currentFile && referenceTargetProject === Project.current ? referenceTargetEntry : null, referenceDefaultEntry);
        updateLock();
        schedule();
    }
    function schedule() {
        clearTimeout(timer);
        if (active && visible) timer = setTimeout(refresh, 220);
    }
    function entryPlaceholder(label, reason) {
        entryChoices = []; entryChoiceFile = null;
        entrySelect.replaceChildren();
        element("option", "", label, entrySelect).value = "";
        entrySelect.disabled = true;
        entrySelect.title = reason || label;
    }
    function setEntryChoices(entries, selected, unavailable) {
        entryChoices = entries; entryChoiceFile = currentFile;
        entrySelect.replaceChildren();
        if (unavailable) {
            var missing = element("option", "", selected + " · unavailable", entrySelect);
            missing.value = selected; missing.disabled = true;
        }
        entries.forEach(function(entry) { element("option", "", entry.name + " · L" + entry.line, entrySelect).value = entry.name; });
        entrySelect.value = selected || "";
        entrySelect.disabled = !entries.length;
        entrySelect.title = "Choose the function to preview from this file";
        updateLock();
    }
    function showEmpty(message, entryLabel, preserveReference) {
        scene = null; sceneFile = null; selectedId = null;
        visibilityState = null; nodeKeys.clear(); nodesById.clear(); hiddenNodeIds.clear(); effectiveHiddenIds.clear();
        resetView();
        canvasSurface.hidden = canvas.hidden = true; empty.hidden = false; empty.textContent = message;
        entryPlaceholder(entryLabel || "No active GooWee script", message);
        status.title = message;
        tree.replaceChildren(); diagnosticList.replaceChildren();
        treeSummary.textContent = "Elements"; diagnosticSummary.textContent = "Preview notes";
        selection.textContent = "Select an element to inspect it; double-click to open its source line.";
        if (preserveReference) {
            bindReference(referenceTargetFile === currentFile && referenceTargetProject === Project.current ? referenceTargetEntry : null, referenceDefaultEntry);
        } else bindReference(pinned ? pinned.entry || "" : "", pinned ? referenceDefaultEntry : "");
        updateLock();
        updateCopy();
        updateReference();
    }
    function refresh() {
        clearTimeout(timer);
        if (!active || !visible) return;
        if (!session || !currentFile) {
            status.textContent = "No active GML script";
            showEmpty('Open a script containing #import "games.keevee.gw".', "Open a GooWee script");
            return;
        }
        try {
            var source = session.getValue();
            var locale = getLocalization(), localeInfo = locale.info();
            var setup = getResources().previewSetup();
            var result = GooWeePreviewEngine.analyze(source, {
                width: prefs.width, height: prefs.height, scale: prefs.guiScale,
                entry: pinned ? pinned.entry : entryByFile.get(currentFile), assets: projectAssets(), macros: projectMacros(),
                macroFunctions: ($gmedit["gml.GmlAPI"] || {}).gmlMFuncs,
                sourcePath: currentFile.path || "", sourceFor: getResources().sourceFor,
                sourceAliases: [getResources().relativeSourcePath(currentFile.path)].filter(Boolean),
                setupSources: setup ? [setup] : [],
                previewSourceFor: getResources().previewSourceFor,
                jsonFor: getResources().jsonFor, jsonFiles: getResources().jsonFiles,
                fontFileFor: getResources().fontFileFor, localeInfo: localeInfo.languageInfo,
                fontFor: function(name) { return getResources().font(name); },
                localize: localeInfo.languages.length && !localeInfo.error ? locale.lookup : null,
                localizeHeader: localeInfo.languages.length && !localeInfo.error ? locale.lookupHeader : null,
                localeLanguage: localeInfo.language,
                measureText: function(text, style) {
                    if (fonts && style.fontResource) return fonts.measure(text, style);
                    textContext.font = (style.italic ? "italic " : "") + (style.bold ? "bold " : "") + style.fontSize + "px sans-serif";
                    var lines = String(text).split(/\r?\n/);
                    return {width:Math.max.apply(null, lines.map(function(line) {return textContext.measureText(line).width;})), height:Math.max(1,lines.length)*style.fontSize*1.25};
                }
            });
            locale.info().diagnostics.forEach(function(note) {
                result.diagnostics.push({line: 0, sourcePath: note.sourcePath || note.path || localeInfo.definitionPath || "", message: note.message, severity: note.severity || "warning"});
            });
            if (fonts) fonts.diagnostics().forEach(function(note) {
                result.diagnostics.push({line: 0, sourcePath: note.sourcePath || "", message: note.message, severity: "warning"});
            });
            if (!result.supported) {
                status.textContent = currentFile.name || "Current script";
                showEmpty('This script does not import GooWee.\nExpected: #import "games.keevee.gw"', "GooWee import not found");
                return;
            }
            if (result.sourceIncomplete && !result.entry) {
                status.textContent = (currentFile.name || "Script") + " · incomplete source";
                showEmpty("The script is incomplete while you type.\n" + result.diagnostics.map(function(note) {
                    return (note.line ? "L" + note.line + ": " : "") + note.message;
                }).join("\n"), "Preview waits for valid source", true);
                buildDiagnostics(result.diagnostics);
                return;
            }
            if (pinned && (result.entry || null) !== pinned.entry) {
                status.textContent = (currentFile.name || "Script") + " · locked function unavailable";
                showEmpty("The locked function " + (pinned.entry || "(script body)") + " is no longer available. Restore it or choose another function from this file.", pinned.entry || "Script body");
                if (result.entries.length) setEntryChoices(result.entries, pinned.entry || "", true);
                return;
            }
            scene = result; sceneFile = currentFile;
            bindVisibility();
            if (result.entries.length) {
                setEntryChoices(result.entries, result.entry || "", false);
            } else {
                entryPlaceholder(result.nodes.length ? "Script body" : "No preview function found",
                    result.nodes.length ? "Previewing GooWee elements created outside named functions" :
                    "No GooWee entry function could be analyzed in the current editor buffer. See Preview notes.");
            }
            if (result.entry) entryByFile.set(currentFile, result.entry);
            else entryByFile.delete(currentFile);
            bindReference(result.entry || "", result.entries.length ? result.entries[0].name : "");
            canvasSurface.hidden = canvas.hidden = !result.nodes.length;
            empty.hidden = !!result.nodes.length;
            var noEntry = !result.entries.length && !result.nodes.length;
            empty.textContent = noEntry ? "No GooWee preview function found in the current editor buffer.\nCheck the function declarations and Preview notes below." :
                "No visual elements found in this function. Choose another entry point above.";
            if (!result.nodes.length && result.diagnostics.length) {
                var note = result.diagnostics[0];
                empty.textContent += "\n\n" + (note.line ? "L" + note.line + ": " : "") + note.message;
            }
            status.textContent = (currentFile.name || "Script") + (noEntry ? " · no preview function found" : " · " + result.nodes.length + " elements · static preview" + (result.previewHints ? " · source hints" : ""));
            if (pinned) status.textContent += " · locked";
            status.title = noEntry ? empty.textContent : "Updates from the unsaved editor buffer, indexed project code and explicit preview hints. Unresolved runtime dependencies appear in Preview notes." + (localeInfo.language ? " Localization: " + localeInfo.language + "." : "");
            if (!result.nodes.some(function(node) { return node.id === selectedId; })) selectedId = null;
            buildDetails();
            updateLock();
            updateCopy();
            updateReference();
            scheduleSourceSelection();
            requestDraw();
        } catch (error) {
            status.textContent = "Preview could not be built";
            showEmpty("The script may be incomplete while you type.\n" + (error.message || String(error)), "Preview could not be built", true);
            console.error("GooWee Preview:", error);
        }
    }
    function navigate(line, sourcePath) {
        if (!currentFile || !session) return;
        var project = Project.current, path = sourcePath || currentFile.path;
        if (path && !/^(?:[A-Za-z]:[\\/]|\/)/.test(path) && project && project.fullPath) path = project.fullPath(path);
        var activeFile = GmlFile.current;
        if ((activeFile !== currentFile || path !== currentFile.path) && path && typeof GmlFile.open === "function") {
            GmlFile.open(path.split(/[\\/]/).pop(), path, {pos:{row:Math.max(0,(line || 1)-1),column:0}});
            return;
        }
        if (activeFile !== currentFile) return;
        aceEditor.gotoLine(Math.max(1, line || 1), 0, true);
        aceEditor.focus();
    }
    function bindVisibility() {
        var previous = visibilityState, selectionKey = nodeKeys.get(selectedId);
        var record = visibilityByFile.get(currentFile);
        if (!record || record.project !== Project.current) {
            record = {project: Project.current, entries: new Map()}; visibilityByFile.set(currentFile, record);
        }
        var entry = scene.entry || "";
        if (!record.entries.has(entry)) record.entries.set(entry, {hidden: new Set(), history: []});
        visibilityState = record.entries.get(entry);
        nodeKeys = new Map(); nodesById = new Map();
        var groups = new Map(), bases = new Map(), codenames = new Map();
        scene.nodes.forEach(function(node) {
            nodesById.set(node.id, node);
            if (typeof node.codename === "string" && node.codename) codenames.set(node.codename, (codenames.get(node.codename) || 0) + 1);
        });
        scene.nodes.forEach(function(node) {
            var base = JSON.stringify([(node.sourcePath || "").replace(/\\/g, "/"), node.type, node.name, typeof node.codename === "string" ? node.codename : ""]);
            var group = JSON.stringify([nodesById.has(node.parentId) ? node.parentId : null, base]);
            bases.set(node.id, {base: base, group: group});
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(node);
        });
        function keyFor(node, visiting) {
            if (nodeKeys.has(node.id)) return nodeKeys.get(node.id);
            if (visiting.has(node.id)) return "";
            visiting.add(node.id);
            var key;
            if (typeof node.codename === "string" && codenames.get(node.codename) === 1) key = JSON.stringify(["codename", node.codename]);
            else {
                var base = bases.get(node.id), siblings = groups.get(base.group), parent = nodesById.get(node.parentId);
                // Creation IDs and source line numbers shift while editing. Use
                // the named source hierarchy instead. A changed duplicate count
                // deliberately gets new keys rather than hiding a different item.
                key = (parent ? keyFor(parent, visiting) : "") + "/" + JSON.stringify([base.base, siblings.length, siblings.indexOf(node)]);
            }
            visiting.delete(node.id); nodeKeys.set(node.id, key); return key;
        }
        scene.nodes.forEach(function(node) { keyFor(node, new Set()); });
        if (!scene.sourceIncomplete) {
            var availableKeys = new Set(nodeKeys.values());
            visibilityState.hidden.forEach(function(key) { if (!availableKeys.has(key)) visibilityState.hidden.delete(key); });
            visibilityState.history = visibilityState.history.filter(function(key) { return visibilityState.hidden.has(key); });
        }
        selectedId = previous === visibilityState && selectionKey ?
            (scene.nodes.find(function(node) { return nodeKeys.get(node.id) === selectionKey; }) || {}).id || null : null;
        resolveVisibility();
    }
    function resolveVisibility() {
        hiddenNodeIds = new Set(); effectiveHiddenIds = new Set();
        if (!scene || !visibilityState) return;
        scene.nodes.forEach(function(node) {
            if (visibilityState.hidden.has(nodeKeys.get(node.id))) hiddenNodeIds.add(node.id);
        });
        scene.nodes.forEach(function(node) {
            var current = node, visited = new Set();
            while (current && !visited.has(current.id)) {
                if (current.hidden || hiddenNodeIds.has(current.id)) { effectiveHiddenIds.add(node.id); break; }
                visited.add(current.id); current = nodesById.get(current.parentId);
            }
        });
    }
    function updateVisibilityControls() {
        if (hideSelectedButton) hideSelectedButton.disabled = !scene || !nodesById.has(selectedId) || effectiveHiddenIds.has(selectedId) || !!currentReference();
        if (showAllButton) showAllButton.disabled = !visibilityState || !visibilityState.hidden.size;
        if (tree) tree.querySelectorAll(".gw-node").forEach(function(button) {
            var id = button.dataset.id;
            button.classList.toggle("gw-node-hidden", effectiveHiddenIds.has(id));
            button.dataset.previewHidden = String(hiddenNodeIds.has(id));
        });
        if (treeSummary && scene) treeSummary.textContent = "Elements (" + scene.nodes.length + ")" + (hiddenNodeIds.size ? " · hidden: " + hiddenNodeIds.size : "");
    }
    function visibilityChanged() {
        resolveVisibility(); setHovered(null, false);
        selectNode(nodesById.get(selectedId) || null, false);
        updateCopy();
    }
    function hideSelected() {
        if (!visibilityState || !scene || currentReference() || !nodesById.has(selectedId) || effectiveHiddenIds.has(selectedId)) return;
        var key = nodeKeys.get(selectedId);
        if (!key || visibilityState.hidden.has(key)) return;
        visibilityState.hidden.add(key); visibilityState.history.push(key);
        visibilityChanged();
    }
    function undoHide() {
        if (!visibilityState) return;
        while (visibilityState.history.length) {
            if (visibilityState.hidden.delete(visibilityState.history.pop())) { visibilityChanged(); return; }
        }
    }
    function showAllHidden() {
        if (!visibilityState || !visibilityState.hidden.size) return;
        visibilityState.hidden.clear(); visibilityState.history = [];
        visibilityChanged();
    }
    function scheduleSourceSelection() {
        clearTimeout(sourceSelectionTimer);
        sourceSelectionTimer = setTimeout(followSourceSelection, 80);
    }
    function followSourceSelection() {
        if (!active || !visible || !prefs.followSelection || !scene || currentReference() || !sourceSelection || drag) return;
        var file = GmlFile.current, buffer = file && file.codeEditor && file.codeEditor.session;
        if (!buffer || buffer.selection !== sourceSelection) return;
        var resource = getResources(), sourcePath = resource.relativeSourcePath(file.path);
        if (!sourcePath) return;
        var node = GooWeePreviewSourceSelection.find(scene.nodes, buffer.getValue(), sourceSelection.getRange(),
            function(path) { return (path == null ? sourcePath : resource.relativeSourcePath(path) || "").toLowerCase(); }, selectedId);
        if (!node) return;
        selectNode(node, false);
        centerNodeId = node.id;
        requestDraw();
    }
    function selectNode(node, revealSource) {
        selectedId = node ? node.id : null;
        tree.querySelectorAll(".gw-node").forEach(function(button) { button.setAttribute("aria-pressed", button.dataset.id === String(selectedId) ? "true" : "false"); });
        selection.textContent = node ? node.name + " · " + node.type + " · L" + node.line + " · " +
            Math.round(node.width) + " × " + Math.round(node.height) + " at " + Math.round(node.x) + ", " + Math.round(node.y) +
            (node.approximate ? " · approximate" : "") + (node.hidden ? " · hidden by source" : effectiveHiddenIds.has(node.id) ? " · hidden in preview" : "") :
            "Select an element to inspect it; double-click to open its source line.";
        function unitText(value) { return value && value.unit ? value.unit + "(" + (typeof value.value === "number" ? value.value : "?") + ")" : "ABS(" + (typeof value === "number" ? value : "?") + ")"; }
        if (node && node.size) selection.textContent += " · size " + node.size.map(unitText).join(" × ");
        if (node && revealSource) navigate(node.line, node.sourcePath);
        updateVisibilityControls();
        requestDraw();
    }
    function buildDetails() {
        var focusedTree = tree.contains(document.activeElement);
        tree.replaceChildren();
        treeSummary.textContent = "Elements (" + scene.nodes.length + ")";
        function add(node, depth) {
            var button = element("button", "gw-node", (node.hidden ? "○ " : node.approximate ? "≈ " : "") + node.name + " · " + node.type, tree);
            button.type = "button"; button.dataset.id = String(node.id);
            button.style.paddingLeft = (8 + Math.min(depth, 20) * 12) + "px";
            button.title = (node.sourcePath || "Current script") + ":" + node.line + " · double-click to navigate";
            button.onclick = function() { selectNode(node, false); };
            button.ondblclick = function() { selectNode(node, true); };
            button.onkeydown = function(event) { if (event.key === "Enter") { event.preventDefault(); selectNode(node, true); } };
            node.children.forEach(function(child) { add(child, depth + 1); });
        }
        scene.roots.forEach(function(node) { add(node, 0); });
        buildDiagnostics(scene.diagnostics);
        selectNode(scene.nodes.find(function(node) { return node.id === selectedId; }) || null, false);
        if (focusedTree) {
            var selectedButton = tree.querySelector('[aria-pressed="true"]');
            if (selectedButton) selectedButton.focus({preventScroll: true}); else stage.focus({preventScroll: true});
        }
    }
    function buildDiagnostics(diagnostics) {
        diagnosticList.replaceChildren();
        diagnosticSummary.textContent = "Preview notes (" + diagnostics.length + ")";
        diagnostics.forEach(function(note) {
            var button = element("button", "gw-diagnostic", (note.line ? "L" + note.line + ": " : "") + note.message, diagnosticList);
            button.type = "button"; button.title = note.sourcePath || "Current script"; button.onclick = function() { navigate(note.line, note.sourcePath); };
        });
        if (!diagnostics.length) element("div", "gw-selection", "Static layout. Project font metrics are used when available; game callbacks and custom shaders do not run.", diagnosticList);
    }
    function requestDraw() {
        if (!active || frame) return;
        frame = requestAnimationFrame(function() { frame = null; draw(); });
    }
    function currentReference() {
        return referenceImage && referenceToggle && referenceToggle.checked && referenceShow.checked ?
            {image: referenceImage, x: referenceX, y: referenceY} : null;
    }
    function updateReference() {
        if (!stage || !referenceToolbar) return;
        referenceToolbar.hidden = !referenceToggle.checked;
        var showing = !!currentReference();
        if (drag && drag.kind === "reference" && (!showing || referenceLocked)) endDrag();
        stage.classList.toggle("gw-reference-visible", showing);
        var hasContent = showing || !!(scene && scene.nodes.length);
        canvasSurface.hidden = canvas.hidden = !hasContent; empty.hidden = hasContent;
        canvas.setAttribute("aria-label", showing ? "Reference image" : "GooWee layout preview; use Elements below for keyboard navigation");
        copyButton.title = showing ? "Copy the reference image at original size with a transparent background" :
            "Copy the entire interface at original size with a transparent background";
        stage.title = (showing ? (referenceLocked ? "Reference offset locked; use X/Y fields to adjust. " :
            "Drag with the left mouse button to move the reference. Arrow keys move by 1 px; Shift + arrows by 10 px. ") :
            "Hover to preview selection; hold Ctrl for nested elements. ") +
            "Middle drag or Space + left drag to pan; Ctrl + wheel to zoom. Choose Fit content to reset the view.";
        // Keep the pointer position across refreshes and reference toggles so a
        // stationary pointer can regain its highlight when the GUI returns.
        if (showing) setHovered(null);
        updatePanCursor();
        updateVisibilityControls(); updateCopy(); requestDraw();
    }
    function updateReferenceLock() {
        referenceLockButton.setAttribute("aria-pressed", String(referenceLocked));
        referenceLockButton.title = referenceLocked ? "Unlock reference dragging and arrow keys (X/Y fields remain editable)" :
            "Lock reference dragging and arrow keys (X/Y fields remain editable)";
        referenceLockButton.querySelector("path").setAttribute("d", referenceLocked ? "M5 7V5a3 3 0 0 1 6 0v2" : "M5 7V5a3 3 0 0 1 6 0");
        updateReference();
    }
    function setReferenceOffset(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || (x === referenceX && y === referenceY)) return;
        referenceX = x; referenceY = y; referenceDirty = true;
        referenceInputs.forEach(function(input, index) { input.value = index ? referenceY : referenceX; });
        clearTimeout(referenceSaveTimer); referenceSaveTimer = setTimeout(persistReference, 250);
        requestDraw();
    }
    function discardPendingReference() {
        referenceVersion++;
        if (!referencePending) return;
        if (referencePending.image) referencePending.image.onload = referencePending.image.onerror = null;
        if (referencePending.url) URL.revokeObjectURL(referencePending.url);
        referencePending = null;
    }
    function rememberReference(file, error) {
        if (!referenceTargetFile || referenceTargetEntry === null) return;
        var entries = referenceSession.get(referenceTargetFile);
        if (referencePath && referenceContext && !referenceDirty) {
            if (entries) { entries.delete(referenceTargetEntry); if (!entries.size) referenceSession.delete(referenceTargetFile); }
            return;
        }
        var previous = entries && entries.get(referenceTargetEntry);
        if (!file && previous && previous.project === referenceTargetProject) file = previous.file;
        if (file || referencePath) {
            if (!entries) { entries = new Map(); referenceSession.set(referenceTargetFile, entries); }
            entries.set(referenceTargetEntry, {project: referenceTargetProject,
                contextKey: referenceContext && referenceContext.localKey, file: referencePath ? null : file,
                filePath: referencePath, x: referenceX, y: referenceY, dirty: referenceDirty, error: error || ""});
        }
    }
    function persistReference() {
        clearTimeout(referenceSaveTimer); referenceSaveTimer = null;
        rememberReference();
        if (!referenceDirty || !referencePath || !referenceContext) return;
        try {
            var record = referenceStore.save(referenceContext, referencePath, referenceX, referenceY);
            referenceDirty = false;
            rememberReference();
            referenceName.title = record.path + " · " + (record.scope === "project" ? "Saved in project settings" : "Saved locally on this computer");
            referenceError.textContent = "";
        } catch (error) {
            referenceError.textContent = "Could not save reference: " + (error.message || String(error));
            rememberReference(null, referenceError.textContent);
        }
    }
    function bindReference(entry, defaultEntry) {
        var project = Project.current, context = entry === null ? null : referenceStore.context(project, currentFile && currentFile.path, entry, defaultEntry);
        if (referenceTargetFile === currentFile && referenceTargetProject === project && referenceTargetEntry === entry && referenceDefaultEntry === defaultEntry &&
            (referenceContext && referenceContext.localKey) === (context && context.localKey)) {
            referenceContext = context; referenceDefaultEntry = defaultEntry;
            return;
        }
        if (drag && drag.kind === "reference") endDrag();
        persistReference(); discardPendingReference();
        if (referenceURL) URL.revokeObjectURL(referenceURL);
        referenceImage = referenceURL = null; referencePath = ""; referenceX = referenceY = 0; referenceDirty = false;
        referenceContext = context; referenceTargetFile = currentFile; referenceTargetProject = project;
        referenceTargetEntry = entry; referenceDefaultEntry = defaultEntry;
        referenceName.textContent = "No file selected"; referenceName.title = ""; referenceError.textContent = "";
        var record = null;
        try { record = context && referenceStore.load(context); }
        catch (error) { referenceError.textContent = "Could not read reference settings: " + (error.message || String(error)); }
        var temporaryEntries = currentFile && referenceSession.get(currentFile);
        var temporary = temporaryEntries && temporaryEntries.get(entry);
        if (temporary && temporary.project === project && (!temporary.contextKey || temporary.contextKey === (context && context.localKey))) {
            referenceX = temporary.x; referenceY = temporary.y; referencePath = temporary.filePath || "";
            referenceDirty = temporary.dirty; referenceError.textContent = temporary.error;
            loadReference(temporary.file, referencePath, true);
        } else if (record) {
            referencePath = record.filePath; referenceX = record.x; referenceY = record.y;
            referenceName.textContent = record.filePath.split(/[\\/]/).pop(); referenceName.title = record.path;
            loadReference(null, record.filePath, true);
        }
        referenceInputs.forEach(function(input, index) { input.value = index ? referenceY : referenceX; });
        outer.querySelector(".gw-reference-choose").disabled = !currentFile || entry === null;
        updateReference();
    }
    function referenceFilePath(file) {
        if (typeof file.path === "string" && file.path) return file.path;
        try {
            var electron = window.Electron_API || (typeof require === "function" && require("electron"));
            return electron && electron.webUtils && electron.webUtils.getPathForFile(file) || "";
        } catch (_) { return ""; }
    }
    async function loadReference(file, filePath, restoring) {
        if (!file && !filePath) return; // Cancelling the chooser keeps the current reference.
        if (!referenceTargetFile || referenceTargetEntry === null) return;
        if (drag && drag.kind === "reference") endDrag();
        if (filePath == null) filePath = referenceFilePath(file);
        discardPendingReference();
        var version = referenceVersion, image = new Image(), url;
        var name = file ? file.name : filePath.split(/[\\/]/).pop();
        var restoredError = restoring && referenceDirty ? referenceError.textContent : "";
        referenceError.textContent = "";
        referencePending = {image: image, url: null};
        try {
            var source = file;
            if (!source) {
                var bytes = await require("fs").promises.readFile(filePath);
                var extension = filePath.split(".").pop().toLowerCase();
                var types = {svg: "image/svg+xml", png: "image/png", apng: "image/apng", jpg: "image/jpeg", jpeg: "image/jpeg",
                    webp: "image/webp", gif: "image/gif", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif"};
                source = new Blob([bytes], {type: types[extension] || "application/octet-stream"});
            }
            if (!active || version !== referenceVersion) return;
            url = URL.createObjectURL(source);
        } catch (error) {
            if (!active || version !== referenceVersion) return;
            referencePending = null;
            referenceError.textContent = "Could not open “" + name + "”. Choose the file again.";
            return;
        }
        referencePending.url = url;
        image.onload = function() {
            if (!active || version !== referenceVersion) return;
            referencePending = null; image.onload = image.onerror = null;
            if (!image.naturalWidth || !image.naturalHeight) { URL.revokeObjectURL(url); referenceError.textContent = "Could not decode this image."; return; }
            if (referenceURL) URL.revokeObjectURL(referenceURL);
            referenceImage = image; referenceURL = url; referencePath = filePath || "";
            referenceName.textContent = name;
            referenceName.title = (referencePath || name) + " · " + image.naturalWidth + " × " + image.naturalHeight +
                (!referenceContext || !referencePath ? " · Session only: a saved script and local file path are required" : "");
            rememberReference(file);
            referenceError.textContent = restoredError;
            if (!restoring || referenceDirty && referenceContext && !restoredError) { referenceDirty = true; persistReference(); }
            updateReference();
        };
        image.onerror = function() {
            if (!active || version !== referenceVersion) return;
            referencePending = null; image.onload = image.onerror = null;
            URL.revokeObjectURL(url);
            referenceError.textContent = "Could not decode “" + name + "”. Choose an image file.";
        };
        image.src = url;
    }
    function updateCopy() {
        if (copyButton) copyButton.disabled = copying || !(currentReference() || scene && scene.nodes.some(function(node) { return !effectiveHiddenIds.has(node.id); })) || !canvas || canvas.hidden;
    }
    function cancelCopy() {
        if (!copying) return;
        // An export waits asynchronously and shares project fonts. A refresh
        // must not let the old export copy a mixture of resource generations.
        copyVersion++; copying = false; updateCopy();
        if (!active || !copyStatus) return;
        clearTimeout(copyFeedbackTimer);
        copyStatus.textContent = copyStatus.title = "Copy cancelled: preview resources changed. Copy again.";
        copyFeedbackTimer = setTimeout(function() { copyStatus.textContent = ""; copyStatus.title = ""; }, 4000);
    }
    async function copyPreview() {
        if (copying || !(currentReference() || scene && scene.nodes.length) || canvas.hidden) return;
        clearTimeout(copyFeedbackTimer); copyStatus.textContent = "";
        copying = true; updateCopy(); var version = ++copyVersion;
        var message;
        try {
            var image = await renderer.exportImage(scene, currentReference(), {sharpPixels: prefs.sharpPixels, hiddenNodeIds: hiddenNodeIds}), electron = window.Electron_API;
            if (!active || version !== copyVersion) return;
            if (!electron && typeof window.require === "function") {
                try { electron = window.require("electron"); } catch (_) { }
            }
            if (electron && electron.clipboard && typeof electron.clipboard.writeImage === "function" && electron.nativeImage) {
                var nativeImage = electron.nativeImage.createFromDataURL(image.toDataURL("image/png"));
                if (nativeImage.isEmpty()) throw new Error("Could not encode the preview image.");
                electron.clipboard.writeImage(nativeImage);
            } else if (navigator.clipboard && typeof navigator.clipboard.write === "function" && window.ClipboardItem) {
                var png = await new Promise(function(resolve, reject) {
                    image.toBlob(function(blob) { if (blob) resolve(blob); else reject(new Error("Could not encode the preview image.")); }, "image/png");
                });
                if (!active || version !== copyVersion) return;
                await navigator.clipboard.write([new window.ClipboardItem({"image/png": png})]);
            } else throw new Error("Image clipboard is unavailable in this GMEdit build.");
            message = "Copied";
        } catch (error) {
            message = "Copy failed: " + (error.message || String(error));
        } finally {
            if (version === copyVersion) copying = false;
            if (active && version === copyVersion) {
                updateCopy(); copyStatus.textContent = message; copyStatus.title = message;
                copyFeedbackTimer = setTimeout(function() { copyStatus.textContent = ""; copyStatus.title = ""; }, 4000);
            }
        }
    }
    function draw() {
        if ((!scene && !currentReference()) || !visible || !outer.isConnected || !stage.clientWidth || !stage.clientHeight) return;
        var options = {
            width: Math.max(100, stage.clientWidth), height: Math.max(90, stage.clientHeight),
            scale: Number(zoomSelect.value) || 0, viewport: zoomSelect.value === "viewport",
            outlines: prefs.outlines, approximateOutlines: prefs.approximateOutlines, selected: selectedId, hovered: hoveredId,
            panX: panX, panY: panY, reference: currentReference(), sharpPixels: prefs.sharpPixels,
            hiddenNodeIds: hiddenNodeIds,
            surface: {container: canvasSurface, viewport: stage}
        };
        view = renderer.render(scene, options);
        if (centerNodeId) {
            var target = nodesById.get(centerNodeId);
            centerNodeId = null;
            if (target && !currentReference()) {
                var offset = GooWeePreviewSourceSelection.centerOffset(target, view, stage.clientWidth, stage.clientHeight);
                panX += offset.x; panY += offset.y; zoomAnchor = null;
                options.panX = panX; options.panY = panY;
                view = renderer.render(scene, options);
            }
        }
        if (zoomAnchor) {
            // Resizing the canvas can clamp scroll offsets or remove scrollbars.
            // Anchor after that resize, in actual canvas coordinates.
            var rect = canvas.getBoundingClientRect();
            panX += zoomAnchor.clientX - rect.left - (zoomAnchor.x * view.scale + view.x);
            panY += zoomAnchor.clientY - rect.top - (zoomAnchor.y * view.scale + view.y);
            zoomAnchor = null;
            options.panX = panX; options.panY = panY;
            view = renderer.render(scene, options);
        }
        // Layout, zoom or image/font loads may change what is under a stationary
        // pointer. Reuse the freshly rendered hit-test geometry before painting hover.
        if (refreshHover(false)) {
            options.hovered = hoveredId;
            view = renderer.render(scene, options);
        }
    }
    function hitAt(clientX, clientY, deep) {
        if (currentReference()) return null;
        var rect = canvas.getBoundingClientRect();
        return renderer.hitTest(clientX - rect.left, clientY - rect.top, {deep: deep});
    }
    function setHovered(id, redraw) {
        if (id === hoveredId) return false;
        hoveredId = id;
        if (redraw !== false) requestDraw();
        return true;
    }
    function clearHover() {
        hoverPointer = null;
        setHovered(null);
    }
    function refreshHover(redraw) {
        var node = null;
        if (hoverPointer && !currentReference() && !spaceDown && !drag && active && visible && scene && view &&
            outer.isConnected && !canvas.hidden && stage.clientWidth && stage.clientHeight) {
            var rect = stage.getBoundingClientRect(), surface = canvas.getBoundingClientRect();
            var x = hoverPointer.x, y = hoverPointer.y;
            var left = rect.left + stage.clientLeft, top = rect.top + stage.clientTop;
            if (x >= left && y >= top && x < left + stage.clientWidth && y < top + stage.clientHeight &&
                x >= surface.left && y >= surface.top && x < surface.right && y < surface.bottom) {
                node = hitAt(x, y, ctrlDown);
            }
        }
        return setHovered(node ? node.id : null, redraw);
    }
    function rememberPointer(event) {
        if (event.pointerType === "touch") { clearHover(); return; }
        hoverPointer = {x: event.clientX, y: event.clientY};
        ctrlDown = event.ctrlKey === true;
        refreshHover();
    }
    function updateHoverModifiers(event) {
        ctrlDown = (event.key === "Control" && event.type === "keydown") || event.ctrlKey === true;
        refreshHover();
    }
    function updatePanCursor() {
        if (!stage) return;
        stage.classList.toggle("gw-pan-ready", spaceDown);
        stage.classList.toggle("gw-panning", !!drag && drag.kind !== "reference");
        stage.classList.toggle("gw-reference-movable", !!currentReference() && !referenceLocked && !spaceDown && !drag);
        stage.classList.toggle("gw-reference-dragging", !!drag && drag.kind === "reference");
        refreshHover();
    }
    function endDrag() {
        var previous = drag; drag = null;
        if (previous && stage && stage.hasPointerCapture(previous.id)) stage.releasePointerCapture(previous.id);
        if (previous && previous.kind === "reference") persistReference();
        updatePanCursor();
    }
    function cancelNavigation() {
        spaceDown = false; stageHovered = false; ctrlDown = false; clearHover(); endDrag();
    }
    function resetView() {
        cancelNavigation(); centerNodeId = null; view = null; zoomAnchor = null; panX = panY = 0; suppressCanvasClick = false;
        if (stage) stage.scrollLeft = stage.scrollTop = 0;
    }
    function setupNavigation() {
        function isSpace(event) { return event.code === "Space" || event.key === " " || event.key === "Spacebar"; }
        function canNavigate() { return active && visible && (scene || currentReference()) && view && outer.isConnected && stage.clientWidth && stage.clientHeight; }
        function editable(target) {
            return target && (target.isContentEditable || target.closest && target.closest("input, textarea, select, button, [contenteditable]:not([contenteditable=false]), .ace_editor"));
        }
        listenDOM(stage, "pointerenter", function(event) { stageHovered = true; rememberPointer(event); });
        listenDOM(stage, "pointerleave", function() { stageHovered = false; clearHover(); });
        listenDOM(stage, "scroll", function() { refreshHover(); requestDraw(); }, {passive: true});
        listenDOM(window, "keydown", function(event) {
            updateHoverModifiers(event);
            var key = String(event.key || "").toLowerCase();
            var isHideKey = event.code === "KeyH" || key === "h", isShowKey = event.code === "KeyU" || key === "u";
            var focused = document.activeElement;
            var typing = function(target) { return target && (target.isContentEditable || target.closest && target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), .ace_editor")); };
            if ((isHideKey || isShowKey && !event.ctrlKey) && !event.altKey && !event.metaKey && !event.shiftKey &&
                !event.isComposing && !spaceDown && !drag && canNavigate() && outer.contains(focused) &&
                !typing(focused) && !typing(event.target)) {
                event.preventDefault(); event.stopPropagation();
                if (!event.repeat) {
                    if (isHideKey && event.ctrlKey) undoHide(); else if (isHideKey) hideSelected(); else showAllHidden();
                }
                return;
            }
            var arrows = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
            if (arrows[event.key] && currentReference() && canNavigate() && document.activeElement === stage &&
                !editable(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey && !spaceDown && !drag) {
                event.preventDefault(); event.stopPropagation();
                if (!referenceLocked) {
                    var delta = arrows[event.key], step = event.shiftKey ? 10 : 1;
                    setReferenceOffset(referenceX + delta[0] * step, referenceY + delta[1] * step);
                }
                return;
            }
            if (!isSpace(event) || event.ctrlKey || event.metaKey || event.altKey || editable(event.target) || !canNavigate()) return;
            if (!stageHovered && !(event.target && event.target.nodeType && stage.contains(event.target)) && !drag) return;
            event.preventDefault(); event.stopPropagation(); spaceDown = true; updatePanCursor();
        }, true);
        listenDOM(window, "keyup", function(event) {
            updateHoverModifiers(event);
            if (!isSpace(event) || !spaceDown) return;
            event.preventDefault(); event.stopPropagation(); spaceDown = false;
            if (drag && drag.button === 0) endDrag(); else updatePanCursor();
        }, true);
        listenDOM(window, "blur", cancelNavigation);
        listenDOM(stage, "blur", function() { if (drag && drag.kind === "reference") endDrag(); });
        listenDOM(document, "visibilitychange", function() { if (document.hidden) cancelNavigation(); });
        listenDOM(stage, "pointerdown", function(event) {
            if ((event.button !== 0 && event.button !== 1) || drag || !canNavigate()) return;
            var rect = stage.getBoundingClientRect();
            if (event.clientX >= rect.left + stage.clientWidth || event.clientY >= rect.top + stage.clientHeight) return;
            stage.focus({preventScroll: true});
            rememberPointer(event);
            var movingReference = event.button === 0 && !spaceDown && currentReference() && !referenceLocked;
            if (event.button === 0 && !spaceDown && !movingReference) { suppressCanvasClick = false; return; }
            event.preventDefault(); event.stopPropagation();
            drag = {kind: movingReference ? "reference" : "pan", id: event.pointerId, x: event.clientX, y: event.clientY,
                button: event.button, buttons: event.button === 1 ? 4 : 1}; suppressCanvasClick = true;
            if (movingReference) {
                var surface = canvas.getBoundingClientRect();
                drag.offsetX = referenceX; drag.offsetY = referenceY;
                drag.worldX = (event.clientX - surface.left - view.x) / view.scale;
                drag.worldY = (event.clientY - surface.top - view.y) / view.scale;
            }
            try { stage.setPointerCapture(event.pointerId); } catch (_) { /* Synthetic input has no active pointer. */ }
            updatePanCursor();
        });
        listenDOM(window, "pointermove", function(event) {
            if (!drag) {
                if (event.target && event.target.nodeType && stage.contains(event.target)) rememberPointer(event); else clearHover();
                return;
            }
            if (event.pointerId !== drag.id) return;
            rememberPointer(event);
            if (!(event.buttons & drag.buttons) || !canNavigate()) { endDrag(); return; }
            event.preventDefault(); event.stopPropagation();
            if (drag.kind === "reference") {
                if (!currentReference() || referenceLocked) { endDrag(); return; }
                var surface = canvas.getBoundingClientRect();
                setReferenceOffset(Math.round(drag.offsetX + (event.clientX - surface.left - view.x) / view.scale - drag.worldX),
                    Math.round(drag.offsetY + (event.clientY - surface.top - view.y) / view.scale - drag.worldY));
                return;
            }
            panX += event.clientX - drag.x; panY += event.clientY - drag.y;
            drag.x = event.clientX; drag.y = event.clientY;
            requestDraw();
        }, {capture: true, passive: false});
        function release(event) {
            if (drag && event.pointerId === drag.id && (event.type !== "pointerup" || !(event.buttons & drag.buttons))) {
                if (event.type === "pointercancel") clearHover();
                else if (event.type === "pointerup") rememberPointer(event);
                endDrag();
            }
        }
        listenDOM(window, "pointerup", release, true);
        listenDOM(window, "pointercancel", release, true);
        listenDOM(stage, "lostpointercapture", release);
        function preventMiddleDefault(event) {
            if (event.button === 1 && canNavigate()) { event.preventDefault(); event.stopPropagation(); }
        }
        // Chromium's middle-button autoscroll must not compete with camera panning.
        listenDOM(stage, "mousedown", preventMiddleDefault);
        listenDOM(stage, "auxclick", preventMiddleDefault);
        listenDOM(stage, "wheel", function(event) {
            if (canNavigate()) rememberPointer(event);
            if (!event.ctrlKey || !canNavigate()) return;
            event.preventDefault(); event.stopPropagation();
            if (drag && drag.kind === "reference") endDrag();
            var delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
            if (!delta || !Number.isFinite(delta)) return;
            var scale = Number(zoomSelect.value) || view.scale;
            var next = Math.max(0.02, Math.min(8, scale * Math.exp(-Math.max(-1000, Math.min(1000, delta)) * 0.002)));
            if (next === scale) return;
            var rect = canvas.getBoundingClientRect();
            zoomAnchor = {clientX: event.clientX, clientY: event.clientY,
                x: (event.clientX - rect.left - view.x) / view.scale,
                y: (event.clientY - rect.top - view.y) / view.scale};
            var custom = zoomSelect.querySelector("[data-custom-zoom]");
            if (!custom) { custom = element("option", "", "", zoomSelect); custom.dataset.customZoom = "true"; }
            custom.value = String(next); custom.textContent = Math.round(next * 1000) / 10 + "%";
            zoomSelect.value = custom.value; requestDraw();
        }, {passive: false});
    }
    function buildUI() {
        outer = element("div", "goowee-preview"); outer.id = "goowee-preview";
        var toolbar = element("div", "gw-toolbar", null, outer);
        entrySelect = element("select", "gw-entry", null, toolbar);
        entrySelect.setAttribute("aria-label", "GooWee entry function");
        entryPlaceholder("Open a GooWee script");
        entrySelect.onchange = function() {
            if (!currentFile || entryChoiceFile !== currentFile || !entryChoices.some(function(entry) { return entry.name === entrySelect.value; })) return;
            if (pinned) pinned.entry = entrySelect.value;
            entryByFile.set(currentFile, entrySelect.value); selectedId = null; resetView();
            bindReference(entrySelect.value, entryChoices.length ? entryChoices[0].name : "");
            refresh();
        };
        lockButton = element("button", "gw-lock", null, toolbar); lockButton.type = "button";
        lockButton.setAttribute("aria-label", "Lock preview");
        lockButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path class="gw-lock-shackle"/><path d="M8 10v2"/></svg>';
        lockButton.onclick = function() {
            if (pinned) pinned = null;
            else if (sceneFile === currentFile && scene && !lockButton.disabled) pinned = {file: currentFile, entry: scene.entry || null, project: Project.current};
            else return;
            bindFile(); refresh();
        };
        updateLock();
        copyButton = element("button", "gw-copy", null, toolbar); copyButton.type = "button";
        copyButton.setAttribute("aria-label", "Copy preview image");
        copyButton.title = "Copy the entire interface at original size with a transparent background";
        copyButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M10 3V2H2v8h1"/></svg>';
        copyButton.onclick = copyPreview; updateCopy();
        hideSelectedButton = element("button", "gw-hide-selected", null, toolbar); hideSelectedButton.type = "button";
        hideSelectedButton.setAttribute("aria-label", "Hide selected element");
        hideSelectedButton.setAttribute("aria-keyshortcuts", "H");
        hideSelectedButton.title = "Hide the selected element and its children (H). Undo the last hide: Ctrl + H";
        hideSelectedButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 2l12 12M6.2 3.3A7 7 0 0 1 8 3c4 0 6 5 6 5a11 11 0 0 1-2 2.8M9.8 12.7A7 7 0 0 1 8 13c-4 0-6-5-6-5a11 11 0 0 1 2-2.8"/><path d="M6.2 6.2a2.5 2.5 0 0 0 3.6 3.6"/></svg>';
        hideSelectedButton.onclick = function() { stage.focus({preventScroll: true}); hideSelected(); };
        showAllButton = element("button", "gw-show-all", null, toolbar); showAllButton.type = "button";
        showAllButton.setAttribute("aria-label", "Show all hidden elements");
        showAllButton.setAttribute("aria-keyshortcuts", "U");
        showAllButton.title = "Show all elements hidden in this preview (U)";
        showAllButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4z"/><circle cx="8" cy="8" r="2"/></svg>';
        showAllButton.onclick = function() { stage.focus({preventScroll: true}); showAllHidden(); };
        updateVisibilityControls();
        followSelectionButton = element("button", "gw-follow-selection", null, toolbar); followSelectionButton.type = "button";
        followSelectionButton.setAttribute("aria-label", "Follow code selection");
        followSelectionButton.title = "Follow code selection: select and center the element highlighted in the editor";
        followSelectionButton.setAttribute("aria-pressed", String(prefs.followSelection));
        followSelectionButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="4"/><path d="M8 1v4m0 6v4M1 8h4m6 0h4"/></svg>';
        followSelectionButton.onclick = function() {
            prefs.followSelection = !prefs.followSelection; save();
            followSelectionButton.setAttribute("aria-pressed", String(prefs.followSelection));
            centerNodeId = null;
            if (prefs.followSelection) scheduleSourceSelection();
        };
        var refreshButton = element("button", "", "Refresh", toolbar); refreshButton.type = "button";
        refreshButton.title = "Reload sprites and rebuild the preview";
        refreshButton.onclick = function() { resetResources(); refresh(); };
        copyStatus = element("span", "gw-copy-status", "", toolbar);
        copyStatus.setAttribute("role", "status"); copyStatus.setAttribute("aria-live", "polite");
        var tools = element("div", "gw-toolbar", null, outer);
        ["width", "height"].forEach(function(key) {
            var label = element("label", "", key === "width" ? "W" : "H", tools);
            var input = element("input", "gw-dimension", null, label); input.type = "number";
            input.min = "64"; input.max = "8192"; input.value = prefs[key];
            input.setAttribute("aria-label", "Preview viewport " + key);
            input.onchange = function() { prefs[key] = dimension(input.value, prefs[key]); input.value = prefs[key]; save(); refresh(); };
        });
        var scaleLabel = element("label", "", "GUI ×", tools);
        var scaleInput = element("input", "gw-dimension", null, scaleLabel);
        scaleInput.type = "number"; scaleInput.min = "0.25"; scaleInput.max = "4"; scaleInput.step = "0.25"; scaleInput.value = prefs.guiScale;
        scaleInput.setAttribute("aria-label", "GooWee GUI scale");
        scaleInput.title = "ABSV and AUTOV multiply by GUI scale. ABS and AUTO do not. This is separate from preview zoom.";
        scaleInput.onchange = function() { var value=Number(scaleInput.value); if (value>=0.25 && value<=4) prefs.guiScale=value;scaleInput.value=prefs.guiScale;save();refresh(); };
        zoomSelect = element("select", "", null, tools);
        zoomSelect.setAttribute("aria-label", "Preview zoom");
        [["fit", "Fit content"], ["viewport", "Fit viewport"], ["0.25", "25%"], ["0.5", "50%"], ["1", "100%"], ["2", "200%"]].forEach(function(pair) {
            var option = element("option", "", pair[1], zoomSelect); option.value = pair[0];
        });
        zoomSelect.onchange = function() { resetView(); requestDraw(); };
        var outlineLabel = element("label", "", null, tools);
        var outlines = element("input", "", null, outlineLabel); outlines.type = "checkbox"; outlines.checked = prefs.outlines;
        outlineLabel.appendChild(document.createTextNode("Bounds"));
        outlines.onchange = function() { prefs.outlines = outlines.checked; save(); requestDraw(); };
        var approximateLabel = element("label", "", null, tools);
        var approximate = element("input", "", null, approximateLabel); approximate.type = "checkbox"; approximate.checked = prefs.approximateOutlines;
        approximate.setAttribute("aria-label", "Show approximate bounds");
        approximateLabel.appendChild(document.createTextNode("Approximate bounds"));
        approximateLabel.title = "Show dashed borders around approximated elements";
        approximate.onchange = function() { prefs.approximateOutlines = approximate.checked; save(); requestDraw(); };
        var sharpLabel = element("label", "", null, tools);
        var sharp = element("input", "", null, sharpLabel); sharp.type = "checkbox"; sharp.checked = prefs.sharpPixels;
        sharp.setAttribute("aria-label", "Sharp pixels");
        sharpLabel.appendChild(document.createTextNode("Sharp pixels"));
        sharpLabel.title = "Show crisp sprite pixels without smoothing. Preview text stays smooth; the reference is a single image, so this applies to all of it.";
        sharp.onchange = function() { prefs.sharpPixels = sharp.checked; save(); requestDraw(); };
        var referenceLabel = element("label", "", null, tools);
        referenceToggle = element("input", "gw-reference-toggle", null, referenceLabel); referenceToggle.type = "checkbox";
        referenceToggle.setAttribute("aria-label", "Reference");
        referenceLabel.appendChild(document.createTextNode("Reference"));
        referenceLabel.title = "Show reference controls for the current script and entry function";
        referenceToggle.onchange = updateReference;
        referenceToolbar = element("div", "gw-toolbar gw-reference-toolbar", null, outer); referenceToolbar.hidden = true;
        referenceToolbar.setAttribute("aria-label", "Reference controls");
        ["X", "Y"].forEach(function(axis) {
            var label = element("label", "", axis, referenceToolbar);
            var input = element("input", "gw-dimension", null, label);
            referenceInputs.push(input);
            input.type = "number"; input.step = "1"; input.value = "0";
            input.setAttribute("aria-label", "Reference offset " + axis);
            input.title = "Offset in GUI pixels from the top-left of the interface";
            input.oninput = function() {
                if (!input.value || !Number.isFinite(input.valueAsNumber)) return;
                if (axis === "X") referenceX = input.valueAsNumber; else referenceY = input.valueAsNumber;
                referenceDirty = true;
                clearTimeout(referenceSaveTimer); referenceSaveTimer = setTimeout(persistReference, 250);
                requestDraw();
            };
            input.onchange = function() { input.oninput(); input.value = axis === "X" ? referenceX : referenceY; persistReference(); };
        });
        referenceLockButton = element("button", "gw-reference-lock", null, referenceToolbar); referenceLockButton.type = "button";
        referenceLockButton.setAttribute("aria-label", "Lock reference offset");
        referenceLockButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path/><path d="M8 10v2"/></svg>';
        referenceLockButton.onclick = function() { if (drag && drag.kind === "reference") endDrag(); referenceLocked = !referenceLocked; updateReferenceLock(); };
        referenceLockButton.setAttribute("aria-pressed", "false");
        referenceLockButton.title = "Lock reference dragging and arrow keys (X/Y fields remain editable)";
        referenceLockButton.querySelector("path").setAttribute("d", "M5 7V5a3 3 0 0 1 6 0");
        var chooseReference = element("button", "gw-reference-choose", "Choose file…", referenceToolbar); chooseReference.type = "button";
        chooseReference.disabled = true;
        chooseReference.setAttribute("aria-label", "Choose reference image");
        referenceFile = element("input", "gw-reference-file", null, referenceToolbar);
        referenceFile.type = "file"; referenceFile.accept = "image/*"; referenceFile.hidden = true;
        referenceFile.setAttribute("aria-label", "Reference image file");
        chooseReference.onclick = function() { referenceFile.click(); };
        referenceFile.onchange = function() { loadReference(referenceFile.files[0]); referenceFile.value = ""; };
        referenceName = element("span", "gw-reference-name", "No file selected", referenceToolbar);
        referenceName.setAttribute("role", "status");
        var showReferenceLabel = element("label", "", null, referenceToolbar);
        referenceShow = element("input", "", null, showReferenceLabel); referenceShow.type = "checkbox"; referenceShow.checked = true;
        referenceShow.setAttribute("aria-label", "Show reference");
        showReferenceLabel.appendChild(document.createTextNode("Show reference"));
        referenceShow.onchange = updateReference;
        referenceError = element("span", "gw-reference-error", "", referenceToolbar); referenceError.setAttribute("role", "alert");
        status = element("div", "gw-status", "Open a GooWee script", outer); status.setAttribute("role", "status");
        stage = element("div", "gw-stage", null, outer);
        stage.tabIndex = 0;
        stage.title = "Hover to preview selection; hold Ctrl for nested elements. Middle drag or Space + left drag to pan; Ctrl + wheel to zoom. Choose Fit content to reset the view.";
        canvasSurface = element("div", "gw-surface", null, stage);
        canvas = element("canvas", "", null, canvasSurface); canvas.setAttribute("aria-label", "GooWee layout preview; use Elements below for keyboard navigation");
        empty = element("div", "gw-empty", "", stage);
        canvas.onclick = function(event) { if (currentReference() || event.button !== 0 || spaceDown || drag || suppressCanvasClick) return; selectNode(hitAt(event.clientX, event.clientY, event.ctrlKey), false); };
        canvas.ondblclick = function(event) { if (currentReference() || event.button !== 0 || spaceDown || drag || suppressCanvasClick) return; selectNode(hitAt(event.clientX, event.clientY, event.ctrlKey), true); };
        var details = element("div", "gw-details", null, outer);
        var elements = element("details", "", null, details);
        treeSummary = element("summary", "", "Elements", elements);
        tree = element("div", "gw-tree", null, elements);
        var notes = element("details", "", null, details);
        diagnosticSummary = element("summary", "", "Preview notes", notes);
        diagnosticList = element("div", "", null, notes);
        selection = element("div", "gw-selection gw-inspection", "", outer);
        fonts = GooWeePreviewFonts.create(function(name) { return getResources().font(name); }, schedule);
        renderer = GooWeePreviewRenderer.create(canvas, function(name, index) { return getResources().sprite(name, index); }, requestDraw, fonts);
        resetView(); setupNavigation();
        textContext = document.createElement("canvas").getContext("2d");
        if (window.ResizeObserver) { observer = new ResizeObserver(requestDraw); observer.observe(stage); }
    }

    GMEdit.register("goowee-preview", {
        init: function() {
            loadPreferences();
            referenceStore = GooWeePreviewReferences.create(Preferences, ProjectProperties);
            active = true;
            buildUI();
            listen(GMEdit, "activeFileChange", bindFile);
            listen(GMEdit, "fileClose", function(event) {
                var closed = event && event.file;
                if (closed) visibilityByFile.delete(closed);
                if (pinned && pinned.file === closed) pinned = null;
                bindFile(closed);
            });
            listen(GMEdit, "fileSave", function() { resetResources(); bindFile(); });
            listen(GMEdit, "fileReload", function() { resetResources(); bindFile(); });
            listen(GMEdit, "fileRename", function() { resetResources(); bindFile(); });
            listen(GMEdit, "projectOpen", function() { pinned = null; visibilityByFile = new WeakMap(); resetResources(); bindFile(); });
            listen(GMEdit, "projectClose", function() { pinned = null; visibilityByFile = new WeakMap(); resetResources(); bindFile(GmlFile.current); showEmpty("Open a GooWee script in a project."); });
            window.addEventListener("resize", requestDraw);
            listenDOM(window, "beforeunload", persistReference);
            command = {name: "toggleGooWeePreview", exec: function() { setVisible(!visible, true); save(); }};
            paletteCommand = {name: "Toggle GooWee preview", exec: "toggleGooWeePreview", title: ""};
            AceCommands.add(command); AceCommands.addToPalette(paletteCommand);
            bindFile();
            // Preserve the user's selected panel on startup. The tab exposes this preview.
            setVisible(!prefs.hide, false);
        },
        cleanup: function() {
            cancelNavigation();
            persistReference();
            active = false;
            discardPendingReference();
            if (referenceURL) URL.revokeObjectURL(referenceURL);
            referenceImage = referenceURL = null; referenceX = referenceY = 0;
            clearTimeout(copyFeedbackTimer); copyVersion++; copying = false;
            view = null; zoomAnchor = null;
            clearTimeout(timer); if (frame) cancelAnimationFrame(frame); frame = null;
            if (session) session.off("change", schedule); session = null;
            if (editingSession) editingSession.off("change", schedule); editingSession = null;
            if (sourceSelection) sourceSelection.off("changeSelection", scheduleSourceSelection);
            sourceSelection = null; centerNodeId = null; followSelectionButton = null;
            clearTimeout(sourceSelectionTimer);
            listeners.splice(0).forEach(function(remove) { remove(); });
            window.removeEventListener("resize", requestDraw);
            if (observer) observer.disconnect(); observer = null;
            if (renderer) renderer.dispose(); renderer = null;
            if (fonts) fonts.dispose(); fonts = null;
            if (resources) resources.dispose(); resources = null; resourceProject = null;
            resetLocalization();
            AceCommands.remove(command); AceCommands.removeFromPalette(paletteCommand);
            detach(); outer.remove(); scene = null; currentFile = null; visible = false; hideCheckbox = null;
            entryByFile = new WeakMap();
            entryChoices = []; entryChoiceFile = null;
            visibilityByFile = new WeakMap(); visibilityState = null;
            nodeKeys.clear(); nodesById.clear(); hiddenNodeIds.clear(); effectiveHiddenIds.clear();
            hideSelectedButton = showAllButton = null;
            pinned = null; sceneFile = null; lockButton = null; copyButton = null; copyStatus = null;
            referenceToggle = referenceToolbar = referenceShow = referenceFile = referenceName = referenceError = referenceLockButton = null;
            referenceLocked = false;
            referenceInputs = []; referenceStore = referenceContext = referenceTargetFile = referenceTargetProject = null;
            referenceTargetEntry = null; referenceDefaultEntry = "";
            referencePath = ""; referenceDirty = false; referenceSession = new WeakMap();
        },
        buildPreferences: function(out) {
            if (!active) loadPreferences();
            var hide = Preferences.addCheckbox(out, "Hide GooWee preview", !!prefs.hide, function(value) { setVisible(!value, true); save(); });
            hideCheckbox = hide.querySelector("input");
            var names = ["Right"], values = ["right"];
            if (GMEdit.bottomPanel) { names.push("Bottom"); values.push("bottom"); }
            if (GMEdit.leftBottomPanel && GMEdit.leftBottomPanel.available !== false) { names.push("Below resource tree"); values.push("left-bottom"); }
            Preferences.addDropdown(out, "Preview panel position", names[Math.max(0, values.indexOf(prefs.position))], names, function(value) { changePosition(values[names.indexOf(value)]); });
            element("p", "", "Preview follows the active unsaved script. Use the lock beside Refresh to keep a script and function visible while editing other tabs. Choose a function, viewport size and zoom in the panel. Dynamic game data and custom rendering are approximate; see Preview notes.", out);
        },
        buildProjectProperties: function(out, project) {
            var settings = project.properties && project.properties.gooWeePreview || {};
            var directoryGroup = Preferences.addInput(out, "Localization directory", settings.localeDirectory || "", function(value) { update("localeDirectory", value.trim()); });
            var directoryInput = directoryGroup.querySelector("input");
            directoryInput.setAttribute("aria-label", "GooWee localization directory");
            directoryInput.placeholder = "Auto: datafiles/localization";
            var browse = element("button", "", "Browse…", directoryGroup); browse.type = "button";
            browse.setAttribute("aria-label", "Browse GooWee localization directory");
            var languageGroup = element("div", "select", null, out);
            var languageLabel = element("label", "", "Preview language", languageGroup);
            var language = element("select", "", null, languageGroup);
            language.id = "goowee-locale-language"; languageLabel.htmlFor = language.id;
            language.setAttribute("aria-label", "GooWee preview language");
            var reload = element("button", "", "Reload localization", out); reload.type = "button";
            var state = element("p", "gw-localization-state", "", out); state.setAttribute("role", "status");
            element("p", "", "Choose the folder containing locale_definition.json. Relative paths start at the project folder. Leave blank to discover datafiles/localization. These settings apply only to this project.", out);
            function inspect() {
                if (project === Project.current) return getLocalization().info();
                var probe = GooWeePreviewLocalization.create(project, localizationSettings(project));
                try { return probe.info(); } finally { probe.dispose(); }
            }
            function sync() {
                var info = inspect();
                language.replaceChildren();
                info.languages.forEach(function(item) {
                    var option = element("option", "", item.caption || item.name || item.id, language); option.value = item.id;
                });
                language.disabled = !info.languages.length;
                if (language.disabled) element("option", "", "Choose a localization directory first", language).value = "";
                else language.value = info.language || info.languages[0].id;
                state.textContent = info.error || (info.languages.length ? info.languages.length + " languages · " + info.definitionPath : "No locale_definition.json found. Choose a localization directory to display translated text.");
                state.title = info.diagnostics.map(function(note) { return note.message; }).join("\n");
                return info;
            }
            function update(key, value) {
                if (!project.properties) project.properties = {};
                if (!project.properties.gooWeePreview) project.properties.gooWeePreview = {};
                if (value) project.properties.gooWeePreview[key] = value;
                else delete project.properties.gooWeePreview[key];
                ProjectProperties.save(project, project.properties);
                if (project === Project.current) { resetLocalization(); if (active) refresh(); }
                sync();
            }
            language.onchange = function() { update("localeLanguage", language.value); };
            reload.onclick = function() { if (project === Project.current) { resetLocalization(); if (active) refresh(); } sync(); };
            var dialog = $gmedit["electron.Dialog"];
            browse.disabled = !dialog || typeof dialog.showOpenDialog !== "function";
            browse.onclick = function() {
                var info = inspect();
                dialog.showOpenDialog({title: "Choose GooWee localization directory", defaultPath: info.directory || project.dir, properties: ["openDirectory"]}, function(paths) {
                    if (!paths || !paths[0]) return;
                    var value = paths[0];
                    if (typeof require === "function" && project.dir) {
                        var path = require("path"), relative = path.relative(project.dir, value);
                        if (relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) value = relative.replace(/\\/g, "/");
                    }
                    directoryInput.value = value; update("localeDirectory", value);
                });
            };
            sync();
        }
    });
})();
