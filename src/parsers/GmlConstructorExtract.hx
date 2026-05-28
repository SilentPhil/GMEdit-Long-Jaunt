package parsers;

import gml.GmlVersion;
import tools.CharCode;
using StringTools;
using tools.NativeString;

class GmlConstructorExtract {
	public static function find(code:String, cursorOffset:Int, ?version:GmlVersion):GmlConstructorExtractResult {
		var ident = getIdentAt(code, cursorOffset);
		if (ident == null) return null;
		
		var q = new GmlReader(code, version);
		var curlyDepth = 0;
		while (q.loop) {
			var at = q.pos;
			var c:CharCode = q.read();
			switch (c) {
				case "/".code: skipComment(q);
				case '"'.code, "'".code, "@".code, "`".code: q.skipStringAuto(c, q.version);
				case "$".code if (q.isDqTplStart(q.version)): q.skipDqTplString(q.version);
				case "{".code: curlyDepth += 1;
				case "}".code: if (curlyDepth > 0) curlyDepth -= 1;
				case _ if (c.isIdent0()): {
					q.skipIdent1();
					if (curlyDepth != 0) continue;
					if (q.substring(at, q.pos) != "function") continue;
					
					q.skipSpaces0_local();
					var nameStart = q.pos;
					var name = q.readIdent();
					if (name == null) continue;
					var nameEnd = q.pos;
					
					if (name != ident.name || cursorOffset < nameStart || cursorOffset > nameEnd) continue;
					
					var end = readConstructorEnd(q);
					if (end == null) return null;
					
					var start = expandLeadingDoc(code, at);
					var removeEnd = expandRemovalEnd(code, end);
					return {
						name: name,
						nameStart: nameStart,
						nameEnd: nameEnd,
						start: start,
						functionStart: at,
						end: end,
						removeEnd: removeEnd,
						text: code.substring(start, end),
					};
				};
				default:
			}
		}
		return null;
	}
	
	public static function offsetOfPos(code:String, row:Int, column:Int):Int {
		var pos = 0;
		var rowLeft = row;
		while (rowLeft > 0 && pos < code.length) {
			var nl = code.indexOf("\n", pos);
			if (nl < 0) return code.length;
			pos = nl + 1;
			rowLeft -= 1;
		}
		return inline imin(pos + column, code.length);
	}
	
	static function getIdentAt(code:String, offset:Int):GmlConstructorExtractIdent {
		var len = code.length;
		if (len <= 0) return null;
		if (offset < 0) offset = 0;
		if (offset > len) offset = len;
		
		var at = -1;
		if (offset < len && (code.fastCodeAt(offset):CharCode).isIdent1()) {
			at = offset;
		} else if (offset > 0 && (code.fastCodeAt(offset - 1):CharCode).isIdent1()) {
			at = offset - 1;
		}
		if (at < 0) return null;
		
		var start = at;
		while (start > 0 && (code.fastCodeAt(start - 1):CharCode).isIdent1()) start -= 1;
		if (!(code.fastCodeAt(start):CharCode).isIdent0()) return null;
		
		var end = at + 1;
		while (end < len && (code.fastCodeAt(end):CharCode).isIdent1()) end += 1;
		return {
			name: code.substring(start, end),
			start: start,
			end: end,
		};
	}
	
	static function readConstructorEnd(q:GmlReader):Null<Int> {
		q.skipNops();
		if (q.peek() != "(".code) return null;
		q.skip();
		if (!q.skipBalancedParenExpr()) return null;
		
		var foundConstructor = false;
		while (q.loop) {
			var at = q.pos;
			var c:CharCode = q.read();
			switch (c) {
				case " ".code, "\t".code, "\r".code, "\n".code:
				case "/".code: skipComment(q);
				case '"'.code, "'".code, "@".code, "`".code: q.skipStringAuto(c, q.version);
				case "$".code if (q.isDqTplStart(q.version)): q.skipDqTplString(q.version);
				case "(".code, "[".code: q.skipBalancedParenExpr();
				case "{".code: {
					if (!foundConstructor) return null;
					return readBlockEnd(q);
				};
				case ";".code: return null;
				case _ if (c.isIdent0()): {
					q.skipIdent1();
					if (q.substring(at, q.pos) == "constructor") foundConstructor = true;
				};
				default:
			}
		}
		return null;
	}
	
	static function readBlockEnd(q:GmlReader):Null<Int> {
		var depth = 1;
		while (q.loop) {
			var c:CharCode = q.read();
			switch (c) {
				case "/".code: skipComment(q);
				case '"'.code, "'".code, "@".code, "`".code: q.skipStringAuto(c, q.version);
				case "$".code if (q.isDqTplStart(q.version)): q.skipDqTplString(q.version);
				case "{".code: depth += 1;
				case "}".code: {
					depth -= 1;
					if (depth <= 0) {
						includeTrailingSemicolon(q);
						return q.pos;
					}
				};
				default:
			}
		}
		return null;
	}
	
	static function skipComment(q:GmlReader):Void {
		switch (q.peek()) {
			case "/".code: q.skipLine();
			case "*".code: {
				q.skip();
				q.skipComment();
			};
			default:
		}
	}
	
	static function includeTrailingSemicolon(q:GmlReader):Void {
		var p = q.pos;
		while (p < q.length && (q.source.fastCodeAt(p):CharCode).isSpace0()) p += 1;
		if (p < q.length && q.source.fastCodeAt(p) == ";".code) {
			q.pos = p + 1;
		}
	}
	
	static function expandLeadingDoc(code:String, functionStart:Int):Int {
		var start = lineStartAt(code, functionStart);
		var docStart = findLeadingBlockCommentStart(code, start);
		if (docStart < 0) docStart = start;
		return includeLeadingLineDocs(code, docStart);
	}
	
	static function findLeadingBlockCommentStart(code:String, lineStart:Int):Int {
		var prev = previousLineRange(code, lineStart);
		if (prev == null) return -1;
		if (!code.substring(prev.start, prev.end).trim().endsWith("*/")) return -1;
		
		var open = code.lastIndexOf("/*", prev.end);
		if (open < 0) return -1;
		return lineStartAt(code, open);
	}
	
	static function includeLeadingLineDocs(code:String, start:Int):Int {
		var out = start;
		while (true) {
			var prev = previousLineRange(code, out);
			if (prev == null) break;
			if (!code.substring(prev.start, prev.end).trim().startsWith("///")) break;
			out = prev.start;
		}
		return out;
	}
	
	static function expandRemovalEnd(code:String, end:Int):Int {
		var p = end;
		while (p < code.length && (code.fastCodeAt(p):CharCode).isSpace0()) p += 1;
		if (p < code.length) {
			var c:CharCode = code.fastCodeAt(p);
			if (c == "\r".code) {
				p += 1;
				if (p < code.length && code.fastCodeAt(p) == "\n".code) p += 1;
			} else if (c == "\n".code) p += 1;
		}
		return p;
	}
	
	static function previousLineRange(code:String, lineStart:Int):Null<GmlConstructorExtractLine> {
		if (lineStart <= 0) return null;
		var end = lineStart - 1;
		if (end > 0 && code.fastCodeAt(end - 1) == "\r".code) end -= 1;
		var start = lineStartAt(code, end);
		return { start: start, end: end };
	}
	
	static function lineStartAt(code:String, pos:Int):Int {
		var p = pos;
		while (p > 0 && code.fastCodeAt(p - 1) != "\n".code) p -= 1;
		return p;
	}
	
	static inline function imin(a:Int, b:Int):Int {
		return a < b ? a : b;
	}
}

typedef GmlConstructorExtractResult = {
	name:String,
	nameStart:Int,
	nameEnd:Int,
	start:Int,
	functionStart:Int,
	end:Int,
	removeEnd:Int,
	text:String,
}

private typedef GmlConstructorExtractIdent = {
	name:String,
	start:Int,
	end:Int,
}

private typedef GmlConstructorExtractLine = {
	start:Int,
	end:Int,
}
