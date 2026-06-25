package gml;

import gml.type.GmlType;
import gml.type.GmlTypeDef;

class GmlPubSubEvent {
	public var name:String;
	public var args:Array<String>;
	public var argTypes:Array<GmlType>;
	
	public function new(name:String, args:Array<String>, argTypes:Array<GmlType>) {
		this.name = name;
		this.args = args;
		this.argTypes = argTypes;
	}
	
	public function getTupleType():GmlType {
		return GmlType.TInst("tuple", argTypes, KTuple);
	}
}
