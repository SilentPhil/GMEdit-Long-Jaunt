const { ipcRenderer } = require("electron");

window.testResult = function(successful) {
	try {
		ipcRenderer.send("test-log", "BODY_TEXT_BEGIN\n" + document.body.innerText + "\nBODY_TEXT_END");
		ipcRenderer.send("test-log", "BODY_HTML_BEGIN\n" + document.body.innerHTML + "\nBODY_HTML_END");
	} catch (e) {
		ipcRenderer.send("test-log", "BODY_TEXT_ERROR | " + e);
	}
	ipcRenderer.send("test-result", !!successful);
};

window.addEventListener("error", function(event) {
	ipcRenderer.send("test-log", [
		"WINDOW_ERROR",
		event.message,
		event.filename,
		event.lineno,
		event.colno,
		event.error && event.error.stack
	].join(" | "));
});

window.addEventListener("unhandledrejection", function(event) {
	ipcRenderer.send("test-log", "UNHANDLED_REJECTION | " + event.reason);
});
