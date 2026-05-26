package ui;

import ace.AceWrap;
import ace.extern.AcePos;
import electron.Dialog;
import haxe.Json;
import js.Syntax;
import ui.Preferences;
using StringTools;

class AICodeCompletion {
	static var pending:Bool = false;
	static inline var DEFAULT_BASE_URL:String = "https://api.openai.com/v1";
	static inline var DEFAULT_MODEL:String = "gpt-5.4-mini";
	
	public static function complete(editor:AceWrap):Void {
		var prefs = Preferences.current.aiCompletion;
		if (prefs == null || !prefs.enabled) {
			Dialog.showWarning("AI code completion is disabled. Enable it in Preferences > Code editor > AI completion.");
			return;
		}
		if (pending) {
			Dialog.showWarning("AI code completion request is already running.");
			return;
		}
		var apiKey = prefs.apiKey != null ? prefs.apiKey.trim() : "";
		if (apiKey == "") {
			Dialog.showWarning("Set an AI API key in Preferences > Code editor > AI completion.");
			return;
		}
		var baseUrl = prefs.baseUrl != null ? prefs.baseUrl.trim() : "";
		if (baseUrl == "") baseUrl = DEFAULT_BASE_URL;
		var model = prefs.model != null ? prefs.model.trim() : "";
		if (model == "") model = DEFAULT_MODEL;
		var maxOutputTokens = prefs.maxOutputTokens;
		if (maxOutputTokens <= 0) maxOutputTokens = 256;
		if (maxOutputTokens < 16) maxOutputTokens = 16;
		
		var request = buildRequest(editor, model, prefs.maxContextChars, maxOutputTokens);
		pending = true;
		setStatus(editor, "AI completion: requesting...");
		postJson(endpointUrl(baseUrl), apiKey, Json.stringify(request), function(responseText) {
			pending = false;
			var response:Dynamic;
			try {
				response = Json.parse(responseText);
			} catch (x:Dynamic) {
				setStatus(editor, "AI completion failed");
				Dialog.showError("AI completion returned invalid JSON:\n" + shorten(responseText, 1200));
				return;
			}
			var completion = cleanupCompletion(extractText(response));
			if (completion == "") {
				setStatus(editor, "AI completion returned empty text");
				Dialog.showWarning("AI completion returned empty text.");
				return;
			}
			editor.insert(completion);
			setStatus(editor, "AI completion inserted");
		}, function(errorText) {
			pending = false;
			setStatus(editor, "AI completion failed");
			Dialog.showError("AI completion failed:\n" + errorText);
		});
	}
	
	static function buildRequest(editor:AceWrap, model:String, maxContextChars:Int, maxOutputTokens:Int):Dynamic {
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
			+ "Return only the code to insert at the cursor. Do not repeat code from BEFORE or AFTER.\n";
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
		var out = text.trim();
		if (out.startsWith("```")) {
			var firstLine = out.indexOf("\n");
			if (firstLine >= 0) out = out.substring(firstLine + 1);
			var fence = out.lastIndexOf("```");
			if (fence >= 0) out = out.substring(0, fence);
		}
		return out.trim();
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
	
	static function setStatus(editor:AceWrap, message:String):Void {
		if (editor.statusBar == null) return;
		editor.statusBar.setText(message);
		editor.statusBar.ignoreUntil = Main.window.performance.now() + 3000;
	}
	
	static function shorten(text:String, maxLen:Int):String {
		if (text == null) return "";
		if (text.length <= maxLen) return text;
		return text.substring(0, maxLen) + "...";
	}
}
