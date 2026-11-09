import editors.EditCode;
import file.kind.KGml;
import file.kind.gml.KGmlScript;
import gml.GmlAPI;
import gml.GmlVersion;
import gml.Project;
import ui.Preferences;
import ui.preferences.PrefData;
import synext.GmlExtMFunc;

/** Test bridge: use the production editor preprocessing chain, never a regex
    approximation of the text shown in Ace. Does not open or save a project. */
@:expose("GooWeeEditorPreprocess")
class EditorPreprocess {
    public static function main() {}

    public static function init(config:Dynamic):Void {
        Preferences.current = PrefData.defValue();
        Preferences.current.importMagic = true;
        Preferences.current.arrowFunctions = true;
        Preferences.current.mfuncMagic = true;
        var version = new GmlVersion("v23", "api/v23", false);
        version.config = config.apiConfig;
        // Avoid loading the application's UI and user configuration.
        Reflect.setField(GmlAPI, "version", version);
        @:privateAccess Project.current = cast {
            dir: config.projectPath,
            version: version,
            properties: {autoArrowFunctions: false},
            relPath: function(_:String):String { return null; }
        };
        var names:Array<String> = config.symbols;
        for (name in names) GmlAPI.gmlKind[name] = "script";
        if (config.macroFunctions != null) {
            for (name in Reflect.fields(config.macroFunctions)) {
                GmlAPI.gmlMFuncs[name] = new GmlExtMFunc(name, cast Reflect.field(config.macroFunctions, name));
            }
        }
        KGml.initSyntaxExtensions();
    }

    public static function process(source:String, sourcePath:String):String {
        var editor:EditCode = cast {
            file: {path: sourcePath, name: haxe.io.Path.withoutDirectory(sourcePath)},
            kind: KGmlScript.inst
        };
        return KGmlScript.inst.preproc(editor, source);
    }
}
