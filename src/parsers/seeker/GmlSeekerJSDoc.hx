package parsers.seeker;
import ace.extern.AceAutoCompleteItem;
import gml.GmlFuncDoc;
import gml.GmlNamespace.GmlFieldAccess;
import gml.type.GmlType;
import gml.type.GmlTypeDef;
import gml.type.GmlTypeTemplateItem;
import gml.type.GmlTypeTools;
import haxe.Rest;
import js.lib.RegExp;
import js.html.Console;
import parsers.GmlReader;
import parsers.GmlSeekData;
import parsers.seeker.GmlSeekerImpl;
import parsers.seeker.GmlSeekerJSDocRegex.*;
import tools.JsTools;
using tools.NativeArray;
using tools.NativeString;

/**
 * ...
 * @author YellowAfterlife
 */
class GmlSeekerJSDoc {
	public var args:Array<String> = null;
	public var types:Array<String> = null;
	public var rest:Bool = false;
	public var self:String = null;
	public var returns:String = null;
	public var isInterface:Bool = false;
	public var interfaceName:String = null;
	public var implementsNames:Array<String> = null;
	public var templateItems:Array<GmlTypeTemplateItem> = null;
	public var isStatic:Bool = false;
	public var isPrivate:Bool = false;
	public var access:GmlFieldAccess = Public;
	public var accessSet:Bool = false;
	public var deprecated:String = null;
	public var isVirtual:Bool = false;
	public var isAbstract:Bool = false;
	public var isOverride:Bool = false;
	public var redirectCount = 0;
	
	public function reset(resetInterf = true):Void {
		args = null;
		types = null;
		rest = null;
		self = null;
		returns = null;
		isStatic = false;
		isPrivate = false;
		access = Public;
		accessSet = false;
		deprecated = null;
		isVirtual = false;
		isAbstract = false;
		isOverride = false;
		if (resetInterf) resetInterface();
	}
	public function resetInterface() {
		isInterface = false;
		interfaceName = null;
		implementsNames = null;
		templateItems = null;
	}
	
	public function new() {
		//
	}
	
	static function copyArray<T>(arr:Array<T>) {
		return arr != null ? arr.copy() : null;
	}
	public function copy() {
		var r = new GmlSeekerJSDoc();
		r.args = copyArray(args);
		r.types = copyArray(types);
		r.rest = rest;
		r.self = self;
		r.returns = returns;
		r.isInterface = isInterface;
		r.interfaceName = interfaceName;
		r.implementsNames = copyArray(implementsNames);
		r.templateItems = copyArray(templateItems);
		r.isStatic = isStatic;
		r.isPrivate = isPrivate;
		r.access = access;
		r.accessSet = accessSet;
		r.deprecated = deprecated;
		r.isVirtual = isVirtual;
		r.isAbstract = isAbstract;
		r.isOverride = isOverride;
		r.redirectCount = redirectCount;
		return r;
	}
	
	public static function concatArrays<T>(rest:Rest<Array<T>>) {
		var result = null;
		var count = 0;
		for (arr in rest) {
			if (arr == null) continue;
			if (result == null) {
				result = arr;
			} else {
				result = result.concat(arr);
			}
			count += 1;
		}
		if (count == 1) result = result.copy();
		return result;
	}
	/** combines two JSDoc sets, including stacking arguments */
	public function append(q:GmlSeekerJSDoc) {
		// args
		args = concatArrays(args, q.args);
		types = concatArrays(types, q.types);
		if (q.rest) rest = true;
		//
		if (q.self != null) self = q.self;
		if (q.returns != null) returns = q.returns;
		if (q.isInterface) isInterface = true;
		if (q.interfaceName != null) interfaceName = q.interfaceName;
		if (q.isStatic) isStatic = true;
		if (q.isPrivate) isPrivate = true;
		if (q.accessSet) {
			access = q.access;
			accessSet = true;
		}
		if (q.deprecated != null) deprecated = q.deprecated;
		if (q.isVirtual) isVirtual = true;
		if (q.isAbstract) isAbstract = true;
		if (q.isOverride) isOverride = true;
		implementsNames = concatArrays(implementsNames, q.implementsNames);
		templateItems = concatArrays(templateItems, q.templateItems);
	}
	
	public function typesFlush(pre:Array<GmlTypeTemplateItem>, ctx:String):Array<GmlType> {
		var tpl = pre != null && templateItems != null
			? pre.concat(templateItems)
			: JsTools.or(pre, templateItems);
		var rt = [];
		if (tpl != null) {
			for (s in types) {
				s = GmlTypeTools.patchTemplateItems(s, tpl);
				rt.push(GmlTypeDef.parse(s, ctx));
			}
		} else for (s in types) rt.push(GmlTypeDef.parse(s, ctx));
		return rt;
	}
	
	function procIs(seeker:GmlSeekerImpl, full:String, typeStr:String, doc:String):Bool {
		var out = seeker.out;
		var q = seeker.reader;
		var hasType = typeStr != null;
		var type = hasType ? GmlTypeDef.parse(typeStr, full) : null;
		var access:GmlFieldAccess = Public;
		var accessMatch = null;
		if (doc != null) {
			accessMatch = jsDoc_access_tag.exec(doc);
			var publicDoc = doc.replaceExt(jsDoc_access_tag, "").trimBoth();
			if (accessMatch != null) switch (accessMatch[1]) {
				case "private": access = Private;
				case "protected": access = Protected;
				default: access = Public;
			}
			doc = publicDoc;
		}
		//
		inline function procComp(comp:AceAutoCompleteItem):Void {
			if (comp != null) {
				if (hasType) {
					comp.meta = GmlSeekerProcField.getCompMeta(true, null, type);
					comp.setDocTag("type", typeStr);
				}
				if (doc != null && doc.trimBoth() != "") comp.setDocTag("ℹ", doc);
			}
		}
		var lineStart = q.source.lastIndexOf("\n", q.pos - 1) + 1;
		var lineText = q.source.substring(lineStart, q.pos);
		var lineMatch = jsDoc_is_line.exec(lineText);
		if (lineMatch == null) return false;
		var kind = lineMatch[1];
		var name:String;
		if (lineMatch[1] != null) {
			tools.RegExpTools.each(JsTools.rx(~/\w+/g), lineMatch[1], function(mt) {
				name = mt[0];
				if (hasType) out.globalVarTypes[name] = type;
				procComp(out.comps[name]);
			});
		} else if (lineMatch[2] != null) {
			name = lineMatch[2];
			if (hasType) out.globalTypes[name] = type;
			var globalField = out.globalFields[name];
			if (globalField != null) {
				procComp(globalField.comp);
			}
		} else {
			name = lineMatch[3];
			var namespace:String;
			if (seeker.isCreateEvent) {
				namespace = seeker.getObjectName();
			} else if (seeker.doc != null) {
				namespace = seeker.doc.name;
				if (namespace == null) return false;
			} else return false;
			var hint = out.fieldHints[namespace + ":" + name];
			if (hint == null && hasType) {
				hint = GmlSeekerProcField.addFieldHint(seeker, false, namespace, true, name,
					null, doc, type, null, false, null, false, null, access);
			}
			if (hint != null) {
				if (hasType) hint.type = type;
				if (accessMatch != null) {
					hint.access = access;
					hint.isPrivate = access == Private;
					hint.accessSet = true;
					if (access == Private) hint.comp = null;
				}
				procComp(hint.comp);
			}
		}
		return true;
	}
	public function proc(seeker:GmlSeekerImpl, s:String) {
		/*
		A thing to remember! Suppose you have the following:
		```
		function a() {}
		/// hello!
		function b() {}
		```
		for that comment, `main` would not be `b` since we didn't get to `b` yet
		*/
		var out = seeker.out;
		var q = seeker.reader;
		
		var mt = jsDoc_implements.exec(s);
		if (mt != null) {
			var nsi = mt[1];
			if (nsi == null) {
				var lineStart = q.source.lastIndexOf("\n", q.pos - 1) + 1;
				var lineText = q.source.substring(lineStart, q.pos);
				var lineMatch = jsDoc_implements_line.exec(lineText);
				if (lineMatch == null) return;
				nsi = lineMatch[1];
			}
			if (implementsNames == null) implementsNames = [];
			implementsNames.push(nsi);
			return;
		}
		
		mt = jsDoc_is.exec(s);
		if (mt != null) {
			procIs(seeker, s, mt[1], mt[2]);
			return;
		}
		
		mt = jsDoc_template.exec(s);
		if (mt != null) {
			var tc = mt[1];
			var names = mt[2];
			if (templateItems == null) templateItems = [];
			for (name in names.split(",")) {
				templateItems.push(new GmlTypeTemplateItem(name, tc));
			}
			return;
		}
		
		mt = jsDoc_typedef.exec(s);
		if (mt != null) {
			var typeStr = mt[1];
			var name = mt[2];
			var paramsStr = mt[3];
			var params = paramsStr != null ? GmlTypeTemplateItem.parseSplit(paramsStr) : null;
			if (params != null) typeStr = GmlTypeTools.patchTemplateItems(typeStr, params);
			var type = GmlTypeDef.parse(typeStr);
			out.typedefs[name] = type;
			return;
		}
		
		mt = jsDoc_hint_extimpl.exec(s);
		if (mt != null) {
			var name = mt[1];
			var target = mt[3];
			if (mt[2] == "implements") {
				var arr = out.namespaceImplements[name];
				if (arr == null) out.namespaceImplements[name] = arr = [];
				if (arr.indexOf(target) < 0) arr.push(target);
			} else {
				var imp = out.namespaceHints[name];
				if (imp != null) {
					imp.parentSpace = target;
				} else {
					imp = new GmlSeekDataNamespaceHint(name, target, null);
					out.namespaceHints[name] = imp;
				}
			}
			return;
		}
		
		mt = jsDoc_hint.exec(s);
		if (mt != null) { // @hint
			var typeStr = mt[1];
			var isNew = mt[2] != null;
			var hr = new GmlReader(mt[3], seeker.version), hp:Int;
			hr.skipSpaces0_local();
			
			var templateSelf:GmlType = null;
			var templateItems:Array<GmlTypeTemplateItem> = null;
			var nsName = hr.readIdent();
			var ctrReturn = null;
			if (nsName != null) {
				if (isNew) ctrReturn = nsName;
				hr.skipSpaces0_local();
				if (hr.peek() == "<".code) { // namespace<params>
					hp = hr.pos;
					if (hr.skipTypeParams()) {
						templateItems = GmlTypeTemplateItem.parseSplit(hr.substring(hp + 1, hr.pos - 1));
						if (isNew) ctrReturn += GmlTypeTemplateItem.joinTemplateString(templateItems, false);
						templateSelf = GmlTypeTemplateItem.toTemplateSelf(templateItems);
						hr.skipSpaces0_local();
					} else return;
				}
			}
			
			if (nsName == null && seeker.doc != null && seeker.doc.templateItems != null) {
				templateSelf = GmlTypeTemplateItem.toTemplateSelf(seeker.doc.templateItems);
				templateItems = seeker.doc.templateItems.copy();
			}
			if (templateItems != null && typeStr != null) {
				typeStr = GmlTypeTools.patchTemplateItems(typeStr, templateItems);
			}
			
			var isInst = false;
			var fdName = null;
			var c = hr.peek();
			if (c == ".".code || c == ":".code) {
				isInst = c == ":".code;
				if (!isInst) templateSelf = null;
				hr.skip();
				hr.skipSpaces0_local();
				fdName = hr.readIdent();
				if (fdName != null) {
					hr.skipSpaces0_local();
				}
				if (hr.peek() == "<".code) { // namespace<params>
					hp = hr.pos;
					if (hr.skipTypeParams()) {
						var fdp = GmlTypeTemplateItem.parseSplit(hr.substring(hp + 1, hr.pos - 1));
						templateItems = templateItems.nzcct(fdp);
						hr.skipSpaces0_local();
					} else return;
				}
			}
			
			var args = null;
			if (hr.peek() == "(".code) {
				hp = hr.pos;
				hr.skip();
				var depth = 1;
				while (hr.loopLocal) {
					c = hr.read();
					switch (c) {
						case "(".code: depth++;
						case ")".code: if (--depth <= 0) break;
					}
				}
				if (depth > 0) return;
				if (hr.peekstr(2) == "->") {
					hr.skip(2);
					hr.skipType();
				}
				args = hr.substring(hp, hr.pos);
				if (templateItems != null) {
					args = GmlTypeTools.patchTemplateItems(args, templateItems);
				}
				hr.skipSpaces0_local();
			}
			
			var info = hr.source.substring(hr.pos);
			
			GmlSeekerProcField.addFieldHint(seeker, isNew, nsName, isInst, fdName, args,
				info, GmlTypeDef.parse(typeStr, mt[0]), null, false, null, false, null, access);
			var addFieldHint_doc = GmlSeekerProcField.addFieldHint_doc;
			if (addFieldHint_doc != null) {
				if (ctrReturn != null) addFieldHint_doc.returnTypeString = ctrReturn;
				if (templateSelf != null) addFieldHint_doc.templateSelf = templateSelf;
				if (templateItems != null) addFieldHint_doc.templateItems = templateItems;
				GmlSeekerProcDoc.flushMetaToDoc(this, addFieldHint_doc);
			}
			deprecated = null;
			return; // found!
		}
		
		mt = jsDoc_deprecated.exec(s);
		if (mt != null) {
			deprecated = mt[1].trimBoth();
			return;
		}
		
		mt = jsDoc_virtual.exec(s);
		if (mt != null) {
			isVirtual = true;
			return;
		}
		
		mt = jsDoc_abstract.exec(s);
		if (mt != null) {
			isAbstract = true;
			return;
		}
		
		mt = jsDoc_override.exec(s);
		if (mt != null) {
			isOverride = true;
			return;
		}

		mt = jsDoc_self.exec(s);
		if (mt != null) {
			self = mt[1];
			return;
		}
		
		mt = jsDoc_return.exec(s);
		if (mt != null) {
			returns = mt[1];
			return;
		}
		
		mt = jsDoc_interface.exec(s);
		if (mt != null) {
			isInterface = true;
			interfaceName = mt[1]; // @interface {Name}
			if (interfaceName == null) {
				if (seeker.isObject) {
					interfaceName = seeker.getObjectName();
				} else if (!seeker.hasFunctionLiterals) {
					interfaceName = seeker.main;
				}
			}
			return;
		}
		
		mt = jsDoc_param.exec(s);
		if (mt != null) {
			if (args == null) {
				args = [];
				types = [];
			}
			var argType = mt[1];
			var argNames = mt[3];
			var argValueWrap = mt[4];
			var showArgTypes = ui.Preferences.current.showArgTypesInStatusBar;
			var argNameArr = argNames.split(",");
			for (i => arg in argNameArr) {
				if (arg.contains("...")) rest = true;
				if (argValueWrap != null && i == argNameArr.length - 1) {
					if (arg.endsWith("]")) {
						arg = arg.substring(0, arg.length - 1);
						if (showArgTypes && argType != null) arg += ":" + argType;
						arg += argValueWrap + "]";
					} else {
						if (showArgTypes && argType != null) arg += ":" + argType;
						arg += argValueWrap;
					}
				} else if (showArgTypes && argType != null) {
					if (arg.endsWith("]")) {
						arg = arg.substring(0, arg.length - 1) + ":" + argType + "]";
					} else arg += ":" + argType;
				}
				args.push(arg);
				types.push(argType);
			}
			return; // found!
		}
		
		if (seeker.hasFunctionLiterals) {
			mt = jsDoc_func.exec(s);
			if (mt != null) { // 2.3 @func
				var fn = mt[1];
				var fa = mt[2];
				var pre = fn + "(";
				var post = mt[3];
				var rest = fa.contains("...");
				var jsd = new GmlFuncDoc(fn, pre, post, fa.splitNonEmpty(","), rest);
				GmlSeekerProcDoc.flushMetaToDoc(this, jsd);
				deprecated = null;
				out.docs[fn] = jsd;
				out.comps[fn] = new AceAutoCompleteItem(fn, pre + fa + post);
				if (!out.kindMap.exists(fn)) {
					out.kindMap[fn] = "asset.script";
					out.kindList.push(fn);
				}
				seeker.setLookup(fn, false, "asset.script");
				return;
			}
		}
		
		mt = jsDoc_static.exec(s);
		if (mt != null) {
			isStatic = true;
			return;
		}
		
		mt = jsDoc_private.exec(s);
		if (mt != null) {
			if (procIs(seeker, s, null, s.substring(3).trimBoth())) return;
			isPrivate = true;
			access = Private;
			accessSet = true;
			return;
		}
		
		mt = jsDoc_protected.exec(s);
		if (mt != null) {
			if (procIs(seeker, s, null, s.substring(3).trimBoth())) return;
			access = Protected;
			accessSet = true;
			return;
		}
		
		mt = jsDoc_public.exec(s);
		if (mt != null) {
			if (procIs(seeker, s, null, s.substring(3).trimBoth())) return;
			isPrivate = false;
			access = Public;
			accessSet = true;
			return;
		}
		
		mt = jsDoc_index_redirect.exec(s);
		if (mt != null) {
			var code:String;
			var rel = mt[1];
			if (rel != null && ++redirectCount > 32) {
				Console.error('More than 32 layers of @index_redirect in file "${seeker.orig}');
				rel = null;
			}
			if (rel != null) {
				var full:String;
				if (rel.startsWith("/")) {
					full = gml.Project.current.fullPath(rel.substring(1));
				} else {
					var dir = tools.PathTools.ptDir(seeker.orig);
					full = tools.PathTools.ptJoin(dir, rel);
				}
				if (electron.FileWrap.existsSync(full)) {
					try {
						code = electron.FileWrap.readTextFileSync(full);
					} catch (x:Dynamic) {
						Console.error('Error loading @index_redirect file "$rel" requested from "${seeker.orig}', x);
						code = null;
					}
				} else {
					Console.error('Specified @index_redirect file "$rel" requested from "${seeker.orig} doesn\'t exist');
					code = null;
				}
			} else code = null;
			//
			var reader = seeker.reader;
			var oldName = reader.name;
			if (code != null) {
				var tmp = new GmlReaderExt(code, reader.version);
				reader.setTo(tmp);
			} else {
				reader.clear();
			}
			reader.name = oldName;
			return;
		}
		
		// tags from hereafter have no meaning outside of a script/function
		if (seeker.main == null) return;
		
		// Classic JSDoc (`/// func(arg1, arg2)`) ?:
		mt = jsDoc_full.exec(s);
		if (mt != null) {
			if (!out.docs.exists(seeker.main)) {
				seeker.doc = GmlFuncDoc.parse(seeker.main + mt[1]);
				seeker.linkDoc();
				if (seeker.mainComp != null && seeker.mainComp.doc == null) {
					seeker.mainComp.doc = s;
				}
			}
			return; // found!
		}
		
		// merge suffix-docs in GML variants with #define args into the doc line:
		if (seeker.version.hasScriptArgs()) {
			// `#define func(a, b)\n/// does things` -> `func(a, b) does things`
			s = s.substring(3).trimLeft();
			seeker.doc = out.docs[seeker.main];
			if (seeker.doc == null) {
				if (gmlDoc_full.test(s)) {
					seeker.doc = GmlFuncDoc.parse(s);
					seeker.doc.name = seeker.main;
					seeker.doc.pre = seeker.main + "(";
				} else seeker.doc = GmlFuncDoc.createRest(seeker.main);
				seeker.linkDoc();
			} else {
				if (gmlDoc_full.test(s)) {
					GmlFuncDoc.parse(s, seeker.doc);
					seeker.doc.name = seeker.main;
					seeker.doc.pre = seeker.main + "(";
				} else seeker.doc.post += " " + s;
			}
			if (seeker.mainComp != null) seeker.mainComp.doc = seeker.doc.getAcText();
			return; // found!
		}
		
		// perhaps it's `field = value; /// note`
		if (!jsDoc_anyTag.test(s) && (mt = jsDoc_is_line.exec(s)) != null) {
			procIs(seeker, s, null, s.substring(3).trimBoth());
			return;
		}
		
		// perhaps it's just extra text
		s = s.substring(3).trimBoth();
		if (seeker.mainComp != null) {
			seeker.mainComp.doc = seeker.mainComp.doc.nzcct("\n", s);
		}
	}
	public function procMultiLine(seeker:GmlSeekerImpl, text:String) {
		static var cr = new RegExp("\r", "g");
		text = text.substring(3, text.length - 2).trimIfEndsWith("*").trimBoth();
		text = text.replaceExt(cr, "");
		for (line in text.split("\n")) {
			static var starStart = new RegExp("^\\s*" + "\\*+" + "\\s*" + "(.*)");
			var mt = starStart.exec(line);
			if (mt != null) line = mt[1];
			proc(seeker, "///" + line);
		}
	}
}
