package ui;

import ace.AceWrap;
import ace.extern.AcePos;
import ace.extern.AceRange;
import electron.Dialog;
import electron.Electron;
import haxe.Json;
import js.Syntax;
import js.html.DivElement;
import js.html.Element;
import ui.Preferences;
using StringTools;

typedef AICompletionConfig = {
	provider:String,
	apiKey:String,
	baseUrl:String,
	model:String,
	maxContextChars:Int,
	maxOutputTokens:Int,
	inlineContextChars:Int,
	inlineMaxOutputTokens:Int,
	inlineEagerness:String,
	debugEnabled:Bool,
}

typedef AICompletionRequestHandle = {
	var cancel:Void->Void;
}

typedef AIInlineSuggestion = {
	var replaceStart:AcePos;
	var replaceEnd:AcePos;
	var insertText:String;
	var displayText:String;
	var session:Dynamic;
}

typedef AICompletionPromptData = {
	var request:Dynamic;
	var context:Dynamic;
	var linePrefix:String;
	var protectedSuffix:String;
}

typedef AIOpenCodeTabsContext = {
	var text:String;
	var count:Int;
	var chars:Int;
	var truncated:Bool;
	var files:Array<Dynamic>;
}

class AICodeCompletion {
	static var pending:Bool = false;
	static var lastDebug:Dynamic = null;
	static var debugSeq:Int = 0;
	static inline var DEFAULT_BASE_URL:String = "https://api.openai.com/v1";
	static inline var DEFAULT_MODEL:String = "gpt-5.4-mini";
	
	public static function bind(editor:AceWrap):Void {
		getState(editor, true).bind();
	}
	
	public static function showInline(editor:AceWrap, explicit:Bool = true):Void {
		getState(editor, true).request(explicit);
	}
	
	public static function acceptInline(editor:AceWrap):Bool {
		var state = getState(editor, false);
		return state != null && state.accept();
	}

	public static function acceptInlinePart(editor:AceWrap, mode:String):Bool {
		var state = getState(editor, false);
		return state != null && state.acceptPart(mode);
	}
	
	public static function hideInline(editor:AceWrap):Bool {
		var state = getState(editor, false);
		if (state == null || !state.hasSuggestion()) return false;
		state.hide(true, "manual-hide");
		return true;
	}

	public static function copyLastDebug(editor:AceWrap):Void {
		if (lastDebug == null) {
			Dialog.showWarning("No AI completion debug dump is available yet.");
			return;
		}
		var text:String = Syntax.code("JSON.stringify({0}, null, 2)", lastDebug);
		if (text == null) text = Json.stringify(lastDebug);
		if (Electron != null && Electron.clipboard != null) {
			Electron.clipboard.writeText(text);
			setStatus(editor, "AI completion debug dump copied");
		} else {
			Dialog.showWarning("Electron clipboard is unavailable.");
		}
	}
	
	public static function complete(editor:AceWrap):Void {
		if (pending) {
			Dialog.showWarning("AI code completion request is already running.");
			return;
		}
		pending = true;
		setStatus(editor, "AI completion: requesting...");
		var handle = requestCompletion(editor, false, true, function(completion) {
			pending = false;
			insertCompletion(editor, completion);
			setStatus(editor, "AI completion inserted");
		}, function(errorText) {
			pending = false;
			setStatus(editor, "AI completion failed");
		});
		if (handle == null) {
			pending = false;
		}
	}
	
	public static function requestCompletion(
		editor:AceWrap,
		inlineSuggestion:Bool,
		showErrors:Bool,
		onSuccess:String->Void,
		onError:String->Void,
		?onDelta:String->Void
	):Null<AICompletionRequestHandle> {
		var cfg = readConfig(showErrors);
		if (cfg == null) return null;
		if (cfg.provider == "copilot") {
			return CopilotLanguageServer.requestCompletion(editor, inlineSuggestion, showErrors, onSuccess, onError);
		}
		var requestContextChars = inlineSuggestion ? cfg.inlineContextChars : cfg.maxContextChars;
		var requestMaxOutputTokens = inlineSuggestion ? cfg.inlineMaxOutputTokens : cfg.maxOutputTokens;
		var requestData = buildRequest(editor, cfg.model, requestContextChars, requestMaxOutputTokens, inlineSuggestion);
		var request = requestData.request;
		var requestLinePrefix = requestData.linePrefix;
		var isStreaming = inlineSuggestion && onDelta != null;
		if (isStreaming) Reflect.setField(request, "stream", true);
		var debug = cfg.debugEnabled ? createDebugRecord(editor, cfg, inlineSuggestion, showErrors, requestLinePrefix, requestContextChars, requestMaxOutputTokens, request, isStreaming, requestData.context) : null;
		debugEventFor(debug, "request-dispatch", null);
		var onText = function(rawText:String, isFinal:Bool) {
			var cleaned = cleanupCompletion(rawText);
			var completion = cleaned;
			if (inlineSuggestion) {
				completion = trimInlineExtraDeclarations(completion, requestLinePrefix);
			} else {
				completion = removeDuplicatedLinePrefix(completion, requestLinePrefix);
			}
			debugEventFor(debug, isFinal ? "text-final" : "text-delta", {
				rawText: rawText,
				cleanedText: cleaned,
				filteredText: completion,
			});
			if (isFinal) {
				if (completion == "") {
					var message = "AI completion returned empty text.";
					debugEventFor(debug, "error", { message: message });
					if (showErrors) Dialog.showWarning(message);
					onError(message);
					return;
				}
				debugEventFor(debug, "success", { completion: completion });
				onSuccess(completion);
			} else if (completion != "" && onDelta != null) {
				onDelta(completion);
			}
		};
		var onResponse = function(responseText:String) {
			var response:Dynamic;
			try {
				response = Json.parse(responseText);
			} catch (x:Dynamic) {
				var message = "AI completion returned invalid JSON:\n" + shorten(responseText, 1200);
				debugEventFor(debug, "error", { message: message, responseText: responseText });
				if (showErrors) Dialog.showError(message);
				onError(message);
				return;
			}
			debugEventFor(debug, "response-json", { response: response });
			onText(extractText(response), true);
		};
		var onRequestError = function(errorText:String) {
			var message = "AI completion failed:\n" + errorText;
			debugEventFor(debug, "error", { message: message });
			if (showErrors) Dialog.showError(message);
			onError(message);
		};
		if (isStreaming) {
			return postJsonStream(endpointUrl(cfg.baseUrl), cfg.apiKey, Json.stringify(request), function(text) {
				onText(text, false);
			}, function(text) {
				onText(text, true);
			}, onRequestError);
		} else {
			return postJson(endpointUrl(cfg.baseUrl), cfg.apiKey, Json.stringify(request), onResponse, onRequestError);
		}
	}
	
	static function getState(editor:AceWrap, create:Bool):AICodeCompletionState {
		var dyn:Dynamic = cast editor;
		var state:AICodeCompletionState = dyn.__aiCodeCompletion;
		if (state == null && create) {
			state = new AICodeCompletionState(editor);
			dyn.__aiCodeCompletion = state;
		}
		return state;
	}
	
	static function readConfig(showErrors:Bool):Null<AICompletionConfig> {
		var prefs = Preferences.current.aiCompletion;
		if (prefs == null || !prefs.enabled) {
			if (showErrors) Dialog.showWarning("AI code completion is disabled. Enable it in Preferences > Code editor > AI completion.");
			return null;
		}
		var provider = sanitizeProvider(Reflect.field(prefs, "provider"));
		var apiKey = prefs.apiKey != null ? prefs.apiKey.trim() : "";
		if (provider != "copilot" && apiKey == "") {
			if (showErrors) Dialog.showWarning("Set an AI API key in Preferences > Code editor > AI completion.");
			return null;
		}
		var baseUrl = prefs.baseUrl != null ? prefs.baseUrl.trim() : "";
		if (baseUrl == "") baseUrl = DEFAULT_BASE_URL;
		var model = prefs.model != null ? prefs.model.trim() : "";
		if (model == "") model = DEFAULT_MODEL;
		var maxOutputTokens = prefs.maxOutputTokens;
		if (maxOutputTokens <= 0) maxOutputTokens = 256;
		if (maxOutputTokens < 16) maxOutputTokens = 16;
		var inlineEagerness = sanitizeEagerness(Reflect.field(prefs, "inlineEagerness"));
		var inlineContextChars = sanitizeContextChars(prefs.inlineContextChars, 3000);
		var inlineMaxOutputTokens = sanitizeMaxOutputTokens(prefs.inlineMaxOutputTokens, 96);
		switch (inlineEagerness) {
			case "low":
				if (inlineContextChars > 2500) inlineContextChars = 2500;
				if (inlineMaxOutputTokens > 64) inlineMaxOutputTokens = 64;
			case "high":
				if (inlineContextChars < 5000) inlineContextChars = 5000;
				if (inlineMaxOutputTokens < 128) inlineMaxOutputTokens = 128;
			default:
		}
		return {
			provider: provider,
			apiKey: apiKey,
			baseUrl: baseUrl,
			model: model,
			maxContextChars: prefs.maxContextChars,
			maxOutputTokens: maxOutputTokens,
			inlineContextChars: inlineContextChars,
			inlineMaxOutputTokens: inlineMaxOutputTokens,
			inlineEagerness: inlineEagerness,
			debugEnabled: Reflect.field(prefs, "debugEnabled") == true,
		};
	}

	public static function sanitizeProvider(value:Dynamic):String {
		var text = value != null ? Std.string(value).toLowerCase().trim() : "";
		return switch (text) {
			case "copilot": "copilot";
			default: "openai";
		};
	}

	static function createDebugRecord(
		editor:AceWrap,
		cfg:AICompletionConfig,
		inlineSuggestion:Bool,
		showErrors:Bool,
		requestLinePrefix:String,
		requestContextChars:Int,
		requestMaxOutputTokens:Int,
		request:Dynamic,
		isStreaming:Bool,
		requestContext:Dynamic
	):Dynamic {
		var pos = editor.getCursorPosition();
		var line = editor.session.getLine(pos.row);
		var column = pos.column;
		if (column < 0) column = 0;
		if (column > line.length) column = line.length;
		var file = editor.session.gmlFile;
		var filePath:Dynamic = null;
		var fileName = "untitled";
		if (file != null) {
			fileName = file.name;
			filePath = Reflect.field(file, "path");
		}
		var debug:Dynamic = {
			id: ++debugSeq,
			createdAt: Date.now().toString(),
			startMs: Main.window.performance.now(),
			file: {
				name: fileName,
				path: filePath,
			},
			cursor: debugPos(pos),
			line: line,
			linePrefix: requestLinePrefix,
			lineSuffix: line.substring(column),
			selectedText: editor.getSelectedText(),
			mode: inlineSuggestion ? "inline" : "insert",
			showErrors: showErrors,
			streaming: isStreaming,
			config: {
				baseUrl: cfg.baseUrl,
				model: cfg.model,
				maxContextChars: cfg.maxContextChars,
				maxOutputTokens: cfg.maxOutputTokens,
				inlineContextChars: cfg.inlineContextChars,
				inlineMaxOutputTokens: cfg.inlineMaxOutputTokens,
				inlineEagerness: cfg.inlineEagerness,
				requestContextChars: requestContextChars,
				requestMaxOutputTokens: requestMaxOutputTokens,
				apiKey: "<redacted>",
			},
			requestContext: requestContext,
			request: request,
			events: [],
		};
		lastDebug = debug;
		debugEventFor(debug, "request-created", null);
		return debug;
	}

	static function debugEventFor(debug:Dynamic, name:String, data:Dynamic):Void {
		if (debug == null) return;
		var events:Dynamic = Reflect.field(debug, "events");
		if (!Std.is(events, Array)) return;
		var event:Dynamic = {
			name: name,
			elapsedMs: debugElapsed(debug),
		};
		if (data != null) Reflect.setField(event, "data", data);
		(cast events:Array<Dynamic>).push(event);
	}

	public static function debugEvent(name:String, ?data:Dynamic):Void {
		if (!isDebugEnabled() || lastDebug == null) return;
		debugEventFor(lastDebug, name, data);
	}

	static function isDebugEnabled():Bool {
		var prefs = Preferences.current.aiCompletion;
		return prefs != null && Reflect.field(prefs, "debugEnabled") == true;
	}

	static function debugElapsed(debug:Dynamic):Float {
		var start = Std.parseFloat(Std.string(Reflect.field(debug, "startMs")));
		if (Math.isNaN(start)) return 0;
		return Main.window.performance.now() - start;
	}

	public static function debugPos(pos:AcePos):Dynamic {
		return pos != null ? { row: pos.row, column: pos.column } : null;
	}

	public static function sanitizeEagerness(value:Dynamic):String {
		var text = value != null ? Std.string(value).toLowerCase().trim() : "";
		return switch (text) {
			case "low" | "high": text;
			default: "medium";
		};
	}

	static function sanitizeContextChars(value:Int, fallback:Int):Int {
		if (value <= 0) return fallback;
		if (value < 1000) return 1000;
		return value;
	}

	static function sanitizeMaxOutputTokens(value:Int, fallback:Int):Int {
		if (value <= 0) value = fallback;
		if (value < 16) value = 16;
		return value;
	}
	
	static function buildRequest(editor:AceWrap, model:String, maxContextChars:Int, maxOutputTokens:Int, inlineSuggestion:Bool):AICompletionPromptData {
		if (maxContextChars <= 0) maxContextChars = 12000;
		if (maxContextChars < 1000) maxContextChars = 1000;
		var openTabsContextBudget = getOpenCodeTabsContextBudget(maxContextChars, inlineSuggestion);
		var currentContextChars = maxContextChars - openTabsContextBudget;
		if (currentContextChars < 1000) {
			currentContextChars = maxContextChars;
			openTabsContextBudget = 0;
		}
		var code = editor.session.getValue();
		var pos = editor.getCursorPosition();
		var offset = posToOffset(code, pos);
		var beforeLen = Std.int(currentContextChars * (inlineSuggestion ? 0.82 : 0.7));
		var afterLen = currentContextChars - beforeLen;
		var beforeStart = offset - beforeLen;
		if (beforeStart < 0) beforeStart = 0;
		var afterEnd = offset + afterLen;
		if (afterEnd > code.length) afterEnd = code.length;
		var before = code.substring(beforeStart, offset);
		var after = code.substring(offset, afterEnd);
		var linePrefix = getCurrentLinePrefix(editor);
		var protectedSuffix = leadingNonEmptyLines(after, inlineSuggestion ? 8 : 4, inlineSuggestion ? 1200 : 600);
		var file = editor.session.gmlFile;
		var fileName = file != null ? file.name : "untitled";
		var selected = editor.getSelectedText();
		var openTabsContext = buildOpenCodeTabsContext(editor, openTabsContextBudget);
		var prompt = "Complete GameMaker Language code at <CURSOR/>.\n"
			+ "File: " + fileName + "\n"
			+ "Think of this as fill-in-the-middle: PREFIX is already before the cursor, PROTECTED_SUFFIX is already after the cursor.\n"
			+ "Return only the missing code to insert at <CURSOR/>. Never return PREFIX or PROTECTED_SUFFIX text.\n"
			+ "If PREFIX ends with a partially typed declaration or expression, return only the missing suffix after the cursor.\n"
			+ "Follow the surrounding code style. Do not put a statement on the same line after if/for/while. Use braces and put the statement on its own indented line, for example `if (condition) {\\n\\treturn value;\\n}` instead of `if (condition) return value;`.\n";
		if (openTabsContext.text != "") {
			prompt += "OPEN_CODE_TABS contains other open code tabs as read-only context. Use it for names, helpers, patterns, and related state, but the insertion target remains CURRENT_FILE.\n";
		}
		if (inlineSuggestion) {
			prompt += "This will be shown as an inline ghost suggestion. Prefer the shortest useful continuation; one line is best unless a small block is clearly needed.\n"
				+ "Complete only the current expression, statement, branch body, or function body. Never include following top-level/static members, functions, enums, macros, or code copied from PROTECTED_SUFFIX.\n"
				+ "If the cursor is in an `else` branch, fill only the branch-specific body. Do not move shared code from after the if/else into the branch.\n"
				+ "Do not close parent blocks or continue after the current block unless the user has just opened that block and the closing brace is part of the smallest useful completion.\n";
			if (protectedSuffix != "") {
				prompt += "The following lines already exist after the cursor and are forbidden to output verbatim:\n<FORBIDDEN_SUFFIX_LINES>\n" + protectedSuffix + "\n</FORBIDDEN_SUFFIX_LINES>\n";
			}
		}
		if (selected != null && selected != "") {
			prompt += "The editor currently has selected text; return replacement text for that selection if appropriate.\n";
		}
		if (openTabsContext.text != "") {
			prompt += "\n<OPEN_CODE_TABS>\n" + openTabsContext.text + "\n</OPEN_CODE_TABS>";
		}
		prompt += "\n<CURRENT_FILE>\n<PREFIX>\n" + before + "\n</PREFIX>\n<CURSOR/>\n<PROTECTED_SUFFIX>\n" + after + "\n</PROTECTED_SUFFIX>\n</CURRENT_FILE>";
		var request:Dynamic = {
			model: model,
			input: [
				{
					role: "system",
					content: "You are a fill-in-the-middle code completion engine for GameMaker Language (GML). Return only raw code that should be inserted at the cursor. Do not include markdown fences, prose, explanations, prefix text, suffix text, or surrounding unchanged code. Preserve the local code style and expand single-line control-flow bodies into braced multi-line blocks."
				},
				{ role: "user", content: prompt }
			],
			max_output_tokens: maxOutputTokens
		};
		return {
			request: request,
			context: {
				prefixChars: before.length,
				suffixChars: after.length,
				requestedContextChars: maxContextChars,
				currentFileContextChars: currentContextChars,
				openTabsChars: openTabsContext.chars,
				openTabsCount: openTabsContext.count,
				openTabsTruncated: openTabsContext.truncated,
				openTabsFiles: openTabsContext.files,
				linePrefix: linePrefix,
				protectedSuffix: protectedSuffix,
				prefixTruncated: beforeStart > 0,
				suffixTruncated: afterEnd < code.length,
			},
			linePrefix: linePrefix,
			protectedSuffix: protectedSuffix,
		};
	}

	static function getOpenCodeTabsContextBudget(maxContextChars:Int, inlineSuggestion:Bool):Int {
		var budget = Std.int(maxContextChars * (inlineSuggestion ? 0.18 : 0.25));
		if (budget < 300) return 0;
		var maxBudget = inlineSuggestion ? 2500 : 6000;
		return budget > maxBudget ? maxBudget : budget;
	}

	static function buildOpenCodeTabsContext(editor:AceWrap, maxChars:Int):AIOpenCodeTabsContext {
		var files:Array<Dynamic> = [];
		var empty:AIOpenCodeTabsContext = {
			text: "",
			count: 0,
			chars: 0,
			truncated: false,
			files: files,
		};
		if (maxChars <= 0 || ChromeTabs.impl == null) return empty;
		var tabEls = ChromeTabs.impl.tabEls;
		if (tabEls == null) return empty;
		var currentFile = editor.session.gmlFile;
		var items:Array<Dynamic> = [];
		var order = 0;
		for (tab in tabEls) {
			if (tab == null) continue;
			var file:Dynamic = tab.gmlFile;
			if (file == null || file == currentFile || Reflect.field(file, "codeEditor") == null) continue;
			var session:Dynamic = null;
			try {
				session = file.getAceSession();
			} catch (x:Dynamic) {}
			if (session == null) continue;
			var code:String = null;
			try {
				code = session.getValue();
			} catch (x:Dynamic) {}
			if (code == null || code.trim() == "") continue;
			var time = tab.gmlATime != null ? tab.gmlATime : 0;
			items.push({
				file: file,
				code: code,
				time: time,
				order: order++,
			});
		}
		items.sort(function(a:Dynamic, b:Dynamic):Int {
			if (a.time > b.time) return -1;
			if (a.time < b.time) return 1;
			if (a.order < b.order) return -1;
			if (a.order > b.order) return 1;
			return 0;
		});
		var blocks:Array<String> = [];
		var remaining = maxChars;
		var truncated = false;
		for (item in items) {
			if (remaining < 300) {
				truncated = true;
				break;
			}
			var file:Dynamic = item.file;
			var fileName = promptMeta(Reflect.field(file, "name"));
			var filePath = promptMeta(Reflect.field(file, "path"));
			var header = "<OPEN_TAB>\nName: " + fileName;
			if (filePath != "") header += "\nPath: " + filePath;
			header += "\nCode:\n";
			var footer = "\n</OPEN_TAB>\n";
			var codeBudget = remaining - header.length - footer.length;
			if (codeBudget < 200) {
				truncated = true;
				break;
			}
			var trimmed:Dynamic = trimOpenTabCode(item.code, codeBudget);
			var block = header + trimmed.text + footer;
			blocks.push(block);
			remaining -= block.length;
			files.push({
				name: fileName,
				path: filePath,
				chars: Std.string(trimmed.text).length,
				truncated: trimmed.truncated,
			});
			if (trimmed.truncated) truncated = true;
		}
		if (files.length < items.length) truncated = true;
		var text = blocks.join("\n");
		return {
			text: text,
			count: files.length,
			chars: text.length,
			truncated: truncated,
			files: files,
		};
	}

	static function trimOpenTabCode(code:String, maxChars:Int):Dynamic {
		code = normalizeNewlines(code);
		if (maxChars <= 0) return { text: "", truncated: code != "" };
		if (code.length <= maxChars) return { text: code, truncated: false };
		var marker = "\n/* ... open tab truncated ... */\n";
		if (maxChars <= marker.length + 2) {
			return { text: code.substring(0, maxChars), truncated: true };
		}
		var bodyChars = maxChars - marker.length;
		var headLen = Std.int(bodyChars * 0.65);
		var tailLen = bodyChars - headLen;
		return {
			text: code.substring(0, headLen) + marker + code.substring(code.length - tailLen),
			truncated: true,
		};
	}

	static function promptMeta(value:Dynamic):String {
		if (value == null) return "";
		return Std.string(value).replace("\r", " ").replace("\n", " ").trim();
	}
	
	static function postJson(url:String, apiKey:String, body:String, onSuccess:String->Void, onError:String->Void):AICompletionRequestHandle {
		var req:Dynamic = null;
		var done = false;
		function cancel():Void {
			if (done) return;
			done = true;
			if (req != null) try { req.destroy(); } catch (x:Dynamic) {}
		}
		try {
			var reqFn:Dynamic = Syntax.code("require");
			if (reqFn == null) {
				done = true;
				onError("Node require() is unavailable in this GMEdit window.");
				return { cancel: cancel };
			}
			var parsed:Dynamic = Syntax.code("new URL({0})", url);
			var protocol = Std.string(Reflect.field(parsed, "protocol"));
			var client:Dynamic = reqFn(protocol == "http:" ? "http" : "https");
			var headers:Dynamic = {};
			Reflect.setField(headers, "Content-Type", "application/json");
			Reflect.setField(headers, "Accept", "application/json");
			Reflect.setField(headers, "Authorization", "Bearer " + apiKey);
			Reflect.setField(headers, "Content-Length", Syntax.code("Buffer.byteLength({0})", body));
			var options:Dynamic = {};
			Reflect.setField(options, "method", "POST");
			Reflect.setField(options, "hostname", Reflect.field(parsed, "hostname"));
			var port = Std.string(Reflect.field(parsed, "port"));
			if (port != "") Reflect.setField(options, "port", port);
			Reflect.setField(options, "path", Std.string(Reflect.field(parsed, "pathname")) + Std.string(Reflect.field(parsed, "search")));
			Reflect.setField(options, "headers", headers);
			var chunks:Array<String> = [];
			req = client.request(options, function(res:Dynamic) {
				res.setEncoding("utf8");
				res.on("data", function(chunk:String) chunks.push(chunk));
				res.on("end", function() {
					if (done) return;
					done = true;
					var status:Null<Int> = Reflect.field(res, "statusCode");
					if (status == null) status = 0;
					var responseText = chunks.join("");
					if (status >= 200 && status < 300) {
						onSuccess(responseText);
					} else {
						onError("HTTP " + status + ": " + shorten(responseText, 1600));
					}
				});
			});
			req.on("error", function(err:Dynamic) {
				if (done) return;
				done = true;
				onError(Std.string(err));
			});
			req.write(body);
			req.end();
		} catch (x:Dynamic) {
			if (!done) {
				done = true;
				onError(Std.string(x));
			}
		}
		return { cancel: cancel };
	}

	static function postJsonStream(url:String, apiKey:String, body:String, onDelta:String->Void, onSuccess:String->Void, onError:String->Void):AICompletionRequestHandle {
		var req:Dynamic = null;
		var done = false;
		function cancel():Void {
			if (done) return;
			done = true;
			if (req != null) try { req.destroy(); } catch (x:Dynamic) {}
		}
		try {
			var reqFn:Dynamic = Syntax.code("require");
			if (reqFn == null) {
				done = true;
				onError("Node require() is unavailable in this GMEdit window.");
				return { cancel: cancel };
			}
			var parsed:Dynamic = Syntax.code("new URL({0})", url);
			var protocol = Std.string(Reflect.field(parsed, "protocol"));
			var client:Dynamic = reqFn(protocol == "http:" ? "http" : "https");
			var headers:Dynamic = {};
			Reflect.setField(headers, "Content-Type", "application/json");
			Reflect.setField(headers, "Accept", "text/event-stream");
			Reflect.setField(headers, "Authorization", "Bearer " + apiKey);
			Reflect.setField(headers, "Content-Length", Syntax.code("Buffer.byteLength({0})", body));
			var options:Dynamic = {};
			Reflect.setField(options, "method", "POST");
			Reflect.setField(options, "hostname", Reflect.field(parsed, "hostname"));
			var port = Std.string(Reflect.field(parsed, "port"));
			if (port != "") Reflect.setField(options, "port", port);
			Reflect.setField(options, "path", Std.string(Reflect.field(parsed, "pathname")) + Std.string(Reflect.field(parsed, "search")));
			Reflect.setField(options, "headers", headers);
			var streamedText = "";
			var eventBuffer = "";
			var errorChunks:Array<String> = [];
			function finish():Void {
				if (done) return;
				done = true;
				onSuccess(streamedText);
			}
			function fail(message:String):Void {
				if (done) return;
				done = true;
				onError(message);
			}
			function handleEvent(block:String):Void {
				var dataLines:Array<String> = [];
				for (line in block.split("\n")) {
					if (line.startsWith("data:")) dataLines.push(line.substring(5).trim());
				}
				if (dataLines.length == 0) return;
				var data = dataLines.join("\n");
				if (data == "[DONE]") {
					finish();
					return;
				}
				var event:Dynamic;
				try {
					event = Json.parse(data);
				} catch (x:Dynamic) {
					fail("Invalid streamed JSON:\n" + shorten(data, 1200));
					return;
				}
				var type = Std.string(Reflect.field(event, "type"));
				var delta:Dynamic = Reflect.field(event, "delta");
				if (delta != null && type.indexOf("delta") >= 0) {
					streamedText += Std.string(delta);
					onDelta(streamedText);
					return;
				}
				if (type == "response.output_text.done") {
					var text:Dynamic = Reflect.field(event, "text");
					if (text != null) streamedText = Std.string(text);
					return;
				}
				if (type == "response.completed") {
					finish();
					return;
				}
				if (type == "response.failed" || type == "error") {
					var err:Dynamic = Reflect.field(event, "error");
					fail(err != null ? Std.string(Reflect.field(err, "message")) : shorten(data, 1200));
				}
			}
			function pumpEvents(chunk:String):Void {
				eventBuffer += chunk;
				eventBuffer = eventBuffer.replace("\r\n", "\n").replace("\r", "\n");
				var sep = eventBuffer.indexOf("\n\n");
				while (sep >= 0) {
					var block = eventBuffer.substring(0, sep);
					eventBuffer = eventBuffer.substring(sep + 2);
					handleEvent(block);
					if (done) return;
					sep = eventBuffer.indexOf("\n\n");
				}
			}
			req = client.request(options, function(res:Dynamic) {
				res.setEncoding("utf8");
				var status:Null<Int> = Reflect.field(res, "statusCode");
				if (status == null) status = 0;
				var ok = status >= 200 && status < 300;
				res.on("data", function(chunk:String) {
					if (!ok) {
						errorChunks.push(chunk);
						return;
					}
					pumpEvents(chunk);
				});
				res.on("end", function() {
					if (!ok) {
						fail("HTTP " + status + ": " + shorten(errorChunks.join(""), 1600));
					} else {
						finish();
					}
				});
			});
			req.on("error", function(err:Dynamic) fail(Std.string(err)));
			req.write(body);
			req.end();
		} catch (x:Dynamic) {
			if (!done) {
				done = true;
				onError(Std.string(x));
			}
		}
		return { cancel: cancel };
	}
	
	static function extractText(response:Dynamic):String {
		var direct:Dynamic = Reflect.field(response, "output_text");
		if (direct != null) return Std.string(direct);
		var output:Dynamic = Reflect.field(response, "output");
		if (Std.is(output, Array)) {
			for (item in (output:Array<Dynamic>)) {
				var content:Dynamic = Reflect.field(item, "content");
				if (!Std.is(content, Array)) continue;
				for (part in (content:Array<Dynamic>)) {
					var text:Dynamic = Reflect.field(part, "text");
					if (text != null) return Std.string(text);
				}
			}
		}
		var choices:Dynamic = Reflect.field(response, "choices");
		if (Std.is(choices, Array)) {
			for (choice in (choices:Array<Dynamic>)) {
				var message:Dynamic = Reflect.field(choice, "message");
				if (message != null) {
					var messageText:Dynamic = Reflect.field(message, "content");
					if (messageText != null) return Std.string(messageText);
				}
				var choiceText:Dynamic = Reflect.field(choice, "text");
				if (choiceText != null) return Std.string(choiceText);
			}
		}
		return "";
	}
	
	static function cleanupCompletion(text:String):String {
		if (text == null) return "";
		var out = text.replace("\r\n", "\n").replace("\r", "\n");
		out = trimBlankLines(out);
		if (out.startsWith("```")) {
			var firstLine = out.indexOf("\n");
			if (firstLine >= 0) out = out.substring(firstLine + 1);
			var fence = out.lastIndexOf("```");
			if (fence >= 0) out = out.substring(0, fence);
		}
		return trimBlankLines(out);
	}

	static function getCurrentLinePrefix(editor:AceWrap):String {
		var pos = editor.getCursorPosition();
		var line = editor.session.getLine(pos.row);
		var column = pos.column;
		if (column < 0) column = 0;
		if (column > line.length) column = line.length;
		return line.substring(0, column);
	}

	public static function removeDuplicatedLinePrefix(completion:String, linePrefix:String):String {
		if (completion == null || completion == "") return "";
		if (linePrefix == null || linePrefix == "") return completion;
		if (linePrefix.startsWith(completion)) return "";
		var max = linePrefix.length;
		if (max > completion.length) max = completion.length;
		while (max > 0) {
			var start = linePrefix.length - max;
			var overlap = linePrefix.substring(start);
			if (completion.startsWith(overlap) && canTrimOverlap(linePrefix, start, overlap)) {
				return completion.substring(max);
			}
			max--;
		}
		return completion;
	}

	static function trimInlineExtraDeclarations(completion:String, linePrefix:String):String {
		if (completion == null || completion == "") return "";
		var text = completion.replace("\r\n", "\n").replace("\r", "\n");
		var block = trimToFirstControlBlock(text, linePrefix);
		if (block != null) return block;
		var depth = 0;
		var closedTopLevelBlock = false;
		var lineStart = 0;
		var lineIndex = 0;
		while (lineStart <= text.length) {
			var lineEnd = text.indexOf("\n", lineStart);
			if (lineEnd < 0) lineEnd = text.length;
			var line = text.substring(lineStart, lineEnd);
			if (lineIndex > 0 && closedTopLevelBlock && depth <= 0 && isTopLevelDeclarationLine(line)) {
				return trimBlankLines(text.substring(0, lineStart));
			}
			var i = 0;
			while (i < line.length) {
				var c = line.charCodeAt(i);
				if (c == "{".code) {
					depth++;
				} else if (c == "}".code) {
					if (depth > 0) depth--;
					if (depth <= 0) closedTopLevelBlock = true;
				}
				i++;
			}
			if (lineEnd >= text.length) break;
			lineStart = lineEnd + 1;
			lineIndex++;
		}
		return text;
	}

	static function trimToFirstControlBlock(text:String, linePrefix:String):String {
		if (!isControlBlockPrefix(linePrefix)) return null;
		var start = firstNonWhitespace(text);
		if (start < 0 || text.charCodeAt(start) != "{".code) return null;
		var end = findBalancedBlockEnd(text, start);
		if (end < 0) return null;
		return trimBlankLines(text.substring(0, end + 1));
	}

	static function isControlBlockPrefix(linePrefix:String):Bool {
		if (linePrefix == null) return false;
		var text = linePrefix.trim();
		if (text == "") return false;
		if (text == "else" || text.endsWith(" else")) return true;
		var rx = ~/^(if|for|while|switch|with)\s*\(.*\)$/;
		if (rx.match(text)) return true;
		return ~/^else\s+if\s*\(.*\)$/.match(text);
	}

	static function firstNonWhitespace(text:String):Int {
		var i = 0;
		while (i < text.length) {
			var c = text.charCodeAt(i);
			if (c != " ".code && c != "\t".code && c != "\n".code) return i;
			i++;
		}
		return -1;
	}

	static function findBalancedBlockEnd(text:String, start:Int):Int {
		var depth = 0;
		var inString = false;
		var stringQuote = 0;
		var escaped = false;
		var i = start;
		while (i < text.length) {
			var c = text.charCodeAt(i);
			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (c == "\\".code) {
					escaped = true;
				} else if (c == stringQuote) {
					inString = false;
				}
			} else if (c == "\"".code || c == "'".code) {
				inString = true;
				stringQuote = c;
			} else if (c == "{".code) {
				depth++;
			} else if (c == "}".code) {
				depth--;
				if (depth <= 0) return i;
			}
			i++;
		}
		return -1;
	}

	static function isTopLevelDeclarationLine(line:String):Bool {
		var text = line.trim();
		return text.startsWith("static ")
			|| text.startsWith("static\t")
			|| text.startsWith("function ")
			|| text.startsWith("function\t")
			|| text.startsWith("enum ")
			|| text.startsWith("enum\t")
			|| text.startsWith("#macro ")
			|| text.startsWith("#macro\t");
	}

	static function canTrimOverlap(linePrefix:String, start:Int, overlap:String):Bool {
		if (overlap == "") return false;
		var first = overlap.charCodeAt(0);
		if (!isIdentChar(first)) return true;
		if (overlap.length == 1) return false;
		return start == 0 || !isIdentChar(linePrefix.charCodeAt(start - 1));
	}

	public static function isIdentChar(c:Int):Bool {
		return (c >= "A".code && c <= "Z".code)
			|| (c >= "a".code && c <= "z".code)
			|| (c >= "0".code && c <= "9".code)
			|| c == "_".code;
	}
	
	static function trimBlankLines(text:String):String {
		var lines = text.split("\n");
		while (lines.length > 0 && lines[0].trim() == "") lines.shift();
		while (lines.length > 0 && lines[lines.length - 1].trim() == "") lines.pop();
		return lines.join("\n");
	}

	static function leadingNonEmptyLines(text:String, maxLines:Int, maxChars:Int):String {
		if (text == null || text == "" || maxLines <= 0 || maxChars <= 0) return "";
		var out:Array<String> = [];
		var chars = 0;
		for (line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")) {
			if (line.trim() == "") continue;
			var nextChars = chars + line.length + (out.length > 0 ? 1 : 0);
			if (nextChars > maxChars) break;
			out.push(line);
			chars = nextChars;
			if (out.length >= maxLines) break;
		}
		return out.join("\n");
	}
	
	static function endpointUrl(baseUrl:String):String {
		var out = baseUrl.trim();
		while (out.endsWith("/")) out = out.substring(0, out.length - 1);
		if (out.endsWith("/responses")) return out;
		return out + "/responses";
	}
	
	static function posToOffset(code:String, pos:AcePos):Int {
		var lines = code.split("\n");
		var offset = 0;
		var row = pos.row;
		if (row > lines.length) row = lines.length;
		for (i in 0...row) offset += lines[i].length + 1;
		var line = row < lines.length ? lines[row] : "";
		var col = pos.column;
		if (col < 0) col = 0;
		if (col > line.length) col = line.length;
		return offset + col;
	}

	static function insertCompletion(editor:AceWrap, text:String):Void {
		var start:AcePos;
		var range:AceRange;
		if (editor.selection.isEmpty()) {
			start = copyPos(editor.getCursorPosition());
			var linePrefix = editor.session.getLine(start.row).substring(0, start.column);
			var end = extendEndOverDuplicateAutoClosers(editor.session, start, start, text, linePrefix);
			range = AceRange.fromPair(start, end);
		} else {
			var selected = editor.getSelectionRange();
			start = copyPos(selected.start);
			range = AceRange.fromPair(selected.start, selected.end);
			editor.selection.clearSelection();
		}
		editor.session.doc.replace(range, text);
		editor.gotoPos(endPosAfterInsert(start, text));
	}

	public static function extendEndOverDuplicateAutoClosers(session:Dynamic, start:AcePos, end:AcePos, insertedText:String, openerText:String):AcePos {
		var out = copyPos(end);
		if (start.row != end.row || insertedText == null || insertedText == "") return out;
		var closers = unmatchedClosers(openerText);
		if (closers.length == 0) return out;
		while (closers.length > 0) {
			var closer = closers.pop();
			var closerText = String.fromCharCode(closer);
			if (insertedText.indexOf(closerText) < 0) continue;
			var line:String = session.getLine(out.row);
			if (out.column >= line.length || line.charCodeAt(out.column) != closer) break;
			out.column++;
		}
		return out;
	}

	static function unmatchedClosers(text:String):Array<Int> {
		var stack:Array<Int> = [];
		var inString = false;
		var stringQuote = 0;
		var escaped = false;
		var i = 0;
		while (text != null && i < text.length) {
			var c = text.charCodeAt(i);
			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (c == "\\".code) {
					escaped = true;
				} else if (c == stringQuote) {
					inString = false;
				}
				i++;
				continue;
			}
			if (c == "\"".code || c == "'".code) {
				inString = true;
				stringQuote = c;
			} else if (c == "(".code) {
				stack.push(")".code);
			} else if (c == "[".code) {
				stack.push("]".code);
			} else if (c == "{".code) {
				stack.push("}".code);
			} else if ((c == ")".code || c == "]".code || c == "}".code) && stack.length > 0 && stack[stack.length - 1] == c) {
				stack.pop();
			}
			i++;
		}
		return stack;
	}

	static function copyPos(pos:AcePos):AcePos {
		return new AcePos(pos.column, pos.row);
	}

	static function endPosAfterInsert(start:AcePos, text:String):AcePos {
		text = normalizeNewlines(text);
		var lines = text.split("\n");
		if (lines.length <= 1) return new AcePos(start.column + text.length, start.row);
		return new AcePos(lines[lines.length - 1].length, start.row + lines.length - 1);
	}

	static function normalizeNewlines(text:String):String {
		return text != null ? text.replace("\r\n", "\n").replace("\r", "\n") : "";
	}
	
	public static function setStatus(editor:AceWrap, message:String):Void {
		if (editor == null) return;
		var badge = ensureStatusBadge(editor);
		applyStatusBadgeOpacity(editor);
		applyStatusBadgeScrollbarOffset(editor);
		var timer:Null<Int> = Reflect.field(editor, "_aiStatusTimer");
		if (timer != null) {
			Main.window.clearTimeout(timer);
			Reflect.setField(editor, "_aiStatusTimer", null);
		}
		if (message == null || message == "") {
			badge.classList.remove("shown");
			badge.textContent = "";
			badge.title = "";
			return;
		}
		badge.textContent = message;
		badge.title = message;
		badge.classList.add("shown");
		Reflect.setField(editor, "_aiStatusTimer", Main.window.setTimeout(function() {
			badge.classList.remove("shown");
			Reflect.setField(editor, "_aiStatusTimer", null);
		}, 2500));
	}

	static function ensureStatusBadge(editor:AceWrap):DivElement {
		var badge:DivElement = cast Reflect.field(editor, "_aiStatusBadge");
		bindStatusBadgeLayout(editor);
		if (badge != null && badge.parentElement != null) return badge;
		badge = Main.document.createDivElement();
		badge.className = "ace_ai-status";
		var parent = editor.container.parentElement;
		(parent != null ? parent : Main.document.body).appendChild(badge);
		Reflect.setField(editor, "_aiStatusBadge", badge);
		return badge;
	}

	static function bindStatusBadgeLayout(editor:AceWrap):Void {
		if (Reflect.field(editor, "_aiStatusLayoutBound") == true) return;
		Reflect.setField(editor, "_aiStatusLayoutBound", true);
		untyped editor.renderer.on("scrollbarVisibilityChanged", function(_) {
			applyStatusBadgeScrollbarOffset(editor);
		});
	}

	static function applyStatusBadgeScrollbarOffset(editor:AceWrap):Void {
		var renderer:Dynamic = editor.renderer;
		var scrollBarH:Dynamic = Reflect.field(renderer, "scrollBarH");
		var height:Float = 0;
		if (scrollBarH != null) {
			var getHeight:Dynamic = Reflect.field(scrollBarH, "getHeight");
			if (getHeight != null) {
				var value:Dynamic = Reflect.callMethod(scrollBarH, getHeight, []);
				if (value != null) height = value;
			}
		}
		var offset = height > 0 ? Math.ceil((height + 6) / 2) : 0;
		var value = offset + "px";
		Main.document.documentElement.style.setProperty("--ai-status-scrollbar-offset", value);
		var badge:DivElement = cast Reflect.field(editor, "_aiStatusBadge");
		if (badge != null) badge.style.setProperty("--ai-status-scrollbar-offset", value);
	}

	public static function sanitizeStatusBadgeOpacity(value:Dynamic):Int {
		var opacity = value != null ? Std.parseInt(Std.string(value)) : null;
		if (opacity == null) opacity = 80;
		if (opacity < 0) return 0;
		if (opacity > 100) return 100;
		return opacity;
	}

	public static function applyStatusBadgeOpacity(?editor:AceWrap):Void {
		var prefs = Preferences.current != null ? Preferences.current.aiCompletion : null;
		var opacity = sanitizeStatusBadgeOpacity(prefs != null ? Reflect.field(prefs, "statusBadgeOpacityPercent") : null) / 100;
		var value = Std.string(opacity);
		Main.document.documentElement.style.setProperty("--ai-status-opacity", value);
		if (editor == null) return;
		var badge:DivElement = cast Reflect.field(editor, "_aiStatusBadge");
		if (badge != null) badge.style.setProperty("--ai-status-opacity", value);
	}
	
	public static function shorten(text:String, maxLen:Int):String {
		if (text == null) return "";
		if (text.length <= maxLen) return text;
		return text.substring(0, maxLen) + "...";
	}
}

class AICodeCompletionState {
	var editor:AceWrap;
	var bound:Bool = false;
	var timerId:Null<Int> = null;
	var requestId:Int = 0;
	var activeRequest:AICompletionRequestHandle = null;
	var ghost:DivElement = null;
	var suggestion:AIInlineSuggestion = null;
	var widget:Dynamic = null;
	var widgetSession:Dynamic = null;
	var suppressSelectionHide:Bool = false;
	var skipNextInsertAdvance:Bool = false;
	
	public function new(editor:AceWrap) {
		this.editor = editor;
	}
	
	public function bind():Void {
		if (bound) return;
		bound = true;
		editor.commands.on("afterExec", onAfterExec);
		editor.on("changeSelection", function(_) {
			if (suppressSelectionHide) return;
			if (suggestion != null) {
				if (!samePos(editor.getCursorPosition(), suggestion.replaceEnd)) {
					if (rebaseCurrentSuggestionToCursor()) {
						skipNextInsertAdvance = true;
					} else {
						hide(true, "cursor-moved");
					}
				}
			} else if (activeRequest != null) {
				hide(true, "cursor-moved-before-response");
			}
		});
		editor.on("changeSession", function(_) hide(true, "session-changed"));
		editor.on("blur", function(_) hide(true, "blur"));
		untyped editor.renderer.on("afterRender", function() syncGhostPosition());
	}
	
	public function hasSuggestion():Bool {
		return suggestion != null && suggestion.displayText != "";
	}
	
	public function accept():Bool {
		if (!isSuggestionCurrent()) {
			hide(true, "accept-stale");
			return false;
		}
		var current = suggestion;
		AICodeCompletion.debugEvent("inline-accept", {
			replaceStart: AICodeCompletion.debugPos(current.replaceStart),
			replaceEnd: AICodeCompletion.debugPos(current.replaceEnd),
			insertText: current.insertText,
			displayText: current.displayText,
		});
		hide(false, "accept");
		replaceRange(current.replaceStart, current.replaceEnd, current.insertText);
		AICodeCompletion.setStatus(editor, "AI inline completion accepted");
		return true;
	}

	public function acceptPart(mode:String):Bool {
		if (!isSuggestionCurrent()) {
			hide(true, "accept-part-stale");
			return false;
		}
		var part = mode == "line" ? nextLinePart(suggestion.displayText) : nextWordPart(suggestion.displayText);
		if (part == "") return false;
		var current = suggestion;
		var currentRange = AceRange.fromPair(current.replaceStart, current.replaceEnd);
		var typedText = editor.session.getTextRange(currentRange);
		if (!current.insertText.startsWith(typedText)) {
			AICodeCompletion.debugEvent("inline-accept-part-mismatch", {
				mode: mode,
				typedText: typedText,
				insertText: current.insertText,
			});
			hide(true, "accept-part-mismatch");
			return false;
		}
		var replacement = typedText + part;
		if (!current.insertText.startsWith(replacement)) replacement = current.insertText;
		var linePrefix = editor.session.getLine(current.replaceEnd.row).substring(0, current.replaceEnd.column);
		var replaceEnd = AICodeCompletion.extendEndOverDuplicateAutoClosers(editor.session, current.replaceStart, current.replaceEnd, replacement, linePrefix);
		currentRange = AceRange.fromPair(current.replaceStart, replaceEnd);
		var newEnd = endPosAfterInsert(current.replaceStart, replacement);
		suppressSelectionHide = true;
		editor.session.doc.replace(currentRange, replacement);
		editor.gotoPos(newEnd);
		suppressSelectionHide = false;
		current.replaceEnd = copyPos(newEnd);
		current.displayText = current.insertText.substring(replacement.length);
		AICodeCompletion.debugEvent("inline-accept-part", {
			mode: mode,
			part: part,
			replacement: replacement,
			replaceStart: AICodeCompletion.debugPos(current.replaceStart),
			replaceEnd: AICodeCompletion.debugPos(current.replaceEnd),
			displayText: current.displayText,
		});
		if (current.displayText == "") {
			hide(false, "accept-part-complete");
		} else {
			suggestion = current;
			renderSuggestion();
		}
		AICodeCompletion.setStatus(editor, "AI inline completion partially accepted");
		return true;
	}
	
	public function request(explicit:Bool):Void {
		clearTimer();
		hide(true, "new-request");
		if (!explicit && !canAutoRequest()) return;
		if (explicit && editor.completer != null && Reflect.field(editor.completer, "activated") == true) return;
		if (!editor.selection.isEmpty()) return;
		var session = editor.session;
		var pos = copyPos(editor.getCursorPosition());
		var id = ++requestId;
		if (!explicit) AICodeCompletion.setStatus(editor, "AI inline completion: requesting...");
		function isCurrent():Bool {
			if (id != requestId || editor.session != session) return false;
			if (samePos(editor.getCursorPosition(), pos)) return true;
			return suggestion != null && suggestion.session == session && samePos(editor.getCursorPosition(), suggestion.replaceEnd);
		}
		var handle = AICodeCompletion.requestCompletion(editor, true, explicit, function(completion) {
			if (!isCurrent()) return;
			activeRequest = null;
			if (show(completion, pos, session)) AICodeCompletion.setStatus(editor, "AI inline completion ready");
		}, function(errorText) {
			if (id != requestId) return;
			activeRequest = null;
			AICodeCompletion.setStatus(editor, "AI inline completion failed");
			if (!explicit) untyped console.warn(errorText);
		}, function(completion) {
			if (!isCurrent()) return;
			if (show(completion, pos, session)) AICodeCompletion.setStatus(editor, "AI inline completion streaming...");
		});
		if (handle == null) {
			if (!explicit) AICodeCompletion.setStatus(editor, "");
		} else {
			activeRequest = handle;
		}
	}
	
	public function hide(invalidate:Bool = true, reason:String = "hide"):Void {
		clearTimer();
		skipNextInsertAdvance = false;
		if (suggestion != null || activeRequest != null) {
			AICodeCompletion.debugEvent("inline-hide", {
				reason: reason,
				invalidate: invalidate,
				hasSuggestion: suggestion != null,
				cursor: AICodeCompletion.debugPos(editor.getCursorPosition()),
				replaceEnd: suggestion != null ? AICodeCompletion.debugPos(suggestion.replaceEnd) : null,
			});
		}
		if (invalidate) {
			requestId++;
			cancelActiveRequest();
		}
		suggestion = null;
		clearRender();
	}

	function cancelActiveRequest():Void {
		var req = activeRequest;
		if (req == null) return;
		activeRequest = null;
		req.cancel();
	}

	function clearRender():Void {
		if (ghost != null) {
			if (ghost.parentElement != null) ghost.parentElement.removeChild(ghost);
			ghost = null;
		}
		removeWidget();
	}
	
	function onAfterExec(e:Dynamic):Void {
		var name = e.command != null ? e.command.name : "";
		if (name == "acceptAICompletion" || name == "acceptAICompletionWord" || name == "acceptAICompletionLine" || name == "hideAICompletion") return;
		if (name == "insertstring") {
			if (skipNextInsertAdvance) {
				skipNextInsertAdvance = false;
				return;
			}
			var text = e.args != null ? Std.string(e.args) : "";
			if (advanceSuggestion(text)) return;
			hide(true, "typed-mismatch");
			schedule();
		} else if (name == "backspace" || name == "del" || name == "indent") {
			hide(true, name);
			schedule();
		} else if (hasSuggestion()) {
			hide(true, "command-" + name);
		}
	}
	
	function schedule():Void {
		clearTimer();
		if (!canAutoRequest()) return;
		var delay = inlineDelay();
		timerId = Main.window.setTimeout(function() {
			timerId = null;
			request(false);
		}, delay);
	}
	
	function clearTimer():Void {
		if (timerId != null) {
			Main.window.clearTimeout(timerId);
			timerId = null;
		}
	}
	
	function canAutoRequest():Bool {
		var prefs = Preferences.current.aiCompletion;
		if (prefs == null || !prefs.enabled || !prefs.inlineEnabled) return false;
		if (AICodeCompletion.sanitizeProvider(Reflect.field(prefs, "provider")) != "copilot" && (prefs.apiKey == null || prefs.apiKey.trim() == "")) return false;
		if (!editor.selection.isEmpty()) return false;
		if (editor.completer != null && Reflect.field(editor.completer, "activated") == true) return false;
		return true;
	}

	function inlineDelay():Int {
		var prefs = Preferences.current.aiCompletion;
		var delay = prefs.inlineDelayMs;
		var eagerness = AICodeCompletion.sanitizeEagerness(Reflect.field(prefs, "inlineEagerness"));
		switch (eagerness) {
			case "low":
				if (delay < 1200) delay = 1200;
			case "high":
				if (delay > 400) delay = 400;
				if (delay < 150) delay = 150;
			default:
				if (delay < 250) delay = 250;
		}
		return delay;
	}
	
	function show(text:String, pos:AcePos, session:Dynamic):Bool {
		var next = makeSuggestion(text, pos, session);
		if (next == null) return false;
		if (!rebaseSuggestionToCursor(next)) return false;
		suggestion = next;
		AICodeCompletion.debugEvent("inline-show", {
			rawText: text,
			replaceStart: AICodeCompletion.debugPos(next.replaceStart),
			replaceEnd: AICodeCompletion.debugPos(next.replaceEnd),
			insertText: next.insertText,
			displayText: next.displayText,
		});
		renderSuggestion();
		return true;
	}

	function rebaseSuggestionToCursor(next:AIInlineSuggestion):Bool {
		if (editor.session != next.session) return false;
		var cursor = editor.getCursorPosition();
		if (samePos(cursor, next.replaceEnd)) return true;
		var typedText = editor.session.getTextRange(AceRange.fromPair(next.replaceStart, cursor));
		if (!next.insertText.startsWith(typedText)) {
			AICodeCompletion.debugEvent("inline-rebase-failed", {
				typedText: typedText,
				insertText: next.insertText,
				cursor: AICodeCompletion.debugPos(cursor),
			});
			return false;
		}
		next.replaceEnd = copyPos(cursor);
		next.displayText = next.insertText.substring(typedText.length);
		return true;
	}

	function rebaseCurrentSuggestionToCursor():Bool {
		if (suggestion == null || editor.session != suggestion.session) return false;
		var cursor = editor.getCursorPosition();
		if (!isForwardPos(suggestion.replaceEnd, cursor)) return false;
		var typedText = editor.session.getTextRange(AceRange.fromPair(suggestion.replaceStart, cursor));
		if (!suggestion.insertText.startsWith(typedText)) return false;
		suggestion.replaceEnd = copyPos(cursor);
		suggestion.displayText = suggestion.insertText.substring(typedText.length);
		AICodeCompletion.debugEvent("inline-rebase-current", {
			typedText: typedText,
			cursor: AICodeCompletion.debugPos(cursor),
			displayText: suggestion.displayText,
		});
		if (suggestion.displayText == "") {
			clearRender();
		} else {
			renderSuggestion();
		}
		return true;
	}

	function renderSuggestion():Void {
		clearRender();
		if (!hasSuggestion()) return;
		ghost = Main.document.createDivElement();
		ghost.className = "ai-code-ghost";
		ghost.style.position = "fixed";
		ghost.style.left = "0";
		ghost.style.top = "0";
		ghost.style.zIndex = "1000";
		ghost.style.pointerEvents = "none";
		ghost.style.color = "rgba(128, 128, 128, 0.72)";
		ghost.style.whiteSpace = "pre";
		ghost.style.overflow = "hidden";
		var content:Element = editor.container.querySelector(".ace_content");
		var style:Dynamic = Main.window.getComputedStyle(content != null ? content : editor.container);
		ghost.style.fontFamily = style.fontFamily;
		ghost.style.fontSize = style.fontSize;
		ghost.style.fontWeight = style.fontWeight;
		ghost.style.letterSpacing = style.letterSpacing;
		Main.document.body.appendChild(ghost);
		showWidget(suggestion.displayText, suggestion.replaceEnd, suggestion.session, style);
		syncGhostPosition();
	}

	function makeSuggestion(text:String, pos:AcePos, session:Dynamic):AIInlineSuggestion {
		text = normalizeNewlines(text);
		if (text == null || text == "") return null;
		var line = session.getLine(pos.row);
		var column = pos.column;
		if (column < 0) column = 0;
		if (column > line.length) column = line.length;
		var linePrefix = line.substring(0, column);
		var candidates = replacementCandidates(linePrefix);
		for (candidate in candidates) {
			if (candidate.prefix == "") continue;
			if (!text.startsWith(candidate.prefix)) continue;
			var displayText = text.substring(candidate.prefix.length);
			if (displayText == "") return null;
			return {
				replaceStart: new AcePos(candidate.start, pos.row),
				replaceEnd: copyPos(pos),
				insertText: text,
				displayText: displayText,
				session: session,
			};
		}
		var suffix = AICodeCompletion.removeDuplicatedLinePrefix(text, linePrefix);
		if (suffix == "") return null;
		return {
			replaceStart: copyPos(pos),
			replaceEnd: copyPos(pos),
			insertText: suffix,
			displayText: suffix,
			session: session,
		};
	}

	function replacementCandidates(linePrefix:String):Array<{ start:Int, prefix:String }> {
		var out:Array<{ start:Int, prefix:String }> = [];
		function add(start:Int):Void {
			if (start < 0) start = 0;
			if (start > linePrefix.length) start = linePrefix.length;
			var prefix = linePrefix.substring(start);
			if (prefix == "") return;
			for (candidate in out) if (candidate.start == start || candidate.prefix == prefix) return;
			out.push({ start: start, prefix: prefix });
		}
		add(statementStart(linePrefix));
		add(tokenStart(linePrefix));
		return out;
	}

	function statementStart(linePrefix:String):Int {
		var start = 0;
		var i = 0;
		while (i < linePrefix.length) {
			var c = linePrefix.charCodeAt(i);
			if (c == ";".code || c == "{".code || c == "}".code) start = i + 1;
			i++;
		}
		while (start < linePrefix.length) {
			var c = linePrefix.charCodeAt(start);
			if (c != " ".code && c != "\t".code) break;
			start++;
		}
		return start;
	}

	function tokenStart(linePrefix:String):Int {
		var start = linePrefix.length;
		while (start > 0 && AICodeCompletion.isIdentChar(linePrefix.charCodeAt(start - 1))) start--;
		return start;
	}

	function advanceSuggestion(text:String):Bool {
		if (!isSuggestionAtCursor()) return false;
		text = normalizeNewlines(text);
		if (text == "" || !suggestion.displayText.startsWith(text)) {
			AICodeCompletion.debugEvent("inline-advance-failed", {
				text: text,
				displayText: suggestion.displayText,
			});
			return false;
		}
		suggestion.replaceEnd = copyPos(editor.getCursorPosition());
		suggestion.displayText = suggestion.displayText.substring(text.length);
		AICodeCompletion.debugEvent("inline-advance", {
			text: text,
			replaceEnd: AICodeCompletion.debugPos(suggestion.replaceEnd),
			displayText: suggestion.displayText,
		});
		if (suggestion.displayText == "") {
			clearRender();
		} else {
			renderSuggestion();
		}
		return true;
	}

	function isSuggestionAtCursor():Bool {
		return suggestion != null && editor.session == suggestion.session && samePos(editor.getCursorPosition(), suggestion.replaceEnd);
	}

	function isSuggestionCurrent():Bool {
		return hasSuggestion() && isSuggestionAtCursor();
	}

	function replaceRange(start:AcePos, end:AcePos, text:String):Void {
		var linePrefix = start.row == end.row ? editor.session.getLine(end.row).substring(0, end.column) : "";
		end = AICodeCompletion.extendEndOverDuplicateAutoClosers(editor.session, start, end, text, linePrefix);
		editor.session.doc.replace(AceRange.fromPair(start, end), text);
		editor.gotoPos(endPosAfterInsert(start, text));
	}

	function endPosAfterInsert(start:AcePos, text:String):AcePos {
		text = normalizeNewlines(text);
		var lines = text.split("\n");
		if (lines.length <= 1) return new AcePos(start.column + text.length, start.row);
		return new AcePos(lines[lines.length - 1].length, start.row + lines.length - 1);
	}

	function nextLinePart(text:String):String {
		var index = text.indexOf("\n");
		return index >= 0 ? text.substring(0, index + 1) : text;
	}

	function nextWordPart(text:String):String {
		if (text == "") return "";
		var i = 0;
		while (i < text.length) {
			var c = text.charCodeAt(i);
			if (c == "\n".code) return i == 0 ? "\n" : text.substring(0, i);
			if (c != " ".code && c != "\t".code) break;
			i++;
		}
		if (i >= text.length) return text;
		var c = text.charCodeAt(i);
		if (AICodeCompletion.isIdentChar(c)) {
			while (i < text.length && AICodeCompletion.isIdentChar(text.charCodeAt(i))) i++;
		} else {
			i++;
		}
		return text.substring(0, i);
	}

	function normalizeNewlines(text:String):String {
		return text != null ? text.replace("\r\n", "\n").replace("\r", "\n") : "";
	}

	function showWidget(text:String, pos:AcePos, session:Dynamic, style:Dynamic):Void {
		var tail = tailGhostLines(text);
		if (tail.length == 0) return;
		var lineHeight = editor.renderer.lineHeight;
		var padding:Dynamic = Reflect.field(Reflect.field(editor.renderer, "layerConfig"), "padding");
		if (padding == null) padding = 0;
		var el = Main.document.createDivElement();
		el.className = "ai-code-ghost-widget";
		el.style.pointerEvents = "none";
		el.style.color = "rgba(128, 128, 128, 0.72)";
		el.style.whiteSpace = "pre";
		el.style.overflow = "hidden";
		el.style.fontFamily = style.fontFamily;
		el.style.fontSize = style.fontSize;
		el.style.fontWeight = style.fontWeight;
		el.style.letterSpacing = style.letterSpacing;
		el.style.height = (tail.length * lineHeight) + "px";
		el.style.lineHeight = lineHeight + "px";
		el.style.paddingLeft = padding + "px";
		for (line in tail) {
			var lineEl = Main.document.createDivElement();
			lineEl.className = "ai-code-ghost-widget-line";
			lineEl.style.height = lineHeight + "px";
			lineEl.style.lineHeight = lineHeight + "px";
			lineEl.style.whiteSpace = "pre";
			lineEl.textContent = line == "" ? " " : line;
			el.appendChild(lineEl);
		}
		var manager = ensureWidgetManager(session);
		if (manager == null) return;
		widgetSession = session;
		widget = {
			row: pos.row,
			fixedWidth: false,
			coverGutter: false,
			el: el,
			type: "aiCodeGhost",
			pixelHeight: tail.length * lineHeight,
			rowCount: tail.length,
		};
		manager.addLineWidget(widget);
	}

	function removeWidget():Void {
		if (widget == null) return;
		var manager:Dynamic = widgetSession != null ? Reflect.field(widgetSession, "widgetManager") : null;
		if (manager != null) manager.removeLineWidget(widget);
		widget = null;
		widgetSession = null;
	}

	function ensureWidgetManager(session:Dynamic):Dynamic {
		var manager:Dynamic = Reflect.field(session, "widgetManager");
		if (manager != null) {
			manager.attach(editor);
			return manager;
		}
		var module:Dynamic = AceWrap.require("ace/line_widgets");
		var lineWidgets:Dynamic = Reflect.field(module, "LineWidgets");
		if (lineWidgets == null) return null;
		manager = Syntax.code("new {0}({1})", lineWidgets, session);
		manager.attach(editor);
		return manager;
	}
	
	function syncGhostPosition():Void {
		if (!hasSuggestion() || ghost == null) return;
		if (editor.session != suggestion.session || !samePos(editor.getCursorPosition(), suggestion.replaceEnd)) {
			hide();
			return;
		}
		while (ghost.firstChild != null) ghost.removeChild(ghost.firstChild);
		var line = firstGhostLine(suggestion.displayText);
		var cursor = editor.renderer.textToScreenCoordinates(suggestion.replaceEnd.row, suggestion.replaceEnd.column);
		var rect = editor.container.getBoundingClientRect();
		var lineHeight = editor.renderer.lineHeight;
		var top = cursor.pageY;
		if (top + lineHeight < rect.top || top > rect.bottom) return;
		var lineEl = Main.document.createDivElement();
		lineEl.className = "ai-code-ghost-line";
		lineEl.style.position = "fixed";
		lineEl.style.left = cursor.pageX + "px";
		lineEl.style.top = top + "px";
		lineEl.style.height = lineHeight + "px";
		lineEl.style.lineHeight = lineHeight + "px";
		lineEl.style.whiteSpace = "pre";
		lineEl.textContent = line == "" ? " " : line;
		ghost.appendChild(lineEl);
	}

	function firstGhostLine(text:String):String {
		var first = text.split("\n")[0];
		return first != null ? first : "";
	}

	function tailGhostLines(text:String):Array<String> {
		var lines = text.split("\n");
		if (lines.length <= 1) return [];
		return lines.slice(1);
	}
	
	function copyPos(pos:AcePos):AcePos {
		return new AcePos(pos.column, pos.row);
	}
	
	function samePos(a:AcePos, b:AcePos):Bool {
		return a != null && b != null && a.row == b.row && a.column == b.column;
	}

	function isForwardPos(from:AcePos, to:AcePos):Bool {
		return from != null && to != null && (to.row > from.row || (to.row == from.row && to.column >= from.column));
	}
}
