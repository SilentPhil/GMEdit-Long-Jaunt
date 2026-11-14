# GooWee Preview

Live, read-only layout preview for the active GMEdit script importing
`"games.keevee.gw"`. Both the editor's `#import` and the on-disk `//!#import`
form are supported, including GooWee's shortened names after import expansion.

## Using the plugin

The plugin is bundled in this repository. Restart the GMEdit build from this
checkout to discover it, then open a GooWee script. For another GMEdit installation,
copy this entire `goowee-preview` directory into its user plugins directory and
enable **goowee-preview** under **Preferences → Plugins**.

**GooWee Preview** shares the right sidebar with **Outline View** by default.
The existing dock shows tabs when two or more panels occupy it. Change
**Preview panel position** in the plugin preferences to **Bottom** or
**Below resource tree** where those dock APIs are available. The bottom position
shares tabs with Problems and Builder's Job Output. Moving or hiding the preview
does not remove other panels. **Toggle GooWee preview** is also available in the
command palette.

- Select an entry function when a script contains several UI factories.
- Highlight an element's variable name in the code to select it and center the
  preview without changing zoom. The crosshair button toggles this behavior and
  remembers the setting. This also works in a dependency's tab while the preview
  is locked. Names are matched within their source file and function; comments,
  strings and the visible reference image are ignored. Hidden elements can also
  be selected: a dashed selection frame shows their position without enabling
  their content. For
  repeated instances from one declaration, the currently selected instance is
  kept, or the first instance is selected.
- Click the **lock icon** beside the function selector to pin that script.
  The selector stays available and lists functions from the pinned file, even
  while another editor tab is active. Choosing one updates the pinned preview
  and restores that function's reference. Other tabs leave the target unchanged.
  Root edits and edits to
  the active nested script still update it from unsaved buffers. **Refresh**
  also rebuilds the pinned target. Click the lock again to follow the active tab.
  Closing the pinned file, changing projects or reloading the plugin releases it.
- Click the **crossed-out eye** or press **H** to hide the selected element and
  its children in the preview. **Ctrl + H** undoes the last hide; repeated presses
  undo earlier hides. The **eye** button or **U** restores all manually hidden
  elements in the current function and clears its hide history. Elements hidden
  by game code remain hidden. These shortcuts work while the preview canvas,
  element tree or its buttons have focus, without taking over text fields or the
  code editor; the physical H/U keys also work with a non-Latin keyboard layout.
  Hidden elements remain dimmed in **Elements**. Layout, camera and reference
  alignment stay unchanged, while copying the GUI excludes the hidden subtrees.
  Hiding is temporary and separate for each file/function: it survives Refresh
  and switching functions, but resets when the file or plugin closes. Source
  changes preserve identifiable elements; removed or ambiguous changed entries
  are released instead of hiding another element. No game code/settings are edited.
- Edits update after a short debounce, directly from the unsaved editor buffer.
- Click the **copy icon** beside **Refresh** to copy the entire interface as a PNG
  image at its original size (one GUI pixel per image pixel), independent of
  preview zoom, pan, scrolling and display DPI. Empty space around the interface
  is trimmed; the editor background and selection/bounds overlays are excluded.
  Transparency, the interface's own backgrounds and internal clipping are preserved.
  The image waits for sprites and fonts to load. **Copied** confirms success.
- Set **W / H** to the intended GUI viewport; the default is 1920 × 1080.
- Set **GUI ×** to the game's GUI scale (default 1). This affects ABSV/AUTOV;
  preview zoom only changes how large the result appears in the editor.
- Enable **Reference** to open the reference toolbar, then **Choose file…** to
  load an image. It replaces the interface while both **Reference** and **Show
  reference** are checked. Unchecking either restores the interface; the first
  checkbox also hides the toolbar. Until an image is loaded the interface stays visible.
  **X / Y** position the image relative to the interface's top-left, in GUI pixels;
  one image pixel equals one GUI pixel. Both views share zoom and pan for comparison.
  Drag with the **left mouse button** to move the reference. With the preview
  focused, **arrow keys** move it by 1 pixel; **Shift + arrows** move it by 10.
  The **lock icon beside X/Y** disables dragging and arrow-key movement while
  leaving the X/Y fields editable. Space + left drag and middle drag still pan
  the view. The offset lock resets to unlocked when the plugin reloads.
  The copy button exports the reference while it is shown. Each entry function
  in a script remembers its own image path and X/Y offsets, including when the
  preview is pinned. Switching the function dropdown restores that function's
  reference; functions without a reference show the GUI. Keys use function names,
  so moving a function to another line does not change its reference. Script-body
  previews have a separate entry with an empty name.
  Images inside the project are saved in `#config/goowee_preview.json` under
  `references`, keyed by the script's relative path, with an `entries` map keyed
  by function name. The file is created on the
  first project-reference save. Existing references from `properties.json` remain
  readable and are copied into the new file on the next project-reference save;
  the plugin no longer writes reference changes to `properties.json`. A reference such
  as `${projectDir}/references/menu.png` resolves against each user's project folder;
  share that settings file and the image with the project. External image paths
  and their offsets are stored only in this computer's GMEdit preferences, scoped
  to the project and script. A local reference overrides the shared reference;
  choosing an image inside the project removes that local override. Image bytes
  are never stored in settings or copied into the project. Missing files keep their
  saved path and offsets and show an error so a replacement can be selected.
  Old references saved for an entire script apply only to the first function in
  its dropdown (or Script body if there are no entries). Saving that script's
  reference converts its old record to the function-specific format. Other functions
  start without a reference; editing one never changes another function's record.
  Both visibility toggles remain temporary: the toolbar starts disabled on reload.
  Unsaved scripts or browser files without a local path can only keep a reference
  in memory until the plugin closes.
- Use **Fit content**, **Fit viewport**, or a fixed zoom with scrolling.
- Hold **Space** and drag with the **left mouse button** to pan the preview.
  You can also drag with the **middle mouse button**, without holding Space.
  **Ctrl + mouse wheel** zooms around the pointer, from 2% to 800%.
  Selecting a zoom preset or **Fit content** resets the view position.
- Enable **Sharp pixels** to scale sprites and the reference without smoothing.
  Text rendered by the preview stays smooth. Text inside a reference is part of
  the image, so it follows the same pixel scaling as the rest of the reference.
  This checkbox is saved in plugin preferences and also applies when copying.
- **Bounds** displays element rectangles. **Approximate bounds** controls the
  amber dashed outlines marking approximations; turn it off for a cleaner view.
  The checkbox is saved in plugin preferences and does not hide the selected element.
- Select an element on the canvas or in **Elements** to inspect its position and
  size and original unit expressions. Double-click, or press Enter in the element
  list, to navigate to its line, including helpers in another script.
- **Ctrl + click** selects the deepest visible element under the pointer,
  through overlapping frame/container bounds. Use it to select a text label
  covered by a separate frame canvas. **Ctrl + double-click** opens that
  element's source line. Ordinary clicks keep selecting in drawing order.
- Hovering shows a thin blue outline around the element that a click will select.
  Holding or releasing **Ctrl** immediately switches the outline to match nested
  selection, even without moving the pointer. Hover leaves the current selection
  intact and is hidden while panning or when the pointer leaves the preview.
- Open **Preview notes** for unresolved values and omitted code. Notes link to
  the relevant source lines. **Refresh** also reloads sprites, fonts and localization.

## Project localization

Open **Project Properties → Plugins → goowee-preview**:

- **Localization directory** points to the folder containing
  `locale_definition.json`. Enter an absolute path, a path relative to the
  project, or choose **Browse…**. Leaving it blank discovers
  `datafiles/localization` in the current project.
- **Preview language** lists the languages and captions from that definition.
  The default follows `parseFirst` (English when omitted).
- Changing either setting immediately rebuilds the preview. **Reload localization**
  or the preview's **Refresh** rereads edited JSON/CSV files.

Settings are stored per project in GMEdit's `#config/properties.json`, under
`gooWeePreview.localeDirectory` and `gooWeePreview.localeLanguage`. Switching
projects does not reuse another project's language or translation cache.

The loader follows the project's Lexicanum format: trailing JSON commas,
inherited `files`, exact language-named CSV columns, quoted multiline fields,
optional delimiter/quote arguments, hint bodies/headers and English fallback.
Both `main.csv` relative to the selected folder and `localization/main.csv`
relative to its parent are supported. It reads only files listed in the manifest
and caches the selected language and English after the first lookup.

Preview annotations access the selected translations through `preview_text`,
`preview_text_format` and the other helpers below. Bind a project's localization
API with an explicit `preview_override` in its setup, or let its supported GML
implementation run normally. There is no built-in binding to a game's global
localization object. Known format parameters are substituted; dynamic values
retain `{parameter}` placeholders with a note. Missing keys retain `⟦key⟧`
and a source diagnostic. File/format errors appear in Preview notes.

## Project fonts

Text uses the current project's GMFont resources automatically. The preview
reads glyph atlases and `.yy` metrics instead of selecting an installed font
by name. This preserves the actual regular, bold and italic faces, character
advances, kerning, bearings and line spacing. Bitmap glyph colors and outlines
are retained; SDF atlases are decoded at the requested text size.

GooWee `TextStyle` and the project's interpreted font helpers select the resource,
size, color and opacity. Custom helper names and font families have no special
meaning in the plugin. If a font helper depends on game initialization, supply
its missing inputs in a preview setup. Native font sizes and explicit SDF sizes
follow GooWee's scaling rules, including GUI × and canvas render scale. AUTO
sizes use the same project metrics as the rendered text. Dynamic font files
loaded through the supported font API also trigger layout measurement when ready.

Native SDF font effects are read from the seventh `TextStyle` argument or its
`sdf_effect` field, including values calculated by project helpers. The preview
supports drop shadows (color, opacity, softness and X/Y offsets), outlines,
glow, thickness, and core color/opacity. Cloning or changing a style keeps the
same effect semantics as the source code; no particular helper name is required.
Effects need an SDF atlas with a positive spread. Bitmap fonts and dynamic font
files retain their ordinary rendering and report a Preview note if an SDF effect
cannot be applied.

Effects do not change glyph advances or AUTO layout measurement. Their visible
extent is included in Fit content and copied PNGs, while ancestor clipping and
an explicit label `text_clip_width` remain effective. Text and its effects stay
smooth when **Sharp pixels** is enabled. Arbitrary project shader code is not
executed; its custom parameters do not override the standard SDF effect settings.

**Refresh** clears the font cache and rereads edited resources. Switching
projects or languages releases previous font faces. Missing or unreadable font
resources use a browser fallback with a Preview note. A label with no explicit
project font also uses the browser fallback.

## Preview hints in project code

Hints are ordinary GML comments. GameMaker ignores them; GooWee Preview parses
their contents with the same bounded interpreter as the rest of the script.
They do not execute JavaScript, launch the game or modify project files.

### Compact tags beside normal code

For small examples and state changes, add a `// @preview` or `/// @preview`
tag to the existing statement. There is no need to create a separate preview
function or rewrite the UI's construction code:

```gml
var caption = actor.get_name(); // @preview value "Alden"
var costs = calculate_costs(); // @preview value [20, 50, 75]
var title = new Label(panel, load_caption()); // @preview arg 1 = "Example title"
var debug_badge = new Image(panel, debug_sprite); // @preview hide
attach_debug_overlay(panel); // @preview skip
```

| Tag | Effect in the preview |
| --- | --- |
| `@preview value expression` | Replaces a single variable's initializer, an assignment's right side, a return value or an `if` condition. |
| `@preview arg index = expression` | Replaces one argument of the statement's outer call or constructor. Argument indices start at **0**. |
| `@preview hide` | Hides the visual element created or assigned by the statement. It still participates in layout. |
| `@preview skip` | Omits the complete statement, including a whole block or `if/else`. |
| `@preview init function_call()` | Runs one initialization call in the current local scope. |
| `@preview set target = expression` | Assigns one local value or field in the current scope. |

A trailing tag applies to the completed statement on that line. A standalone
tag applies to the next statement; consecutive standalone tags share that target.
Use a standalone tag before an `if` or a multiline statement rather than putting
it partway through its header. `init` and `set` run before a standalone tag's
target, or after the preceding statement when written as trailing tags.
For `return`, `break`, `continue` and `exit`, put `init` or `set` on a standalone
line before the statement; a trailing form is rejected with a Preview note.

```gml
function shop_menu() {
    /// @preview init initialize_item_catalogue()
    var items = inventory.get_items();

    /// @preview arg 0 = undefined
    /// @preview arg 1 = "Preview title"
    var title = new Label(parent, get_title());

    /// @preview value true
    if (player.can_trade()) {
        add_trade_controls(title);
    }
}
```

Expressions can use the surrounding function's variables, loop indices and
preview helpers such as `preview_json("datafiles/preview/items.json")`. They
are evaluated only when their annotated statement is reached. A substituted
value or argument replaces the original expression without evaluating it first.
Use one tag per comment. Malformed tags or incompatible targets leave ordinary
code intact and produce a source-linked Preview note.

### Advanced blocks

The original block form remains available for larger fixtures, reusable mock
services and multi-statement scenarios. Both forms can be used in the same file.

| Annotation | Purpose |
| --- | --- |
| `/* @goowee-preview setup ... */` | Prepare data and overrides before constructing the selected entry. |
| `/* @goowee-preview code ... */` | Run preview-only GML at this position, with access to local variables. |
| `/* @goowee-preview replace ... */` | Run its GML in place of the next complete statement. |
| `// @goowee-preview skip-next` | Omit the next complete statement, including a whole block or `if/else`. |

Each code block must contain GML statements. `replace` and `skip-next` follow
statement syntax, not line count. Nested preview annotations are unsupported.
Malformed annotations report a source-linked Preview note and stay inert. Source
line numbers are preserved for inspection and double-click navigation.

For example, supply entry arguments without requiring a live player or save:

```gml
/* @goowee-preview setup
var sample_rows = [
    {caption: "Example A", price: 120, progress: 0.35},
    {caption: "Example B", price: 80, progress: 0.75}
];
preview_args([{get_rows: method({sample_rows}, function() { return sample_rows; })}]);
*/
function inventory_menu(controller) {
    var panel = new StackPanel(GooWee.view);
    var rows = controller.get_rows();
    for (var i = 0; i < array_length(rows); i++) {
        var caption = new Label(panel, rows[i].caption);
    }
}
```

If a selected UI function expects a parent control, explicitly pass a root with
`preview_args([undefined])`, or construct and pass the desired container in the
setup. An unresolved runtime parent does not become a new root or attach to a
nearby canvas: that subtree is omitted with a Preview note. `GooWee.view`,
`gw_GooWee.view` and an explicit `undefined` remain valid roots. Selecting a custom
widget constructor directly supplies a root parent by default when no preview
arguments were provided.

Force a local state while retaining the original game's statement:

```gml
/* @goowee-preview replace
var unlocked = true;
*/
var unlocked = player.has_unlocked(item);
```

Hide an already constructed element, or omit its construction entirely:

```gml
var price_label = new Label(card, price_text);
/* @goowee-preview code
price_label.draw_disable();
*/

// @goowee-preview skip-next
attach_debug_overlay(card);
```

Hiding follows normal GooWee visibility semantics; use `skip-next` when the
element should not participate in layout at all. To show a particular card
state, a `code` block can call the card's own setter with sample values. The
plugin interprets that setter from the project, so the fixture does not need
to duplicate the widget's layout.

### Shared setup and call overrides

Create an optional **`.goowee-preview.gml` at the project root** for shared
fixtures and service bindings. It uses the same `setup` comments and is loaded
before setups in the active script. Dependencies are loaded on demand. Setups
are applied once per loaded source for each fresh preview analysis; their data
is not retained as mutable state across Refresh or editor changes. Ordinary
game initialization is not automatically run just because its source was read.

Keep a larger menu fixture in a separate project file and include it beside the
entry's first statement:

```gml
/// @preview init preview_include(".goowee-preview/example.gml")
/// @preview set controller = global.example_controller
var base = create_window(controller);
```

The included file uses the same `/* @goowee-preview setup ... */` format.
Nested includes finish before the next setup statement, and cycles do not run a
file twice. Includes stay inside the project, accept GML files up to 256 KiB and
share the interpreter's normal source/operation limits. Open unsaved fixtures
take precedence over saved files. JSON holds editable sample values; a fixture
can supply method-backed data while the original UI code builds the controls.

`preview_sprite_layers` is useful for a static example of a runtime-generated
portrait. It accepts up to 64 flat sprite layers on a canvas up to 2048 × 2048.
Layers use their source frame, tint and alpha; their positions are relative to
the composite's top-left corner. Overall opacity, tint and transforms apply to
the assembled sprite. It does not execute runtime shaders or animation.

`preview_override("call.path", function(...) { ... })` replaces an exact call
path with a GML closure. The closure receives the actual call arguments and
takes precedence over normal source lookup. Bind the path as written in the
calling code; this is an explicit fixture, not a global replacement of every
method with the same final name.

```gml
/* @goowee-preview setup
preview_override("load_inventory", function() {
    return preview_json("datafiles/preview/inventory.json");
});
preview_override("localize_label", function(key) {
    return preview_text(key);
});
preview_override("get_window_size", function() {
    return preview_viewport();
});
*/
```

The helpers below are available only while running an annotation or a closure
created by one, including GML helpers it calls. They are not game API functions.

| Helper | Result or effect |
| --- | --- |
| `preview_args(array)` | Supplies positional arguments to the selected entry function. |
| `preview_entry()` | Returns the selected UI factory function, so a shared fixture can select its matching source-defined tab. |
| `preview_instance(constructor, fields = {})` | Binds the constructor's inherited literal static methods to sample fields without executing its initialization body. Supplied fields/methods override source methods. |
| `preview_override(path, closure)` | Replaces calls at the exact path with a bounded GML closure. |
| `preview_init_script(symbol)` | Explicitly runs the indexed script's top-level initialization once per analysis. |
| `preview_include(path)` | Loads a project-relative GML fixture and runs its explicit setup blocks once; useful from a short `@preview init` tag. |
| `preview_sprite_layers(width, height, layers, origin_x = 0, origin_y = 0)` | Builds a static sprite from project sprite layers. Each layer has `sprite`, `x`, `y`, and optional `width`/`height` (native dimensions by default). |
| `preview_json(path)` | Reads a JSON file relative to the project root, returning fresh arrays/structs. |
| `preview_json_files(directory)` | Returns sorted project-relative paths of JSON files directly in that directory. It does not recurse. |
| `preview_locale()` | Returns the selected localization metadata, including `language`. |
| `preview_viewport()` | Returns `{x, y, width, height, scale}`; `x/width` and `y/height` contain the selected viewport dimensions. |
| `preview_text(key, fallback?)` / `preview_text_english(key, fallback?)` | Looks up text in the selected language or English. An explicit fallback replaces a missing key; otherwise the preview marks it. |
| `preview_text_format(key, name, value, ...)` | Looks up a text and substitutes named parameters. |
| `preview_text_format_from_struct(key, values)` | Substitutes parameters from a struct. |
| `preview_hint(key)` / `preview_hint_header(key)` | Looks up a hint body or header. |
| `preview_measure_text(text, text_style)` | Returns `{width, height}` using preview font measurement. |
| `preview_note(text)` | Adds an explicit source-linked Preview note. |

When a project already declares a small lookup table in a script's top-level
initialization, opt into that source instead of copying its values into a fixture:

```gml
/* @goowee-preview setup
preview_init_script("ui_icon_catalogue");
*/
```

The argument is an indexed project script symbol, not a filesystem path. Its
top-level GML runs at most once per analysis, even if requested again. This can
populate an existing sprite lookup table with the project's own frame indices.
It uses the same interpreter budgets and supported operations as other preview
code; it does not launch GameMaker or grant access to native side effects.
Reading a script to resolve a function still does not initialize it implicitly.

Use `preview_instance` when constructing a real game object would initialize the
world, but its ordinary methods can operate on a small sample state. The methods
are read from the indexed source, including unsaved editor changes. Constructor
bodies, field initializers and nonliteral static aliases are not executed; supply
their required state explicitly. Missing operations retain preview diagnostics.
For example, a shared fixture can use the original class's tab builder instead of
copying its icons, conditions and callbacks:

```gml
var model = preview_instance(ProfileModel, {__name: "Example", __is_adult: true});
var tabs = model.get_tabs();
var selected = preview_entry();
```

The interpreter can capture ordinary 2D sprite drawing into virtual surfaces.
Source `draw_sprite[_part][_ext]`, `draw_surface[_part][_ext]`, 2D world matrices
and `sprite_create_from_surface` preserve ordering, origins, crops, tint and alpha.
Captures use project images and in-memory surfaces; they do not invoke native or
GPU code. Surfaces are limited to 2048 pixels per axis, 8M active pixels and 256
draw calls each. Nested captures are capped at 4096 draw nodes and 16 levels.
Shaders, native texture storage and other unsupported APIs need
an explicit project-owned boundary adapter. The preview reports unsupported
operations rather than simulating the entire game renderer.

Project subclasses of `gw_SpriteImage` retain their inherited sprite settings,
instance fields and methods. Their `get_width`/`get_height` methods supply AUTO
dimensions. After layout, the preview samples an overridden `draw(layout, style)`
using the resolved image bounds and element style. Saved parent-method aliases
and ordinary 2D sprite calls preserve the source's rotation pivot, tint and alpha;
the renderer does not apply the element's sprite transforms a second time.
Draw commands use the same bounded capture interpreter and remain independent
for each image, even when several controls share one sprite source.

For example, project code can use `preview_json_files` and `preview_json` to
construct its own ordinary data objects from an existing catalogue. The plugin
does not know the catalogue's schema or the names of its getters. Alternatively,
small representative fixtures can avoid a costly initialization chain. Sample
prices, portraits, captions and progress are author-provided preview data; they
do not claim to represent a running game or a saved session.

Reads accept project-relative paths and reject absolute paths and parent
traversal. Only JSON files are exposed by these data helpers; the current limits
are 512K characters per JSON file, 8M characters per resource cache and 1,024 JSON
files per directory. Refresh reloads changed files. Annotation extraction allows
up to 256 directives and 256K characters of code per source; normal interpreter
budgets also apply. Failures and unsupported operations appear in Preview notes.

## What the preview interprets

The preview reads GooWee construction code; it does not run the GameMaker game.
It supports basic Canvas, Float, Container, StackPanel, WrapPanel, Image, Label
and Button layouts; size, margin, padding, alignment, orientation, aspect ratio
and visibility; absolute, relative and automatic units; static text, simple
arithmetic, local variables, enums, project functions and constructor methods.
Indexed helper names do not need a particular prefix. Custom visual widgets are
recognized through their constructor inheritance from GooWee primitives;
ordinary constructors remain data structs or builders. There is no registry of
game-specific card classes, menu names or data catalogues.
Plain builder objects with `.spawn()` methods (such as rough tab buttons) are
expanded without becoming phantom visual roots. Explicit `DataBind.update()`
calls sample their construction callback once; runtime arrays provide one labeled
example item. Click/hover/step handlers remain dormant.
GMEdit's indexed project macros and enums supply static constants. Entry wrappers
retain their arguments, so different wrappers can select different states of a
shared UI factory.
Both saved GML and the transformed, unsaved editor buffer are supported: typed
parameters/locals, `->Type` returns, nested generic/array/nullable/union types,
constructor base types, casts and GMEdit's parenthesized arrow functions. Arrow
callbacks keep their own scope and are only invoked by supported construction
operations. Each dropdown entry builds its own scene; Refresh keeps the selected
function if it still builds UI. Empty or invalid source shows an explanation
in the selector and preview instead of a blank selector or merged function bodies.
ABSV/AUTOV use the selected GUI scale and root-canvas render scale. Changing the
viewport does not change GUI scale. Sizes and placement follow GooWee's resize
and placement passes: AUTO measures child extents, and StackPanel REL sizes use
the space left after the other siblings. Custom `get_base_layout` callbacks are
interpreted when their rectangle can be computed from known layout values.

Scroll and DragScroll expose their viewport, content and scrollbar aliases.
Their contents remain attached to the window and are clipped to the initial
viewport for painting, Fit content, selection and hover. A separately rendered
canvas retains its parent layout and is not painted twice.

Layout comes from the project's construction code and GooWee's layout semantics.
Data comes from supported GML expressions and explicitly supplied preview
fixtures. The former menu-specific catalogue adapter has been removed. Add new
GML language/library capabilities to the interpreter when they are generally
useful; keep project schemas, service bindings and example states in project
annotations instead of adding a plugin branch for each interface.

Sprites come from the currently open project, through GMEdit's project API.
Their native dimensions, selected frame, tint, alpha, origin, scale, rotation,
horizontal flip and nine-slice borders are used. NineSlice respects each region's
Stretch, Repeat, Mirror, Blank Repeat or Hide mode. Repeats retain native tile
dimensions, scale with GUI × and `SpriteImage`'s `scale_9_slice`, and crop partial
tiles at the destination edge. Small destinations clip the corners. Edge strips
repeat along their length only, with source-neighbor gutters for filtering.
Shared cuts use one raster grid; the assembled sprite is transformed and blended
once to avoid seams at fractional scales. Cells are cached as canvas patterns,
so tiny tiles do not require millions of draw calls. Mode ordering and clipping follow the
[GameMaker renderer](https://github.com/YoYoGames/GameMaker-HTML5/blob/develop/scripts/yyNineSliceData.js).
No game-specific filesystem path is embedded in the plugin. GameMaker scripts,
sprites, fonts and translation files are read only; project localization
preferences use GMEdit's configuration file described above.
Controls without a background or sprite remain transparent, including Buttons
that contain an Image child. PNG alpha is preserved through tinting and sprite
opacity; placeholder fills are reserved for explicitly requested missing assets.

## Limits

This is a layout aid, not a pixel-identical GameMaker renderer:

- Project helpers are located through GMEdit's function index and read on demand.
  Missing/unindexed helpers, unsupported syntax and unresolved custom controls
  still produce partial results and notes. Only the active file uses its unsaved
  buffer; dependencies are read from their saved project files.
- Runtime data, unknown arguments, branches and loops are approximated and
  reported in Preview notes. Dynamic loops show one sample; static loops are
  capped at 64 visual items. Call, nesting and element budgets keep editing responsive.
- Rich-text tags, runtime hint expansion and text wrapping are not executed.
  Project font glyphs, metrics and standard native SDF effects are used, but
  antialiasing can differ from GameMaker. Arbitrary custom shaders, tweens,
  event handlers and gameplay are not run.
- A CanvasSurface drawn by a game callback
  shows a visible runtime placeholder in its correctly allocated rectangle.
  The genealogy itself requires live game state and is not fabricated.
- Scroll controls and complex widgets have approximate geometry. Rendering may
  differ when custom drawing changes the normal paint order.
- Missing assets retain placeholder bounds. Incomplete function headers pause
  the preview with a source diagnostic; other unsupported constructs may produce
  a partial scene while typing.

## Development

Run from the repository root:

```sh
npm run test:goowee
```

`node tests/goowee-preview-renderer.test.js` checks captured sprite-source
commands, transforms, bounds and export through a recording canvas in Node,
without opening application windows.

To additionally render the real project examples without modifying them:

```sh
node tests/run-goowee-preview-tests.js --project C:\path\to\Strategy
node tests/goowee-preview-project.test.js --project C:\path\to\Strategy
node tests/run-goowee-editor-tests.js --project C:\path\to\Strategy
node tests/run-goowee-renderer-tests.js --project C:\path\to\Strategy
node tests/run-goowee-font-tests.js --project C:\path\to\Strategy
node tests/goowee-preview-localization.test.js --project C:\path\to\Strategy
node tests/goowee-preview-annotations.test.js
```

The suite runs parser and annotation tests, source-derived layout assertions,
generic JSON resource tests, and a hidden Electron
integration test covering the real plugin DOM/canvas, docking, live edits,
source navigation and cleanup/reloading. A separate hidden Electron test compiles
a Haxe bridge to the production `KGmlScript.preproc` pipeline and tests its real
editor text through the plugin: typed declarations, arrow callbacks, entry
selection, Refresh and unsaved changes. With `--project`, it also checks the two
Family menus independently, switches Russian/English through the project
settings, and checks translated text measurement. It requires Haxe, just like
the GMEdit build. Localization tests also cover CSV parsing, fallback, caching,
directory selection, settings persistence and isolation between projects.
Renderer pixel tests cover all NineSlice modes, partial tiles, tint/alpha, GUI
scale, fractional cut coverage, edge filtering and a large panel with a 1px
repeating centre. With `--project`, they also check actual texture periodicity
in `ns_menu_background_dark` and save it alongside a tab comparison at several zoom levels.
Font tests verify atlas pixels and metrics, bitmap outlines, SDF scaling,
multiline alignment, tint/alpha, GUI scale, cache refresh and FontFace cleanup.
With `--project`, they additionally render the actual regular/bold/italic faces,
Cyrillic and a dynamic Japanese TTF, and save a font comparison image.
The normal GMEdit Haxe/Electron suite
also covers shared sidebar lifecycle and deferred resize after switching tabs.

`preview-engine.js` is also usable from Node:

```js
const { analyze } = require('./preview-engine');
const scene = analyze(source, {
  width: 1920, height: 1080, entry: 'create_menu',
  assets: { s_icon: { width: 64, height: 64 } },
  macros: { CARD_WIDTH: '244' }
});
```

The result contains `supported`, `entries`, selected `entry`, flat `nodes`,
hierarchical `roots`, `diagnostics`, `width`, `height` and `guiScale`. Nodes have absolute
pixel bounds, a 1-based source `line`, name/type, parent/children, text/sprite/
background/style and approximation/visibility flags. No `eval`, `Function`,
GameMaker runtime or game subprocess is used.
An image with a sampled sprite-source draw override also has `spriteDraws`:
an ordered list of captured draw commands in image-local coordinates. An empty
list means the override draws nothing; an absent list uses the ordinary sprite.
