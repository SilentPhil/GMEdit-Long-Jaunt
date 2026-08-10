package ui.preferences;
import electron.FileSystem;
import gml.GmlAPI;
import gml.GmlAPILoader;
import gml.GmlVersion;
import js.html.Element;
import ui.Preferences.*;

/** Preferences for selecting an alternative fnames file for each API version. */
class PrefFnames {
	public static function build(out:Element):Void {
		if (!FileSystem.canSync) return;

		out = addGroup(out, "API function names");
		out.id = "pref-api-fnames";
		addText(out,
			"Alternative sets are loaded from custom_fnames/<set name>/fnames inside each API directory."
		);

		for (version in GmlVersion.list) {
			final versionName = version.name;
			final customNames = GmlAPILoader.getCustomFnames(version.dir);
			final labels = ["Default"];
			for (name in customNames) {
				labels.push(name == "Default" ? "Default (custom)" : name);
			}

			var selectedIndex = customNames.indexOf(current.apiFnames[versionName]);
			selectedIndex = selectedIndex < 0 ? 0 : selectedIndex + 1;
			addDropdown(out, '${version.label} ($versionName)', labels[selectedIndex], labels, function(label) {
				var index = labels.indexOf(label);
				if (index <= 0) {
					current.apiFnames.remove(versionName);
				} else {
					current.apiFnames[versionName] = customNames[index - 1];
				}
				save();
				if (GmlAPI.version != null && GmlAPI.version.name == versionName) {
					GmlAPI.init();
				}
			});
		}
	}
}
