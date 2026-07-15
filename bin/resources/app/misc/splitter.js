(function() {
var mainEl = document.getElementById("main");
var splitters = [];
var electron, fs, configPath;
if (window.require) {
	electron = require("electron");
	fs = require("fs");
	var remote = electron.remote;
	if (remote == null) remote = require("@electron/remote");
	configPath = remote.app.getPath("userData") + "/GMEdit/session/splitter.json";
}
var conf = null;
var sessionData = null;
function initConf() {
	if (conf == null && window["$gmedit"]) {
		conf = new $gmedit["electron.ConfigFile"]("session", "splitter");
	}
}
function readSessionData() {
	initConf();
	if (conf) {
		conf.sync();
		if (conf.data == null) conf.data = {};
		return conf.data;
	}
	if (sessionData == null) {
		sessionData = {};
		try {
			var json_str = fs ? fs.readFileSync(configPath) : localStorage.getItem("session/splitter");
			if (json_str) sessionData = JSON.parse(json_str) || {};
		} catch (x) {
			sessionData = {};
		}
	}
	return sessionData;
}
function flushSessionData() {
	if (conf) {
		conf.flush();
	} else if (!fs && sessionData != null) try {
		localStorage.setItem("session/splitter", JSON.stringify(sessionData));
	} catch (x) {
		//
	}
}
function getSessionSub(lsKey, create) {
	var data = readSessionData();
	var sub = data[lsKey];
	if (sub == null && create) sub = data[lsKey] = {};
	return sub;
}

function syncMain() {
	var mainWidth = window.innerWidth;
	for (var i = 0; i < splitters.length; i++) {
		var sp = splitters[i];
		if (sp.sizer.style.display == "none") continue;
		if (!document.body.contains(sp.sizer)) continue;
		mainWidth -= sp.getWidth();
	}
	mainEl.style.setProperty("--main-width", mainWidth + "px");
}
function emitResize() {
	var e = new CustomEvent("resize");
	e.initEvent("resize");
	window.dispatchEvent(e);
}
//
function Splitter(sizer) {
	initConf();
	var q = this;
	var target = document.querySelector(sizer.getAttribute("splitter-element"));
	this.target = target;
	this.sizer = sizer;
	this.widthVar = sizer.getAttribute("splitter-width-var");
	this.setVars = !!this.widthVar;
	this.minWidth = 0|(sizer.getAttribute("splitter-min-width")||50);
	this.updateTabs = sizer.getAttribute("splitter-update-tabs");
	this.isMisc = sizer.id != "splitter-td";
	this.orientation = sizer.getAttribute("splitter-orientation") || "vertical";
	this.parentEl = target.parentElement;
	this.lsKey = sizer.getAttribute("splitter-lskey");
	this.defaultWidth = 0|(sizer.getAttribute("splitter-default-width")||this.minWidth);
	this.lastWidth = null;
	this.collapsed = false;
	this.toggleButton = sizer.querySelector(".tree-toggle-button");
	target.style.setProperty("flex-grow", "inherit");
	//
	var w = null;
	var sub = getSessionSub(this.lsKey, false);
	if (sub) w = sub.width;
	this.setWidth(Math.max(0|(w || this.defaultWidth), this.minWidth));
	//
	function updateToggleButton() {
		if (!q.toggleButton) return;
		var label = q.collapsed ? "Show resources panel" : "Hide resources panel";
		q.toggleButton.title = label;
		q.toggleButton.setAttribute("aria-label", label);
		q.toggleButton.setAttribute("aria-expanded", q.collapsed ? "false" : "true");
	}
	function syncCollapsedVar() {
		if (!q.setVars) return;
		mainEl.style.setProperty(q.widthVar, q.sizer.offsetWidth + "px");
		syncMain();
	}
	function setCollapsed(collapsed) {
		if (q.collapsed == collapsed) return;
		if (collapsed) {
			var currentWidth = parseFloat(q.target.style[q.orientation == "horizontal" ? "height" : "width"])
				|| (q.orientation == "horizontal" ? q.target.offsetHeight : q.target.offsetWidth)
				|| q.defaultWidth;
			if (currentWidth > 0) q.lastWidth = currentWidth;
			q.target.style.display = "none";
			q.sizer.classList.add("tree-panel-collapsed");
			mainEl.classList.add("tree-panel-collapsed");
			syncCollapsedVar();
		} else {
			q.target.style.display = "";
			q.sizer.classList.remove("tree-panel-collapsed");
			mainEl.classList.remove("tree-panel-collapsed");
			q.setWidth(Math.max(q.lastWidth || q.defaultWidth, q.minWidth));
		}
		q.collapsed = collapsed;
		updateToggleButton();
		if (q.updateTabs && window.$gmedit) $gmedit["ui.ChromeTabs"].impl.layoutTabs();
		emitResize();
	}
	this.setCollapsed = setCollapsed;
	if (this.toggleButton) {
		this.toggleButton.addEventListener("mousedown", function(e) {
			e.stopPropagation();
		});
		this.toggleButton.addEventListener("click", function(e) {
			e.preventDefault();
			e.stopPropagation();
			setCollapsed(!q.collapsed);
		});
		updateToggleButton();
	}
	//
	var sp_mousemove, sp_mouseup, sp_x, sp_y;
	sp_mousemove = function(e) {
		var nx = e.pageX, dx = nx - sp_x; sp_x = nx;
		var ny = e.pageY, dy = ny - sp_y; sp_y = ny;
		var delta = q.orientation == "horizontal" ? dy : dx;
		var nw = parseFloat(q.target.style[q.orientation == "horizontal" ? "height" : "width"])
			+ delta * (q.target.parentElement.children[0] == q.target ? 1 : -1);
		if (nw < q.minWidth) nw = q.minWidth;
		q.setWidth(nw);
		if (q.updateTabs && window.$gmedit) $gmedit["ui.ChromeTabs"].impl.layoutTabs()
		
		emitResize();
	};
	sp_mouseup = function(e) {
		document.removeEventListener("mousemove", sp_mousemove);
		document.removeEventListener("mouseup", sp_mouseup);
		mainEl.classList.remove("resizing");
		var w = parseFloat(q.target.style[q.orientation == "horizontal" ? "height" : "width"]);
		// save
		var sub = getSessionSub(q.lsKey, true);
		sub.width = w;
		flushSessionData();
	};
	sizer.addEventListener("mousedown", function(e) {
		if (q.collapsed) return;
		sp_x = e.pageX; sp_y = e.pageY;
		document.addEventListener("mousemove", sp_mousemove);
		document.addEventListener("mouseup", sp_mouseup);
		mainEl.classList.add("resizing");
		e.preventDefault();
	});
}
Splitter.syncMain = syncMain;
Splitter.splitters = splitters;
Splitter.prototype = {
	getWidth: function() {
		if (this.orientation == "horizontal") return 0;
		var targetWidth = this.target.offsetWidth;
		return (targetWidth > 0 ? (parseFloat(this.target.style.width) || targetWidth) : 0) + this.sizer.offsetWidth;
	},
	setWidth: function(nw) {
		if (this.orientation == "horizontal") {
			this.target.style.height = nw + "px";
			this.target.style.width = "";
			this.target.style.flex = "0 0 " + nw + "px";
		} else {
			this.target.style.width = nw + "px";
			this.target.style.flex = "0 0 " + nw + "px";
		}
		if (this.setVars) {
			var sizerSize = this.orientation == "horizontal" ? this.sizer.offsetHeight : this.sizer.offsetWidth;
			mainEl.style.setProperty(this.widthVar, (nw + sizerSize) + "px");
			syncMain(nw);
		}
	}
};
Splitter.expandTarget = function(selector) {
	var target = document.querySelector(selector);
	if (target == null) return false;
	for (var i = 0; i < splitters.length; i++) {
		var sp = splitters[i];
		if (sp.target == target || sp.sizer == target) {
			if (sp.setCollapsed) sp.setCollapsed(false);
			return true;
		}
	}
	return false;
};
window.GMEdit_Splitter = Splitter;
var splitterEls = document.querySelectorAll(".splitter-td");
for (var i = 0; i < splitterEls.length; i++) {
	var sp = new Splitter(splitterEls[i])
	if (sp.setVars) splitters.push(sp);
}
window.addEventListener("resize", function(e) {
	syncMain();
});
syncMain();
})();
