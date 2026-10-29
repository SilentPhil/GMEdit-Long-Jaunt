package ace;

import js.html.Element;
import js.html.PreElement;

/**
 * Exposes rendered code as one text node instead of hundreds of syntax tokens.
 * Updating the token tree can otherwise stall Windows accessibility processing
 * in Electron's main process even when rendering itself is fast.
 */
class AceAccessibleText {
	public var element(default, null):PreElement;
	var source:Element;
	var previousHidden:String;
	var editor:AceWrap;
	var renderer:Dynamic;
	var afterRender:Void->Void;
	var onDestroy:Void->Void;

	public function new(editor:AceWrap) {
		this.editor = editor;
		renderer = editor.renderer;
		source = renderer.$textLayer.element;
		previousHidden = source.getAttribute("aria-hidden");
		element = Main.document.createPreElement();
		element.className = "ace_accessible-text";
		element.setAttribute("role", "document");
		element.setAttribute("aria-label", "Code");
		// Keep a readable, non-interactive copy without affecting editor geometry.
		// The actual textarea and controls remain outside the hidden text layer.
		element.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:0;"
			+ "overflow:hidden;clip-path:inset(50%);white-space:pre;pointer-events:none";
		editor.container.appendChild(element);
		source.setAttribute("aria-hidden", "true");
		afterRender = update;
		onDestroy = dispose;
		renderer.on("afterRender", afterRender);
		editor.on("destroy", onDestroy);
		update();
	}

	function update():Void {
		if (source == null) return;
		var lines = [for (line in source.children) line.textContent];
		var text = lines.join("\n");
		// Cursor blinking and marker updates do not change the accessible tree.
		if (element.textContent != text) element.textContent = text;
	}

	public function dispose():Void {
		if (renderer == null) return;
		renderer.off("afterRender", afterRender);
		editor.off("destroy", onDestroy);
		if (previousHidden == null) source.removeAttribute("aria-hidden");
		else source.setAttribute("aria-hidden", previousHidden);
		if (element.parentElement != null) element.parentElement.removeChild(element);
		source = null;
		renderer = null;
		editor = null;
		afterRender = null;
		onDestroy = null;
	}
}
