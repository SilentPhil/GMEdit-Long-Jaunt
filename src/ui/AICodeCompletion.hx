package ui;

import ace.AceWrap;
import ace.extern.AcePos;
import electron.Dialog;
import haxe.Json;
import js.Syntax;
import js.html.DivElement;
import js.html.Element;
import ui.Preferences;
using StringTools;

typedef AICompletionConfig = {
	apiKey:String,
	baseUrl:String,
	model:String,
	maxContextChars:Int,
	maxOutputTokens:Int,
	inlineContextChars:Int,
	inlineMaxOutputTokens:Int,
}

class AICodeCompletion {
	static var pending:Bool = false;
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
	
	public static function hideInline(editor:AceWrap):Bool {
		var state = getState(editor, false);
		if (state == null || !state.hasSuggestion()) return false;
		state.hide();
		return true;
	}
	
	public static function complete(editor:AceWrap):Void {
		if (pending) {
			Dialog.showWarning("AI code completion request is already running.");
			return;
		}
		pending = true;
		setStatus(editor, "AI completion: requesting...");
		if (!requestCompletion(editor, false, true, function(completion) {
			pending = false;
			editor.insert(completion);
			setStatus(editor, "AI completion inserted");
		}, function(errorText) {
			pending = false;
			setStatus(editor, "AI completion failed");
		})) {
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
	):Bool {
		var cfg = readConfig(showErrors);
		if (cfg == null) return false;
		var requestLinePrefix = getCurrentLinePrefix(editor);
		var requestContextChars = inlineSuggestion ? cfg.inlineContextChars : cfg.maxContextChars;
		var requestMaxOutputTokens = inlineSuggestion ? cfg.inlineMaxOutputTokens : cfg.maxOutputTokens;
		var request = buildRequest(editor, cfg.model, requestContextChars, requestMaxOutputTokens, inlineSuggestion);
		var isStreaming = inlineSuggestion && onDelta != null;
		if (isStreaming) Reflect.setField(request, "stream", true);
		var onText = function(rawText:String, isFinal:Bool) {
			var completion = cleanupCompletion(rawText);
			completion = removeDuplicatedLinePrefix(completion, requestLinePrefix);
			if (isFinal) {
				if (completion == "") {
					var message = "AI completion returned empty text.";
					if (showErrors) Dialog.showWarning(message);
					onError(message);
					return;
				}
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
				if (showErrors) Dialog.showError(message);
				onError(message);
				return;
			}
			onText(extractText(response), true);
		};
		var onRequestError = function(errorText:String) {
			var message = "AI completion failed:\n" + errorText;
			if (showErrors) Dialog.showError(message);
			onError(message);
		};
		if (isStreaming) {
			postJsonStream(endpointUrl(cfg.baseUrl), cfg.apiKey, Json.stringify(request), function(text) {
				onText(text, false);
			}, function(text) {
				onText(text, true);
			}, onRequestError);
		} else {
			postJson(endpointUrl(cfg.baseUrl), cfg.apiKey, Json.stringify(request), onResponse, onRequestError);
		}
		return true;
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
		var apiKey = prefs.apiKey != null ? prefs.apiKey.trim() : "";
		if (apiKey == "") {
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
		return {
			apiKey: apiKey,
			baseUrl: baseUrl,
			model: model,
			maxContextChars: prefs.maxContextChars,
			maxOutputTokens: maxOutputTokens,
			inlineContextChars: sanitizeContextChars(prefs.inlineContextChars, 3000),
			inlineMaxOutputTokens: sanitizeMaxOutputTokens(prefs.inlineMaxOutputTokens, 96),
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
	
	static function buildRequest(editor:AceWrap, model:String, maxContextChars:Int, maxOutputTokens:Int, inlineSuggestion:Bool):Dynamic {
		if (maxContextChars <= 0) maxContextChars = 12000;
		if (maxContextChars < 1000) maxContextChars = 1000;
		var code = editor.session.getValue();
		var pos = editor.getCursorPosition();
		var offset = posToOffset(code, pos);
		var beforeLen = Std.int(maxContextChars * 0.7);
		var afterLen = maxContextChars - beforeLen;
		var beforeStart = offset - beforeLen;
		if (beforeStart < 0) beforeStart = 0;
		var afterEnd = offset + afterLen;
		if (afterEnd > code.length) afterEnd = code.length;
		var before = code.substring(beforeStart, offset);
		var after = code.substring(offset, afterEnd);
		var file = editor.session.gmlFile;
		var fileName = file != null ? file.name : "untitled";
		var selected = editor.getSelectedText();
		var prompt = "Complete GameMaker Language code at the cursor.\n"
			+ "File: " + fileName + "\n"
			+ "Return only the code to insert at the cursor. Do not repeat code from BEFORE or AFTER.\n"
			+ "If BEFORE ends with a partially typed declaration or expression, return only the missing suffix after the cursor.\n";
		if (inlineSuggestion) {
			prompt += "This will be shown as an inline ghost suggestion. Prefer the shortest useful continuation; one line is best unless a small block is clearly needed.\n";
		}
		if (selected != null && selected != "") {
			prompt += "The editor currently has selected text; return replacement text for that selection if appropriate.\n";
		}
		prompt += "\n<BEFORE>\n" + before + "\n</BEFORE>\n<CURSOR/>\n<AFTER>\n" + after + "\n</AFTER>";
		return {
			model: model,
			input: [
				{
					role: "system",
					content: "You are a code completion engine for GameMaker Language (GML). Return only raw code that should be inserted at the cursor. Do not include markdown fences, prose, explanations, or surrounding unchanged code."
				},
				{ role: "user", content: prompt }
			],
			max_output_tokens: maxOutputTokens
		};
	}
	
	static function postJson(url:String, apiKey:String, body:String, onSuccess:String->Void, onError:String->Void):Void {
		try {
			var reqFn:Dynamic = Syntax.code("require");
			if (reqFn == null) {
				onError("Node require() is unavailable in this GMEdit window.");
				return;
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
			var req:Dynamic = client.request(options, function(res:Dynamic) {
				res.setEncoding("utf8");
				res.on("data", function(chunk:String) chunks.push(chunk));
				res.on("end", function() {
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
			req.on("error", function(err:Dynamic) onError(Std.string(err)));
			req.write(body);
			req.end();
		} catch (x:Dynamic) {
			onError(Std.string(x));
		}
	}

	static function postJsonStream(url:String, apiKey:String, body:String, onDelta:String->Void, onSuccess:String->Void, onError:String->Void):Void {
		try {
			var reqFn:Dynamic = Syntax.code("require");
			if (reqFn == null) {
				onError("Node require() is unavailable in this GMEdit window.");
				return;
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
			var done = false;
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
			var req:Dynamic = client.request(options, function(res:Dynamic) {
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
			onError(Std.string(x));
		}
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

	static function removeDuplicatedLinePrefix(completion:String, linePrefix:String):String {
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

	static function canTrimOverlap(linePrefix:String, start:Int, overlap:String):Bool {
		if (overlap == "") return false;
		var first = overlap.charCodeAt(0);
		if (!isIdentChar(first)) return true;
		if (overlap.length == 1) return false;
		return start == 0 || !isIdentChar(linePrefix.charCodeAt(start - 1));
	}

	static function isIdentChar(c:Int):Bool {
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
	
	public static function setStatus(editor:AceWrap, message:String):Void {
		if (editor.statusBar == null) return;
		editor.statusBar.setText(message);
		editor.statusBar.ignoreUntil = Main.window.performance.now() + 3000;
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
	var ghost:DivElement = null;
	var suggestion:String = null;
	var suggestionPos:AcePos = null;
	var suggestionSession:Dynamic = null;
	var widget:Dynamic = null;
	var widgetSession:Dynamic = null;
	
	public function new(editor:AceWrap) {
		this.editor = editor;
	}
	
	public function bind():Void {
		if (bound) return;
		bound = true;
		editor.commands.on("afterExec", onAfterExec);
		editor.on("changeSelection", function(_) {
			if (hasSuggestion() && !samePos(editor.getCursorPosition(), suggestionPos)) hide();
		});
		editor.on("changeSession", function(_) hide());
		editor.on("blur", function(_) hide());
		untyped editor.renderer.on("afterRender", function() syncGhostPosition());
	}
	
	public function hasSuggestion():Bool {
		return suggestion != null && suggestion != "";
	}
	
	public function accept():Bool {
		if (!hasSuggestion()) return false;
		if (editor.session != suggestionSession || !samePos(editor.getCursorPosition(), suggestionPos)) {
			hide();
			return false;
		}
		var text = suggestion;
		hide(false);
		editor.insert(text);
		AICodeCompletion.setStatus(editor, "AI inline completion accepted");
		return true;
	}
	
	public function request(explicit:Bool):Void {
		clearTimer();
		hide();
		if (!explicit && !canAutoRequest()) return;
		if (explicit && editor.completer != null && Reflect.field(editor.completer, "activated") == true) return;
		if (!editor.selection.isEmpty()) return;
		var session = editor.session;
		var pos = copyPos(editor.getCursorPosition());
		var id = ++requestId;
		if (!explicit) AICodeCompletion.setStatus(editor, "AI inline completion: requesting...");
		function isCurrent():Bool {
			return id == requestId && editor.session == session && samePos(editor.getCursorPosition(), pos);
		}
		if (!AICodeCompletion.requestCompletion(editor, true, explicit, function(completion) {
			if (!isCurrent()) return;
			show(completion, pos, session);
			AICodeCompletion.setStatus(editor, "AI inline completion ready");
		}, function(errorText) {
			if (id != requestId) return;
			AICodeCompletion.setStatus(editor, "AI inline completion failed");
			if (!explicit) untyped console.warn(errorText);
		}, function(completion) {
			if (!isCurrent()) return;
			show(completion, pos, session);
			AICodeCompletion.setStatus(editor, "AI inline completion streaming...");
		})) {
			if (!explicit) AICodeCompletion.setStatus(editor, "");
		}
	}
	
	public function hide(invalidate:Bool = true):Void {
		clearTimer();
		if (invalidate) requestId++;
		suggestion = null;
		suggestionPos = null;
		suggestionSession = null;
		if (ghost != null) {
			if (ghost.parentElement != null) ghost.parentElement.removeChild(ghost);
			ghost = null;
		}
		removeWidget();
	}
	
	function onAfterExec(e:Dynamic):Void {
		var name = e.command != null ? e.command.name : "";
		if (name == "acceptAICompletion" || name == "hideAICompletion") return;
		if (name == "insertstring" || name == "backspace" || name == "del" || name == "indent") {
			hide();
			schedule();
		} else if (hasSuggestion()) {
			hide();
		}
	}
	
	function schedule():Void {
		clearTimer();
		if (!canAutoRequest()) return;
		var delay = Preferences.current.aiCompletion.inlineDelayMs;
		if (delay < 250) delay = 250;
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
		if (prefs.apiKey == null || prefs.apiKey.trim() == "") return false;
		if (!editor.selection.isEmpty()) return false;
		if (editor.completer != null && Reflect.field(editor.completer, "activated") == true) return false;
		return true;
	}
	
	function show(text:String, pos:AcePos, session:Dynamic):Void {
		if (text == null || text == "") return;
		hide(false);
		suggestion = text;
		suggestionPos = copyPos(pos);
		suggestionSession = session;
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
		showWidget(text, pos, session, style);
		syncGhostPosition();
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
		if (editor.session != suggestionSession || !samePos(editor.getCursorPosition(), suggestionPos)) {
			hide();
			return;
		}
		while (ghost.firstChild != null) ghost.removeChild(ghost.firstChild);
		var line = firstGhostLine(suggestion);
		var cursor = editor.renderer.textToScreenCoordinates(suggestionPos.row, suggestionPos.column);
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
}
