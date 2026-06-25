/// @desc Класс, позволяющий своим наследникам подписываться на события
function PubSubHandler() constructor {
	__pub_sub_subscribers			= [];			/// @is {number[]} /// @private Индексы событий, на которые подписан класс
	__pub_sub_subscribers_with_target_key = []; 	/// @is {tuple<number, string>[]} /// @private
	__pub_sub_is_disabled			= false;		/// @is {bool} /// @private

	__pub_sub_is_unsubscribed = {}; /// @is {struct<bool>} ключ - индекс события, от которого мы хотим описаться /// @private
	
	__pub_sub_weak_ref = noone; /// @private
	if (__DEBUG_PUB_SUB_WITH_WEAK_REF__) {
		// Паб сабы через слабые ссылки, чтобы отлавливать пропущенные ансабы
		__pub_sub_weak_ref				= weak_ref_create(self);			/// @is {weak_reference<PubSubHandler>}
		__pub_sub_weak_ref.callstack	= debug_get_callstack();
	} else {
		// Паб сабы без слабых ссылок
		__pub_sub_weak_ref = {};
		__pub_sub_weak_ref.ref = self;
		__pub_sub_weak_ref.callstack	= 0;
		if (__DEBUG_PUB_SUB_CALLSTACK_KEEP__) {
			__pub_sub_weak_ref.callstack = debug_get_callstack();
		}
	}
	
	__pub_sub_weak_ref.instance_of	= string(instanceof(self));
	
	/// @desc Вызывается при срабатывании события, на который подписался класс
	/// @arg PS.event
	/// @arg event_vars_array
	static pub_sub_perform = function(_event/*:number*/, _vars/*:any[]*/) {
		// log("PubSubHandler", "method 'pub_sub_perform' must be override");	
	}	
	
	static call_pub_sub_perform = function(_event/*:PublisherSubscribeEvent*/, _event_index/*:number*/, _vars/*:any[]*/) {
		if (__pub_sub_is_disabled) {
			return;
		}
		if (struct_get_from_hash(__pub_sub_is_unsubscribed, _event.get_index_hash())) {
			return;
		}
		
		pub_sub_perform(_event_index, _vars);
	}
	
	static pub_sub_imgui_debug = function(_imgui_id/*:string*/)/*->void*/ {
		if (imguigml_tree_node("subscribers##" + _imgui_id)) {
			for (var i = 0, size_i = array_length(__pub_sub_subscribers); i < size_i; i++) {
				var sub_index = __pub_sub_subscribers[i];
				imguigml_text(PUB_SUB.get_events().get_event(sub_index).get_caption());
			}
			imguigml_tree_pop();
		}
	}
	
	static pub_sub_subscribe = function(_event_index/*:number*/, _not_used_obj = undefined)/*->void*/ {
		if (!variable_struct_exists(self, "__pub_sub_subscribers")) {
			throw("Subscriber must be successor of PubSubHandler()! - " + string(instanceof(self)));
		}
		
		var unsub_list = PUB_SUB.get_unsubscribers_list();
		for (var i = 0, size_i = ds_list_size(unsub_list); i < size_i; i++) {
			var unsub_arr = unsub_list[| i];
			if (unsub_arr[0] == _event_index && unsub_arr[1] == __pub_sub_weak_ref) {
				ds_list_delete(unsub_list, i);
				return;
			}
		}
		
		PUB_SUB.get_events().get_event(_event_index).subscribe(__pub_sub_weak_ref);
		
		array_push(__pub_sub_subscribers, _event_index);
		__pub_sub_is_unsubscribed[$ string(_event_index)] = false;
	}
	
	static pub_sub_subscribe_with_target_key = function(_event_index/*:number*/, _target_key/*:any*/)/*->void*/ {
		if (!variable_struct_exists(self, "__pub_sub_subscribers")) {
			throw("Subscriber must be successor of PubSubHandler()! - " + string(instanceof(self)));
		}
		
		PUB_SUB.get_events().get_event(_event_index).subscribe(__pub_sub_weak_ref, string(_target_key));
		
		array_push(__pub_sub_subscribers_with_target_key, /*#cast*/ [_event_index, string(_target_key)]);
		__pub_sub_is_unsubscribed[$ string(_event_index)] = false;
	}
	
	static pub_sub_unsubscribe = function(_event_index/*:number*/, _not_used_obj = undefined, _target_key/*:string*/ = "")/*->void*/ {
		PUB_SUB.unsubscribe(_event_index, __pub_sub_weak_ref, _target_key);
		__pub_sub_is_unsubscribed[$ string(_event_index)] = true;
	}
	
	static pub_sub_unsubscribe_all = function(_not_used_obj = undefined)/*->void*/ {
		for (var i = 0, size_i = array_length(__pub_sub_subscribers); i < size_i; i++) {
			var event_index = __pub_sub_subscribers[i];
			PUB_SUB.unsubscribe(event_index, __pub_sub_weak_ref);
			__pub_sub_is_unsubscribed[$ string(event_index)] = true;
		}
		
		for (var i = 0, size_i = array_length(__pub_sub_subscribers_with_target_key); i < size_i; i++) {
			var subsribe_with_key = __pub_sub_subscribers_with_target_key[i];
			PUB_SUB.unsubscribe(subsribe_with_key[0], __pub_sub_weak_ref, subsribe_with_key[1]);
			__pub_sub_is_unsubscribed[$ string(subsribe_with_key[0])] = true;
		}
	}
	
	static pub_sub_disable = function()/*->void*/ {
		__pub_sub_is_disabled = true;
	}
	
	static pub_sub_enable = function()/*->void*/ {
		__pub_sub_is_disabled = false;
	}
}
