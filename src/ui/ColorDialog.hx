package ui;

import electron.Electron;
import electron.Dialog;
import js.html.Element;
import js.html.InputElement;

/** Shared color editor for tab colors and code literals. Values are #RRGGBB. */
class ColorDialog {
	public static function writeClipboard(text:String):Void {
		if (Electron != null && Electron.clipboard != null) {
			Electron.clipboard.writeText(text);
		} else {
			var clipboard:Dynamic = (Main.window.navigator:Dynamic).clipboard;
			if (clipboard == null) Dialog.showWarning("Clipboard access is unavailable.");
			else clipboard.writeText(text);
		}
	}

	public static function readClipboard(receive:String->Void):Void {
		function validate(text:String):Void {
			text = text != null ? StringTools.trim(text) : "";
			if (!isValid(text)) {
				Dialog.showWarning("Clipboard does not contain a valid #RRGGBB color.");
				return;
			}
			receive(text);
		}
		if (Electron != null && Electron.clipboard != null) {
			validate(Electron.clipboard.readText());
		} else {
			var clipboard:Dynamic = (Main.window.navigator:Dynamic).clipboard;
			if (clipboard == null) Dialog.showWarning("Clipboard access is unavailable.");
			else clipboard.readText().then(validate, function(_) {
				Dialog.showWarning("Could not read the clipboard.");
			});
		}
	}

	static function isValid(value:String):Bool {
		return ~/^#[0-9a-fA-F]{6}$/.match(value);
	}

	public static function show(title:String, initial:String, apply:String->Void,
		?preview:String->Void, ?cancel:Void->Void):Void {
		var previousFocus:Element = cast Main.document.activeElement;
		var dialog = Main.document.createDivElement();
		dialog.className = "lw_modal color-dialog";
		var closed = false;
		var colorInput:InputElement = Main.document.createInputElement();
		var hexInput:InputElement = Main.document.createInputElement();
		function close(accept:Bool):Void {
			if (closed) return;
			if (accept && !hexInput.reportValidity()) return;
			closed = true;
			dialog.remove();
			if (previousFocus != null) previousFocus.focus();
			if (accept) apply(colorInput.value);
			else if (cancel != null) cancel();
		}
		var overlay = Main.document.createDivElement();
		overlay.className = "overlay";
		overlay.addEventListener("click", function(_) close(false));
		dialog.appendChild(overlay);
		var window = Main.document.createDivElement();
		window.className = "window";
		window.setAttribute("role", "dialog");
		window.setAttribute("aria-modal", "true");
		window.setAttribute("aria-label", title);
		dialog.appendChild(window);
		window.appendChild(Main.document.createTextNode(title));
		var fields = Main.document.createDivElement();
		fields.className = "color-fields";
		window.appendChild(fields);
		colorInput.type = "color";
		colorInput.value = initial;
		colorInput.setAttribute("aria-label", "Color");
		fields.appendChild(colorInput);
		hexInput.type = "text";
		hexInput.value = colorInput.value.toUpperCase();
		hexInput.required = true;
		hexInput.pattern = "#[0-9a-fA-F]{6}";
		hexInput.placeholder = "#RRGGBB";
		hexInput.setAttribute("aria-label", "HEX color");
		hexInput.title = "HEX color (#RRGGBB)";
		hexInput.spellcheck = false;
		fields.appendChild(hexInput);
		function changed():Void {
			if (preview != null) preview(colorInput.value);
		}
		colorInput.addEventListener("input", function(_) {
			hexInput.value = colorInput.value.toUpperCase();
			changed();
		});
		hexInput.addEventListener("input", function(_) {
			if (!isValid(hexInput.value)) return;
			colorInput.value = hexInput.value;
			changed();
		});
		var buttons = Main.document.createDivElement();
		buttons.className = "buttons";
		window.appendChild(buttons);
		function addButton(label:String, click:Void->Void):Void {
			if (buttons.childNodes.length > 0) buttons.appendChild(Main.document.createTextNode(" "));
			var button = Main.document.createInputElement();
			button.type = "button";
			button.value = label;
			button.addEventListener("click", function(_) click());
			buttons.appendChild(button);
		}
		addButton("Copy", function() {
			if (hexInput.reportValidity()) writeClipboard(colorInput.value.toUpperCase());
		});
		addButton("Paste", function() readClipboard(function(value) {
			if (closed) return;
			colorInput.value = value;
			hexInput.value = value.toUpperCase();
			changed();
		}));
		addButton("Apply", function() close(true));
		addButton("Cancel", function() close(false));
		dialog.addEventListener("keydown", function(event:js.html.KeyboardEvent) {
			event.stopPropagation();
			if (event.key == "Escape") {
				event.preventDefault();
				close(false);
			} else if (event.key == "Enter" && event.target == hexInput) {
				event.preventDefault();
				close(true);
			} else if (event.key == "Tab") {
				var first = colorInput;
				var last:InputElement = cast buttons.lastChild;
				if (event.shiftKey && event.target == first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && event.target == last) {
					event.preventDefault();
					first.focus();
				}
			}
		});
		Main.document.body.appendChild(dialog);
		colorInput.focus();
	}
}
