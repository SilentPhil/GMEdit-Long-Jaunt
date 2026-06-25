function PublisherSubscribeDelayedEvent(_event_index/*:number*/, _delay/*:number*/, _vars/*:array*/ = [], _is_no_warp/*:bool*/ = false) constructor {
	__event_index	= _event_index;				/// @is {number}
	__delay 		= _delay;					/// @is {number}
	__vars			= _vars;					/// @is {array}
	__is_no_warp	= _is_no_warp;				/// @is {bool}
	
	static change_delay = function(_value/*:number*/)/*->void*/ {
		__delay += _value;
	}
	
	#region getters
	static get_event_index = function()/*->number*/ {
		return __event_index;
	}
	
	static get_delay = function()/*->number*/ {
		return __delay;
	}
	
	static get_vars = function()/*->array*/ {
		return __vars;
	}
	
	static is_no_warp = function()/*->bool*/ {
		return __is_no_warp;
	}
	#endregion
	
	#region setters
	static set_event_index = function(_val/*:number*/)/*->void*/ {
		__event_index = _val;
	}
	
	static set_delay = function(_val/*:number*/)/*->void*/ {
		__delay = _val;
	}
	
	static set_vars = function(_val/*:array*/)/*->void*/ {
		__vars = _val;
	}
	
	static set_is_no_warp = function(_val/*:bool*/)/*->void*/ {
		__is_no_warp = _val;
	}
	#endregion
}