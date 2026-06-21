package ui.preferences;
import plugins.PluginConfig.PluginDirName;
import plugins.PluginConfig.PluginRegName;
import haxe.DynamicAccess;

/**
 * ...
 * @author YellowAfterlife
 */
@:forward abstract PrefData(PrefDataImpl) from PrefDataImpl to PrefDataImpl {
	public static function defValue():PrefData return {
		theme: "dark",
		ukSpelling: false,
		apiFeatureFlags: [],
		compMatchMode: PrefMatchMode.AceSmart,
		compKeywords: true,
		compFilterSnippets: true,
		compPopupWidth: 300,
		
		argsMagic: true,
		argsFormat: "",
		argsStrict: false,
		importMagic: true,
		allowImportUndo: false,
		coroutineMagic: true,
		lambdaMagic: true,
		hyperMagic: true,
		mfuncMagic: true,
		nullCoalescingAssignment: true,
		castOperators: true,
		hashColorLiterals: true,
		arrowFunctions: true,
		showGMLive: Everywhere,
		problemsScanMode: OnProjectOpen,
		problemsScanScope: OpenTabs,
		problemsStartExpanded: true,
		problemsShowCurrentFileOnly: true,
		problemsRefreshCurrentFileOnly: true,
		problemsFirstRefreshFullProject: false,
		problemsRefreshOnTabChange: true,
		
		fileSessionTime: 7,
		projectSessionTime: 14,
		singleClickOpen: false,
		taskbarOverlays: false,
		assetThumbs: true,
		assetCache: false,
		assetIndexBatchSize: 128,
		diskAssetCache: {
			enabled: false,
			maxSizePerItem: 4096,
			minItemCount: 512,
			cacheUpdateThreshold: 15,
			fileExtensions: ["gml", "yy", "gmx"],
		},
		clearAssetThumbsOnRefresh: true,
		codeLiterals: false,
		constKeywords: false,
		ctrlWheelFontSize: true,
		showArgTypesInStatusBar: false,
		aiCompletion: {
			enabled: false,
			provider: "openai",
			inlineEnabled: true,
			inlineEagerness: "medium",
			inlineDelayMs: 900,
			inlineContextChars: 3000,
			inlineMaxOutputTokens: 96,
			baseUrl: "https://api.openai.com/v1",
			apiKey: "",
			model: "gpt-5.4-mini",
			maxContextChars: 12000,
			maxOutputTokens: 256,
			statusBadgeOpacityPercent: 80,
			debugEnabled: false,
		},
		
		fileChangeAction: Ask,
		avoidYyChanges: false,
		closeTabsOnFileDeletion: true,
		backupCount: { v1: 2, v2: 0, live: 0 },
		recentProjectCount: 16,
		tabSize: 4,
		tabSpaces: true,
		detectTab: true,
		eventOrder: 1,
		assetOrder23: Custom,
		extensionAPIOrder: 1,
		tooltipDelay: 350,
		tooltipKeyboardDelay: 0,
		tooltipKind: Custom,
		linterPrefs: {},
		customizedKeybinds: {},
		
		app: {
			windowWidth: 960,
			windowHeight: 720,
			windowFrame: false,
		},
		globalLookup: {
			matchMode: AceSmart,
			maxCount: 100,
			initialWidth: 480,
			initialHeight: 384,
			initialFilters: {},
		},
		chromeTabs: {
			minWidth: 50,
			maxWidth: 160,
			multiline: false,
			fitText: false,
			boxyTabs: false,
			flowAroundSystemButtons: false,
			autoHideCloseButtons: false,
			rowBreakAfterPinnedTabs: false,
			lockPinnedTabs: false,
			multilineStretchStyle: 1,
			idleTime: 0,
			pinLayers: false,
		},

		disabledPlugins: []
	};
}
typedef PrefDataImpl = {
	theme:String,
	fileSessionTime:Float,
	projectSessionTime:Float,
	
	argsMagic:Bool,
	argsFormat:String,
	argsStrict:Bool,
	importMagic:Bool,
	allowImportUndo:Bool,
	coroutineMagic:Bool,
	lambdaMagic:Bool,
	hyperMagic:Bool,
	mfuncMagic:Bool,
	nullCoalescingAssignment:Bool,
	castOperators:Bool,
	hashColorLiterals:Bool,
	arrowFunctions:Bool,
	
	assetThumbs:Bool,
	assetCache:Bool,
	assetIndexBatchSize:Int,
	clearAssetThumbsOnRefresh:Bool,
	singleClickOpen:Bool,
	taskbarOverlays:Bool,
	showGMLive:PrefGMLive,
	problemsScanMode:PrefProblemsScanMode,
	problemsScanScope:PrefProblemsScanScope,
	problemsStartExpanded:Bool,
	problemsShowCurrentFileOnly:Bool,
	problemsRefreshCurrentFileOnly:Bool,
	problemsFirstRefreshFullProject:Bool,
	problemsRefreshOnTabChange:Bool,
	
	avoidYyChanges:Bool,
	fileChangeAction:PrefFileChangeAction,
	closeTabsOnFileDeletion:Bool,
	recentProjectCount:Int,
	//
	ukSpelling:Bool,
	?compExactMatch:Bool, // deprecated
	compMatchMode:PrefMatchMode,
	compKeywords:Bool,
	compFilterSnippets:Bool,
	compPopupWidth:Int,
	apiFeatureFlags:Array<String>,
	
	detectTab:Bool,
	tabSize:Int,
	tabSpaces:Bool,
	tooltipKind:PrefTooltipKind,
	tooltipDelay:Int,
	tooltipKeyboardDelay:Int,
	codeLiterals:Bool,
	constKeywords:Bool,
	ctrlWheelFontSize:Bool,
	showArgTypesInStatusBar:Bool,
	aiCompletion:PrefAiCompletion,
	//
	eventOrder:Int,
	assetOrder23:PrefAssetOrder23,
	extensionAPIOrder:Int,
	backupCount:DynamicAccess<Int>,
	linterPrefs:parsers.linter.GmlLinterPrefs,
	// GM8 stuff
	?gmkSplitPath:String,
	?gmkSplitOpenExisting:Bool,
	?gmkExtensionFolder:String,
	
	/** section -> commandName -> keybinds */
	customizedKeybinds:DynamicAccess<DynamicAccess<Array<String>>>,
	
	app: {
		windowWidth:Int,
		windowHeight:Int,
		windowFrame:Bool,
	},
	globalLookup: {
		matchMode:PrefMatchMode,
		maxCount:Int,
		initialWidth:Int,
		initialHeight:Int,
		initialFilters:DynamicAccess<Bool>,
	},
	diskAssetCache: {
		var enabled:Bool;
		var minItemCount:Int;
		var maxSizePerItem:Int;
		/** in %! **/
		var cacheUpdateThreshold:Float;
		var fileExtensions:Array<String>;
	},
	chromeTabs: {
		minWidth:Int,
		maxWidth:Int,
		multiline:Bool,
		fitText:Bool,
		boxyTabs:Bool,
		flowAroundSystemButtons:Bool,
		autoHideCloseButtons:Bool,
		rowBreakAfterPinnedTabs:Bool,
		
		/** if locked, pinned tabs cannot be closed except through context menu */
		lockPinnedTabs:Bool,
		
		/** time until the tab gets grayed out, in seconds */
		idleTime:Int,
		/** 0: don't, 1: stretch all, 2: stretch last */
		multilineStretchStyle:Int,
		pinLayers:Bool,
	},

	/**
		List of plugin names which have been disabled by the user.
	**/
	disabledPlugins: Array<PluginDirName>
}
typedef PrefAiCompletion = {
	enabled:Bool,
	provider:String,
	inlineEnabled:Bool,
	inlineEagerness:String,
	inlineDelayMs:Int,
	inlineContextChars:Int,
	inlineMaxOutputTokens:Int,
	baseUrl:String,
	apiKey:String,
	model:String,
	maxContextChars:Int,
	maxOutputTokens:Int,
	statusBadgeOpacityPercent:Int,
	debugEnabled:Bool,
}
enum abstract PrefAssetOrder23(Int) from Int to Int {
	var Custom = 0;
	var Ascending = 1;
	var Descending = 2;
}
enum abstract PrefMatchMode(Int) from Int to Int {
	/// GMS1 style
	var StartsWith = 0;
	/// GMS2 style, "debug" for "show_[debug]_message"
	var Includes = 1;
	/// "icl" for "[i]o_[cl]ear"
	var AceSmart = 2;
	/// "icl" for "[i]nstance_[c]reate_[l]ayer"
	var SectionStart = 3;
	public static var names:Array<String> = [
		"Start of string (GMS1 style)",
		"Containing (GMS2 style)",
		"Smart (`icl` -> `io_clear`)",
		"Per-section (`icl` -> `instance_create_layer`)",
	];
}
enum abstract PrefTooltipKind(Int) from Int to Int {
	var None = 0;
	var Custom = 1;
}
enum abstract PrefFileChangeAction(Int) from Int to Int {
	var Nothing = 0;
	var Ask = 1;
	var Reload = 2;
}
enum abstract PrefGMLive(Int) from Int to Int {
	var Nowhere = 0;
	var ItemsOnly = 1;
	var Everywhere = 2;
	public inline function isActive():Bool {
		return this > 0;
	}
}
enum abstract PrefProblemsScanMode(Int) from Int to Int {
	var OnProjectOpen = 0;
	var OnProblemsShown = 1;
	var Disabled = 2;
}
enum abstract PrefProblemsScanScope(Int) from Int to Int {
	var WholeProject = 0;
	var OpenTabs = 1;
	var CurrentFile = 2;
}
