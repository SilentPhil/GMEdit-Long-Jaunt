package ui.preferences;
import electron.FileSystem;
import gml.GmlAPILoader;
import gml.GmlVersion;
import js.html.Element;
import ui.Preferences.*;

/** Preferences for selecting an alternative fnames file for each API version. */
class PrefFnames {
	static inline var runtimeLabel = "Find in selected runtime";
	static var optionsElement:Element;
	public static function build(out:Element):Void {
		if (!FileSystem.canSync) return;

		out = addGroup(out, "API function names");
		out.id = "pref-api-fnames";
		addText(out,
			"Alternative sets are loaded from custom_fnames/<set name>/fnames inside each API directory."
		);
		var options = optionsElement = Main.document.createDivElement();
		options.id = "pref-api-fnames-options";
		out.appendChild(options);
		buildOptions(options);
	}
	public static function refresh():Void {
		// Preferences may be detached while another tab or settings page is open.
		var options = optionsElement;
		if (options == null) return;
		options.textContent = "";
		buildOptions(options);
	}
	static function buildOptions(out:Element):Void {

		for (version in GmlVersion.list) {
			final versionName = version.name;
			final customNames = GmlAPILoader.getCustomFnames(version.dir);
			final labels = ["Default"];
			final values:Array<String> = [null];
			for (name in customNames) {
				labels.push(name == "Default" || name == runtimeLabel ? name + " (custom)" : name);
				values.push(name);
			}
			final runtimeIndex = GmlAPILoader.hasRuntimeFnames(versionName) ? labels.length : -1;
			if (runtimeIndex >= 0) labels.push(runtimeLabel);

			var selectedIndex = values.indexOf(current.apiFnames[versionName]);
			if (GmlAPILoader.usesRuntimeFnames(versionName)) selectedIndex = runtimeIndex;
			if (selectedIndex < 0) selectedIndex = 0;
			addDropdown(out, '${version.label} ($versionName)', labels[selectedIndex], labels, function(label) {
				var index = labels.indexOf(label);
				if (current.apiFnamesRuntime == null) current.apiFnamesRuntime = {};
				if (index == runtimeIndex) {
					current.apiFnamesRuntime[versionName] = true;
					current.apiFnames.remove(versionName);
				} else {
					current.apiFnamesRuntime.remove(versionName);
					if (index <= 0) current.apiFnames.remove(versionName);
					else current.apiFnames[versionName] = values[index];
				}
				save();
				if (gml.GmlAPI.version != null && gml.GmlAPI.version.name == versionName) {
					GmlAPILoader.reloadFnames();
				}
				refresh();
			});
			if (GmlAPILoader.usesRuntimeFnames(versionName)) {
				var path = GmlAPILoader.getRuntimeFnamesPath(versionName);
				addText(out, path != null ? "Runtime fnames: " + path
					: "Runtime fnames unavailable. Using Default. Select an installed runtime in Constructor's Project Properties.");
			}
		}
	}
}
