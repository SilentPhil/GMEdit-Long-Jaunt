#macro PS global.__pub_sub_controller.__events

function PublisherSubscribeEvents() constructor {
	__array_of_pub_sub_events = [];									/// @is {PublisherSubscribeEvent[]}
	__events_by_name = {}; /// @is {struct<PublisherSubscribeEvent>}
	
	#region MAINMENU
	event_mainmenu_player_province_is_set				= new_event("mainmenu_player_province_is_set");
	event_mainmenu_new_game_configurator_step_forward	= new_event("mainmenu_new_game_configurator_step_forward");
	event_mainmenu_new_game_configurator_step_backward	= new_event("mainmenu_new_game_configurator_step_backward");
	#endregion
	
	#region SHARED (Сложные подписки, которые работают и в INGAME и в MAINMENU. Им нужно заного переподписываться при переходе между MAINMENU <--> INGAME)
	
	#endregion
	
	#region INGAME
	event_economic_resource_distribution			= new_event("economic_resource_distribution");
	
	event_TARGET_change_activity					= new_event("TARGET_change_activity");
	event_TARGET_change_activity_state				= new_event("TARGET_change_activity_state");
	event_change_activity_state						= new_event("change_activity_state");
	event_TARGET_attached_trait_pre					= new_event("TARGET_attached_trait_pre");
	event_TARGET_attached_trait						= new_event("TARGET_attached_trait");
	event_TARGET_attached_trait_by_trait			= new_event("TARGET_attached_trait_by_trait");
	event_TARGET_detached_trait_by_trait			= new_event("TARGET_detached_trait_by_trait");
	event_TARGET_detached_trait_pre					= new_event("TARGET_detached_trait_pre");
	event_TARGET_detached_trait						= new_event("TARGET_detached_trait");
	event_TARGET_attached_opinion_mind				= new_event("TARGET_attached_opinion_mind");
	event_TARGET_detached_opinion_mind				= new_event("TARGET_attached_opinion_mind");
	event_TARGET_attached_mind						= new_event("TARGET_attached_mind");
	event_TARGET_detached_mind						= new_event("TARGET_detached_mind");
	event_TARGET_global_map_object_del_soul			= new_event("TARGET_global_map_object_del_soul");
	event_TARGET_soul_change_loyalty				= new_event("TARGET_soul_change_loyalty");
	event_TARGET_soul_become_king					= new_event("TARGET_soul_become_king");
	event_TARGET_soul_become_slave					= new_event("TARGET_soul_become_slave");
	
	event_TARGET_visited_public_place				= new_event("TARGET_visited_public_place");
	
	event_TARGET_inventory_clean					= new_event("TARGET_inventory_clean");
	event_TARGET_inventory_money_change				= new_event("TARGET_inventory_money_change");
	event_inventory_money_change					= new_event("event_inventory_money_change");
	event_TARGET_inventory_runes_change				= new_event("TARGET_inventory_runes_change");
	event_inventory_runes_change					= new_event("event_inventory_runes_change");
	event_TARGET_inventory_resource_change			= new_event("TARGET_inventory_resource_change");
	event_TARGET_inventory_refresh					= new_event("TARGET_inventory_refresh");
	
	event_TARGET_gui_quest_menu_opened				= new_event("TARGET_gui_quest_menu_opened");
	
	
	event_TARGET_actor_punishment_on_gallows		= new_event("TARGET_actor_punishment_on_gallows");
	event_TARGET_actor_finish_lesson				= new_event("TARGET_actor_finish_lesson");
	event_TARGET_attached_pain						= new_event("TARGET_attached_pain");
	event_TARGET_change_dir 						= new_event("TARGET_change_dir");
	event_TARGET_take_equipment 					= new_event("TARGET_take_equipment");
	event_TARGET_actor_start_battle					= new_event("TARGET_actor_start_battle");
	event_TARGET_actor_finish_battle				= new_event("TARGET_actor_finish_battle");
	event_TARGET_actor_animation_switch				= new_event("TARGET_actor_animation_switch");
	event_TARGET_actor_drink_finish					= new_event("TARGET_actor_drink_finish");
	event_TARGET_actor_activity_destroy				= new_event("TARGET_actor_activity_destroy");
	event_TARGET_actor_start_talk_animation			= new_event("TARGET_actor_start_talk_animation");
	event_TARGET_actor_stop_talk_animation			= new_event("TARGET_actor_stop_talk_animation");
	event_TARGET_actor_talk_animation_close_mouth	= new_event("TARGET_actor_talk_animation_close_mouth");
	event_TARGET_building_actor_out					= new_event("TARGET_building_actor_out");
	event_TARGET_building_actor_enter	 			= new_event("TARGET_building_actor_enter");
	event_TARGET_actor_entered_in_building 			= new_event("TARGET_actor_entered_in_building");
	event_TARGET_soul_refresh_body_asset			= new_event("TARGET_soul_refresh_body_asset");
	event_TARGET_soul_refresh_extra_body_asset 		= new_event("TARGET_soul_refresh_extra_body_asset");
	event_TARGET_soul_refresh_extra_head_asset 		= new_event("TARGET_soul_refresh_extra_head_asset");
	event_TARGET_character_change_happines			= new_event("TARGET_soul_change_happines");
	event_TARGET_soul_got_house						= new_event("TARGET_soul_got_house");
	event_TARGET_soul_lost_house					= new_event("TARGET_soul_lost_house");
	event_TARGET_soul_aging_become_adult			= new_event("TARGET_soul_aging_become_adult");
	event_TARGET_soul_aging_become_old				= new_event("TARGET_soul_aging_become_old");
	event_TARGET_character_change_activity			= new_event("TARGET_character_change_activity");
	event_TARGET_character_change_name				= new_event("TARGET_character_change_name");
	event_TARGET_actor_action_set					= new_event("TARGET_actor_inspector_set");
	event_TARGET_actor_action_reset					= new_event("TARGET_actor_inspector_reset");
	event_TARGET_character_captive_set				= new_event("TARGET_character_captive_reset");
	event_TARGET_character_captive_reset			= new_event("TARGET_character_captive_reset");
	event_TARGET_character_new_age					= new_event("TARGET_character_new_age");
	event_TARGET_actor_in_burning_building			= new_event("TARGET_actor_in_burning_building");
	event_TARGET_actor_watch_tower_set				= new_event("TARGET_actor_watch_tower_set");
	event_TARGET_actor_watch_tower_reset			= new_event("TARGET_actor_watch_tower_reset");
	event_TARGET_actor_battle_fail					= new_event("TARGET_actor_battle_fail");
	event_TARGET_actor_game_of_dice_loose			= new_event("TARGET_actor_game_of_dice_loose");
	
	event_player_settlement_population_change 		= new_event("player_settlement_population_change");
	
	event_warehouse_overflowed_categories 			= new_event("warehouse_overflow"); // Передается массив с перечнем переполненных категорий
	event_warehouse_update_overflowed_status 		= new_event("warehouse_update_overflowed_status");
	event_faction_player_made_agression_action		= new_event("faction_player_made_agression_action");
	event_faction_trader_was_eliminated				= new_event("faction_trader_was_eliminated");
	event_faction_king_dead_before							= new_event("faction_king_dead");
	
	event_watch_tower_change_option 				= new_event("watch_tower_change_option");
	event_watch_tower_set_target					= new_event("watch_tower_set_target");
	event_watch_tower_change_assign_number_of_watchmans = new_event("watch_tower_change_assign_number_of_watchmans");
	event_watch_tower_change_assign_number_of_equipment = new_event("watch_tower_change_assign_number_of_equipment");
	event_watch_tower_manager_tokens_updated			= new_event("watch_tower_manager_tokens_updated");
	event_watch_tower_change_watchmans_on_tower			= new_event("watch_tower_change_watchmans_on_tower");
	
	event_vertex_ground_height_changed				= new_event("vertex_ground_height_changed");
	event_universal_appoint_selected				= new_event("universal_appoint_selected");

	event_TARGET_character_win_in_battle				= new_event("TARGET_character_win_in_battle");
	event_TARGET_menu_opened						= new_event("TARGET_menu_opened");
	event_TARGET_menu_closed						= new_event("TARGET_menu_closed");
	
	event_TARGET_soul_add_to_global_map_object		= new_event("TARGET_soul_add_to_global_map_object");
	event_TARGET_home_building_waytime_updated			= new_event("TARGET_building_waytime_updated");
	event_TARGET_building_worker_hired				= new_event("TARGET_building_worker_hired");
	event_TARGET_building_worker_fired				= new_event("TARGET_building_worker_fired");
	event_TARGET_building_required_workers_count_changed = new_event("TARGET_building_required_workers_count_changed");
	event_TARGET_building_production_not_enough_resources_status_changed = new_event("TARGET_building_production_not_enough_resources_status_changed");
	event_TARGET_building_builders_process_change_status = new_event("TARGET_building_builders_process_change_status");
	event_TARGET_building_builders_priority = new_event("TARGET_building_builders_priority");
	event_TARGET_building_construction_progress = new_event("TARGET_building_construction_progress");
	event_TARGET_building_enable_switch 			= new_event("TARGET_building_enable_switch");
	event_TARGET_building_change_stability_points 	= new_event("TARGET_building_change_stability_points");
	
	event_TARGET_soul_faction_changed				= new_event("TARGET_actor_faction_changed");
	event_TARGET_actor_create						= new_event("TARGET_actor_create");
	event_TARGET_actor_refresh_equipment			= new_event("TARGET_actor_refresh_equipment");
	event_TARGET_actor_take_hit						= new_event("TARGET_actor_take_hit");
	
	event_global_map_wall_status_changed			= new_event("global_map_wall_status_changed");
	event_global_map_towers_status_changed			= new_event("global_map_towers_status_changed");
	event_global_map_town_set_area					= new_event("global_map_town_set_area");
	event_global_map_quest_player_was_sent_help		= new_event("global_map_quest_player_was_sent_help");
	event_global_map_display_mode_changed			= new_event("global_map_display_mode_changed");
	
	event_horde_defeated_by_player					= new_event("horde_defeated_by_player");
	event_game_finish								= new_event("game_finish");
	
	event_innocent_has_been_decapitated				= new_event("innocent_has_been_punishe");
	event_bishop_killed_by_player					= new_event("bishop_killed_by_player");
	
	event_global_map_gift_for_king					= new_event("global_map_gift_for_king");
	
	event_font_declared								= new_event("font_declared");
	event_sound_global_map_open_status_changed		= new_event("sound_global_map_open_status_changed");
	event_sound_time_speed_changed					= new_event("sound_time_speed_changed");
	event_sound_time_pause_changed					= new_event("sound_time_pause_changed");
	event_sound_music_changed						= new_event("sound_music_changed");
	
	event_disable_holy_defense						= new_event("disable_holy_defense");
	event_TARGET_dog_set_owner						= new_event("TARGET_dog_set_owner");
	event_TARGET_dog_reset_owner					= new_event("TARGET_dog_reset_owner");
	
	event_building_sound_handler_initialized		= new_event("building_sound_handler_initialized");
	event_building_add_resident						= new_event("building_add_resident");
	event_building_remove_resident					= new_event("building_remove_resident");
	event_character_become_dummy					= new_event("character_become_dummy");
	
	event_trade_resource_sell 						= new_event("trade_resource_sell");
	event_trade_resource_buy 						= new_event("trade_resource_buy");
	
	event_auto_tiler_16_change_tile 				= new_event("auto_tiler_16_change_tile");
	
	event_music_stop								= new_event("music_stop");
	event_music_play								= new_event("music_play");
	
	event_faction_made_aggression			= new_event("faction_made_aggression");
	event_faction_remove_tribute			= new_event("faction_remove_tribute");
	event_faction_duty_of_honor_appear		= new_event("faction_duty_of_honor_appear");
	event_faction_duty_of_honor_reset		= new_event("faction_duty_of_honor_disappear");
	event_faction_force_neutrality			= new_event("faction_force_neutrality");
	event_soul_married						= new_event("soul_married");
	event_soul_lost_title					= new_event("soul_take_title");
	event_soul_lost_title_before			= new_event("soul_lost_title_before");
	event_soul_got_title					= new_event("soul_got_title");
	event_soul_exiled_from_faction			= new_event("soul_exiled_from_faction");
	event_test_event = new_event("test_event");
	event_arrow_broken						= new_event("arrow_broken");
	event_arrow_push_in_ground				= new_event("arrow_push_in_ground");
	event_arrow_almost_finished				= new_event("arrow_almost_finished");
	event_faction_settelment				= new_event("faction_settelment");
	event_flare_hit_ground					= new_event("flare_hit_ground");
	event_flare_throwed						= new_event("flare_throwed");
	
	event_level_of_settlement_reached		= new_event("level_of_settlement_reached");
	
	
	event_politician_bribed_from_global_map			= new_event("politician_bribed_from_global_map");
	event_politician_become_candidate				= new_event("politician_become_candidate");
	event_politician_stop_being_politician			= new_event("politician_stop_being_politician");
	event_politician_no_longer_candidate			= new_event("politician_no_longer_candidate");
	event_politician_conversation_moving_success	= new_event("conversation_moving_success");
	event_politician_lost_follower					= new_event("politician_lost_follower");
	event_politician_lord_become_follower			= new_event("politician_lord_become_follower");
	
	
	event_pig_spawn							= new_event("pig_spawn");
	event_pig_kill							= new_event("pig_kill");
	
	event_particle_emitter_switch			= new_event("particle_emitter_switch");
	
	event_precipitation_start						= new_event("weather_start");
	event_precipitation_stop						= new_event("weather_stop");
	
	event_popup_spawned						= new_event("popup_spawned");
	event_popup_closed						= new_event("popup_closed");
	
	event_battleground_create			= new_event("battleground_load_start");
	event_battleground_spawned			= new_event("battleground_spawned");
	event_battleground_destroy			= new_event("battleground_load_finish");
	
	event_encyclopedia_article_viewed = new_event("encyclopedia_article_viewed");
	event_encyclopedia_open_toggle = new_event("encyclopedia_open_toggle");
	
	event_background_process_finished = new_event("background_process_finished");
	
	event_screen_settings_changed	= new_event("screen_settings_changed");
	event_screen_settings_display_scars_changed	= new_event("screen_settings_display_scars_changed");
	
	event_walls_rebuild_buffer		= new_event("walls_rebuild_buffer");
	event_time_speed_set			= new_event("time_speed_set");
	event_time_speed_toggle			= new_event("time_speed_toggle");
	event_time_FULLY_paused			= new_event("time_FULLY_paused");
	event_pause_toggle				= new_event("pause_toggle");
	
	event_mainmenu_unload			= new_event("event_mainmenu_unload");
	event_ingame_unload				= new_event("ingame_unload");
	event_ingame_is_initialized		= new_event("ingame_is_initialized");
	event_new_game					= new_event("new game");
	event_load_game 				= new_event("load_game");
	event_new_game_after			= new_event("new game after");
	event_new_game_handle_genius	= new_event("new_game_handle_genius");
	event_new_game_after_all		= new_event("new_game_after_all");
	event_load_game_after 			= new_event("load game after");
	event_criminal_action			= new_event("criminal_action");
	event_contraband				= new_event("contraband");
	event_bandits_burglary			= new_event("bandits_burglary");
	
	event_religious_rebellion_created	= new_event("religious_rebellion_created");	
	event_religious_rebellion_finished	= new_event("religious_rebellion_finished");	
	event_religious_rebellion_cancelled	= new_event("religious_rebellion_cancelled");	
	event_religious_rebellion_soon		= new_event("religious_rebellion_soon");	
	event_religious_punishment_end		= new_event("religious_punishment_end");
	event_religious_punishment_finish	= new_event("religious_punishment_finish");
	
	event_actor_attack_block		= new_event("actor_attack_block");
	
	
	event_actor_create				= new_event("actor_create");
	event_actor_dead				= new_event("actor_dead");
	event_actor_dead_prev			= new_event("actor_dead_prev");
	event_actor_destroy				= new_event("actor_destroy");
	
	event_decor_removed				= new_event("decor_removed");
	event_wall_section_removed	= new_event("wall_section_removed");
	event_wall_section_destroyed	= new_event("wall_section_destroyed");
	
	
	
	event_political_demand_refused		= new_event("political_demand_refused");
	event_political_demand_accepted		= new_event("political_demand_accepted");
	
	event_soul_change_fealty			= new_event("soul_change_fealty");
	event_soul_save_from_burning_house	= new_event("soul_save_from_burning_house");
	event_soul_was_born					= new_event("soul_was_born");
	event_soul_child_need_title			= new_event("soul_child_need_title");
	event_soul_dead_prev				= new_event("oul_dead_prev");
	event_soul_dead						= new_event("soul_dead");
	event_soul_faction_changed			= new_event("soul_faction_changed");	// Актор сменил фракцию. Например, когда мигрант становится нашим актором
	event_soul_social_strata_changed	= new_event("soul_social_strata_changed");	// Актор сменил социальный слой. Например, когда чернь становится солдатом
	event_soul_desire_internal_break	= new_event("soul_desire_internal_break");
	event_soul_desire_success_finish	= new_event("soul_desire_success_finish");
	event_soul_desire_appear			= new_event("soul_desire_appear");
	event_soul_desire_strong			= new_event("soul_desire_strong");
	event_soul_desire_detach			= new_event("soul_desire_detach");
	event_soul_desire_force_fail		= new_event("soul_desire_force_fail");
	event_soul_desire_ignored			= new_event("soul_desire_ignored");
	event_soul_hostage					= new_event("soul_hostage");
	event_soul_hostage_rescue			= new_event("soul_hostage_rescue");
	event_faction_set_agreement			= new_event("faction_set_agreement");
	event_faction_reset_agreement_pre	= new_event("faction_reset_agreement_pre");
	event_faction_reset_agreement		= new_event("faction_reset_agreement");
	event_faction_heir_changed			= new_event("faction_heir_changed");
	event_faction_king_changed			= new_event("faction_king_changed");
	event_faction_king_changed_pre		= new_event("faction_king_changed_pre");
	event_faction_relationship_changed	= new_event("faction_relationship_changed");
	event_faction_relationship_changed_after	= new_event("faction_relationship_changed_after");
	event_faction_opinion_changed		= new_event("faction_opinion_changed");
	event_soul_free_lord_expired		= new_event("soul_free_lord_expired");
	event_soul_free_lord_low_loyalty	= new_event("soul_free_lord_low_loyalty");
	event_soul_join_squad				= new_event("soul_join_squad");
	event_soul_leave_squad				= new_event("soul_leave_squad");
	event_soul_free_lord_hired			= new_event("soul_free_lord_hired");
	
	event_soul_break_eqipment			= new_event("soul_break_equipment");
	event_TARGET_soul_changed_culture	= new_event("TARGET_soul_changed_culture");
	event_soul_dialect_add				= new_event("soul_dialect_add");
	
	event_dark_action_activity_finished = new_event("dark_action_activity_finished");
	event_dark_action_on_perfromed		= new_event("dark_action_on_perfromed");
	
	event_actor_need_medicine			= new_event("actor_need_medicine");
	event_actor_captive_successful_escape		= new_event("actor_captive_successful_escape");
	event_actor_change_speed_factor		= new_event("actor_change_speed_factor");
	event_actor_return_in_province		= new_event("actor_return_in_province");
	event_actor_faction_changed			= new_event("actor_faction_changed");
	event_actor_social_strata_changed	= new_event("actor_social_strata_changed");	// Актор сменил социальный слой. Например, когда чернь становится солдатом
	event_actor_not_immobilized		= new_event("actor_not_immobilized");
	event_actor_immobilized			= new_event("actor_immobilized");
	event_actor_changed_node		= new_event("actor_changed_cell");		// Актор переместился из клетки карты
	event_TARGET_actor_enter_to_bedroom	= new_event("actor_enter_to_bedroom");	// вошел в спальню
	event_actor_move_to_node				= new_event("actor_move_to");			// Актор начал движение к следующей ноде
	event_actor_was_fired			= new_event("actor_was_fired");			// Актор был уволен
	event_actor_was_hired			= new_event("actor_was_hired");			// Актор был нанят
	event_actor_deep_social_answer	= new_event("actor_deep_social_answer");// Актор ответил на глубокое общение
	event_actor_conversation		= new_event("actor_conversation");
	event_actor_change_criminal_status	= new_event("actor_change_criminal_status");	// Актор стал или перестал быть бандитом
	event_actor_take_hit			= new_event("actor_take_hit");			// Актор получил удар от кого-то
	event_actor_retreat_update_before= new_event("actor_retreat_update_before");		// Актор начал убегать или собрался с силами и перестал убегать от дизморали
	event_actor_retreat_update		= new_event("actor_retreat_update");		// Актор начал убегать или собрался с силами и перестал убегать от дизморали
	event_actor_surrender_update	= new_event("actor_surrender_update");
	event_actor_start_battle		= new_event("actor_start_battle");
	event_actor_end_battle			= new_event("actor_end_battle");
	event_actor_church_pray_finish	= new_event("actor_church_pray_finish");
	event_actor_tantrum_start		= new_event("actor_tantrum_start");
	event_actor_burning				= new_event("actor_burning");
	event_actor_burning_end			= new_event("actor_burning_end");
	event_actor_self_immolation		= new_event("actor_self_immolation");
	event_actor_drink_start			= new_event("actor_drink_start");
	event_actor_drink_finish		= new_event("actor_drink_finish");
	event_actor_vomit				= new_event("actor_vomit");
	event_actor_start_battle_round	= new_event("actor_start_battle_round");
	event_actor_sleeping_start		= new_event("actor_sleeping_start");
	event_actor_sleeping_end		= new_event("actor_sleeping_end");
	event_actor_night_murder		= new_event("actor_night_murder");
	event_actor_night_murder_start	= new_event("actor_night_murder_start");
	event_actor_church_burn_begin	= new_event("actor_church_burn_begin");
	event_actor_church_burn_begin_prev	= new_event("actor_church_burn_begin_prev");
	event_actor_become_thug			= new_event("actor_become_thug");
	event_actor_start_bleeding		= new_event("actor_start_bleeding");
	event_actor_cure_bleeding		= new_event("actor_cure_bleeding");
	event_actor_hunt_begin			= new_event("actor_hunt_begin");
	event_actor_hunt_finish			= new_event("actor_hunt_finish");
	event_actor_set_family_relation		= new_event("actor_set_family_relation");
	event_actor_reset_family_relation	= new_event("actor_reset_family_relation");
	event_actor_murder				= new_event("actor_murder");
	event_actor_roped				= new_event("actor_roped");
	event_actor_unroped				= new_event("actor_unroped");
	event_actor_left_province		= new_event("actor_left_province");
	
	event_faction_added_member		= new_event("faction_added_member");
	event_faction_removed_member	= new_event("faction_removed_member");
	event_faction_destroyed			= new_event("faction_destroyed");
	event_faction_created			= new_event("faction_created");
	event_faction_become_vassal 	= new_event("faction_become_vassal");
	event_faction_end_vassal		= new_event("faction_end_vassal");
	event_faction_end_vassal_pre	= new_event("faction_end_vassal_pre");
	event_faction_become_ally		= new_event("faction_become_ally");
	event_faction_end_ally			= new_event("faction_end_ally");
	
	
	event_actor_finish_move_in_squad	= new_event("actor_finish_move_in_squad");
	event_actor_try_to_finish_tantrum = new_event("actor_try_to_finish_tantrum"); // Вне очередная проверка на завершение тантрума
	event_actor_tantrum_finished		= new_event("actor_tantrum_finished");
	event_actor_got_insight				= new_event("actor_got_insight");
	event_actor_increase_disease_serverity		= new_event("actor_increase_disease_serverity");
	event_actor_decrease_disease_serverity		= new_event("actor_decrease_disease_serverity");
	event_actor_bleeding = new_event("actor_bleeding");
	

	event_actor_love_reset				= new_event("actor_love_reset");
	event_actor_eat 					= new_event("actor_eat");
	event_murder_intention_add			= new_event("murder_intention_add");
	event_poison_attemp_success			= new_event("poison_attemp_success");
	event_poison_attemp_failed			= new_event("poison_attemp_failed");
	
	event_detached_mind				= new_event("detached_mind");					// Открепили мысль
	
	
	event_attached_sin				= new_event("attached_sin");					// Прикрепили грех
	event_attached_trait			= new_event("attached_trait");					// Прикрепили трейт
	event_detached_trait			= new_event("detached_trait");					// Открепили трейт
	
	
	event_attached_opinion_mind		= new_event("attached_opinion_mind");			// Прикрепили социальную мысль
	event_detached_opinion_mind		= new_event("detached_opinion_mind");			// Открепили социальную мысль
	event_TARGET_trait_banned_tags_update	= new_event("trait_banned_tags_update");		// Обновлены забаненые теги
	event_actor_hate				= new_event("actor_hate");						// один лорд начинает ненавидеть другого
	event_actor_friend				= new_event("actor_friend");					// один лорд начинает считать другом другого
	event_actor_opinion_state_change= new_event("opinion_state_change");			// один лорд поменял отношение о другом лорде
	
	event_guro						= new_event("guro");					// Отлетает часть тела
		
	event_bf_prepare_to_hit			= new_event("bf_prepare_to_hit");
	event_bf_hit					= new_event("bf_hit");					// В бою кто-то кому-то наносит удар
	event_TARGET_bf_hit				= new_event("bf_TARGET_hit");					// В бою кто-то кому-то наносит удар
	event_before_cycle_end			= new_event("event_before_cycle_end");	// Прямо перед началом нового дня
	event_cycle_end_pre				= new_event("cycle_end_pre");				// Начался новый день
	event_cycle_end					= new_event("cycle_end");				// Начался новый день
	event_time_evening				= new_event("evening");					// Закончился рабочий день
	event_time_night				= new_event("night");					// Закончился день
	
	event_time_hour_prev			= new_event("time_hour_prev");			// Начался новый час (сперва это событие)
	event_time_hour					= new_event("time_hour");				// Начался новый час
	event_time_hour_after			= new_event("time_hour_after");			// Начался новый час (потом это)
	
	event_time_refresh				= new_event("time_refresh");	
	event_time_warp_changed			= new_event("time_warp_changed");	
	event_province_daily_statistics_daily = new_event("province_daily_statistics_daily");
	event_province_daily_statistics_world	= new_event("province_daily_statistics_world");
	
	event_TARGET_morning_service				= new_event("morning_service");
	
	event_province_dummy_leaving		= new_event("province_dummy_leaving");
	event_province_migrants_arrive		= new_event("province_migrants_arrive");
	event_province_caravan_arrived		= new_event("province_caravan_arrived");
	event_province_caravan_go_back		= new_event("province_caravan_go_back");
	event_province_hired_soldiers_arrived = new_event("province_hired_soldiers_arrived");
	event_province_guests_arrived		= new_event("province_guests_arrived");
	event_province_bishop_arrived		= new_event("province_bishop_arrived");
	event_province_bishop_hate_alert	= new_event("province_bishop_hate_alert");
	event_province_guest_depart 		= new_event("province_guest_depart");
	event_bishop_retrieve 				= new_event("bishop_retrieve");
	
	event_building_custom_shaders_update	= new_event("building_custom_shaders_update");
	event_building_destroy					= new_event("building_destroy");
	event_building_destroy_prev				= new_event("building_destroy_prev");
	event_building_create					= new_event("building_create");
	event_building_create_prev				= new_event("building_create_prev");
	event_bulding_mine_precreate			= new_event("bulding_mine_precreate");
	
	event_building_warehouse_resource_change = new_event("building_warehouse_resource_change");
	event_building_not_loaded_correctly	= new_event("building_not_loaded_correctly");	// Здание не создалось при загрузке игры
	event_building_efficiency_placement	= new_event("building_efficiency_placement");	// расчитали время пути и надо обновлять эффективность расположения
	event_building_construction_done	= new_event("building_construction_done");	// Закончили строительство
	event_building_construct_update		= new_event("building_construct_update");	/// ивент для перестройки теней от лесов и веревок вокруг зданий
	event_building_upgrade_begin		= new_event("building_upgrade_begin");		// Начали апгрейд
	event_building_upgrade_cancel		= new_event("building_cancel_upgrade");		// Отменили апгрейд
	event_building_breakdown			= new_event("building_breakdown");			// Произошла поломка здания
	event_building_demolition_begin		= new_event("building_demolition_begin");	// Начали разборку здания
	event_building_upgrade_done			= new_event("building_upgrade_done");		// Закончили апгрейд
	event_building_construction_change_status	= new_event("building_construction_change_status");
	event_building_burning_begin		= new_event("building_burning_begin");
	event_building_burning_end			= new_event("building_burning_end");
	event_building_burned_partially		= new_event("building_burned_partially");		// Здание сгорело
	event_building_repair_begin			= new_event("building_repair_begin");			// Игрок поставил здание на починку
	event_building_repair_finish		= new_event("building_repair_finish");
	event_building_construction_abort	= new_event("building_construction_abort");		// Игрок отменил починку/апгрейд/перенос
	event_coast_line_refresh			= new_event("coast_line_generate");
	event_building_change_patrol_radius = new_event("change_patrol_radius");
	event_building_change_patrol_level_max  = new_event("change_patrol_level_max");
	event_building_change_patrol_level_min = new_event("change_patrol_level_min");
	event_building_change_pain_level	= new_event("change_pain_level");
	event_building_change_builders_priority = new_event("change_builders_priority");
	event_building_change_skill_level	= new_event("change_skill_level");
	event_building_closed				= new_event("building_closed");
	event_building_opened				= new_event("building_opned");
	
	
	event_watch_guard_change_level  		= new_event("guard_change_level");
	event_watch_guard_change_priority		= new_event("guard_change_priority");
	event_watch_guard_change_guards_count	= new_event("change_guards_count");
	
	event_restrictions_gui_change		= new_event("restrictions_gui_change");
	
	
	
	event_main_resource_reserve			= new_event("main_resource_reserve");
	event_main_resource_change			= new_event("main_resource_change");	// На общем складе изменилось число ресурсов
	event_main_resource_set				= new_event("main_resource_set");	// На общем складе изменилось число ресурсов
	event_main_budget_change            = new_event("main_budget_change");
	event_produced_resources_transfered_in_storage = new_event("produced_resources_transfered_in_storage"); // Произведенные ресурсы доставлены на склад
	
	event_production_orders_update		= new_event("production_orders_update");
	event_production_produced			= new_event("production_produced");
	event_production_order_complete		= new_event("production_order_complete");
	
	event_rem_status_changed			= new_event("rem_status_changed");		// Менеджер обмена ресурсов сменил статус задачи
	event_rtm_status_changed			= new_event("rtm_status_changed");		// Менеджер переноски ресурсов сменил статус задачи
	
	event_battle_triumph				= new_event("battle_triumph");
	event_battle_team_refresh			= new_event("battle_team_refresh");
	event_battle_create					= new_event("battle_create");
	event_battle_destroy				= new_event("battle_destroy");
	event_battle_pre_start				= new_event("battle_pre_start");
	event_battle_process				= new_event("battle_process");				// Происходит битва
	event_battle_finish 				= new_event("battle_finish");				// Битва закончилась, эвент в себе несет BattleResult
	event_battle_post_finish			= new_event("battle_post_finish");			// Битва закончилась, эвент в себе несет BattleResult
	event_army_battle_finish			= new_event("army_battle_finish");
	
	event_TARGET_squad_attach_mind		= new_event("squad_attach_mind");
	event_squad_commander_replaced		= new_event("squad_commander_replaced");
	event_squad_actor_add_to_formation	= new_event("squad_actor_add_to_formation");
	event_squad_actor_remove_from_formation		= new_event("squad_actor_remove_from_formation");
	event_squad_select					= new_event("squad_select");
	event_squad_create					= new_event("squad_create");
	event_squad_destroy					= new_event("squad_destroy");
	event_squad_destroy_pre				= new_event("squad_destroy_pre");
	event_squad_formation_complete		= new_event("squad_formation_complete");
	event_squad_formation_move			= new_event("squad_formation_move");
	event_squad_order_follow_update_distance	= new_event("squad_order_follow_update_distance");
	event_squad_order_activity_complete	= new_event("squad_order_activity_complete");
	event_squad_order_activity_break	= new_event("squad_order_activity_break");
	event_squad_order_perfrom			= new_event("squad_order_perform");
	event_squad_order_attack			= new_event("squad_order_attack");
	event_squad_order_complete			= new_event("squad_order_complete");
	event_squad_order_break				= new_event("squad_order_break");
	event_squad_order_internal_break	= new_event("squad_order_internal_break");	// Событие внутренней отмены приказа
	event_squad_order_outside_break		= new_event("squad_order_outside_break");	// Событие наружней отмены приказа
	event_squad_commander_dead			= new_event("squad_commander_dead");
	event_squad_option_switch			= new_event("squad_option_switch");
	// event_squad_leave_actor				= new_event("squad_leave_actor");
	event_squad_update_timer			= new_event("squad_update_timer");
	event_squad_reset_all_path_result	= new_event("squad_reset_all_path_result");
	
	event_ambush_create 				= new_event("ambush_create");
	event_ambush_squad					= new_event("ambush_squad");
	event_ambush_start_attack			= new_event("ambush_start_attack");
	
	event_ambush_objective_outside_break	= new_event("ambush_objective_outside_break");
	event_ambush_objective_internal_break	= new_event("ambush_objective_internal_break");
	event_ambush_objective_reseted			= new_event("ambush_objective_reseted");
	event_ambush_objective_complete			= new_event("ambush_objective_complete");
	event_ambush_objective_take				= new_event("ambush_objective_set");
	
	event_ambush_destroy				= new_event("ambush_destroy");
	
	event_activity_lock_picking_fail	= new_event("activity_lock_picking_fail");
	event_activity_coop_join			= new_event("activity_coop_join");
	event_activity_create				= new_event("activity_create");
	event_activity_coop_destroy			= new_event("activity_coop_destroy");
	event_activity_coop_forbidden		= new_event("activity_coop_forbidden");
	event_activity_finished 			= new_event("activity_finished");
	event_tantrum_activity_finished		= new_event("tantrum_activity_finished");
	event_activity_dont_want_work		= new_event("activity_dont_want_work");
	event_activity_spent_time_together_force_end = new_event("activity_spent_time_together_force_end");
	
	event_envirenment_placeholder_refresh = new_event("envirenment_placeholder_refresh");
	event_envirenment_placeholder_place = new_event("envirenment_placeholder_place");
	event_envirenment_placeholder_remove = new_event("envirenment_placeholder_remove");
	
	event_gui_recreate						= new_event("gui_recreate");
	event_gui_refresh_data					= new_event("gui_refresh_data");
	event_gui_switch_tab					= new_event("gui_switch_tab");				// Переключение между табами в меню
	event_gui_select_construction_building	= new_event("gui_select_construction_building");
	event_gui_select_construction_floor		= new_event("gui_select_construction_floor");
	
	event_gui_button_pressed				= new_event("gui_button_pressed");
	event_gui_press_ok_in_battle_result		= new_event("gui_press_ok_in_battle_result");
	
	event_gui_show_hint 					= new_event("gui_show_hint");
	event_gui_dissapear_hint				= new_event("gui_dissapear_hint");
	
	event_TARGET_gui_opinion_change_page			= new_event("gui_opinion_change_page");
	event_gui_town_lords_change_page		= new_event("gui_town_lords_change_page");
	
	event_TARGET_gui_sub_menu_toggle		= new_event("TARGET_gui_sub_menu_toggle");
	event_gui_menu_tab_open					= new_event("gui_menu_tab_open");
	event_gui_menu_closed					= new_event("gui_menu_closed");
	
	event_gui_checkbox_activate 			= new_event("gui_checkbox_activate");
	
	event_red_notification				= new_event("red_notification");
	event_io_close_button_pressed		= new_event("io_close_button_pressed"); 	// Нажали на кнопку отмены (ESC или правая кнопка)
	event_io_switch_lord_button_pressed = new_event("io_switch_lord_button_pressed");
	event_io_right_mouse_pressed		= new_event("io_right_mouse_pressed");
	event_io_left_mouse_pressed			= new_event("io_left_mouse_pressed");
	event_io_left_mouse_released			= new_event("io_left_mouse_released");
	event_io_mouse_wheel				= new_event("io_mouse_wheel");
	event_io_right_mouse_pressed_without_context_menu		= new_event("io_right_mouse_pressed_without_context_menu");
	event_io_keyboard_key_pressed			= new_event("io_keyboard_key_pressed");
	event_io_keyboard_key_pressed_repeats	= new_event("io_keyboard_key_pressed_repeats");
	
	event_keyboard_string_updated		= new_event("keyboard_string_updated");
	
	#region Управление производственными карточками
	event_production_card_new_order			= new_event("production_card_new_order");
	event_production_card_cancel_order		= new_event("production_card_cancel_order");
	event_production_card_order_quantity	= new_event("production_card_quantity");
	event_production_card_sale_quantity		= new_event("production_card_sale_quantity");
	event_production_card_sale_price		= new_event("production_card_sale_price");
	
	event_production_next_statistics_period		= new_event("production_next_statistics_period");
	#endregion
	
	#region Управление карточками зарплат
	event_salary_change = new_event("salary_change");
	event_slave_salary_change	= new_event("slave_salary_change");
	#endregion
	
	#region Управление воздействием на персонажей
	event_action_task_set_task			= new_event("action_task_set_task");
	event_action_task_cancel			= new_event("action_task_cancel");
	event_action_task_activity_comlete	= new_event("action_task_activity_comlete"); 
	event_action_task_created			= new_event("action_task_created");
	event_action_task_finished			= new_event("action_task_finished");
	event_action_task_deleted			= new_event("action_task_deleted");
	event_action_task_forced			= new_event("action_task_forced");
	#endregion
	
	event_trade_table_move_resources			= new_event("trade_table_move_resources");
	event_trade_product_on_swap_table_reset 	= new_event("trade_product_on_swap_table_reset");
	event_trade_product_click   				= new_event("trade_product_click");
	event_trade_product_hover   				= new_event("trade_product_hover");
	event_trade_product_mouse_above  			= new_event("trade_product_mouse_above");
	event_trade_perform_trade           		= new_event("trade_perform_trade");
	event_trade_change_tab      				= new_event("trade_change_tab");
	event_trade_dealed          				= new_event("trade_dealed");
	event_trade_product_saturation_window_set	= new_event("trade_product_saturation_window_set");
	
	event_building_change_workers_number	= new_event("building_change_workers_number");
	event_building_appoint_actor_reset		= new_event("building_inspector_reset");
	event_building_appoint_actor_set		= new_event("building_inspector_set");
	event_building_work_priority_switch		= new_event("building_work_priority_switch");
	event_building_applied_effects_changed	= new_event("building_applied_effects_changed");
	event_building_warrioirs_priority		= new_event("building_warrioirs_priority");
	event_building_special_action			= new_event("building_special_action");
	event_arena_change_maximal_battle		= new_event("arena_change_maximal_battle");
	event_building_need_inspector			= new_event("building_need_inspector");
	event_building_clerk_set				= new_event("building_clerk_set");
	event_building_clerk_set_after			= new_event("building_clerk_set_after");
	event_building_clerk_reset				= new_event("building_clerk_reset");
	event_building_not_enought_workers		= new_event("building_not_enought_workers");
	event_building_social_separation_switch	= new_event("building_social_separation_switch");
	event_building_market_good_switch		= new_event("building_market_good_switch");
	event_building_inspection_finish		= new_event("building_inspection_finish");
	event_building_switch_everyday_inspect	= new_event("switch_everyday_inspect");
	event_building_switch_any_inspector		= new_event("switch_any_inspector");
	event_building_switch_prefer_group		= new_event("switch_prefer_group");
	event_building_inspector_seted			= new_event("building_inspector_seted");
	event_building_enable_switch			= new_event("building_enable_switch");
	event_building_mine_limit_reached		= new_event("building_mine_limit_reached");
	event_building_mine_limit_upgrade		= new_event("building_mine_limit_upgrade");
	event_building_enable					= new_event("building_enable");
	
	event_building_selected_resource_change = new_event("building_selected_resource_change");
	
	event_clerks_need_paper					= new_event("clerks_need_paper");
	event_clerks_charched					= new_event("clerks_charched");
	event_clerks_no_buildings				= new_event("clerks_no_buildings");
	
	event_soldier_was_hired				= new_event("soldier_was_hired");
	event_soldier_contract_was_extend	= new_event("soldier_contract_was_extend");
	
	event_soldier_move_to_new_army_project		= new_event("soldier_move_to_new_army_project");
	event_soldier_remove_from_new_army_project	= new_event("soldier_remove_from_new_army_project");
	
	event_soldiers_sort_select			= new_event("soldiers_sort_select");		// Нажали на одну из кнопок сортировки солдат
	event_soldiers_try_to_hire 			= new_event("soldiers_try_to_hire");				// Нажали на солдата в меню найма
	event_soldiers_try_to_extend_mercenary_contract = new_event("soldiers_try_to_extend_mercenary_contract");
	event_soldier_in_barracks_pressed	= new_event("soldiers_pressed");			// Нажали на солдата в меню казарм
	event_upcoming_squad_icon_pressed	= new_event("upcoming_squad_icon_pressed");			// Нажали на иконку отряда в меню создания отряда
	event_upcoming_squad_canceled		= new_event("upcoming_squad_canceled");			// Нажали на крестик у иконки отряда в меню создания отряда
	event_soldier_in_army_pressed 		= new_event("soldier_in_army_pressed");		// Нажали на одного из солдат в меню создания армии
	event_commander_in_army_pressed 		= new_event("commander_in_army_pressed");		// Нажали на командира в меню создании армии
	event_soldier_in_army_cancel_equip_pressed = new_event("soldier_in_army_cancel_equip_pressed");
	event_soldier_in_army_switch_commander_pressed = new_event("soldier_in_army_switch_commander_pressed");
	event_soldier_army_create			= new_event("soldier_army_create");			// Нажали кнопку завершить-утвердить создание
	event_soldier_army_edit				= new_event("soldier_army_edit");
	event_army_create_cancel			= new_event("army_create_cancel");
	event_army_create_leader_picked		= new_event("army_create_leader_picked");
	event_army_open_hire_menu			= new_event("army_open_hire_menu");
	event_soldier_in_barracks_canceled  = new_event("soldier_in_barracks_canceled");
	event_slave_try_to_hire				= new_event("slave_try_to_hire");			// призываем раба в ополчение
	event_new_army_resource_add			= new_event("new_army_resource_add");
	event_new_army_resource_del			= new_event("new_army_resource_del");
	event_army_created					= new_event("army_created");
	event_army_squad_resource_transfer	= new_event("army_squad_resource_transfer");
	
	event_soul_select			= new_event("soul_select");			// Игрок выбрал актора
	event_soul_select_reset		= new_event("soul_select_reset");
	event_actor_click			= new_event("actor_click");		// Игрок кликнул по актору
	event_actor_context_menu	= new_event("actor_context_menu");
	event_building_select		= new_event("building_select");			// Игрок выбрал здание
	event_resource_asset_select		= new_event("resource_asset_select");			// Игрок выбрал ассет ресурса (шахта, полянка и т.д.)
	event_building_context_menu	= new_event("building_context_menu");
	
	// event_object_context_call	= new_event("object_context_call");	// игрок кликнул парвой кнопкой по чему нибудь
	
	event_trees_buffer_rebuild_shadow	= new_event("trees_buffer_rebuild_shadow");
	event_trees_destroyed				= new_event("trees_destroyed");
	event_tree_cut_down					= new_event("tree_cut_down");
	event_cuted_tree_collected			= new_event("cuted_tree_collected");
	event_trees_buffer_rebuild			= new_event("trees_buffer_rebuild");
	event_trees_fertility_update		= new_event("trees_fertility_update");
	
	event_bush_buffer_rebuild	= new_event("bush_buffer_rebuild");
	event_bush_destroy			= new_event("bush_destroy");
	event_bush_collected		= new_event("bush_collected");
	
	
	event_mine_shadow_refresh	= new_event("mine_shadow_refresh");
	
	event_battle_squad_distance_estimator_finished	= new_event("battle_squad_distance_estimator_finished");
	event_a_star_finder_finished	= new_event("a_star_finder_finished");
	event_pf_scan_in_bounds_finished = new_event("pf_scan_in_bounds_fisihed");
	
	event_selected_building_changed = new_event("selected_building_changed");
	
	event_wheat_instance_growed 	= new_event("wheat_instance_growed");
	event_wheat_instance_dissolved	= new_event("wheat_instance_dissolved");
	
	event_skill_increased	= new_event("skill_increased"); 
	
	event_TARGET_opinion_change_shift	= new_event("event_TARGET_opinion_change_shift");
	event_TARGET_opinion_change_filter	= new_event("event_TARGET_opinion_change_filter");
	
	investigate_case_created		= new_event("investigate_case_created");
	investigate_case_finish_pre		= new_event("investigate_case_finish");
	investigate_case_finish			= new_event("investigate_case_finish");
	investigate_case_breaked		= new_event("investigate_case_breaked");	/// на случай неспособности криминал актора к ходьбе до плахи
	event_gallow_punishment 		= new_event("gallow_punishment");
	event_slave_escaping			= new_event("slave_escaping");
	event_slave_escaped				= new_event("slave_escaped");
	
	
	knowledge_interaction_need_to_discrard		= new_event("knowledge_interaction_need_to_discrard");
	knowledge_interaction_set					= new_event("knowledge_interaction_set");
	knowledge_interaction_finish				= new_event("knowledge_interaction_finish");
	knowledge_interaction_discarded				= new_event("knowledge_interaction_discarded");
	knowledge_interaction_created				= new_event("knowledge_interaction_created");
	knowledge_interaction_begin					= new_event("knowledge_interaction_begin");
	knowledge_cache_refreshed					= new_event("knowledge_cache_refreshed");
	knowledge_lost_update						= new_event("knowledge_lost_update");
	event_knowledge_become_permanent			= new_event("knowledge_become_permanent");
	
	soul_knowledge_added			= new_event("soul_knowledge_added");
	soul_knowledge_removed			= new_event("soul_knowledge_removed");
	
	event_battle_simulator_soldier_take_damage 	= new_event("battle_simulator_soldier_take_damage");
	event_battle_simulator_soldier_dead 		= new_event("battle_simulator_soldier_dead");
	event_battle_simulator_soldier_retreat 		= new_event("battle_simulator_soldier_retreat");
	event_battle_simulator_soldier_surrender 	= new_event("battle_simulator_soldier_surrender");
	event_battle_simulator_soldier_immobilized 	= new_event("battle_simulator_soldier_immobilized");
	
	event_battle_squad_edit						= new_event("battle_squad_edit");
	
	event_global_map_soul_missed_in_action		= new_event("global_map_soul_missed_in_action");
	event_global_map_open						= new_event("global_map_open");
	event_global_map_close						= new_event("global_map_close");
	event_global_map_hover_render_object		= new_event("global_map_hover_render_object");
	event_global_map_reset_hover_render_object	= new_event("global_map_reset_hover_render_object");
	event_global_map_force_update_neighbors		= new_event("global_map_force_update_neighbors");
	
	event_global_map_before_turn				= new_event("global_map_before_turn");
	// event_global_map_turn						= new_event("global_map_turn");
	event_global_map_after_turn					= new_event("global_map_after_turn");
	
	event_global_map_before_next_day			= new_event("global_map_before_next_day");
	event_global_map_next_day					= new_event("global_map_next_day");
	event_global_map_after_next_day				= new_event("global_map_after_next_day");
	event_global_map_before_before_next_day		= new_event("global_map_before_before_next_day");
	event_global_map_before_quests_process		= new_event("global_map_before_quests_process");
	
	event_global_map_ai_vassal_riot				= new_event("global_map_ai_vassal_riot");
	event_global_map_object_activate			= new_event("global_map_object_activate");
	event_global_map_object_deactivate			= new_event("global_map_object_deactivate");
	event_global_map_object_collision			= new_event("global_map_object_collision");
	event_global_map_object_create_before_init	= new_event("global_map_object_create_before_init");
	event_global_map_object_create_after_init	= new_event("global_map_object_create_after_init");
	event_global_map_object_destroy				= new_event("global_map_object_destroy");
	event_global_map_object_destroy_pre			= new_event("global_map_object_destroy_pre");
	event_global_map_object_destroy_pre_with_souls			= new_event("global_map_object_destroy_pre_with_souls");
	event_global_map_object_path_finish			= new_event("global_map_object_path_finish");
	event_global_map_object_move_to_player_town	= new_event("global_map_object_move_to_player_town");
	event_global_map_object_select				= new_event("global_map_object_select");
	event_global_map_object_end_select			= new_event("global_map_object_end_select");
	event_global_map_object_click				= new_event("global_map_object_click");
	event_global_map_object_set_path			= new_event("global_map_object_set_path");
	event_global_map_object_add_soul			= new_event("global_map_object_add_soul");
	event_global_map_object_del_soul			= new_event("global_map_object_del_soul");
	event_global_map_object_change_visible_status	= new_event("global_map_object_change_visible_status");	
	event_global_map_object_add_captured_slave	= new_event("global_map_object_add_captured_slave");	
	event_global_map_town_update_neighbors			= new_event("global_map_town_update_area");
	event_global_map_town_book_change			= new_event("global_map_town_book_change");
	event_global_map_town_population_change		= new_event("global_map_town_population_change");
	
	event_global_map_order_set				= new_event("global_map_order_set");
	event_global_map_order_perform_before	= new_event("global_map_order_perform_before");
	event_global_map_order_perform			= new_event("global_map_order_perform");
	event_global_map_order_complete_pre		= new_event("global_map_order_complete_pre");
	event_global_map_order_complete			= new_event("global_map_order_complete");
	event_global_map_order_break			= new_event("global_map_order_break");
	
	event_global_map_action_checked_squads_updated = new_event("global_map_action_checked_squads_updated");
	event_global_map_action_squad_check		= new_event("global_map_action_squad_check");
	event_global_map_action_supporter_check	= new_event("global_map_action_supporter_check");
	event_global_map_action_task_set		= new_event("global_map_action_task_set");
	event_global_map_action_task_reset		= new_event("global_map_action_task_reset");
	event_global_map_action_task_finished	= new_event("global_map_action_task_finished");
	event_global_map_action_task_aborted	= new_event("global_map_action_task_aborted");
	
	
	event_global_map_quest_callback				= new_event("global_map_quest_callback");
	event_global_map_quest_result				= new_event("global_map_quest_result");
	event_global_map_quest_result_letter		= new_event("global_map_quest_result_letter");
	event_global_map_battle_result				= new_event("global_map_battle_result");
	event_global_map_after_quests_process	= new_event("global_map_after_quests_process");
	
	event_global_map_io_finish_registration = new_event("global_map_finish_registration");
	event_global_map_io_cancel_registration = new_event("global_map_cancel_registration");
	
	
	event_global_map_battle_finish_pre				= new_event("global_map_battle_finish_pre"); 
	event_global_map_battle_finish_quests_handle	= new_event("global_map_battle_finish_quests_handle"); 
	event_global_map_battle_finish_commons_handle	= new_event("global_map_battle_finish_commons_handle"); 
	event_global_map_battle_finish_enslave_handle	= new_event("global_map_battle_finish");
	event_global_map_battle_finish_second			= new_event("global_map_battle_finish_second");
	event_global_map_battle_finish_after			= new_event("global_map_battle_finish_after");
	event_global_map_battle_finish_after_second		= new_event("global_map_battle_finish_after_second");
	event_global_map_battle_finish_collision_check	= new_event("global_map_battle_finish_collision_check");
	
	event_global_map_battle_create			= new_event("global_map_battle_create");
	event_global_map_battle_loaded			= new_event("global_map_battle_loaded");
	event_global_map_battle_select			= new_event("global_map_battle_select");
	
	event_global_map_attack_intention_raw_created			= new_event("global_map_attack_intention_raw_created");
	event_global_map_attack_intention_create				= new_event("global_map_attack_intention_create");
	event_global_map_attack_intention_start 				= new_event("global_map_attack_intention_start");
	event_global_map_attack_intention_change_active_status	= new_event("global_map_attack_intention_change_active_status");
	event_global_map_attack_intention_reseted				= new_event("global_map_attack_intention_destroyed");
	event_global_map_attack_intention_internal_reset		= new_event("global_map_attack_intention_internal_reset");
	
	event_global_map_object_change_cell					= new_event("global_map_render_action_change_cell");
	event_global_map_render_action_finished 			= new_event("global_map_render_action_finished");
	
	event_global_map_army_return_to_province			= new_event("global_map_army_return_to_province");
	event_global_map_hired_bandits_return_to_province	= new_event("global_map_hired_bandits_return_to_province");
	event_global_map_village_burned						= new_event("global_map_village_burned");
	event_global_map_village_restored					= new_event("global_map_village_burned");
	
	event_global_map_area_visible_cache			= new_event("map_area_visible_cache");
	
	event_global_map_start_trade_agreement				= new_event("global_map_start_trade_agreement");
	event_global_map_trade_complete 					= new_event("global_map_trade_complete");
	event_global_map_simulation_switch					= new_event("global_map_simulation_switch");
	event_global_map_faceless_conquest_province_area	= new_event("global_map_faceless_conquest_province_area");
	
	event_slave_escaping					= new_event("slave_escaping");
	
	event_adultery							= new_event("adultery");
	event_sex_end							= new_event("sex_end");
	event_sex_start							= new_event("sex_start");
	event_soul_was_pregnant					= new_event("pregnancy");
	event_soul_pregnant_finish				= new_event("soul_pregnant_finish");
	
	event_slave_escape_start				= new_event("slave_escape_start");
	
	event_kid_growing						= new_event("kid_growing");
	event_kid_need_lesson					= new_event("kid_need_lesson");
	
	event_character_low_loyaled				= new_event("character_low_loyaled");
	event_TARGET_character_adultery_rumors			= new_event("character_adultery_rumors");
	
	event_storage_robbed					= new_event("storage_robbed");
	event_storage_lockpicked				= new_event("storage_lockpicked");
	
	event_duel_begin						= new_event("duel_begin");
	event_duel_over							= new_event("duel_over");
	event_duel_fistfight_over				= new_event("duel_fistfight_over");
	
	event_kid_can_read						= new_event("kid_can_read");
	
	event_heir_rebellion_start				= new_event("heir_rebellion_start");
	event_heir_rebellion_failed				= new_event("heir_rebellion_failed");
	event_heir_rebellion_success			= new_event("heir_rebellion_success");
	
	event_loyalty_rebellion_start			= new_event("loyalty_rebellion_start");
	event_loyalty_rebellion_failed			= new_event("loyalty_rebellion_failed");
	event_loyalty_rebellion_success			= new_event("loyalty_rebellion_success");
	event_loyalty_rebellion_discard			= new_event("loyalty_rebellion_discard");
	
	event_soul_character_captived_before	= new_event("character_captived_before");
	event_soul_character_captived			= new_event("character_captived");
	event_captive_escape_start				= new_event("captive_escape_start");
	event_captive_change_faction			= new_event("captive_change_faction");
	event_kidnap_atm_complete				= new_event("kidnap_atm_complete");
	event_soul_character_captive_free		= new_event("captive_free");
	
	event_terror_in_province				= new_event("terror_in_province");
	
	event_gui_hud_menu_open					= new_event("gui_hud_menu_open");
	event_gui_hud_menu_close				= new_event("gui_hud_menu_close");
	
	event_gui_hud_construction_section_open	= new_event("gui_hud_construction_section_open");
	event_gui_construction_mode_close		= new_event("gui_construction_mode_close");
	event_gui_construction_mode_open		= new_event("gui_construction_mode_open");
	
	event_home_invasion						= new_event("home_invasion");
	event_sex_cheat							= new_event("sex_cheat");
	
	event_personality_trait_attach			= new_event("personality_trait_attach");
	event_character_nature_talent_reveal	= new_event("character_nature_talent_reveal");
	
	event_dark_order_create					= new_event("dark_order_create");
	event_actor_kidnap_fail					= new_event("actor_kidnap_fail");
	
	#region Family Editor
	event_family_editor_select_member	= new_event("family_editor_select_member");
	event_family_editor_modify_member	= new_event("family_editor_modify_member");
	event_family_editor_set_culture		= new_event("family_editor_set_culture");
	#endregion
	
	event_atm_complete						= new_event("atm_complete");
	
	event_ceremony_finished					= new_event("ceremony_finished");
	event_ceremony_discard					= new_event("ceremony_discard");
	event_ceremony_interrupt				= new_event("ceremony_interrupt");
	event_ceremony_start					= new_event("ceremony_start");
	
	event_preah_start						= new_event("preah_start");
	
	event_matriarch_opinion_refresh			= new_event("matriarch_opinion_refresh");
	
	event_prophecy_initialized				= new_event("prophecy_initialized");
	event_prophecy_started					= new_event("prophecy_started");
	event_prophecy_finished					= new_event("prophecy_finished");
	
	event_market_saturation_oversaturated	= new_event("market_saturation_oversaturated");
	
	event_video_started						= new_event("video_started");
	event_video_ended						= new_event("video_ended");
	event_video_fully_ended					= new_event("video_fully_ended");
	
	event_game_tutorial_finished			= new_event("game_tutorial_finished");
	event_emperor_coronation_over			= new_event("emperor_coronation_over");
	event_engame_achived					= new_event("engame_achived");
	
	event_banner_destroy					= new_event("banner_destroy");
	
	event_unique_guest_arrive				= new_event("unique_guest_arrive");
	event_unique_guest_depart				= new_event("unique_guest_depart");
	
	event_puppet_become						= new_event("puppet_become");
	event_puppet_reset						= new_event("puppet_reset");
	
	event_preach_complete					= new_event("preach_complete");
	
	event_loyalty_changed					= new_event("loyalty_changed");
	
	event_TARGET_deep_social_end			= new_event("TARGET_deep_social_end");
	
	event_conspiracy_discarded				= new_event("conspiracy_discarded");
	event_conspiracy_finished				= new_event("conspiracy_finished");
	event_conspiracy_failed					= new_event("conspiracy_failed");
	event_conspiracy_created				= new_event("conspiracy_created");
	event_conspiracy_reseted				= new_event("conspiracy_reseted");
	
	event_building_actor_out				= new_event("building_actor_out");
	
	event_advice_showed						= new_event("advice_showed");
	event_advice_resolved					= new_event("advice_resolved");
	
	event_soldiers_deserting				= new_event("soldiers_deserting");
	#endregion
	
	event_extreme_season_begin				= new_event("extreme_season_begin");
	event_extreme_season_end				= new_event("extreme_season_end");
	event_season_phase_transition_begin		= new_event("season_phase_transition_begin");
	
	event_donate							= new_event("event_donate");
	event_politic_strategy_set				= new_event("politic_strategy_set");
	
	static new_event = function(_event_caption/*:string*/)/*->number*/ {
		var event = new PublisherSubscribeEvent(_event_caption);
		array_push(__array_of_pub_sub_events, event);
		
		var index = (array_length(__array_of_pub_sub_events) - 1);
		event.set_index_hash(variable_get_hash(string(index)));
		
		__events_by_name[$ _event_caption] = event;
		
		return index;
	}
	
	static ingame_state_unload = function()/*->void*/ {
		for (var i = 0, size_i = array_length(__array_of_pub_sub_events); i < size_i; i++) {
			__array_of_pub_sub_events[i].cleanup();
		}
	}	
	
	#region getters
	static get_event = function(_event_index/*:number*/)/*->PublisherSubscribeEvent*/ {
		return __array_of_pub_sub_events[_event_index];
	}

	static get_event_by_name = function(_event_caption/*:string*/)/*->PublisherSubscribeEvent*/ {
		return __events_by_name[$ _event_caption];
	}

	static get_array_of_pub_sub_events = function()/*->PublisherSubscribeEvent[]*/ {
		return __array_of_pub_sub_events;
	}
	#endregion
}

function PublisherSubscribeEvent(_event_caption/*:string*/) constructor {
	__subscribers = [];							/// @is {weak_reference<PubSubHandler>[]}
	__subscribers_by_target = {};				/// @is {struct<weak_reference<PubSubHandler>[]>} // Ключ - строка _target_key
	__caption = _event_caption;					/// @is {string}
	__index_hash = noone;						/// @is {number}
	
	static set_index_hash = function(_hash/*:number*/)/*->void*/ {
		__index_hash = _hash;
	}
	
	static cleanup = function()/*->void*/ {
		__subscribers = [];
		__subscribers_by_target = {};
	}
	
	static unsubscribe = function(_pub_sub_object/*:weak_reference<PubSubHandler>*/, _target_key/*:string*/ = "")/*->void*/ {
		array_delete_by_value(get_array_of_subscribers(_target_key), _pub_sub_object);	
	}
	
	static subscribe = function(_pub_sub_object/*:weak_reference<PubSubHandler>*/, _target_key/*:string*/ = "")/*->void*/ {
		array_push_unique(get_array_of_subscribers(_target_key), _pub_sub_object);
	}
	
	#region getters
	static get_array_of_subscribers = function(_target_key/*:string*/ = "")/*->weak_reference<PubSubHandler>[]*/ {
		if (_target_key == "") {
			return __subscribers;
		} else {
			var subscribers = __subscribers_by_target[$ _target_key];
			if (subscribers == undefined) {
				var new_arr = [];
				__subscribers_by_target[$ _target_key] = new_arr;
				return new_arr;
			}
			return subscribers;
		}
	}
	
	static get_array_of_dead_subscribers = function()/*->weak_reference<PubSubHandler>[]*/ {
		var result = [];
		
		for (var i = 0, size_i = array_length(__subscribers); i < size_i; i++) {
			if (!weak_ref_alive(__subscribers[i])) {
				array_push(result, __subscribers[i]);
			}
		}
		
		var keys = struct_get_names(__subscribers_by_target);
		for (var i = 0, size_i = array_length(keys); i < size_i; i++) {
			
			var subs = __subscribers_by_target[$ keys[i]];
			for (var j = 0, size_j = array_length(subs); j < size_j; j++) {
				if (!weak_ref_alive(subs[j])) {
					array_push(result, subs[j]);
				}
			}
		}
		
		return result;
	}
	
	static get_caption = function()/*->string*/ {
		return __caption;
	}
	
	static get_index_hash = function()/*->number*/ {
		return __index_hash;
	}
	#endregion
}
