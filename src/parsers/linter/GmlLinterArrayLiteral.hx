package parsers.linter;
import gml.GmlAPI;
import gml.type.GmlType;
import gml.type.GmlTypeDef;
import haxe.ds.ReadOnlyArray;
import tools.Aliases.FoundError;
import parsers.linter.GmlLinterKind;
import tools.macros.GmlLinterMacros.*;

/**
 * ...
 * @author YellowAfterlife
 */
@:access(parsers.linter.GmlLinter)
class GmlLinterArrayLiteral {
	public static var outType:GmlType;
	public static function read(self:GmlLinter, oldDepth:Int, targetType:GmlType):FoundError {
		var newDepth = oldDepth + 1;
		
		var tupleTypes:ReadOnlyArray<GmlType> = null;
		var tupleHasRest = false;
		var tupleRestType:GmlType = null;
		var itemType:GmlType = null;
		if (targetType == null) {
			// OK!
		} else {
			targetType = targetType.resolve();
			if (targetType != null) switch (targetType) {
				case TEnumTuple(ename):
					var en = GmlAPI.gmlEnums[ename];
					if (en != null) tupleTypes = en.tupleTypes;
				default:
			}
			if (tupleTypes != null) {
				// OK!
			}
			if (targetType.getKind() == KTuple) {
				tupleTypes = targetType.unwrapParams();
			}
			else if (targetType.canCastTo(GmlTypeDef.anyArray)) {
				itemType = targetType.unwrapParam();
			}
			if (tupleTypes != null) {
				var t:GmlType = tupleTypes[tupleTypes.length - 1].resolve();
				if (t.getKind() == KRest) {
					tupleHasRest = true;
					tupleRestType = t.unwrapParam();
				}
			}
		}
		
		var closed = false;
		var seenComma = true;
		var index = 0;
		var autoType:GmlType = null;
		var q = self.reader;
		self.seqStart.setTo(q);
		while (q.loop) {
			switch (self.peek()) {
				case LKSqbClose:
					self.skip();
					closed = true;
					break;
				case LKComma:
					if (seenComma) {
						return self.readError("Unexpected `,`");
					} else {
						seenComma = true;
						self.skip();
					}
				default:
					if (!seenComma) return self.readExpect("a comma in values list");
					seenComma = false;
					
					rc(self.readExpr(newDepth, None, null, itemType));
					
					if (tupleTypes != null) {
						var tt = tupleTypes[index];
						if (tupleHasRest && index >= tupleTypes.length - 1) tt = tupleRestType;
						self.checkTypeCast(self.expr.currType, tt, "tuple literal", self.expr.currValue);
					} else if (itemType != null) {
						self.checkTypeCast(self.expr.currType, itemType, "array literal", self.expr.currValue);
					} else if (index == 0) {
						autoType = self.expr.currType;
					} else if (autoType != null) {
						if (!self.expr.currType.canCastTo(autoType)) autoType = null;
					}
					
					index += 1;
			}
		}
		
		if (!closed) return self.readSeqStartError("Unclosed [] literal");
		
		if (tupleTypes != null) {
			function isOptionalTupleType(t:GmlType):Bool {
				if (t == null) return true;
				return switch (t.resolve().getKind()) {
					case KNullable, KUndefined: true;
					default: false;
				}
			}
			var fixedTupleLength = tupleHasRest ? tupleTypes.length - 1 : tupleTypes.length;
			var minTupleLength = fixedTupleLength;
			while (minTupleLength > 0 && isOptionalTupleType(tupleTypes[minTupleLength - 1])) {
				minTupleLength -= 1;
			}
			if (tupleHasRest) {
				if (index < minTupleLength) {
					self.readSeqStartWarn('Expected a >=$minTupleLength-value tuple, got a $index-value tuple');
				}
			} else if (index < minTupleLength || index > fixedTupleLength) {
				if (minTupleLength == fixedTupleLength) {
					self.readSeqStartWarn('Expected a $fixedTupleLength-value tuple, got a $index-value tuple');
				} else {
					self.readSeqStartWarn('Expected a $minTupleLength..$fixedTupleLength-value tuple, got a $index-value tuple');
				}
			}
			outType = targetType;
		} else if (itemType != null) {
			outType = targetType;
		} else {
			outType = index > 0 ? GmlTypeDef.arrayOf(autoType) : GmlTypeDef.anyArray;
		}
		return false;
	}
}
