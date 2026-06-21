package ui.preferences;

import js.html.Element;
import ui.Preferences.*;
import ui.preferences.PrefData.PrefProblemsScanMode;
import ui.preferences.PrefData.PrefProblemsScanScope;

class PrefProblems {
	static final scanModeLabels = [
		"On project open",
		"When Problems window is shown",
		"Disabled",
	];
	static final scanScopeLabels = ["Whole project", "All open tabs", "Current file only"];

	public static function build(out:Element):Void {
		var group = addGroup(out, "Problems Window");
		addRadios(group, "Automatic scanning", scanModeLabels[current.problemsScanMode], scanModeLabels, function(label) {
			current.problemsScanMode = scanModeLabels.indexOf(label);
			save();
		});
		addRadios(group, "Automatic scanning scope", scanScopeLabels[current.problemsScanScope], scanScopeLabels, function(label) {
			current.problemsScanScope = scanScopeLabels.indexOf(label);
			save();
		});
		addCheckbox(group, "Start with Problems window expanded", current.problemsStartExpanded, function(value) {
			current.problemsStartExpanded = value;
			save();
		});
		addCheckbox(group, "Show current file only by default", current.problemsShowCurrentFileOnly, function(value) {
			current.problemsShowCurrentFileOnly = value;
			save();
		});
		addCheckbox(group, "Refresh current file only", current.problemsRefreshCurrentFileOnly, function(value) {
			current.problemsRefreshCurrentFileOnly = value;
			save();
		});
		addCheckbox(group, "First refresh always scans the whole project", current.problemsFirstRefreshFullProject, function(value) {
			current.problemsFirstRefreshFullProject = value;
			save();
		});
		addCheckbox(group, "Refresh problems when switching tabs", current.problemsRefreshOnTabChange, function(value) {
			current.problemsRefreshOnTabChange = value;
			save();
		});
	}
}
