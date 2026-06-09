package parsers.linter;
import ace.AceGmlTools;
import gml.GmlAPI;
import gml.GmlFuncDoc;
import gml.GmlImports;
import gml.GmlNamespace;
import gml.GmlNamespace.GmlFieldAccess;
import gml.type.GmlType;
import gml.type.GmlTypeDef;
import tools.JsTools;
using tools.NativeString;

/**
 * ...
 * @author YellowAfterlife
 */
@:access(parsers.linter.GmlLinter)
class GmlLinterIdent {
	public static var type:GmlType = null;
	public static var func:GmlFuncDoc = null;
	public static var isLocal:Bool = false;
	static function getSelfInstDoc(linter:GmlLinter, currName:String, imp:GmlImports):GmlFuncDoc {
		var selfType = linter.getSelfType();
		if (selfType == null) return null;
		return switch (selfType) {
			case TInst(tn, _, tk) if (tk != GmlTypeKind.KAny):
				AceGmlTools.findNamespace(tn, imp, function(ns:GmlNamespace) {
					return ns.getInstDoc(currName, 0, linter.getSelfNamespaceName());
				});
			default: null;
		}
	}
	public static function read(linter:GmlLinter, currName:String) {
		var currType:GmlType = null;
		var currFunc:GmlFuncDoc = null;
		var isLocal = false;
		do {
			switch (currName) {
				case "self":
					currType = linter.getSelfType();
					currFunc = currType.getSelfCallDoc(linter.getImports());
					break;
				case "other":
					currType = linter.getOtherType();
					currFunc = currType.getSelfCallDoc(linter.getImports());
					break;
				case "global":
					currType = GmlTypeDef.global;
					break;
				case "true", "false":
					currType = GmlTypeDef.bool;
					break;
				case "async_load":
					var ctx = linter.context;
					if (ctx.startsWith("async_")) {
						var defName = "async_load_" + ctx.substring(6);
						if (GmlAPI.stdTypedefs.exists(defName) || GmlAPI.gmlTypedefs.exists(defName)) {
							currType = GmlTypeDef.simple(defName);
							break;
						}
					}
				case s if (s.startsWith("argument") && s.length <= JsTools.clen("argument") + 2):
					if (s.length == JsTools.clen("argument")) {
						var doc:GmlFuncDoc = linter.currFuncDoc;
						if (doc != null && doc.argTypes != null) {
							currType = GmlType.TInst("tuple", doc.argTypes, KTuple);
						}
						break;
					} else {
						var i = Std.parseInt(s.substring(JsTools.clen("argument")));
						if (i != null && i < 16) {
							var doc:GmlFuncDoc = linter.currFuncDoc;
							if (doc != null && doc.argTypes != null) {
								currType = doc.argTypes[i];
							}
							break;
						}
					}
			}
			
			var imp:GmlImports = linter.getImports();
			var locals = linter.editor.locals[linter.context];
			if (locals != null && locals.kind.exists(currName)) {
				isLocal = true;
				if (imp != null) {
					currType = imp.localTypes[currName];
					currFunc = currType != null ? currType.getSelfCallDoc(imp) : null;
				} else { // locals without type information
					currType = null;
					currFunc = null;
				}
				break;
			}
			
			var lam = linter.editor.lambdas[linter.context];
			if (lam != null && lam.kind.exists(currName)) {
				currFunc = lam.docs[currName];
				break;
			}

			var contextInstType = linter.getContextInstType(currName);
			var selfInstDoc = contextInstType != null ? getSelfInstDoc(linter, currName, imp) : null;
			if (contextInstType != null && selfInstDoc == null) {
				currType = contextInstType;
				currFunc = currType.getSelfCallDoc(imp);
				break;
			}
			if (imp != null) {
				var importedInstType = imp.localTypes[currName];
				if (importedInstType != null) {
					if (selfInstDoc == null) selfInstDoc = getSelfInstDoc(linter, currName, imp);
					if (selfInstDoc == null) {
						currType = importedInstType;
						currFunc = currType.getSelfCallDoc(imp);
						break;
					}
				}
			}
			
			var kind = GmlAPI.gmlKind[currName];
			if (kind != null) {
				if (kind.startsWith("asset.")) {
					kind = kind.substring(6);
					if (kind == "object") {
						currType = GmlTypeDef.object(currName);
					} else if (kind == "script") {
						currFunc = GmlAPI.gmlDoc[currName];
						currType = currFunc != null ? currFunc.getFunctionType() : null;
					} else {
						currType = GmlTypeDef.simple(kind);
					}
					break;
				} else if (kind == "enum") {
					currType = GmlTypeDef.type(currName);
				}
			}
			if (AceGmlTools.findNamespace(currName, imp, function(ns:GmlNamespace) {
				if (ns.noTypeRef) return false;
				currType = GmlTypeDef.type(currName);
				currFunc = JsTools.or(ns.docStaticMap[""], AceGmlTools.findGlobalFuncDoc(currName));
				return true;
			})) break;
			if (kind != null) {
				currType = GmlAPI.gmlTypes[currName];
				break;
			}
			
			if (GmlAPI.extKind.exists(currName)) {
				currFunc = GmlAPI.extDoc[currName];
				if (currType == null && currFunc != null) {
					currType = currFunc.getFunctionType();
				}
				break;
			}
			
			if (GmlAPI.stdKind.exists(currName)) {
				currFunc = GmlAPI.stdDoc[currName];
				currType = GmlAPI.stdTypes[currName];
				if (currType == null && currFunc != null) {
					currType = currFunc.getFunctionType();
				}
				break;
			}
			
			var t = linter.getSelfType();
			switch (t) {
				case null: {};
				case TAnon(inf): {
					var fd = inf.fields[currName];
					if (fd != null) {
						currType = fd.type;
						currFunc = fd.doc;
					} else if (linter.prefs.requireFields) {
						linter.addWarning('Variable $currName is not part of anonymous struct '
							+ t.toString());
					}
				};
				case TInst(tn, _, tk) if (tk != GmlTypeKind.KAny): {
					var wantWarn = false;
					var localInstType = linter.getContextNamespaceInstType(tn, currName);
					var found = false;
					if (localInstType != null) {
						currType = localInstType;
						currFunc = getSelfInstDoc(linter, currName, imp);
						if (currFunc == null) currFunc = currType.getSelfCallDoc(imp);
						found = true;
					} else {
						var accessContext = linter.getSelfNamespaceName();
						found = AceGmlTools.findNamespace(tn, imp, function(ns:GmlNamespace) {
							wantWarn = true;
							var access = ns.getInstAccess(currName);
							if (access != null && !GmlNamespace.isAccessAllowed(access.access, access.owner, accessContext)) {
								linter.warnInstAccess(currName, access);
								return false;
							}
							if (ns.getInstKind(currName, 0, accessContext) != null) {
								currType = ns.getInstType(currName, 0, accessContext);
								currFunc = ns.getInstDoc(currName, 0, accessContext);
								if (currFunc == null) {
									currFunc = currType.getSelfCallDoc(linter.getImports());
								}
								return true;
							} else return false;
						});
					}
					if (!found && wantWarn && linter.prefs.requireFields) {
						linter.addWarning('Variable $currName is not part of $tn');
					}
				};
				default:
			}
		} while (false);
		type = currType;
		func = currFunc;
		GmlLinterIdent.isLocal = isLocal;
	}
}
