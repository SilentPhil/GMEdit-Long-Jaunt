const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const resultPath = path.join(__dirname, "..", "electron-test-result.txt");
function log(line) {
	fs.appendFileSync(resultPath, line + "\n");
}

app.whenReady().then(() => {
	fs.writeFileSync(resultPath, "START\n");
	const win = new BrowserWindow({
		show: false,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: false,
			preload: path.join(__dirname, "preload.js")
		}
	});

	const timeout = setTimeout(() => {
		log("TEST_TIMEOUT");
		app.exit(2);
	}, 60000);

	ipcMain.once("test-result", (_event, successful) => {
		clearTimeout(timeout);
		log(successful ? "TEST_PASS" : "TEST_FAIL");
		app.exit(successful ? 0 : 1);
	});
	ipcMain.on("test-log", (_event, line) => {
		log(line);
	});

	win.webContents.on("console-message", (_event, _level, message) => {
		if (/^(Uncaught|Error|Failure|Failed|Tests:)/.test(message)) {
			log("PAGE_CONSOLE: " + message);
		}
	});
	win.webContents.on("did-fail-load", (_event, _code, desc) => {
		log("PAGE_LOAD_FAILED: " + desc);
	});
	win.webContents.on("render-process-gone", (_event, details) => {
		log("RENDER_PROCESS_GONE: " + details.reason);
		app.exit(3);
	});

	win.loadURL(process.env.MUNIT_TEST_URL || "http://127.0.0.1:3000/js.html");
});
