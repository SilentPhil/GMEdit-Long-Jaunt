package ui;
import ace.AceWrap;
import ace.extern.AcePos;
import ace.extern.AceRange;
import ace.extern.AceToken;
import js.lib.RegExp;

/** Edits a color literal in its original session, independent of selection. */
class ColorPicker {
	public static var rxGml:RegExp;

	public static function open(value:String) {
		var editor = Main.aceEditor;
		var pos = editor.getCursorPosition();
		var token = editor.session.getTokenAtPos(pos);
		if (token != null && token.value == value) openToken(editor, pos, token);
	}

	public static function openToken(editor:AceWrap, pos:AcePos, token:AceToken):Void {
		var value = token.value;
		var vals = rxGml.exec(value);
		if (vals == null || editor.getOption("readOnly") == true) return;
		var isBGR = vals[1] != "#";
		var initial = "#" + (isBGR ? vals[4] + vals[3] + vals[2] : vals[2] + vals[3] + vals[4]);
		var session = editor.session;
		var start = session.doc.createAnchor(pos.row, token.start);
		var end = session.doc.createAnchor(pos.row, token.start + value.length);
		function detach():Void {
			start.detach();
			end.detach();
		}
		ColorDialog.show("Change color", initial, function(color) {
			var range = AceRange.fromPair(start.getPosition(), end.getPosition());
			detach();
			if (editor.getOption("readOnly") == true) return;
			if (session.getTextRange(range) != value) return;
			// Keeping an unchanged literal also preserves its original letter case.
			if (color.toLowerCase() == initial.toLowerCase()) return;
			var hex = color.substring(1).toUpperCase();
			var next = vals[1] + (isBGR ? hex.substr(4, 2) + hex.substr(2, 2) + hex.substr(0, 2) : hex);
			session.doc.replace(range, next);
		}, null, detach);
	}

	public static function init() {
		var hp = "([0-9a-fA-F]{2})";
		rxGml = new RegExp("^(0x|\\$|#)" + hp + hp + hp + "$", "");
	}
}
