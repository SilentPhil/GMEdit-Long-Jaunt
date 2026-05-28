package ui;

import ace.AceWrap;
import ace.extern.AceRange;
import electron.Dialog;
import file.kind.gml.KGmlScript;
import gml.Project;
import gml.file.GmlFile;
import js.html.Console;
import parsers.GmlConstructorExtract;
import parsers.GmlReader;
import ui.treeview.TreeView;
import ui.treeview.TreeViewElement;
import ui.treeview.TreeViewItemMenus;

class RefactorExtractClass {
	public static function run(editor:AceWrap):Void {
		var project = Project.current;
		if (project == null || project.version.config.projectModeId != 2 || project.yyUsesGUID) {
			Dialog.showAlert("This refactoring is only available for GMS 2.3+ projects.");
			return;
		}
		
		var session = editor.session;
		var file:GmlFile = session.gmlFile;
		if (file == null || file.path == null || !Std.is(file.kind, KGmlScript)) {
			Dialog.showAlert("Open a GMS script file and place the cursor on the constructor name.");
			return;
		}
		
		var currentItem:TreeViewElement = cast TreeView.find(true, { path: file.path, kind: "script" });
		if (currentItem == null) {
			Dialog.showAlert("Could not find the current script resource in the project tree.");
			return;
		}
		
		var code = session.getValue();
		var cursor = editor.getCursorPosition();
		var cursorOffset = GmlConstructorExtract.offsetOfPos(code, cursor.row, cursor.column);
		var extract = GmlConstructorExtract.find(code, cursorOffset, project.version);
		if (extract == null) {
			Dialog.showAlert("Place the cursor on a constructor function name: function Name(...) constructor { ... }");
			return;
		}
		
		if (TreeView.find(true, { ident: extract.name }) != null) {
			Dialog.showAlert('A resource named `${extract.name}` already exists.');
			return;
		}
		if (project.existsSync('scripts/${extract.name}/${extract.name}.gml')
			|| project.existsSync('scripts/${extract.name}/${extract.name}.yy')
		) {
			Dialog.showAlert('Files for script resource `${extract.name}` already exist.');
			return;
		}
		
		var posReader = new GmlReader(code, project.version);
		var removeRange = AceRange.fromPair(
			posReader.getPos(extract.start),
			posReader.getPos(extract.removeEnd)
		);
		
		session.remove(removeRange);
		if (!file.save()) {
			session.setValue(code);
			Dialog.showError("Could not save the source script file.");
			return;
		}
		
		try {
			TreeViewItemMenus.updatePrefix(currentItem);
			var created = TreeViewItemMenus.createImplBoth("script", 1, currentItem, extract.name, function(args) {
				args.gmlCode = extract.text;
				args.openFile = true;
				return args;
			});
			
			if (created == null) {
				restoreSource(file, session, code);
			}
		} catch (x:Dynamic) {
			Console.error("Failed to extract constructor:", x);
			restoreSource(file, session, code);
			Dialog.showError("Could not create the new script resource:\n" + x);
		}
	}
	
	static function restoreSource(file:GmlFile, session:ace.extern.AceSession, code:String):Void {
		session.setValue(code);
		file.save();
	}
}
