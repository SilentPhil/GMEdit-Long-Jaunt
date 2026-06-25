function PublishersSubscribersManager() constructor {
	__delayed_events_list	= ds_list_create(); 		/// @is {ds_list<PublisherSubscribeDelayedEvent>}
	__unsubscribers_list	= ds_list_create();			/// @is {ds_list<tuple<number, weak_reference<PubSubHandler>, string>>} Где number - индекс события, weak_reference - слабая ссылка на PubSubHandler
	
	__events		= new PublisherSubscribeEvents();							/// @is {PublisherSubscribeEvents}
	__num_of_events = array_length(__events.get_array_of_pub_sub_events());		/// @is {number}
	
	__debug_refresh_gui_profiling_data = []; /// @is {DebugPubSubGUIProfilingData[]}
	/// @hint {string[]}DebugPubSubGUIProfilingData:invoke_callstack
	/// @hint {number}	DebugPubSubGUIProfilingData:duration
	/// @hint {any}		DebugPubSubGUIProfilingData:first_variable
	/// @hint {number}	DebugPubSubGUIProfilingData:number_of_subscribers
	
	/// @hint {array}	DebugPubSubProfilingData:event_name
	/// @hint {string[]}DebugPubSubProfilingData:invoke_callstack
	/// @hint {number}	DebugPubSubProfilingData:duration
	/// @hint {number}	DebugPubSubProfilingData:number_of_subscribers
	
	/// @hint {string}		DebugPubSubProfilingPerSubscribersData:event_name
	/// @hint {string[]}	DebugPubSubProfilingPerSubscribersData:callstack
	/// @hint {string[]}	DebugPubSubProfilingPerSubscribersData:invoke_callstack
	/// @hint {number}		DebugPubSubProfilingPerSubscribersData:duration
	
	__debug_profiling = []; 				 /// @is {DebugPubSubProfilingData[]}
	__debug_profiling_per_subscribers = [];  /// @is {DebugPubSubProfilingPerSubscribersData[]}

	__test_weak_ref = noone; /// @is {PubSubHandler}
	
	__debug_profiling_is_sorted = false;
	__debug_profiling_per_subscribers_is_sorted = false;

	__debug_event_for_subscibers = noone; /// @is {PublisherSubscribeEvent}

	static imgui_debug = function()/*->void*/ {
		if (__DEBUG_PUB_SUB_WITH_WEAK_REF__) {
			if (__test_weak_ref == noone && imguigml_button("Create Weak Ref")) {
				__test_weak_ref = new PubSubHandler();
				__test_weak_ref.pub_sub_subscribe(PS.event_test_event);
				__test_weak_ref.pub_sub_perform = method(self, function(_event, _vars) {
					switch (_event) {		
						case PS.event_test_event:
							log("receive test event");
						break;
					}
				});
			}
			if (__test_weak_ref != noone && imguigml_button("Remove Weak Ref")) {
				__test_weak_ref = noone;
			}
			
			var array_of_destroyed_listeners = get_array_of_destroyed_listeners();
			for (var i = 0, size_i = array_length(array_of_destroyed_listeners); i < size_i; i++) {
				var listener_struct = array_of_destroyed_listeners[i];
				imguigml_text(listener_struct.event_caption + " >- " + " :: " + string(listener_struct.uuid));
				if (imguigml_button("copy callstack##" + string(i))) {
					clipboard_set_text(listener_struct.callstack);
				}
			}
			
			imguigml_separator();
		}
		
		if (__DEBUG_PUB_SUB_REFRESH_GUI_PROFILING__) {
			imguigml_text("Number of gui profiling data: " + string(array_length(__debug_refresh_gui_profiling_data)));
			if (imguigml_button("Clear")) {
				__debug_refresh_gui_profiling_data = [];
			}
			if (imguigml_button("Print Very High Cost")) {
				
				var very_high_cost = array_filter(__debug_refresh_gui_profiling_data, function(_data/*:DebugPubSubGUIProfilingData*/, _index/*:number*/) /*=>*/ {return _data.duration >= 1000});
				array_sort(very_high_cost, function(_data_1/*:DebugPubSubGUIProfilingData*/, _data_2/*:DebugPubSubGUIProfilingData*/) /*=>*/ {return _data_1.duration > _data_2.duration ? -1 : 1});
				
				print("-----------------------VERY HIGH COST-------------------------");
				print("COUNT: " + string(array_length(very_high_cost)));
				array_foreach(very_high_cost, function(_data/*:DebugPubSubGUIProfilingData*/, _index/*:number*/) /*=>*/ {
					print(_data.first_variable);
					print("DURATION: " + string(_data.duration));
					print(array_slice(_data.invoke_callstack, 2));
					print("number_of_subscribers: " + string(_data.number_of_subscribers));
				});
				print("--------------------------------------------------------------");
			}
			if (imguigml_button("Print High Cost")) {
				var high_cost = array_filter(__debug_refresh_gui_profiling_data, function(_data/*:DebugPubSubGUIProfilingData*/, _index/*:number*/) /*=>*/ {return _data.duration < 1000});
				array_sort(high_cost, function(_data_1/*:DebugPubSubGUIProfilingData*/, _data_2/*:DebugPubSubGUIProfilingData*/) /*=>*/ {return _data_1.duration > _data_2.duration ? -1 : 1});
				print("--------------------------HIGH COST---------------------------");
				print("COUNT: " + string(array_length(high_cost)));
				array_foreach(high_cost, function(_data/*:DebugPubSubGUIProfilingData*/, _index/*:number*/) /*=>*/ {
					print(_data.first_variable);
					print("DURATION: " + string(_data.duration));
					print(array_slice(_data.invoke_callstack, 2));
					print("number_of_subscribers: " + string(_data.number_of_subscribers));
				});
				print("--------------------------------------------------------------");
			}
		}
		
		if (__DEBUG_PUB_SUB_PROFILING_PER_SUBSCIBERS__) {
			imguigml_text("Number of profiling data per subscribers: " + string(array_length(__debug_profiling_per_subscribers)));
			if (imguigml_button("Clear##persub")) {
				__debug_profiling_per_subscribers = [];
			}
			__debug_profiling_per_subscribers_is_sorted = imguigml_checkbox("Is Sorted##per_sub", __debug_profiling_per_subscribers_is_sorted)[1];
			if (imguigml_button("Print##persub")) {
				var arr_per_subscriber = array_clone(__debug_profiling_per_subscribers);
				
				if (__debug_profiling_per_subscribers_is_sorted) {
					array_sort(arr_per_subscriber, function(_data_per_sub_1/*:DebugPubSubProfilingPerSubscribersData*/, _data_per_sub_2/*:DebugPubSubProfilingPerSubscribersData*/) /*=>*/ {return _data_per_sub_1.duration > _data_per_sub_2.duration ? -1 : 1});
				}
				
				print("---------------------------PER SUB----------------------------");
				print("COUNT: " + string(array_length(arr_per_subscriber)));
				array_foreach(arr_per_subscriber, function(_data_per_sub/*:DebugPubSubProfilingPerSubscribersData*/, _index/*:number*/) /*=>*/ {
					print(_data_per_sub.event_name);
					print(array_slice(_data_per_sub.callstack, 1));
					print(array_slice(_data_per_sub.invoke_callstack, 1));
					print("DURATION: " + string(_data_per_sub.duration), "\n");
				});
				print("--------------------------------------------------------------");
			}
		}
		
		
		if (__DEBUG_PUB_SUB_PROFILING__) {
			imguigml_text("Number profiling data: " + string(array_length(__debug_profiling)));
			if (imguigml_button("Clear##profiling")) {
				__debug_profiling = [];
			}
			__debug_profiling_is_sorted = imguigml_checkbox("Is Sorted##profiling", __debug_profiling_is_sorted)[1];
			if (imguigml_button("Print##profiling")) {
				var arr_profiling = array_clone(__debug_profiling);
				
				if (__debug_profiling_is_sorted) {
					array_sort(arr_profiling, function(_data_profiling_1/*:DebugPubSubProfilingData*/, _data_profiling_2/*:DebugPubSubProfilingData*/) /*=>*/ {return _data_profiling_1.duration > _data_profiling_2.duration ? -1 : 1});
				}
				
				print("---------------------------PROFILING DATA----------------------------");
				print("COUNT: " + string(array_length(arr_profiling)));
				array_foreach(arr_profiling, function(_data_profiling/*:DebugPubSubProfilingData*/, _index/*:number*/) /*=>*/ {
					print(_data_profiling.event_name);
					print(array_slice(_data_profiling.invoke_callstack, 1));
					print("SUBS: " + string(_data_profiling.number_of_subscribers));
					print("DURATION: " + string(_data_profiling.duration), "\n");
				});
				print("--------------------------------------------------------------");
			}
		}
		
		
		var ret = imguigml_input_text("Event Name", "", 64);
		if (ret[0]) {
			var event = PS.get_event_by_name(ret[1]);
			if (event != undefined) {
				__debug_event_for_subscibers = event;
			} else {
				log("undefined event", ret[1]);
			}
		}
		if (__debug_event_for_subscibers != noone) {
			if (imguigml_button("Print Event Subscibers - " + string(__debug_event_for_subscibers.get_caption()))) {
				
				print("---------------------------PER SUB----------------------------");
				print("COUNT: " + string(array_length(__debug_event_for_subscibers.get_array_of_subscribers())));
				
				array_foreach(__debug_event_for_subscibers.get_array_of_subscribers(), function(_subscriber_weak_ref/*:weak_reference*/, _index/*:number*/) /*=>*/ {
					var handler/*:PubSubHandler*/ = _subscriber_weak_ref.ref;
					print(string(_index) + ":" + string(_subscriber_weak_ref[$ "instance_of"]) + " : " + string(_subscriber_weak_ref[$ "callstack"]));
				});
				print("--------------------------------------------------------------");
				

			}
		}
		
	}	
	
	static perform_event = function(_event_index/*:number*/, _vars/*:any[]*/ = [], _target_key/*:any*/ = "")/*->void*/ {
		
		#region дебажное логирование
		if (__DEBUG_PUB_SUB_PROFILING__) {
			var caption = PUB_SUB.get_events().get_array_of_pub_sub_events()[_event_index].get_caption();
		}
	
		
		if (__DEBUG_PUB_SUB_REFRESH_GUI_PROFILING__ && _event_index == PS.event_gui_refresh_data) {
			var profiling_gui_data/*:DebugPubSubGUIProfilingData*/ = {
				invoke_callstack	: debug_get_callstack(),
				duration			: noone,
				first_variable		: array_first(_vars) ?? "NO_VAR",
				number_of_subscribers : noone,
			}
		}
		
		if (__DEBUG_PUB_SUB_PROFILING__) {
			var profiling_data/*:DebugPubSubProfilingData*/ = {
				event_name				: caption,
				invoke_callstack		: debug_get_callstack(),
				duration				: noone,
				number_of_subscribers	: noone,
			}
		}
		
		#endregion
		
		var timer = get_timer();
	
		var event		= __events.get_event(_event_index);
		var sub_list	= event.get_array_of_subscribers(_target_key);
		
		for (var i = 0, size = array_length(sub_list); i < size; i++) {
			
			if (__DEBUG_PUB_SUB_PROFILING_PER_SUBSCIBERS__) {
				var timer_per_subscirbers = get_timer();
			}
			
			try {
				var subscriber_weak_ref = sub_list[i];
				var handler/*:PubSubHandler*/ = subscriber_weak_ref.ref;
				
				if (handler.__pub_sub_is_disabled) {
					continue;
				}
				
				handler.call_pub_sub_perform(event, _event_index, _vars);
			} catch (e) {
				if (is_string(e)) {
					log_warning("[PUB_SUB][ERROR] _event_index: ", _event_index, " event_name: ", PS.get_event(_event_index).get_caption(), " e: ");
				} else {
					e[$ "pub_sub_event_name"] = PS.get_event(_event_index).get_caption();
					log("Crash in PUB SUB event", PS.get_event(_event_index).get_caption());
					log_error(e);
				}
				
				if (!weak_ref_alive(subscriber_weak_ref) && subscriber_weak_ref.callstack != 0) {
					print("weak ref is dead", event.get_caption(), _event_index, subscriber_weak_ref);
					
					var debug_data = {
						instance_of		: string(subscriber_weak_ref[$ "instance_of"]),
						event_caption	: event.get_caption(),
						uuid			: subscriber_weak_ref[$ "uuid"] == undefined ? "-" : /*#cast*/ subscriber_weak_ref[$ "uuid"],
						callstack		: subscriber_weak_ref[$ "callstack"] == undefined ? "-" : /*#cast*/ string(subscriber_weak_ref[$ "callstack"])
					}
					print("dead weak ref", debug_data);

					unsubscribe(_event_index, subscriber_weak_ref);
				}
			}
			
			if (__DEBUG_PUB_SUB_PROFILING_PER_SUBSCIBERS__) {
				var result = get_timer() - timer_per_subscirbers;
				if (result > 150) {
					array_push(__debug_profiling_per_subscribers, {
						event_name : event.get_caption(),
						invoke_callstack : debug_get_callstack(),
						callstack : subscriber_weak_ref.callstack,
						duration : result
					});
				}
			}
		}
		
		#region дебажное логирование
		if (instance_exists(o_debug_timer)) {
			var result_time = get_timer() - timer;
			
			o_debug_timer.debug_pub_sub_perform_timer += result_time;
		
		
			if (__DEBUG_PUB_SUB_PROFILING__) {
				if (variable_struct_exists(o_debug_timer.debug_pub_sub_perform_timer_per_name, caption)) {
					o_debug_timer.debug_pub_sub_perform_timer_per_name[$ caption] += result_time;
				} else {
					o_debug_timer.debug_pub_sub_perform_timer_per_name[$ caption] = result_time;
				}			
				
				
				if (__DEBUG_PUB_SUB_PROFILING__ && result_time > 100) {
					profiling_data.duration = result_time;
					profiling_data.number_of_subscribers = array_length(sub_list);
					array_push(__debug_profiling, profiling_data);
				}
			}
			
			if (__DEBUG_PUB_SUB_REFRESH_GUI_PROFILING__ && _event_index == PS.event_gui_refresh_data) {
				if (result_time > 100) {
					profiling_gui_data.duration = result_time;
					profiling_gui_data.number_of_subscribers = array_length(sub_list);
					array_push(__debug_refresh_gui_profiling_data, profiling_gui_data);
				}
			}
		}	
		#endregion
	}
	
	static perform_event_with_delay = function(_event_index/*:number*/, _delay/*:number*/, _vars/*:array*/ = [], _is_no_warp/*:bool*/ = false)/*->void*/ {
		var ___delayed_event = new PublisherSubscribeDelayedEvent(_event_index, _delay, _vars, _is_no_warp);
	
		ds_list_add(__delayed_events_list, ___delayed_event);
	}
	
	static unsubscribe = function(_event_index/*:number*/, _weak_ref/*:weak_reference<PubSubHandler>*/, _target_key/*:any*/ = "")/*->void*/ {
		ds_list_add(__unsubscribers_list, /*#cast*/ [_event_index, _weak_ref, _target_key]);
	}

	static ingame_state_unload = function()/*->void*/ {
		ds_list_clear(__delayed_events_list);
		ds_list_clear(__unsubscribers_list);
		
		__events.ingame_state_unload();
	}
	
	static step = function()/*->void*/ {
		var i = 0;
		while (i < ds_list_size(__unsubscribers_list)) {
			var unsubscribers	= __unsubscribers_list[| i];
			var event_get		= PUB_SUB.get_events().get_event(unsubscribers[0]);

			event_get.unsubscribe(unsubscribers[1], unsubscribers[2]);
			
			ds_list_delete(__unsubscribers_list, i);
		}
		
		var list = __delayed_events_list;
		for (var i = ds_list_size(list) - 1; i >= 0; i--) {
			var delayed_event = list[| i];
			var tick = delayed_event.is_no_warp() ? 1 : WARP;
			
			delayed_event.change_delay(-tick);
			if (delayed_event.get_delay() <= 0) {
				pub_sub_event_perform(delayed_event.get_event_index(), delayed_event.get_vars());
				ds_list_delete(list, i);
			}
		}
	}
	
	#region getters
	static get_events = function()/*->PublisherSubscribeEvents*/ {
		return __events;
	}

	static get_delayed_events_list = function()/*->ds_list<PublisherSubscribeDelayedEvent>*/ {
		return __delayed_events_list;
	}
	
	static get_unsubscribers_list = function()/*->ds_list<tuple<number, weak_reference<PubSubHandler>, string>>*/ {
		return __unsubscribers_list;
	}
	
	static get_number_of_events = function()/*->number*/ {
		return __num_of_events;
	}
	
	static get_array_of_destroyed_listeners = function()/*->DestroyedListener[]*/ {
		/// @hint {string}			DestroyedListener:instance_of
		/// @hint {string}			DestroyedListener:event_caption
		/// @hint {string}			DestroyedListener:uuid
		/// @hint {string}			DestroyedListener:callstack
		
		var arr/*:DestroyedListener[]*/ = [];
		for (var i = 0; i < __num_of_events; i++) {
			var event = __events.get_event(i);
			var dead_subscribers = event.get_array_of_dead_subscribers();
			for (var j = 0, size_j = array_length(dead_subscribers); j < size_j; j++) {
				var subscriber_weak_ref = dead_subscribers[j];
				
				array_push(arr, {
					instance_of		: string(subscriber_weak_ref[$ "instance_of"]),
					event_caption	: event.get_caption(),
					uuid			: subscriber_weak_ref[$ "uuid"] == undefined ? "-" : /*#cast*/ subscriber_weak_ref[$ "uuid"],
					callstack		: subscriber_weak_ref[$ "callstack"] == undefined ? "-" : /*#cast*/ string(subscriber_weak_ref[$ "callstack"])
				});
			}
		}
		
		return arr;
	}
	#endregion
}