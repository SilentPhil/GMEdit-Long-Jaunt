import gml.GmlAPI;
import gml.GmlAPILoader;
import gml.GmlVersion;
import gml.GmlVersionConfig.GmlVersionConfigDefaults;
import ui.Preferences;
import ui.preferences.PrefData;
import ui.preferences.PrefFnames;

@:expose("FnamesTestBridge")
class FnamesTestBridge {
	static function main() {}
	public static function init(dir:String, userPath:String):Dynamic {
		Preferences.current = PrefData.defValue();
		electron.FileWrap.userPath = userPath;
		var modern = new GmlVersion("v23", dir, false);
		modern.config = GmlVersionConfigDefaults.get(true);
		modern.config.apiFiles = ["default"];
		modern.label = "GameMaker Studio 2.3+";
		var legacy = new GmlVersion("v1", dir, false);
		legacy.config = GmlVersionConfigDefaults.get(false);
		legacy.config.apiFiles = ["default"];
		legacy.label = "GameMaker: Studio";
		GmlVersion.list = [legacy, modern];
		Reflect.setField(GmlAPI, "version", modern);
		GmlAPI.init();
		PrefFnames.build(Main.document.body);
		return {loader: GmlAPILoader, prefs: Preferences.current, version: modern};
	}
	public static function hasFunction(name:String):Bool {
		return GmlAPI.stdKind.exists(name);
	}
	public static function loadRaw(dir:String, versionName:String):String {
		var ctx = {conf: GmlAPI.version.config, dir: dir, versionName: versionName, raw: ""};
		GmlAPILoader.loadPre(ctx);
		return ctx.raw;
	}
	public static function useRealAPI(dir:String):Void {
		var version = GmlAPI.version;
		version.dir = dir;
		var config:Dynamic = electron.FileSystem.readJsonFileSync(dir + "/config.json");
		for (key in Reflect.fields(config)) Reflect.setField(version.config, key, Reflect.field(config, key));
		GmlAPILoader.reloadFnames();
	}
}
