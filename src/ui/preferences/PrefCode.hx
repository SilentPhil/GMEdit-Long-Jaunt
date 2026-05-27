package ui.preferences;
import tools.Dictionary;
import js.html.Element;
import ui.Preferences.*;
import gml.GmlAPI;
import gml.file.GmlFile;
import ui.preferences.PrefData;
using tools.HtmlTools;
import js.html.InputElement;
import js.html.SelectElement;
import file.kind.misc.KSnippets;

/**
 * ...
 * @author YellowAfterlife
 */
class PrefCode {
	static function buildComp(out:Element) {
		var el:Element;
		
		addCheckbox(out, "UK spelling", current.ukSpelling, function(z) {
			current.ukSpelling = z;
			GmlAPI.ukSpelling = z;
			GmlAPI.init();
			save();
		}).title = "Displays UK versions of function/variable names (e.g. draw_set_colour) in auto-completion when available.";
		
		addCheckbox(out, "Auto-complete keywords", current.compKeywords, function(z) {
			current.compKeywords = z;
			save();
		});
		
		el = addInput(out,
			"API feature flags (comma-separated; spaces are trimmed; reload required)",
			current.apiFeatureFlags.join(", "),
		function(text) {
			text = tools.NativeString.trimBoth(text);
			var flags = text == "" ? [] : text.split(",").map(s -> tools.NativeString.trimBoth(s));
			current.apiFeatureFlags = flags;
			save();
		});
		el.title = "Seen as ^flag suffix in GM2022+ `fnames`."
				+"\nAdd flags if participating in feature betas.";
		
		//
		var compMatchModes = PrefMatchMode.names;
		el = addDropdown(out,
			"Auto-completion mode",
			compMatchModes[current.compMatchMode],
			compMatchModes,
		function(s) {
			current.compMatchMode = compMatchModes.indexOf(s);
			save();
		});
		addWiki(el, "https://github.com/GameMakerDiscord/GMEdit/wiki/Preferences#auto-completion-mode");
		
		//
		var optSnippets_0 = ["gml", "gml_search", "shader"];
		var optSnippets_1 = ["GML", "Search results", "Shaders"];
		var optSnippets_select:SelectElement = null;
		el = addDropdown(out, "Edit snippets", "", optSnippets_1, function(name) {
			var mode = optSnippets_0[optSnippets_1.indexOf(name)];
			GmlFile.openTab(new GmlFile(mode + ".snippets", mode, KSnippets.inst));
			optSnippets_select.value = "";
		});
		addWiki(el, "https://github.com/GameMakerDiscord/GMEdit/wiki/Using-snippets");
		optSnippets_select = el.querySelectorAuto("select");
		
		addCheckbox(out,
			"Don't offer snippets inside strings/comments/etc.",
		current.compFilterSnippets, function(z) {
			current.compFilterSnippets = z;
			save();
		});
	}
	
	static function buildTooltips(out:Element) {
		var tooltipKinds = ["None", "Custom"];
		addDropdown(out, "Code tooltips", tooltipKinds[current.tooltipKind], tooltipKinds, function(s) {
			current.tooltipKind = tooltipKinds.indexOf(s);
			save();
		});
		
		addIntInput(out, "Code tooltip delay for mouse activity (ms; 0 to disable):", current.tooltipDelay, function(t) {
			current.tooltipDelay = t;
			save();
		});
		
		addIntInput(out, "Code tooltip delay for keyboard activity (ms; 0 to disable):", current.tooltipKeyboardDelay, function(t) {
			current.tooltipKeyboardDelay = t;
			save();
		});
	}
	static function buildAI(out:Element) {
		addText(out, "Experimental command-palette and inline code completion.");
		addCheckbox(out, "Enable AI code completion", current.aiCompletion.enabled, function(z) {
			current.aiCompletion.enabled = z;
			save();
		});
		var providerOptions = Main.document.createDivElement();
		function rebuildProviderOptions():Void {
			providerOptions.innerHTML = "";
			if (ui.AICodeCompletion.sanitizeProvider(Reflect.field(current.aiCompletion, "provider")) == "copilot") {
				addText(providerOptions, "GitHub Copilot uses your GitHub account. Use the command palette actions `AI: GitHub Copilot sign in` and `AI: GitHub Copilot sign out`.");
				return;
			}
			addIntInput(providerOptions, "AI inline context size (characters)", current.aiCompletion.inlineContextChars, function(v) {
				current.aiCompletion.inlineContextChars = v;
				save();
			});
			addIntInput(providerOptions, "AI inline max output tokens (minimum 16)", current.aiCompletion.inlineMaxOutputTokens, function(v) {
				current.aiCompletion.inlineMaxOutputTokens = v;
				save();
			});
			addInput(providerOptions, "AI API base URL", current.aiCompletion.baseUrl, function(s) {
				current.aiCompletion.baseUrl = tools.NativeString.trimBoth(s);
				save();
			}).title = "OpenAI default: https://api.openai.com/v1";
			var keyEl = addInput(providerOptions, "AI API key", current.aiCompletion.apiKey, function(s) {
				current.aiCompletion.apiKey = tools.NativeString.trimBoth(s);
				save();
			});
			var keyInput:InputElement = keyEl.querySelectorAuto("input");
			keyInput.type = "password";
			keyEl.title = "Stored in GMEdit user preferences.";
			addInput(providerOptions, "AI model", current.aiCompletion.model, function(s) {
				current.aiCompletion.model = tools.NativeString.trimBoth(s);
				save();
			});
			addIntInput(providerOptions, "AI context size (characters)", current.aiCompletion.maxContextChars, function(v) {
				current.aiCompletion.maxContextChars = v;
				save();
			});
			addIntInput(providerOptions, "AI max output tokens (minimum 16)", current.aiCompletion.maxOutputTokens, function(v) {
				current.aiCompletion.maxOutputTokens = v;
				save();
			});
		}
		var providerLabels = ["OpenAI-compatible API", "GitHub Copilot"];
		var providerValues = ["openai", "copilot"];
		var provider = ui.AICodeCompletion.sanitizeProvider(Reflect.field(current.aiCompletion, "provider"));
		addDropdown(out, "AI completion provider", providerLabels[providerValues.indexOf(provider)], providerLabels, function(s) {
			current.aiCompletion.provider = providerValues[providerLabels.indexOf(s)];
			save();
			rebuildProviderOptions();
		}).title = "GitHub Copilot uses the official Copilot Language Server and does not need the OpenAI API key.";
		addCheckbox(out, "Show AI inline suggestions while typing", current.aiCompletion.inlineEnabled, function(z) {
			current.aiCompletion.inlineEnabled = z;
			save();
		});
		var inlineEagernessLabels = ["Low", "Medium", "High"];
		var inlineEagernessValues = ["low", "medium", "high"];
		var inlineEagerness = ui.AICodeCompletion.sanitizeEagerness(Reflect.field(current.aiCompletion, "inlineEagerness"));
		addDropdown(out, "AI inline eagerness", inlineEagernessLabels[inlineEagernessValues.indexOf(inlineEagerness)], inlineEagernessLabels, function(s) {
			current.aiCompletion.inlineEagerness = inlineEagernessValues[inlineEagernessLabels.indexOf(s)];
			save();
		}).title = "Low waits longer and asks for less; High reacts faster and allows longer suggestions.";
		addIntInput(out, "AI inline suggestion delay (ms)", current.aiCompletion.inlineDelayMs, function(v) {
			current.aiCompletion.inlineDelayMs = v;
			save();
		});
		out.appendChild(providerOptions);
		rebuildProviderOptions();
		addCheckbox(out, "Enable AI completion debug logging", Reflect.field(current.aiCompletion, "debugEnabled") == true, function(z) {
			current.aiCompletion.debugEnabled = z;
			save();
		}).title = "Stores the last AI completion prompt, response, filtering steps, and inline lifecycle events for the command palette copy action. API keys are not included.";
	}
	public static function build(out:Element) {
		out = addGroup(out, "Code editor");
		out.id = "pref-code";
		var el:Element;
		//
		el = addBigButton(out, "Code Editor Settings", function() {
			ace.AceWrap.loadModule("ace/ext/settings_menu", function(module) {
				module.init(Main.aceEditor);
				untyped Main.aceEditor.showSettingsMenu();
			});
		});
		el.appendChild(Main.document.createTextNode(" Font, size, word wrap, etc."));
		addBigButton(out, "Edit Keyboard Shortcuts", function() editors.EditKeybindings.open());
		
		//
		buildComp(addGroup(out, "Auto-completion"));
		buildAI(addGroup(out, "AI completion"));
		buildTooltips(addGroup(out, "Tooltips"));
		
		//
		addCheckbox(out, "Auto-detect soft tabs", current.detectTab, function(z) {
			current.detectTab = z;
			save();
		}).title = "If enabled, will auto-detect whether to indent with tabs or spaces"
			+ " based on whether the file has lines starting with either.";
		
		//
		addCheckbox(out,
			"Allow changing code editor font size via Control+mouse wheel",
		current.ctrlWheelFontSize, function(z) {
			current.ctrlWheelFontSize = z;
			save();
		}).title = "If disabled, you can still use F7, F8, or code editor settings.";
		
		addCheckbox(out,
			"Show argument types in status bar",
		current.showArgTypesInStatusBar, function(z) {
			current.showArgTypesInStatusBar = z;
			save();
		});
		
		addCheckbox(out,
			"Highlight code inside hinted GML strings (e.g. /*gml*/@'return 1')",
			current.codeLiterals,
			andSave(v -> current.codeLiterals = v)
		).setTitleLines([
			"Supported modes: gml, hlsl, glsl.",
			"GMS2: use /*mode*/@'string'.",
			"GMS1: use /*mode*/'string'.",
			"Affects newly opened code tabs."
		]);
		
		addCheckbox(out,
			"Highlight self/other/global/all/noone as 'ace_kwconst'",
			current.constKeywords,
			andSave(v -> {
				current.constKeywords = v;
				applyConstKeywords(true, null);
			})
		).setTitleLines([
			"For consistency with GMS2 IDE.",
			"Must be supported by your theme.",
			"Takes effect after re-opening files."
		]);
	}
	public static function applyConstKeywords(force:Bool, stdKind:Dictionary<String>) {
		var enable = Preferences.current.constKeywords;
		if (!force && !enable) return;
		stdKind ??= GmlAPI.stdKind;
		for (kw in ["self", "other", "all", "noone", "global"]) {
			stdKind[kw] = enable ? "keyword.kwconst" : "keyword";
		}
	}
}
