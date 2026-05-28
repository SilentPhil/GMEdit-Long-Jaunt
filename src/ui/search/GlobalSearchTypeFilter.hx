package ui.search;
import ace.AceGmlTools;
import ace.AceTools;
import ace.AceTooltips;
import ace.extern.AcePos;
import ace.extern.AceRange;
import ace.extern.AceSession;
import ace.extern.AceToken;
import ace.extern.AceTokenIterator;
import editors.EditCode;
import file.FileKind;
import file.kind.KGml;
import file.kind.gml.KGmlExtension;
import file.kind.gml.KGmlScript;
import file.kind.gmx.KGmxEvents;
import file.kind.yy.KYyEvents;
import gml.GmlImports;
import gml.GmlLocals;
import gml.Project;
import gml.file.GmlFile;
import gml.type.GmlType;
import gml.type.GmlTypeDef;
import haxe.io.Path;
import parsers.GmlSeekData;
import parsers.linter.GmlLinter;
import synext.GmlExtLambda;
import tools.Dictionary;
using gml.type.GmlTypeTools;
using tools.NativeString;

/**
 * Type filter for global search.
 *
 * This intentionally reuses the same editor/linter data path that tooltips and
 * F12 use instead of maintaining a second type resolver for search results.
 */
class GlobalSearchTypeFilter {
	var target:GmlType;
	var receiverMode:Bool;
	var receiverAllowSelfField:Bool;
	var code:String;
	var displayCode:String;
	var originalLines:Array<String>;
	var displayLines:Array<String>;
	var lineStarts:Array<Int>;
	var session:AceSession;
	var editor:EditCode;
	
	public function new(typeName:String, receiverMode:Bool = false, receiverAllowSelfField:Bool = false) {
		target = GmlTypeDef.parse(typeName, "global search");
		this.receiverMode = receiverMode;
		this.receiverAllowSelfField = receiverAllowSelfField;
	}
	
	public inline function isValid():Bool {
		return target != null;
	}
	
	public function prepareFile(name:String, path:String, code:String):Void {
		this.code = code;
		this.originalLines = splitLines(code);
		this.lineStarts = buildLineStarts(code);
		var kind = getKind(name, path);
		var seekPath = path != null ? path + "#global-search" : "#global-search/" + name;
		
		var file:GmlFile = cast {};
		file.name = name;
		file.path = seekPath;
		file.kind = kind;
		file.code = code;
		
		var tempData = new GmlSeekData(kind);
		GmlSeekData.map.set(seekPath, tempData);
		
		editor = cast {};
		editor.file = file;
		editor.kind = cast kind;
		editor.locals = new Dictionary<GmlLocals>();
		editor.imports = new Dictionary<GmlImports>();
		editor.lambdaList = [];
		editor.lambdaMap = new Dictionary();
		editor.lambdas = new Dictionary<GmlExtLambda>();
		file.codeEditor = editor;
		
		displayCode = code;
		if (Std.is(kind, KGml)) {
			displayCode = (cast kind:KGml).preproc(editor, code);
			if (displayCode == null) displayCode = code;
		}
		file.code = displayCode;
		displayLines = splitLines(displayCode);
		
		var data = GmlSeekData.map[seekPath];
		if (data != null && data.imports != null) {
			editor.imports = data.imports;
		}
		GmlSeekData.map.remove(seekPath);
		
		session = AceTools.createSession(displayCode, {
			path: "ace/mode/gml",
			version: Project.current.version,
		});
		editor.session = session;
		AceTools.bindSession(session, editor);
		GmlLinter.runFor(editor, {
			session: session,
			setLocals: true,
			updateStatusBar: false,
		});
	}
	
	public function accepts(ctxName:String, offset:Int, text:String, matchCase:Bool, invert:Bool = false):Bool {
		if (!isIdentAt(offset, text.length)) return false;
		var actual = receiverMode
			? getReceiverTypeAt(offset, text, matchCase, ctxName)
			: getTypeAt(offset, text, matchCase, ctxName);
		if (actual == null) return false;
		var matches = typeMatches(actual);
		return invert ? !matches : matches;
	}
	
	function getKind(name:String, path:String):FileKind {
		var resType = Project.current.resourceTypes[name];
		var ext = path != null ? Path.extension(path).toLowerCase() : "";
		return switch (resType) {
			case "object":
				ext == "yy" ? KYyEvents.inst : KGmxEvents.inst;
			case "extension":
				KGmlExtension.inst;
			default:
				KGmlScript.inst;
		}
	}
	
	function getTypeAt(offset:Int, text:String, matchCase:Bool, ctxName:String):GmlType {
		var ctxScope = getScopeFromContextName(ctxName);
		var originalPos = offsetToPos(offset);
		var row = originalPos.row;
		if (row < 0 || row >= displayLines.length) return getLocalType(ctxScope, text, matchCase);
		var displayColumn = mapColumn(row, originalPos.column, text, matchCase);
		var tokenInfo = getMatchingToken(row, displayColumn, text, matchCase);
		if (tokenInfo != null) {
			var t = AceTooltips.getTypeAt(session, tokenInfo.pos, tokenInfo.token);
			if (t != null) return t;
			if (isLocalToken(tokenInfo.token)) {
				t = getLocalType(session.gmlScopes.get(row), text, matchCase);
				if (t != null) return t;
				t = getLocalType(ctxScope, text, matchCase);
				if (t != null) return t;
			}
		}
		if (!isDotAccess(offset)) {
			var scope = session.gmlScopes.get(row);
			var t = getLocalType(scope, text, matchCase);
			if (t != null) return t;
			if (ctxScope != scope) {
				t = getLocalType(ctxScope, text, matchCase);
				if (t != null) return t;
			}
		}
		return null;
	}

	function getReceiverTypeAt(offset:Int, text:String, matchCase:Bool, ctxName:String):GmlType {
		var ctxScope = getScopeFromContextName(ctxName);
		var originalPos = offsetToPos(offset);
		var row = originalPos.row;
		if (row < 0 || row >= displayLines.length) return null;
		var scope = session.gmlScopes.get(row);
		if (scope == null) scope = ctxScope;
		var displayColumn = mapColumn(row, originalPos.column, text, matchCase);
		var tokenInfo = getMatchingToken(row, displayColumn, text, matchCase);
		if (tokenInfo == null) {
			if (!isDotAccess(offset) && isOriginalDirectCall(row, originalPos.column, text)) {
				return getSelfReceiverType(scope, ctxScope);
			}
			return null;
		}
		var iter = new AceTokenIterator(session, tokenInfo.pos.row, tokenInfo.pos.column);
		var prev = iter.stepBackwardNonText();
		if (prev != null && prev.value == ".") {
			var dotPos = iter.getCurrentTokenPosition();
			var from = AceGmlTools.skipDotExprBackwards(session, dotPos);
			var expr = session.getTextRange(AceRange.fromPair(from, dotPos));
			if (StringTools.trim(expr) == "") return null;
			var inf = GmlLinter.getType(expr, editor, scope, dotPos);
			return inf != null ? inf.type : null;
		}
		var nextIter = new AceTokenIterator(session, tokenInfo.pos.row, tokenInfo.pos.column);
		var next = nextIter.stepForwardNonText();
		if (next != null && next.value == "(") {
			return getSelfReceiverType(scope, ctxScope);
		}
		if (receiverAllowSelfField) {
			switch (tokenInfo.token.type) {
				case "localfield", "field":
					return getSelfReceiverType(scope, ctxScope);
				default:
			}
		}
		return null;
	}

	function getSelfReceiverType(scope:String, ctxScope:String):GmlType {
		var t = AceGmlTools.getSelfType({ session: session, scope: scope });
		if (t != null) return t;
		var targetName = target.getNamespace();
		if (targetName != null && (scope == targetName || ctxScope == targetName)) {
			return target;
		}
		return null;
	}
	
	function getMatchingToken(row:Int, column:Int, text:String, matchCase:Bool):{pos:AcePos, token:AceToken} {
		var cols = [
			column,
			column + 1,
			column + text.length - 1,
		];
		var lineLen = displayLines[row].length;
		for (col in cols) {
			if (col < 0) continue;
			if (col > lineLen) col = lineLen;
			var pos = new AcePos(col, row);
			var token = session.getTokenAtPos(pos);
			if (token != null && namesEqual(token.value, text, matchCase)) {
				return {pos: pos, token: token};
			}
		}
		return null;
	}
	
	function getLocalType(scope:String, name:String, matchCase:Bool):GmlType {
		if (scope == null) return null;
		var imp = editor.imports[scope];
		if (imp == null) return null;
		var t = imp.localTypes[name];
		if (t != null || matchCase) return t;
		var lower = name.toLowerCase();
		for (key => value in imp.localTypes) {
			if (key.toLowerCase() == lower) return value;
		}
		return null;
	}
	
	function isLocalToken(token:AceToken):Bool {
		return switch (token.type) {
			case "local", "sublocal": true;
			default: false;
		}
	}
	
	function typeMatches(actual:GmlType):Bool {
		if (actual == null || target == null) return false;
		if (actual.equals(target)) return true;
		return actual.unwrapNullable().equals(target.unwrapNullable());
	}
	
	function offsetToPos(offset:Int):AcePos {
		var lo = 0;
		var hi = lineStarts.length - 1;
		while (lo <= hi) {
			var mid = (lo + hi) >> 1;
			if (lineStarts[mid] <= offset) {
				lo = mid + 1;
			} else hi = mid - 1;
		}
		var row = hi < 0 ? 0 : hi;
		return new AcePos(offset - lineStarts[row], row);
	}
	
	function mapColumn(row:Int, originalColumn:Int, text:String, matchCase:Bool):Int {
		if (row >= originalLines.length) return originalColumn;
		var originalLine = originalLines[row];
		var displayLine = displayLines[row];
		if (originalLine == displayLine) return originalColumn;
		var occurrence = getOccurrenceAtOrBefore(originalLine, originalColumn, text, matchCase);
		if (occurrence <= 0) return Std.int(Math.min(originalColumn, displayLine.length));
		var displayColumn = findOccurrence(displayLine, text, occurrence, matchCase);
		return displayColumn >= 0 ? displayColumn : Std.int(Math.min(originalColumn, displayLine.length));
	}
	
	function getOccurrenceAtOrBefore(line:String, column:Int, text:String, matchCase:Bool):Int {
		var haystack = matchCase ? line : line.toLowerCase();
		var needle = matchCase ? text : text.toLowerCase();
		var from = 0;
		var found = 0;
		while (from <= haystack.length) {
			var index = haystack.indexOf(needle, from);
			if (index < 0 || index > column) break;
			found += 1;
			if (index == column) break;
			from = index + (needle.length > 0 ? needle.length : 1);
		}
		return found;
	}
	
	function findOccurrence(line:String, text:String, occurrence:Int, matchCase:Bool):Int {
		var haystack = matchCase ? line : line.toLowerCase();
		var needle = matchCase ? text : text.toLowerCase();
		var from = 0;
		var found = 0;
		while (from <= haystack.length) {
			var index = haystack.indexOf(needle, from);
			if (index < 0) return -1;
			found += 1;
			if (found == occurrence) return index;
			from = index + (needle.length > 0 ? needle.length : 1);
		}
		return -1;
	}
	
	function isIdentAt(offset:Int, length:Int):Bool {
		if (offset > 0 && code.fastCodeAt(offset - 1).isIdent1()) return false;
		var end = offset + length;
		if (end < code.length && code.fastCodeAt(end).isIdent1()) return false;
		return true;
	}
	
	function isDotAccess(offset:Int):Bool {
		var p = offset;
		while (--p >= 0) {
			var c = code.fastCodeAt(p);
			if (c.isSpace1()) continue;
			return c == ".".code;
		}
		return false;
	}

	function isOriginalDirectCall(row:Int, column:Int, text:String):Bool {
		if (row < 0 || row >= originalLines.length || column < 0) return false;
		var line = originalLines[row];
		var p = column + text.length;
		while (p < line.length) {
			var c = line.fastCodeAt(p);
			if (c == " ".code || c == "\t".code) {
				p += 1;
				continue;
			}
			return c == "(".code;
		}
		return false;
	}
	
	function namesEqual(a:String, b:String, matchCase:Bool):Bool {
		return matchCase ? a == b : a.toLowerCase() == b.toLowerCase();
	}

	function getScopeFromContextName(ctxName:String):String {
		if (ctxName == null) return null;
		var start = ctxName.indexOf("(");
		if (start < 0) return ctxName;
		var end = ctxName.lastIndexOf(")");
		if (end <= start) return ctxName;
		return ctxName.substring(start + 1, end);
	}
	
	function buildLineStarts(code:String):Array<Int> {
		var out = [0];
		var i = 0;
		while (i < code.length) {
			var c = code.fastCodeAt(i);
			if (c == "\r".code) {
				if (i + 1 < code.length && code.fastCodeAt(i + 1) == "\n".code) i += 1;
				out.push(i + 1);
			} else if (c == "\n".code) {
				out.push(i + 1);
			}
			i += 1;
		}
		return out;
	}
	
	function splitLines(code:String):Array<String> {
		var lines = [];
		var start = 0;
		var i = 0;
		while (i < code.length) {
			var c = code.fastCodeAt(i);
			if (c == "\r".code || c == "\n".code) {
				lines.push(code.substring(start, i));
				if (c == "\r".code && i + 1 < code.length && code.fastCodeAt(i + 1) == "\n".code) i += 1;
				start = i + 1;
			}
			i += 1;
		}
		lines.push(code.substring(start));
		return lines;
	}
}
