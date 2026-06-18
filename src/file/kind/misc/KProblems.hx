package file.kind.misc;

import editors.Editor;
import gml.Project;
import gml.file.GmlFile;
import gml.project.ProjectState.ProjectTabState;
import ui.ChromeTabs.ChromeTab;
import ui.Problems;

class KProblems extends KPreferencesBase {
	public static final inst = new KProblems();
	public static inline var tabStateKind = "problem-exclusions";
	
	override public function init(file:GmlFile, data:Dynamic):Void {
		file.editor = new KProblemsEditor(file, data);
	}
	
	override public function saveTabState(tab:ChromeTab):ProjectTabState {
		return { kind: tabStateKind, data: { top: tab.gmlFile.editor.element.scrollTop } };
	}
	
	public static function loadTabState(tabState:ProjectTabState):GmlFile {
		if (tabState.kind != tabStateKind) return null;
		var file = Problems.openExclusionsFile();
		if (file != null && tabState.data != null) file.editor.element.scrollTop = tabState.data.top;
		return file;
	}
}

private class KProblemsEditor extends Editor {
	public final project:Project;
	
	public function new(file:GmlFile, project:Project) {
		super(file);
		this.project = project;
		element = Main.document.createDivElement();
		Problems.buildExclusionsEditor(project, cast element);
	}
}
