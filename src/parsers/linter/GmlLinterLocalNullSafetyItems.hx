package parsers.linter;
import gml.GmlImports;
import gml.type.GmlType;
import gml.type.GmlTypeDef;
using tools.NativeArray;

/**
 * Casting T? to T is allowed inside conditions that check for value being != undefined.
 * The current implementation is very simple and only works for local variables.
 * @author YellowAfterlife
 */
@:access(parsers.linter.GmlLinter)
@:forward
abstract GmlLinterLocalNullSafetyItems(Array<GmlLinterLocalNullSafetyItem>)
from Array<GmlLinterLocalNullSafetyItem>
{
	public function mergeItems(items:GmlLinterLocalNullSafetyItems) {
		for (nsi2 in items) {
			var nsi = inline this.findFirst((nsi) -> nsi.name == nsi2.name);
			if (nsi != null) {
				if (nsi.status != null && (
					nsi.status != nsi2.status
					|| nsi.narrowType != nsi2.narrowType
				)) nsi.status = null;
			} else this.push(nsi2);
		}
	}
	static function refineType(type:GmlType, target:GmlType, keepMatches:Bool):GmlType {
		return switch (type.resolve()) {
			case TEither(types):
				var kept = [];
				for (item in types) {
					if (item.canCastTo(target) == keepMatches) kept.push(item);
				}
				switch (kept.length) {
					case 0: null;
					case 1: kept[0];
					default: TEither(kept);
				}
			default:
				type.canCastTo(target) == keepMatches ? type : null;
		}
	}
	public function prepatch(linter:GmlLinter):Void {
		var imp:GmlImports = linter.getImports();
		if (imp == null) return;
		for (item in this) {
			if (item.status == null) continue;
			var t = imp.localTypes[item.name];
			if (t == null) continue;
			if (item.narrowType != null) {
				var matched = refineType(t, item.narrowType, true);
				var unmatched = refineType(t, item.narrowType, false);
				var active = item.status ? matched : unmatched;
				if (active != null) {
					item.hasType = true;
					item.type = t;
					item.alternateType = item.status ? unmatched : matched;
					linter.pushNullSafetyLocalType(item.name, t);
					imp.localTypes[item.name] = active;
				}
			} else if (t.getKind() == KNullable) {
				item.hasType = true;
				item.type = t;
				linter.pushNullSafetyLocalType(item.name, t);
				imp.localTypes[item.name] = item.status ? t.unwrapParam() : GmlTypeDef.undefined;
			}
		}
	}
	public function elsepatch(linter:GmlLinter):Void {
		var imp:GmlImports = linter.getImports();
		if (imp == null) return;
		for (item in this) if (item.hasType) {
			if (item.narrowType != null) {
				imp.localTypes[item.name] = item.alternateType != null
					? item.alternateType
					: item.type;
			} else if (item.status) {
				imp.localTypes[item.name] = GmlTypeDef.undefined;
			} else {
				imp.localTypes[item.name] = item.type.unwrapParam();
			}
		}
	}
	public function postpatch(linter:GmlLinter):Void {
		var imp:GmlImports = linter.getImports();
		if (imp == null) return;
		for (item in this) if (item.hasType) {
			imp.localTypes[item.name] = item.type;
			linter.popNullSafetyLocalType(item.name);
			item.hasType = false;
			item.type = null;
			item.alternateType = null;
		}
	}
}
class GmlLinterLocalNullSafetyItem {
	public var name:String;
	/** true -> not null, false -> is null */
	public var status:Bool;
	public var hasType:Bool;
	/** Used to store original type when swapping back and forth */
	public var type:GmlType;
	/** Type asserted by a predicate such as `is_string`. */
	public var narrowType:GmlType;
	/** Type used for the opposite branch of a predicate. */
	public var alternateType:GmlType;
	public function new(name:String, status:Bool, ?narrowType:GmlType) {
		this.name = name;
		this.status = status;
		this.hasType = false;
		this.type = null;
		this.narrowType = narrowType;
		this.alternateType = null;
	}
}
