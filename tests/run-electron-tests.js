const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const resultPath = path.join(root, "tests", "electron-test-result.txt");
const serverDir = path.join(root, "tests", "unittest_node");
const runnerDir = path.join(root, "tests", "electron-runner");

function withNekoPath(env) {
	const next = { ...env };
	const nekoPath = "C:\\HaxeToolkit\\neko";
	if (isWin && fs.existsSync(nekoPath)) {
		const pathValue = [next.Path || next.PATH || "", nekoPath].filter(Boolean).join(";");
		next.Path = pathValue;
		next.PATH = pathValue;
	}
	return next;
}

function command(name) {
	return isWin ? `${name}.cmd` : name;
}

function run(cmd, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			cwd: root,
			env: withNekoPath(process.env),
			stdio: "inherit",
			...options
		});
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
			}
		});
		child.on("error", reject);
	});
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 15000) {
	const started = Date.now();
	return new Promise((resolve, reject) => {
		function tryConnect() {
			const socket = new net.Socket();
			socket.setTimeout(500);
			socket.once("connect", () => {
				socket.destroy();
				resolve();
			});
			socket.once("timeout", () => {
				socket.destroy();
				retry();
			});
			socket.once("error", retry);
			socket.connect(port, host);
		}
		function retry() {
			if (Date.now() - started > timeoutMs) {
				reject(new Error(`Server did not open ${host}:${port}`));
			} else {
				setTimeout(tryConnect, 250);
			}
		}
		tryConnect();
	});
}

function findElectron() {
	const exe = path.join(root, "bin", "resources", "app", "node_modules", "electron", "dist", isWin ? "electron.exe" : "electron");
	if (fs.existsSync(exe)) return exe;
	const bin = path.join(root, "bin", "resources", "app", "node_modules", ".bin", isWin ? "electron.cmd" : "electron");
	if (fs.existsSync(bin)) return bin;
	throw new Error("Electron is not installed in bin/resources/app/node_modules");
}

async function main() {
	console.log("Building test bundle...");
	await run("haxe", ["tests/test.hxml"]);

	if (!fs.existsSync(path.join(serverDir, "node_modules", "express"))) {
		throw new Error("Missing tests/unittest_node/node_modules. Run `npm.cmd install` in tests/unittest_node.");
	}

	if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

	console.log("Starting test web server...");
	const server = spawn(process.execPath, ["index.js"], {
		cwd: serverDir,
		stdio: ["ignore", "pipe", "pipe"]
	});
	server.stdout.on("data", (data) => process.stdout.write(data));
	server.stderr.on("data", (data) => process.stderr.write(data));

	try {
		await waitForPort(3000);
		console.log("Running tests in Electron...");
		const env = withNekoPath(process.env);
		delete env.ELECTRON_RUN_AS_NODE;
		env.MUNIT_TEST_URL = "http://127.0.0.1:3000/js.html";

		const electron = spawn(findElectron(), [runnerDir], {
			cwd: root,
			env,
			stdio: "inherit"
		});
		const code = await new Promise((resolve, reject) => {
			electron.on("exit", resolve);
			electron.on("error", reject);
		});

		if (fs.existsSync(resultPath)) {
			const result = fs.readFileSync(resultPath, "utf8");
			const important = result
				.split(/\r?\n/)
				.filter((line) => /^(TEST_|WINDOW_ERROR|UNHANDLED_REJECTION|BODY_TEXT_BEGIN|FAILED|Tests:|Failure:|Error:)/.test(line))
				.join("\n");
			console.log("\n--- electron-test-result summary ---");
			console.log(important || result.trim());
			console.log("--- full log: tests/electron-test-result.txt ---");
		}

		process.exitCode = code == null ? 1 : code;
	} finally {
		server.kill();
	}
}

main().catch((error) => {
	console.error(error.message || error);
	process.exitCode = 1;
});
