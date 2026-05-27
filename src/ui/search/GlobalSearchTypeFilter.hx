package ui.search;
import gml.GmlAPI;
import gml.GmlFuncDoc;
import gml.GmlMacro;
import gml.GmlVersion;
import gml.Project;
import gml.type.GmlType;
import gml.type.GmlType.GmlTypeAnonField;
import gml.type.GmlTypeDef;
import parsers.GmlReader;
import parsers.GmlReader.SkipVarsData;
import tools.CharCode;
import tools.Dictionary;
using gml.type.GmlTypeTools;
using tools.NativeString;

/**
 * Tracks typed local variables well enough for global-search filtering.
 */
class GlobalSearchTypeFilter {
	var target:GmlType;
	var version:GmlVersion;
	var code:String;
	var q:GmlReader;
	var contexts:Dictionary<GlobalSearchTypeContext> = new Dictionary();
	var ctx:GlobalSearchTypeContext;
	var scope:GlobalSearchTypeScope;
	var fileName:String;
	var path:String;
	var uniqueFieldTypes:Dictionary<GmlType> = new Dictionary();
	var uniqueFieldTypeMisses:Dictionary<Bool> = new Dictionary();
	
	public function new(typeName:String) {
		target = GmlTypeDef.parse(typeName, "global search");
	}
	
	public inline function isValid():Bool {
		return target != null;
	}
	
	public function prepareFile(name:String, path:String, code:String):Void {
		this.fileName = name;
		this.path = path;
		this.code = code;
		this.version = Project.current.version;
		contexts = new Dictionary();
		q = new GmlReader(code);
		
		var ctxName = name;
		var ctxStart = 0;
		while (q.loop) {
			var p = q.pos;
			var c = q.read();
			switch (c) {
				case "/".code: switch (q.peek()) {
					case "/".code: q.skipLine();
					case "*".code: q.skip(); q.skipComment();
					default:
				}
				case '"'.code, "'".code, "@".code, "`".code:
					q.skipStringAuto(c, version);
				case "$".code if (q.isDqTplStart(version)):
					q.skipDqTplString(version);
				case "#".code if (p == 0 || q.get(p - 1) == "\n".code): {
					var ctxNameNext = q.readContextName(name);
					if (ctxNameNext == null) {
						q.pos = p + 1;
					} else {
						scanContext(ctxName, ctxStart, p);
						q.skipLine();
						q.skipLineEnd();
						ctxName = ctxNameNext;
						ctxStart = q.pos;
					}
				}
				default:
			}
		}
		scanContext(ctxName, ctxStart, q.pos);
		q.close();
		q = null;
	}
	
	function scanContext(name:String, start:Int, end:Int):Void {
		ctx = new GlobalSearchTypeContext(name, start, end, getRootSelfType(name));
		contexts.set(name, ctx);
		scanRange(start, end, ctx.root);
	}
	
	function scanRange(start:Int, end:Int, startScope:GlobalSearchTypeScope):Void {
		var oldPos = q.pos;
		var oldCtx = ctx;
		var oldScope = scope;
		q.pos = start;
		scope = startScope;
		while (q.pos < end) {
			var p = q.pos;
			var c = q.read();
			switch (c) {
				case "/".code: switch (q.peek()) {
					case "/".code: q.skipLine();
					case "*".code: q.skip(); q.skipComment();
					default:
				}
				case '"'.code, "'".code, "@".code, "`".code:
					q.skipStringAuto(c, version);
				case "$".code if (q.isDqTplStart(version)):
					q.skipDqTplString(version);
				case "#".code if (p == 0 || q.get(p - 1) == "\n".code): {
					if (q.skipIfIdentEquals("args")) {
						parseVars("args", end);
					} else {
						q.skipLine();
					}
				}
				case "{".code: {
					scope = ctx.addScope(p, end, scope, false, null);
				}
				case "}".code: {
					if (scope != null && scope.parent != null) {
						scope.end = p;
						scope = scope.parent;
					}
				}
				case _ if (c.isIdent0()): {
					q.skipIdent1();
					var ident = q.substring(p, q.pos);
					switch (ident) {
						case "var", "let", "const", "globalvar":
							parseVars(ident, end);
						case "function" if (version.hasFunctionLiterals()):
							parseFunction(p, end);
						default:
					}
				}
				default:
			}
		}
		q.pos = oldPos;
		ctx = oldCtx;
		scope = oldScope;
	}
	
	function parseVars(kind:String, end:Int):Void {
		var svd = new SkipVarsData();
		var isArgs = kind == "args";
		var isGlobal = kind == "globalvar";
		var targetScope = getDeclarationScope(kind);
		q.skipVars(function(d) {
			var t = d.typeStr != null ? GmlTypeDef.parse(d.typeStr, "global search variable") : null;
			if (t == null && d.exprStart < d.exprEnd) {
				t = inferExprType(d.exprStart, d.exprEnd);
			}
			if (t != null) {
				if (isGlobal) {
					ctx.globalTypes.set(d.name, t);
				} else {
					targetScope.addVar(d.name, d.nameStart, t);
				}
			}
			if (d.exprStart < d.exprEnd) {
				scanRange(d.exprStart, d.exprEnd, scope);
			}
		}, version, isArgs, svd);
	}
	
	function inferExprType(start:Int, end:Int):GmlType {
		var castType = readTrailingAsCastType(start, end);
		if (castType != null) return castType;
		var oldPos = q.pos;
		q.pos = start;
		var t = readExprType(end);
		q.pos = oldPos;
		return t;
	}
	
	function readTrailingAsCastType(start:Int, end:Int):GmlType {
		var p = end;
		while (p > start && code.fastCodeAt(p - 1).isSpace1()) p--;
		if (p - 2 < start || code.substring(p - 2, p) != "*/") return null;
		var open = -1;
		var scan = start;
		while (scan < p) {
			var next = code.indexOf("/*#as ", scan);
			if (next < 0 || next >= p) break;
			open = next;
			scan = next + 1;
		}
		if (open < 0) return null;
		var close = code.indexOf("*/", open + 6);
		if (close != p - 2) return null;
		var typeStr = StringTools.trim(code.substring(open + 6, close));
		return typeStr != "" ? GmlTypeDef.parse(typeStr, "global search cast") : null;
	}
	
	function readExprType(end:Int):GmlType {
		skipSpacesAndComments(end);
		var t = readExprPrimaryType(end);
		if (t == null) return readUnknownBasePostfixType(end);
		return readExprPostfixType(t, end);
	}
	
	function readExprPrimaryType(end:Int):GmlType {
		if (!q.peek().isIdent0()) return null;
		var start = q.pos;
		q.skipIdent1();
		var name = q.substring(start, q.pos);
		if (name == "new") {
			skipSpacesAndComments(end);
			if (!q.peek().isIdent0()) return null;
			var typeStart = q.pos;
			q.skipIdent1();
			var typeName = q.substring(typeStart, q.pos);
			skipSpacesAndComments(end);
			if (q.peek() == "(".code) skipCall(end);
			return GmlTypeDef.simple(typeName);
		}
		skipSpacesAndComments(end);
		if (q.peek() == "(".code) switch (name) {
			case "array_clone":
				return readFirstCallArgType(end);
			case "ds_map_find_first", "ds_map_find_next":
				return getMapKeyType(readFirstCallArgType(end));
			default:
		}
		return getTypeAt(ctx, start, name, false);
	}
	
	function readExprPostfixType(t:GmlType, end:Int, fieldReady:Bool = false):GmlType {
		var lastWasField = fieldReady;
		while (q.pos < end) {
			skipSpacesAndComments(end);
			switch (q.peek()) {
				case "(".code:
					skipCall(end);
					var rt = getReturnType(t);
					if (rt != null) {
						t = rt;
					} else if (!lastWasField) return null;
					lastWasField = false;
				case "[".code:
					skipArrayAccess(end);
					t = getIndexedType(t);
					if (t == null) return null;
					lastWasField = false;
				case "?".code if (q.peek(1) == ".".code):
					q.skip();
				case ".".code:
					q.skip();
					skipSpacesAndComments(end);
					if (!q.peek().isIdent0()) return t;
					var fieldStart = q.pos;
					q.skipIdent1();
					var field = q.substring(fieldStart, q.pos);
					t = getFieldType(t, field, false);
					if (t == null) t = getUniqueFieldType(field, false);
					if (t == null) return null;
					lastWasField = true;
				default:
					return t;
			}
		}
		return t;
	}
	
	function readUnknownBasePostfixType(end:Int):GmlType {
		while (q.pos < end) {
			skipSpacesAndComments(end);
			switch (q.peek()) {
				case "(".code:
					skipCall(end);
				case "[".code:
					skipArrayAccess(end);
				case "?".code if (q.peek(1) == ".".code):
					q.skip();
				case ".".code:
					q.skip();
					skipSpacesAndComments(end);
					if (!q.peek().isIdent0()) return null;
					var fieldStart = q.pos;
					q.skipIdent1();
					var field = q.substring(fieldStart, q.pos);
					var t = getUniqueFieldType(field, false);
					return t != null ? readExprPostfixType(t, end, true) : null;
				default:
					return null;
			}
		}
		return null;
	}
	
	function readFirstCallArgType(end:Int):GmlType {
		if (q.peek() != "(".code) return null;
		q.skip();
		skipSpacesAndComments(end);
		var argStart = q.pos;
		skipExprUntil([",".code, ")".code], end);
		var argEnd = q.pos;
		var t = argStart < argEnd ? inferExprType(argStart, argEnd) : null;
		if (q.peek() != ")".code) skipExprUntil([")".code], end);
		if (q.peek() == ")".code) q.skip();
		return t;
	}
	
	function skipArrayAccess(end:Int):Void {
		if (q.peek() != "[".code) return;
		q.skip();
		skipExprUntil(["]".code], end);
		if (q.peek() == "]".code) q.skip();
	}
	
	function skipCall(end:Int):Void {
		if (q.peek() != "(".code) return;
		q.skip();
		skipExprUntil([")".code], end);
		if (q.peek() == ")".code) q.skip();
	}
	
	function skipSpacesAndComments(end:Int):Void {
		while (q.pos < end) {
			q.skipSpaces1x(end);
			if (q.peek() == "/".code && q.peek(1) == "*".code) {
				q.skip(2);
				q.skipComment();
			} else if (q.peek() == "/".code && q.peek(1) == "/".code) {
				q.skip(2);
				q.skipLine();
			} else break;
		}
	}
	
	function getDeclarationScope(kind:String):GlobalSearchTypeScope {
		if (kind == "let" || kind == "const" || kind == "args") return scope;
		var s = scope;
		while (s.parent != null && !s.isFunction) s = s.parent;
		return s;
	}
	
	function parseFunction(functionStart:Int, end:Int):Void {
		var parentScope = scope;
		q.skipSpaces1x(end);
		if (q.peek().isIdent0()) {
			var nameStart = q.pos;
			q.skipIdent1();
			q.skipSpaces1x(end);
		}
		if (q.peek() != "(".code) return;
		
		var fnScope = ctx.addScope(functionStart, end, parentScope, true, null);
		addMethodCapturedVars(fnScope, parentScope, functionStart);
		q.skip();
		parseFunctionArgs(fnScope, end);
		var isConstructor = skipFunctionSuffix(end);
		
		var bodyStart = findNextFunctionBody(end);
		if (bodyStart < 0) return;
		var bodyEnd = findMatchingBrace(bodyStart, end);
		if (bodyEnd < 0) return;
		
		if (isConstructor) {
			var functionName = readFunctionName(functionStart);
			if (functionName != null) fnScope.selfType = GmlTypeDef.simple(functionName);
		}
		
		fnScope.end = bodyEnd;
		scanRange(bodyStart + 1, bodyEnd, fnScope);
		q.pos = bodyEnd + 1;
	}
	
	function addMethodCapturedVars(fnScope:GlobalSearchTypeScope, parentScope:GlobalSearchTypeScope, functionStart:Int):Void {
		var methodStart = code.lastIndexOf("method", functionStart);
		if (methodStart < 0 || functionStart - methodStart > 512) return;
		if (methodStart > 0 && code.fastCodeAt(methodStart - 1).isIdent1()) return;
		var p = methodStart + "method".length;
		while (p < functionStart && code.fastCodeAt(p).isSpace1()) p++;
		if (p >= functionStart || code.fastCodeAt(p) != "(".code) return;
		var captureText = code.substring(p + 1, functionStart);
		if (captureText.indexOf("scope") < 0 && captureText.indexOf("self") < 0) return;
		var i = 0;
		while (i < captureText.length) {
			var c = captureText.fastCodeAt(i);
			if (!c.isIdent0()) {
				i++;
				continue;
			}
			var start = i++;
			while (i < captureText.length && captureText.fastCodeAt(i).isIdent1()) i++;
			var name = captureText.substring(start, i);
			var t = lookupScopeChain(parentScope, name, functionStart, false);
			if (t != null) fnScope.addVar(name, functionStart, t);
		}
	}
	
	function lookupScopeChain(scope:GlobalSearchTypeScope, name:String, offset:Int, matchCase:Bool):GmlType {
		while (scope != null) {
			var t = scope.lookup(name, offset, matchCase);
			if (t != null) return t;
			scope = scope.parent;
		}
		return null;
	}
	
	function parseFunctionArgs(fnScope:GlobalSearchTypeScope, end:Int):Void {
		while (q.pos < end) {
			q.skipSpaces1x(end);
			if (q.peek() == ")".code) {
				q.skip();
				return;
			}
			if (q.peekstr(3) == "...") {
				q.skip(3);
				q.skipSpaces1x(end);
			}
			if (q.peek() == "?".code) {
				q.skip();
				q.skipSpaces1x(end);
			}
			var nameStart = q.pos;
			if (!q.peek().isIdent0()) {
				q.skip();
				continue;
			}
			q.skipIdent1();
			var name = q.substring(nameStart, q.pos);
			var t = readInlineType(end);
			if (t != null) fnScope.addVar(name, nameStart, t);
			q.skipSpaces1x(end);
			if (q.peek() == "=".code) {
				q.skip();
				var exprStart = q.pos;
				skipExprUntil([",".code, ")".code], end);
				if (exprStart < q.pos) scanRange(exprStart, q.pos, fnScope);
			}
			q.skipSpaces1x(end);
			switch (q.peek()) {
				case ",".code: q.skip();
				case ")".code: q.skip(); return;
				default:
			}
		}
	}
	
	function readInlineType(end:Int):GmlType {
		q.skipSpaces1x(end);
		var typeStr:String = null;
		if (q.peek() == ":".code && q.peek(1) != "=".code) {
			q.skip();
			var typeStart = q.pos;
			if (q.skipType(end)) typeStr = q.substring(typeStart, q.pos);
		} else if (q.peek() == "/".code && q.peek(1) == "*".code && q.peek(2) == ":".code) {
			q.skip(3);
			var typeStart = q.pos;
			q.skipComment();
			var commentEnd = q.pos;
			q.pos = typeStart;
			if (q.skipType(commentEnd)) {
				q.skipSpaces1x(commentEnd);
				if (q.pos == commentEnd - 2) typeStr = q.substring(typeStart, commentEnd - 2);
			}
			q.pos = commentEnd;
		}
		return typeStr != null ? GmlTypeDef.parse(typeStr, "global search function argument") : null;
	}
	
	function skipFunctionSuffix(end:Int):Bool {
		var isConstructor = false;
		while (q.pos < end) {
			skipSpacesAndComments(end);
			if (q.peek() == "/".code && q.peek(1) == "*".code) {
				q.skip(2);
				q.skipComment();
				continue;
			}
			if (q.peekstr(2) == "->") {
				q.skip(2);
				q.skipType(end);
				continue;
			}
			if (q.peek() == ":".code) {
				q.skip();
				skipFunctionColonSuffix(end);
				continue;
			}
			if (q.skipIfIdentEquals("constructor")) {
				isConstructor = true;
				continue;
			}
			break;
		}
		return isConstructor;
	}
	
	function skipFunctionColonSuffix(end:Int):Void {
		var depth = 0;
		while (q.pos < end) {
			skipSpacesAndComments(end);
			var p = q.pos;
			var c = q.read();
			if (depth == 0) {
				if (c == "{".code || c == ";".code || c == ",".code) {
					q.pos = p;
					return;
				}
				if (c.isIdent0()) {
					q.skipIdent1();
					var ident = q.substring(p, q.pos);
					if (ident == "constructor") {
						q.pos = p;
						return;
					}
					continue;
				}
			}
			switch (c) {
				case "/".code: switch (q.peek()) {
					case "/".code: q.skipLine();
					case "*".code: q.skip(); q.skipComment();
					default:
				}
				case '"'.code, "'".code, "@".code, "`".code:
					q.skipStringAuto(c, version);
				case "$".code if (q.isDqTplStart(version)):
					q.skipDqTplString(version);
				case "(".code, "[".code, "{".code:
					depth += 1;
				case ")".code, "]".code, "}".code:
					if (depth <= 0) {
						q.pos = p;
						return;
					}
					depth -= 1;
				default:
			}
		}
	}
	
	function findNextFunctionBody(end:Int):Int {
		while (q.pos < end) {
			q.skipSpaces1x(end);
			switch (q.peek()) {
				case "{".code: return q.pos;
				case ";".code, ",".code, ")".code: return -1;
				case "/".code: switch (q.peek(1)) {
					case "/".code: q.skip(2); q.skipLine();
					case "*".code: q.skip(2); q.skipComment();
					default: q.skip();
				}
				case "=".code if (q.peek(1) == ">".code): q.skip(2);
				case _ if (q.peek().isIdent0()): q.skipIdent1();
				default: q.skip();
			}
		}
		return -1;
	}
	
	function findMatchingBrace(openPos:Int, end:Int):Int {
		var oldPos = q.pos;
		q.pos = openPos + 1;
		var depth = 1;
		while (q.pos < end) {
			var p = q.pos;
			var c = q.read();
			switch (c) {
				case "/".code: switch (q.peek()) {
					case "/".code: q.skipLine();
					case "*".code: q.skip(); q.skipComment();
					default:
				}
				case '"'.code, "'".code, "@".code, "`".code:
					q.skipStringAuto(c, version);
				case "$".code if (q.isDqTplStart(version)):
					q.skipDqTplString(version);
				case "{".code:
					depth += 1;
				case "}".code:
					depth -= 1;
					if (depth <= 0) {
						var found = p;
						q.pos = oldPos;
						return found;
					}
				default:
			}
		}
		q.pos = oldPos;
		return -1;
	}
	
	function skipExprUntil(stops:Array<CharCode>, end:Int):Void {
		var depth = 0;
		while (q.pos < end) {
			var p = q.pos;
			var c = q.read();
			if (depth == 0) {
				for (stop in stops) if (c == stop) {
					q.pos = p;
					return;
				}
			}
			switch (c) {
				case "/".code: switch (q.peek()) {
					case "/".code: q.skipLine();
					case "*".code: q.skip(); q.skipComment();
					default:
				}
				case '"'.code, "'".code, "@".code, "`".code:
					q.skipStringAuto(c, version);
				case "$".code if (q.isDqTplStart(version)):
					q.skipDqTplString(version);
				case "(".code, "[".code, "{".code:
					depth += 1;
				case ")".code, "]".code, "}".code:
					depth -= 1;
					if (depth < 0) {
						q.pos = p;
						return;
					}
				default:
			}
		}
	}
	
	function readFunctionName(functionStart:Int):String {
		var oldPos = q.pos;
		q.pos = functionStart + "function".length;
		q.skipSpaces1x(code.length);
		var name:String = null;
		if (q.peek().isIdent0()) {
			var start = q.pos;
			q.skipIdent1();
			name = q.substring(start, q.pos);
		}
		q.pos = oldPos;
		return name;
	}
	
	function getRootSelfType(ctxName:String):GmlType {
		if (Project.current.resourceTypes[fileName] == "object") {
			return GmlTypeDef.simple(fileName);
		}
		var doc = GmlAPI.gmlDoc[ctxName];
		if (doc != null) {
			if (doc.isConstructor) return GmlTypeDef.simple(ctxName);
			return doc.selfType;
		}
		return null;
	}
	
	public function accepts(ctxName:String, offset:Int, text:String, matchCase:Bool, invert:Bool = false):Bool {
		if (!isIdentAt(offset, text.length)) return false;
		var ctx = contexts[ctxName];
		if (ctx == null) return false;
		var actual = getTypeAt(ctx, offset, text, matchCase);
		if (actual == null) actual = getMethodCaptureType(ctx, offset, text, matchCase);
		if (actual == null) return false;
		var matches = typeMatches(actual);
		return invert ? !matches : matches;
	}
	
	function getMethodCaptureType(ctx:GlobalSearchTypeContext, offset:Int, name:String, matchCase:Bool):GmlType {
		var methodStart = code.lastIndexOf("method", offset);
		if (methodStart < 0 || offset - methodStart > 4096) return null;
		if (methodStart > 0 && code.fastCodeAt(methodStart - 1).isIdent1()) return null;
		var p = methodStart + "method".length;
		while (p < offset && code.fastCodeAt(p).isSpace1()) p++;
		if (p >= offset || code.fastCodeAt(p) != "(".code) return null;
		var functionStart = code.indexOf("function", methodStart);
		if (functionStart < 0 || functionStart - methodStart > 4096) return null;
		var captureText = code.substring(p + 1, functionStart);
		if (captureText.indexOf("scope") < 0 && captureText.indexOf("self") < 0) return null;
		return lookupScopeChain(ctx.findScope(methodStart), name, methodStart, matchCase);
	}
	
	function getTypeAt(ctx:GlobalSearchTypeContext, offset:Int, name:String, matchCase:Bool):GmlType {
		var dot = findDotBefore(offset);
		if (dot >= 0) {
			var base = readIdentBefore(dot);
			if (base == null) return null;
			if (base == "global") {
				return getGlobalFieldType(ctx, name, matchCase);
			}
			var baseType = base == "self"
				? ctx.findScope(offset).selfType
				: ctx.lookup(base, dot, matchCase);
			return getFieldType(baseType, name, matchCase);
		}
		var localType = ctx.lookup(name, offset, matchCase);
		if (localType != null) return localType;
		var globalType = getGlobalType(ctx, name, matchCase);
		if (globalType != null) return globalType;
		return getFieldType(ctx.findScope(offset).selfType, name, matchCase);
	}
	
	function getGlobalType(ctx:GlobalSearchTypeContext, name:String, matchCase:Bool):GmlType {
		var t = getGlobalTypeNoMacro(ctx, name, matchCase);
		if (t != null) return t;
		return getMacroType(ctx, name, matchCase);
	}
	
	function getGlobalTypeNoMacro(ctx:GlobalSearchTypeContext, name:String, matchCase:Bool):GmlType {
		var t = lookupType(ctx.globalTypes, name, matchCase);
		if (t != null) return t;
		t = lookupType(GmlAPI.gmlTypes, name, matchCase);
		if (t != null) return t;
		t = lookupType(GmlAPI.gmlGlobalTypes, name, matchCase);
		if (t != null) return t;
		var doc = lookupDoc(GmlAPI.gmlDoc, name, matchCase);
		if (doc != null) return doc.getFunctionType();
		doc = lookupDoc(GmlAPI.stdDoc, name, matchCase);
		if (doc != null) return doc.getFunctionType();
		doc = lookupDoc(GmlAPI.extDoc, name, matchCase);
		return doc != null ? doc.getFunctionType() : null;
	}
	
	function getGlobalFieldType(ctx:GlobalSearchTypeContext, name:String, matchCase:Bool):GmlType {
		var t = lookupType(ctx.globalTypes, name, matchCase);
		if (t != null) return t;
		return lookupType(GmlAPI.gmlGlobalTypes, name, matchCase);
	}
	
	function getFieldType(owner:GmlType, field:String, matchCase:Bool):GmlType {
		if (owner == null) return null;
		owner = owner.unwrapNullable().resolve();
		switch (owner) {
			case TAnon(inf):
				var fd = lookupAnonField(inf.fields, field, matchCase);
				return fd != null ? fd.type : null;
			case TInst(_, params, KType):
				if (params.length <= 0) return null;
				var ns = GmlAPI.gmlNamespaces[params[0].getNamespace()];
				return ns != null ? lookupType(ns.staticTypes, field, matchCase) : null;
			case TInst(nsName, _, _):
				var ns = GmlAPI.gmlNamespaces[nsName];
				return ns != null ? getNamespaceInstType(ns, field, matchCase) : null;
			default:
				return null;
		}
	}
	
	function getNamespaceInstType(ns:gml.GmlNamespace, field:String, matchCase:Bool):GmlType {
		var doc = ns.getInstDoc(field);
		var t = ns.getInstType(field);
		t = chooseFieldType(t, doc != null ? doc.getFunctionType() : null);
		if (t != null) return t;
		doc = lookupDoc(ns.docStaticMap, field, matchCase);
		t = lookupType(ns.staticTypes, field, matchCase);
		t = chooseFieldType(t, doc != null ? doc.getFunctionType() : null);
		if (t != null) return t;
		if (matchCase) return null;
		doc = lookupDoc(ns.docInstMap, field, false);
		t = lookupType(ns.instTypes, field, false);
		t = chooseFieldType(t, doc != null ? doc.getFunctionType() : null);
		if (t != null) return t;
		doc = lookupDoc(ns.docStaticMap, field, false);
		t = lookupType(ns.staticTypes, field, false);
		return chooseFieldType(t, doc != null ? doc.getFunctionType() : null);
	}
	
	function chooseFieldType(type:GmlType, docType:GmlType):GmlType {
		if (type == null || type.isAny() || isUnknownCallableType(type)) return docType != null ? docType : type;
		return type;
	}
	
	function getUniqueFieldType(field:String, matchCase:Bool):GmlType {
		var key = matchCase ? field : field.toLowerCase();
		if (uniqueFieldTypeMisses[key]) return null;
		var cached = uniqueFieldTypes[key];
		if (cached != null) return cached;
		var found:GmlType = null;
		var ambiguous = false;
		for (_ => ns in GmlAPI.gmlNamespaces) {
			var t = getNamespaceInstType(ns, field, matchCase);
			if (t == null) continue;
			if (isUnknownCallableType(t)) continue;
			if (getEffectiveValueType(t).isAny()) continue;
			if (found == null) {
				found = t;
			} else if (!fieldTypesMatch(found, t)) {
				ambiguous = true;
				break;
			}
		}
		if (!ambiguous && found != null) {
			uniqueFieldTypes[key] = found;
			return found;
		}
		uniqueFieldTypeMisses[key] = true;
		return null;
	}
	
	function fieldTypesMatch(a:GmlType, b:GmlType):Bool {
		if (a.equals(b)) return true;
		return getEffectiveValueType(a).unwrapNullable().equals(getEffectiveValueType(b).unwrapNullable());
	}
	
	function getEffectiveValueType(t:GmlType):GmlType {
		var rt = getReturnType(t);
		return rt != null ? rt : t;
	}
	
	function isUnknownCallableType(t:GmlType):Bool {
		if (t == null) return false;
		t = t.unwrapNullable().resolve();
		return switch (t) {
			case TInst(_, params, kind) if (kind == KFunction || kind == KConstructor):
				params.length == 0 || params[params.length - 1] == null;
			default:
				false;
		}
	}
	
	function getReturnType(t:GmlType):GmlType {
		if (t == null) return null;
		t = t.unwrapNullable().resolve();
		return switch (t) {
			case TInst(_, params, kind) if (kind == KFunction || kind == KConstructor):
				params.length > 0 ? params[params.length - 1] : null;
			default:
				null;
		}
	}
	
	function getIndexedType(t:GmlType):GmlType {
		if (t == null) return null;
		t = t.unwrapNullable().resolve();
		return switch (t) {
			case TInst(_, params, kind) if (kind == KArray || kind == KCustomKeyArray || kind == KList || kind == KGrid):
				params.length > 0 ? params[0] : null;
			case TInst(_, params, KMap):
				params.length > 1 ? params[1] : null;
			default:
				null;
		}
	}
	
	function getMapKeyType(t:GmlType):GmlType {
		if (t == null) return null;
		t = t.unwrapNullable().resolve();
		return switch (t) {
			case TInst(_, params, KMap):
				params.length > 0 ? params[0] : null;
			default:
				null;
		}
	}
	
	function getMacroType(ctx:GlobalSearchTypeContext, name:String, matchCase:Bool):GmlType {
		var m = lookupMacro(GmlAPI.gmlMacros, name, matchCase);
		if (m == null) return null;
		return inferSimplePathType(ctx, m.expr, matchCase);
	}
	
	function inferSimplePathType(ctx:GlobalSearchTypeContext, expr:String, matchCase:Bool):GmlType {
		if (expr == null) return null;
		var parts = StringTools.trim(expr).split(".");
		if (parts.length == 0) return null;
		var first = StringTools.trim(parts[0]);
		if (!isSimpleIdentString(first)) return null;
		var t = getGlobalTypeNoMacro(ctx, first, matchCase);
		if (t == null && GmlAPI.gmlNamespaces[first] != null) {
			t = GmlTypeDef.simple(first);
		}
		if (t == null) return null;
		for (i in 1 ... parts.length) {
			var part = StringTools.trim(parts[i]);
			if (!isSimpleIdentString(part)) return null;
			t = getFieldType(t, part, matchCase);
			if (t == null) return null;
		}
		return t;
	}
	
	function typeMatches(actual:GmlType):Bool {
		if (actual == null) return false;
		return actual.unwrapNullable().equals(target.unwrapNullable());
	}
	
	function lookupType(map:Dictionary<GmlType>, name:String, matchCase:Bool):GmlType {
		if (map == null) return null;
		var t = map[name];
		if (t != null || matchCase) return t;
		var lower = name.toLowerCase();
		for (key => value in map) {
			if (key.toLowerCase() == lower) return value;
		}
		return null;
	}
	
	function lookupAnonField(map:Dictionary<GmlTypeAnonField>, name:String, matchCase:Bool):GmlTypeAnonField {
		var fd = map[name];
		if (fd != null || matchCase) return fd;
		var lower = name.toLowerCase();
		for (key => value in map) {
			if (key.toLowerCase() == lower) return value;
		}
		return null;
	}
	
	function lookupDoc(map:Dictionary<GmlFuncDoc>, name:String, matchCase:Bool):GmlFuncDoc {
		if (map == null) return null;
		var doc = map[name];
		if (doc != null || matchCase) return doc;
		var lower = name.toLowerCase();
		for (key => value in map) {
			if (key.toLowerCase() == lower) return value;
		}
		return null;
	}
	
	function lookupMacro(map:Dictionary<GmlMacro>, name:String, matchCase:Bool):GmlMacro {
		if (map == null) return null;
		var m = map[name];
		if (m != null || matchCase) return m;
		var lower = name.toLowerCase();
		for (key => value in map) {
			if (key.toLowerCase() == lower) return value;
		}
		return null;
	}
	
	function isSimpleIdentString(s:String):Bool {
		if (s == null || s.length == 0) return false;
		if (!s.fastCodeAt(0).isIdent0()) return false;
		for (i in 1 ... s.length) {
			if (!s.fastCodeAt(i).isIdent1()) return false;
		}
		return true;
	}
	
	function isIdentAt(offset:Int, len:Int):Bool {
		if (offset < 0 || offset + len > code.length) return false;
		var c = code.fastCodeAt(offset);
		if (!c.isIdent0()) return false;
		var end = offset + len;
		for (i in offset + 1 ... end) {
			if (!code.fastCodeAt(i).isIdent1()) return false;
		}
		return (offset <= 0 || !code.fastCodeAt(offset - 1).isIdent1())
			&& (end >= code.length || !code.fastCodeAt(end).isIdent1());
	}
	
	function skipSpacesBack(pos:Int):Int {
		var p = pos;
		while (p >= 0 && code.fastCodeAt(p).isSpace1()) p--;
		return p;
	}
	
	function findDotBefore(offset:Int):Int {
		var p = skipSpacesBack(offset - 1);
		if (p >= 0 && code.fastCodeAt(p) == ".".code) return p;
		return -1;
	}
	
	function readIdentBefore(offset:Int):String {
		var endAt = skipSpacesBack(offset - 1);
		if (endAt >= 0 && code.fastCodeAt(endAt) == "?".code) {
			endAt = skipSpacesBack(endAt - 1);
		}
		var end = endAt + 1;
		var start = end;
		while (start > 0 && code.fastCodeAt(start - 1).isIdent1()) start--;
		if (start >= end || !code.fastCodeAt(start).isIdent0()) return null;
		return code.substring(start, end);
	}
}

private class GlobalSearchTypeContext {
	public var name:String;
	public var root:GlobalSearchTypeScope;
	public var scopes:Array<GlobalSearchTypeScope> = [];
	public var globalTypes:Dictionary<GmlType> = new Dictionary();
	public function new(name:String, start:Int, end:Int, selfType:GmlType) {
		this.name = name;
		root = addScope(start, end, null, true, selfType);
	}
	public function addScope(
		start:Int, end:Int, parent:GlobalSearchTypeScope, isFunction:Bool, selfType:GmlType
	):GlobalSearchTypeScope {
		var scope = new GlobalSearchTypeScope(start, end, parent, isFunction, selfType);
		scopes.push(scope);
		return scope;
	}
	public function findScope(offset:Int):GlobalSearchTypeScope {
		var best = root;
		for (scope in scopes) {
			if (scope.start <= offset && offset <= scope.end && scope.depth >= best.depth) {
				best = scope;
			}
		}
		return best;
	}
	public function lookup(name:String, offset:Int, matchCase:Bool):GmlType {
		var scope = findScope(offset);
		while (scope != null) {
			var t = scope.lookup(name, offset, matchCase);
			if (t != null) return t;
			scope = scope.parent;
		}
		return null;
	}
}

private class GlobalSearchTypeScope {
	public var start:Int;
	public var end:Int;
	public var parent:GlobalSearchTypeScope;
	public var isFunction:Bool;
	public var selfType:GmlType;
	public var depth:Int;
	var vars:Dictionary<Array<GlobalSearchTypeVar>> = new Dictionary();
	public function new(start:Int, end:Int, parent:GlobalSearchTypeScope, isFunction:Bool, selfType:GmlType) {
		this.start = start;
		this.end = end;
		this.parent = parent;
		this.isFunction = isFunction;
		this.selfType = selfType != null ? selfType : parent != null ? parent.selfType : null;
		this.depth = parent != null ? parent.depth + 1 : 0;
	}
	public function addVar(name:String, start:Int, type:GmlType):Void {
		var list = vars[name];
		if (list == null) {
			list = [];
			vars[name] = list;
		}
		list.push(new GlobalSearchTypeVar(name, start, type));
	}
	public function lookup(name:String, offset:Int, matchCase:Bool):GmlType {
		var best = lookupList(vars[name], offset);
		if (best != null || matchCase) return best;
		var lower = name.toLowerCase();
		var bestStart = -1;
		for (key => list in vars) {
			if (key.toLowerCase() != lower) continue;
			var v = lookupVar(list, offset);
			if (v != null && v.start > bestStart) {
				best = v.type;
				bestStart = v.start;
			}
		}
		return best;
	}
	function lookupList(list:Array<GlobalSearchTypeVar>, offset:Int):GmlType {
		var v = lookupVar(list, offset);
		return v != null ? v.type : null;
	}
	function lookupVar(list:Array<GlobalSearchTypeVar>, offset:Int):GlobalSearchTypeVar {
		if (list == null) return null;
		var i = list.length;
		while (--i >= 0) {
			var v = list[i];
			if (v.start <= offset) return v;
		}
		return null;
	}
}

private class GlobalSearchTypeVar {
	public var name:String;
	public var start:Int;
	public var type:GmlType;
	public function new(name:String, start:Int, type:GmlType) {
		this.name = name;
		this.start = start;
		this.type = type;
	}
}
