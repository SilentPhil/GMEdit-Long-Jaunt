package ace.statusbar;
import ace.AceStatusBar;
import ace.AceGmlTools;
import ace.extern.AceRange;
import gml.GmlAPI;
import gml.GmlFuncDoc;
import gml.GmlImports;
import gml.GmlNamespace;
import gml.type.GmlType;
import gml.type.GmlTypeDef;
import parsers.linter.GmlLinter;
import tools.JsTools;

/**
 * Handles various ctx.fn() mappings
 * and #import rules (e.g. grabbing a doc for draw_text from Draw.text)
 * @author YellowAfterlife
 */
class AceStatusBarImports {
	static function copyDocWithReturnType(doc:GmlFuncDoc, name:String, returnType:GmlType):GmlFuncDoc {
		if (doc != null && doc.hasReturn == true && doc.returnType != null && doc.returnType.getKind() != KVoid) {
			return doc;
		}
		var out:GmlFuncDoc;
		if (doc != null) {
			out = new GmlFuncDoc(name, name + "(", doc.post, doc.args.copy(), doc.rest);
			out.argTypes = doc.argTypes;
			out.argsAreFromJSDoc = doc.argsAreFromJSDoc;
			out.isConstructor = doc.isConstructor;
			out.parentName = doc.parentName;
			out.selfType = doc.selfType;
			out.selfTypeIsAuto = doc.selfTypeIsAuto;
			out.lookup = doc.lookup;
			out.nav = doc.nav;
			out.templateItems = doc.templateItems;
			out.templateSelf = doc.templateSelf;
		} else {
			out = GmlFuncDoc.create(name);
		}
		out.returnTypeString = returnType.toString();
		return out;
	}
	static function syncDocWithCallableType(doc:GmlFuncDoc, name:String, type:GmlType, imports:GmlImports):GmlFuncDoc {
		if (type == null) return doc;
		type = type.resolve().unwrapNullable().resolve();
		return switch (type) {
			case TInst(_, params, KFunction | KConstructor) if (params.length > 0):
				var returnType = params[params.length - 1];
				if (returnType.getKind() == KVoid) doc;
				else {
					if (doc == null) doc = AceGmlTools.findSelfCallDoc(type, imports);
					copyDocWithReturnType(doc, name, returnType);
				}
			default: doc;
		}
	}
	public static function procDocImport(ctx:AceStatusBarDocSearch):Int {
		var imports = ctx.imports;
		var hasGlobalNamespaces = !GmlAPI.gmlNamespaces.isEmpty();
		if (imports == null && !hasGlobalNamespaces) return 0;
		var tk = ctx.tk;
		var fnType = tk.type;
		var objType:GmlType = null;
		var iter = ctx.iter;
		var name = tk.value;
		var doc = ctx.docs[name];
		var argStart = 0;
		//
		var tk = iter.stepBackward();
		if (tk != null && tk.value == ".") {
			tk = iter.stepBackward();
			if (tk.type == "asset.object") {
				objType = GmlTypeDef.object(tk.value);
			} else if (tk.value == "other") {
				objType = AceGmlTools.getOtherType({ session: ctx.session, scope: ctx.scope });
			} else if (tk.value == "self") {
				objType = AceGmlTools.getSelfType({ session: ctx.session, scope: ctx.scope });
			} else if (tk.type == "namespace") {
				var nsName = tk.value;
				var td = null;
				
				if (imports != null) {
					td = imports.docs[nsName + "." + name];
					if (td == null) {
						var nsLocal = imports.namespaces[nsName];
						if (nsLocal != null) td = nsLocal.docStaticMap[name];
					}
				}
				
				if (td == null && hasGlobalNamespaces) {
					var nsGlobal = GmlAPI.gmlNamespaces[nsName];
					if (nsGlobal != null) td = nsGlobal.docStaticMap[name];
				}
				
				if (td != null) doc = td;
			} else if (imports != null
				&& (tk.type == "local" || tk.type == "sublocal")
				&& imports.localTypes.exists(tk.value)
			) {
				objType = imports.localTypes[tk.value];
			} else {
				iter.stepForward();
				tk = iter.stepForward();
			}
			if (objType != null) {
				var btk = iter.peekBackwardNonText();
				if (btk != null && btk.ncType == "keyword") switch (btk.value) {
					case "as", "cast": objType = null;
				}
			}
		} else {
			if (imports != null && (fnType == "field" || fnType == "localfield")) {
				var importedInstType = imports.localTypes[name];
				if (importedInstType != null) {
					ctx.type = importedInstType;
					doc = syncDocWithCallableType(null, name, importedInstType, imports);
					tk = iter.stepForward();
					ctx.tk = tk;
					ctx.doc = doc;
					return argStart;
				}
			}
			if (imports != null) {
				doc = AceMacro.jsOr(imports.docs[name], doc);
			}
			if (fnType == "localfield" || fnType == "asset.script" && doc == null) {
				objType = AceGmlTools.getSelfType({ session: ctx.session, scope: ctx.scope });
			}
			tk = iter.stepForward();
		}
		//
		if (objType != null) {
			objType = objType.unwrapNullable();
			var tn = objType.getNamespace();
			var fieldType:GmlType = null;
			var fieldTypeText:String = null;
			if (tn != null) {
				AceGmlTools.findNamespace(tn, imports, function(ns:GmlNamespace){
					if (doc == null) {
						doc = ns.getInstDoc(name);
						if (doc != null
							&& Std.is(ns, GmlImportNamespace)
							&& (cast ns:GmlImportNamespace).longen.exists(name)
						) argStart = 1;
					}
					if (fieldType == null) {
						fieldType = ns.getInstType(name);
					}
					if (fieldTypeText == null) {
						var comp = ns.getInstCompItem(name);
						if (comp != null) {
							fieldTypeText = comp.doc;
						} else {
							fieldTypeText = ns.getInstTypeText(name);
							if (fieldTypeText != null) fieldTypeText += "\n" + "unlisted";
						}
					}
					return false;
				});
			}
			if (doc == null) {
				doc = AceGmlTools.findSelfCallDoc(fieldType, imports);
			}
			doc = syncDocWithCallableType(doc, name, fieldType, imports);
			ctx.type = fieldType;
			ctx.typeText = fieldTypeText;
		} else {
			var from = AceGmlTools.skipDotExprBackwards(ctx.session, ctx.funcEnd);
			ctx.exprStart = from;
			var snip = ctx.session.getTextRange(AceRange.fromPair(from, ctx.funcEnd));
			var inf = GmlLinter.getType(snip, ctx.session.gmlEditor, ctx.scope, ctx.iter.getCurrentTokenPosition());
			doc = inf.doc;
			ctx.type = inf.type;
		}
		//
		ctx.tk = tk;
		ctx.doc = doc;
		return argStart;
	}
}
