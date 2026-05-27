package ui;

import ace.AceWrap;
import ace.extern.AcePos;
import electron.Dialog;
import electron.Electron;
import electron.Shell;
import gml.Project;
import haxe.Json;
import haxe.ds.IntMap;
import js.Syntax;
import ui.AICodeCompletion.AICompletionRequestHandle;
import ui.Preferences;
using StringTools;

typedef CopilotPendingRequest = {
	var resolve:Dynamic->Void;
	var reject:String->Void;
}

typedef CopilotDocumentState = {
	var version:Int;
	var text:String;
}

class CopilotLanguageServer {
	static var proc:Dynamic = null;
	static var readBuffer:Dynamic = null;
	static var initialized:Bool = false;
	static var initializing:Bool = false;
	static var nextId:Int = 0;
	static var pending = new IntMap<CopilotPendingRequest>();
	static var readyCallbacks:Array<Void->Void> = [];
	static var readyErrors:Array<String->Void> = [];
	static var documents = new Map<String, CopilotDocumentState>();
	static var lastStatus:String = "";
	
	public static function isProviderSelected():Bool {
		var prefs = Preferences.current.aiCompletion;
		return prefs != null && Reflect.field(prefs, "provider") == "copilot";
	}

	public static function requestCompletion(
		editor:AceWrap,
		inlineSuggestion:Bool,
		showErrors:Bool,
		onSuccess:String->Void,
		onError:String->Void
	):Null<AICompletionRequestHandle> {
		if (!canUseEditor(editor, onError, showErrors)) return null;
		var cancelled = false;
		var requestId:Null<Int> = null;
		ensureStarted(function() {
			if (cancelled) return;
			var doc = syncDocument(editor, showErrors, onError);
			if (doc == null) return;
			var pos = editor.getCursorPosition();
			var params:Dynamic = {
				textDocument: {
					uri: doc.uri,
					version: doc.version,
				},
				position: {
					line: pos.row,
					character: pos.column,
				},
				context: {
					triggerKind: inlineSuggestion ? 2 : 1,
				},
				formattingOptions: {
					tabSize: Preferences.current.tabSize,
					insertSpaces: Preferences.current.tabSpaces,
				},
			};
			requestId = sendRequest("textDocument/inlineCompletion", params, function(result) {
				if (cancelled) return;
				var item = firstCompletionItem(result);
				if (item == null) {
					onError("GitHub Copilot returned no completion.");
					return;
				}
				sendNotification("textDocument/didShowCompletion", { item: item });
				var text = completionTextForCursor(editor, item);
				if (text == "") {
					onError("GitHub Copilot returned an empty completion.");
					return;
				}
				onSuccess(text);
			}, function(message) {
				if (cancelled) return;
				if (showErrors) Dialog.showWarning(message);
				onError(message);
			});
		}, function(message) {
			if (cancelled) return;
			if (showErrors) Dialog.showWarning(message);
			onError(message);
		});
		return {
			cancel: function() {
				cancelled = true;
				if (requestId != null) {
					sendNotification("$/cancelRequest", { id: requestId });
					pending.remove(requestId);
				}
			}
		};
	}

	public static function signIn(editor:AceWrap):Void {
		ensureStarted(function() {
			sendRequest("signIn", {}, function(result) {
				var userCode = Std.string(Reflect.field(result, "userCode"));
				if (userCode != null && userCode != "" && Electron != null && Electron.clipboard != null) {
					Electron.clipboard.writeText(userCode);
				}
				var command:Dynamic = Reflect.field(result, "command");
				if (command != null) {
					executeCommand(command, function(_) {
						AICodeCompletion.setStatus(editor, "GitHub Copilot sign-in started");
					}, function(message) {
						Dialog.showWarning("GitHub Copilot sign-in command failed:\n" + message);
					});
				}
				Dialog.showAlert("GitHub Copilot sign-in code copied to clipboard:\n" + userCode + "\n\nFinish sign-in in the browser window.");
			}, function(message) {
				Dialog.showWarning("GitHub Copilot sign-in failed:\n" + message);
			});
		}, function(message) {
			Dialog.showWarning("GitHub Copilot failed to start:\n" + message);
		});
	}

	public static function signOut(editor:AceWrap):Void {
		ensureStarted(function() {
			sendRequest("signOut", {}, function(_) {
				AICodeCompletion.setStatus(editor, "GitHub Copilot signed out");
			}, function(message) {
				Dialog.showWarning("GitHub Copilot sign-out failed:\n" + message);
			});
		}, function(message) {
			Dialog.showWarning("GitHub Copilot failed to start:\n" + message);
		});
	}

	static function canUseEditor(editor:AceWrap, onError:String->Void, showErrors:Bool):Bool {
		var file = editor.session.gmlFile;
		var path:Dynamic = file != null ? Reflect.field(file, "path") : null;
		if (path == null || Std.string(path) == "") {
			var message = "GitHub Copilot completion requires a saved file.";
			if (showErrors) Dialog.showWarning(message);
			onError(message);
			return false;
		}
		return true;
	}

	static function ensureStarted(onReady:Void->Void, onError:String->Void):Void {
		if (initialized && proc != null) {
			onReady();
			return;
		}
		readyCallbacks.push(onReady);
		readyErrors.push(onError);
		if (initializing) return;
		initializing = true;
		startProcess();
	}

	static function startProcess():Void {
		try {
			var server = findServerCommand();
			var childProcess = requireModule("child_process");
			readBuffer = Syntax.code("Buffer.alloc(0)");
			proc = childProcess.spawn(server.command, server.args, {
				stdio: ["pipe", "pipe", "pipe"],
			});
			proc.stdout.on("data", function(chunk:Dynamic) onStdout(chunk));
			proc.stderr.on("data", function(chunk:Dynamic) {
				untyped console.warn("GitHub Copilot LS:", chunk.toString("utf8"));
			});
			proc.on("error", function(err:Dynamic) failStartup(Std.string(err)));
			proc.on("exit", function(code:Dynamic, signal:Dynamic) {
				var message = "GitHub Copilot language server exited: code=" + Std.string(code) + ", signal=" + Std.string(signal);
				resetProcess();
				failAllPending(message);
			});
			sendInitialize();
		} catch (x:Dynamic) {
			failStartup(Std.string(x));
		}
	}

	static function sendInitialize():Void {
		var rootPath = workspaceRootPath();
		var rootUri = rootPath != null ? pathToUri(rootPath) : null;
		var folders:Array<Dynamic> = [];
		if (rootUri != null) {
			var project = Project.current;
			folders.push({
				uri: rootUri,
				name: project != null ? project.displayName : "GMEdit project",
			});
		}
		sendRequest("initialize", {
			processId: Syntax.code("process.pid"),
			clientInfo: {
				name: "GMEdit",
				version: "1.0.0",
			},
			rootUri: rootUri,
			workspaceFolders: folders,
			capabilities: {
				workspace: {
					workspaceFolders: true,
					configuration: true,
				},
				window: {
					showDocument: {
						support: true,
					},
				},
				textDocument: {
					synchronization: {
						didSave: true,
					},
					inlineCompletion: {
						dynamicRegistration: false,
					},
				},
			},
			initializationOptions: {
				editorInfo: {
					name: "GMEdit",
					version: "1.0.0",
				},
				editorPluginInfo: {
					name: "GMEdit GitHub Copilot",
					version: "0.1.0",
				},
			},
		}, function(_) {
			initialized = true;
			initializing = false;
			sendNotification("initialized", {});
			sendNotification("workspace/didChangeConfiguration", { settings: copilotSettings() });
			flushReady();
		}, function(message) failStartup(message));
	}

	static function flushReady():Void {
		var callbacks = readyCallbacks;
		readyCallbacks = [];
		readyErrors = [];
		for (callback in callbacks) callback();
	}

	static function failStartup(message:String):Void {
		resetProcess();
		var callbacks = readyErrors;
		readyCallbacks = [];
		readyErrors = [];
		for (callback in callbacks) callback(message);
	}

	static function resetProcess():Void {
		proc = null;
		readBuffer = null;
		initialized = false;
		initializing = false;
		documents = new Map<String, CopilotDocumentState>();
	}

	static function failAllPending(message:String):Void {
		for (id in pending.keys()) {
			var item = pending.get(id);
			if (item != null) item.reject(message);
		}
		pending = new IntMap<CopilotPendingRequest>();
	}

	static function syncDocument(editor:AceWrap, showErrors:Bool, onError:String->Void):Dynamic {
		var file = editor.session.gmlFile;
		var path = Std.string(Reflect.field(file, "path"));
		var uri = pathToUri(path);
		var text = editor.session.getValue();
		var state = documents.get(uri);
		var version = state != null ? state.version + 1 : 1;
		if (state == null) {
			sendNotification("textDocument/didOpen", {
				textDocument: {
					uri: uri,
					languageId: "gml",
					version: version,
					text: text,
				},
			});
		} else if (state.text != text) {
			sendNotification("textDocument/didChange", {
				textDocument: {
					uri: uri,
					version: version,
				},
				contentChanges: [{ text: text }],
			});
		}
		documents.set(uri, { version: version, text: text });
		sendNotification("textDocument/didFocus", {
			textDocument: {
				uri: uri,
			},
		});
		return {
			uri: uri,
			version: version,
		};
	}

	static function sendRequest(method:String, params:Dynamic, resolve:Dynamic->Void, reject:String->Void):Int {
		var id = ++nextId;
		pending.set(id, { resolve: resolve, reject: reject });
		send({
			jsonrpc: "2.0",
			id: id,
			method: method,
			params: params,
		});
		return id;
	}

	static function executeCommand(command:Dynamic, resolve:Dynamic->Void, reject:String->Void):Void {
		var args:Dynamic = Reflect.field(command, "arguments");
		if (args == null) args = [];
		sendRequest("workspace/executeCommand", {
			command: Reflect.field(command, "command"),
			arguments: args,
		}, resolve, reject);
	}

	static function sendNotification(method:String, params:Dynamic):Void {
		send({
			jsonrpc: "2.0",
			method: method,
			params: params,
		});
	}

	static function sendResponse(id:Dynamic, result:Dynamic):Void {
		send({
			jsonrpc: "2.0",
			id: id,
			result: result,
		});
	}

	static function send(message:Dynamic):Void {
		if (proc == null || proc.stdin == null) return;
		var body = Json.stringify(message);
		var length:Int = Syntax.code("Buffer.byteLength({0}, 'utf8')", body);
		proc.stdin.write("Content-Length: " + length + "\r\n\r\n" + body);
	}

	static function onStdout(chunk:Dynamic):Void {
		readBuffer = Syntax.code("Buffer.concat([{0}, {1}])", readBuffer, chunk);
		while (true) {
			var headerEnd:Int = Syntax.code("{0}.indexOf('\\r\\n\\r\\n')", readBuffer);
			if (headerEnd < 0) return;
			var header:String = Syntax.code("{0}.slice(0, {1}).toString('ascii')", readBuffer, headerEnd);
			var length = contentLength(header);
			if (length < 0) {
				readBuffer = Syntax.code("{0}.slice({1})", readBuffer, headerEnd + 4);
				continue;
			}
			var bodyStart = headerEnd + 4;
			var total = bodyStart + length;
			var available:Int = Syntax.code("{0}.length", readBuffer);
			if (available < total) return;
			var body:String = Syntax.code("{0}.slice({1}, {2}).toString('utf8')", readBuffer, bodyStart, total);
			readBuffer = Syntax.code("{0}.slice({1})", readBuffer, total);
			handleMessage(body);
		}
	}

	static function contentLength(header:String):Int {
		for (line in header.split("\r\n")) {
			var colon = line.indexOf(":");
			if (colon < 0) continue;
			if (line.substring(0, colon).toLowerCase() == "content-length") {
				var value = Std.parseInt(line.substring(colon + 1).trim());
				return value != null ? value : -1;
			}
		}
		return -1;
	}

	static function handleMessage(body:String):Void {
		var message:Dynamic;
		try {
			message = Json.parse(body);
		} catch (x:Dynamic) {
			untyped console.warn("Invalid GitHub Copilot LS JSON:", body);
			return;
		}
		var method:Dynamic = Reflect.field(message, "method");
		var id:Dynamic = Reflect.field(message, "id");
		if (method != null) {
			if (id != null) handleServerRequest(id, Std.string(method), Reflect.field(message, "params"));
			else handleServerNotification(Std.string(method), Reflect.field(message, "params"));
			return;
		}
		if (id == null) return;
		var key = Std.parseInt(Std.string(id));
		if (key == null) return;
		var item = pending.get(key);
		if (item == null) return;
		pending.remove(key);
		var error:Dynamic = Reflect.field(message, "error");
		if (error != null) {
			var errMessage:Dynamic = Reflect.field(error, "message");
			item.reject(errMessage != null ? Std.string(errMessage) : Json.stringify(error));
		} else {
			item.resolve(Reflect.field(message, "result"));
		}
	}

	static function handleServerRequest(id:Dynamic, method:String, params:Dynamic):Void {
		switch (method) {
			case "window/showDocument":
				var uri:Dynamic = params != null ? Reflect.field(params, "uri") : null;
				if (uri != null) Shell.openExternal(Std.string(uri));
				sendResponse(id, { success: uri != null });
			case "workspace/configuration":
				var items:Dynamic = params != null ? Reflect.field(params, "items") : null;
				var out:Array<Dynamic> = [];
				if (Std.is(items, Array)) {
					for (_ in (items:Array<Dynamic>)) out.push(copilotSettings());
				}
				sendResponse(id, out);
			case "workspace/workspaceFolders":
				var rootPath = workspaceRootPath();
				sendResponse(id, rootPath != null ? [{
					uri: pathToUri(rootPath),
					name: Project.current != null ? Project.current.displayName : "GMEdit project",
				}] : null);
			case "client/registerCapability" | "client/unregisterCapability":
				sendResponse(id, null);
			case "window/showMessageRequest":
				var text:Dynamic = params != null ? Reflect.field(params, "message") : null;
				if (text != null) Dialog.showWarning(Std.string(text));
				sendResponse(id, null);
			default:
				untyped console.warn("Unhandled GitHub Copilot LS request:", method, params);
				sendResponse(id, null);
		}
	}

	static function handleServerNotification(method:String, params:Dynamic):Void {
		switch (method) {
			case "didChangeStatus":
				lastStatus = params != null ? Std.string(Reflect.field(params, "message")) : "";
				untyped console.log("GitHub Copilot status:", params);
			case "window/logMessage":
				untyped console.log("GitHub Copilot LS:", params);
			case "window/showMessage":
				var text:Dynamic = params != null ? Reflect.field(params, "message") : null;
				if (text != null) Dialog.showWarning(Std.string(text));
			default:
		}
	}

	static function firstCompletionItem(result:Dynamic):Dynamic {
		if (result == null) return null;
		var items:Dynamic = Reflect.field(result, "items");
		if (!Std.is(items, Array)) return null;
		var arr:Array<Dynamic> = cast items;
		return arr.length > 0 ? arr[0] : null;
	}

	static function completionTextForCursor(editor:AceWrap, item:Dynamic):String {
		var text:Dynamic = Reflect.field(item, "insertText");
		if (text == null) text = Reflect.field(item, "text");
		if (text == null) return "";
		var out = Std.string(text).replace("\r\n", "\n").replace("\r", "\n");
		var range:Dynamic = Reflect.field(item, "range");
		if (range == null) return out;
		var start:Dynamic = Reflect.field(range, "start");
		var end:Dynamic = Reflect.field(range, "end");
		if (start == null || end == null) return out;
		var startPos = new AcePos(Std.int(Reflect.field(start, "character")), Std.int(Reflect.field(start, "line")));
		var endPos = new AcePos(Std.int(Reflect.field(end, "character")), Std.int(Reflect.field(end, "line")));
		var cursor = editor.getCursorPosition();
		if (samePos(cursor, endPos)) {
			var typed = editor.session.getTextRange(ace.extern.AceRange.fromPair(startPos, endPos));
			if (out.startsWith(typed)) return out.substring(typed.length);
		}
		return out;
	}

	static function samePos(a:AcePos, b:AcePos):Bool {
		return a != null && b != null && a.row == b.row && a.column == b.column;
	}

	static function copilotSettings():Dynamic {
		return {
			http: {},
			telemetry: {
				telemetryLevel: "all",
			},
		};
	}

	static function workspaceRootPath():String {
		var project = Project.current;
		if (project != null && project.dir != null && project.dir != "") return project.dir;
		return null;
	}

	static function findServerCommand():Dynamic {
		var platform:String = Syntax.code("process.platform");
		var arch:String = Syntax.code("process.arch");
		var suffix = switch (platform) {
			case "darwin": arch == "arm64" ? "darwin-arm64" : "darwin-x64";
			case "linux": arch == "arm64" ? "linux-arm64" : "linux-x64";
			case "win32": arch == "arm64" ? "win32-arm64" : "win32-x64";
			default: "";
		};
		if (suffix != "") {
			try {
				var path = requireModule("path");
				var packageName = "@github/copilot-language-server-" + suffix;
				var packageJson:String = Syntax.code("require.resolve({0} + '/package.json')", packageName);
				var dir:String = path.dirname(packageJson);
				var exe = platform == "win32" ? "copilot-language-server.exe" : "copilot-language-server";
				return {
					command: path.join(dir, exe),
					args: ["--stdio"],
				};
			} catch (x:Dynamic) {}
		}
		var script:String = Syntax.code("require.resolve('@github/copilot-language-server/dist/language-server.js')");
		return {
			command: "node",
			args: [script, "--stdio"],
		};
	}

	static function pathToUri(path:String):String {
		var url = requireModule("url");
		return Syntax.code("{0}.pathToFileURL({1}).href", url, path);
	}

	static function requireModule(name:String):Dynamic {
		var req:Dynamic = Syntax.code("require");
		return req(name);
	}
}
