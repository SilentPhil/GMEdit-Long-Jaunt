package parsers.seeker;
import ace.extern.AceAutoCompleteItem;
import gml.GmlAPI;
import gml.GmlAPI.GmlLookup;
import gml.GmlField;
import gml.GmlFuncDoc;
import gml.GmlNamespace.GmlFieldAccess;
import gml.type.GmlType;
import gml.type.GmlTypeDef;
import gml.type.GmlTypeTemplateItem;
import gml.type.GmlTypeTools;
import parsers.GmlSeekData.GmlSeekDataHint;
import tools.JsTools;
import tools.NativeString;

/**
 * ...
 * @author YellowAfterlife
 */
class GmlSeekerProcField {
	public static var addFieldHint_doc:GmlFuncDoc = null;
	
	public static function isFunctionType(type:GmlType):Bool {
		if (type == null) return false;
		return switch (type.resolve().unwrapNullable().getKind()) {
			case KFunction | KConstructor: true;
			default: false;
		}
	}
	
	public static function getCompMeta(isField:Bool, args:String, type:GmlType):String {
		if (!isField) return "namespace";
		return args != null || isFunctionType(type) ? "function" : "variable";
	}
	
	public static function getEffectiveInstAccess(seeker:GmlSeekerImpl, field:String, hasExplicitFieldAccess:Bool):GmlFieldAccess {
		if (hasExplicitFieldAccess) return seeker.jsDoc.access;
		var regionAccess = seeker.getRegionAccess();
		if (regionAccess != null) return regionAccess;
		var doc = seeker.doc;
		if (doc != null && doc.isConstructor && doc.defaultFieldAccess != Public) {
			return doc.defaultFieldAccess;
		}
		var parentName = doc != null && doc.isConstructor ? doc.parentName : null;
		var depth = 0;
		while (parentName != null && ++depth <= gml.GmlNamespace.maxDepth) {
			var hint = seeker.out.fieldHints[parentName + ":" + field];
			if (hint != null) return hint.access;
			
			var ns = GmlAPI.gmlNamespaces[parentName];
			var access = ns != null ? ns.getInstAccess(field) : null;
			if (access != null) return access.access;
			
			var namespaceHint = seeker.out.namespaceHints[parentName];
			if (namespaceHint != null) {
				parentName = namespaceHint.parentSpace;
			} else {
				parentName = ns != null && ns.parent != null ? ns.parent.name : null;
			}
		}
		return doc != null && doc.isConstructor ? doc.defaultFieldAccess : Public;
	}
	
	public static function addFieldHint(seeker:GmlSeekerImpl,
		isConstructor:Bool,
		namespace:String,
		isInst:Bool,
		field:String,
		args:String,
		info:String,
		type:GmlType,
		argTypes:Array<GmlType>,
		isAuto:Bool,
		?templateItems:Array<GmlTypeTemplateItem>,
		isPrivate:Bool = false,
		?lookup:GmlLookup,
		access:GmlFieldAccess = Public,
		accessSet:Bool = false
	):GmlSeekDataHint {
		var parentSpace:String = null;
		if (namespace == null) {
			if (seeker.isCreateEvent) {
				namespace = seeker.getObjectName();
				parentSpace = seeker.project.objectParents[namespace];
			} else if (seeker.doc != null) {
				namespace = seeker.doc.name;
				parentSpace = seeker.doc.parentName;
				if (namespace == null) return null;
			} else return null;
		}
		field = JsTools.or(field, "");
			
		var isField = (field != "");
		var name = isField ? field : namespace;
		
		var hintDoc:GmlFuncDoc = null;
		if (args != null) {
			var fa = name;
			if (templateItems != null) {
				fa += GmlTypeTemplateItem.joinTemplateString(templateItems, true);
			}
			if (field == "" && isInst) {
				// self-call, we check for this in GmlLinterFuncArgs
				fa += ":";
			}
			fa += GmlFuncDoc.patchArrow(args);
			hintDoc = GmlFuncDoc.parse(fa);
			hintDoc.trimArgs();
			hintDoc.isConstructor = isConstructor;
			if (argTypes != null) hintDoc.argTypes = argTypes;
			if (type == null) type = hintDoc.getFunctionType();
			info = NativeString.nzcct(hintDoc.getAcText(), "\n", info);
		}
		addFieldHint_doc = hintDoc;
		info = NativeString.nzcct(info, "\n", 'from $namespace');
		if (type != null) info = NativeString.nzcct(info, "\n", "type " + type.toString());
		
		var compMeta = getCompMeta(isField, args, type);
		var privateFieldRegex = seeker.privateFieldRegex;
		if (isPrivate && access == Public) access = Private;
		var comp = (privateFieldRegex == null || !privateFieldRegex.test(name)) && !(isInst && access == Private)
			? new AceAutoCompleteItem(name, compMeta, info) : null;
		var hint = new GmlSeekDataHint(namespace, isInst, field, comp, hintDoc, parentSpace,
			type, isPrivate, lookup, access, accessSet);
		
		var out = seeker.out;
		var lastHint = out.fieldHints[hint.key];
		if (lastHint == null) {
			out.fieldHints[hint.key] = hint;
		} else {
			lastHint.merge(hint, isAuto);
			hint = lastHint;
		}
		
		if (isField) {
			//
		} else if (!isInst) {
			out.comps[name] = comp;
			//
			if (!out.kindMap.exists(name)) out.kindList.push(name);
			out.kindMap[name] = "namespace";
			if (hintDoc != null) out.docs[name] = hintDoc;
		}
		return hint;
	}
	
	public static function addInstVar(seeker:GmlSeekerImpl, s:String):Void {
		var out = seeker.out;
		var privateFieldRegex = seeker.privateFieldRegex;
		if (out.instFieldMap[s] == null
			&& (privateFieldRegex == null || !privateFieldRegex.test(s))
		) {
			var fd = GmlAPI.gmlInstFieldMap[s];
			if (fd == null) {
				fd = new GmlField(s, "variable");
				GmlAPI.gmlInstFieldMap.set(s, fd);
			}
			out.instFieldList.push(fd);
			out.instFieldMap.set(s, fd);
			out.instFieldComp.push(fd.comp);
		}
	}
}
