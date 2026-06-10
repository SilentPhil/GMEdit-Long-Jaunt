# GMEdit

GMEdit is a high-end, open-source code editor for GameMaker.

It represents what I consider to be the most important when working with code - being able to edit code quickly and comfortably, with features expected from a modern day code editor and conventional tabbed document design.

Rough lineup of features:

- Supports a variety of versions, including GameMaker: Studio, GameMaker Studio 2 (pre-2.3 and 2.3 formats), and limited support for legacy (GameMaker≤8.1) projects.  
  It can also be used to edit code for GML-based mods for games like [Nuclear Throne](https://yal.cc/ntt-modding-faq/) or [Rivals of Aether](https://rivalsofaether.com/introduction/).
- Spots a high-performance code editor ([Ace](https://ace.c9.io/)), extended and fine-tuned for GML.  
  Comes with [GameMaker-styled keyboard shortucts](http://github.com/GameMakerDiscord/GMEdit/wiki/Keyboard-shortcuts) that can be customized.
- Has combined editors for objects, timelines, and extensions, allowing to view/edit multiple events/moments/scripts at once.
- Fast save and load operations; only changes files it needs to.
- Has a variety of [syntax extensions](https://github.com/YellowAfterlife/GMEdit/wiki) to ease writing repetetive bits of code.  
  Changes are non-destructive and the code remains readable/editable in base IDE.
- Has custom [theme](https://github.com/YellowAfterlife/GMEdit/wiki/Using-themes)
  and [plugin](https://github.com/YellowAfterlife/GMEdit/wiki/Using-plugins) support.
- Free and open-source.

Overall, it can be viewed as a more pleasant alternative to GameMaker's base  IDE, and becomes increasingly more advantageous the more code you write or the more complex your code gets.

By design it is something that you run alongside the base IDE, but there are [ways](https://github.com/YellowAfterlife/GMEdit/wiki/Running-games-from-GMEdit) you can avoid switching back and forth to run the game.

**NEW!** [Try GMEdit online](https://yellowafterlife.github.io/GMEdit/)!  
This web-based version has some limitations compared to the downloadable one, but can give you a general idea of what GMEdit can do, and can also be used to open GameMaker projects without installing anything!

Maintained by: [YellowAfterlife](https://yal.cc)

## Pre-built binaries

Stable binaries can be found [on itch.io](https://yellowafterlife.itch.io/gmedit).

Same page also houses screenshots and development log.

## Building

### First time setup
1. Download/clone the repository.
2. Install a [current version of Haxe](https://haxe.org/download/).
3. Setup Electron by your preferred method:

   * Run `npm install`.
 
   * Download [a pre-built 33.x Electron binary](https://github.com/electron/electron/releases) and
     extract the files into `bin/` directory (so that you have `bin/electron.exe` on Windows or
     `bin/electron` on Mac/Linux). In `bin/resources/app`, run `npm install` to grab needed native
     packages.
 
   * Extract an existing GMEdit Beta to `bin/` without replacing files. This will also provide the
     extra non-MIT licensed components of GMEdit.
  
### Compiling
1. Build the project via
   ```
   haxe build.hxml
   ```
   or
   ```
   npm run compile
   ```
   or open and run the included FlashDevelop/HaxeDevelop project.

1. Run the compiled output with electron via `npm start` or just run the according Electron binary in
   `bin/`, if you chose this option.

### Credits

* Programming language: [Haxe](https://haxe.org)
* Code editor: [Ace](https://ace.c9.io/) (with custom plugins and some minor edits)
* Tab component: [Chrome tabs](https://github.com/adamschwartz/chrome-tabs) (moderately edited)
* Native wrapper: [Electron](https://electronjs.org/)
* Light theme tree icons: [Silk](http://www.famfamfam.com/lab/icons/silk/) (slightly edited)
* Dark theme tree icons: [Font Awesome](https://fontawesome.com/)
* zlib decompression: [pako](https://github.com/nodeca/pako)
* Windows title bar color detection: [this library](https://github.com/loilo/windows-titlebar-color)
* System font enumerator for the font editor: [font-scanner](https://www.npmjs.com/package/font-scanner) (slightly edited)

### License

[MIT license](https://opensource.org/licenses/mit-license.php)

## Long Jaunt additions

This fork keeps a set of extra GML typing/navigation improvements aimed at large typed projects.

### Collapsible resource panel

The left project resource panel can be hidden from the splitter between the resource tree and code
editor. The toggle stays available as a subtle hover control near the bottom of the splitter, making
it easy to reclaim editor space and restore the resource tree when needed.

### Legacy enum integer types

The older `int<ENUM>` syntax remains supported and should not warn just because newer upstream GMEdit
can treat enum values as a separate `ENUM` type.

```gml
var phase:int<GAME_DIRECTOR_PHASE> = GAME_DIRECTOR_PHASE.EVENTS;

static get_base_tickets = function()->(int<GAME_DIRECTOR_PHASE>|number)[] {
	return [GAME_DIRECTOR_PHASE.EVENTS, 10];
}
```

### Nullable type completion

Fields and methods on `T?` are completed as if the value were `T`, so nullable object references keep
their usual member hints.

```gml
var lord:SoulBasic? = get_possible_lord();

// GMEdit still suggests SoulBasic fields/methods here:
lord.get_caption();
```

### Stricter comparison warnings

The linter warns when equality compares values that cannot cast to each other, including string/number
mismatches.

```gml
// If get_type() returns int, this warns:
if (location.get_type() == "") {
	show_debug_message("bad comparison");
}
```

### Stable arrow-function sugar

GMEdit should preserve the short anonymous-function sugar when reopening code instead of exposing the
expanded form around identifiers that merely contain `function`.

```gml
base_tavern_filter = base_tavern_filter.anon_function(
	(_building:o_building) => _building.get_warehouse().is_has_alcohol()
);
```

### Instance variable declaration warnings

The linter can warn when a non-local, non-global instance variable is first declared outside the class
body/Create event. The setting is available under linter preferences as
`Warn about declaring instance variables outside the class body`.

```gml
function Battle() constructor {
	static is_duel2 = function()->bool {
		if (__cached_duel_type == NO_CACHE) {
			// Warns if __cached_is_duel was not declared in the class body/Create event:
			__cached_is_duel = !array_is_empty(get_teams_by_tags(BATTLE_TEAM_TAG.DUEL));
		}
		return __cached_is_duel;
	}
}
```

### Template propagation for methods

Template arguments on constructor instances are propagated into method return types and method
argument checks.

```gml
/// @template T
function WeightedRandom(_array_of_elements:any[]? = undefined) constructor {
	static init = function(_array_of_elements:(T|number)[])->void {
	}

	static get_random = function()->T? {
	}
}

__events_random = new WeightedRandom(); /// @is {WeightedRandom<SoulCharacter>}

var event = __events_random.get_random();
// event is SoulCharacter?

__phase_random = new WeightedRandom(); /// @is {WeightedRandom<int<GAME_DIRECTOR_PHASE>>}
__phase_random.init(__generic.get_base_tickets());
// accepts (int<GAME_DIRECTOR_PHASE>|number)[]
```

### Interface implementation errors

The linter checks `/// @implements {InterfaceName}` constructors against members declared in
`/// @interface {InterfaceName}` constructors. Missing interface members are reported as red errors
on the relevant `@implements` declaration.

```gml
/// @interface {IPathFinder}
function IPathFinder() constructor {
	static force_end = function()->void {}

	static get_result = function()->PathFindResult {
		return noone;
	}
}

/// @implements {IPathFinder}
function PathFinderAroundAnchorDllAsync() constructor {
	static force_end = function()->void {
	}

	// Error: missing member `get_result`
}
```

### Constructor member tags

Constructor fields and methods can be annotated with access and inheritance tags.

`/// @private`, `/// @protected`, and `/// @public` control whether a constructor member is visible
from other constructors. Private members are only visible inside the declaring constructor, protected
members are visible to descendants, and public members are visible everywhere. If a constructor itself
is marked `/// @private`, fields declared directly inside it default to private unless a member has an
explicit `/// @public` or `/// @protected` tag.

```gml
/// @private
function InventoryBase() constructor {
	__items = []; /// @is {Item[]}

	/// @protected
	static get_items = function()->Item[] {
		return __items;
	}

	/// @public
	static count = function()->int {
		return array_length(__items);
	}
}

function InventoryChild() : InventoryBase() constructor {
	static pick_first = function()->Item? {
		return get_items()[0]; // OK: protected member in a child constructor
	}
}
```

`/// @virtual` marks a member as intended to be overridden, `/// @abstract` marks a member that
descendants must implement, and `/// @override` marks a member that must exist on a parent
constructor or implemented interface. Invalid overrides and missing abstract members are reported as
red linter errors.

```gml
function PhaseBase() constructor {
	/// @abstract
	static start = function()->void {}

	/// @virtual
	static finish = function()->void {}
}

function PhaseIntro() : PhaseBase() constructor {
	/// @override
	static start = function()->void {
	}

	/// @override
	static finish = function()->void {
	}
}
```

### Deprecated function warnings

Functions and methods can be marked with `/// @deprecated`. The linter warns when code calls a
deprecated function or method. Text after the tag is included in the warning, so it can point to a
replacement API.

```gml
/// @deprecated Use new_get_phase() instead
function old_get_phase() {
	return 0;
}

old_get_phase(); // Warning: `old_get_phase` is deprecated: Use new_get_phase() instead
```

### Open a variable's type declaration

Press `F1`/`F12` or middle-click a variable/field to open the declaration of its complex type when the
normal "open definition" target is not the useful one. This works for enums, objects/classes,
constructors, typedef-backed custom types, and nested container types.

```gml
var phase:int<GAME_DIRECTOR_PHASE> = get_phase();
var lord:SoulCharacter = get_lord();
var queue:Array<SoulCharacter> = [];

// F1 or middle-click:
// - phase -> opens GAME_DIRECTOR_PHASE
// - lord -> opens SoulCharacter
// - queue -> opens SoulCharacter
```

### Typed global search and references

The global search dialog (`Ctrl+Shift+F`) has an optional `Type` field for variable-name searches.
When filled, GMEdit first finds text matches and then keeps only variable references whose inferred
type matches the requested type. Nullable forms are included automatically, so searching for
`soul` with type `SoulBasic` also matches `SoulBasic?`.

Enable `Not type` to invert the filter and show matches whose known type is different from the
requested type, plus matching text inside enabled strings/comments.

Long searches show file progress and can be cancelled from the search dialog.

```gml
var soul:SoulBasic = get_selected_soul();
soul.get_traits().cure_bleeding();

var soul:SoulCharacter = get_character_soul();
soul.get_character_soul();
```

`Shift+F1`/`Shift+F12` on a `static method = function` declaration finds method references for that
method's owner type instead of every method with the same name. This includes both receiver calls
(`soul.get_mood_gui_data_struct()`) and direct self-calls inside the same constructor
(`get_mood_gui_data_struct()`).

`Shift+F1`/`Shift+F12` on a direct class field searches references to that field for the owning
class.

### Extract constructor to separate script

Place the cursor on the name in a top-level constructor declaration and run
`Refactor: Extract to separate file` from the command palette. GMEdit moves that constructor into a
new same-named script resource in the same GMS project-tree folder as the original script, removes it
from the source script, and updates the GameMaker project metadata.

```gml
function GameDirectorPhase(_generic:GameDirectorPhaseGeneric) constructor {
}
```

### AI code completion

GMEdit can show AI-powered inline ghost completions while typing, and can also insert a completion
on demand from the command palette. The settings are in `Preferences > Code editor > AI completion`.

Common controls:

- Enable `AI code completion`.
- Enable `Show AI inline suggestions while typing` for Copilot-like ghost text.
- Use `AI inline eagerness` and `AI inline suggestion delay (ms)` to tune how quickly suggestions
  appear.
- Press `Tab` to accept the current inline suggestion.
- Press `Esc` to hide it.
- Use `AI: Insert completion` from the command palette to request a manual insertion.
- Use `AI: Copy last completion debug` when a suggestion looks wrong and you need to inspect the
  request, response, and filtering steps.

OpenAI-compatible setup:

1. Set `AI completion provider` to `OpenAI-compatible API`.
2. Fill `AI API base URL`, usually `https://api.openai.com/v1`.
3. Fill `AI API key`.
4. Set `AI model`, for example `gpt-5.4-mini`.
5. Adjust context and max output token settings if needed.

GitHub Copilot setup:

1. Set `AI completion provider` to `GitHub Copilot`.
2. Run `AI: GitHub Copilot sign in` from the command palette.
3. Finish the GitHub device sign-in flow in the browser. GMEdit copies the sign-in code to the
   clipboard when possible.
4. Use inline completions normally. This provider uses the official GitHub Copilot Language Server,
   so it does not need an OpenAI API key, base URL, model name, or token limit settings.
5. Run `AI: GitHub Copilot sign out` from the command palette to disconnect the account.

```gml
static get_random_event = function()->int<GAME_DIRECTOR_EVENT>? {
	var random_event = __events_weighted_random.get_random();
	if (random_event != undefined) {
		// Start typing here and wait for an inline suggestion.
	}

	return random_event;
}
```
