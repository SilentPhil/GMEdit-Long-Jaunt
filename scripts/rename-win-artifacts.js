const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "bin", "resources", "app");
const distDir = path.join(appDir, "dist");
const unpackedDir = path.join(distDir, "win-unpacked");
const buildDateFile = path.join(rootDir, "bin", "buildnumber.txt");
const appPackage = require(path.join(appDir, "package.json"));

function wait(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function moveDirectory(sourceDir, targetDir) {
	let lastError = null;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			fs.renameSync(sourceDir, targetDir);
			return;
		} catch (error) {
			lastError = error;
			if (error.code != "EPERM" && error.code != "EACCES") throw error;
			wait(250);
		}
	}

	fs.rmSync(targetDir, { recursive: true, force: true });
	fs.cpSync(sourceDir, targetDir, { recursive: true });
	fs.rmSync(sourceDir, { recursive: true, force: true });
	if (fs.existsSync(sourceDir)) throw lastError;
}

function moveFile(sourceFile, targetFile) {
	let lastError = null;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			fs.renameSync(sourceFile, targetFile);
			return;
		} catch (error) {
			lastError = error;
			if (error.code != "EPERM" && error.code != "EACCES") throw error;
			wait(250);
		}
	}

	fs.copyFileSync(sourceFile, targetFile);
	fs.rmSync(sourceFile, { force: true });
	if (fs.existsSync(sourceFile)) throw lastError;
}

function pad2(value) {
	return value.toString().padStart(2, "0");
}

if (!fs.existsSync(buildDateFile)) {
	throw new Error("Missing bin/buildnumber.txt; run npm run compile before packaging.");
}

const buildDate = fs.readFileSync(buildDateFile, "utf8").trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(buildDate)) {
	throw new Error(`Unexpected build date in bin/buildnumber.txt: ${buildDate}`);
}

const now = new Date();
const buildTime = `${pad2(now.getHours())}-${pad2(now.getMinutes())}`;
const outputName = `GMEdit-${buildDate}-${buildTime}`;
const outputDir = path.join(distDir, outputName);
const outputZip = path.join(distDir, `${outputName}.zip`);
const generatedZip = path.join(distDir, `GMEdit-${appPackage.version}-win.zip`);

if (!fs.existsSync(unpackedDir)) {
	throw new Error(`Expected electron-builder output at ${unpackedDir}`);
}

if (!fs.existsSync(generatedZip)) {
	throw new Error(`Expected electron-builder archive at ${generatedZip}`);
}

if (fs.existsSync(outputDir)) {
	const relativeOutput = path.relative(distDir, outputDir);
	const isInsideDist = relativeOutput != "" && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput);
	if (!isInsideDist || !/^GMEdit-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(path.basename(outputDir))) {
		throw new Error(`Refusing to replace unexpected output directory: ${outputDir}`);
	}
	fs.rmSync(outputDir, { recursive: true, force: true });
}

if (fs.existsSync(outputZip)) {
	const relativeOutput = path.relative(distDir, outputZip);
	const isInsideDist = relativeOutput != "" && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput);
	if (!isInsideDist || !/^GMEdit-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/.test(path.basename(outputZip))) {
		throw new Error(`Refusing to replace unexpected output archive: ${outputZip}`);
	}
	fs.rmSync(outputZip, { force: true });
}

moveDirectory(unpackedDir, outputDir);
moveFile(generatedZip, outputZip);
console.log(`Packaged Windows folder: ${outputDir}`);
console.log(`Packaged Windows archive: ${outputZip}`);
