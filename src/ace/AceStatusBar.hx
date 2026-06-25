package ace;
import ace.AceWrap;
import ace.extern.*;
import ace.statusbar.AceStatusBarImports;
import ace.statusbar.AceStatusBarResolver;
import editors.EditCode;
import file.kind.gml.KGmlScript;
import file.kind.misc.KGLSL;
import file.kind.misc.KHLSL;
import gml.GmlAPI;
import gml.GmlImports;
import gml.GmlLocals;
import gml.GmlFuncDoc;
import gml.GmlNamespace;
import gml.file.GmlFile;
import gml.type.GmlType;
import js.html.DivElement;
import js.html.Element;
import js.html.MouseEvent;
import js.html.SpanElement;
import Main.document;
import synext.GmlExtLambda;
import shaders.ShaderAPI;
import tools.Dictionary;
import tools.JsTools;
import tools.macros.SynSugar;
using tools.NativeString;

/**
 * This handles everything about that status bar on the bottom of the code editor.
 * @author YellowAfterlife
 */
class AceStatusBar {
	public var editor:AceWrap;
	public var statusBar:DivElement;
	public var statusSpan:SpanElement;
	public var statusHint:SpanElement;
	public var contextRow:Int = 0;
	public var contextName:String = null;
	public var ignoreUntil:Float = Main.window.performance.now();
	public var delayTime(default, null):Int = 50;
	public function new() {
		statusBar = document.createDivElement();
		statusBar.className = "ace_status-bar";
		statusSpan = document.createSpanElement();
		statusSpan.className = "ace_status-hint";
		statusSpan.innerHTML = SynSugar.xmls(<html>
			<span class="status" style="display:none">?</span>
			<span class="recording" style="display:none">REC</span>
			<span class="select" style="display:none">(:)</span>
			<span class="row-label">Ln:</span>
			<span class="row">1</span>
			<span class="col-label">Col:</span>
			<span class="col">1</span>
			<span class="ranges" style="display:none"></span>
			<span class="context-pre" style="display:none"></span>
			<span class="context" style="display:none"><span class="context-txt"></span></span>
		</html>);
		statusBar.appendChild(statusSpan);
		//
		statusHint = document.createSpanElement();
		statusHint.className = "ace_status-comp";
		statusBar.appendChild(statusHint);
	}
	public function bind(editor:AceWrap) {
		this.editor = editor;
		editor.statusBar = this;
		var lang = AceWrap.require("ace/lib/lang");
		var dc:AceDelayedCall = lang.delayedCall(update);
		var dcUpdate = function() dc.delay(delayTime);
		editor.on("changeStatus", dcUpdate);
		editor.on("changeSelection", dcUpdate);
		editor.on("keyboardActivity", dcUpdate);
		editor.container.parentElement.appendChild(statusBar);
	}
	
	public static var canDocData:Dictionary<AceStatusBarDocSearch->Bool> = @:privateAccess AceStatusBarResolver.initCanDocData();
	@:keep public static function getDocData(ctx:AceStatusBarDocSearch):Bool {
		var f = canDocData[ctx.tk.type];
		if (f != null) {
			return f(ctx);
		} else if (Std.is(ctx.session.gmlFile.kind, file.kind.KGml)) {
			ctx.docs = {};
			return true;
		} else return false;
	}
	@:keep public static inline function procDocImport(ctx:AceStatusBarDocSearch):Int {
		return AceStatusBarImports.procDocImport(ctx);
	}
	
	private static var emptyToken:AceToken = { type:"", value:"" };
	private function updateComp(editor:AceWrap, row:Int, col:Int, imports:GmlImports, lambdas:GmlExtLambda, scope:String) {
		statusHint.innerHTML = "";
		function renderDoc(doc:GmlFuncDoc, argCurr:Int):Void {
			var args = doc.args;
			var argc = args.length;
			var out = document.createSpanElement();
			out.className = "hint";
			out.appendChild(document.createTextNode(doc.pre));
			//
			var currArg:SpanElement = null;
			for (i in 0 ... argc) {
				if (i > 0) out.appendChild(document.createTextNode(", "));
				var span = document.createSpanElement();
				span.classList.add("argument");
				if (i == argCurr || i == argc - 1 && argCurr >= i) {
					span.classList.add("current");
					currArg = span;
				}
				span.appendChild(document.createTextNode(args[i]));
				out.appendChild(span);
			}
			out.appendChild(document.createTextNode(doc.post));
			statusHint.appendChild(out);
			if (currArg != null) {
				statusHint.scrollLeft = Std.int(currArg.offsetLeft + currArg.offsetWidth / 2 - statusHint.offsetWidth / 2);
				//currArg.scrollIntoView();
			}
			statusHint.title = out.innerText;
			statusHint.classList.remove("active");
		}
		var session = editor.session;
		function isAtOrAfterCursor(pos:AcePos):Bool {
			return pos.row > row || pos.row == row && pos.column >= col;
		}
		function pubSubPayloadArgIndex(funcName:String):Int {
			return switch (funcName) {
				case "perform_event", "pub_sub_event_perform": 1;
				case "perform_event_with_delay": 2;
				default: -1;
			}
		}
		function renderPubSubPayloadDoc(eventName:String, argCurr:Int):Void {
			var pubSubEvent = GmlAPI.gmlPubSubEvents[eventName];
			if (pubSubEvent == null) return;
			var pubSubArgs = [];
			for (i in 0 ... pubSubEvent.args.length) {
				var arg = pubSubEvent.args[i];
				var argType = pubSubEvent.argTypes[i];
				pubSubArgs.push(argType != null ? arg + ":" + argType.toString() : arg);
			}
			renderDoc(new GmlFuncDoc(pubSubEvent.name, pubSubEvent.name + "([", "])", pubSubArgs, false), argCurr);
		}
		function tryRenderPubSubPayloadFromLine():Bool {
			var line = session.getLine(row);
			var uptoCursor = line.substring(0, col);
			var arrayOpenInd = uptoCursor.lastIndexOf("[");
			if (arrayOpenInd < 0) return false;
			var parOpenInd = uptoCursor.lastIndexOf("(", arrayOpenInd);
			if (parOpenInd < 0) return false;
			
			var receiver = uptoCursor.substring(0, parOpenInd);
			var funcRx = ~/(\w+)\s*$/;
			var funcMatch = funcRx.match(receiver) ? funcRx.matched(1) : null;
			var payloadArgIndex = pubSubPayloadArgIndex(funcMatch);
			if (payloadArgIndex < 0) return false;
			
			var beforeArray = uptoCursor.substring(parOpenInd + 1, arrayOpenInd);
			var roundDepth = 0;
			var squareDepth = 0;
			var curlyDepth = 0;
			var commasBeforeArray = 0;
			var i = 0;
			while (i < beforeArray.length) {
				switch (beforeArray.fastCodeAt(i)) {
					case "(".code: roundDepth += 1;
					case ")".code: if (roundDepth > 0) roundDepth -= 1;
					case "[".code: squareDepth += 1;
					case "]".code: if (squareDepth > 0) squareDepth -= 1;
					case "{".code: curlyDepth += 1;
					case "}".code: if (curlyDepth > 0) curlyDepth -= 1;
					case ",".code if (roundDepth == 0 && squareDepth == 0 && curlyDepth == 0):
						commasBeforeArray += 1;
					default:
				}
				i += 1;
			}
			if (commasBeforeArray != payloadArgIndex) return false;
			
			var eventArg = beforeArray.split(",")[0];
			var eventName:String = null;
			for (name => _ in GmlAPI.gmlPubSubEvents) {
				if (eventArg.contains(name)) {
					eventName = name;
					break;
				}
			}
			if (eventName == null) return false;
			
			var payloadSoFar = uptoCursor.substring(arrayOpenInd + 1);
			roundDepth = 0;
			squareDepth = 0;
			curlyDepth = 0;
			var argCurr = 0;
			i = 0;
			while (i < payloadSoFar.length) {
				switch (payloadSoFar.fastCodeAt(i)) {
					case "(".code: roundDepth += 1;
					case ")".code: if (roundDepth > 0) roundDepth -= 1;
					case "[".code: squareDepth += 1;
					case "]".code: if (squareDepth > 0) squareDepth -= 1;
					case "{".code: curlyDepth += 1;
					case "}".code: if (curlyDepth > 0) curlyDepth -= 1;
					case ",".code if (roundDepth == 0 && squareDepth == 0 && curlyDepth == 0):
						argCurr += 1;
					default:
				}
				i += 1;
			}
			renderPubSubPayloadDoc(eventName, argCurr);
			return true;
		}
		inline function isRoundOpen(tk:AceToken):Bool return tk.type == "paren.lparen";
		inline function isRoundClose(tk:AceToken):Bool return tk.type == "paren.rparen";
		inline function isSquareOpen(tk:AceToken):Bool return tk.type == "square.paren.lparen";
		inline function isSquareClose(tk:AceToken):Bool return tk.type == "square.paren.rparen";
		inline function isCurlyOpen(tk:AceToken):Bool return tk.type == "curly.paren.lparen";
		inline function isCurlyClose(tk:AceToken):Bool return tk.type == "curly.paren.rparen";
		inline function isComma(tk:AceToken):Bool return tk.type == "punctuation.operator" && tk.value.contains(",");
		function tryRenderPubSubPayload():Bool {
			var scan = new AceTokenIterator(session, row, col);
			var tk = scan.getCurrentToken();
			var squareDepth = 0;
			var tries = 0;
			while (tk != null && ++tries < 512) {
				if (isSquareClose(tk)) {
					squareDepth += 1;
				} else if (isSquareOpen(tk)) {
						if (squareDepth > 0) {
							squareDepth -= 1;
						} else {
							var arrayOpen = scan.getCurrentTokenPosition();
							var back = AceTokenIterator.createForPos(session, arrayOpen);
							var commasBeforeArray = 0;
							var roundDepth = 0;
							var sqDepth = 0;
							var curlyDepth = 0;
							var foundOpen:AcePos = null;
							var bt = back.stepBackward();
							while (bt != null) {
								if (isRoundClose(bt)) {
									roundDepth += 1;
								} else if (isSquareClose(bt)) {
									sqDepth += 1;
								} else if (isCurlyClose(bt)) {
									curlyDepth += 1;
								} else if (isRoundOpen(bt)) {
										if (roundDepth > 0) {
											roundDepth -= 1;
										} else if (sqDepth == 0 && curlyDepth == 0) {
											foundOpen = back.getCurrentTokenPosition();
											break;
										}
								} else if (isSquareOpen(bt)) {
									if (sqDepth > 0) sqDepth -= 1;
								} else if (isCurlyOpen(bt)) {
									if (curlyDepth > 0) curlyDepth -= 1;
								} else if (isComma(bt) && roundDepth == 0 && sqDepth == 0 && curlyDepth == 0) {
									commasBeforeArray += 1;
								}
								bt = back.stepBackward();
							}
							if (foundOpen != null) {
								var funcIter = AceTokenIterator.createForPos(session, foundOpen);
								var funcToken = funcIter.stepBackwardNonText();
								var funcName = funcToken != null ? funcToken.value : null;
								var payloadArgIndex = pubSubPayloadArgIndex(funcName);
								if (payloadArgIndex == commasBeforeArray) {
									var forward = AceTokenIterator.createForPos(session, foundOpen);
									var ft = forward.stepForward();
									var eventName:String = null;
									roundDepth = 0;
									sqDepth = 0;
									curlyDepth = 0;
									while (ft != null) {
										if (isRoundOpen(ft)) {
											roundDepth += 1;
										} else if (isSquareOpen(ft)) {
											sqDepth += 1;
										} else if (isCurlyOpen(ft)) {
											curlyDepth += 1;
										} else if (isRoundClose(ft)) {
											if (roundDepth > 0) roundDepth -= 1;
										} else if (isSquareClose(ft)) {
											if (sqDepth > 0) sqDepth -= 1;
										} else if (isCurlyClose(ft)) {
											if (curlyDepth > 0) curlyDepth -= 1;
										} else if (isComma(ft) && roundDepth == 0 && sqDepth == 0 && curlyDepth == 0) {
											break;
										} else if (GmlAPI.gmlPubSubEvents.exists(ft.value)) {
											eventName = ft.value;
										}
										ft = forward.stepForward();
									}
									if (eventName != null) {
										var argIter = AceTokenIterator.createForPos(session, arrayOpen);
										var at = argIter.stepForward();
										var argCurr = 0;
										sqDepth = 0;
										roundDepth = 0;
										curlyDepth = 0;
										while (at != null) {
											var atPos = argIter.getCurrentTokenPosition();
											if (isAtOrAfterCursor(atPos)) break;
											if (isRoundOpen(at)) {
												roundDepth += 1;
											} else if (isRoundClose(at)) {
												if (roundDepth > 0) roundDepth -= 1;
											} else if (isSquareOpen(at)) {
												sqDepth += 1;
											} else if (isSquareClose(at)) {
												if (sqDepth > 0) {
													sqDepth -= 1;
												} else break;
											} else if (isCurlyOpen(at)) {
												curlyDepth += 1;
											} else if (isCurlyClose(at)) {
												if (curlyDepth > 0) curlyDepth -= 1;
											} else if (isComma(at) && roundDepth == 0 && sqDepth == 0 && curlyDepth == 0) {
												argCurr += 1;
											}
											at = argIter.stepForward();
										}
										renderPubSubPayloadDoc(eventName, argCurr);
										return true;
									}
								}
							}
						}
				}
				tk = scan.stepBackward();
			}
			return false;
		}
		if (tryRenderPubSubPayloadFromLine() || tryRenderPubSubPayload()) {
			statusHint.onclick = null;
			return;
		}
		var iter:AceTokenIterator = new AceTokenIterator(session, row, col);
		var sctx:AceStatusBarDocSearch = {
			session: editor.session, scope: scope,
			iter: iter, imports: imports, lambdas: lambdas,
			docs: null, doc: null, tk: null, funcEnd: null
		};
		var ctk:AceToken = iter.getCurrentToken(); // cursor token
		var parEmpty = false;
		var minDepth = 0; // lowest reached parenthesis depth
		var depth = 0; // current parenthesis depth
		var fkw = GmlAPI.kwFlow;
		if (ctk != null && ctk.type == "paren.lparen") {
			ctk = iter.stepForward();
			if (ctk != null) {
				switch (ctk.type) {
					case "paren.rparen": {
						depth -= ctk.value.length; // can be `))`
						parEmpty = true;
					};
					case "punctuation.operator" if (ctk.value == ";"): ctk = iter.stepBackward();
					case "keyword" if (fkw[ctk.value]): ctk = iter.stepBackward();
					case "preproc.macro": ctk = iter.stepBackward();
					#if !lwedit
					case "curly.paren.lparen", "curly.paren.rparen": {
						ctk = iter.stepBackward();
					};
					#end
				}
			} else ctk = emptyToken;
		}
		// go back to find the likely associated function call:
		var tk:AceToken = ctk;
		var docs:Dictionary<GmlFuncDoc> = null;
		var doc:GmlFuncDoc = null;
		var parOpen:AceToken = null;
		while (tk != null) {
			switch (tk.type) {
				case "keyword": if (fkw[tk.value]) break;
				case "preproc.macro": break;
				case "macroname": break;
				case "set.operator": break;
				#if !lwedit
				case "curly.paren.lparen": {
					if (depth <= 0) break;
					depth -= tk.value.length;
				};
				case "curly.paren.rparen": depth += tk.value.length;
				#end
				case "paren.rparen", "square.paren.rparen": depth += tk.value.length;
				case "punctuation.operator" if (tk.value == ";"): break;
				case "paren.lparen", "square.paren.lparen": {
					depth -= tk.value.length;
					if (depth < minDepth) {
						minDepth = depth;
						parOpen = tk;
						var pos = iter.getCurrentTokenPosition();
						tk = iter.stepBackward();
						if (tk != null) {
							sctx.tk = tk;
							if (getDocData(sctx)) {
								sctx.funcEnd = pos;
								tk = sctx.tk;
								docs = sctx.docs;
								doc = sctx.doc;
								break;
							} else tk = sctx.tk;
						}
					}
				};
			}
			tk = iter.stepBackward();
		}
		if (docs == null && doc == null) return;
		// find the actual doc:
		var argStart = 0;
		if (doc == null) {
			sctx.tk = tk;
			argStart = procDocImport(sctx); // import magic fixes
			doc = sctx.doc;
			tk = sctx.tk;
		}
		// go forward to verify that cursor token is inside that call:
		depth = -1;
		var argCurr = 0;
		var pubSubPayloadArg = switch (doc != null ? doc.name : null) {
			case "perform_event", "pub_sub_event_perform": 1;
			case "perform_event_with_delay": 2;
			default: -1;
		}
		var pubSubEventName:String = null;
		var pubSubPayloadDepth = -1;
		var pubSubPayloadCurr = 0;
		tk = iter.stepForward(); // we should now be at `(`
		while (tk != null) {
			switch (tk.type) {
				case "paren.lparen", "curly.paren.lparen": depth += tk.value.length;
				case "square.paren.lparen": {
					if (pubSubPayloadArg >= 0 && argCurr == pubSubPayloadArg && depth == 0) {
						pubSubPayloadDepth = depth + tk.value.length;
						pubSubPayloadCurr = 0;
					}
					depth += tk.value.length;
				};
				case "paren.rparen", "curly.paren.rparen": depth -= tk.value.length;
				case "square.paren.rparen": {
					depth -= tk.value.length;
					if (pubSubPayloadDepth >= 0 && depth < pubSubPayloadDepth) {
						pubSubPayloadDepth = -1;
					}
				};
				case "punctuation.operator" if (tk.value.contains(",")): {
					if (pubSubPayloadDepth >= 0 && depth == pubSubPayloadDepth) {
						pubSubPayloadCurr += 1;
					} else if (depth == 0) argCurr += 1;
				};
				default:
			}
			if (pubSubPayloadArg >= 0 && argCurr == 0 && tk.value != null && GmlAPI.gmlPubSubEvents.exists(tk.value)) {
				pubSubEventName = tk.value;
			}
			if (tk == ctk) break;
			tk = iter.stepForward();
		}
		argCurr += argStart;
		if ((tk == null ? ctk != emptyToken : tk != ctk) || depth < 0 && !parEmpty) return;
		//
		if (doc != null) {
			if (pubSubPayloadDepth >= 0 && pubSubEventName != null) {
				var pubSubEvent = GmlAPI.gmlPubSubEvents[pubSubEventName];
				if (pubSubEvent != null) {
					renderPubSubPayloadDoc(pubSubEventName, pubSubPayloadCurr);
					statusHint.onclick = null;
					return;
				}
			}
			renderDoc(doc, argCurr);
		} else statusHint.title = "";
		statusHint.onclick = null;
	}
	public function setText(s:String) {
		statusHint.innerHTML = "";
		statusHint.appendChild(document.createTextNode(s));
		statusHint.title = s;
		statusHint.onclick = null;
		statusHint.classList.remove("active");
	}
	public function update() {
		if (Main.window.performance.now() < ignoreUntil) return;
		var file = editor.session.gmlFile;
		var codeEditor:EditCode = file != null ? file.codeEditor : null;
		//
		var sel = editor.selection;
		var pos = sel.lead;
		//
		var showRow = pos.row;
		var isScript = JsTools.nca(file, (file.kind is KGmlScript));
		var isShader = JsTools.nca(file, (file.kind is KGLSL)) || JsTools.nca(file, (file.kind is KHLSL));
		var startRow = showRow + 1;
		var session = editor.getSession();
		var resetOnDefine:Bool = GmlExternAPI.gmlResetOnDefine;
		var scope:String = "";
		if (!isShader) {
			var checkRx = isScript ? GmlAPI.scopeResetRx : GmlAPI.scopeResetRxNF;
			while (--startRow >= 0) {
				var checkResult = checkRx.exec(session.getLine(startRow));
				if (checkResult != null) {
					scope = checkResult[1];
					if (resetOnDefine) showRow -= startRow + 1;
					break;
				}
			}
		}
		// move this elsewhere maybe
		if (file != null && codeEditor != null
			&& file != ui.WelcomePage.file
			&& (cast file.kind:file.kind.KCode).setChangedOnEdits
		) {
			file.changed = !session.getUndoManager().isClean();
		}
		//
		var ctr = statusSpan, s:String;
		function set(q:String, v:String) {
			var el = ctr.querySelector(q);
			if (v != null && v != "") {
				el.style.display = "";
				el.innerText = v;
			} else el.style.display = "none";
		}
		//
		set(".status", editor.keyBinding.getStatusText(editor));
		set(".recording", editor.commands.recording ? "REC" : null);
		//
		if (!sel.isEmpty()) {
			var r = editor.getSelectionRange();
			set(".select", '(${r.end.row - r.start.row}:${r.end.column - r.start.column})');
		} else set(".select", null);
		//
		set(".row", showRow < 0 ? "#" : "" + (showRow + 1));
		set(".col", "" + (pos.column + 1));
		set(".ranges", sel.rangeCount > 0 ? '[${sel.rangeCount}]' : null);
		//
		var ctxCtr = ctr.querySelector(".context");
		var ctxPre = ctr.querySelector(".context-pre");
		if (scope != "") {
			ctxCtr.style.display = "";
			ctxPre.style.display = "";
			var ctxTxt = ctr.querySelector(".context-txt");
			ctxTxt.innerText = scope;
			ctxTxt.title = scope;
			contextRow = startRow;
			contextName = scope;
		} else {
			ctxCtr.style.display = "none";
			ctxPre.style.display = "none";
			contextRow = -1;
			contextName = null;
		}
		//
		var locals = codeEditor != null ? codeEditor.locals[scope] : null;
		editor.gmlCompleters.localCompleter.items = locals != null
			? locals.comp : AceWrapCompleter.noItems;
		//
		var imports = codeEditor != null ? codeEditor.imports[scope] : null;
		editor.gmlCompleters.importCompleter.items = imports != null
			? imports.compList : AceWrapCompleter.noItems;
		//
		var lambdas = codeEditor != null ? codeEditor.lambdas[scope] : null;
		editor.gmlCompleters.lambdaCompleter.items = lambdas != null
			? lambdas.comp : AceWrapCompleter.noItems;
		//
		updateComp(editor, pos.row, pos.column, imports, lambdas, scope);
	}
}
typedef AceStatusBarDocSearch = {
	iter:AceTokenIterator,
	docs:Dictionary<GmlFuncDoc>,
	doc:GmlFuncDoc,
	?type:GmlType,
	/** Used by tooltips */
	?typeText:String,
	tk:AceToken,
	session:AceSession,
	scope:String,
	imports:GmlImports,
	lambdas:GmlExtLambda,
	funcEnd:AcePos,
	?exprStart:AcePos
}
