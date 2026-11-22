import ace.AceCtxMenu;
import ace.AceWrap;
import electron.MenuFallback;
import ui.ColorPicker;
import ui.ChromeTabMenu;

/** Exercise production dialogs and menu handlers with real Ace sessions. */
@:expose("ColorPickerTestBridge")
class ColorPickerTestBridge {
	static function main() {}
	public static function init(editor:AceWrap):Void {
		plugins.PluginAPI.signal = function(_, _) {};
		untyped Main.window.Electron_Menu = MenuFallback;
		untyped Main.window.Electron_MenuItem = electron.MenuFallback.MenuItemFallback;
		Main.aceEditor = editor;
		ui.Preferences.current = ui.preferences.PrefData.defValue();
		ColorPicker.init();
		new AceCtxMenu().bind(editor);
		ChromeTabMenu.init();
	}
	public static function bind(editor:AceWrap):Void {
		new AceCtxMenu().bind(editor);
	}
	public static function tabColor(tab:Dynamic):Void {
		ChromeTabMenu.target = cast tab;
		for (item in ChromeTabMenu.menu.items) if (item.label == "Set tab color...") item.click();
	}
}
