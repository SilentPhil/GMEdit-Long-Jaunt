package gml;
import gml.GmlAPI;
import gml.GmlAPI.GmlLookup;
import gml.GmlFuncDoc;
import gml.type.GmlType;
import gml.type.GmlTypeTools;
import tools.ArrayMap;
import tools.ArrayMapSync;
import tools.Dictionary;
import ace.extern.*;

enum abstract GmlFieldAccess(String) from String to String {
	var Public = "public";
	var Private = "private";
	var Protected = "protected";
}
typedef GmlNamespaceAccessInfo = {
	access:GmlFieldAccess,
	owner:String,
}
typedef GmlNamespaceConstInfo = {
	owner:String,
	isVirtual:Bool,
	isOverride:Bool,
}

/**
 * A namespace is a set of static and/or instance fields belonging to some context.
 * It is used for both syntax highlighting and auto-completion.
 * @author YellowAfterlife
 */
class GmlNamespace {
	public static var blank(default, null):GmlNamespace = new GmlNamespace("");
	public static inline var maxDepth = 128;
	
	public var name:String;
	
	/**
	 * Whether this namespace represents an object
	 * (and will have built-ins highlighted/shown in auto-completion)
	 */
	public var isObject:Bool = false;
	
	/**
	 * Whether this can be cast to `struct` constraint-type.
	 * Defaults to `true` for user types and `false` for built-ins.
	 */
	public var canCastToStruct:Bool = true;
	
	/**
	 * Whether assigning `undefined` to this type is allowed.
	 */
	public var isNullable:Bool = false;
	
	/**
	 * If set to true, you cannot reference type<> for this namespace
	 */
	public var noTypeRef:Bool = false;
	
	public var avoidHighlight:Bool = false;
	
	/**
	 * Parent namespace, if any
	 */
	public var parent:GmlNamespace = null;

	/** Parent namespace with concrete template arguments, if specialized. */
	public var parentType:GmlType = null;

	/**
	 * Interfaces that this namespace implements.
	 */
	public var interfaces:ArrayMap<GmlNamespace> = new ArrayMap();
	
	/** Whether -1 can be assigned to this type - used for built-in index-based types */
	public var minus1able:Bool = false;
	
	public var staticKind:Dictionary<AceTokenType> = new Dictionary();
	public var staticTypes:Dictionary<GmlType> = new Dictionary();
	public var staticLookup:Dictionary<GmlLookup> = new Dictionary();
	/** static (`Buffer.ptr`) completions */
	public var compStatic:ArrayMap<AceAutoCompleteItem> = new ArrayMap();
	public var docStaticMap:Dictionary<GmlFuncDoc> = new Dictionary();
	
	public var instKind:Dictionary<AceTokenType> = new Dictionary();
	public function getInstKind(field:String, depth:Int = 0, accessContext:String = null):AceTokenType {
		var q = this, n = depth;
		while (q != null && ++n <= maxDepth) {
			var t = q.instKind[field];
			if (t != null) return isAccessAllowed(q.getOwnInstAccess(field), q.name, accessContext) ? t : null;
			if (q.isObject) {
				t = GmlAPI.stdInstKind[field];
				if (t != null) return t;
			}
			for (qi in q.interfaces.array) {
				t = qi.getInstKind(field, n, accessContext);
				if (t != null) return t;
			}
			q = q.parent;
		}
		return null;
	}
	
	public var instTypes:Dictionary<GmlType> = new Dictionary();
	public var instLookup:Dictionary<GmlLookup> = new Dictionary();
	public var instConst:Dictionary<Bool> = new Dictionary();
	public var staticConst:Dictionary<Bool> = new Dictionary();
	public var instVirtual:Dictionary<Bool> = new Dictionary();
	public var staticVirtual:Dictionary<Bool> = new Dictionary();
	public var instOverride:Dictionary<Bool> = new Dictionary();
	public var staticOverride:Dictionary<Bool> = new Dictionary();
	public function getInstType(field:String, depth:Int = 0, accessContext:String = null):GmlType {
		var q = this, n = depth;
		var parentTypes:Array<GmlType> = [];
		inline function specialize(t:GmlType):GmlType {
			var i = parentTypes.length;
			while (--i >= 0) {
				switch (parentTypes[i]) {
					case TInst(_, params, _):
						t = GmlTypeTools.specializeParentTemplates(t, params, params.length);
					default:
				}
			}
			return t;
		}
		while (q != null && ++n <= maxDepth) {
			var t = q.instTypes[field];
			if (t != null) return isAccessAllowed(q.getOwnInstAccess(field), q.name, accessContext)
				? specialize(t) : null;
			if (q.isObject) {
				t = GmlAPI.stdInstType[field];
				if (t != null) return specialize(t);
			}
			for (qi in q.interfaces.array) {
				t = qi.getInstType(field, n, accessContext);
				if (t != null) return specialize(t);
			}
			if (q.parent != null && q.parentType != null) parentTypes.push(q.parentType);
			q = q.parent;
		}
		return null;
	}
	public function getInstLookup(field:String, depth:Int = 0, accessContext:String = null):GmlLookup {
		var q = this, n = depth;
		while (q != null && ++n <= maxDepth) {
			var l = q.instLookup[field];
			if (l != null) return isAccessAllowed(q.getOwnInstAccess(field), q.name, accessContext) ? l : null;
			for (qi in q.interfaces.array) {
				l = qi.getInstLookup(field, n, accessContext);
				if (l != null) return l;
			}
			q = q.parent;
		}
		return null;
	}
	/**
	 * Returns a "from <namespace>\ntype <type>"
	 * Handy for fields without auto-completion items
	 */
	public function getInstTypeText(field:String, depth:Int = 0, accessContext:String = null):String {
		var q = this, n = depth;
		var parentTypes:Array<GmlType> = [];
		inline function specialize(t:GmlType):GmlType {
			var i = parentTypes.length;
			while (--i >= 0) {
				switch (parentTypes[i]) {
					case TInst(_, params, _):
						t = GmlTypeTools.specializeParentTemplates(t, params, params.length);
					default:
				}
			}
			return t;
		}
		inline function fin(t:GmlType):String {
			return "from " + q.name + "\ntype " + specialize(t).toString();
		}
		while (q != null && ++n <= maxDepth) {
			var t = q.instTypes[field];
			if (t != null) return isAccessAllowed(q.getOwnInstAccess(field), q.name, accessContext) ? fin(t) : null;
			if (q.isObject) {
				t = GmlAPI.stdInstType[field];
				if (t != null) return fin(t);
			}
			for (qi in q.interfaces.array) {
				var s = qi.getInstTypeText(field, n, accessContext);
				if (s != null) return s;
			}
			if (q.parent != null && q.parentType != null) parentTypes.push(q.parentType);
			q = q.parent;
		}
		return null;
	}
	
	/** instance (`var b; b.ptr`) completions */
	public var compInst:ArrayMapSync<AceAutoCompleteItem> = new ArrayMapSync();
	public function getInstCompItem(field:String, depth:Int = 0, accessContext:String = null):AceAutoCompleteItem {
		var q = this, n = depth;
		while (q != null && ++n <= maxDepth) {
			var c = q.compInst[field];
			if (c != null) return isAccessAllowed(q.getOwnInstAccess(field), q.name, accessContext) ? c : null;
			if (q.isObject) {
				c = GmlAPI.stdInstCompMap[field];
				if (c != null) return c;
			}
			for (qi in q.interfaces.array) {
				c = qi.getInstCompItem(field, n, accessContext);
				if (c != null) return c;
			}
			q = q.parent;
		}
		return null;
	}
	
	private var compInstCache:AceAutoCompleteItems = new AceAutoCompleteItems();
	private var compInstCacheID:Int = 0;
	private var compInstCacheParent:String = null;
	private var compInstCacheInterfaces:Array<String> = [];
	public function getInstComp(depth:Int = 0, includeBuiltins:Bool = true, accessContext:String = null):AceAutoCompleteItems {
		if (accessContext != null) return getInstCompUncached(depth, includeBuiltins, accessContext);
		if (++depth > maxDepth) return [];
		// early exit if there are no dependencies
		if (parent == null && !isObject && interfaces.length == 0) {
			compInstCacheID = compInst.changeID;
			return getPublicOwnInstComp();
		}
		
		//
		var forceUpdate = false;
		var maxID = compInst.changeID;
		inline function updateMaxID(nid:Int):Void {
			maxID = cast Math.max(maxID, nid);
		}
		
		var parItems:AceAutoCompleteItems;
		if (parent != null) {
			parItems = parent.getInstComp(depth, false);
			updateMaxID(parent.compInstCacheID);
			if (compInstCacheParent != parent.name) {
				compInstCacheParent = parent.name;
				forceUpdate = true;
			}
		} else {
			parItems = null;
			compInstCacheParent = null;
		}
		
		var itfItems:Array<AceAutoCompleteItems> = interfaces.length > 0 ? [] : null;
		for (i => itf in interfaces) {
			itfItems.push(itf.getInstComp(depth, false));
			updateMaxID(itf.compInstCacheID);
			if (compInstCacheInterfaces[i] != itf.name) {
				compInstCacheInterfaces[i] = itf.name;
				forceUpdate = true;
			}
		}
		if (compInstCacheInterfaces.length != interfaces.length) {
			compInstCacheInterfaces.resize(interfaces.length);
			forceUpdate = true;
		}
		
		// no changes?:
		if (maxID == compInstCacheID && !forceUpdate) return compInstCache;
		
		//Console.log('Updating $name...');
		var ownItems = getPublicOwnInstComp();
		var ownItemsByName = new Dictionary<AceAutoCompleteItem>();
		var inheritedNames = new Dictionary<Bool>();
		if (parItems != null) for (c in parItems) inheritedNames[c.name] = true;
		if (itfItems != null) for (items in itfItems) for (c in items) inheritedNames[c.name] = true;
		for (c in ownItems) ownItemsByName[c.name] = c;
		
		var list:AceAutoCompleteItems = [];
		for (c in ownItems) {
			if (inheritedNames[c.name]) continue;
			list.push(c);
		}
		compInstCacheID = maxID;
		compInstCache = list;
		
		// avoid duplicates:
		var found = new Dictionary();
		for (c in list) found[c.name] = true;
		
		// add interfaces after own items:
		if (itfItems != null) for (items in itfItems) for (c in items) {
			if (found[c.name]) continue;
			found[c.name] = true;
			list.push(ownItemsByName[c.name] ?? c);
		}
		
		// add inherited items after own items:
		if (parItems != null) {
			for (c in parItems) {
				if (found[c.name]) continue;
				found[c.name] = true;
				list.push(ownItemsByName[c.name] ?? c);
			}
		}
		
		// if this is an object, add built-in variables at the end of the list:
		if (isObject && includeBuiltins) for (c in GmlAPI.stdInstComp) list.push(c);
		
		//
		return list;
	}
	private function getPublicOwnInstComp():AceAutoCompleteItems {
		var list:AceAutoCompleteItems = [];
		for (c in compInst.array) {
			if (isAccessAllowed(getOwnInstAccess(c.name), name, null)) list.push(c);
		}
		return list;
	}
	private function getInstCompUncached(depth:Int, includeBuiltins:Bool, accessContext:String):AceAutoCompleteItems {
		if (++depth > maxDepth) return [];
		var found = new Dictionary<Bool>();
		var list:AceAutoCompleteItems = [];
		inline function add(c:AceAutoCompleteItem):Void {
			if (c == null || found[c.name]) return;
			found[c.name] = true;
			list.push(c);
		}
		for (c in compInst.array) {
			if (isAccessAllowed(getOwnInstAccess(c.name), name, accessContext)) add(c);
		}
		for (items in [for (itf in interfaces.array) itf.getInstComp(depth, false, accessContext)]) {
			for (c in items) add(c);
		}
		if (parent != null) {
			var parentItems = parent.getInstComp(depth, false, accessContext);
			for (c in parentItems) add(c);
		}
		if (isObject && includeBuiltins) for (c in GmlAPI.stdInstComp) add(c);
		return list;
	}
	
	public var docInstMap:Dictionary<GmlFuncDoc> = new Dictionary();
	public var privateInst:Dictionary<Bool> = new Dictionary();
	public var instAccess:Dictionary<GmlFieldAccess> = new Dictionary();
	public var instAccessSet:Dictionary<Bool> = new Dictionary();
	public function getInstDoc(field:String, depth:Int = 0, accessContext:String = null):GmlFuncDoc {
		var q = this, n = depth;
		var parentTypes:Array<GmlType> = [];
		inline function specialize(d:GmlFuncDoc):GmlFuncDoc {
			return d.specializeParents(parentTypes);
		}
		while (q != null && ++n <= maxDepth) {
			var d = q.docInstMap[field];
			if (d != null) return isAccessAllowed(q.getOwnInstAccess(field), q.name, accessContext)
				? specialize(d) : null;
			for (qi in q.interfaces.array) {
				d = qi.getInstDoc(field, n, accessContext);
				if (d != null) return specialize(d);
			}
			if (q.parent != null && q.parentType != null) parentTypes.push(q.parentType);
			q = q.parent;
		}
		return null;
	}
	public function isInstPrivate(field:String, depth:Int = 0):Bool {
		var q = this, n = depth;
		while (q != null && ++n <= maxDepth) {
			if (q.privateInst.exists(field)) return q.privateInst[field];
			for (qi in q.interfaces.array) {
				if (qi.isInstPrivate(field, n)) return true;
			}
			q = q.parent;
		}
		return false;
	}
	public function getOwnInstAccess(field:String):GmlFieldAccess {
		var access = instAccess[field];
		if (access != null) return access;
		if (instAccessSet[field]) return Public;
		var inherited = getInheritedInstAccess(field);
		return inherited != null && inherited.access != Public ? inherited.access : Public;
	}
	private function getInheritedInstAccess(field:String):GmlNamespaceAccessInfo {
		for (qi in interfaces.array) {
			var access = qi.getInstAccess(field);
			if (access != null) return access;
		}
		return parent != null ? parent.getInstAccess(field) : null;
	}
	public function getInstAccess(field:String, depth:Int = 0):GmlNamespaceAccessInfo {
		var q = this, n = depth;
		while (q != null && ++n <= maxDepth) {
			if (q.instKind.exists(field) || q.instTypes.exists(field) || q.docInstMap.exists(field) || q.compInst.exists(field)) {
				if (!q.instAccess.exists(field) && !q.instAccessSet[field]) {
					var inherited = q.getInheritedInstAccess(field);
					if (inherited != null && inherited.access != Public) return inherited;
				}
				return { access: q.getOwnInstAccess(field), owner: q.name };
			}
			for (qi in q.interfaces.array) {
				var access = qi.getInstAccess(field, n);
				if (access != null) return access;
			}
			q = q.parent;
		}
		return null;
	}
	function getOwnInstConst(field:String):GmlNamespaceConstInfo {
		if (!instConst[field]) return null;
		var effectiveVirtual = instVirtual[field];
		if (!effectiveVirtual && instOverride[field]) {
			var inherited = getInheritedInstConst(field);
			effectiveVirtual = inherited != null && inherited.isVirtual;
		}
		return {
			owner: name,
			isVirtual: effectiveVirtual,
			isOverride: instOverride[field],
		};
	}
	public function getInheritedInstConst(field:String, depth:Int = 0):GmlNamespaceConstInfo {
		var n = depth + 1;
		if (n > maxDepth) return null;
		for (qi in interfaces.array) {
			var info = qi.getInstConst(field, n);
			if (info != null) return info;
		}
		return parent != null ? parent.getInstConst(field, n) : null;
	}
	public function getInstConst(field:String, depth:Int = 0):GmlNamespaceConstInfo {
		var q = this, n = depth;
		while (q != null && ++n <= maxDepth) {
			var own = q.getOwnInstConst(field);
			if (own != null) return own;
			for (qi in q.interfaces.array) {
				var info = qi.getInstConst(field, n);
				if (info != null) return info;
			}
			q = q.parent;
		}
		return null;
	}
	public function getStaticConst(field:String):GmlNamespaceConstInfo {
		return staticConst[field] ? {
			owner: name,
			isVirtual: staticVirtual[field],
			isOverride: staticOverride[field],
		} : null;
	}
	public static function isAccessAllowed(access:GmlFieldAccess, owner:String, accessContext:String):Bool {
		switch (access) {
			case Private: return accessContext == owner;
			case Protected: return accessContext == owner || isNamespaceChildOf(accessContext, owner);
			default: return true;
		}
	}
	public static function isNamespaceChildOf(child:String, parentName:String):Bool {
		if (child == null || parentName == null) return false;
		var ns = GmlAPI.gmlNamespaces[child], n = 0;
		while (ns != null && ++n <= maxDepth) {
			if (ns.name == parentName) return true;
			ns = ns.parent;
		}
		return false;
	}
	
	public function new(name:String) {
		this.name = name;
	}
	
	public function addFieldHint(field:String, isInst:Bool, comp:AceAutoCompleteItem, doc:GmlFuncDoc, type:GmlType,
		isPrivate:Bool = false, ?lookup:GmlLookup, access:GmlFieldAccess = Public, accessSet:Bool = false,
		isConst:Bool = false, isVirtual:Bool = false, isOverride:Bool = false) {
		var kind = isInst ? instKind : staticKind;
		kind[field] = doc != null ? "asset.script" : "field";
		if (isInst) {
			if (isPrivate && access == Public) access = Private;
			switch (access) {
				case Private:
					privateInst[field] = true;
					instAccess[field] = Private;
				case Protected:
					instAccess[field] = Protected;
				default:
			}
			if (accessSet) instAccessSet[field] = true;
		}
		if (isConst) {
			var constFields = isInst ? instConst : staticConst;
			constFields[field] = true;
		}
		if (isVirtual) {
			var virtualFields = isInst ? instVirtual : staticVirtual;
			virtualFields[field] = true;
		}
		if (isOverride) {
			var overrideFields = isInst ? instOverride : staticOverride;
			overrideFields[field] = true;
		}
		
		var types = isInst ? instTypes : staticTypes;
		if (type != null) {
			types[field] = type;
		} else if (doc != null) {
			types[field] = doc.getFunctionType();
		}
		
		if (doc != null) {
			var docs = isInst ? docInstMap : docStaticMap;
			docs[field] = doc;
		}
		if (lookup != null) {
			var lookups = isInst ? instLookup : staticLookup;
			lookups[field] = lookup;
		}
		
		if (comp != null && field != "") {
			var comps:ArrayMap<AceAutoCompleteItem> = isInst ? compInst : compStatic;
			comps[field] = comp;
		}
	}
	
	public function removeFieldHint(field:String, isInst:Bool) {
		var kind = isInst ? instKind : staticKind;
		kind.remove(field);
		var docs = isInst ? docInstMap : docStaticMap;
		docs.remove(field);
		if (isInst) {
			privateInst.remove(field);
			instAccess.remove(field);
			instAccessSet.remove(field);
			instConst.remove(field);
			instVirtual.remove(field);
			instOverride.remove(field);
		} else {
			staticConst.remove(field);
			staticVirtual.remove(field);
			staticOverride.remove(field);
		}
		var lookups = isInst ? instLookup : staticLookup;
		lookups.remove(field);
		var types = isInst ? instTypes : staticTypes;
		types.remove(field);
		var comps:ArrayMap<AceAutoCompleteItem> = isInst ? compInst : compStatic;
		comps.remove(field);
	}
	
	/**
	 * 
	 * @return whether a special case was applied
	 */
	public function procSpecialInterfaces(name:String, value:Bool) {
		switch (name) {
			case "struct": canCastToStruct = value;
			case "minus1able": minus1able = value;
			case "nullable": isNullable = value;
			case "simplename": avoidHighlight = value;
			// todo: bitflags
			default: return false;
		}
		return true;
	}
}
