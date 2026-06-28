package parsers.linter;
import ace.AceGmlContextResolver;
import ace.AceGmlTools;
import ace.AceWrap;
import file.kind.gml.KGmlScript;
import gml.GmlFuncDoc;
import gml.GmlImports;
import gml.GmlLocals;
import gml.GmlNamespace;
import gml.GmlNamespace.GmlNamespaceAccessInfo;
import gml.file.GmlFileKindTools;
import gml.type.GmlType;
import gml.Project;
import gml.type.GmlTypeCanCastTo;
import gml.type.GmlTypeDef;
import gml.type.GmlTypeTools;
import haxe.ds.ReadOnlyArray;
import js.lib.RegExp;
import parsers.linter.GmlLinterInit;
import parsers.linter.GmlLinterReadFlags;
import parsers.linter.misc.GmlLinterPrefsState;
import parsers.GmlSeekData;
import tools.Aliases;
import tools.Dictionary;
import editors.EditCode;
import parsers.linter.GmlLinterKind;
import gml.GmlVersion;
import ace.extern.*;
import tools.IntDictionary;
import tools.JsTools;
import tools.NativeObject;
import tools.macros.GmlLinterMacros.*;
import gml.GmlAPI;
import js.html.Console;
using gml.type.GmlTypeTools;
using tools.NativeArray;
using tools.NativeString;

/**
 * ...
 * @author YellowAfterlife
 */
class GmlLinter {
	
	public static function getOption<T>(fn:GmlLinterPrefs->T):T {
		var lp = Project.current.properties.linterPrefs;
		var r:T = null;
		for (_ in 0 ... 1) {
			if (lp != null) {
				r = fn(lp);
				if (r != null) break;
			}
			r = fn(ui.Preferences.current.linterPrefs);
			if (r != null) break;
			r = fn(GmlLinterPrefs.defValue);
		}
		return r;
	}
	//
	public var errorText:String = null;
	public var errorPos:AcePos = null;
	function setError(text:String):Void {
		if (errorPos != null) return;
		errorText = text + reader.getStack();
		errorPos = reader.getTopPos();
	}
	//
	public var warnings:Array<GmlLinterProblem> = [];
	function addWarning(text:String):Void {
		if (prefs.suppressAll || isProperties) return;
		warnings.push(new GmlLinterProblem(text + reader.getStack(), reader.getTopPos()));
	}
	public var errors:Array<GmlLinterProblem> = [];
	function addError(text:String):Void {
		if (prefs.suppressAll || isProperties) return;
		errors.push(new GmlLinterProblem(text + reader.getStack(), reader.getTopPos()));
	}
	//
	
	var reader:GmlReaderExt;
	
	var editor:EditCode;
	var functionsAreGlobal:Bool;
	var macroCache:Dictionary<GmlCode> = new Dictionary();
	
	/**
	 * Context name - such as current script name or event name.
	 * Note: this can be modified by GmlLinterParser!
	 */
	var context(default, set):String = "";
	public function set_context(ctx:String):String {
		context = ctx;
		contextInstTypes = new Dictionary();
		if (setLocalVars || setLocalTypes) {
			if ((editor.kind is file.kind.gml.KGmlEvents) && ctx == "properties") {
				// don't re-index properties
			} else {
				if (setLocalVars) editor.locals[ctx] = new GmlLocals(ctx);
				if (setLocalTypes) getImports(true).localTypes = new Dictionary();
			}
		}
		return ctx;
	}
	var localVarTokenType:AceTokenType = "local";
	var funcLiteralDepth:Int = 0;
	var constructorInstVars:Dictionary<Bool> = null;
	var instAccessWarnings:Dictionary<Bool> = new Dictionary();
	
	function getImports(?force:Bool):GmlImports {
		var imp = editor.imports[context];
		if (imp == null && force) {
			imp = new GmlImports();
			editor.imports[context] = imp;
		}
		return imp;
	}

	var nullSafetyLocalTypes:Dictionary<Array<GmlType>> = new Dictionary();
	function pushNullSafetyLocalType(name:String, type:GmlType):Void {
		var stack = nullSafetyLocalTypes[name];
		if (stack == null) {
			stack = [];
			nullSafetyLocalTypes[name] = stack;
		}
		stack.push(type);
	}
	function popNullSafetyLocalType(name:String):Void {
		var stack = nullSafetyLocalTypes[name];
		if (stack == null) return;
		stack.pop();
		if (stack.length == 0) nullSafetyLocalTypes.remove(name);
	}
	function getNullSafetyLocalType(name:String):GmlType {
		var stack = nullSafetyLocalTypes[name];
		return stack != null && stack.length > 0 ? stack[stack.length - 1] : null;
	}

	static var inlineIsRx = new RegExp("\\/\\/\\/\\s*@is\\b\\s*(?:\\{(.+?)\\})?");
	var contextInstTypes:Dictionary<GmlType> = new Dictionary();
	var namespaceInstTypes:Dictionary<Dictionary<GmlType>> = new Dictionary();
	function getContextInstType(name:String):GmlType {
		return contextInstTypes != null ? contextInstTypes[name] : null;
	}
	function getContextNamespaceInstType(namespace:String, field:String):GmlType {
		var fields = namespaceInstTypes != null ? namespaceInstTypes[namespace] : null;
		return fields != null ? fields[field] : null;
	}
	function setContextInstType(name:String, type:GmlType):Void {
		if (type == null) return;
		if (contextInstTypes == null) contextInstTypes = new Dictionary();
		contextInstTypes[name] = type;
		if (setLocalTypes) {
			getImports(true).localTypes[name] = type;
		}
		var selfType = getSelfType();
		var nsName = selfType != null ? selfType.unwrapNullable().getNamespace() : null;
		if (nsName != null) {
			if (namespaceInstTypes == null) namespaceInstTypes = new Dictionary();
			var fields = namespaceInstTypes[nsName];
			if (fields == null) {
				fields = new Dictionary();
				namespaceInstTypes[nsName] = fields;
			}
			fields[name] = type;
		}
	}
	function readInlineIsType():GmlType {
		var eol = reader.source.indexOf("\n", reader.pos);
		if (eol < 0) eol = reader.source.length;
		var mt = inlineIsRx.exec(reader.source.substring(reader.pos, eol));
		if (mt == null || mt[1] == null) return null;
		var typeStr = mt[1];
		if (currFuncDoc != null && currFuncDoc.templateItems != null) {
			typeStr = GmlTypeTools.patchTemplateItems(typeStr, currFuncDoc.templateItems);
		}
		var type = GmlTypeDef.parse(typeStr, "@is inline assignment");
		var imp = getImports();
		if (imp == null) imp = editor.imports[""];
		return GmlTypeTools.mapImportedNames(type, imp);
	}
	
	/**
	 * If the linter is currently walking about a function, this holds that.
	 * For full-file linting this will reflect upon sub-functions, but for
	 * getType it will only have the top-level function info (which is mostly OK).
	 */
	var currFuncDoc:GmlFuncDoc;
	var currFuncRetStatus:GmlLinterReturnStatus = NoReturn;

	var __selfType_set = false;
	var __selfType_type:GmlType = null;
	function getSelfType() {
		if (__selfType_set) return __selfType_type;
		var t = AceGmlTools.getSelfTypeForFile(editor.file, context);
		if (t == null && prefs.strictScriptSelf) t = GmlTypeDef.void;
		return t;
	}
	function getSelfNamespaceName():String {
		var t = getSelfType();
		return t != null ? t.unwrapNullable().getNamespace() : null;
	}

	
	
	var __otherType_set = false;
	var __otherType_type:GmlType = null;
	function getOtherType() {
		if (__otherType_set) return __otherType_type;
		return AceGmlTools.getOtherType({ session: editor.session, scope: context });
	}

	function isInstanceVarDeclarationBody(oldDepth:Int):Bool {
		if (currFuncDoc != null && currFuncDoc.isConstructor) {
			if (funcLiteralDepth != 1) return false;
			return prefs.specTypeInstSubTopLevel ? oldDepth >= 2 : oldDepth == 2;
		}
		if ((editor.kind is file.kind.gml.KGmlEvents)) {
			if (context != "create" || funcLiteralDepth != 0) return false;
			return prefs.specTypeInstSubTopLevel ? oldDepth >= 1 : oldDepth == 1;
		}
		return false;
	}

	function isKnownNonInstanceIdentifier(name:String):Bool {
		if (name == "global" || name == "self" || name == "other") return true;
		if (GmlAPI.gmlKind[name] != null) return true;
		if (GmlAPI.extKind.exists(name)) return true;
		return GmlAPI.stdKind.exists(name);
	}

	function isMissingInstanceField(name:String):Bool {
		var t = getSelfType();
		if (t == null) return false;
		return switch (t) {
			case TInst(_, _, KAny): false;
			case TInst(nsName, _, _): {
				var foundNamespace = false;
				var imp = getImports();
				if (imp != null) {
					var ns = imp.namespaces[nsName];
					if (ns != null) {
						foundNamespace = true;
						if (ns.getInstKind(name, 0, nsName) != null) return false;
					}
				}
				var ns = GmlAPI.gmlNamespaces[nsName];
				if (ns != null) {
					foundNamespace = true;
					if (ns.getInstKind(name, 0, nsName) != null) return false;
				}
				foundNamespace;
			};
			case TAnon(inf): inf.fields[name] == null;
			default: false;
		}
	}

	function isInheritedInstanceField(name:String):Bool {
		var t = getSelfType();
		if (t == null) return false;
		inline function check(ns:GmlNamespace):Bool {
			return ns != null && ns.parent != null && ns.parent.getInstKind(name, 0, ns.name) != null;
		}
		return switch (t) {
			case TInst(_, _, KAny): false;
			case TInst(nsName, _, _): {
				var imp = getImports();
				if (imp != null && check(imp.namespaces[nsName])) true;
				else check(GmlAPI.gmlNamespaces[nsName]);
			};
			default: false;
		}
	}

	function getInaccessibleInheritedInstanceField(name:String):GmlNamespaceAccessInfo {
		var t = getSelfType();
		if (t == null) return null;
		return switch (t) {
			case TInst(_, _, KAny): null;
			case TInst(nsName, _, _): {
				inline function check(ns:GmlNamespace):GmlNamespaceAccessInfo {
					if (ns == null || ns.parent == null) return null;
					var access = ns.parent.getInstAccess(name);
					if (access != null && !GmlNamespace.isAccessAllowed(access.access, access.owner, ns.name)) {
						return access;
					}
					return null;
				}
				var imp = getImports();
				var access = imp != null ? check(imp.namespaces[nsName]) : null;
				access != null ? access : check(GmlAPI.gmlNamespaces[nsName]);
			};
			default: null;
		}
	}

	function warnInstAccess(field:String, access:GmlNamespaceAccessInfo):Void {
		if (access == null) return;
		var key = reader.row + ":" + access.owner + ":" + field;
		if (instAccessWarnings[key]) return;
		instAccessWarnings[key] = true;
		switch (access.access) {
			case Private:
				addWarning('Trying to access private field `$field` of ${access.owner}');
			case Protected:
				addWarning('Trying to access protected field `$field` of ${access.owner}');
			default:
		}
	}

	function checkInstanceVarDeclaration(name:String, oldDepth:Int, isLocal:Bool):Void {
		if (!prefs.warnInstanceVarDeclarations || isLocal || name == null) return;
		var inaccessibleInherited = getInaccessibleInheritedInstanceField(name);
		if (inaccessibleInherited != null) {
			warnInstAccess(name, inaccessibleInherited);
			return;
		}
		if (isInstanceVarDeclarationBody(oldDepth)) {
			if (constructorInstVars != null) {
				constructorInstVars[name] = true;
			}
			return;
		}
		if (isKnownNonInstanceIdentifier(name)) return;
		if (constructorInstVars != null) {
			if (!constructorInstVars.exists(name) && !isInheritedInstanceField(name)) {
				addWarning('Instance variable `$name` is declared outside the class body');
			}
			return;
		}
		if (isMissingInstanceField(name)) {
			addWarning('Instance variable `$name` is declared outside the class body');
		}
	}

	static var implementsLineRx = new RegExp("\\b@implement(?:s)?(?:\\b\\s*\\{(\\w+)\\}|\\b\\s+(\\w+))?");
	static var interfaceLineRx = new RegExp("\\b@interface(?:\\b\\s*\\{(\\w+)\\})?");
	public static var virtualLineRx = new RegExp("\\b@virtual\\b");
	public static var abstractLineRx = new RegExp("\\b@abstract\\b");
	public static var overrideLineRx = new RegExp("\\b@override\\b");
	static var nextFunctionRx = new RegExp("\\bfunction\\s+(\\w+)\\b");
	static var functionDeclLineRx = new RegExp("^\\s*function\\s+(\\w+)\\b");
	public static var constructorParentLineRx = new RegExp("^\\s*function\\s+\\w+\\b[^\\n]*:\\s*(\\w+)\\s*\\(");
	static var staticFieldLineRx = new RegExp("^\\s*static\\s+(\\w+)\\b\\s*=");
	static var instanceFieldLineRx = new RegExp("^\\s*(\\w+)\\s*=");
	function findImplementsWarningPos(source:String, ownName:String, interfaceName:String, ?preferred:AcePos):AcePos {
		var lines = source.split("\n");
		var fallback:AcePos = null;
		var functionFallback:AcePos = null;
		inline function makePos(row:Int, line:String):AcePos {
			var col = line.indexOf("@implement");
			return { row: row, column: col >= 0 ? col : 0 };
		}
		function nextFunctionName(row:Int):String {
			for (i in row ... lines.length) {
				var line = lines[i].trimBoth();
				if (line == "" || line.startsWith("///")) continue;
				var mt = nextFunctionRx.exec(line);
				return mt != null ? mt[1] : null;
			}
			return null;
		}
		function implementsNameAt(row:Int):String {
			if (row < 0 || row >= lines.length) return null;
			var mt = implementsLineRx.exec(lines[row]);
			if (mt == null) return null;
			return mt[1] != null ? mt[1] : mt[2];
		}
		if (preferred != null
			&& implementsNameAt(preferred.row) == interfaceName
			&& nextFunctionName(preferred.row + 1) == ownName) {
			return preferred;
		}
		for (i in 0 ... lines.length) {
			var line = lines[i];
			var fnMatch = functionDeclLineRx.exec(line);
			if (fnMatch != null && fnMatch[1] == ownName) {
				var col = line.indexOf("function");
				functionFallback = { row: i, column: col >= 0 ? col : 0 };
				var j = i - 1;
				while (j >= 0) {
					var prevLine = lines[j];
					var trimmed = prevLine.trimBoth();
					if (trimmed == "" || trimmed.startsWith("///")) {
						if (implementsNameAt(j) == interfaceName) return makePos(j, prevLine);
						j -= 1;
						continue;
					}
					break;
				}
			}
			var mt = implementsLineRx.exec(line);
			if (mt == null) continue;
			var foundName = mt[1] != null ? mt[1] : mt[2];
			if (foundName != interfaceName) continue;
			var pos = makePos(i, line);
			if (fallback == null) fallback = pos;
			if (nextFunctionName(i + 1) == ownName) return pos;
		}
		if (functionFallback != null) return functionFallback;
		return fallback != null ? fallback : { row: 0, column: 0 };
	}
	function updateBraceDepth(line:String, state:{ depth:Int, started:Bool }):Void {
		var i = 0, n = line.length;
		while (i < n) {
			var c = line.fastCodeAt(i++);
			switch (c) {
				case "/".code if (i < n && line.fastCodeAt(i) == "/".code):
					return;
				case '"'.code, "'".code, "`".code:
					while (i < n) {
						var c1 = line.fastCodeAt(i++);
						if (c1 == "\\".code) {
							i += 1;
						} else if (c1 == c) break;
					}
				case "{".code:
					state.depth += 1;
					state.started = true;
				case "}".code:
					state.depth -= 1;
				default:
			}
		}
	}
	function getCurrentInterfaceImplementations(source:String):Dictionary<GmlLinterInterfaceImplementation> {
		var out = new Dictionary<GmlLinterInterfaceImplementation>();
		var pendingNames:Array<String> = null;
		var pendingPositions:Array<AcePos> = null;
		var pendingInterfaceName:String = null;
		var pendingMeta:GmlLinterMemberMeta = null;
		var current:GmlLinterInterfaceImplementation = null;
		var currentBrace = { depth: 0, started: false };
		var lines = source.split("\n");
		inline function getImpl(name:String):GmlLinterInterfaceImplementation {
			var impl = out[name];
			if (impl == null) {
				impl = new GmlLinterInterfaceImplementation(name);
				out[name] = impl;
			}
			return impl;
		}
		inline function clearPending():Void {
			pendingNames = null;
			pendingPositions = null;
			pendingInterfaceName = null;
		}
		for (row in 0 ... lines.length) {
			var line = lines[row];
			var trimmed = line.trimBoth();
			if (trimmed.startsWith("///")) {
				var memberMeta = GmlLinterMemberMeta.fromLine(line, row);
				if (memberMeta != null) pendingMeta = GmlLinterMemberMeta.merge(pendingMeta, memberMeta);
				var mtInterface = interfaceLineRx.exec(line);
				if (mtInterface != null) {
					pendingInterfaceName = mtInterface[1];
					continue;
				}
				var mt = implementsLineRx.exec(line);
				if (mt == null) continue;
				var interfaceName = mt[1] != null ? mt[1] : mt[2];
				if (interfaceName != null) {
					if (pendingNames == null) {
						pendingNames = [];
						pendingPositions = [];
					}
					pendingNames.push(interfaceName);
					var col = line.indexOf("@implement");
					pendingPositions.push({ row: row, column: col >= 0 ? col : 0 });
				}
				continue;
			}
			if (pendingNames != null || pendingInterfaceName != null) {
				if (trimmed == "" || trimmed.startsWith("///")) continue;
				var fnMatch = functionDeclLineRx.exec(line);
				if (fnMatch != null) {
					var ownName = pendingInterfaceName != null ? pendingInterfaceName : fnMatch[1];
					current = getImpl(ownName);
					current.setConstructorLine(row, line);
					if (pendingNames != null) for (i in 0 ... pendingNames.length) {
						current.addInterface(pendingNames[i], pendingPositions[i]);
					}
					currentBrace = { depth: 0, started: false };
				}
				pendingMeta = null;
				clearPending();
			}
			if (current == null) {
				var fnMatch = functionDeclLineRx.exec(line);
				if (fnMatch != null) {
					current = getImpl(fnMatch[1]);
					current.setConstructorLine(row, line);
					currentBrace = { depth: 0, started: false };
					pendingMeta = null;
				}
			}
			if (current != null) {
				// A tag may be on the preceding documentation line or after the member.
				// Keep both so that e.g. @override and @private can be combined.
				var lineMeta = GmlLinterMemberMeta.fromLine(line, row);
				var memberMeta = GmlLinterMemberMeta.merge(pendingMeta, lineMeta);
				var staticMatch = staticFieldLineRx.exec(line);
				if (staticMatch != null) {
					var field = staticMatch[1];
					current.addField(field, true, row, line, memberMeta);
					current.addField(field, false, row, line, memberMeta);
					pendingMeta = null;
				} else {
					var instanceMatch = instanceFieldLineRx.exec(line);
					if (instanceMatch != null) {
						var prevRow = row;
						while (--prevRow >= 0) {
							var prevLine = lines[prevRow];
							var prevTrimmed = prevLine.trimBoth();
							if (prevTrimmed == "") continue;
							if (!prevTrimmed.startsWith("///")) break;
							memberMeta = GmlLinterMemberMeta.merge(
								GmlLinterMemberMeta.fromLine(prevLine, prevRow), memberMeta);
						}
						current.addField(instanceMatch[1], true, row, line, memberMeta);
						pendingMeta = null;
					}
				}
				updateBraceDepth(line, currentBrace);
				if (currentBrace.started && currentBrace.depth <= 0) {
					current = null;
				}
			}
		}
		return out;
	}
	function namespaceHasOwnField(ns:GmlNamespace, field:String, isInst:Bool):Bool {
		if (ns == null) return false;
		return isInst
			? ns.instKind.exists(field) || ns.instTypes.exists(field) || ns.docInstMap.exists(field) || ns.compInst.exists(field)
			: ns.staticKind.exists(field) || ns.staticTypes.exists(field) || ns.docStaticMap.exists(field) || ns.compStatic.exists(field);
	}
	function namespaceHasOwnOrParentField(ns:GmlNamespace, field:String, isInst:Bool, includeSelf:Bool = true, depth:Int = 0):Bool {
		var q = ns, n = depth;
		while (q != null && ++n <= GmlNamespace.maxDepth) {
			if (includeSelf) {
				if (namespaceHasOwnField(q, field, isInst)) return true;
			}
			includeSelf = true;
			q = q.parent;
		}
		return false;
	}
	function namespaceHasInheritedOrInterfaceField(ns:GmlNamespace, field:String, isInst:Bool):Bool {
		if (ns == null) return false;
		if (namespaceHasOwnOrParentField(ns.parent, field, isInst)) return true;
		for (itf in ns.interfaces.array) {
			if (namespaceHasOwnOrParentField(itf, field, isInst)) return true;
		}
		return false;
	}
	function namespaceHasFieldBefore(ns:GmlNamespace, stopAt:GmlNamespace, field:String, isInst:Bool):Bool {
		var q = ns, n = 0;
		while (q != null && q != stopAt && ++n <= GmlNamespace.maxDepth) {
			if (namespaceHasOwnField(q, field, isInst)) return true;
			q = q.parent;
		}
		return false;
	}
	function currentImplHasField(
		currentImpls:Dictionary<GmlLinterInterfaceImplementation>,
		impl:GmlLinterInterfaceImplementation,
		field:String,
		isInst:Bool
	):Bool {
		if (impl == null) return false;
		var fields = isInst ? impl.instFields : impl.staticFields;
		if (fields.exists(field)) return true;
		if (impl.parentName == null || currentImpls == null) return false;
		return currentImplHasField(currentImpls, currentImpls[impl.parentName], field, isInst);
	}
	function findOverrideWarningPos(
		source:String,
		impl:GmlLinterInterfaceImplementation,
		field:String,
		isInst:Bool,
		fallback:AcePos
	):AcePos {
		var lines = source.split("\n");
		if (fallback != null && fallback.row > 0 && fallback.row < lines.length) {
			var row = fallback.row;
			while (--row >= 0) {
				var prevLine = lines[row];
				var trimmed = prevLine.trimBoth();
				if (trimmed == "") continue;
				if (trimmed.startsWith("///")) {
					var memberMeta = GmlLinterMemberMeta.fromLine(prevLine, row);
					if (memberMeta != null && memberMeta.isOverride) return memberMeta.pos;
					continue;
				}
				break;
			}
		}
		var currentName:String = null;
		var currentBrace = { depth: 0, started: false };
		var pendingMeta:GmlLinterMemberMeta = null;
		for (row in 0 ... lines.length) {
			var line = lines[row];
			var trimmed = line.trimBoth();
			if (currentName == null) {
				var fnMatch = functionDeclLineRx.exec(line);
				if (fnMatch != null) {
					currentName = fnMatch[1];
					currentBrace = { depth: 0, started: false };
				}
			}
			if (currentName == impl.name) {
				if (trimmed.startsWith("///")) {
					var memberMeta = GmlLinterMemberMeta.fromLine(line, row);
					if (memberMeta != null) pendingMeta = GmlLinterMemberMeta.merge(pendingMeta, memberMeta);
				} else if (trimmed != "") {
					var staticMatch = staticFieldLineRx.exec(line);
					if (staticMatch != null && staticMatch[1] == field) {
						var col = line.indexOf(field);
						return { row: row, column: col >= 0 ? col : 0 };
					}
					pendingMeta = null;
				}
			}
			if (currentName != null) {
				updateBraceDepth(line, currentBrace);
				if (currentBrace.started && currentBrace.depth <= 0) {
					currentName = null;
					pendingMeta = null;
				}
			}
		}
		var meta = isInst ? impl.instMeta[field] : impl.staticMeta[field];
		return meta != null && meta.isOverride ? meta.pos : fallback;
	}
	function checkVirtualOverrideImplementation(
		impl:GmlLinterInterfaceImplementation,
		currentImpls:Dictionary<GmlLinterInterfaceImplementation>,
		source:String
	):Void {
		var ns = GmlAPI.gmlNamespaces[impl.name];
		if (ns == null) return;
		var checkedOverride = new Dictionary<Bool>();
		inline function checkOverride(field:String, isInst:Bool, pos:AcePos):Void {
			var key = field;
			if (checkedOverride[key]) return;
			checkedOverride[key] = true;
			var found = namespaceHasInheritedOrInterfaceField(ns, field, isInst);
			if (!found && impl.parentName != null && currentImpls != null) {
				found = currentImplHasField(currentImpls, currentImpls[impl.parentName], field, isInst);
			}
			if (!found) {
				pos = findOverrideWarningPos(source, impl, field, isInst, pos);
				errors.push(new GmlLinterProblem(
					'Member `$field` is marked @override but no base/interface member was found',
					pos
				));
			}
		}
		for (field => meta in impl.instMeta) if (meta.isOverride) checkOverride(field, true, meta.pos);
		for (field => meta in impl.staticMeta) if (meta.isOverride) checkOverride(field, false, meta.pos);
		for (field => doc in ns.docInstMap) if (doc != null && doc.isOverride) {
			checkOverride(field, true, findOverrideWarningPos(source, impl, field, true, { row: 0, column: 0 }));
		}
		for (field => doc in ns.docStaticMap) if (doc != null && doc.isOverride) {
			checkOverride(field, false, findOverrideWarningPos(source, impl, field, false, { row: 0, column: 0 }));
		}
	}
	function checkAbstractMembers(impl:GmlLinterInterfaceImplementation):Void {
		var ns = GmlAPI.gmlNamespaces[impl.name];
		if (ns == null || ns.parent == null) return;
		var seen = new Dictionary<Bool>();
		function checkParent(q:GmlNamespace, depth:Int):Void {
			if (q == null || depth >= GmlNamespace.maxDepth) return;
			inline function checkDocs(docs:Dictionary<GmlFuncDoc>, isInst:Bool):Void {
				for (field => doc in docs) {
					if (field == "" || doc == null || !doc.isAbstract) continue;
					var key = field;
					if (seen[key]) continue;
					seen[key] = true;
					var fields = isInst ? impl.instFields : impl.staticFields;
					if (fields.exists(field)
						|| namespaceHasOwnField(ns, field, isInst)
						|| namespaceHasFieldBefore(ns.parent, q, field, isInst)
					) continue;
					var pos = impl.pos != null ? impl.pos : { row: 0, column: 0 };
					errors.push(new GmlLinterProblem(
						'${impl.name} extends ${q.name} but is missing abstract member `$field`',
						pos
					));
				}
			}
			checkDocs(q.docInstMap, true);
			checkDocs(q.docStaticMap, false);
			checkParent(q.parent, depth + 1);
		}
		checkParent(ns.parent, 0);
	}
	function checkVirtualOverrideImplementations(currentImpls:Dictionary<GmlLinterInterfaceImplementation>, source:String):Void {
		if (prefs.suppressAll || isProperties || currentImpls == null) return;
		for (_ => impl in currentImpls) {
			checkVirtualOverrideImplementation(impl, currentImpls, source);
			checkAbstractMembers(impl);
		}
	}
	function implementationHasField(
		impl:GmlLinterInterfaceImplementation,
		ownNs:GmlNamespace,
		field:String,
		isInst:Bool
	):Bool {
		if (impl != null) {
			var fields = isInst ? impl.instFields : impl.staticFields;
			if (fields.exists(field)) return true;
			return ownNs != null ? namespaceHasOwnOrParentField(ownNs.parent, field, isInst) : false;
		}
		return ownNs != null ? namespaceHasOwnOrParentField(ownNs, field, isInst) : false;
	}
	function checkInterfaceFieldMap(
		ownName:String,
		ownNs:GmlNamespace,
		interfaceName:String,
		fields:Dictionary<Dynamic>,
		pos:AcePos,
		impl:GmlLinterInterfaceImplementation,
		seen:Dictionary<Bool>,
		isInst:Bool
	):Void {
		for (field => _ in fields) {
			if (field == "") continue;
			if (seen[field]) continue;
			seen[field] = true;
			if (!implementationHasField(impl, ownNs, field, isInst)) {
				errors.push(new GmlLinterProblem(
					'$ownName implements $interfaceName but is missing member `$field`',
					pos
				));
			}
		}
	}
	function checkCurrentInterfaceFields(
		ownName:String,
		ownNs:GmlNamespace,
		interfaceName:String,
		interfaceImpl:GmlLinterInterfaceImplementation,
		isInst:Bool,
		pos:AcePos,
		impl:GmlLinterInterfaceImplementation,
		seen:Dictionary<Bool>
	):Void {
		if (interfaceImpl == null) return;
		checkInterfaceFieldMap(ownName, ownNs, interfaceName,
			isInst ? cast interfaceImpl.instFields : cast interfaceImpl.staticFields,
			pos, impl, seen, isInst);
	}
	function checkInterfaceMembers(
		ownName:String,
		ownNs:GmlNamespace,
		interfaceName:String,
		interfaceNs:GmlNamespace,
		isInst:Bool,
		pos:AcePos,
		impl:GmlLinterInterfaceImplementation,
		seen:Dictionary<Bool>,
		visited:Dictionary<Bool>,
		depth:Int = 0
	):Void {
		if (interfaceNs == null || depth >= GmlNamespace.maxDepth) return;
		var visitKey = (isInst ? "i:" : "s:") + interfaceNs.name;
		if (visited[visitKey]) return;
		visited[visitKey] = true;

		checkInterfaceFieldMap(ownName, ownNs, interfaceName,
			isInst ? cast interfaceNs.instKind : cast interfaceNs.staticKind,
			pos, impl, seen, isInst);
		checkInterfaceMembers(ownName, ownNs, interfaceName, interfaceNs.parent,
			isInst, pos, impl, seen, visited, depth + 1);
		for (nextInterface in interfaceNs.interfaces) {
			checkInterfaceMembers(ownName, ownNs, interfaceName, nextInterface,
				isInst, pos, impl, seen, visited, depth + 1);
		}
	}
	function checkInterfaceImplementation(ownName:String, interfaceName:String, pos:AcePos,
		?impl:GmlLinterInterfaceImplementation,
		?currentImpls:Dictionary<GmlLinterInterfaceImplementation>
	):Void {
		var ownNs = GmlAPI.gmlNamespaces[ownName];
		if (ownNs == null && impl == null) return;
		var interfaceNs = GmlAPI.gmlNamespaces[interfaceName];
		var interfaceImpl = currentImpls != null ? currentImpls[interfaceName] : null;
		if (interfaceNs == null && interfaceImpl == null) return;
		var seen = new Dictionary();
		checkCurrentInterfaceFields(ownName, ownNs, interfaceName, interfaceImpl,
			true, pos, impl, seen);
		if (interfaceNs != null) {
			checkInterfaceMembers(ownName, ownNs, interfaceName, interfaceNs,
				true, pos, impl, seen, new Dictionary());
		}
		checkCurrentInterfaceFields(ownName, ownNs, interfaceName, interfaceImpl,
			false, pos, impl, seen);
		if (interfaceNs != null) {
			checkInterfaceMembers(ownName, ownNs, interfaceName, interfaceNs,
				false, pos, impl, seen, new Dictionary());
		}
	}
	function checkInterfaceImplementations(source:String):Void {
		if (prefs.suppressAll || isProperties) return;
		var currentImpls = getCurrentInterfaceImplementations(source);
		checkVirtualOverrideImplementations(currentImpls, source);
		if (!currentImpls.isEmpty()) {
			var checked = false;
			for (ownName => impl in currentImpls) {
				for (interfaceName in impl.interfaces) {
					checked = true;
					var pos = findImplementsWarningPos(source, ownName, interfaceName, impl.positions[interfaceName]);
					checkInterfaceImplementation(ownName, interfaceName, pos, impl, currentImpls);
				}
			}
			if (checked) return;
		}
		var path = editor.file.path;
		if (path == null) return;
		var data = GmlSeekData.map[path];
		if (data == null) return;
		for (ownName => interfaceNames in data.namespaceImplements) {
			for (interfaceName in interfaceNames) {
				var pos = findImplementsWarningPos(source, ownName, interfaceName);
				checkInterfaceImplementation(ownName, interfaceName, pos);
			}
		}
	}

	/** depth -> null<variables that should be freed after this depth> */
	var localNamesPerDepth:Array<Array<String>> = [];
	var localKinds:Dictionary<GmlLinterKind> = new Dictionary();
	
	var isProperties:Bool = false;
	var setLocalVars:Bool = false;
	var setLocalTypes:Bool = true;
	
	/** Initializes this linter for being used by GmlReader - no state changes */
	public function initSkipper():Void {
		setLocalTypes = false;
		setLocalVars = false;
		currFuncDoc = null;
	}
	
	/** Used for storing stacktrace when reading {...}/[...]/etc. */
	var seqStart:GmlReaderExt = new GmlReaderExt("", GmlVersion.none);
	function readSeqStartError(text:String):FoundError {
		if (errorPos != null) return true;
		errorText = text + seqStart.getStack();
		errorPos = seqStart.getTopPos();
		return true;
	}
	function readSeqStartWarn(text:String):FoundError {
		if (errorPos != null) return true;
		warnings.push(new GmlLinterProblem(text + seqStart.getStack(), seqStart.getTopPos()));
		return true;
	}
	
	var version:GmlVersion;
	
	/**
	 * Current preferences state
	 * These are merged from multiple layers of linter preferences
	 * Can be modified via @lint
	 */
	public var prefs:GmlLinterPrefsState;
	public var options:GmlLinterOptions;
	
	var expr:GmlLinterExpr;
	var funcLiteral:GmlLinterFuncLiteral;
	var binOps:GmlLinterBinOps;
	var funcArgs:GmlLinterFuncArgs;
	function initModules() {
		funcLiteral = new GmlLinterFuncLiteral(this);
		expr = new GmlLinterExpr(this);
		binOps = new GmlLinterBinOps(this);
		funcArgs = new GmlLinterFuncArgs(this);
	}
	
	public function new() {
		prefs = {};
		var p1 = Project.current.properties.linterPrefs;
		var p2 = ui.Preferences.current.linterPrefs;
		var p3 = GmlLinterPrefs.defValue;
		NativeObject.forField(p1, k -> {
			Reflect.setField(prefs, k, Reflect.field(p1, k));
		});
		NativeObject.forField(p2, k -> {
			if (Reflect.field(prefs, k) == null) {
				Reflect.setField(prefs, k, Reflect.field(p2, k));
			}
		});
		NativeObject.forField(p3, k -> {
			if (Reflect.field(prefs, k) == null) {
				Reflect.setField(prefs, k, Reflect.field(p3, k));
			}
		});
		prefs.forbidNonIdentCalls = !GmlAPI.stdKind.exists("method");
		
		GmlTypeCanCastTo.allowImplicitNullCast = prefs.implicitNullableCasts;
		GmlTypeCanCastTo.allowImplicitBoolIntCasts = prefs.implicitBoolIntCasts;
		GmlTypeCanCastTo.undefinedCastsTo = prefs.undefinedCastsTo;
		GmlTypeCanCastTo.allowNullToAny = false;
		initModules();
	}
	//{
	var nextKind:GmlLinterKind = LKEOF;
	var nextVal(get, set):String;
	function get_nextVal():String {
		if (__nextVal_cache == null) {
			__nextVal_cache = __nextVal_source.substring(__nextVal_start, __nextVal_end);
		}
		return __nextVal_cache;
	}
	inline function set_nextVal(s:String):String {
		return __nextVal_cache = s;
	}
	var __nextVal_cache:String = null;
	var __nextVal_source:String = "";
	var __nextVal_start:Int = 0;
	var __nextVal_end:Int = 0;
	function nextDump():String {
		var v = nextVal;
		if (v != "") {
			return '`$v` (${nextKind.getName()})';
		} else return nextKind.getName();
	}
	//
	function __next_ret(nvk:GmlLinterKind, src:String, nv0:Int, nv1:Int):GmlLinterKind {
		//if (!__next_isPeek) Console.log(reader.getTopPosString(), nvk, nvk.getName(), src.substring(nv0, nv1));
		__nextVal_cache = null;
		__nextVal_source = src;
		__nextVal_start = nv0;
		__nextVal_end = nv1;
		nextKind = nvk;
		return nvk;
	}
	function __next_retv(nvk:GmlLinterKind, nv:String):GmlLinterKind {
		//if (!__next_isPeek) Console.log(reader.getTopPosString(), nvk, nvk.getName(), nv);
		__nextVal_cache = nv;
		nextKind = nvk;
		return nvk;
	}
	//
	var keywords:Dictionary<GmlLinterKind>;
	function initKeywords() {
		keywords = GmlLinterInit.keywords(version.config);
	}
	
	//
	var __next_isPeek = false;
	inline function __next(q:GmlReaderExt):GmlLinterKind {
		return GmlLinterParser.next(this, q);
	}
	//
	inline function next():GmlLinterKind {
		return __next(reader);
	}
	//
	private var __peekReader:GmlReaderExt = new GmlReaderExt("", GmlVersion.none);
	function peek():GmlLinterKind {
		var q = __peekReader;
		q.setTo(reader);
		var wasPeek = __next_isPeek;
		__next_isPeek = true;
		var r = __next(q);
		__next_isPeek = wasPeek;
		__skipAvail = true;
		return r;
	}
	var __skipAvail = false;
	function skip() {
		if (__skipAvail) {
			__skipAvail = false;
			reader.setTo(__peekReader);
			return nextKind;
		} else throw "Can't skip - didn't peek";
	}
	function skipIf(cond:Bool) {
		if (cond) {
			reader.setTo(__peekReader);
		}
		__skipAvail = false;
		return cond;
	}
	function skipIfPeek(kind:GmlLinterKind):Bool {
		return inline skipIf(peek() == kind);
	}
	//
	inline function nextOr(nk:GmlLinterKind):GmlLinterKind {
		return nk != null ? nk : next();
	}
	//}
	function readError(s:String):FoundError {
		setError(s);
		return true;
	}
	function readExpect(s:String):FoundError {
		setError('Expected $s, got ' + nextDump());
		return true;
	}
	
	/** if (next() != kind) error */
	function readCheckSkip(kind:GmlLinterKind, expect:String):FoundError {
		if (next() == kind) return false;
		return readExpect(expect);
	}
	//
	
	/** `+¦ a - b;` -> `+ a - b¦;` */
	function readOps(oldDepth:Int, firstType:GmlType, firstLVal:GmlLinterValue, firstOp:GmlLinterKind, firstVal:String, firstLocalName:String):FoundError {
		return binOps.read(oldDepth, firstType, firstLVal, firstOp, firstVal, firstLocalName);
	}
	
	function checkCallArgs(doc:GmlFuncDoc, currName:String, argc:Int, isExpr:Bool, isNew:Bool) {
		var isUserFunc:Bool;
		if (currName == null) {
			isUserFunc = true;
			currName = "an anonymous function";
		} else isUserFunc = !GmlAPI.stdDoc.exists(currName);
		
		// figure out min/max argument counts:
		var minArgs:Int, maxArgs:Int;
		if (doc != null) {
			currName = doc.name;
			minArgs = doc.minArgs;
			maxArgs = doc.maxArgs;
			
			// also check for other problems while we are here:
			if (doc.deprecated != null) {
				var suffix = doc.deprecated != "" ? ": " + doc.deprecated : "";
				addWarning('`$currName` is deprecated$suffix');
			}
			if (doc.isConstructor) {
				if (!isNew) addWarning('`$currName` is a constructor, but is not being used via `new`');
				if (isNew && doc.isAbstractClass) addError('`$currName` is abstract and cannot be instantiated');
			} else {
				if (isNew) {
					addWarning('`$currName` is not a constructor, but is being used via `new`');
				}
				if (isExpr && prefs.checkHasReturn && doc.hasReturn == false) {
					addWarning('`$currName` does not return anything, the result is unspecified');
				}
			}
		} else {
			// perhaps it's a hidden extension function? we don't add them to extDoc
			minArgs = GmlAPI.extArgc[currName];
			if (minArgs == null) {
				if (prefs.requireFunctions && prefs.forbidNonIdentCalls) {
					addWarning('`$currName` doesn\'t seem to be a valid function');
				}
				return;
			}
			if (minArgs < 0) {
				minArgs = 0;
				maxArgs = 0x7fffffff;
			} else maxArgs = minArgs;
		}
		//
		if (isUserFunc && !prefs.checkScriptArgumentCounts) {
			// OK!
		} else if (argc < minArgs) {
			if (maxArgs == minArgs) {
				addError('Not enough arguments for $currName (expected $minArgs, got $argc)');
			} else if (maxArgs >= 0x7fffffff) {
				addError('Not enough arguments for $currName (expected $minArgs+, got $argc)');
			} else {
				addError('Not enough arguments for $currName (expected $minArgs..$maxArgs, got $argc)');
			}
		} else if (argc > maxArgs) {
			if (minArgs == maxArgs) {
				addError('Too many arguments for $currName (expected $maxArgs, got $argc)');
			} else {
				addError('Too many arguments for $currName (expected $minArgs..$maxArgs, got $argc)');
			}
		}
	}
	
	@:keep inline function readExpr(oldDepth:Int, flags:GmlLinterReadFlags = None,
		?_nk:GmlLinterKind, ?targetType:GmlType, ?targetDoc:GmlFuncDoc
	):FoundError {
		return expr.read(oldDepth, flags, _nk, targetType, null, targetDoc);
	}
	
	function discardBlockScopes(newDepth:Int):Void {
		while (localNamesPerDepth.length > newDepth) {
			var arr = localNamesPerDepth.pop();
			if (arr != null) {
				for (name in arr) localKinds[name] = LKGhostVar;
			}
		}
	}
	
	var canBreak = false;
	var canContinue = false;
	function readLoopStat(oldDepth:Int, flags:GmlLinterReadFlags = None):FoundError {
		var _canBreak = canBreak;
		var _canContinue = canContinue;
		canBreak = true;
		canContinue = true;
		var result = readStat(oldDepth + 1, flags);
		canBreak = _canBreak;
		canContinue = _canContinue;
		return result;
	}
	
	function readTypeName():FoundError {
		var typeStr = gml.type.GmlTypeParser.readNameForLinter(this);
		if (typeStr == null) return true;
		readTypeName_typeStr = typeStr;
		return false;
	}
	static var readTypeName_typeStr:String;
	
	function valueCanCastTo(val:GmlLinterValue, valType:GmlType, target:GmlType, tpl:Array<GmlType>):Bool {
		switch (val) {
			case null:
			case VNumber( -1, _):
				var nsName = target.getNamespace();
				if (nsName != null) {
					var ns = GmlAPI.gmlNamespaces[nsName];
					var depth = 0;
					while (ns != null && ++depth < 128) {
						if (ns.minus1able) return true;
						ns = ns.parent;
					}
				}
			default:
		}
		return valType.canCastTo(target, tpl, getImports());
	}
	function checkTypeCast(source:GmlType, target:GmlType, ctx:String, val:GmlLinterValue):Bool {
		if (valueCanCastTo(val, source, target, null)) return true;
		var m = "Can't cast " + source.toString() + " to " + target.toString();
		if (ctx != null) m += " for " + ctx;
		addWarning(m);
		return false;
	}
	function checkTypeCastEq(source:GmlType, target:GmlType, ?ctx:String):Bool {
		var unassignable = GmlTypeDef.parse("uncompareable"); // caches
		var sourceKind = source.getKind();
		var targetKind = target.getKind();
		if (sourceKind == KUndefined || targetKind == KUndefined) {
			return true;
		}
		var imports = getImports();
		var sourceToTarget = source.canCastTo(target, null, imports);
		if (source.canCastTo(unassignable, null, imports) && target.canCastTo(unassignable, null, imports)) {
			if (sourceToTarget) return true;
			addWarning("Can't compare a " + source.toString() + " to a " + target.toString());
		} else if (!sourceToTarget && !target.canCastTo(source, null, imports)) {
			addWarning("Can't compare a " + source.toString() + " to a " + target.toString());
		}
		return true;
	}
	function checkTypeCastBoolOp(source:GmlType, val:GmlLinterValue, ctx:String):Bool {
		var wasBoolOp = GmlTypeCanCastTo.isBoolOp;
		GmlTypeCanCastTo.isBoolOp = true;
		var result = checkTypeCast(source, GmlTypeDef.bool, ctx, val);
		GmlTypeCanCastTo.isBoolOp = wasBoolOp;
		return result;
	}
	
	function checkTypeCastOp(
		left:GmlType, leftVal:GmlLinterValue,
		right:GmlType, rightVal:GmlLinterValue,
		op:GmlLinterKind, opv:String
	):GmlType {
		switch (op) {
			case LKAdd: {
				if (left.equals(GmlTypeDef.string) || left.equals(GmlTypeDef.number)) {
					return checkTypeCast(right, left, opv, rightVal) ? left : null;
				} else if (right.equals(GmlTypeDef.string) || right.equals(GmlTypeDef.number)) {
					return checkTypeCast(left, right, opv, leftVal) ? right : null;
				}
			};
			case LKBoolAnd, LKBoolOr, LKBoolXor: {
				checkTypeCastBoolOp(left, leftVal, opv);
				checkTypeCastBoolOp(right, rightVal, opv);
				return GmlTypeDef.bool;
			};
			case LKEQ, LKNE, LKSet: {
				checkTypeCastEq(left, right, opv);
				return GmlTypeDef.bool;
			};
			case LKLT, LKLE, LKGT, LKGE: {
				checkTypeCast(left, GmlTypeDef.number, opv, leftVal);
				checkTypeCast(right, GmlTypeDef.number, opv, rightVal);
				return GmlTypeDef.bool;
			};
			case LKAnd, LKOr, LKXor, LKShl, LKShr: {
				checkTypeCast(left, GmlTypeDef.int, opv, leftVal);
				checkTypeCast(right, GmlTypeDef.int, opv, rightVal);
				return GmlTypeDef.int;
			};
			case LKIntDiv: {
				checkTypeCast(left, GmlTypeDef.number, opv, leftVal);
				checkTypeCast(right, GmlTypeDef.number, opv, rightVal);
				return GmlTypeDef.int;
			};
			default: {
				checkTypeCast(left, GmlTypeDef.number, opv, leftVal);
				checkTypeCast(right, GmlTypeDef.number, opv, rightVal);
				return GmlTypeDef.number;
			};
		}
		return null;
	}
	
	function readSwitch(oldDepth:Int, ?pubSubPayloadVar:String):FoundError {
		var newDepth = oldDepth + 1;
		rc(readCheckSkip(LKCubOpen, "an opening `{` for switch-block"));
		//
		var isInCase = false;
		var casePayloadType:GmlType = null;
		var casePayloadTypeSet = false;
		inline function resetCase():Void {
			if (isInCase) {
				if (prefs.blockScopedCase) discardBlockScopes(newDepth);
				isInCase = false;
			}
			if (pubSubPayloadVar != null && setLocalTypes && casePayloadTypeSet) {
				var imp = getImports(true);
				imp.localTypes[pubSubPayloadVar] = casePayloadType;
				casePayloadType = null;
				casePayloadTypeSet = false;
			}
		}
		inline function setCasePubSubPayload(eventName:String):Void {
			if (eventName == null || pubSubPayloadVar == null || !setLocalTypes) return;
			var eventData = GmlAPI.gmlPubSubEvents[eventName];
			if (eventData == null) return;
			var imp = getImports(true);
			if (!casePayloadTypeSet) {
				casePayloadType = imp.localTypes[pubSubPayloadVar];
				casePayloadTypeSet = true;
			}
			imp.localTypes[pubSubPayloadVar] = eventData.getTupleType();
		}
		//
		seqStart.setTo(reader);
		var hasDefault = false;
		var caseCount = 0;
		var q = reader;
		while (q.loop) {
			switch (peek()) {
				case LKCubClose: {
					skip();
					if (caseCount == 0 && !hasDefault) return readSeqStartError(
						"Empty switch-blocks are forbidden in GML");
					return false;
				};
				case LKDefault: {
					skip();
					if (hasDefault) return readError("That's default-case redefinition");
					hasDefault = true;
					rc(readCheckSkip(LKColon, "a colon after default-case"));
					resetCase();
				};
				case LKCase: {
					caseCount += 1;
					skip();
					rc(readExpr(newDepth));
					rc(readCheckSkip(LKColon, "a colon after a case"));
					resetCase();
					setCasePubSubPayload(expr.currFieldName != null ? expr.currFieldName : expr.currName);
				};
				default: {
					isInCase = true;
					rc(readStat(newDepth));
					if (caseCount == 0 && !hasDefault) return readError(
						"Statements inside a switch-block must appear inside case/default");
				};
			}
		}
		return readSeqStartError("Unclosed switch-block");
	}
	function readEnum(oldDepth:Int):FoundError {
		var newDepth = oldDepth + 1;
		rc(readCheckSkip(LKIdent, "an enum name"));
		rc(readCheckSkip(LKCubOpen, "an opening `{` for enum"));
		var seenComma = true;
		while (reader.loop) {
			switch (next()) {
				case LKCubClose: return false;
				case LKIdent: {
					if (!seenComma) return readExpect("a `,` or `}` in enum");
					var nk = peek();
					if (skipIf(nk == LKSet)) {
						rc(readExpr(newDepth));
						nk = peek();
					}
					seenComma = skipIf(nk == LKComma);
				};
				default: {
					return readExpect("an enum field or `}`");
				}
			}
		}
		return readSeqStartError("Unclosed {}");
	}
	
	/**
	 * 
	 */
	function readStat(oldDepth:Int, flags:GmlLinterReadFlags = None, ?_nk:GmlLinterKind):FoundError {
		var newDepth = oldDepth + 1;
		var q = reader;
		var nk:GmlLinterKind = nextOr(_nk);
		var mainKind = nk;
		var z:Bool, z2:Bool, i:Int;
		inline function checkParens():Void {
			if (prefs.requireParentheses && !expr.hasParens) {
				addWarning("Expression is missing parentheses");
			}
		}
		switch (nk) {
			case LKMFuncDecl, LKMacro: {};
			case LKEnum: rc(readEnum(newDepth));
			case LKVar, LKConst, LKLet, LKGlobalVar, LKArgs, LKStatic: {
				var varKeyword = nextVal;
				var isArgs = nk == LKArgs;
				var isStaticCtr = nk == LKStatic && currFuncDoc != null && currFuncDoc.isConstructor;
				var isCoroutineArgs = isArgs && currFuncDoc != null	&& currFuncDoc.post.startsWith(GmlFuncDoc.parRetArrow + synext.GmlExtCoroutines.arrayTypeResultName);
				var keywordStr = nextVal;
				seqStart.setTo(reader);
				var found = 0;
				var startRow = reader.row;
				while (q.loop) {
					nk = peek();
					// #args-specific: quit on linebreak, allow ?arg:
					if (isArgs && __peekReader.row > startRow) break;
					if (isArgs && nk == LKQMark) { skip(); nk = peek(); }
					//
					if (!skipIf(nk == LKIdent)) break;
					var varName = nextVal;
					if (isStaticCtr && constructorInstVars != null) {
						constructorInstVars[varName] = true;
					}
					var allowTypeRedefinition = false;
					if (mainKind != LKGlobalVar && mainKind != LKStatic) {
						var lk = localKinds[varName];
						if (mainKind != LKVar || prefs.blockScopedVar) {
							if (lk != null && lk != LKGhostVar) {
								addWarning('Redefinition of a variable `$varName`');
							} else {
								allowTypeRedefinition = true;
								var arr = localNamesPerDepth[oldDepth];
								if (arr == null) {
									arr = [];
									localNamesPerDepth[oldDepth] = arr;
								}
								arr.push(varName);
							}
						} else if (lk == null || lk == LKGhostVar) {
							allowTypeRedefinition = true;
						}
						localKinds[varName] = mainKind;
					}
					var argIndex = found++;
					//
					nk = peek();
					var varType:GmlType, varTypeStr:String;
					if (nk == LKColon) { // `name:type`
						skip();
						var varTypeStart = q.pos;
						rc(readTypeName());
						varTypeStr = readTypeName_typeStr;
						varType = GmlTypeDef.parse(varTypeStr);
						if (setLocalTypes) getImports(true).localTypes[varName] = varType;
						nk = peek();
					} else {
						varType = null;
						varTypeStr = null;
						if (isArgs && currFuncDoc != null && currFuncDoc.argTypes != null) {
							// linear coroutines have a prefix argument
							if (isCoroutineArgs) argIndex += 1;
							varType = currFuncDoc.argTypes[argIndex];
							varTypeStr = varType != null ? varType.toString() : null;
							if (varType != null && setLocalTypes) {
								getImports(true).localTypes[varName] = varType;
							}
						}
					}
					//
					var typeInfo:String = null;
					if (nk == LKSet) { // `name = val`
						skip();
						var setToken = nextVal;
						var targetDoc:GmlFuncDoc = null;
						if (isStaticCtr) {
							var ownerName = currFuncDoc.name;
							var ownerNamespace = GmlAPI.gmlNamespaces[ownerName];
							if (ownerNamespace != null) {
								targetDoc = ownerNamespace.getInstDoc(varName, 0, ownerName);
							}
						}
						rc(readExpr(newDepth, None, null, varType, targetDoc));
						var varExprType = expr.currType;
						if (mainKind == LKGlobalVar) {
							// not today
						} else if (varType != null) {
							checkTypeCast(varExprType, varType, "variable declaration", expr.currValue);
						} else if (varExprType != null) {
							var apply = setLocalTypes && (
								prefs.specTypeColon && setToken == ":="
							|| switch (mainKind) {
								case LKLet: prefs.specTypeLet;
								case LKConst: prefs.specTypeConst;
								case LKStatic: prefs.specTypeStatic;
								default: keywordStr == "var" || keywordStr == "static"
									? prefs.specTypeVar : prefs.specTypeMisc;
							});
							if (apply) {
								var imp = getImports(true);
								var lastVarType = imp.localTypes[varName];
								if (lastVarType == null) {
									if (setLocalVars) typeInfo = "type " + varExprType.toString() + " (auto)";
									imp.localTypes[varName] = varExprType;
								}
								else if (allowTypeRedefinition) {
									imp.localTypes[varName] = varExprType;
								}
								else if (!varExprType.equals(lastVarType)) {
									addWarning('Implicit redefinition of type for local variable $varName from '
										+ lastVarType.toString() + " to " + varExprType.toString());
								}
							}
						}
					}
					if (!setLocalVars) {
						// OK!
					} else if (mainKind == LKGlobalVar) {
						// don't store globals
					} else if (isStaticCtr) {
						
					} else {
						if (typeInfo == null && varTypeStr != null) {
							typeInfo = "type " + varTypeStr;
						}
						var locals = editor.locals[context];
						if (locals.kind.exists(varName)) {
							if (typeInfo != null) {
								var comp = locals.comp.findFirst((cc) -> cc.name == varName);
								if (comp != null) comp.doc = typeInfo;
							}
						} else locals.add(varName, localVarTokenType, typeInfo);
					}
					//
					if (!skipIf(peek() == LKComma)) break;
				}
				if (found == 0) readSeqStartWarn("This `"+varKeyword+"` has no declarations.");
			};
			case LKCubOpen: {
				z = false;
				seqStart.setTo(reader);
				while (q.loop) {
					if (skipIf(peek() == LKCubClose)) {
						z = true;
						break;
					}
					rc(readStat(newDepth));
				}
				if (!z) return readSeqStartError("Unclosed {}");
			};
			case LKSemico: {
				if (prefs.requireSemicolons) {
					addWarning("Stray semicolon");
				}
			};
			case LKIf: {
				rc(expr.read(newDepth));
				var nullSafety = expr.nullSafety;
				checkParens();
				checkTypeCastBoolOp(expr.currType, expr.currValue, "an if condition");
				skipIf(peek() == LKThen);
				if (skipIf(peek() == LKSemico)) {
					return readError("You have a semicolon before your then-expression.");
				}
				nullSafety.prepatch(this);
				rc(readStat(newDepth));
				if (skipIf(peek() == LKElse)) {
					nullSafety.elsepatch(this);
					rc(readStat(newDepth));
				}
				nullSafety.postpatch(this);
			};
			case LKWhile, LKRepeat: {
				rc(readExpr(newDepth));
				checkParens();
				switch (nk) {
					case LKWhile: checkTypeCastBoolOp(expr.currType, expr.currValue, "a while-loop condition");
					case LKRepeat: checkTypeCast(expr.currType, GmlTypeDef.number, "a repeat-loop count", expr.currValue);
					default:
				}
				rc(readLoopStat(newDepth));
			};
			case LKWith: {
				var locals = editor.locals[context];
				if (locals != null) locals.hasWith = true;
				rc(readExpr(newDepth));
				var ctxType = expr.currType;
				checkParens();
				var self0z = __selfType_set;
				var self0t = __selfType_type;
				var other0z = __otherType_set;
				var other0t = __otherType_type;
				__otherType_set = true;
				__otherType_type = getSelfType();
				__selfType_set = true;
				__selfType_type = ctxType;
				rc(readLoopStat(newDepth));
				__otherType_set = other0z;
				__otherType_type = other0t;
				__selfType_set = self0z;
				__selfType_type = self0t;
			};
			case LKDo: {
				rc(readLoopStat(newDepth));
				switch (next()) {
					case LKUntil, LKWhile: {
						rc(readExpr(newDepth));
						checkParens();
						checkTypeCastBoolOp(expr.currType, expr.currValue, "an do-loop condition");
					};
					default: return readExpect("an `until` or `while` for a do-loop");
				}
			};
			case LKFor: {
				if (next() != LKParOpen) return readExpect("a `(` to open a for-loop");
				if (!skipIf(peek() == LKSemico)) { // init
					rc(readStat(newDepth));
				}
				if (!skipIf(peek() == LKSemico)) { // condition
					rc(readExpr(newDepth));
					checkTypeCastBoolOp(expr.currType, expr.currValue, "an if condition");
					skipIf(peek() == LKSemico);
				}
				if (!skipIf(peek() == LKParClose)) { // post
					rc(readLoopStat(newDepth, NoSemico));
					if (next() != LKParClose) return readExpect("a `)` to close a for-loop");
				}
				rc(readLoopStat(newDepth));
			};
			case LKExit: {};
			case LKReturn: {
				switch (peek()) {
					case LKSemico: skip(); flags.add(NoSemico);
					case LKCubClose: flags.add(NoSemico);
					default:
						var retType = currFuncDoc != null ? currFuncDoc.returnType : null;
						rc(readExpr(newDepth, None, null, retType));
						switch (currFuncRetStatus) {
							case NoReturn, WantReturn: currFuncRetStatus = HasReturn;
							case WantNoReturn: 
								addWarning("The function is marked as returning nothing but has a return statement.");
							case WantNoReturnConstructor:
								addWarning("Should not be returning values from constructors.");
							default:
						}
						if (retType != null && expr.currType != null) {
							checkTypeCast(expr.currType, retType, "return", expr.currValue);
						}
				}
			};
			case LKBreak: {
				if (!canBreak) addError("Can't use `break` here");
			};
			case LKContinue: {
				if (!canContinue) addError("Can't use `continue` here");
			};
			case LKSwitch: {
				z = canBreak;
				canBreak = true;
				var switchStart = reader.pos;
				rc(readExpr(newDepth));
				var switchExprSource = reader.source.substring(switchStart, reader.pos);
				var switchExprRx = new RegExp("^\\s*\\(?\\s*(\\w+)\\s*\\)?\\s*$");
				var switchExprMatch = switchExprRx.exec(switchExprSource);
				var switchExprName = expr.currName != null
					? expr.currName
					: switchExprMatch != null ? switchExprMatch[1] : null;
				var pubSubPayloadVar:String = null;
				if (switchExprName != null && currFuncDoc != null && currFuncDoc.args != null) {
					for (argInd in 0 ... currFuncDoc.args.length - 1) {
						if (currFuncDoc.args[argInd] == switchExprName) {
							pubSubPayloadVar = currFuncDoc.args[argInd + 1];
							break;
						}
					}
				}
				checkParens();
				if (readSwitch(newDepth, pubSubPayloadVar)) {
					canBreak = z;
					return true;
				} else canBreak = z;
			};
			//
			case LKLiveWait, LKThrow, LKDelete: { // keyword <value>
				rc(readExpr(newDepth)); // wait <time>
			}
			case LKGoto: { // goto <label name>
				switch (peek()) {
					case LKIdent, LKString: skip();
					default: return readExpect("a label name");
				}
			};
			case LKLabel: { // label <name>[:]
				switch (peek()) {
					case LKIdent, LKString: {
						skip();
					};
					default: return readExpect("a label name");
				}
				skipIf(peek() == LKColon);
			};
			case LKTry: {
				rc(readStat(newDepth));
				rc(readCheckSkip(LKCatch, "a `catch` after a `try` block"));
				// catch (<name>)
				var hasPar = skipIf(peek() == LKParOpen);
				rc(readCheckSkip(LKIdent, "an exception name"));
				var varName = nextVal;
				localKinds[varName] = mainKind;
				if (setLocalVars && mainKind != LKGlobalVar) {
					var locals = editor.locals[context];
					if (!locals.kind.exists(varName)) {
						locals.add(varName, localVarTokenType, "try-catch");
					}
				}
				if (hasPar) rc(readCheckSkip(LKParClose, "a closing `)`"));
				//
				rc(readStat(newDepth)); // catch-block
				if (skipIf(peek() == LKFinally)) {
					rc(readStat(newDepth));
				}
			};
			//
			case LKLamDef: rc(funcLiteral.read(newDepth, false, true));
			default: {
				rc(readExpr(newDepth, flags.with(AsStat), nk));
			};
		}
		//
		if (skipIf(peek() == LKSemico)) {
			// OK!
		} else if (prefs.requireSemicolons && mainKind.needSemico() && !flags.has(NoSemico)) {
			switch (q.peek( -1)) {
				case ";".code, "}".code: {}; // allowed
				default: {
					addWarning('Expected a semicolon after a statement (${mainKind.getName()})');
				};
			}
		}
		//
		discardBlockScopes(newDepth);
		//
		return false;
	}
	
	public function runPre(source:GmlCode, editor:EditCode, version:GmlVersion, context:String = ""):Void {
		this.version = version;
		this.editor = editor;
		functionsAreGlobal = GmlFileKindTools.functionsAreGlobal(editor.kind);
		this.context = context;
		if (context != "") {
			currFuncDoc = GmlAPI.gmlDoc[context];
		} else if (Std.is(editor.kind, KGmlScript) && !Project.current.isGMS23) {
			currFuncDoc = GmlAPI.gmlDoc[editor.file.name];
		} else currFuncDoc = null;
		initKeywords();
		var q = reader = new GmlReaderExt(source.trimRight());
		q.name = editor.file.name;
		errorText = null;
	}
	public function runPost() {
		reader.clear();
		seqStart.clear();
		__peekReader.clear();
	}
	
	/**
	 * 
	 * @return Whether there was a syntax error, among other things
	 */
	public function run(source:GmlCode, editor:EditCode, version:GmlVersion):FoundError {
		runPre(source, editor, version);
		var q = reader;
		var ohno = false;
		while (q.loop) {
			var nk = next();
			if (nk == LKEOF) break;
			if (readStat(0, None, nk)) {
				errors.push(new GmlLinterProblem(errorText, errorPos));
				ohno = true;
				break;
			}
		}
		if (!ohno) checkInterfaceImplementations(q.source);
		runPost();
		return ohno;
	}
	
	
	public static function runFor(editor:EditCode, ?opt:GmlLinterOptions):FoundError {
		var q = new GmlLinter();
		q.setLocalVars = JsTools.ncf(opt.setLocals, false);
		var session = JsTools.ncf(opt.session, editor.session);
		if (session.gmlErrorMarkers != null) {
			for (mk in session.gmlErrorMarkers) session.removeMarker(mk);
			session.gmlErrorMarkers.clear();
			session.clearAnnotations();
		}
		var t = Main.window.performance.now();
		var code = JsTools.ncf(opt.code);
		if (code == null) {
			code = synext.SyntaxExtension.postprocForLinterArray(editor, session.getValue(), file.kind.KGml.syntaxExtensions);
		}
		var ohno = q.run(code, editor, gml.Project.current.version);
		t = (Main.window.performance.now() - t);
		//
		if (session.gmlErrorMarkers == null) session.gmlErrorMarkers = [];
		var annotations:Array<AceAnnotation> = [];
		var markerMap:IntDictionary<{level:Int, id:AceMarker}> = new IntDictionary();
		function addMarker(text:String, pos:AcePos, isError:Bool) {
			do {
				var newLevel = isError ? 2 : 1;
				var old = markerMap[pos.row];
				if (old != null) {
					if (old.level >= newLevel) break;
					session.gmlErrorMarkers.remove(old.id);
					session.removeMarker(old.id);
				}
				var clazz = isError ? "ace_error-line" : "ace_warning-line";
				var marker = new ace.gml.AceGmlWarningMarker(session, pos.row, clazz);
				var markerID = marker.addTo(session);
				session.gmlErrorMarkers.push(markerID);
				markerMap[pos.row] = { level: newLevel, id: markerID };
			} while (false);
			annotations.push({
				row: pos.row, column: pos.column, type: isError ? "error" : "warning", text: text
			});
		}
		for (warn in q.warnings) addMarker(warn.text, warn.pos, false);
		for (error in q.errors) addMarker(error.text, error.pos, true);
		//
		if (JsTools.ncf(opt.updateStatusBar, true)) {
			var msg:String;
			if (q.warnings.length == 0 && q.errors.length == 0) {
				msg = "OK!";
			} else {
				if (ohno) {
					msg = "⛔"; // 🚔
				} else if (q.errors.length > 0) {
					msg = "🛑"; // 🚒
				} else msg = "⚠";
				if (q.errors.length > 0) {
					msg += q.errors.length + " error";
					if (q.errors.length != 1) msg += "s";
				}
				if (q.warnings.length > 0) {
					if (q.errors.length > 0) msg += ", ";
					msg += q.warnings.length + " warning";
					if (q.warnings.length != 1) msg += "s";
				}
				msg += "!";
			}
			msg += " (lint time: " + untyped (t.toFixed(2)) + "ms)";
			//
			var aceEditor = JsTools.ncf(opt.editor, Main.aceEditor);
			Main.window.setTimeout(function() {
				var statusBar = aceEditor.statusBar;
				statusBar.ignoreUntil = Main.window.performance.now() + statusBar.delayTime + 50;
				statusBar.setText(msg);
			}, 50);
		}
		session.setAnnotations(annotations);
		if (opt != null && opt.annotations != null) {
			for (ann in annotations) opt.annotations.push(ann);
		}
		return ohno;
	}
	
	public static function getType(expr:String, editor:EditCode, context:String, pos:AcePos):GmlLinterTypeInfo {
		var q = new GmlLinter();
		q.setLocalTypes = false;
		q.runPre(expr, editor, Project.current.version, context);
		if (pos != null) {
			var types = AceGmlContextResolver.run(editor.session, pos);
			#if debug
			Console.log(types);
			#end
			q.__selfType_set = true;
			q.__selfType_type = types.self;
			q.__otherType_set = true;
			q.__otherType_type = types.other;
		}
		var ok = !q.readExpr(0);
		q.runPost();
		#if debug
		Console.log(expr, q.expr.currType, q.expr.currFunc);
		#end
		return {
			type: ok ? q.expr.currType : null,
			doc:  ok ? q.expr.currFunc : null,
		}
	}
}
typedef GmlLinterOptions = {
	?code:GmlCode,
	?editor:AceWrap,
	?session:AceSession,
	?setLocals:Bool,
	?updateStatusBar:Bool,
	?annotations:Array<AceAnnotation>,
}
typedef GmlLinterTypeInfo = {
	type: GmlType,
	doc: GmlFuncDoc,
};

class GmlLinterProblem {
	public var text:String;
	public var pos:AcePos;
	public function new(text:String, pos:AcePos) {
		this.text = text;
		this.pos = pos;
	}
}
class GmlLinterInterfaceImplementation {
	public var name:String;
	public var pos:AcePos = null;
	public var parentName:String = null;
	public var interfaces:Array<String> = [];
	public var positions:Dictionary<AcePos> = new Dictionary();
	public var instFields:Dictionary<Bool> = new Dictionary();
	public var staticFields:Dictionary<Bool> = new Dictionary();
	public var instMeta:Dictionary<GmlLinterMemberMeta> = new Dictionary();
	public var staticMeta:Dictionary<GmlLinterMemberMeta> = new Dictionary();
	public function new(name:String) {
		this.name = name;
	}
	public function addInterface(interfaceName:String, pos:AcePos):Void {
		if (!positions.exists(interfaceName)) {
			interfaces.push(interfaceName);
			positions[interfaceName] = pos;
		}
	}
	public function setConstructorLine(row:Int, line:String):Void {
		var col = line.indexOf("function");
		pos = { row: row, column: col >= 0 ? col : 0 };
		var mt = GmlLinter.constructorParentLineRx.exec(line);
		parentName = mt != null ? mt[1] : null;
	}
	public function addField(field:String, isInst:Bool, row:Int, line:String, meta:GmlLinterMemberMeta):Void {
		var fields = isInst ? instFields : staticFields;
		fields[field] = true;
		if (meta == null) return;
		var metas = isInst ? instMeta : staticMeta;
		metas[field] = meta.withFallbackPos(row, line);
	}
}
class GmlLinterMemberMeta {
	public var isVirtual:Bool;
	public var isAbstract:Bool;
	public var isOverride:Bool;
	public var pos:AcePos;
	public function new(isVirtual:Bool, isAbstract:Bool, isOverride:Bool, pos:AcePos) {
		this.isVirtual = isVirtual;
		this.isAbstract = isAbstract;
		this.isOverride = isOverride;
		this.pos = pos;
	}
	public static function fromLine(line:String, row:Int):GmlLinterMemberMeta {
		var isVirtual = line.indexOf("@virtual") >= 0;
		var isAbstract = line.indexOf("@abstract") >= 0;
		var isOverride = line.indexOf("@override") >= 0;
		if (!isVirtual && !isAbstract && !isOverride) return null;
		var col = line.indexOf("@override");
		if (col < 0) col = line.indexOf("@abstract");
		if (col < 0) col = line.indexOf("@virtual");
		return new GmlLinterMemberMeta(isVirtual, isAbstract, isOverride, { row: row, column: col >= 0 ? col : 0 });
	}
	public static function merge(a:GmlLinterMemberMeta, b:GmlLinterMemberMeta):GmlLinterMemberMeta {
		if (a == null) return b;
		if (b == null) return a;
		var pos = a.pos;
		if (!a.isOverride && b.isOverride) pos = b.pos;
		else if (!a.isAbstract && b.isAbstract) pos = b.pos;
		else if (!a.isVirtual && b.isVirtual) pos = b.pos;
		return new GmlLinterMemberMeta(
			a.isVirtual || b.isVirtual,
			a.isAbstract || b.isAbstract,
			a.isOverride || b.isOverride,
			pos
		);
	}
	public function withFallbackPos(row:Int, line:String):GmlLinterMemberMeta {
		if (pos != null) return this;
		var col = line.indexOf("static");
		return new GmlLinterMemberMeta(isVirtual, isAbstract, isOverride, { row: row, column: col >= 0 ? col : 0 });
	}
}

enum GmlLinterValue {
	VUndefined;
	VNumber(n:Float, gml:String);
	VString(s:String, gml:String);
}
enum abstract GmlLinterReturnStatus(Int) {
	var NoReturn;
	var HasReturn;
	var WantReturn;
	var WantNoReturn;
	var WantNoReturnConstructor;
}
